use crate::error::AppError;
use serde::Serialize;
use std::fs;
use std::process::Command;
use tempfile::{Builder as TempDirBuilder, TempDir};
use url::Url;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionFetchResult {
    pub content: String,
    pub status: u16,
    pub bytes: u64,
    pub content_type: Option<String>,
    pub traffic_header: Option<String>,
    pub profile: String,
    pub profile_label: String,
}

struct RequestProfile {
    id: &'static str,
    label: &'static str,
    user_agent: &'static str,
    accept: &'static str,
}

const PROFILES: &[RequestProfile] = &[
    RequestProfile {
        id: "mihomo",
        label: "Mihomo",
        user_agent: "Mihomo/1.19.0",
        accept: "text/yaml, application/yaml, application/x-yaml, text/plain, */*",
    },
    RequestProfile {
        id: "clash-meta",
        label: "Clash.Meta",
        user_agent: "Clash.Meta/1.18.0",
        accept: "text/yaml, application/yaml, application/x-yaml, text/plain, */*",
    },
    RequestProfile {
        id: "clash-verge",
        label: "Clash Verge",
        user_agent: "clash-verge/v2.0.0",
        accept: "text/yaml, application/yaml, application/x-yaml, text/plain, */*",
    },
    RequestProfile {
        id: "cfw",
        label: "Clash for Windows",
        user_agent: "ClashforWindows/0.20.39",
        accept: "text/yaml, application/yaml, application/x-yaml, text/plain, */*",
    },
    RequestProfile {
        id: "browser",
        label: "Browser",
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        accept: "text/yaml, application/yaml, application/x-yaml, text/plain, */*",
    },
    RequestProfile {
        id: "curl",
        label: "curl",
        user_agent: "curl/8.0.0",
        accept: "*/*",
    },
];

#[tauri::command]
pub fn fetch_subscription_url(
    url: String,
    timeout_ms: Option<u64>,
    profile: Option<String>,
) -> Result<SubscriptionFetchResult, AppError> {
    let url = validate_native_subscription_url(&url)?;
    let profile = profile
        .as_deref()
        .and_then(find_profile)
        .ok_or_else(|| AppError::Network("未知订阅测试方式。".to_string()))?;
    let timeout_secs = timeout_ms
        .unwrap_or(20_000)
        .clamp(3_000, 60_000)
        .div_ceil(1000);
    run_curl_profile(&url, profile, timeout_secs)
}

fn validate_native_subscription_url(url: &str) -> Result<String, AppError> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(AppError::Network("订阅 URL 不能为空。".to_string()));
    }

    if trimmed
        .chars()
        .any(|value| value.is_ascii_control() || value.is_ascii_whitespace())
    {
        return Err(AppError::Network(
            "订阅 URL 不能包含空白或控制字符。".to_string(),
        ));
    }

    let parsed =
        Url::parse(trimmed).map_err(|_| AppError::Network("订阅 URL 格式不正确。".to_string()))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(AppError::Network(
            "订阅 URL 只允许 http 或 https。".to_string(),
        ));
    }

    if parsed.host_str().filter(|host| !host.is_empty()).is_none() {
        return Err(AppError::Network("订阅 URL 缺少主机名。".to_string()));
    }

    Ok(parsed.to_string())
}

fn find_profile(id: &str) -> Option<&'static RequestProfile> {
    PROFILES.iter().find(|profile| profile.id == id)
}

fn run_curl_profile(
    url: &str,
    profile: &RequestProfile,
    timeout_secs: u64,
) -> Result<SubscriptionFetchResult, AppError> {
    let request_dir = create_request_temp_dir(profile.id)?;
    let header_path = request_dir.path().join("response.headers");
    let body_path = request_dir.path().join("response.body");
    let output = match Command::new("curl.exe")
        .arg("--location")
        .arg("--silent")
        .arg("--show-error")
        .arg("--compressed")
        .arg("--max-time")
        .arg(timeout_secs.to_string())
        .arg("--connect-timeout")
        .arg(timeout_secs.min(15).to_string())
        .arg("--dump-header")
        .arg(&header_path)
        .arg("--output")
        .arg(&body_path)
        .arg("--write-out")
        .arg("status=%{http_code}\ncontent_type=%{content_type}\nsize_download=%{size_download}\n")
        .arg("--user-agent")
        .arg(profile.user_agent)
        .arg("--header")
        .arg(format!("Accept: {}", profile.accept))
        .arg("--header")
        .arg("Cache-Control: no-cache")
        .arg(url)
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            cleanup_temp_dir(request_dir);
            return Err(AppError::Network(format!("无法调用本地 curl.exe：{error}")));
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        cleanup_temp_dir(request_dir);
        return Err(AppError::Network(format!(
            "{} 请求失败：{}",
            profile.label,
            clean_network_error(&stderr, url)
        )));
    }

    let status = match parse_status(&stdout) {
        Ok(status) => status,
        Err(error) => {
            cleanup_temp_dir(request_dir);
            return Err(error);
        }
    };
    if !(200..300).contains(&status) {
        cleanup_temp_dir(request_dir);
        return Err(AppError::Network(format!(
            "{} 请求失败：HTTP {}",
            profile.label, status
        )));
    }

    let content = match fs::read_to_string(&body_path) {
        Ok(content) => content,
        Err(error) => {
            cleanup_temp_dir(request_dir);
            return Err(AppError::Network(format!("读取订阅响应失败：{error}")));
        }
    };
    let bytes = fs::metadata(&body_path)
        .map(|metadata| metadata.len())
        .unwrap_or(content.len() as u64);
    let headers = fs::read_to_string(&header_path).unwrap_or_default();
    let content_type = parse_meta_value(&stdout, "content_type").filter(|value| !value.is_empty());
    let traffic_header = parse_last_header(&headers, "subscription-userinfo");
    cleanup_temp_dir(request_dir);

    Ok(SubscriptionFetchResult {
        content,
        status,
        bytes,
        content_type,
        traffic_header,
        profile: profile.id.to_string(),
        profile_label: profile.label.to_string(),
    })
}

fn create_request_temp_dir(profile_id: &str) -> Result<TempDir, AppError> {
    TempDirBuilder::new()
        .prefix(&format!(
            "yaml-proxy-subscription-{}-{profile_id}-",
            std::process::id()
        ))
        .tempdir()
        .map_err(|error| AppError::Network(format!("创建订阅临时目录失败：{error}")))
}

fn parse_status(stdout: &str) -> Result<u16, AppError> {
    let value = parse_meta_value(stdout, "status")
        .ok_or_else(|| AppError::Network("订阅响应缺少 HTTP 状态。".to_string()))?;
    value
        .parse::<u16>()
        .map_err(|_| AppError::Network("订阅响应 HTTP 状态不可读。".to_string()))
}

fn parse_meta_value(stdout: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}=");
    stdout.lines().find_map(|line| {
        line.strip_prefix(&prefix)
            .map(|value| value.trim().to_string())
    })
}

fn parse_last_header(headers: &str, key: &str) -> Option<String> {
    let prefix = format!("{}:", key.to_ascii_lowercase());
    headers.lines().rev().find_map(|line| {
        let trimmed = line.trim();
        trimmed
            .to_ascii_lowercase()
            .strip_prefix(&prefix)
            .map(|_| trimmed[prefix.len()..].trim().to_string())
    })
}

fn cleanup_temp_dir(request_dir: TempDir) {
    let _ = request_dir.close();
}

fn clean_network_error(message: &str, request_url: &str) -> String {
    if message.is_empty() {
        return "未知网络错误".to_string();
    }
    let first_line = message.lines().next().unwrap_or("未知网络错误");
    redact_native_url_in_message(first_line, request_url)
}

fn redact_native_url_in_message(message: &str, request_url: &str) -> String {
    let parsed = match Url::parse(request_url) {
        Ok(parsed) => parsed,
        Err(_) => return message.to_string(),
    };
    let mut sanitized = message.replace(request_url, &redact_native_subscription_url(&parsed));

    if let Some(query) = parsed.query() {
        sanitized = sanitized.replace(&format!("?{query}"), "?<redacted>");
    }
    if parsed.path() != "/" {
        sanitized = sanitized.replace(parsed.path(), "/...");
    }
    if !parsed.username().is_empty() {
        if let Some(password) = parsed.password() {
            sanitized = sanitized.replace(
                &format!("{}:{}@", parsed.username(), password),
                "<redacted>@",
            );
        }
        sanitized = sanitized.replace(&format!("{}@", parsed.username()), "<redacted>@");
    }

    sanitized
}

fn redact_native_subscription_url(url: &Url) -> String {
    let host = url
        .host()
        .map(|host| host.to_string())
        .unwrap_or_else(|| "unknown-host".to_string());
    let mut redacted = match url.port() {
        Some(port) => format!("{}://{}:{}/...", url.scheme(), host, port),
        None => format!("{}://{}/...", url.scheme(), host),
    };

    let mut keys: Vec<_> = url.query_pairs().map(|(key, _)| key.to_string()).collect();
    keys.sort();
    keys.dedup();
    if !keys.is_empty() {
        redacted.push('?');
        redacted.push_str(
            &keys
                .into_iter()
                .map(|key| format!("{key}=<redacted>"))
                .collect::<Vec<_>>()
                .join("&"),
        );
    }

    redacted
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn validates_native_subscription_urls_like_frontend_boundary() {
        assert_eq!(
            validate_native_subscription_url(" https://user:pass@example.com/sub?token=secret ")
                .unwrap(),
            "https://user:pass@example.com/sub?token=secret"
        );
        assert_eq!(
            validate_native_subscription_url("http://[::1]:9090/sub").unwrap(),
            "http://[::1]:9090/sub"
        );
        assert_eq!(
            validate_native_subscription_url("https:///missing-host").unwrap(),
            "https://missing-host/"
        );

        assert!(validate_native_subscription_url("").is_err());
        assert!(validate_native_subscription_url("file:///C:/secret.yaml").is_err());
        assert!(validate_native_subscription_url("https://:443/path").is_err());
        assert!(validate_native_subscription_url("https://example.com:bad/path").is_err());
        assert!(validate_native_subscription_url("https://example.com:70000/path").is_err());
        assert!(validate_native_subscription_url("https://example.com\r\n--output C:\\x").is_err());
        assert!(validate_native_subscription_url("https://exa mple.com/sub").is_err());
    }

    #[test]
    fn creates_unique_native_fetch_temp_dirs() {
        let dirs = [
            create_request_temp_dir("mihomo").unwrap(),
            create_request_temp_dir("mihomo").unwrap(),
            create_request_temp_dir("browser").unwrap(),
        ];
        let paths: Vec<_> = dirs.iter().map(|dir| dir.path().to_path_buf()).collect();
        let unique: HashSet<_> = paths.iter().collect();

        assert_eq!(unique.len(), dirs.len());
        for dir in dirs {
            let path = dir.path().to_path_buf();
            assert!(path.exists());
            cleanup_temp_dir(dir);
            assert!(!path.exists());
        }
    }

    #[test]
    fn parses_last_subscription_userinfo_header_case_insensitively() {
        let headers = "HTTP/1.1 302 Found\r\nSubscription-Userinfo: upload=1; download=2\r\n\r\nHTTP/1.1 200 OK\r\nsubscription-userinfo: upload=3; download=4\r\n";

        assert_eq!(
            parse_last_header(headers, "subscription-userinfo").as_deref(),
            Some("upload=3; download=4")
        );
    }

    #[test]
    fn redacts_native_curl_errors_before_returning_them() {
        let url = "https://user:pass@example.com/path/to/sub.yaml?token=secret&user=alice";
        let message = "curl: (22) The requested URL returned error: https://user:pass@example.com/path/to/sub.yaml?token=secret&user=alice";
        let sanitized = clean_network_error(message, url);

        assert_eq!(
            sanitized,
            "curl: (22) The requested URL returned error: https://example.com/...?token=<redacted>&user=<redacted>"
        );
        assert!(!sanitized.contains("secret"));
        assert!(!sanitized.contains("pass"));
        assert!(!sanitized.contains("/path/to/sub.yaml"));
    }

    #[test]
    fn redacts_native_curl_error_fragments_for_same_request_url() {
        let url = "https://example.com:8443/path/to/sub.yaml?token=secret";
        let message =
            "curl: failed path /path/to/sub.yaml query ?token=secret on https://example.com:8443";
        let sanitized = clean_network_error(message, url);

        assert_eq!(
            sanitized,
            "curl: failed path /... query ?<redacted> on https://example.com:8443"
        );
    }
}

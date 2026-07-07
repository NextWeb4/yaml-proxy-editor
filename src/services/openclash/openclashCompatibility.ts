import type { Finding } from "../../types/domain";
import { isRecord } from "../clash/clashService";

const PORT_KEYS = ["port", "socks-port", "redir-port", "mixed-port", "tproxy-port"] as const;
const VALID_MODES = new Set(["rule", "global", "direct"]);
const VALID_LOG_LEVELS = new Set(["debug", "info", "warning", "error", "silent"]);
const VALID_GROUP_TYPES = new Set(["select", "url-test", "fallback", "load-balance", "relay"]);
const VALID_PROVIDER_TYPES = new Set(["http", "file"]);
const VALID_RULE_PROVIDER_BEHAVIORS = new Set(["domain", "ipcidr", "classical"]);

export function checkOpenClashCompatibility(value: unknown): Finding[] {
  if (!isRecord(value)) {
    return [
      {
        id: "openclash-config-not-object",
        severity: "error",
        title: "无法检查 OpenClash 兼容性",
        message: "当前 YAML 根节点不是对象，无法作为 Clash / Mihomo 配置加载。",
        path: "/",
      },
    ];
  }

  return [
    ...checkPorts(value),
    ...checkModeAndLogLevel(value),
    ...checkExternalController(value),
    ...checkProxyGroups(value),
    ...checkProxyProviders(value),
    ...checkRuleProviders(value),
    ...checkTun(value),
    ...checkDnsShape(value),
  ];
}

export function diagnoseOpenClashLog(logText: string): Finding[] {
  const log = logText.trim();
  if (!log) return [];

  const detectors: Array<{ id: string; pattern: RegExp; title: string; message: string; suggestion: string }> = [
    {
      id: "openclash-log-yaml-parse",
      pattern: /(parse config|yaml:|mapping values are not allowed|did not find expected key)/i,
      title: "启动日志指向 YAML 解析失败",
      message: "OpenClash 日志包含 YAML 解析错误，通常是缩进、冒号或列表结构异常。",
      suggestion: "回到 YAML 编辑器查看语法诊断，先修复 YAML 语法再导出。",
    },
    {
      id: "openclash-log-missing-proxy",
      pattern: /(proxy|group).*(not found|missing|不存在)|not found.*(proxy|group)/i,
      title: "启动日志指向分组或节点引用缺失",
      message: "日志显示规则、分组或节点引用了不存在的目标。",
      suggestion: "检查 proxy-groups、rules、proxy-providers 的引用关系。",
    },
    {
      id: "openclash-log-port-bind",
      pattern: /(address already in use|bind:|listen tcp.*fail|port.*occupied)/i,
      title: "启动日志指向端口占用",
      message: "OpenClash 无法监听配置中的端口，可能与系统服务或其他 Clash 实例冲突。",
      suggestion: "检查 mixed-port、redir-port、tproxy-port、socks-port 是否重复或被占用。",
    },
    {
      id: "openclash-log-provider-fetch",
      pattern: /(provider|rule-set|ruleset).*(download|fetch|update).*(fail|error|timeout)/i,
      title: "启动日志指向 provider 拉取失败",
      message: "远程 proxy-provider 或 rule-provider 拉取失败。",
      suggestion: "确认 provider 的 url、path、interval 和网络连通性；该检查应由用户主动触发。",
    },
    {
      id: "openclash-log-tun",
      pattern: /(tun).*(fail|error|permission|operation not permitted|not supported)/i,
      title: "启动日志指向 TUN 启动失败",
      message: "TUN 模式启动失败，OpenWrt 内核、权限或路由配置可能不匹配。",
      suggestion: "检查 tun.enable、stack、auto-route、dns-hijack，并确认设备支持 TUN。",
    },
  ];

  const findings = detectors
    .filter((detector) => detector.pattern.test(log))
    .map<Finding>((detector) => ({
      id: detector.id,
      severity: "warning",
      title: detector.title,
      message: detector.message,
      path: "/openclash/log",
      suggestion: detector.suggestion,
    }));

  return findings.length > 0
    ? findings
    : [
        {
          id: "openclash-log-unknown",
          severity: "info",
          title: "未匹配到常见启动失败模式",
          message: "当前日志没有命中内置诊断规则。",
          path: "/openclash/log",
          suggestion: "保留原始日志，并结合 OpenClash 运行页面的具体错误继续定位。",
        },
      ];
}

function checkPorts(config: Record<string, unknown>): Finding[] {
  const findings: Finding[] = [];
  const portOwners = new Map<number, string[]>();

  for (const key of PORT_KEYS) {
    if (!(key in config)) continue;
    const value = config[key];
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 65535) {
      findings.push({
        id: `openclash-invalid-port-${key}`,
        severity: "error",
        title: "端口配置无效",
        message: `${key} 必须是 1 到 65535 之间的整数。`,
        path: `/${key}`,
        suggestion: "改为未被占用的有效端口，例如 mixed-port: 7890。",
      });
      continue;
    }

    const port = Number(value);
    portOwners.set(port, [...(portOwners.get(port) ?? []), key]);
  }

  for (const [port, owners] of portOwners) {
    if (owners.length > 1) {
      findings.push({
        id: `openclash-port-conflict-${port}`,
        severity: "error",
        title: "端口冲突",
        message: `${owners.join("、")} 都使用了端口 ${port}，OpenClash 可能无法启动。`,
        path: "/",
        suggestion: "为不同监听模式分配不同端口，或只保留 mixed-port。",
      });
    }
  }

  return findings;
}

function checkModeAndLogLevel(config: Record<string, unknown>): Finding[] {
  const findings: Finding[] = [];
  const mode = config.mode;
  const logLevel = config["log-level"];

  if (mode !== undefined && (typeof mode !== "string" || !VALID_MODES.has(mode))) {
    findings.push({
      id: "openclash-invalid-mode",
      severity: "warning",
      title: "mode 取值不常见",
      message: `当前 mode 为「${String(mode)}」，OpenClash 常用值是 rule、global、direct。`,
      path: "/mode",
      suggestion: "如无特殊需求，建议使用 mode: rule。",
    });
  }

  if (logLevel !== undefined && (typeof logLevel !== "string" || !VALID_LOG_LEVELS.has(logLevel))) {
    findings.push({
      id: "openclash-invalid-log-level",
      severity: "warning",
      title: "log-level 取值不常见",
      message: `当前 log-level 为「${String(logLevel)}」。`,
      path: "/log-level",
      suggestion: "建议使用 debug、info、warning、error 或 silent。",
    });
  }

  return findings;
}

function checkExternalController(config: Record<string, unknown>): Finding[] {
  const controller = config["external-controller"];
  if (typeof controller !== "string" || !controller.trim()) return [];

  const publicController = controller.startsWith("0.0.0.0:") || controller.startsWith("[::]:") || controller.startsWith(":::") || controller.startsWith(":");
  const secret = typeof config.secret === "string" ? config.secret.trim() : "";
  if (!publicController || secret) return [];

  return [
    {
      id: "openclash-public-controller-without-secret",
      severity: "warning",
      title: "external-controller 可能暴露",
      message: "external-controller 绑定到公开地址，但 secret 为空。",
      path: "/external-controller",
      suggestion: "绑定到 127.0.0.1，或设置强 secret 并限制访问来源。",
    },
  ];
}

function checkProxyGroups(config: Record<string, unknown>): Finding[] {
  const groups = config["proxy-groups"];
  const providers = config["proxy-providers"];
  const providerNames = new Set(isRecord(providers) ? Object.keys(providers) : []);
  const findings: Finding[] = [];

  if (groups === undefined) return findings;
  if (!Array.isArray(groups)) {
    return [
      {
        id: "openclash-proxy-groups-not-array",
        severity: "error",
        title: "proxy-groups 格式错误",
        message: "proxy-groups 必须是数组。",
        path: "/proxy-groups",
      },
    ];
  }

  groups.forEach((group, index) => {
    if (!isRecord(group)) {
      findings.push({
        id: `openclash-proxy-group-invalid-${index}`,
        severity: "error",
        title: "代理分组格式错误",
        message: `第 ${index + 1} 个 proxy-group 不是对象。`,
        path: `/proxy-groups/${index}`,
      });
      return;
    }

    const name = String(group.name ?? `#${index + 1}`);
    const type = String(group.type ?? "");
    if (!VALID_GROUP_TYPES.has(type)) {
      findings.push({
        id: `openclash-proxy-group-type-${index}`,
        severity: "warning",
        title: "代理分组类型不常见",
        message: `分组「${name}」的 type 为「${type || "空"}」。`,
        path: `/proxy-groups/${index}/type`,
        suggestion: "确认是否为 select、url-test、fallback、load-balance 或 relay。",
      });
    }

    const use = Array.isArray(group.use) ? group.use.map(String) : [];
    for (const provider of use) {
      if (!providerNames.has(provider)) {
        findings.push({
          id: `openclash-proxy-group-missing-provider-${index}-${provider}`,
          severity: "error",
          title: "代理分组引用不存在的 provider",
          message: `分组「${name}」use 了不存在的 proxy-provider「${provider}」。`,
          path: `/proxy-groups/${index}/use`,
          suggestion: "新增同名 proxy-provider，或删除该 use 引用。",
        });
      }
    }

    const proxies = Array.isArray(group.proxies) ? group.proxies : [];
    if (type !== "relay" && proxies.length === 0 && use.length === 0) {
      findings.push({
        id: `openclash-empty-proxy-group-${index}`,
        severity: "warning",
        title: "代理分组没有候选节点",
        message: `分组「${name}」没有 proxies，也没有 use。`,
        path: `/proxy-groups/${index}`,
        suggestion: "为分组添加节点、内置策略或 proxy-provider。",
      });
    }
  });

  return findings;
}

function checkProxyProviders(config: Record<string, unknown>): Finding[] {
  return checkProviders(config["proxy-providers"], "proxy-providers", false);
}

function checkRuleProviders(config: Record<string, unknown>): Finding[] {
  return checkProviders(config["rule-providers"], "rule-providers", true);
}

function checkProviders(value: unknown, section: "proxy-providers" | "rule-providers", isRuleProvider: boolean): Finding[] {
  if (value === undefined) return [];
  if (!isRecord(value)) {
    return [
      {
        id: `openclash-${section}-not-object`,
        severity: "error",
        title: `${section} 格式错误`,
        message: `${section} 必须是对象。`,
        path: `/${section}`,
      },
    ];
  }

  const findings: Finding[] = [];
  const pathOwners = new Map<string, string[]>();
  for (const [name, provider] of Object.entries(value)) {
    if (!isRecord(provider)) {
      findings.push({
        id: `openclash-${section}-invalid-${name}`,
        severity: "error",
        title: "provider 格式错误",
        message: `${section}.${name} 必须是对象。`,
        path: `/${section}/${name}`,
      });
      continue;
    }

    const type = String(provider.type ?? "");
    if (!VALID_PROVIDER_TYPES.has(type)) {
      findings.push({
        id: `openclash-${section}-type-${name}`,
        severity: "warning",
        title: "provider type 不常见",
        message: `${section}.${name} 的 type 为「${type || "空"}」。`,
        path: `/${section}/${name}/type`,
        suggestion: "常见 provider type 是 http 或 file。",
      });
    }

    const url = typeof provider.url === "string" ? provider.url.trim() : "";
    if (type === "http" && !url) {
      findings.push({
        id: `openclash-${section}-missing-url-${name}`,
        severity: "error",
        title: "远程 provider 缺少 URL",
        message: `${section}.${name} 是 http provider，但没有 url。`,
        path: `/${section}/${name}/url`,
      });
    }

    if (type === "http" && url && !isHttpUrl(url)) {
      findings.push({
        id: `openclash-${section}-invalid-url-${name}`,
        severity: "error",
        title: "远程 provider URL 协议无效",
        message: `${section}.${name} 的 url 必须是 http 或 https。`,
        path: `/${section}/${name}/url`,
        suggestion: "只允许用户主动配置的 http(s) provider 地址，不要使用 file、ftp 或其他协议。",
      });
    }

    if (type === "file" && url) {
      findings.push({
        id: `openclash-${section}-file-provider-url-${name}`,
        severity: "warning",
        title: "本地 provider 不应配置 url",
        message: `${section}.${name} 是 file provider，但同时配置了 url。`,
        path: `/${section}/${name}/url`,
        suggestion: "file provider 应只使用 path 指向本地规则或节点文件。",
      });
    }

    const interval = provider.interval;
    if (interval !== undefined && (!Number.isInteger(interval) || Number(interval) <= 0)) {
      findings.push({
        id: `openclash-${section}-invalid-interval-${name}`,
        severity: "warning",
        title: "provider interval 无效",
        message: `${section}.${name} 的 interval 应为正整数秒数。`,
        path: `/${section}/${name}/interval`,
        suggestion: "改为正整数，例如 86400。",
      });
    }

    if (typeof provider.path !== "string") {
      findings.push({
        id: `openclash-${section}-missing-path-${name}`,
        severity: "warning",
        title: "provider 缺少 path",
        message: `${section}.${name} 没有配置本地缓存 path。`,
        path: `/${section}/${name}/path`,
        suggestion: "为 provider 设置稳定的本地 path，便于 OpenClash 缓存和排错。",
      });
    } else {
      const path = provider.path.trim();
      if (path) {
        pathOwners.set(path, [...(pathOwners.get(path) ?? []), name]);
      }
    }

    if (!isRuleProvider) {
      findings.push(...checkProviderHealthCheck(provider, section, name));
    }

    if (isRuleProvider) {
      const behavior = String(provider.behavior ?? "");
      if (!VALID_RULE_PROVIDER_BEHAVIORS.has(behavior)) {
        findings.push({
          id: `openclash-rule-provider-behavior-${name}`,
          severity: "warning",
          title: "rule-provider behavior 不常见",
          message: `rule-providers.${name} 的 behavior 为「${behavior || "空"}」。`,
          path: `/rule-providers/${name}/behavior`,
          suggestion: "常见 behavior 是 domain、ipcidr 或 classical。",
        });
      }
    }
  }

  for (const [path, owners] of pathOwners) {
    if (owners.length > 1) {
      findings.push({
        id: `openclash-${section}-path-conflict-${owners.join("-")}`,
        severity: "error",
        title: "provider path 冲突",
        message: `${section} 中 ${owners.join("、")} 共用了 path「${path}」。`,
        path: `/${section}`,
        suggestion: "为每个 provider 分配独立缓存 path，避免 OpenClash 覆盖缓存文件。",
      });
    }
  }

  return findings;
}

function checkProviderHealthCheck(provider: Record<string, unknown>, section: "proxy-providers" | "rule-providers", name: string): Finding[] {
  const healthCheck = provider["health-check"];
  if (healthCheck === undefined) return [];
  if (!isRecord(healthCheck)) {
    return [
      {
        id: `openclash-${section}-health-check-invalid-${name}`,
        severity: "warning",
        title: "health-check 格式错误",
        message: `${section}.${name}.health-check 必须是对象。`,
        path: `/${section}/${name}/health-check`,
      },
    ];
  }

  const findings: Finding[] = [];
  if (healthCheck.enable === true && typeof healthCheck.url !== "string") {
    findings.push({
      id: `openclash-${section}-health-check-missing-url-${name}`,
      severity: "error",
      title: "health-check 缺少 URL",
      message: `${section}.${name} 启用了 health-check，但没有 url。`,
      path: `/${section}/${name}/health-check/url`,
      suggestion: "配置明确的测速 URL，或关闭该 provider 的 health-check。",
    });
  }

  const interval = healthCheck.interval;
  if (interval !== undefined && (!Number.isInteger(interval) || Number(interval) <= 0)) {
    findings.push({
      id: `openclash-${section}-health-check-invalid-interval-${name}`,
      severity: "warning",
      title: "health-check interval 无效",
      message: `${section}.${name}.health-check.interval 应为正整数秒数。`,
      path: `/${section}/${name}/health-check/interval`,
      suggestion: "改为正整数，例如 300。",
    });
  }

  return findings;
}

function isHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function checkTun(config: Record<string, unknown>): Finding[] {
  const tun = config.tun;
  if (!isRecord(tun) || tun.enable !== true) return [];

  const findings: Finding[] = [];
  if (tun["auto-route"] === true) {
    findings.push({
      id: "openclash-tun-auto-route",
      severity: "warning",
      title: "TUN auto-route 可能和 OpenWrt 路由冲突",
      message: "tun.auto-route 已启用，部分 OpenWrt 环境可能出现路由表或防火墙冲突。",
      path: "/tun/auto-route",
      suggestion: "在 OpenClash 环境中确认内核和防火墙模式支持后再启用。",
    });
  }

  if (!Array.isArray(tun["dns-hijack"]) || tun["dns-hijack"].length === 0) {
    findings.push({
      id: "openclash-tun-missing-dns-hijack",
      severity: "info",
      title: "TUN 未配置 dns-hijack",
      message: "tun.enable 已开启，但 dns-hijack 为空。",
      path: "/tun/dns-hijack",
      suggestion: "如使用 TUN 接管 DNS，确认是否需要添加 any:53 或等效配置。",
    });
  }

  return findings;
}

function checkDnsShape(config: Record<string, unknown>): Finding[] {
  const dns = config.dns;
  if (!isRecord(dns) || dns.enable !== true) return [];

  if (!Array.isArray(dns.nameserver) || dns.nameserver.length === 0) {
    return [
      {
        id: "openclash-dns-empty-nameserver",
        severity: "warning",
        title: "DNS nameserver 为空",
        message: "dns.enable 已开启，但 nameserver 没有可用条目。",
        path: "/dns/nameserver",
        suggestion: "至少配置一个稳定 DNS，并结合 fallback-filter 控制国内外解析。",
      },
    ];
  }

  return [];
}

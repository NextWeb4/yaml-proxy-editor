import { parseDocument } from "yaml";
import type { Finding } from "../../types/domain";
import { isRecord, parseProxyNodes } from "../clash/clashService";

export type ProviderSection = "proxy-providers" | "rule-providers";
export type ProviderRemoteCheckStatus = "ok" | "warning" | "error";
export type ProviderContentFormat =
  | "proxy-yaml"
  | "proxy-uri-list"
  | "rule-yaml"
  | "rule-text"
  | "rule-mrs"
  | "empty"
  | "unknown";

export interface ProviderRemoteTarget {
  id: string;
  section: ProviderSection;
  name: string;
  path: string;
  url: string;
  redactedUrl: string;
  behavior?: string;
  format?: string;
}

export interface ProviderRemoteCheckResult extends ProviderRemoteTarget {
  status: ProviderRemoteCheckStatus;
  message: string;
  checkedAt: string;
  durationMs: number;
  httpStatus?: number;
  bytes?: number;
  contentType?: string;
  truncated?: boolean;
  contentFormat?: ProviderContentFormat;
  itemCount?: number;
}

export interface ProviderRemoteCheckSummary {
  checkedAt: string;
  targets: ProviderRemoteTarget[];
  results: ProviderRemoteCheckResult[];
  findings: Finding[];
}

export interface ProviderRemoteCheckOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxConcurrent?: number;
  maxBytes?: number;
  now?: () => Date;
}

const PROVIDER_SECTIONS: ProviderSection[] = ["proxy-providers", "rule-providers"];
const DEFAULT_PROVIDER_CHECK_MAX_BYTES = 2 * 1024 * 1024;
const PROXY_LINK_PROTOCOLS = new Set(["ss", "vmess", "trojan", "vless", "hysteria2", "hy2", "tuic"]);

export function extractRemoteProviderTargets(value: unknown): {
  targets: ProviderRemoteTarget[];
  findings: Finding[];
} {
  if (!isRecord(value)) {
    return {
      targets: [],
      findings: [
        {
          id: "provider-check-config-not-object",
          severity: "error",
          title: "无法检查远程 provider",
          message: "当前 YAML 根节点不是对象，无法提取 provider。",
          path: "/",
        },
      ],
    };
  }

  const targets: ProviderRemoteTarget[] = [];
  const findings: Finding[] = [];

  for (const section of PROVIDER_SECTIONS) {
    const providers = value[section];
    if (providers === undefined) continue;

    if (!isRecord(providers)) {
      findings.push({
        id: `provider-check-${section}-not-object`,
        severity: "error",
        title: "provider 格式错误",
        message: `${section} 必须是对象，当前无法提取远程检查目标。`,
        path: `/${section}`,
      });
      continue;
    }

    for (const [name, provider] of Object.entries(providers)) {
      const providerPath = `/${section}/${escapeJsonPointer(name)}`;
      if (!isRecord(provider)) {
        findings.push({
          id: `provider-check-${section}-invalid-${slugId(name)}`,
          severity: "error",
          title: "provider 格式错误",
          message: `${section}.${name} 必须是对象。`,
          path: providerPath,
        });
        continue;
      }

      if (String(provider.type ?? "") !== "http") {
        continue;
      }

      const rawUrl = typeof provider.url === "string" ? provider.url.trim() : "";
      if (!rawUrl) {
        findings.push({
          id: `provider-check-${section}-missing-url-${slugId(name)}`,
          severity: "error",
          title: "远程 provider 缺少 URL",
          message: `${section}.${name} 是 http provider，但没有 url。`,
          path: `${providerPath}/url`,
        });
        continue;
      }

      let url: URL;
      try {
        url = parseAllowedProviderUrl(rawUrl);
      } catch (error) {
        findings.push({
          id: `provider-check-${section}-invalid-url-${slugId(name)}`,
          severity: "error",
          title: "远程 provider URL 协议无效",
          message: error instanceof Error ? error.message : "provider URL 无效。",
          path: `${providerPath}/url`,
          suggestion: "远程 provider 检查只允许用户配置中的 http 或 https URL。",
        });
        continue;
      }

      targets.push({
        id: `${section}:${name}`,
        section,
        name,
        path: `${providerPath}/url`,
        url: url.toString(),
        redactedUrl: redactProviderUrl(url.toString()),
        behavior: readLowerString(provider.behavior),
        format: readLowerString(provider.format),
      });
    }
  }

  return { targets, findings };
}

export async function checkRemoteProviders(
  value: unknown,
  options: ProviderRemoteCheckOptions = {},
): Promise<ProviderRemoteCheckSummary> {
  const checkedAt = (options.now?.() ?? new Date()).toISOString();
  const extracted = extractRemoteProviderTargets(value);
  const maxConcurrent = clampInteger(options.maxConcurrent ?? 3, 1, 6);
  const results: ProviderRemoteCheckResult[] = [];
  const targetOrder = new Map(extracted.targets.map((target, index) => [target.id, index]));
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < extracted.targets.length) {
      const target = extracted.targets[cursor];
      cursor += 1;
      results.push(await checkSingleProvider(target, checkedAt, options));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(maxConcurrent, extracted.targets.length) }, () => worker()),
  );

  results.sort((left, right) => (targetOrder.get(left.id) ?? 0) - (targetOrder.get(right.id) ?? 0));

  return {
    checkedAt,
    targets: extracted.targets,
    results,
    findings: [...extracted.findings, ...results.filter((result) => result.status !== "ok").map(toProviderFinding)],
  };
}

export function parseAllowedProviderUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("provider URL 不能为空。");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("provider URL 格式不正确。");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("远程 provider 检查只允许 http 或 https URL。");
  }

  return url;
}

export function redactProviderUrl(rawUrl: string): string {
  const url = parseAllowedProviderUrl(rawUrl);
  const redacted = `${url.protocol}//${url.host}/...`;
  const params = Array.from(url.searchParams.keys())
    .sort()
    .map((key) => `${key}=<redacted>`);
  return params.length > 0 ? `${redacted}?${params.join("&")}` : redacted;
}

async function checkSingleProvider(
  target: ProviderRemoteTarget,
  checkedAt: string,
  options: ProviderRemoteCheckOptions,
): Promise<ProviderRemoteCheckResult> {
  const requestFetch = options.fetchImpl ?? globalThis.fetch;
  const startedAt = nowMs();

  if (typeof requestFetch !== "function") {
    return {
      ...target,
      status: "error",
      message: "当前运行环境没有可用 fetch。",
      checkedAt,
      durationMs: 0,
    };
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);

  try {
    const response = await requestFetch(target.url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "text/yaml, application/yaml, application/x-yaml, text/plain, */*",
      },
    });
    const body = await readResponseTextWithLimit(response, options.maxBytes ?? DEFAULT_PROVIDER_CHECK_MAX_BYTES);
    const content = response.ok ? inspectProviderContent(target, body.text, body.truncated) : undefined;
    const status: ProviderRemoteCheckStatus = response.ok ? content?.status ?? "ok" : "warning";

    return {
      ...target,
      status,
      message: response.ok
        ? formatProviderSuccessMessage(response.status, body.bytes, body.truncated, content)
        : `HTTP ${response.status}，provider 返回非成功状态。`,
      checkedAt,
      durationMs: elapsedMs(startedAt),
      httpStatus: response.status,
      bytes: body.bytes,
      contentType: response.headers.get("content-type") ?? undefined,
      truncated: body.truncated,
      contentFormat: content?.format,
      itemCount: content?.itemCount,
    };
  } catch (error) {
    return {
      ...target,
      status: "error",
      message: sanitizeProviderError(error, target),
      checkedAt,
      durationMs: elapsedMs(startedAt),
    };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

interface ProviderContentInspection {
  status: ProviderRemoteCheckStatus;
  format: ProviderContentFormat;
  message: string;
  itemCount?: number;
}

function inspectProviderContent(
  target: ProviderRemoteTarget,
  raw: string,
  truncated: boolean,
): ProviderContentInspection {
  if (!raw.trim()) {
    return {
      status: "warning",
      format: "empty",
      message: "provider 响应为空。",
    };
  }

  if (target.section === "proxy-providers") {
    return inspectProxyProviderContent(raw, truncated);
  }

  return inspectRuleProviderContent(target, raw, truncated);
}

function inspectProxyProviderContent(raw: string, truncated: boolean): ProviderContentInspection {
  const yaml = tryParseYamlValue(raw);
  if (yaml.ok) {
    const proxies = readProxyList(yaml.value);
    if (proxies) {
      const itemCount = parseProxyNodes(proxies).length;
      if (itemCount > 0) {
        return {
          status: "ok",
          format: "proxy-yaml",
          itemCount,
          message: `识别为 Clash/Mihomo 代理 provider，${itemCount} 个节点。`,
        };
      }

      return {
        status: "warning",
        format: "proxy-yaml",
        itemCount: 0,
        message: "识别到代理 provider YAML，但没有可用节点。",
      };
    }
  }

  const directLinkCount = countProxyLinkLines(raw);
  if (directLinkCount > 0) {
    return {
      status: "ok",
      format: "proxy-uri-list",
      itemCount: directLinkCount,
      message: `识别为代理链接列表，${directLinkCount} 个链接。`,
    };
  }

  const decoded = tryDecodeBase64Text(raw);
  const decodedLinkCount = decoded ? countProxyLinkLines(decoded) : 0;
  if (decodedLinkCount > 0) {
    return {
      status: "ok",
      format: "proxy-uri-list",
      itemCount: decodedLinkCount,
      message: `识别为 base64 代理链接列表，${decodedLinkCount} 个链接。`,
    };
  }

  return {
    status: truncated ? "ok" : "warning",
    format: "unknown",
    message: truncated ? "响应已截断，仅完成连通性检查，未确认完整 provider 结构。" : "未识别为代理 provider 内容结构。",
  };
}

function inspectRuleProviderContent(
  target: ProviderRemoteTarget,
  raw: string,
  truncated: boolean,
): ProviderContentInspection {
  if (target.format === "mrs") {
    return {
      status: "ok",
      format: "rule-mrs",
      message: "规则 provider 使用 mrs 格式，仅检查连通性。",
    };
  }

  if (target.format === "text") {
    return inspectRuleTextContent(raw, truncated);
  }

  const yaml = tryParseYamlValue(raw);
  if (yaml.ok) {
    const payload = readRulePayload(yaml.value);
    if (payload) {
      const itemCount = payload.filter((item) => typeof item === "string" && item.trim()).length;
      if (itemCount > 0) {
        return {
          status: "ok",
          format: "rule-yaml",
          itemCount,
          message: `识别为规则 provider YAML，${itemCount} 条规则。`,
        };
      }

      return {
        status: "warning",
        format: "rule-yaml",
        itemCount: 0,
        message: "识别到规则 provider YAML，但 payload 为空。",
      };
    }
  }

  return {
    status: truncated ? "ok" : "warning",
    format: "unknown",
    message: truncated ? "响应已截断，仅完成连通性检查，未确认完整规则结构。" : "未识别为规则 provider 内容结构。",
  };
}

function inspectRuleTextContent(raw: string, truncated: boolean): ProviderContentInspection {
  const itemCount = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")).length;

  if (itemCount > 0) {
    return {
      status: "ok",
      format: "rule-text",
      itemCount,
      message: `识别为 text 规则 provider，${itemCount} 条规则。`,
    };
  }

  return {
    status: truncated ? "ok" : "warning",
    format: "rule-text",
    itemCount: 0,
    message: truncated ? "响应已截断，仅完成 text provider 连通性检查。" : "text 规则 provider 响应为空。",
  };
}

function formatProviderSuccessMessage(
  httpStatus: number,
  bytes: number,
  truncated: boolean,
  content?: ProviderContentInspection,
): string {
  const readMessage = truncated ? `已读取前 ${bytes} 字节，响应超过检查上限` : `已读取 ${bytes} 字节`;
  return content ? `HTTP ${httpStatus}，${readMessage}；${content.message}` : `HTTP ${httpStatus}，${readMessage}。`;
}

function tryParseYamlValue(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const document = parseDocument(raw, { prettyErrors: false, uniqueKeys: false });
    if (document.errors.length > 0) return { ok: false };
    return { ok: true, value: document.toJS({ maxAliasCount: 100 }) };
  } catch {
    return { ok: false };
  }
}

function readProxyList(value: unknown): unknown[] | undefined {
  if (isRecord(value) && Array.isArray(value.proxies)) return value.proxies;
  if (Array.isArray(value)) return value;
  return undefined;
}

function readRulePayload(value: unknown): unknown[] | undefined {
  if (isRecord(value) && Array.isArray(value.payload)) return value.payload;
  if (Array.isArray(value)) return value;
  return undefined;
}

function countProxyLinkLines(raw: string): number {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => PROXY_LINK_PROTOCOLS.has(line.match(/^([a-z0-9+.-]+):\/\//i)?.[1]?.toLowerCase() ?? "")).length;
}

function tryDecodeBase64Text(raw: string): string | undefined {
  const normalized = raw.trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized || /[^a-zA-Z0-9+/=\s]/.test(normalized)) return undefined;
  const compact = normalized.replace(/\s+/g, "");
  const padded = compact + "=".repeat((4 - (compact.length % 4)) % 4);

  try {
    return decodeURIComponent(
      Array.from(globalThis.atob(padded), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
    );
  } catch {
    return undefined;
  }
}

function toProviderFinding(result: ProviderRemoteCheckResult): Finding {
  return {
    id: `provider-check-${result.status}-${result.section}-${slugId(result.name)}`,
    severity: result.status === "error" ? "error" : "warning",
    title: result.status === "error" ? "远程 provider 检查失败" : "远程 provider 返回异常状态",
    message: `${result.section}.${result.name}：${result.message}`,
    path: result.path,
    suggestion: `确认 ${result.redactedUrl} 是否仍可访问，或更换 provider URL。`,
  };
}

async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const safeMaxBytes = clampInteger(maxBytes, 1, 20 * 1024 * 1024);
  const body = response.body;
  if (!body?.getReader) {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    return {
      text: bytes > safeMaxBytes ? text.slice(0, safeMaxBytes) : text,
      bytes: Math.min(bytes, safeMaxBytes),
      truncated: bytes > safeMaxBytes,
    };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;

  while (bytes < safeMaxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;

    const remaining = safeMaxBytes - bytes;
    if (value.byteLength > remaining) {
      chunks.push(value.slice(0, remaining));
      bytes += remaining;
      truncated = true;
      await reader.cancel();
      break;
    }

    chunks.push(value);
    bytes += value.byteLength;
  }

  if (bytes >= safeMaxBytes && !truncated) {
    truncated = true;
    await reader.cancel();
  }

  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder().decode(merged),
    bytes,
    truncated,
  };
}

function sanitizeProviderError(error: unknown, target: ProviderRemoteTarget): string {
  const name = typeof error === "object" && error && "name" in error ? String((error as { name?: unknown }).name) : "";
  if (name === "AbortError") {
    return "请求超时。";
  }

  const raw = error instanceof Error ? error.message : String(error);
  let sanitized = raw.replaceAll(target.url, target.redactedUrl);
  try {
    const url = new URL(target.url);
    if (url.search) sanitized = sanitized.replaceAll(url.search, "?<redacted>");
    if (url.pathname && url.pathname !== "/") sanitized = sanitized.replaceAll(url.pathname, "/...");
    if (url.username) sanitized = sanitized.replaceAll(url.username, "<redacted>");
    if (url.password) sanitized = sanitized.replaceAll(url.password, "<redacted>");
  } catch {
    // The target URL was already validated before fetch; keep a safe fallback anyway.
  }
  return sanitized.trim() || "请求失败。";
}

function escapeJsonPointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function slugId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "provider";
}

function readLowerString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function nowMs(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(nowMs() - startedAt));
}

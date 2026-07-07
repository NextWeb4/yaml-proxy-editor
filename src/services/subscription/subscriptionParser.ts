import { parseDocument } from "yaml";
import type { Finding, ProxyNode, SubscriptionParseResult } from "../../types/domain";
import { parseProxyNodes } from "../clash/clashService";

export function parseSubscriptionText(raw: string, name = "未命名订阅"): SubscriptionParseResult {
  const yamlResult = parseClashYaml(raw, name);
  if (yamlResult) {
    return yamlResult;
  }

  const decoded = tryDecodeBase64(raw.trim());
  if (decoded) {
    const nodes = parseLinkLines(decoded, name);
    return {
      name,
      nodes,
      findings: nodes.length > 0 ? [] : [unknownSubscriptionFinding()],
      format: nodes.length > 0 ? "base64-links" : "unknown",
    };
  }

  const nodes = parseLinkLines(raw, name);
  return {
    name,
    nodes,
    findings: nodes.length > 0 ? [] : [unknownSubscriptionFinding()],
    format: nodes.length > 0 ? "base64-links" : "unknown",
  };
}

function parseClashYaml(raw: string, name: string): SubscriptionParseResult | undefined {
  const document = parseDocument(raw, { prettyErrors: true, uniqueKeys: true });
  if (document.errors.length > 0) {
    return undefined;
  }

  const value = document.toJS({ maxAliasCount: 100 });
  if (!value || typeof value !== "object" || !("proxies" in value)) {
    return undefined;
  }

  if (!Array.isArray((value as Record<string, unknown>).proxies)) {
    return undefined;
  }

  return {
    name,
    nodes: parseProxyNodes((value as Record<string, unknown>).proxies, name),
    findings: [],
    format: "clash-yaml",
  };
}

function parseLinkLines(raw: string, subscriptionName: string): ProxyNode[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => parseNodeLink(line, index, subscriptionName))
    .filter((node): node is ProxyNode => Boolean(node));
}

function parseNodeLink(line: string, index: number, subscriptionName: string): ProxyNode | undefined {
  const protocol = line.match(/^([a-z0-9+.-]+):\/\//i)?.[1]?.toLowerCase();
  if (!protocol) {
    return undefined;
  }

  try {
    if (protocol === "vmess") return parseVmessLink(line, index, subscriptionName);
    if (protocol === "trojan") return parseTrojanLink(line, index, subscriptionName);
    if (protocol === "ss") return parseShadowsocksLink(line, index, subscriptionName);
    if (protocol === "vless") return parseVlessLink(line, index, subscriptionName);
    if (protocol === "hysteria2" || protocol === "hy2") return parseHysteria2Link(line, index, subscriptionName);
    if (protocol === "tuic") return parseTuicLink(line, index, subscriptionName);

    return fallbackLinkNode(protocol, line, index, subscriptionName);
  } catch {
    return undefined;
  }
}

function parseVmessLink(line: string, index: number, subscriptionName: string): ProxyNode | undefined {
  const payload = tryDecodeBase64(line.slice("vmess://".length));
  if (!payload) return fallbackLinkNode("vmess", line, index, subscriptionName);

  const parsed = JSON.parse(payload) as Record<string, unknown>;
  const name = readString(parsed.ps) ?? readString(parsed.name) ?? `vmess-${index + 1}`;
  const proxy: Record<string, unknown> = {
    name,
    type: "vmess",
    server: readString(parsed.add),
    port: readNumber(parsed.port),
    uuid: readString(parsed.id),
    alterId: readNumber(parsed.aid) ?? 0,
    cipher: readString(parsed.scy) ?? "auto",
  };
  const network = readString(parsed.net);
  const tls = readString(parsed.tls);
  const host = readString(parsed.host);
  const path = readString(parsed.path);
  const sni = readString(parsed.sni);

  if (network) proxy.network = network;
  if (tls && tls !== "none") proxy.tls = tls === "tls" ? true : tls;
  if (sni) proxy.servername = sni;
  applyTransportOptions(proxy, network, path, host);

  return proxyNodeFromClashProxy(subscriptionName, "vmess", index, proxy);
}

function parseTrojanLink(line: string, index: number, subscriptionName: string): ProxyNode {
  const url = new URL(line);
  const name = decodeUrlComponent(url.hash.slice(1)) || `trojan-${index + 1}`;
  const sni = url.searchParams.get("sni") ?? url.searchParams.get("peer") ?? url.searchParams.get("host") ?? undefined;
  const network = url.searchParams.get("type") ?? url.searchParams.get("network") ?? undefined;
  const proxy: Record<string, unknown> = {
    name,
    type: "trojan",
    server: url.hostname || undefined,
    port: readNumber(url.port),
    password: decodeUrlComponent(url.username),
  };

  if (sni) proxy.sni = decodeUrlComponent(sni);
  if (isTruthyParam(url.searchParams.get("allowInsecure")) || isTruthyParam(url.searchParams.get("skip-cert-verify"))) {
    proxy["skip-cert-verify"] = true;
  }
  if (network) proxy.network = network;
  applyTransportOptions(proxy, network, url.searchParams.get("path") ?? undefined, url.searchParams.get("host") ?? undefined);

  return proxyNodeFromClashProxy(subscriptionName, "trojan", index, proxy);
}

function parseShadowsocksLink(line: string, index: number, subscriptionName: string): ProxyNode | undefined {
  const body = line.slice("ss://".length);
  const [bodyWithoutHash, rawName = ""] = body.split("#", 2);
  const name = decodeUrlComponent(rawName) || `ss-${index + 1}`;
  const proxy = bodyWithoutHash.includes("@")
    ? parseSip002ShadowsocksUrl(line, name)
    : parseLegacyShadowsocksUrl(bodyWithoutHash, name);

  return proxy ? proxyNodeFromClashProxy(subscriptionName, "ss", index, proxy) : undefined;
}

function parseVlessLink(line: string, index: number, subscriptionName: string): ProxyNode {
  const url = new URL(line);
  const name = decodeUrlComponent(url.hash.slice(1)) || `vless-${index + 1}`;
  const security = url.searchParams.get("security") ?? undefined;
  const network = url.searchParams.get("type") ?? url.searchParams.get("network") ?? undefined;
  const proxy: Record<string, unknown> = {
    name,
    type: "vless",
    server: url.hostname || undefined,
    port: readNumber(url.port),
    uuid: decodeUrlComponent(url.username),
  };

  if (url.searchParams.get("encryption")) proxy.encryption = url.searchParams.get("encryption") ?? undefined;
  if (security === "tls" || security === "reality") proxy.tls = true;
  if (url.searchParams.get("sni")) proxy.servername = decodeUrlComponent(url.searchParams.get("sni") ?? "");
  if (url.searchParams.get("flow")) proxy.flow = url.searchParams.get("flow") ?? undefined;
  if (url.searchParams.get("fp")) proxy["client-fingerprint"] = url.searchParams.get("fp") ?? undefined;
  if (network) proxy.network = network;
  applyTransportOptions(proxy, network, url.searchParams.get("path") ?? undefined, url.searchParams.get("host") ?? undefined);
  applyRealityOptions(proxy, url.searchParams);

  return proxyNodeFromClashProxy(subscriptionName, "vless", index, proxy);
}

function parseHysteria2Link(line: string, index: number, subscriptionName: string): ProxyNode {
  const url = new URL(line);
  const name = decodeUrlComponent(url.hash.slice(1)) || `hysteria2-${index + 1}`;
  const params = url.searchParams;
  const proxy: Record<string, unknown> = {
    name,
    type: "hysteria2",
    server: url.hostname || undefined,
    port: readNumber(url.port),
    password: decodeUrlComponent(url.username),
  };
  const up = readFirstParam(params, ["up", "upmbps", "upMbps"]);
  const down = readFirstParam(params, ["down", "downmbps", "downMbps"]);
  const alpn = readListParam(params, ["alpn"]);

  if (up) proxy.up = normalizeBandwidth(up);
  if (down) proxy.down = normalizeBandwidth(down);
  if (readFirstParam(params, ["sni"])) proxy.sni = readFirstParam(params, ["sni"]);
  if (isTruthyParam(readFirstParam(params, ["insecure", "allowInsecure", "allow_insecure", "skip-cert-verify"]) ?? null)) {
    proxy["skip-cert-verify"] = true;
  }
  if (alpn.length > 0) proxy.alpn = alpn;
  if (readFirstParam(params, ["obfs"])) proxy.obfs = readFirstParam(params, ["obfs"]);
  if (readFirstParam(params, ["obfs-password", "obfs_password"])) {
    proxy["obfs-password"] = readFirstParam(params, ["obfs-password", "obfs_password"]);
  }
  if (readFirstParam(params, ["fingerprint"])) proxy.fingerprint = readFirstParam(params, ["fingerprint"]);

  return proxyNodeFromClashProxy(subscriptionName, "hysteria2", index, proxy);
}

function parseTuicLink(line: string, index: number, subscriptionName: string): ProxyNode {
  const url = new URL(line);
  const name = decodeUrlComponent(url.hash.slice(1)) || `tuic-${index + 1}`;
  const params = url.searchParams;
  const password = decodeUrlComponent(url.password) || readFirstParam(params, ["password"]);
  const token = readFirstParam(params, ["token"]);
  const proxy: Record<string, unknown> = {
    name,
    type: "tuic",
    server: url.hostname || undefined,
    port: readNumber(url.port),
    uuid: decodeUrlComponent(url.username) || readFirstParam(params, ["uuid"]),
  };
  const alpn = readListParam(params, ["alpn"]);

  if (password) proxy.password = password;
  if (token) proxy.token = token;
  if (readFirstParam(params, ["ip"])) proxy.ip = readFirstParam(params, ["ip"]);
  if (readFirstParam(params, ["sni"])) proxy.sni = readFirstParam(params, ["sni"]);
  if (alpn.length > 0) proxy.alpn = alpn;
  applyNumberParam(proxy, "heartbeat-interval", params, ["heartbeat-interval", "heartbeat_interval"]);
  applyNumberParam(proxy, "request-timeout", params, ["request-timeout", "request_timeout"]);
  applyNumberParam(proxy, "max-udp-relay-packet-size", params, ["max-udp-relay-packet-size", "max_udp_relay_packet_size"]);
  applyNumberParam(proxy, "max-open-streams", params, ["max-open-streams", "max_open_streams"]);
  if (isTruthyParam(readFirstParam(params, ["disable-sni", "disable_sni"]) ?? null)) proxy["disable-sni"] = true;
  if (isTruthyParam(readFirstParam(params, ["reduce-rtt", "reduce_rtt"]) ?? null)) proxy["reduce-rtt"] = true;
  if (isTruthyParam(readFirstParam(params, ["fast-open", "fast_open"]) ?? null)) proxy["fast-open"] = true;
  if (isTruthyParam(readFirstParam(params, ["allowInsecure", "allow_insecure", "insecure", "skip-cert-verify"]) ?? null)) {
    proxy["skip-cert-verify"] = true;
  }
  if (readFirstParam(params, ["udp-relay-mode", "udp_relay_mode"])) {
    proxy["udp-relay-mode"] = readFirstParam(params, ["udp-relay-mode", "udp_relay_mode"]);
  }
  if (readFirstParam(params, ["congestion-controller", "congestion_control"])) {
    proxy["congestion-controller"] = readFirstParam(params, ["congestion-controller", "congestion_control"]);
  }

  return proxyNodeFromClashProxy(subscriptionName, "tuic", index, proxy);
}

function fallbackLinkNode(protocol: string, line: string, index: number, subscriptionName: string): ProxyNode {
  const nameFromHash = decodeUrlComponent(line.split("#")[1] ?? "").trim();
  const name = nameFromHash || `${protocol}-${index + 1}`;
  const url = new URL(line);
  const proxy: Record<string, unknown> = {
    name,
    type: protocol,
    server: url.hostname || undefined,
    port: Number(url.port) || undefined,
  };

  return {
    id: `${subscriptionName}:${protocol}:${index}`,
    name,
    type: protocol,
    server: url.hostname || undefined,
    port: Number(url.port) || undefined,
    subscriptionName,
    raw: proxy,
  };
}

function tryDecodeBase64(value: string): string | undefined {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    return decodeURIComponent(
      Array.from(globalThis.atob(padded), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
    );
  } catch {
    return undefined;
  }
}

function parseSip002ShadowsocksUrl(line: string, name: string): Record<string, unknown> | undefined {
  const url = new URL(line);
  const userInfo = decodeUrlComponent(url.username);
  const decodedUserInfo = tryDecodeBase64(userInfo) ?? userInfo;
  const [cipher, ...passwordParts] = decodedUserInfo.includes(":")
    ? decodedUserInfo.split(":")
    : [userInfo, decodeUrlComponent(url.password)];
  const password = passwordParts.join(":");
  if (!cipher || !password) return undefined;

  const proxy: Record<string, unknown> = {
    name,
    type: "ss",
    server: url.hostname || undefined,
    port: readNumber(url.port),
    cipher,
    password,
  };
  applyPluginOption(proxy, url.searchParams.get("plugin") ?? undefined);
  return proxy;
}

function parseLegacyShadowsocksUrl(bodyWithoutHash: string, name: string): Record<string, unknown> | undefined {
  const [encoded] = bodyWithoutHash.split("?", 1);
  const decoded = tryDecodeBase64(encoded);
  if (!decoded) return undefined;

  const matched = decoded.match(/^([^:]+):(.+)@(.+):(\d+)$/);
  if (!matched) return undefined;

  return {
    name,
    type: "ss",
    cipher: matched[1],
    password: matched[2],
    server: matched[3],
    port: readNumber(matched[4]),
  };
}

function proxyNodeFromClashProxy(
  subscriptionName: string,
  protocol: string,
  index: number,
  proxy: Record<string, unknown>,
): ProxyNode {
  return {
    id: `${subscriptionName}:${protocol}:${index}`,
    name: String(proxy.name ?? `${protocol}-${index + 1}`),
    type: String(proxy.type ?? protocol),
    server: readString(proxy.server),
    port: readNumber(proxy.port),
    subscriptionName,
    raw: stripUndefined(proxy),
  };
}

function applyTransportOptions(proxy: Record<string, unknown>, network?: string, path?: string, host?: string): void {
  if (network !== "ws") return;

  const wsOpts: Record<string, unknown> = {};
  if (path) wsOpts.path = decodeUrlComponent(path);
  if (host) wsOpts.headers = { Host: decodeUrlComponent(host) };
  if (Object.keys(wsOpts).length > 0) proxy["ws-opts"] = wsOpts;
}

function applyRealityOptions(proxy: Record<string, unknown>, params: URLSearchParams): void {
  const publicKey = params.get("pbk");
  const shortId = params.get("sid");
  if (!publicKey && !shortId) return;

  proxy["reality-opts"] = stripUndefined({
    "public-key": publicKey ?? undefined,
    "short-id": shortId ?? undefined,
  });
}

function applyPluginOption(proxy: Record<string, unknown>, plugin?: string): void {
  if (!plugin) return;
  proxy.plugin = decodeUrlComponent(plugin);
}

function applyNumberParam(
  proxy: Record<string, unknown>,
  targetKey: string,
  params: URLSearchParams,
  sourceKeys: string[],
): void {
  const value = readNumber(readFirstParam(params, sourceKeys));
  if (value !== undefined) proxy[targetKey] = value;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isTruthyParam(value: string | null): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readFirstParam(params: URLSearchParams, names: string[]): string | undefined {
  for (const name of names) {
    const value = params.get(name);
    if (value !== null && value.trim()) return decodeUrlComponent(value).trim();
  }
  return undefined;
}

function readListParam(params: URLSearchParams, names: string[]): string[] {
  const values = names.flatMap((name) => params.getAll(name));
  return values.flatMap((value) => decodeUrlComponent(value).split(",")).map((value) => value.trim()).filter(Boolean);
}

function normalizeBandwidth(value: string): string {
  return /^\d+(\.\d+)?$/.test(value) ? `${value} Mbps` : value;
}

function stripUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== ""));
}

function unknownSubscriptionFinding(): Finding {
  return {
    id: "unknown-subscription-format",
    severity: "error",
    title: "无法识别订阅内容",
    message: "订阅内容既不是 Clash/Mihomo YAML，也不是可解析的 base64 节点列表。",
    path: "/subscription",
    suggestion: "确认订阅 URL 返回的是 Clash/Mihomo YAML 或常见节点链接格式。",
  };
}

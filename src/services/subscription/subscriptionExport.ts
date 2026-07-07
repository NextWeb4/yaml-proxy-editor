import { stringify } from "yaml";
import type { Finding, ProxyNode } from "../../types/domain";
import { toClashProxy } from "../nodes/nodeManager";
import { isRecord } from "../clash/clashService";

export const NODE_SUBSCRIPTION_EXPORT_FORMATS = [
  "clash-yaml",
  "clash-provider-yaml",
  "share-links",
  "share-links-base64",
] as const;

export type NodeSubscriptionExportFormat = (typeof NODE_SUBSCRIPTION_EXPORT_FORMATS)[number];

export interface NodeSubscriptionExportResult {
  format: NodeSubscriptionExportFormat;
  label: string;
  mimeType: string;
  extension: string;
  content: string;
  exportedCount: number;
  skippedCount: number;
  findings: Finding[];
}

export function buildNodeSubscriptionExport(nodes: ProxyNode[], format: NodeSubscriptionExportFormat): NodeSubscriptionExportResult {
  if (format === "clash-yaml") {
    const content = stringify({ proxies: nodes.map((node) => toClashProxy(node)) }, { indent: 2, lineWidth: 0 });
    return baseResult(format, "Clash / Mihomo YAML", "yaml", content, nodes.length, 0, []);
  }

  if (format === "clash-provider-yaml") {
    const content = stringify({ proxies: nodes.map((node) => toClashProxy(node)) }, { indent: 2, lineWidth: 0 });
    return baseResult(format, "Clash Verge / OpenClash Provider", "yaml", content, nodes.length, 0, []);
  }

  const serialized = nodes.map((node) => serializeShareLink(node));
  const links = serialized.filter((item): item is string => Boolean(item));
  const skippedCount = nodes.length - links.length;
  const plainContent = links.join("\n");
  const content = format === "share-links-base64" ? encodeBase64(plainContent) : plainContent;
  const findings = skippedCount > 0
    ? [
        {
          id: "node-subscription-export-skipped",
          severity: "warning",
          title: "部分节点未转换",
          message: `有 ${skippedCount} 个节点缺少协议必需字段或协议暂不支持分享链接导出，已跳过。`,
          path: "/proxies",
        } satisfies Finding,
      ]
    : [];

  return baseResult(
    format,
    format === "share-links-base64" ? "V2Ray / Hiddify Base64 订阅" : "V2Ray / Hiddify 分享链接",
    "txt",
    content,
    links.length,
    skippedCount,
    findings,
  );
}

function serializeShareLink(node: ProxyNode): string | undefined {
  const proxy = toClashProxy(node);
  const type = readString(proxy.type)?.toLowerCase();

  if (type === "vmess") return serializeVmess(proxy);
  if (type === "trojan") return serializeTrojan(proxy);
  if (type === "ss") return serializeShadowsocks(proxy);
  if (type === "vless") return serializeVless(proxy);
  if (type === "hysteria2" || type === "hy2") return serializeHysteria2(proxy);
  if (type === "tuic") return serializeTuic(proxy);
  return undefined;
}

function serializeVmess(proxy: Record<string, unknown>): string | undefined {
  const server = readString(proxy.server);
  const port = readNumber(proxy.port);
  const uuid = readString(proxy.uuid);
  if (!server || !port || !uuid) return undefined;

  const network = readString(proxy.network);
  const wsOptions = isRecord(proxy["ws-opts"]) ? proxy["ws-opts"] : undefined;
  const wsHeaders = wsOptions && isRecord(wsOptions.headers) ? wsOptions.headers : undefined;
  const payload = {
    v: "2",
    ps: readString(proxy.name) ?? "vmess",
    add: server,
    port: String(port),
    id: uuid,
    aid: String(readNumber(proxy.alterId) ?? 0),
    scy: readString(proxy.cipher) ?? "auto",
    net: network ?? "tcp",
    type: readString(proxy["http-opts"]) ? "http" : "none",
    host: readString(wsHeaders?.Host) ?? readString(wsHeaders?.host) ?? "",
    path: readString(wsOptions?.path) ?? "",
    tls: isTlsEnabled(proxy) ? "tls" : "",
    sni: readString(proxy.servername) ?? readString(proxy.sni) ?? "",
  };

  return `vmess://${encodeBase64(JSON.stringify(payload)).replace(/=+$/g, "")}`;
}

function serializeTrojan(proxy: Record<string, unknown>): string | undefined {
  const server = readString(proxy.server);
  const port = readNumber(proxy.port);
  const password = readString(proxy.password);
  if (!server || !port || !password) return undefined;

  const params = new URLSearchParams();
  applySniParam(params, proxy);
  applyTransportParams(params, proxy);
  applyInsecureParam(params, proxy);
  return buildUrlLikeLink("trojan", `${encodeURIComponent(password)}@${server}:${port}`, params, readString(proxy.name));
}

function serializeShadowsocks(proxy: Record<string, unknown>): string | undefined {
  const server = readString(proxy.server);
  const port = readNumber(proxy.port);
  const cipher = readString(proxy.cipher);
  const password = readString(proxy.password);
  if (!server || !port || !cipher || !password) return undefined;

  const credentials = encodeBase64Url(`${cipher}:${password}`);
  return `ss://${credentials}@${server}:${port}${nameHash(readString(proxy.name))}`;
}

function serializeVless(proxy: Record<string, unknown>): string | undefined {
  const server = readString(proxy.server);
  const port = readNumber(proxy.port);
  const uuid = readString(proxy.uuid);
  if (!server || !port || !uuid) return undefined;

  const params = new URLSearchParams();
  params.set("encryption", readString(proxy.encryption) ?? "none");
  if (isTlsEnabled(proxy)) params.set("security", readString(proxy.reality) ? "reality" : "tls");
  if (readString(proxy.flow)) params.set("flow", readString(proxy.flow)!);
  if (readString(proxy["client-fingerprint"])) params.set("fp", readString(proxy["client-fingerprint"])!);
  applySniParam(params, proxy);
  applyTransportParams(params, proxy);
  applyRealityParams(params, proxy);
  return buildUrlLikeLink("vless", `${encodeURIComponent(uuid)}@${server}:${port}`, params, readString(proxy.name));
}

function serializeHysteria2(proxy: Record<string, unknown>): string | undefined {
  const server = readString(proxy.server);
  const port = readNumber(proxy.port);
  const password = readString(proxy.password);
  if (!server || !port || !password) return undefined;

  const params = new URLSearchParams();
  applySniParam(params, proxy);
  applyInsecureParam(params, proxy);
  for (const key of ["up", "down", "obfs", "obfs-password", "fingerprint"]) {
    if (readString(proxy[key])) params.set(key, readString(proxy[key])!);
  }
  const alpn = readStringList(proxy.alpn);
  if (alpn.length > 0) params.set("alpn", alpn.join(","));
  return buildUrlLikeLink("hysteria2", `${encodeURIComponent(password)}@${server}:${port}`, params, readString(proxy.name));
}

function serializeTuic(proxy: Record<string, unknown>): string | undefined {
  const server = readString(proxy.server);
  const port = readNumber(proxy.port);
  const uuid = readString(proxy.uuid);
  const password = readString(proxy.password) ?? readString(proxy.token);
  if (!server || !port || !uuid || !password) return undefined;

  const params = new URLSearchParams();
  applySniParam(params, proxy);
  applyInsecureParam(params, proxy);
  for (const key of ["congestion-controller", "udp-relay-mode", "ip"]) {
    if (readString(proxy[key])) params.set(key, readString(proxy[key])!);
  }
  const alpn = readStringList(proxy.alpn);
  if (alpn.length > 0) params.set("alpn", alpn.join(","));
  return buildUrlLikeLink("tuic", `${encodeURIComponent(uuid)}:${encodeURIComponent(password)}@${server}:${port}`, params, readString(proxy.name));
}

function applySniParam(params: URLSearchParams, proxy: Record<string, unknown>) {
  const sni = readString(proxy.sni) ?? readString(proxy.servername);
  if (sni) params.set("sni", sni);
}

function applyTransportParams(params: URLSearchParams, proxy: Record<string, unknown>) {
  const network = readString(proxy.network);
  if (!network) return;

  params.set("type", network);
  if (network === "ws" && isRecord(proxy["ws-opts"])) {
    const options = proxy["ws-opts"];
    const headers = isRecord(options.headers) ? options.headers : undefined;
    if (readString(options.path)) params.set("path", readString(options.path)!);
    if (readString(headers?.Host) ?? readString(headers?.host)) {
      params.set("host", readString(headers?.Host) ?? readString(headers?.host) ?? "");
    }
  }
  if (network === "grpc" && isRecord(proxy["grpc-opts"]) && readString(proxy["grpc-opts"]["grpc-service-name"])) {
    params.set("serviceName", readString(proxy["grpc-opts"]["grpc-service-name"])!);
  }
}

function applyRealityParams(params: URLSearchParams, proxy: Record<string, unknown>) {
  const realityOptions = isRecord(proxy["reality-opts"]) ? proxy["reality-opts"] : undefined;
  if (!realityOptions) return;
  if (readString(realityOptions["public-key"])) params.set("pbk", readString(realityOptions["public-key"])!);
  if (readString(realityOptions["short-id"])) params.set("sid", readString(realityOptions["short-id"])!);
}

function applyInsecureParam(params: URLSearchParams, proxy: Record<string, unknown>) {
  if (readBoolean(proxy["skip-cert-verify"])) params.set("allowInsecure", "1");
}

function buildUrlLikeLink(protocol: string, authority: string, params: URLSearchParams, name?: string): string {
  const query = params.toString();
  return `${protocol}://${authority}${query ? `?${query}` : ""}${nameHash(name)}`;
}

function nameHash(name?: string): string {
  return name ? `#${encodeURIComponent(name)}` : "";
}

function isTlsEnabled(proxy: Record<string, unknown>): boolean {
  const tls = proxy.tls;
  return tls === true || tls === "true" || tls === "tls" || readString(proxy.servername) !== undefined || readString(proxy.sni) !== undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(readString).filter((item): item is string => Boolean(item));
  const single = readString(value);
  return single ? [single] : [];
}

function encodeBase64(value: string): string {
  const maybeBuffer = (globalThis as unknown as { Buffer?: { from(input: string, encoding: "utf8"): { toString(encoding: "base64"): string } } }).Buffer;
  if (maybeBuffer) return maybeBuffer.from(value, "utf8").toString("base64");

  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function encodeBase64Url(value: string): string {
  return encodeBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function baseResult(
  format: NodeSubscriptionExportFormat,
  label: string,
  extension: string,
  content: string,
  exportedCount: number,
  skippedCount: number,
  findings: Finding[],
): NodeSubscriptionExportResult {
  return {
    format,
    label,
    mimeType: extension === "yaml" ? "application/yaml" : "text/plain",
    extension,
    content,
    exportedCount,
    skippedCount,
    findings,
  };
}

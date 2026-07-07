import { parseSubscriptionText } from "./subscriptionParser";
import type { SubscriptionParseResult } from "../../types/domain";

export interface SubscriptionRefreshInput {
  url: string;
  name?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  nativeFetchImpl?: SubscriptionNativeFetch;
  nativeProfiles?: string[];
}

export interface SubscriptionRefreshResult {
  name: string;
  redactedUrl: string;
  content: string;
  parsed: SubscriptionParseResult;
  status: number;
  bytes: number;
  updatedAt: string;
  contentType?: string;
  requestProfile?: string;
  requestProfileLabel?: string;
}

export interface SubscriptionNativeFetchInput {
  url: string;
  profile: string;
  timeoutMs?: number;
}

export interface SubscriptionNativeFetchResult {
  content: string;
  status: number;
  bytes: number;
  contentType?: string;
  trafficHeader?: string;
  profile: string;
  profileLabel: string;
}

export type SubscriptionNativeFetch = (input: SubscriptionNativeFetchInput) => Promise<SubscriptionNativeFetchResult>;

type SubscriptionTraffic = NonNullable<SubscriptionParseResult["traffic"]>;
const DEFAULT_NATIVE_PROFILES = ["mihomo", "clash-meta", "clash-verge", "cfw", "browser", "curl"];

export async function refreshSubscriptionUrl(input: SubscriptionRefreshInput): Promise<SubscriptionRefreshResult> {
  const url = parseAllowedSubscriptionUrl(input.url);
  const redactedUrl = redactSubscriptionUrl(url.toString());
  const name = input.name?.trim() || url.hostname || "远程订阅";
  const nativeResult = input.nativeFetchImpl ? await tryNativeSubscriptionProfiles(input, url.toString(), name, redactedUrl) : undefined;
  if (nativeResult && !hasSubscriptionParseError(nativeResult.parsed)) {
    return nativeResult;
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), input.timeoutMs ?? 20000);
  const requestFetch = input.fetchImpl ?? fetch;

  try {
    const response = await requestFetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "text/yaml, application/yaml, application/x-yaml, text/plain, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`订阅刷新失败：HTTP ${response.status}`);
    }

    const content = await response.text();
    const traffic = parseSubscriptionTrafficHeader(response.headers.get("subscription-userinfo")) ?? extractTrafficInfoFromText(content);
    const parsed = parseSubscriptionText(content, name);

    const fetchResult: SubscriptionRefreshResult = {
      name,
      redactedUrl,
      content,
      parsed: traffic ? { ...parsed, traffic } : parsed,
      status: response.status,
      bytes: new TextEncoder().encode(content).byteLength,
      updatedAt: new Date().toISOString(),
      contentType: response.headers.get("content-type") ?? undefined,
      requestProfile: "browser-fetch",
      requestProfileLabel: "浏览器 fetch",
    };
    return fetchResult;
  } catch (error) {
    if (nativeResult) return nativeResult;
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function tryNativeSubscriptionProfiles(
  input: SubscriptionRefreshInput,
  url: string,
  name: string,
  redactedUrl: string,
): Promise<SubscriptionRefreshResult | undefined> {
  const profiles = input.nativeProfiles?.length ? input.nativeProfiles : DEFAULT_NATIVE_PROFILES;
  const parseErrorResults: SubscriptionRefreshResult[] = [];

  for (const profile of profiles) {
    try {
      const response = await input.nativeFetchImpl!({
        url,
        profile,
        timeoutMs: input.timeoutMs,
      });
      const traffic =
        parseSubscriptionTrafficHeader(response.trafficHeader) ??
        parseSubscriptionTrafficHeader(response.content.match(/subscription-userinfo\s*[:=]\s*(.+)$/im)?.[1]) ??
        extractTrafficInfoFromText(response.content);
      const parsed = parseSubscriptionText(response.content, name);
      const result: SubscriptionRefreshResult = {
        name,
        redactedUrl,
        content: response.content,
        parsed: traffic ? { ...parsed, traffic } : parsed,
        status: response.status,
        bytes: response.bytes,
        updatedAt: new Date().toISOString(),
        contentType: response.contentType,
        requestProfile: response.profile,
        requestProfileLabel: response.profileLabel,
      };

      if (!parsed.findings.some((finding) => finding.severity === "error")) {
        return result;
      }
      parseErrorResults.push(result);
    } catch (error) {
      void error;
    }
  }

  if (parseErrorResults.length > 0) {
    return parseErrorResults[0];
  }

  return undefined;
}

function hasSubscriptionParseError(parsed: SubscriptionParseResult): boolean {
  return parsed.findings.some((finding) => finding.severity === "error");
}

export function parseAllowedSubscriptionUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("订阅 URL 不能为空。");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("订阅 URL 格式不正确。");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("订阅刷新只允许 http 或 https URL。");
  }

  return url;
}

export function redactSubscriptionUrl(rawUrl: string): string {
  const url = parseAllowedSubscriptionUrl(rawUrl);
  const redacted = `${url.protocol}//${url.host}/...`;
  if (url.searchParams.size === 0) {
    return redacted;
  }

  const params = Array.from(url.searchParams.keys())
    .sort()
    .map((key) => `${key}=<redacted>`);
  return `${redacted}?${params.join("&")}`;
}

export function sanitizeSubscriptionError(error: unknown, rawUrl: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return raw.trim() || "订阅请求失败。";
  }

  let sanitized = raw.replaceAll(trimmedUrl, "[订阅 URL 已隐藏]");
  try {
    const url = parseAllowedSubscriptionUrl(trimmedUrl);
    const redactedUrl = redactSubscriptionUrl(url.toString());
    sanitized = sanitized.replaceAll(url.toString(), redactedUrl);
    sanitized = sanitized.replace(buildSameOriginUrlPattern(url), redactedUrl);

    const originWithCredentials = buildOriginWithCredentials(url);
    if (originWithCredentials) {
      sanitized = sanitized.replaceAll(originWithCredentials, `${url.protocol}//${url.host}`);
    }
    if (url.search) sanitized = sanitized.replaceAll(url.search, "?<redacted>");
    if (url.pathname && url.pathname !== "/") sanitized = sanitized.replaceAll(url.pathname, "/...");
    if (url.username) sanitized = sanitized.replaceAll(url.username, "<redacted>");
    if (url.password) sanitized = sanitized.replaceAll(url.password, "<redacted>");
  } catch {
    // URL validation errors should still surface, but never block basic raw-string redaction.
  }

  return sanitized.trim() || "订阅请求失败。";
}

function buildOriginWithCredentials(url: URL): string | undefined {
  if (!url.username && !url.password) return undefined;

  const auth = url.password ? `${url.username}:${url.password}` : url.username;
  return `${url.protocol}//${auth}@${url.host}`;
}

function buildSameOriginUrlPattern(url: URL): RegExp {
  const protocol = escapeRegExp(`${url.protocol}//`);
  const host = escapeRegExp(url.host);
  return new RegExp(`${protocol}(?:[^\\s/@]+@)?${host}[^\\s]*`, "g");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseSubscriptionTrafficHeader(value: string | null | undefined): SubscriptionTraffic | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const traffic: SubscriptionTraffic = {};
  for (const part of value.split(/[;,&]/)) {
    const [rawKey, rawValue] = part.split("=").map((item) => item?.trim());
    if (!rawKey || !rawValue) {
      continue;
    }

    const numberValue = Number(rawValue);
    if (!Number.isFinite(numberValue) || numberValue < 0) {
      continue;
    }

    if (rawKey === "upload") traffic.upload = numberValue;
    if (rawKey === "download") traffic.download = numberValue;
    if (rawKey === "total") traffic.total = numberValue;
    if (rawKey === "expire") traffic.expire = numberValue;
  }

  return Object.keys(traffic).length > 0 ? traffic : undefined;
}

function extractTrafficInfoFromText(content: string): SubscriptionTraffic | undefined {
  const lines = content.split(/\r?\n/).slice(0, 30);
  for (const line of lines) {
    const explicit = line.match(/subscription-userinfo\s*[:=]\s*(.+)$/i);
    if (explicit) {
      const parsed = parseSubscriptionTrafficHeader(explicit[1]);
      if (parsed) return parsed;
    }

    if (line.includes("upload=") && line.includes("download=")) {
      const parsed = parseSubscriptionTrafficHeader(line.replace(/^#\s*/, ""));
      if (parsed) return parsed;
    }
  }

  return undefined;
}

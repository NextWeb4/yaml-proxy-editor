import type { Finding, ProxyNode } from "../../types/domain";
import { isRecord } from "../clash/clashService";
import { DEFAULT_DOWNLOAD_TEST_BYTES } from "./speedtestDefaults";
import type { SpeedtestMode, SpeedtestQueueItem, SpeedtestSample } from "./speedtestPlanner";

export interface SpeedtestControllerConfig {
  controllerUrl?: string;
  secret?: string;
  findings: Finding[];
}

export interface SpeedtestAuditLog {
  id: string;
  nodeName: string;
  mode: SpeedtestMode;
  target: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "ok" | "error" | "cancelled";
  message: string;
}

export interface SpeedtestRunOptions {
  controllerUrl?: string;
  secret?: string;
  latencyTestUrl?: string;
  downloadTestUrl?: string;
  timeoutMs?: number;
  maxDownloadBytes?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  signal?: AbortSignal;
  onQueueChange?: (queue: SpeedtestQueueItem[]) => void;
}

export interface SpeedtestRunResult {
  queue: SpeedtestQueueItem[];
  samples: SpeedtestSample[];
  logs: SpeedtestAuditLog[];
}

const CONTROLLER_MODES = new Set<SpeedtestMode>(["latency", "availability", "stability"]);
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_DOWNLOAD_BYTES = DEFAULT_DOWNLOAD_TEST_BYTES;

export function inferSpeedtestControllerConfig(value: unknown): SpeedtestControllerConfig {
  if (!isRecord(value)) return { findings: [], controllerUrl: undefined, secret: undefined };

  const findings: Finding[] = [];
  const rawController = typeof value["external-controller"] === "string" ? value["external-controller"].trim() : "";
  let controllerUrl: string | undefined;
  if (rawController) {
    try {
      controllerUrl = parseLocalControllerUrl(rawController);
    } catch (error) {
      findings.push({
        id: "speedtest-controller-invalid",
        severity: "warning",
        title: "测速控制器地址未启用",
        message: error instanceof Error ? error.message : "external-controller 无法用于测速。",
        path: "/external-controller",
        suggestion: "将 external-controller 配置为本机回环地址，例如 127.0.0.1:9090。",
      });
    }
  }

  return {
    controllerUrl,
    secret: typeof value.secret === "string" ? value.secret : undefined,
    findings,
  };
}

export function parseLocalControllerUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error("external-controller 为空。");
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withProtocol);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("测速控制器只允许 http 或 https。");
  }

  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1";
  if (url.hostname === "[::]") url.hostname = "[::1]";

  const host = url.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error("测速控制器必须是本机回环地址，避免自动访问未知主机。");
  }

  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function parseAllowedSpeedtestUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error("测速 URL 不能为空。");
  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("测速 URL 只允许 http 或 https。");
  }
  return url;
}

export function redactSpeedtestUrl(rawUrl: string): string {
  const url = parseAllowedSpeedtestUrl(rawUrl);
  const params = Array.from(url.searchParams.keys())
    .sort()
    .map((key) => `${key}=<redacted>`);
  return params.length > 0 ? `${url.protocol}//${url.host}/...?${params.join("&")}` : `${url.protocol}//${url.host}/...`;
}

export async function runSpeedtestQueue(
  nodes: ProxyNode[],
  queue: SpeedtestQueueItem[],
  options: SpeedtestRunOptions = {},
): Promise<SpeedtestRunResult> {
  const requestFetch = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let currentQueue = queue.map((item) => ({ ...item }));
  const samples: SpeedtestSample[] = [];
  const logs: SpeedtestAuditLog[] = [];

  if (typeof requestFetch !== "function") {
    currentQueue = currentQueue.map((item) => (item.status === "pending" ? { ...item, status: "failed" } : item));
    options.onQueueChange?.(currentQueue);
    return { queue: currentQueue, samples, logs };
  }

  const nodesByName = new Map(nodes.map((node) => [node.name, node]));

  for (const item of currentQueue) {
    if (options.signal?.aborted) {
      currentQueue = updateQueueItem(currentQueue, item.id, "cancelled");
      options.onQueueChange?.(currentQueue);
      continue;
    }

    if (item.status !== "pending") continue;
    const node = nodesByName.get(item.nodeName);
    if (!node) {
      currentQueue = updateQueueItem(currentQueue, item.id, "failed");
      options.onQueueChange?.(currentQueue);
      continue;
    }

    currentQueue = updateQueueItem(currentQueue, item.id, "running");
    options.onQueueChange?.(currentQueue);

    const result = await runQueueItem(node, item.mode, requestFetch, timeoutMs, options);
    samples.push(...result.samples);
    logs.push(...result.logs);
    currentQueue = updateQueueItem(currentQueue, item.id, result.cancelled ? "cancelled" : result.success ? "completed" : "failed");
    options.onQueueChange?.(currentQueue);
  }

  return { queue: currentQueue, samples, logs };
}

async function runQueueItem(
  node: ProxyNode,
  mode: SpeedtestMode,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  options: SpeedtestRunOptions,
): Promise<{ success: boolean; cancelled: boolean; samples: SpeedtestSample[]; logs: SpeedtestAuditLog[] }> {
  if (mode === "download") {
    return runDownloadProbe(node.name, fetchImpl, timeoutMs, options);
  }

  if (CONTROLLER_MODES.has(mode)) {
    return runControllerProbe(node.name, mode, fetchImpl, timeoutMs, options);
  }

  return { success: false, cancelled: false, samples: [], logs: [] };
}

async function runControllerProbe(
  nodeName: string,
  mode: SpeedtestMode,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  options: SpeedtestRunOptions,
): Promise<{ success: boolean; cancelled: boolean; samples: SpeedtestSample[]; logs: SpeedtestAuditLog[] }> {
  const attempts = mode === "stability" ? 3 : 1;
  const samples: SpeedtestSample[] = [];
  const logs: SpeedtestAuditLog[] = [];
  let cancelled = false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const startedAt = currentIso(options);
    const startedMs = nowMs();
    try {
      const delay = await measureControllerDelay(nodeName, fetchImpl, timeoutMs, options);
      samples.push({ nodeName, latencyMs: delay, success: true, testedAt: currentIso(options) });
      logs.push({
        id: `${mode}:${nodeName}:${attempt}`,
        nodeName,
        mode,
        target: safeControllerTarget(options.controllerUrl),
        startedAt,
        endedAt: currentIso(options),
        durationMs: elapsedMs(startedMs),
        status: "ok",
        message: `delay=${delay}ms`,
      });
    } catch (error) {
      const isCancel = isAbortError(error) || options.signal?.aborted === true;
      cancelled = cancelled || isCancel;
      samples.push({ nodeName, success: false, testedAt: currentIso(options) });
      logs.push({
        id: `${mode}:${nodeName}:${attempt}`,
        nodeName,
        mode,
        target: safeControllerTarget(options.controllerUrl),
        startedAt,
        endedAt: currentIso(options),
        durationMs: elapsedMs(startedMs),
        status: isCancel ? "cancelled" : "error",
        message: sanitizeSpeedtestError(error, [options.controllerUrl, options.latencyTestUrl]),
      });
      if (isCancel) break;
    }
  }

  return { success: samples.some((sample) => sample.success), cancelled, samples, logs };
}

async function runDownloadProbe(
  nodeName: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  options: SpeedtestRunOptions,
): Promise<{ success: boolean; cancelled: boolean; samples: SpeedtestSample[]; logs: SpeedtestAuditLog[] }> {
  const startedAt = currentIso(options);
  const startedMs = nowMs();
  const target = options.downloadTestUrl?.trim() || "";
  try {
    const speed = await measureDownloadSpeed(fetchImpl, timeoutMs, options);
    const endedAt = currentIso(options);
    return {
      success: true,
      cancelled: false,
      samples: [{ nodeName, downloadMbps: speed, success: true, testedAt: endedAt }],
      logs: [
        {
          id: `download:${nodeName}`,
          nodeName,
          mode: "download",
          target: redactSpeedtestUrl(target),
          startedAt,
          endedAt,
          durationMs: elapsedMs(startedMs),
          status: "ok",
          message: `download=${speed}MB/s`,
        },
      ],
    };
  } catch (error) {
    const isCancel = isAbortError(error) || options.signal?.aborted === true;
    const endedAt = currentIso(options);
    return {
      success: false,
      cancelled: isCancel,
      samples: [{ nodeName, success: false, testedAt: endedAt }],
      logs: [
        {
          id: `download:${nodeName}`,
          nodeName,
          mode: "download",
          target: target ? safeRedactedUrl(target) : "未配置",
          startedAt,
          endedAt,
          durationMs: elapsedMs(startedMs),
          status: isCancel ? "cancelled" : "error",
          message: sanitizeSpeedtestError(error, [target]),
        },
      ],
    };
  }
}

async function measureControllerDelay(
  nodeName: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  options: SpeedtestRunOptions,
): Promise<number> {
  const controllerUrl = parseLocalControllerUrl(options.controllerUrl ?? "");
  const testUrl = parseAllowedSpeedtestUrl(options.latencyTestUrl ?? "");
  const requestUrl = new URL(`/proxies/${encodeURIComponent(nodeName)}/delay`, `${controllerUrl}/`);
  requestUrl.searchParams.set("timeout", String(timeoutMs));
  requestUrl.searchParams.set("url", testUrl.toString());

  let response: Response;
  try {
    response = await fetchWithTimeout(fetchImpl, requestUrl.toString(), timeoutMs + 1000, options.signal, {
      method: "GET",
      cache: "no-store",
      headers: speedtestHeaders(options.secret),
    });
  } catch (error) {
    throw new Error(sanitizeSpeedtestError(error, [requestUrl.toString(), testUrl.toString(), controllerUrl]));
  }
  if (!response.ok) throw new Error(`控制器返回 HTTP ${response.status}。`);

  const payload = (await response.json()) as unknown;
  const delay = isRecord(payload) ? Number(payload.delay) : Number.NaN;
  if (!Number.isFinite(delay) || delay < 0) throw new Error("控制器响应中没有有效 delay。");
  return Math.round(delay);
}

async function measureDownloadSpeed(fetchImpl: typeof fetch, timeoutMs: number, options: SpeedtestRunOptions): Promise<number> {
  const url = parseAllowedSpeedtestUrl(options.downloadTestUrl ?? "");
  const startedAt = nowMs();
  const controller = createTimeoutController(timeoutMs, options.signal);

  try {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers: { accept: "*/*" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`测速 URL 返回 HTTP ${response.status}。`);

    const bytes = await readBytes(response, options.maxDownloadBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES, controller.signal);
    const seconds = Math.max(0.001, elapsedMs(startedAt) / 1000);
    return Math.round((bytes / 1024 / 1024 / seconds) * 10) / 10;
  } finally {
    controller.dispose();
  }
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  init: RequestInit,
): Promise<Response> {
  const controller = createTimeoutController(timeoutMs, signal);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    controller.dispose();
  }
}

function createTimeoutController(timeoutMs: number, signal: AbortSignal | undefined): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    dispose: () => {
      signal?.removeEventListener("abort", onAbort);
      globalThis.clearTimeout(timeout);
    },
  };
}

async function readBytes(response: Response, maxBytes: number, signal: AbortSignal): Promise<number> {
  const reader = response.body?.getReader();
  if (!reader) {
    throwIfAborted(signal);
    const buffer = await response.arrayBuffer();
    throwIfAborted(signal);
    return buffer.byteLength;
  }

  let total = 0;
  while (total < maxBytes) {
    throwIfAborted(signal);
    const chunk = await readStreamChunk(reader, signal);
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return total;
}

async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) {
    await reader.cancel().catch(() => undefined);
    throwAbortError();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reader.cancel().catch(() => undefined);
      reject(createAbortError());
    };

    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (chunk) => {
        cleanup();
        resolve(chunk);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throwAbortError();
}

function throwAbortError(): never {
  throw createAbortError();
}

function createAbortError(): Error {
  const error = new Error("请求已取消或超时。");
  error.name = "AbortError";
  return error;
}

function speedtestHeaders(secret: string | undefined): HeadersInit {
  const headers: Record<string, string> = { accept: "application/json" };
  if (secret) headers.authorization = `Bearer ${secret}`;
  return headers;
}

function updateQueueItem(queue: SpeedtestQueueItem[], id: string, status: SpeedtestQueueItem["status"]): SpeedtestQueueItem[] {
  return queue.map((item) => (item.id === id ? { ...item, status } : item));
}

function currentIso(options: Pick<SpeedtestRunOptions, "now">): string {
  return (options.now?.() ?? new Date()).toISOString();
}

function safeControllerTarget(controllerUrl: string | undefined): string {
  if (!controllerUrl) return "未配置";
  try {
    return parseLocalControllerUrl(controllerUrl);
  } catch {
    return "无效控制器";
  }
}

function safeRedactedUrl(rawUrl: string): string {
  try {
    return redactSpeedtestUrl(rawUrl);
  } catch {
    return "无效 URL";
  }
}

function sanitizeSpeedtestError(error: unknown, sensitiveUrls: Array<string | undefined> = []): string {
  if (isAbortError(error)) return "请求已取消或超时。";
  let message = error instanceof Error ? error.message : String(error);
  for (const rawUrl of sensitiveUrls) {
    message = sanitizeUrlFromSpeedtestMessage(message, rawUrl);
  }
  return message.trim() || "测速请求失败。";
}

function sanitizeUrlFromSpeedtestMessage(message: string, rawUrl: string | undefined): string {
  if (!rawUrl?.trim()) return message;

  let sanitized = message;
  try {
    const url = parseAllowedSpeedtestUrl(rawUrl);
    const redactedUrl = redactSpeedtestUrl(url.toString());
    sanitized = sanitized.replaceAll(rawUrl.trim(), redactedUrl);
    sanitized = sanitized.replaceAll(url.toString(), redactedUrl);
    sanitized = sanitized.replace(buildSameOriginUrlPattern(url), redactedUrl);
    if (url.search) sanitized = sanitized.replaceAll(url.search, "?<redacted>");
    if (url.pathname && url.pathname !== "/") sanitized = sanitized.replaceAll(url.pathname, "/...");
    for (const [key, value] of url.searchParams.entries()) {
      sanitized = sanitized.replaceAll(`${key}=${value}`, `${key}=<redacted>`);
      sanitized = sanitized.replaceAll(encodeURIComponent(`${key}=${value}`), `${key}%3D<redacted>`);
    }
  } catch {
    sanitized = sanitized.replaceAll(rawUrl.trim(), "[测速 URL 已隐藏]");
    try {
      const controllerUrl = parseLocalControllerUrl(rawUrl);
      sanitized = sanitized.replaceAll(controllerUrl, controllerUrl);
    } catch {
      // Invalid URLs are reported as validation errors elsewhere; keep the original message.
    }
  }

  return sanitized;
}

function buildSameOriginUrlPattern(url: URL): RegExp {
  const protocol = escapeRegExp(`${url.protocol}//`);
  const host = escapeRegExp(url.host);
  return new RegExp(`${protocol}(?:[^\\s/@]+@)?${host}[^\\s]*`, "g");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && String((error as { name?: unknown }).name) === "AbortError";
}

function nowMs(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(nowMs() - startedAt));
}

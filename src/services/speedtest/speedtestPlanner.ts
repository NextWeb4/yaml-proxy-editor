import type { ProxyNode } from "../../types/domain";

export const SPEEDTEST_MODES = ["latency", "download", "availability", "stability"] as const;

export type SpeedtestMode = (typeof SPEEDTEST_MODES)[number];
export type SpeedtestStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type SpeedtestRecommendation = "低延迟" | "高速节点" | "稳定节点" | "备用节点" | "待测试";

export interface SpeedtestQueueItem {
  id: string;
  nodeName: string;
  nodeType: string;
  mode: SpeedtestMode;
  status: SpeedtestStatus;
  createdAt: string;
}

export interface SpeedtestSample {
  nodeName: string;
  latencyMs?: number;
  downloadMbps?: number;
  success: boolean;
  testedAt: string;
}

export interface SpeedtestNodeResult {
  nodeName: string;
  latencyMs?: number;
  downloadMbps?: number;
  successRate: number;
  failCount: number;
  jitterMs?: number;
  stabilityScore: number;
  score: number;
  recommendation: SpeedtestRecommendation;
  lastTestedAt?: string;
}

export interface SpeedtestQueueSummary {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export function createSpeedtestQueue(
  nodes: ProxyNode[],
  modes: SpeedtestMode[],
  now = new Date().toISOString(),
): SpeedtestQueueItem[] {
  const uniqueNodes = uniqueByName(nodes).filter((node) => node.name.trim());
  const selectedModes: SpeedtestMode[] = modes.length > 0 ? modes : ["latency"];

  return uniqueNodes.flatMap((node) =>
    selectedModes.map((mode) => ({
      id: `${mode}:${node.name}`,
      nodeName: node.name,
      nodeType: node.type,
      mode,
      status: "pending" as const,
      createdAt: now,
    })),
  );
}

export function cancelSpeedtestQueue(queue: SpeedtestQueueItem[], ids?: string[]): SpeedtestQueueItem[] {
  const cancelledIds = ids ? new Set(ids) : undefined;

  return queue.map((item) => {
    const shouldCancel = cancelledIds ? cancelledIds.has(item.id) : item.status === "pending" || item.status === "running";
    if (!shouldCancel || item.status === "completed" || item.status === "failed") return item;
    return { ...item, status: "cancelled" };
  });
}

export function summarizeSpeedtestQueue(queue: SpeedtestQueueItem[]): SpeedtestQueueSummary {
  return {
    total: queue.length,
    pending: queue.filter((item) => item.status === "pending").length,
    running: queue.filter((item) => item.status === "running").length,
    completed: queue.filter((item) => item.status === "completed").length,
    failed: queue.filter((item) => item.status === "failed").length,
    cancelled: queue.filter((item) => item.status === "cancelled").length,
  };
}

export function buildSpeedtestResults(nodes: ProxyNode[], samples: SpeedtestSample[]): SpeedtestNodeResult[] {
  const samplesByNode = new Map<string, SpeedtestSample[]>();
  for (const sample of samples) {
    samplesByNode.set(sample.nodeName, [...(samplesByNode.get(sample.nodeName) ?? []), sample]);
  }

  return uniqueByName(nodes).map((node) => {
    const nodeSamples = samplesByNode.get(node.name) ?? [];
    if (nodeSamples.length === 0) {
      return {
        nodeName: node.name,
        successRate: 0,
        failCount: 0,
        stabilityScore: 0,
        score: 0,
        recommendation: "待测试",
      };
    }

    const successSamples = nodeSamples.filter((sample) => sample.success);
    const failCount = nodeSamples.length - successSamples.length;
    const successRate = Math.round((successSamples.length / nodeSamples.length) * 100);
    const latencySamples = successSamples.map((sample) => sample.latencyMs).filter(isFiniteNumber);
    const downloadSamples = successSamples.map((sample) => sample.downloadMbps).filter(isFiniteNumber);
    const latencyMs = average(latencySamples);
    const downloadMbps = average(downloadSamples);
    const jitterMs = calculateJitter(latencySamples);
    const stabilityScore = calculateStabilityScore(successRate, jitterMs, failCount);
    const score = calculateCompositeScore({ latencyMs, downloadMbps, successRate, stabilityScore });

    return {
      nodeName: node.name,
      latencyMs,
      downloadMbps,
      successRate,
      failCount,
      jitterMs,
      stabilityScore,
      score,
      recommendation: recommendSpeedtestGroup({ latencyMs, downloadMbps, successRate, failCount, stabilityScore }),
      lastTestedAt: nodeSamples.at(-1)?.testedAt,
    };
  });
}

export function formatSpeedtestMode(mode: SpeedtestMode): string {
  const labels: Record<SpeedtestMode, string> = {
    latency: "延迟",
    download: "下载速度",
    availability: "可用性",
    stability: "稳定性",
  };
  return labels[mode];
}

function calculateStabilityScore(successRate: number, jitterMs: number | undefined, failCount: number): number {
  const jitterPenalty = jitterMs === undefined ? 0 : Math.min(35, jitterMs / 2);
  const failPenalty = Math.min(30, failCount * 10);
  return clamp(Math.round(successRate - jitterPenalty - failPenalty), 0, 100);
}

function calculateCompositeScore(input: {
  latencyMs?: number;
  downloadMbps?: number;
  successRate: number;
  stabilityScore: number;
}): number {
  const latencyScore = input.latencyMs === undefined ? 0 : clamp(100 - input.latencyMs / 3, 0, 100);
  const downloadScore = input.downloadMbps === undefined ? 0 : clamp(input.downloadMbps * 4, 0, 100);
  return Math.round(latencyScore * 0.3 + downloadScore * 0.25 + input.successRate * 0.2 + input.stabilityScore * 0.25);
}

function recommendSpeedtestGroup(input: {
  latencyMs?: number;
  downloadMbps?: number;
  successRate: number;
  failCount: number;
  stabilityScore: number;
}): SpeedtestRecommendation {
  if (input.successRate < 60 || input.failCount >= 3) return "备用节点";
  if ((input.downloadMbps ?? 0) >= 30 && input.successRate >= 80) return "高速节点";
  if ((input.latencyMs ?? Number.POSITIVE_INFINITY) <= 80 && input.stabilityScore >= 80) return "低延迟";
  if (input.stabilityScore >= 85) return "稳定节点";
  return "备用节点";
}

function uniqueByName(nodes: ProxyNode[]): ProxyNode[] {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    if (seen.has(node.name)) return false;
    seen.add(node.name);
    return true;
  });
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function calculateJitter(values: number[]): number | undefined {
  const mean = average(values);
  if (mean === undefined || values.length < 2) return undefined;
  const jitter = values.reduce((sum, value) => sum + Math.abs(value - mean), 0) / values.length;
  return Math.round(jitter * 10) / 10;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

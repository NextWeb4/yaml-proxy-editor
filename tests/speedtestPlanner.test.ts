import { describe, expect, it } from "vitest";
import type { ProxyNode } from "../src/types/domain";
import {
  buildSpeedtestResults,
  cancelSpeedtestQueue,
  createSpeedtestQueue,
  summarizeSpeedtestQueue,
} from "../src/services/speedtest/speedtestPlanner";

const nodes: ProxyNode[] = [
  { id: "local:香港 01:0", name: "香港 01", type: "ss", server: "hk.example.com", port: 443 },
  { id: "local:香港 01:1", name: "香港 01", type: "ss", server: "hk2.example.com", port: 443 },
  { id: "local:日本 01:2", name: "日本 01", type: "vmess", server: "jp.example.com", port: 443 },
];

describe("speedtestPlanner", () => {
  it("按节点和测速模式生成可取消队列，并按名称去重", () => {
    const queue = createSpeedtestQueue(nodes, ["latency", "download"], "2026-01-01T00:00:00.000Z");

    expect(queue).toHaveLength(4);
    expect(queue.map((item) => item.id)).toEqual([
      "latency:香港 01",
      "download:香港 01",
      "latency:日本 01",
      "download:日本 01",
    ]);
    expect(summarizeSpeedtestQueue(queue)).toMatchObject({ total: 4, pending: 4, cancelled: 0 });

    const cancelled = cancelSpeedtestQueue(queue);
    expect(summarizeSpeedtestQueue(cancelled)).toMatchObject({ total: 4, pending: 0, cancelled: 4 });
  });

  it("根据样本计算延迟、下载、成功率、稳定性和推荐分组", () => {
    const results = buildSpeedtestResults(nodes, [
      {
        nodeName: "香港 01",
        latencyMs: 42,
        downloadMbps: 36,
        success: true,
        testedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        nodeName: "香港 01",
        latencyMs: 54,
        downloadMbps: 42,
        success: true,
        testedAt: "2026-01-01T00:01:00.000Z",
      },
      {
        nodeName: "日本 01",
        success: false,
        testedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(results[0]).toMatchObject({
      nodeName: "香港 01",
      latencyMs: 48,
      downloadMbps: 39,
      successRate: 100,
      failCount: 0,
      recommendation: "高速节点",
    });
    expect(results[0].stabilityScore).toBeGreaterThan(90);
    expect(results[1]).toMatchObject({
      nodeName: "日本 01",
      successRate: 0,
      failCount: 1,
      recommendation: "备用节点",
    });
  });
});

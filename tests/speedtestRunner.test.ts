import { describe, expect, it, vi } from "vitest";
import type { ProxyNode } from "../src/types/domain";
import {
  inferSpeedtestControllerConfig,
  parseLocalControllerUrl,
  redactSpeedtestUrl,
  runSpeedtestQueue,
} from "../src/services/speedtest/speedtestRunner";
import type { SpeedtestQueueItem } from "../src/services/speedtest/speedtestPlanner";

const nodes: ProxyNode[] = [
  { id: "local:香港 01:0", name: "香港 01", type: "ss", server: "hk.example.com", port: 443 },
];

function queueItem(mode: SpeedtestQueueItem["mode"]): SpeedtestQueueItem {
  return {
    id: `${mode}:香港 01`,
    nodeName: "香港 01",
    nodeType: "ss",
    mode,
    status: "pending",
    createdAt: "2026-06-29T00:00:00.000Z",
  };
}

describe("speedtestRunner", () => {
  it("从 external-controller 推导本机 controller 地址并保留 secret", () => {
    const config = inferSpeedtestControllerConfig({
      "external-controller": "0.0.0.0:9090",
      secret: "local-secret",
    });

    expect(config.controllerUrl).toBe("http://127.0.0.1:9090");
    expect(config.secret).toBe("local-secret");
    expect(config.findings).toEqual([]);
    expect(parseLocalControllerUrl("http://localhost:9090")).toBe("http://localhost:9090");
  });

  it("拒绝非本机回环 controller，避免测速自动访问未知主机", async () => {
    const fetchImpl = vi.fn();
    const result = await runSpeedtestQueue(nodes, [queueItem("latency")], {
      controllerUrl: "https://controller.example.com:9090",
      latencyTestUrl: "https://probe.example.com/generate_204",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date("2026-06-29T00:00:00.000Z"),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.queue[0].status).toBe("failed");
    expect(result.samples[0]).toMatchObject({ nodeName: "香港 01", success: false });
    expect(result.logs[0].message).toContain("本机回环地址");
  });

  it("通过 Mihomo controller delay API 生成节点延迟样本并携带授权头", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ delay: 64 }), { status: 200 }));
    const queueChanges: SpeedtestQueueItem[][] = [];
    const result = await runSpeedtestQueue(nodes, [queueItem("latency")], {
      controllerUrl: "http://127.0.0.1:9090",
      secret: "local-secret",
      latencyTestUrl: "https://probe.example.com/generate_204?token=secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date("2026-06-29T00:00:00.000Z"),
      onQueueChange: (queue) => queueChanges.push(queue),
    });

    const [calledUrl, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(decodeURIComponent(new URL(String(calledUrl)).pathname)).toBe("/proxies/香港 01/delay");
    expect(new URL(String(calledUrl)).searchParams.get("timeout")).toBe("5000");
    expect(new URL(String(calledUrl)).searchParams.get("url")).toBe("https://probe.example.com/generate_204?token=secret");
    expect(init.headers).toMatchObject({ authorization: "Bearer local-secret" });
    expect(queueChanges.map((queue) => queue[0].status)).toEqual(["running", "completed"]);
    expect(result.samples[0]).toMatchObject({ nodeName: "香港 01", latencyMs: 64, success: true });
    expect(result.queue[0].status).toBe("completed");
  });

  it("下载测速只访问用户提供的 http/https URL，并在日志中脱敏", async () => {
    const bytes = new Uint8Array(1024 * 256);
    const fetchImpl = vi.fn(async () => new Response(bytes, { status: 200 }));
    const result = await runSpeedtestQueue(nodes, [queueItem("download")], {
      downloadTestUrl: "https://download.example.com/file.bin?token=secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date("2026-06-29T00:00:00.000Z"),
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://download.example.com/file.bin?token=secret",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
    expect(result.samples[0].downloadMbps).toBeGreaterThan(0);
    expect(result.queue[0].status).toBe("completed");
    expect(result.logs[0].target).toBe("https://download.example.com/...?token=<redacted>");
    expect(result.logs[0].target).not.toContain("secret");
    expect(redactSpeedtestUrl("https://download.example.com/file.bin?token=secret")).toBe(
      "https://download.example.com/...?token=<redacted>",
    );
  });

  it("下载测速响应体读取卡住时会按超时取消队列", async () => {
    const fetchImpl = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(1024));
        },
      });
      return new Response(stream, { status: 200 });
    });

    const result = await runSpeedtestQueue(nodes, [queueItem("download")], {
      downloadTestUrl: "https://download.example.com/slow.bin",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 10,
      now: () => new Date("2026-06-29T00:00:00.000Z"),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.queue[0].status).toBe("cancelled");
    expect(result.samples[0]).toMatchObject({ nodeName: "香港 01", success: false });
    expect(result.logs[0]).toMatchObject({ status: "cancelled", message: "请求已取消或超时。" });
  });

  it("下载测速失败日志不会泄漏 URL token、路径或查询值", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(
        "failed https://download.example.com/private/file.bin?token=secret&user=alice path=/private/file.bin query=?token=secret&user=alice",
      );
    });
    const result = await runSpeedtestQueue(nodes, [queueItem("download")], {
      downloadTestUrl: "https://download.example.com/private/file.bin?token=secret&user=alice",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date("2026-06-29T00:00:00.000Z"),
    });

    expect(result.queue[0].status).toBe("failed");
    expect(result.logs[0].message).toContain("https://download.example.com/...");
    expect(result.logs[0].message).not.toContain("secret");
    expect(result.logs[0].message).not.toContain("alice");
    expect(result.logs[0].message).not.toContain("/private/file.bin");
  });

  it("controller 失败日志不会泄漏嵌套测速 URL token", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      throw new Error(`controller fetch failed: ${String(url)}`);
    });
    const result = await runSpeedtestQueue(nodes, [queueItem("latency")], {
      controllerUrl: "http://127.0.0.1:9090",
      latencyTestUrl: "https://probe.example.com/generate_204?token=secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date("2026-06-29T00:00:00.000Z"),
    });

    expect(result.queue[0].status).toBe("failed");
    expect(result.logs[0].message).not.toContain("secret");
    expect(result.logs[0].message).not.toContain("generate_204");
    expect(result.logs[0].message).not.toContain("url=https%3A%2F%2Fprobe.example.com");
  });
});

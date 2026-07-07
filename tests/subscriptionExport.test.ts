import { parseDocument } from "yaml";
import { describe, expect, it } from "vitest";
import type { ProxyNode } from "../src/types/domain";
import { buildNodeSubscriptionExport } from "../src/services/subscription/subscriptionExport";

const demoNodes: ProxyNode[] = [
  {
    id: "demo:trojan:1",
    name: "Trojan HK",
    type: "trojan",
    server: "trojan.example.com",
    port: 443,
    raw: {
      name: "Trojan HK",
      type: "trojan",
      server: "trojan.example.com",
      port: 443,
      password: "secret",
      sni: "tls.example.com",
      network: "ws",
      "ws-opts": {
        path: "/ws",
        headers: { Host: "cdn.example.com" },
      },
    },
  },
  {
    id: "demo:vmess:1",
    name: "VMess HK",
    type: "vmess",
    server: "vmess.example.com",
    port: 443,
    raw: {
      name: "VMess HK",
      type: "vmess",
      server: "vmess.example.com",
      port: 443,
      uuid: "11111111-1111-1111-1111-111111111111",
      alterId: 0,
      cipher: "auto",
      tls: true,
      servername: "sni.example.com",
      network: "ws",
      "ws-opts": {
        path: "/vmess",
        headers: { Host: "cdn.example.com" },
      },
    },
  },
];

describe("subscriptionExport", () => {
  it("导出 Clash/Mihomo YAML 节点订阅", () => {
    const result = buildNodeSubscriptionExport(demoNodes, "clash-yaml");
    const parsed = parseDocument(result.content).toJS() as Record<string, any>;

    expect(result.exportedCount).toBe(2);
    expect(parsed.proxies[0]).toMatchObject({
      name: "Trojan HK",
      type: "trojan",
      server: "trojan.example.com",
      password: "secret",
    });
  });

  it("把 Clash 节点转换为 V2Ray/Hiddify 分享链接", () => {
    const result = buildNodeSubscriptionExport(demoNodes, "share-links");
    const lines = result.content.split("\n");

    expect(lines[0]).toContain("trojan://secret@trojan.example.com:443");
    expect(lines[0]).toContain("sni=tls.example.com");
    expect(lines[0]).toContain("type=ws");
    expect(lines[0]).toContain("path=%2Fws");
    expect(lines[0]).toContain("#Trojan%20HK");
    expect(lines[1].startsWith("vmess://")).toBe(true);

    const vmessPayload = JSON.parse(Buffer.from(lines[1].slice("vmess://".length), "base64").toString("utf8"));
    expect(vmessPayload).toMatchObject({
      ps: "VMess HK",
      add: "vmess.example.com",
      port: "443",
      id: "11111111-1111-1111-1111-111111111111",
      net: "ws",
      host: "cdn.example.com",
      path: "/vmess",
      tls: "tls",
      sni: "sni.example.com",
    });
  });

  it("生成 base64 订阅并报告无法转换的节点", () => {
    const result = buildNodeSubscriptionExport([...demoNodes, { id: "x", name: "bad", type: "unknown" }], "share-links-base64");
    const decoded = Buffer.from(result.content, "base64").toString("utf8");

    expect(decoded).toContain("trojan://secret@trojan.example.com:443");
    expect(result.exportedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.findings[0].id).toBe("node-subscription-export-skipped");
  });
});

import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { parseSubscriptionText } from "../src/services/subscription/subscriptionParser";
import { importSubscriptionNodesToYaml } from "../src/services/nodes/nodeManager";

describe("subscriptionParser", () => {
  it("解析 Clash YAML 订阅", () => {
    const result = parseSubscriptionText(
      `proxies:
  - name: SG-01
    type: trojan
    server: sg.example.local
    port: 443
`,
      "demo",
    );

    expect(result.format).toBe("clash-yaml");
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].name).toBe("SG-01");
  });

  it("拒绝 proxies 非数组的伪 Clash YAML 订阅", () => {
    const result = parseSubscriptionText(
      `proxies:
  bad:
    type: trojan
    server: sg.example.local
    port: 443
`,
      "demo",
    );

    expect(result.format).toBe("unknown");
    expect(result.nodes).toHaveLength(0);
    expect(result.findings[0].id).toBe("unknown-subscription-format");
  });

  it("解析 base64 节点订阅", () => {
    const raw = "trojan://password@example.local:443#HK-01";
    const encoded = globalThis.btoa(raw);
    const result = parseSubscriptionText(encoded, "demo");

    expect(result.format).toBe("base64-links");
    expect(result.nodes[0].type).toBe("trojan");
    expect(result.nodes[0].name).toBe("HK-01");
    expect(result.nodes[0].raw).toMatchObject({
      type: "trojan",
      password: "password",
      server: "example.local",
      port: 443,
    });
  });

  it("将 vmess 链接归一化为 Clash 节点字段", () => {
    const payload = globalThis
      .btoa(
        JSON.stringify({
          ps: "VMess HK",
          add: "vmess.example.com",
          port: "443",
          id: "11111111-1111-1111-1111-111111111111",
          aid: "0",
          scy: "auto",
          net: "ws",
          path: "/ws",
          host: "cdn.example.com",
          tls: "tls",
          sni: "sni.example.com",
        }),
      )
      .replace(/=+$/, "");
    const result = parseSubscriptionText(`vmess://${payload}`, "demo");

    expect(result.nodes[0]).toMatchObject({
      name: "VMess HK",
      type: "vmess",
      server: "vmess.example.com",
      port: 443,
    });
    expect(result.nodes[0].raw).toMatchObject({
      type: "vmess",
      uuid: "11111111-1111-1111-1111-111111111111",
      tls: true,
      servername: "sni.example.com",
      network: "ws",
      "ws-opts": {
        path: "/ws",
        headers: { Host: "cdn.example.com" },
      },
    });
  });

  it("解析 trojan、ss 和 vless 链接的关键 Clash 字段", () => {
    const result = parseSubscriptionText(
      [
        "trojan://secret@trojan.example.com:443?sni=tls.example.com&allowInsecure=1&type=ws&path=%2Fws&host=cdn.example.com#Trojan%20HK",
        "ss://aes-128-gcm:secret@ss.example.com:8388#SS%20HK",
        "vless://22222222-2222-2222-2222-222222222222@vless.example.com:443?encryption=none&security=tls&type=ws&path=%2Fvless&sni=sni.example.com#VLESS%20HK",
      ].join("\n"),
      "demo",
    );

    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0].raw).toMatchObject({
      name: "Trojan HK",
      type: "trojan",
      password: "secret",
      sni: "tls.example.com",
      "skip-cert-verify": true,
      "ws-opts": {
        path: "/ws",
        headers: { Host: "cdn.example.com" },
      },
    });
    expect(result.nodes[1].raw).toMatchObject({
      name: "SS HK",
      type: "ss",
      cipher: "aes-128-gcm",
      password: "secret",
      server: "ss.example.com",
      port: 8388,
    });
    expect(result.nodes[2].raw).toMatchObject({
      name: "VLESS HK",
      type: "vless",
      uuid: "22222222-2222-2222-2222-222222222222",
      tls: true,
      servername: "sni.example.com",
      network: "ws",
    });
  });

  it("解析 hysteria2 和 hy2 链接的关键 Mihomo 字段", () => {
    const result = parseSubscriptionText(
      [
        "hysteria2://secret@hy2.example.com:443?sni=sni.example.com&insecure=1&up=50%20Mbps&down=200%20Mbps&obfs=salamander&obfs-password=obfs-pass&alpn=h3#HY2%20HK",
        "hy2://secret-2@hy2-alt.example.com:8443?upmbps=30&downmbps=150#HY2%20ALT",
      ].join("\n"),
      "demo",
    );

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({
      name: "HY2 HK",
      type: "hysteria2",
      server: "hy2.example.com",
      port: 443,
    });
    expect(result.nodes[0].raw).toMatchObject({
      name: "HY2 HK",
      type: "hysteria2",
      password: "secret",
      sni: "sni.example.com",
      "skip-cert-verify": true,
      up: "50 Mbps",
      down: "200 Mbps",
      obfs: "salamander",
      "obfs-password": "obfs-pass",
      alpn: ["h3"],
    });
    expect(result.nodes[1].raw).toMatchObject({
      name: "HY2 ALT",
      type: "hysteria2",
      server: "hy2-alt.example.com",
      port: 8443,
      password: "secret-2",
      up: "30 Mbps",
      down: "150 Mbps",
    });
  });

  it("解析 tuic 链接的关键 Mihomo 字段", () => {
    const result = parseSubscriptionText(
        "tuic://33333333-3333-3333-3333-333333333333:tuic-pass@tuic.example.com:443?sni=sni.example.com&congestion_control=bbr&udp_relay_mode=native&alpn=h3&allow_insecure=True&heartbeat_interval=10000&reduce_rtt=1#TUIC%20HK",
      "demo",
    );

    expect(result.nodes[0]).toMatchObject({
      name: "TUIC HK",
      type: "tuic",
      server: "tuic.example.com",
      port: 443,
    });
    expect(result.nodes[0].raw).toMatchObject({
      name: "TUIC HK",
      type: "tuic",
      uuid: "33333333-3333-3333-3333-333333333333",
      password: "tuic-pass",
      sni: "sni.example.com",
      "congestion-controller": "bbr",
      "udp-relay-mode": "native",
      alpn: ["h3"],
      "skip-cert-verify": true,
      "heartbeat-interval": 10000,
      "reduce-rtt": true,
    });
  });

  it("导入链接订阅节点时保留鉴权字段", () => {
    const parsed = parseSubscriptionText("trojan://secret@trojan.example.com:443?sni=tls.example.com#Trojan%20HK", "demo");
    const imported = importSubscriptionNodesToYaml("proxy-groups:\n  - name: 节点选择\n    type: select\n    proxies: []\n", parsed.nodes, {
      targetGroupName: "节点选择",
    });
    const config = parseDocument(imported.yaml).toJS() as Record<string, any>;

    expect(config.proxies[0]).toMatchObject({
      name: "Trojan HK",
      type: "trojan",
      server: "trojan.example.com",
      port: 443,
      password: "secret",
      sni: "tls.example.com",
    });
    expect(config["proxy-groups"][0].proxies).toEqual(["Trojan HK"]);
  });

  it("导入 hysteria2 和 tuic 订阅节点时保留高级协议字段", () => {
    const parsed = parseSubscriptionText(
      [
        "hysteria2://secret@hy2.example.com:443?sni=sni.example.com&insecure=1&obfs=salamander&obfs-password=obfs-pass#HY2%20HK",
        "tuic://33333333-3333-3333-3333-333333333333:tuic-pass@tuic.example.com:443?sni=sni.example.com&congestion_control=bbr#TUIC%20HK",
      ].join("\n"),
      "demo",
    );
    const imported = importSubscriptionNodesToYaml("proxy-groups:\n  - name: 节点选择\n    type: select\n    proxies: []\n", parsed.nodes, {
      targetGroupName: "节点选择",
    });
    const config = parseDocument(imported.yaml).toJS() as Record<string, any>;

    expect(config.proxies[0]).toMatchObject({
      name: "HY2 HK",
      type: "hysteria2",
      server: "hy2.example.com",
      port: 443,
      password: "secret",
      sni: "sni.example.com",
      "skip-cert-verify": true,
      obfs: "salamander",
      "obfs-password": "obfs-pass",
    });
    expect(config.proxies[1]).toMatchObject({
      name: "TUIC HK",
      type: "tuic",
      server: "tuic.example.com",
      port: 443,
      uuid: "33333333-3333-3333-3333-333333333333",
      password: "tuic-pass",
      sni: "sni.example.com",
      "congestion-controller": "bbr",
    });
    expect(config["proxy-groups"][0].proxies).toEqual(["HY2 HK", "TUIC HK"]);
  });
});

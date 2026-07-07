import { describe, expect, it } from "vitest";
import {
  parseAllowedSubscriptionUrl,
  parseSubscriptionTrafficHeader,
  redactSubscriptionUrl,
  refreshSubscriptionUrl,
  sanitizeSubscriptionError,
} from "../src/services/subscription/subscriptionRefresh";

describe("subscriptionRefresh", () => {
  it("只允许 http/https 订阅 URL", () => {
    expect(parseAllowedSubscriptionUrl("https://example.com/sub").hostname).toBe("example.com");
    expect(() => parseAllowedSubscriptionUrl("file:///C:/secret.yaml")).toThrow("只允许 http 或 https");
  });

  it("脱敏订阅 URL 日志", () => {
    expect(redactSubscriptionUrl("https://user:pass@example.com/api/token-abc?token=123&name=demo")).toBe(
      "https://example.com/...?name=<redacted>&token=<redacted>",
    );
  });

  it("订阅错误脱敏覆盖规范化 URL、路径、查询参数和凭据", () => {
    const rawUrl = "https://user:pass@example.com/api/token-abc?token=123&name=demo";
    const message = [
      "request failed",
      rawUrl,
      "normalized=https://user:pass@example.com/api/token-abc?name=demo&token=123",
      "path=/api/token-abc",
      "query=?token=123&name=demo",
      "user=user",
      "password=pass",
    ].join(" ");

    const sanitized = sanitizeSubscriptionError(new Error(message), rawUrl);

    expect(sanitized).toContain("https://example.com/...");
    expect(sanitized).toContain("?<redacted>");
    expect(sanitized).not.toContain("token=123");
    expect(sanitized).not.toContain("name=demo");
    expect(sanitized).not.toContain("/api/token-abc");
    expect(sanitized).not.toContain("user:pass");
    expect(sanitized).not.toContain("password=pass");
  });

  it("解析订阅流量响应头", () => {
    const traffic = parseSubscriptionTrafficHeader("upload=1024; download=2048; total=4096; expire=1893456000");

    expect(traffic).toEqual({
      upload: 1024,
      download: 2048,
      total: 4096,
      expire: 1893456000,
    });
  });

  it("请求订阅 URL 并解析节点数量", async () => {
    const result = await refreshSubscriptionUrl({
      url: "https://example.com/sub?token=secret",
      name: "demo",
      fetchImpl: async () =>
        new Response(
          `proxies:
  - name: HK-01
    type: trojan
    server: hk.example.com
    port: 443
`,
          {
            status: 200,
            headers: {
              "content-type": "text/yaml",
              "subscription-userinfo": "upload=10; download=20; total=100",
            },
          },
        ),
    });

    expect(result.redactedUrl).toBe("https://example.com/...?token=<redacted>");
    expect(result.status).toBe(200);
    expect(result.contentType).toBe("text/yaml");
    expect(result.parsed.nodes).toHaveLength(1);
    expect(result.parsed.nodes[0].name).toBe("HK-01");
    expect(result.parsed.traffic?.total).toBe(100);
  });

  it("本地多方式测试会跳过不可解析 profile 并选择可用结果", async () => {
    const triedProfiles: string[] = [];
    const result = await refreshSubscriptionUrl({
      url: "https://example.com/sub?token=secret",
      name: "demo",
      nativeProfiles: ["browser", "mihomo"],
      nativeFetchImpl: async ({ profile }) => {
        triedProfiles.push(profile);
        if (profile === "browser") {
          return {
            content: "<html>blocked</html>",
            status: 200,
            bytes: 20,
            profile,
            profileLabel: "Browser",
          };
        }

        return {
          content: `proxies:
  - name: HK-02
    type: trojan
    server: hk2.example.com
    port: 443
`,
          status: 200,
          bytes: 85,
          contentType: "text/yaml",
          profile,
          profileLabel: "Mihomo",
        };
      },
    });

    expect(triedProfiles).toEqual(["browser", "mihomo"]);
    expect(result.requestProfile).toBe("mihomo");
    expect(result.requestProfileLabel).toBe("Mihomo");
    expect(result.parsed.nodes[0].name).toBe("HK-02");
  });

  it("本地 profile 全部不可解析时回退到浏览器 fetch", async () => {
    const result = await refreshSubscriptionUrl({
      url: "https://example.com/sub?token=secret",
      name: "demo",
      nativeProfiles: ["mihomo"],
      nativeFetchImpl: async ({ profile }) => ({
        content: "<html>blocked</html>",
        status: 200,
        bytes: 20,
        profile,
        profileLabel: "Mihomo",
      }),
      fetchImpl: async () =>
        new Response(
          `proxies:
  - name: SG-01
    type: ss
    server: sg.example.com
    port: 443
`,
          { status: 200, headers: { "content-type": "text/yaml" } },
        ),
    });

    expect(result.requestProfile).toBe("browser-fetch");
    expect(result.parsed.nodes[0].name).toBe("SG-01");
  });

});

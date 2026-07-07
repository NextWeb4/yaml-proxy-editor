import { describe, expect, it, vi } from "vitest";
import { parseDocument } from "yaml";
import {
  checkRemoteProviders,
  extractRemoteProviderTargets,
  redactProviderUrl,
} from "../src/services/provider_check/providerCheck";

function parse(raw: string): unknown {
  return parseDocument(raw).toJS();
}

describe("providerCheck", () => {
  it("只提取配置中的远程 http provider 并脱敏 URL", () => {
    const extracted = extractRemoteProviderTargets(
      parse(`proxy-providers:
  remote:
    type: http
    url: https://provider.example.com/sub.yaml?token=secret&user=alice
  local:
    type: file
    path: ./local.yaml
rule-providers:
  reject:
    type: http
    url: http://rules.example.com/reject.yaml
`),
    );

    expect(extracted.findings).toEqual([]);
    expect(extracted.targets.map((target) => `${target.section}:${target.name}`)).toEqual([
      "proxy-providers:remote",
      "rule-providers:reject",
    ]);
    expect(extracted.targets[0].redactedUrl).toBe("https://provider.example.com/...?token=<redacted>&user=<redacted>");
  });

  it("拒绝非 http/https provider URL 且不发起请求", async () => {
    const fetchImpl = vi.fn();
    const summary = await checkRemoteProviders(
      parse(`proxy-providers:
  bad:
    type: http
    url: ftp://provider.example.com/proxies.yaml
`),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(summary.targets).toHaveLength(0);
    expect(summary.findings.some((finding) => finding.id === "provider-check-proxy-providers-invalid-url-bad")).toBe(true);
  });

  it("checks remote proxy provider and reports lightweight content structure", async () => {
    const fetchImpl = vi.fn(async () => new Response(`proxies:
  - name: node-a
    type: ss
    server: proxy.example.com
    port: 443
`, {
      status: 200,
      headers: {
        "content-type": "text/yaml",
      },
    }));

    const summary = await checkRemoteProviders(
      parse(`proxy-providers:
  ok:
    type: http
    url: https://provider.example.com/proxies.yaml?token=secret
`),
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: () => new Date("2026-06-29T00:00:00.000Z"),
      },
    );

    expect(fetchImpl).toHaveBeenCalledWith("https://provider.example.com/proxies.yaml?token=secret", expect.objectContaining({ method: "GET" }));
    expect(summary.checkedAt).toBe("2026-06-29T00:00:00.000Z");
    expect(summary.results[0]).toMatchObject({
      status: "ok",
      httpStatus: 200,
      contentType: "text/yaml",
      contentFormat: "proxy-yaml",
      itemCount: 1,
      redactedUrl: "https://provider.example.com/...?token=<redacted>",
    });
    expect(summary.findings).toEqual([]);
  });

  it("检查远程 provider 时限制响应读取大小", async () => {
    const fetchImpl = vi.fn(async () => new Response("0123456789", { status: 200 }));

    const summary = await checkRemoteProviders(
      parse(`proxy-providers:
  large:
    type: http
    url: https://provider.example.com/large.yaml
`),
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxBytes: 4,
      },
    );

    expect(summary.results[0]).toMatchObject({
      status: "ok",
      bytes: 4,
      truncated: true,
    });
    expect(summary.results[0].message).toContain("检查上限");
  });

  it("warns when a reachable proxy provider returns non-provider content", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>login required</html>", { status: 200 }));

    const summary = await checkRemoteProviders(
      parse(`proxy-providers:
  html:
    type: http
    url: https://provider.example.com/login
`),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(summary.results[0]).toMatchObject({
      status: "warning",
      contentFormat: "unknown",
    });
    expect(summary.results[0].message).toContain("未识别为代理 provider 内容结构");
    expect(summary.findings[0]).toMatchObject({
      severity: "warning",
      path: "/proxy-providers/html/url",
    });
  });

  it("checks yaml rule provider payload structure", async () => {
    const fetchImpl = vi.fn(async () => new Response(`payload:
  - DOMAIN-SUFFIX,example.com
  - DOMAIN,example.org
`, { status: 200 }));

    const summary = await checkRemoteProviders(
      parse(`rule-providers:
  rules:
    type: http
    behavior: classical
    url: https://rules.example.com/rules.yaml
`),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(summary.results[0]).toMatchObject({
      status: "ok",
      contentFormat: "rule-yaml",
      itemCount: 2,
      behavior: "classical",
    });
    expect(summary.findings).toEqual([]);
  });

  it("checks text rule provider when format is text", async () => {
    const fetchImpl = vi.fn(async () => new Response(`# comment
example.com
example.org
`, { status: 200 }));

    const summary = await checkRemoteProviders(
      parse(`rule-providers:
  domains:
    type: http
    behavior: domain
    format: text
    url: https://rules.example.com/domains.txt
`),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(summary.results[0]).toMatchObject({
      status: "ok",
      contentFormat: "rule-text",
      itemCount: 2,
      format: "text",
    });
  });

  it("warns when a reachable provider response is empty", async () => {
    const fetchImpl = vi.fn(async () => new Response("   \n", { status: 200 }));

    const summary = await checkRemoteProviders(
      parse(`proxy-providers:
  empty:
    type: http
    url: https://provider.example.com/empty.yaml
`),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(summary.results[0]).toMatchObject({
      status: "warning",
      contentFormat: "empty",
      itemCount: undefined,
    });
    expect(summary.findings[0]).toMatchObject({
      severity: "warning",
      path: "/proxy-providers/empty/url",
    });
  });

  it("does not parse mrs rule providers as text or yaml", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([0, 1, 2, 3]), { status: 200 }));

    const summary = await checkRemoteProviders(
      parse(`rule-providers:
  geoip:
    type: http
    behavior: ipcidr
    format: mrs
    url: https://rules.example.com/geoip.mrs
`),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(summary.results[0]).toMatchObject({
      status: "ok",
      contentFormat: "rule-mrs",
      itemCount: undefined,
      format: "mrs",
    });
    expect(summary.findings).toEqual([]);
  });

  it("失败结果不会泄漏 provider URL token", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Failed to fetch https://provider.example.com/proxies.yaml?token=secret-token");
    });

    const summary = await checkRemoteProviders(
      parse(`proxy-providers:
  fail:
    type: http
    url: https://provider.example.com/proxies.yaml?token=secret-token
`),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(summary.results[0].status).toBe("error");
    expect(summary.results[0].message).not.toContain("secret-token");
    expect(summary.findings[0].suggestion).not.toContain("secret-token");
  });

  it("脱敏 provider URL 时只保留域名和查询参数名", () => {
    expect(redactProviderUrl("https://user:pass@example.com:8443/path/to/provider.yaml?token=a&b=2")).toBe(
      "https://example.com:8443/...?b=<redacted>&token=<redacted>",
    );
  });
});

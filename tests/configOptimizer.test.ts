import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { analyzeYaml } from "../src/services/yaml/yamlService";
import {
  applyLeakProtectionToYaml,
  buildProxyProviderPreviewYaml,
  deleteProxyProviderFromYaml,
  upsertProxyProviderInYaml,
  upsertProxyProvidersInYaml,
} from "../src/services/config/configOptimizer";
import { syncProviderSelectionFromYaml } from "../src/services/subscription/providerSelection";

function toConfig(source: string): Record<string, any> {
  return parseDocument(source, { uniqueKeys: true }).toJS() as Record<string, any>;
}

describe("configOptimizer", () => {
  it("生成 proxy-provider 写入预览时使用同一套默认模板", () => {
    const config = toConfig(buildProxyProviderPreviewYaml({
      name: "机场A",
      url: "https://airport.example/sub",
    }));

    expect(config["proxy-providers"]["机场A"]).toEqual({
      url: "https://airport.example/sub",
      type: "http",
      interval: 86400,
      "health-check": {
        enable: true,
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
      },
      proxy: "DIRECT",
    });
  });

  it("用名称和 URL 写入 proxy-provider 默认模板，并加入已有 use 分组", () => {
    const result = upsertProxyProviderInYaml(
      `proxy-providers:
  old:
    type: http
    url: https://example.com/old
  dup:
    type: http
    url: https://example.com/a
  dup:
    type: http
    url: https://example.com/b
proxy-groups:
  - name: 所有-手动
    type: select
    use:
      - old
rules:
  - MATCH,所有-手动
`,
      {
        name: "机场A",
        url: "https://airport.example/sub?token=secret",
      },
    );
    const config = toConfig(result.yaml);

    expect(result.findings.some((finding) => finding.id === "proxy-provider-upserted")).toBe(true);
    expect(result.findings.some((finding) => finding.id === "proxy-provider-duplicates-normalized")).toBe(true);
    expect(config["proxy-providers"]["机场A"]).toEqual({
      url: "https://airport.example/sub?token=secret",
      type: "http",
      interval: 86400,
      "health-check": {
        enable: true,
        url: "https://www.gstatic.com/generate_204",
        interval: 300,
      },
      proxy: "DIRECT",
    });
    expect(config["proxy-groups"][0].use).toContain("机场A");
    expect(analyzeYaml(result.yaml).syntaxFindings).toHaveLength(0);
  });

  it("批量写入多个 proxy-provider 并复用默认模板", () => {
    const result = upsertProxyProvidersInYaml(
      `proxy-groups:
  - name: 自动
    type: url-test
    use: []
rules:
  - MATCH,自动
`,
      [
        { name: "机场A", url: "https://a.example/sub?token=secret" },
        { name: "机场B", url: "https://b.example/sub" },
      ],
    );
    const config = toConfig(result.yaml);

    expect(result.summary).toMatchObject({
      requestedCount: 2,
      upsertedCount: 2,
      createdCount: 2,
      updatedCount: 0,
      invalidCount: 0,
      addedToGroupCount: 2,
    });
    expect(config["proxy-providers"]["机场A"]).toMatchObject({
      type: "http",
      url: "https://a.example/sub?token=secret",
      proxy: "DIRECT",
    });
    expect(config["proxy-providers"]["机场B"]["health-check"].url).toBe("https://www.gstatic.com/generate_204");
    expect(config["proxy-groups"][0].use).toEqual(["机场A", "机场B"]);
  });

  it("应用 DNS/IP 防泄露优化并修正泄露测试直连规则", () => {
    const result = applyLeakProtectionToYaml(`ipv6: true
dns:
  enable: false
  nameserver:
    - 223.5.5.5
proxy-groups:
  - name: Test
    type: select
    proxies:
      - 节点选择
  - name: 国内
    type: select
    proxies:
      - DIRECT
rules:
  - DOMAIN-SUFFIX,ipleak.net,DIRECT
  - MATCH,Test
`);
    const config = toConfig(result.yaml);
    const rules = analyzeYaml(result.yaml).clash.rules.map((rule) => rule.raw);

    expect(config.ipv6).toBe(false);
    expect(config.dns.enable).toBe(true);
    expect(config.dns.ipv6).toBe(false);
    expect(config.dns["enhanced-mode"]).toBe("fake-ip");
    expect(config.dns["nameserver-policy"]["+.ipleak.net"]).toContain("tls://1.1.1.1#国外");
    expect(config.tun["strict-route"]).toBe(true);
    expect(config.tun["auto-route"]).toBe(false);
    expect(rules).toContain("DOMAIN-SUFFIX,ipleak.net,Test");
    expect(rules).toContain("IP-CIDR,192.168.0.0/16,国内,no-resolve");
    expect(rules).toContain("GEOIP,CN,国内,no-resolve");
    expect(rules.at(-1)).toBe("MATCH,Test");
    expect(analyzeYaml(result.yaml).clash.findings.some((finding) => finding.id.startsWith("leak-test-direct"))).toBe(false);
  });

  it("拒绝非 http(s) 的订阅 provider URL", () => {
    const result = upsertProxyProviderInYaml("rules:\n  - MATCH,DIRECT\n", {
      name: "bad",
      url: "file:///tmp/sub.yaml",
    });

    expect(result.yaml).toBe("rules:\n  - MATCH,DIRECT\n");
    expect(result.findings[0].severity).toBe("error");
    expect(result.findings[0].id).toBe("proxy-provider-url-invalid");
  });

  it("修改已有 proxy-provider 时回填新名称和 URL，并保留其他字段", () => {
    const result = upsertProxyProviderInYaml(
      `proxy-providers:
  old:
    type: http
    url: https://example.com/old
    interval: 3600
    health-check:
      enable: false
      url: https://example.com/check
      interval: 60
    proxy: DIRECT
proxy-groups:
  - name: 自动
    type: url-test
    use:
      - old
rules:
  - MATCH,自动
`,
      {
        previousName: "old",
        name: "new",
        url: "https://example.com/new",
      },
    );
    const config = toConfig(result.yaml);

    expect(config["proxy-providers"].old).toBeUndefined();
    expect(config["proxy-providers"].new.url).toBe("https://example.com/new");
    expect(config["proxy-providers"].new.interval).toBe(3600);
    expect(config["proxy-providers"].new["health-check"].enable).toBe(false);
    expect(config["proxy-groups"][0].use).toEqual(["new"]);
  });

  it("删除 proxy-provider 时同步移除 proxy-groups.use 引用", () => {
    const result = deleteProxyProviderFromYaml(
      `proxy-providers:
  airport:
    type: http
    url: https://example.com/sub
  keep:
    type: http
    url: https://example.com/keep
proxy-groups:
  - name: 自动
    type: url-test
    use:
      - airport
      - keep
rules:
  - MATCH,自动
`,
      "airport",
    );
    const config = toConfig(result.yaml);

    expect(config["proxy-providers"].airport).toBeUndefined();
    expect(config["proxy-providers"].keep.url).toBe("https://example.com/keep");
    expect(config["proxy-groups"][0].use).toEqual(["keep"]);
    expect(result.summary.removedFromGroupCount).toBe(1);
  });

  it("从当前 YAML 回填 provider 后可以修改和删除，并写回同一份 YAML", () => {
    const source = `proxy-providers:
  airport:
    type: http
    url: https://example.com/old
  keep:
    type: http
    url: https://example.com/keep
proxy-groups:
  - name: 自动
    type: url-test
    use:
      - airport
      - keep
rules:
  - MATCH,自动
`;
    const openedSelection = syncProviderSelectionFromYaml(analyzeYaml(source).clash.proxyProviders);

    expect(openedSelection).toEqual({
      selectedProviderName: "airport",
      subscriptionName: "airport",
      subscriptionUrl: "https://example.com/old",
    });

    const edited = upsertProxyProviderInYaml(source, {
      previousName: openedSelection.selectedProviderName,
      name: "airport-new",
      url: "https://example.com/new",
    });
    const editedConfig = toConfig(edited.yaml);
    const editedSelection = syncProviderSelectionFromYaml(analyzeYaml(edited.yaml).clash.proxyProviders, "airport-new");

    expect(editedConfig["proxy-providers"].airport).toBeUndefined();
    expect(editedConfig["proxy-providers"]["airport-new"].url).toBe("https://example.com/new");
    expect(editedConfig["proxy-groups"][0].use).toEqual(["airport-new", "keep"]);
    expect(editedSelection.subscriptionName).toBe("airport-new");
    expect(editedSelection.subscriptionUrl).toBe("https://example.com/new");

    const deleted = deleteProxyProviderFromYaml(edited.yaml, editedSelection.selectedProviderName!);
    const deletedConfig = toConfig(deleted.yaml);

    expect(deletedConfig["proxy-providers"]["airport-new"]).toBeUndefined();
    expect(deletedConfig["proxy-providers"].keep.url).toBe("https://example.com/keep");
    expect(deletedConfig["proxy-groups"][0].use).toEqual(["keep"]);
  });
});

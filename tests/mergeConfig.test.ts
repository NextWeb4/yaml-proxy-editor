import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { mergeYamlConfigBatch, mergeYamlConfigs } from "../src/services/merge/mergeConfig";

const localYaml = `mixed-port: 7890
dns:
  enable: true
  nameserver:
    - 223.5.5.5
  fake-ip-filter:
    - +.lan
proxies:
  - name: HK Local
    type: ss
    server: hk.example.com
    port: 443
  - name: Duplicate Local
    type: ss
    server: dup.example.com
    port: 443
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - HK Local
rules:
  - DOMAIN-SUFFIX,local.test,DIRECT
  - MATCH,DIRECT
`;

const incomingYaml = `dns:
  nameserver:
    - 1.1.1.1
  fallback:
    - 8.8.8.8
proxies:
  - name: Duplicate Remote
    type: ss
    server: dup.example.com
    port: 443
  - name: JP Remote
    type: vmess
    server: jp.example.com
    port: 8443
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - JP Remote
rules:
  - DOMAIN-SUFFIX,remote.test,节点选择
  - DOMAIN-SUFFIX,local.test,DIRECT
  - MATCH,节点选择
`;

describe("mergeConfig", () => {
  it("合并两个 YAML 配置并按默认策略处理节点、分组、规则和 DNS", () => {
    const result = mergeYamlConfigs(localYaml, incomingYaml);
    const merged = parseDocument(result.yaml).toJS() as Record<string, any>;

    expect(merged.proxies.map((proxy: Record<string, unknown>) => proxy.name)).toEqual([
      "Duplicate Remote",
      "JP Remote",
      "HK Local",
    ]);
    expect(merged["proxy-groups"][0].proxies).toEqual(["HK Local", "JP Remote"]);
    expect(merged.rules).toEqual([
      "DOMAIN-SUFFIX,local.test,DIRECT",
      "DOMAIN-SUFFIX,remote.test,节点选择",
      "MATCH,DIRECT",
    ]);
    expect(merged.dns.nameserver).toEqual(["223.5.5.5", "1.1.1.1"]);
    expect(merged.dns.fallback).toEqual(["8.8.8.8"]);
    expect(result.summary).toMatchObject({
      localProxyCount: 2,
      incomingProxyCount: 2,
      mergedProxyCount: 3,
      mergedGroupCount: 1,
      mergedRuleCount: 3,
    });
    expect(result.findings.some((finding) => finding.id.startsWith("merge-dedupe-proxy"))).toBe(true);
    expect(result.findings.some((finding) => finding.id === "merge-rules-deduped")).toBe(true);
  });

  it("检测同名但不同服务器的节点冲突", () => {
    const result = mergeYamlConfigs(
      `proxies:
  - name: HK
    type: ss
    server: a.example.com
    port: 443
`,
      `proxies:
  - name: HK
    type: ss
    server: b.example.com
    port: 443
`,
    );

    expect(result.preview.proxies).toHaveLength(1);
    expect(result.findings.some((finding) => finding.id === "merge-proxy-name-conflict-HK")).toBe(true);
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        id: "merge-proxy-name-conflict-HK",
        kind: "proxy",
        localValue: "ss a.example.com:443",
        incomingValue: "ss b.example.com:443",
        selected: "incoming",
      }),
    ]);
  });

  it("支持手动选择节点名称冲突保留本地或待合并项", () => {
    const result = mergeYamlConfigs(
      `proxies:
  - name: HK
    type: ss
    server: a.example.com
    port: 443
`,
      `proxies:
  - name: HK
    type: ss
    server: b.example.com
    port: 443
`,
      {
        conflictResolutions: {
          "merge-proxy-name-conflict-HK": "local",
        },
      },
    );
    const merged = parseDocument(result.yaml).toJS() as Record<string, any>;

    expect(merged.proxies).toHaveLength(1);
    expect(merged.proxies[0].server).toBe("a.example.com");
    expect(result.conflicts[0]).toMatchObject({
      id: "merge-proxy-name-conflict-HK",
      selected: "local",
    });
    expect(result.findings.find((finding) => finding.id === "merge-proxy-name-conflict-HK")?.message).toContain("手动选择");
  });

  it("支持手动选择代理分组字段冲突", () => {
    const result = mergeYamlConfigs(
      `proxy-groups:
  - name: 自动选择
    type: url-test
    url: http://local.test/generate_204
    interval: 300
    lazy: true
    proxies:
      - HK Local
`,
      `proxy-groups:
  - name: 自动选择
    type: fallback
    url: http://remote.test/generate_204
    interval: 120
    lazy: false
    proxies:
      - JP Remote
`,
      {
        conflictResolutions: {
          "merge-group-field-conflict-自动选择-type": "incoming",
          "merge-group-field-conflict-自动选择-url": "incoming",
        },
      },
    );
    const merged = parseDocument(result.yaml).toJS() as Record<string, any>;
    const group = merged["proxy-groups"][0];

    expect(group.type).toBe("fallback");
    expect(group.url).toBe("http://remote.test/generate_204");
    expect(group.interval).toBe(300);
    expect(group.lazy).toBe(true);
    expect(group.proxies).toEqual(["HK Local", "JP Remote"]);
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "merge-group-field-conflict-自动选择-type",
          kind: "proxy-group",
          selected: "incoming",
        }),
        expect.objectContaining({
          id: "merge-group-field-conflict-自动选择-interval",
          kind: "proxy-group",
          selected: "local",
        }),
      ]),
    );
    expect(result.findings.find((finding) => finding.id === "merge-group-field-conflict-自动选择-type")?.message).toContain("手动选择");
  });

  it("支持手动选择 DNS 非列表字段冲突且继续合并 DNS 列表", () => {
    const result = mergeYamlConfigs(
      `dns:
  enable: true
  enhanced-mode: fake-ip
  ipv6: false
  nameserver:
    - 223.5.5.5
  fallback-filter:
    geoip: true
`,
      `dns:
  enable: false
  enhanced-mode: redir-host
  ipv6: true
  nameserver:
    - 1.1.1.1
  fallback-filter:
    geoip: false
`,
      {
        conflictResolutions: {
          "merge-dns-field-conflict-enhanced-mode": "incoming",
          "merge-dns-field-conflict-fallback-filter": "incoming",
        },
      },
    );
    const merged = parseDocument(result.yaml).toJS() as Record<string, any>;

    expect(merged.dns.enable).toBe(true);
    expect(merged.dns["enhanced-mode"]).toBe("redir-host");
    expect(merged.dns.ipv6).toBe(false);
    expect(merged.dns.nameserver).toEqual(["223.5.5.5", "1.1.1.1"]);
    expect(merged.dns["fallback-filter"]).toEqual({ geoip: false });
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "merge-dns-field-conflict-enhanced-mode",
          kind: "dns",
          selected: "incoming",
        }),
        expect.objectContaining({
          id: "merge-dns-field-conflict-enable",
          kind: "dns",
          selected: "local",
        }),
      ]),
    );
    expect(result.findings.find((finding) => finding.id === "merge-dns-field-conflict-fallback-filter")?.message).toContain(
      "手动选择",
    );
  });

  it("按显式合并策略切换节点、规则和 DNS 优先级", () => {
    const result = mergeYamlConfigs(localYaml, incomingYaml, {
      nodePriority: "local-first",
      rulePriority: "incoming-first",
      dnsPriority: "incoming-first",
    });
    const merged = parseDocument(result.yaml).toJS() as Record<string, any>;

    expect(merged.proxies.map((proxy: Record<string, unknown>) => proxy.name)).toEqual([
      "HK Local",
      "Duplicate Local",
      "JP Remote",
    ]);
    expect(merged.rules).toEqual([
      "DOMAIN-SUFFIX,remote.test,节点选择",
      "DOMAIN-SUFFIX,local.test,DIRECT",
      "MATCH,节点选择",
    ]);
    expect(merged.dns.nameserver).toEqual(["1.1.1.1", "223.5.5.5"]);
  });

  it("待合并 YAML 语法错误时不改动本地配置", () => {
    const result = mergeYamlConfigs(localYaml, "proxies:\n  - name: broken\n    type");

    expect(result.yaml).toBe(localYaml);
    expect(result.findings[0].id).toBe("merge-incoming-yaml-error-0");
  });

  it("批量合并多个 YAML 并保留来源级统计", () => {
    const result = mergeYamlConfigBatch(localYaml, [
      { name: "remote-a.yaml", content: incomingYaml },
      {
        name: "remote-b.yaml",
        content: `proxies:
  - name: Duplicate Second
    type: ss
    server: dup.example.com
    port: 443
  - name: US Remote
    type: trojan
    server: us.example.com
    port: 443
rules:
  - DOMAIN-SUFFIX,second.test,节点选择
  - MATCH,节点选择
`,
      },
    ]);
    const merged = parseDocument(result.yaml).toJS() as Record<string, any>;

    expect(result.summary).toMatchObject({
      sourceCount: 2,
      appliedSourceCount: 2,
      incomingProxyCount: 4,
      mergedProxyCount: 4,
    });
    expect(result.sources).toEqual([
      expect.objectContaining({ name: "remote-a.yaml", incomingProxyCount: 2, status: "merged" }),
      expect.objectContaining({ name: "remote-b.yaml", incomingProxyCount: 2, status: "merged" }),
    ]);
    expect(merged.proxies.map((proxy: Record<string, unknown>) => proxy.name)).toEqual([
      "Duplicate Second",
      "US Remote",
      "JP Remote",
      "HK Local",
    ]);
    expect(merged.rules).toEqual([
      "DOMAIN-SUFFIX,local.test,DIRECT",
      "DOMAIN-SUFFIX,remote.test,节点选择",
      "DOMAIN-SUFFIX,second.test,节点选择",
      "MATCH,DIRECT",
    ]);
    expect(result.findings.some((finding) => finding.message.includes("remote-b.yaml"))).toBe(true);
  });

  it("批量合并中途失败时保留已经成功合并的来源", () => {
    const result = mergeYamlConfigBatch(localYaml, [
      { name: "remote-a.yaml", content: incomingYaml },
      { name: "broken.yaml", content: "proxies:\n  - name: broken\n    type" },
    ]);
    const merged = parseDocument(result.yaml).toJS() as Record<string, any>;

    expect(result.summary).toMatchObject({
      sourceCount: 2,
      appliedSourceCount: 1,
    });
    expect(result.sources).toEqual([
      expect.objectContaining({ name: "remote-a.yaml", status: "merged" }),
      expect.objectContaining({ name: "broken.yaml", status: "blocked" }),
    ]);
    expect(merged.proxies.map((proxy: Record<string, unknown>) => proxy.name)).toContain("JP Remote");
    expect(merged.proxies.map((proxy: Record<string, unknown>) => proxy.name)).toContain("HK Local");
    expect(result.findings.some((finding) => finding.id.includes("merge-incoming-yaml-error"))).toBe(true);
  });
});

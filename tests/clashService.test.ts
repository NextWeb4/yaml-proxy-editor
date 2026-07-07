import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeYaml } from "../src/services/yaml/yamlService";

const fixture = (name: string) => readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf-8");

describe("clashService", () => {
  it("发现 rules 引用不存在的分组", () => {
    const analysis = analyzeYaml(fixture("missing-rule-target.yaml"));

    expect(analysis.clash.findings.some((finding) => finding.id.startsWith("missing-rule-target"))).toBe(true);
  });

  it("发现 DNS/fake-ip 风险", () => {
    const analysis = analyzeYaml(fixture("dns-risk.yaml"));

    expect(analysis.clash.findings.some((finding) => finding.id === "dns-disabled")).toBe(true);
    expect(analysis.clash.findings.some((finding) => finding.id.startsWith("leak-test-direct"))).toBe(true);
  });

  it("发现无效 rules 字段和不支持的规则类型", () => {
    const analysis = analyzeYaml(`proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - DIRECT
rules:
  - DOMAIN-SUFFIX,example.com
  - UNKNOWN,example,DIRECT
  - MATCH
`);

    expect(analysis.clash.findings.some((finding) => finding.id === "invalid-rule-format-0")).toBe(true);
    expect(analysis.clash.findings.some((finding) => finding.id === "invalid-rule-type-1")).toBe(true);
    expect(analysis.clash.findings.some((finding) => finding.id === "invalid-rule-format-2")).toBe(true);
  });

  it("接受 Mihomo 常见扩展规则类型", () => {
    const analysis = analyzeYaml(`proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - DIRECT
rules:
  - DOMAIN-REGEX,^.+\\.example\\.com$,节点选择
  - IP-ASN,15169,节点选择,no-resolve
  - DST-PORT,443,节点选择
  - PROCESS-PATH,/Applications/App.app/Contents/MacOS/App,节点选择
  - NETWORK,UDP,节点选择
  - AND,((DOMAIN,example.com),(NETWORK,TCP)),节点选择
  - MATCH,DIRECT
`);

    expect(analysis.clash.findings.some((finding) => finding.id.startsWith("invalid-rule-type"))).toBe(false);
    expect(analysis.clash.rules.find((rule) => rule.type === "AND")?.target).toBe("节点选择");
    expect(analysis.clash.findings.some((finding) => finding.id.startsWith("missing-rule-target"))).toBe(false);
  });

  it("发现规则顺序风险和国内外目标混乱", () => {
    const analysis = analyzeYaml(`proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - DIRECT
rules:
  - GEOSITE,cn,节点选择
  - GEOSITE,geolocation-!cn,DIRECT
  - DOMAIN-SUFFIX,bilibili.com,DIRECT
  - MATCH,节点选择
`);

    expect(analysis.clash.findings.some((finding) => finding.id.startsWith("rule-order-risk"))).toBe(true);
    expect(analysis.clash.findings.some((finding) => finding.id === "domestic-rule-proxy-target-0")).toBe(true);
    expect(analysis.clash.findings.some((finding) => finding.id === "foreign-rule-direct-target-1")).toBe(true);
  });

  it("识别 Clash / Mihomo / OpenClash 关键顶层结构", () => {
    const analysis = analyzeYaml(`mixed-port: 7890
allow-lan: true
mode: rule
log-level: info
external-controller: 0.0.0.0:9090
secret: ""
profile:
  store-selected: true
hosts:
  router.lan: 192.168.1.1
tun:
  enable: false
sniffer:
  enable: true
dns:
  enable: true
proxies: []
proxy-providers:
  remote:
    type: http
    url: https://example.invalid/sub.yaml
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - DIRECT
rule-providers:
  direct:
    type: http
    behavior: domain
    url: https://example.invalid/direct.yaml
rules:
  - MATCH,节点选择
`);

    const counts = Object.fromEntries(analysis.clash.structure.map((node) => [node.label, node.count]));
    expect(analysis.clash.ports["mixed-port"]).toBe(7890);
    expect(analysis.clash.mode).toBe("rule");
    expect(analysis.clash.logLevel).toBe("info");
    expect(analysis.clash.hasTun).toBe(true);
    expect(analysis.clash.hasProfile).toBe(true);
    expect(analysis.clash.hasSniffer).toBe(true);
    expect(analysis.clash.hasHosts).toBe(true);
    expect(analysis.clash.proxyProviders[0]).toMatchObject({
      name: "remote",
      type: "http",
      url: "https://example.invalid/sub.yaml",
      usedBy: [],
    });
    expect(counts["基础端口配置"]).toBe(4);
    expect(counts["代理订阅"]).toBe(1);
    expect(counts["规则订阅"]).toBe(1);
    expect(counts["OpenClash 兼容配置"]).toBe(4);
  });
});

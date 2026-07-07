import { describe, expect, it } from "vitest";
import { analyzeYaml } from "../src/services/yaml/yamlService";
import {
  addRuleToYaml,
  applyRuleTemplateToYaml,
  commentRulesInYaml,
  deleteRuleFromYaml,
  importRulesToYaml,
  moveRuleInYaml,
  normalizeRuleStrings,
} from "../src/services/rules/ruleEditor";

const baseYaml = `mixed-port: 7890
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - DIRECT
rules:
  - MATCH,DIRECT
`;

describe("ruleEditor", () => {
  it("添加规则时插入到 MATCH 前并保持 MATCH 最后", () => {
    const result = addRuleToYaml(baseYaml, {
      type: "DOMAIN-SUFFIX",
      value: "openai.com",
      target: "节点选择",
    });
    const rules = analyzeYaml(result.yaml).clash.rules;

    expect(rules.map((rule) => rule.raw)).toEqual(["DOMAIN-SUFFIX,openai.com,节点选择", "MATCH,DIRECT"]);
  });

  it("套用模板时去重并保留 MATCH 兜底", () => {
    const once = applyRuleTemplateToYaml(baseYaml, "ai-proxy", "节点选择");
    const twice = applyRuleTemplateToYaml(once.yaml, "ai-proxy", "节点选择");
    const rules = analyzeYaml(twice.yaml).clash.rules;

    expect(rules.at(-1)?.type).toBe("MATCH");
    expect(rules.filter((rule) => rule.raw === "DOMAIN-SUFFIX,openai.com,节点选择")).toHaveLength(1);
  });

  it("删除和移动规则", () => {
    const added = addRuleToYaml(baseYaml, {
      type: "DOMAIN-SUFFIX",
      value: "openai.com",
      target: "节点选择",
    });
    const moved = moveRuleInYaml(added.yaml, 0, 1);
    const deleted = deleteRuleFromYaml(moved.yaml, 0);

    expect(analyzeYaml(deleted.yaml).clash.rules.map((rule) => rule.raw)).toEqual(["MATCH,DIRECT"]);
  });

  it("解析 no-resolve 规则时目标仍是第三段", () => {
    const analysis = analyzeYaml(`proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - DIRECT
rules:
  - IP-CIDR,1.1.1.1/32,DIRECT,no-resolve
  - MATCH,节点选择
`);

    expect(analysis.clash.rules[0].target).toBe("DIRECT");
    expect(analysis.clash.findings.some((finding) => finding.id.startsWith("missing-rule-target"))).toBe(false);
  });

  it("规范化规则时去重并补 MATCH", () => {
    expect(normalizeRuleStrings(["DOMAIN-SUFFIX,openai.com,节点选择", "DOMAIN-SUFFIX,openai.com,节点选择"])).toEqual([
      "DOMAIN-SUFFIX,openai.com,节点选择",
      "MATCH,DIRECT",
    ]);
  });

  it("批量导入规则时跳过空行和注释并插入 MATCH 前", () => {
    const result = importRulesToYaml(
      baseYaml,
      `
      DOMAIN-SUFFIX,example.com,节点选择
      # 这是注释
      DOMAIN-KEYWORD,openai,节点选择
    `,
    );
    const rules = analyzeYaml(result.yaml).clash.rules;

    expect(rules.map((rule) => rule.raw)).toEqual([
      "DOMAIN-SUFFIX,example.com,节点选择",
      "DOMAIN-KEYWORD,openai,节点选择",
      "MATCH,DIRECT",
    ]);
    expect(result.findings.some((finding) => finding.id === "rules-imported")).toBe(true);
  });

  it("批量导入重复规则时去重", () => {
    const result = importRulesToYaml(
      baseYaml,
      `
      DOMAIN-SUFFIX,example.com,节点选择
      DOMAIN-SUFFIX,example.com,节点选择
    `,
    );
    const rules = analyzeYaml(result.yaml).clash.rules;

    expect(rules.filter((rule) => rule.raw === "DOMAIN-SUFFIX,example.com,节点选择")).toHaveLength(1);
    expect(result.findings.some((finding) => finding.id === "rules-deduped")).toBe(true);
  });

  it("批量导入 MATCH 时仍保持 MATCH 最后一条", () => {
    const result = importRulesToYaml(
      baseYaml,
      `
      MATCH,节点选择
      DOMAIN-SUFFIX,example.com,节点选择
    `,
    );
    const rules = analyzeYaml(result.yaml).clash.rules;

    expect(rules.map((rule) => rule.raw)).toEqual(["DOMAIN-SUFFIX,example.com,节点选择", "MATCH,节点选择"]);
  });

  it("批量导入 Mihomo 扩展规则类型", () => {
    const result = importRulesToYaml(
      baseYaml,
      `
      DOMAIN-REGEX,^.+\\.example\\.com$,节点选择
      IP-ASN,15169,节点选择,no-resolve
      DST-PORT,443,节点选择
      AND,((DOMAIN,example.com),(NETWORK,TCP)),节点选择
    `,
    );
    const rules = analyzeYaml(result.yaml).clash.rules.map((rule) => rule.raw);

    expect(rules).toContain("DOMAIN-REGEX,^.+\\.example\\.com$,节点选择");
    expect(rules).toContain("IP-ASN,15169,节点选择,no-resolve");
    expect(rules).toContain("DST-PORT,443,节点选择");
    expect(rules).toContain("AND,((DOMAIN,example.com),(NETWORK,TCP)),节点选择");
    expect(result.findings.some((finding) => finding.id.startsWith("rules-import-unsupported"))).toBe(false);
  });

  it("批量注释选中的非 MATCH 规则并保留 YAML 可解析", () => {
    const source = `mixed-port: 7890
rules:
  - DOMAIN-SUFFIX,openai.com,节点选择
  - DOMAIN-KEYWORD,anthropic,节点选择
  - MATCH,DIRECT
`;
    const result = commentRulesInYaml(source, [0]);
    const rules = analyzeYaml(result.yaml).clash.rules;

    expect(result.yaml).toContain("  # - DOMAIN-SUFFIX,openai.com,节点选择");
    expect(rules.map((rule) => rule.raw)).toEqual(["DOMAIN-KEYWORD,anthropic,节点选择", "MATCH,DIRECT"]);
    expect(result.findings.some((finding) => finding.id === "rules-commented")).toBe(true);
  });

  it("批量注释时跳过 MATCH 兜底规则", () => {
    const source = `rules:
  - DOMAIN-SUFFIX,openai.com,节点选择
  - MATCH,DIRECT
`;
    const result = commentRulesInYaml(source, [0, 1]);
    const rules = analyzeYaml(result.yaml).clash.rules;

    expect(result.yaml).toContain("  # - DOMAIN-SUFFIX,openai.com,节点选择");
    expect(result.yaml).not.toContain("  # - MATCH,DIRECT");
    expect(rules.map((rule) => rule.raw)).toEqual(["MATCH,DIRECT"]);
    expect(result.findings.some((finding) => finding.id === "rules-comment-match-skipped")).toBe(true);
  });

  it("批量注释空选择时返回警告且不改动 YAML", () => {
    const result = commentRulesInYaml(baseYaml, []);

    expect(result.yaml).toBe(baseYaml);
    expect(result.findings.some((finding) => finding.id === "rules-comment-empty")).toBe(true);
  });
});

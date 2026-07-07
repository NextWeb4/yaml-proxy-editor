import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeYaml, formatYaml, validateYamlBeforeSave } from "../src/services/yaml/yamlService";
import { createYamlTemplateDocument, listYamlTemplates } from "../src/services/yaml/yamlTemplates";

const fixture = (name: string) => readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf-8");

describe("yamlService", () => {
  it("解析有效 OpenClash 配置并生成结构摘要", () => {
    const analysis = analyzeYaml(fixture("valid-openclash.yaml"));

    expect(analysis.syntaxFindings).toHaveLength(0);
    expect(analysis.clash.proxyCount).toBe(1);
    expect(analysis.clash.proxyGroupCount).toBe(1);
    expect(analysis.clash.ruleCount).toBe(2);
    expect(analysis.clash.dnsEnabled).toBe(true);
    expect(analysis.formatSummary.dialect).toBe("Clash/Mihomo/OpenClash");
    expect(analysis.inventory.map((section) => section.id)).toContain("proxies");
    expect(analysis.inventory.map((section) => section.id)).toContain("proxy-groups");
    expect(analysis.inventory.map((section) => section.id)).toContain("rules");
  });

  it("定位错误 YAML", () => {
    const analysis = analyzeYaml(fixture("invalid-indent.yaml"));

    expect(analysis.syntaxFindings.some((finding) => finding.severity === "error")).toBe(true);
  });

  it("格式化 YAML", () => {
    const formatted = formatYaml("mixed-port: 7890\nmode: rule\n");

    expect(formatted).toContain("mixed-port: 7890");
    expect(formatted).toContain("mode: rule");
  });

  it("保存前允许语法正确的 YAML", () => {
    const result = validateYamlBeforeSave(fixture("valid-openclash.yaml"));

    expect(result.canSave).toBe(true);
    expect(result.findings.some((finding) => finding.severity === "error")).toBe(false);
  });

  it("保存前阻止语法错误 YAML", () => {
    const result = validateYamlBeforeSave(fixture("invalid-indent.yaml"));

    expect(result.canSave).toBe(false);
    expect(result.findings.some((finding) => finding.severity === "error")).toBe(true);
  });

  it("导入含重复 key 的 YAML 时仍读取格式并列出可修改清单", () => {
    const source = `proxy-providers:
  airport:
    type: http
    url: https://example.com/a
  airport:
    type: http
    url: https://example.com/b
dns:
  enable: true
  enhanced-mode: fake-ip
proxy-groups:
  - name: 节点选择
    type: select
    use:
      - airport
rules:
  - DOMAIN-SUFFIX,openai.com,节点选择
  - MATCH,节点选择
`;
    const analysis = analyzeYaml(source);
    const saveValidation = validateYamlBeforeSave(source);
    const providerSection = analysis.inventory.find((section) => section.id === "proxy-providers");
    const ruleSection = analysis.inventory.find((section) => section.id === "rules");

    expect(saveValidation.canSave).toBe(false);
    expect(analysis.formatSummary.readable).toBe(true);
    expect(analysis.formatSummary.duplicateKeyCount).toBeGreaterThan(0);
    expect(analysis.clash.proxyProviderCount).toBe(1);
    expect(providerSection?.items[0].label).toBe("airport");
    expect(providerSection?.items[0].detail).toContain("https://example.com/...");
    expect(ruleSection?.items.map((item) => item.label).join("\n")).toContain("DOMAIN-SUFFIX,openai.com");
  });

  it("提供 Clash / Mihomo / OpenClash 新建配置模板", () => {
    const templates = listYamlTemplates();

    expect(templates.map((template) => template.id).sort()).toEqual(["clash", "mihomo", "openclash"]);
    for (const template of templates) {
      const validation = validateYamlBeforeSave(template.content);
      const analysis = analyzeYaml(template.content);

      expect(template.filename.endsWith(".yaml")).toBe(true);
      expect(validation.canSave).toBe(true);
      expect(analysis.syntaxFindings).toHaveLength(0);
      expect(analysis.clash.proxyGroupCount).toBeGreaterThan(0);
      expect(analysis.clash.ruleCount).toBeGreaterThan(0);
    }
  });

  it("从模板创建未保存的新工作台文档", () => {
    const document = createYamlTemplateDocument("openclash");

    expect(document.name).toBe("new-openclash.yaml");
    expect(document.path).toBeUndefined();
    expect(document.dirty).toBe(true);
    expect(document.content).toContain("external-controller");
  });
});

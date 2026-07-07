import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { buildOpenClashExport } from "../src/services/openclash/openclashExport";

describe("openclashExport", () => {
  it("补基础字段并把 MATCH 移动到最后", () => {
    const result = buildOpenClashExport(`rules:
  - MATCH,DIRECT
  - DOMAIN-SUFFIX,openai.com,节点选择
`);
    const config = parseDocument(result.yaml).toJS() as Record<string, unknown>;

    expect(config["mixed-port"]).toBe(7890);
    expect(config.mode).toBe("rule");
    expect(config.rules).toEqual(["DOMAIN-SUFFIX,openai.com,节点选择", "MATCH,DIRECT"]);
    expect(result.findings.some((finding) => finding.id === "openclash-move-match")).toBe(true);
  });

  it("合并 Clash YAML 订阅节点并生成分组", () => {
    const result = buildOpenClashExport(
      `mixed-port: 7890
proxies: []
rules:
  - MATCH,节点选择
`,
      [
        {
          id: "sub:SG-01:0",
          name: "SG-01",
          type: "trojan",
          server: "sg.example.local",
          port: 443,
          raw: {
            name: "SG-01",
            type: "trojan",
            server: "sg.example.local",
            port: 443,
            password: "example",
          },
        },
      ],
    );
    const config = parseDocument(result.yaml).toJS() as Record<string, unknown>;

    expect(config.proxies).toEqual([
      {
        name: "SG-01",
        type: "trojan",
        server: "sg.example.local",
        port: 443,
        password: "example",
      },
    ]);
    expect(result.summary.proxyCount).toBe(1);
    expect(result.summary.proxyGroupCount).toBeGreaterThan(0);
  });

  it("错误 YAML 不执行导出", () => {
    const result = buildOpenClashExport("proxies:\n - name: a\n  type: ss");

    expect(result.yaml).toContain("proxies:");
    expect(result.findings[0].severity).toBe("error");
  });
});


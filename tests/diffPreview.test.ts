import { describe, expect, it } from "vitest";
import { buildYamlDiffPreview } from "../src/services/diff/diffPreview";

describe("diffPreview", () => {
  it("生成 YAML 配置结构 diff", () => {
    const before = `mixed-port: 7890
proxies:
  - name: HK-01
    type: trojan
    server: hk.example.local
    port: 443
rules:
  - MATCH,DIRECT
`;
    const after = `mixed-port: 7890
proxies:
  - name: HK-01
    type: trojan
    server: hk.example.local
    port: 443
  - name: SG-01
    type: trojan
    server: sg.example.local
    port: 443
rules:
  - DOMAIN-SUFFIX,openai.com,节点选择
  - MATCH,节点选择
`;

    const preview = buildYamlDiffPreview(before, after);

    expect(preview.findings).toHaveLength(0);
    expect(preview.entries.some((entry) => entry.path.includes("proxies"))).toBe(true);
    expect(preview.entries.length).toBeGreaterThan(0);
  });

  it("在备份或当前 YAML 无法解析时返回阻塞 finding", () => {
    const preview = buildYamlDiffPreview("proxies:\n  - name: bad\n    type", "mixed-port: 7890\n");

    expect(preview.entries).toHaveLength(0);
    expect(preview.findings[0]?.severity).toBe("error");
    expect(preview.findings[0]?.title).toBe("原配置无法对比");
  });
});

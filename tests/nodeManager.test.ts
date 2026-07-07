import { describe, expect, it } from "vitest";
import { analyzeYaml } from "../src/services/yaml/yamlService";
import {
  addProxyNodesToGroupInYaml,
  attachNodeGroups,
  disableProxyNodesInYaml,
  exportProxyNodesYaml,
  filterProxyNodes,
  getNodeFilterOptions,
  importSubscriptionNodesToYaml,
  normalizeProxyNodes,
  renameProxyNodeInYaml,
} from "../src/services/nodes/nodeManager";

const baseYaml = `proxies:
  - name: HK-01 1x
    type: ss
    server: hk.example.local
    port: 443
  - name: JP-01 2x
    type: trojan
    server: jp.example.local
    port: 443
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - HK-01 1x
      - JP-01 2x
      - DIRECT
rules:
  - MATCH,节点选择
`;

describe("nodeManager", () => {
  it("筛选节点并生成筛选选项", () => {
    const nodes = analyzeYaml(baseYaml).clash.proxies;

    expect(filterProxyNodes(nodes, { region: "香港" }).map((node) => node.name)).toEqual(["HK-01 1x"]);
    expect(filterProxyNodes(nodes, { type: "trojan", rate: "2x" }).map((node) => node.name)).toEqual(["JP-01 2x"]);
    expect(getNodeFilterOptions(nodes).types).toEqual(["ss", "trojan"]);
  });

  it("根据节点名称、旗帜和服务器域名推断地区与倍率筛选项", () => {
    const nodes = normalizeProxyNodes([
      {
        id: "sub:1",
        name: "🇭🇰 IEPL 01 0.5倍率",
        type: "trojan",
        server: "node.example.com",
      },
      {
        id: "sub:2",
        name: "Premium A",
        type: "ss",
        server: "jp-01.example.com",
      },
      {
        id: "sub:3",
        name: "US Netflix x2",
        type: "vmess",
        server: "edge.example.com",
        raw: {
          rate: "2x",
        },
      },
    ]);

    expect(getNodeFilterOptions(nodes).regions).toEqual(["美国", "日本", "香港"]);
    expect(getNodeFilterOptions(nodes).rates).toEqual(["0.5x", "2x"]);
    expect(filterProxyNodes(nodes, { region: "日本" }).map((node) => node.name)).toEqual(["Premium A"]);
    expect(filterProxyNodes(nodes, { rate: "0.5x" }).map((node) => node.name)).toEqual(["🇭🇰 IEPL 01 0.5倍率"]);
  });

  it("计算节点所属分组", () => {
    const analysis = analyzeYaml(baseYaml);
    const nodes = attachNodeGroups(analysis.clash.proxies, analysis.clash.proxyGroups);

    expect(nodes[0].groups).toEqual(["节点选择"]);
  });

  it("重命名节点并同步 proxy-groups 引用", () => {
    const result = renameProxyNodeInYaml(baseYaml, "HK-01 1x", "HK-01 renamed");
    const analysis = analyzeYaml(result.yaml);

    expect(analysis.clash.proxies[0].name).toBe("HK-01 renamed");
    expect(analysis.clash.proxyGroups[0].proxies).toContain("HK-01 renamed");
    expect(analysis.clash.proxyGroups[0].proxies).not.toContain("HK-01 1x");
  });

  it("禁用节点时只移除分组引用并保留 proxies", () => {
    const result = disableProxyNodesInYaml(baseYaml, ["JP-01 2x"]);
    const analysis = analyzeYaml(result.yaml);

    expect(analysis.clash.proxies.map((node) => node.name)).toContain("JP-01 2x");
    expect(analysis.clash.proxyGroups[0].proxies).not.toContain("JP-01 2x");
  });

  it("批量加入分组时避免重复并跳过非本地节点", () => {
    const source = `proxies:
  - name: HK-01 1x
    type: ss
    server: hk.example.local
    port: 443
  - name: JP-01 2x
    type: trojan
    server: jp.example.local
    port: 443
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - HK-01 1x
      - JP-01 2x
  - name: 备用节点
    type: select
    proxies:
      - HK-01 1x
rules:
  - MATCH,节点选择
`;
    const result = addProxyNodesToGroupInYaml(source, ["HK-01 1x", "JP-01 2x", "SUB-01"], "备用节点");
    const analysis = analyzeYaml(result.yaml);
    const backupGroup = analysis.clash.proxyGroups.find((group) => group.name === "备用节点");

    expect(backupGroup?.proxies).toEqual(["HK-01 1x", "JP-01 2x"]);
    expect(result.findings[0].message).toContain("跳过 1 个已在分组中、1 个不在当前 YAML proxies 中");
  });

  it("导入订阅节点到 proxies 并加入目标分组", () => {
    const result = importSubscriptionNodesToYaml(
      baseYaml,
      [
        {
          id: "sub:ss:duplicate",
          name: "HK Duplicate",
          type: "ss",
          server: "hk.example.local",
          port: 443,
          subscriptionName: "demo",
        },
        {
          id: "sub:ss:new",
          name: "US-01 1x",
          type: "ss",
          server: "us.example.local",
          port: 443,
          subscriptionName: "demo",
        },
        {
          id: "sub:vmess:name-conflict",
          name: "JP-01 2x",
          type: "vmess",
          server: "jp-new.example.local",
          port: 8443,
          subscriptionName: "demo",
        },
      ],
      { targetGroupName: "节点选择" },
    );
    const analysis = analyzeYaml(result.yaml);
    const nodeNames = analysis.clash.proxies.map((node) => node.name);

    expect(result.summary).toMatchObject({
      requestedCount: 3,
      importedCount: 2,
      skippedDuplicateCount: 1,
      renamedCount: 1,
      addedToGroupCount: 2,
      targetGroupName: "节点选择",
    });
    expect(nodeNames).toContain("US-01 1x");
    expect(nodeNames).toContain("JP-01 2x (导入 2)");
    expect(analysis.clash.proxyGroups[0].proxies).toEqual([
      "HK-01 1x",
      "JP-01 2x",
      "DIRECT",
      "US-01 1x",
      "JP-01 2x (导入 2)",
    ]);
    expect(result.findings[0].message).toContain("新增 2 个，跳过重复 1 个，自动改名 1 个");
  });

  it("导入订阅节点时保护非数组 proxies", () => {
    const result = importSubscriptionNodesToYaml(
      "proxies: invalid\n",
      [
        {
          id: "sub:ss:new",
          name: "US-01 1x",
          type: "ss",
          server: "us.example.local",
          port: 443,
        },
      ],
    );

    expect(result.yaml).toBe("proxies: invalid\n");
    expect(result.summary.importedCount).toBe(0);
    expect(result.findings[0]).toMatchObject({
      id: "subscription-import-proxies-invalid",
      severity: "error",
    });
  });

  it("导出节点 YAML", () => {
    const nodes = analyzeYaml(baseYaml).clash.proxies;
    const exported = exportProxyNodesYaml(nodes.slice(0, 1));

    expect(exported).toContain("proxies:");
    expect(exported).toContain("HK-01 1x");
  });
});

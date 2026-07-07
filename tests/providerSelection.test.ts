import { describe, expect, it } from "vitest";
import { analyzeYaml } from "../src/services/yaml/yamlService";
import {
  createProviderDraftSelection,
  syncProviderSelectionFromYaml,
} from "../src/services/subscription/providerSelection";

describe("providerSelection", () => {
  it("从导入 YAML 的 proxy-providers 选中第一个 provider 并回填名称和 URL", () => {
    const analysis = analyzeYaml(`proxy-providers:
  CrossWall (克洛斯):
    type: http
    url: http://162.19.79.201/s/demo
    interval: 86400
    health-check:
      enable: true
      url: https://www.gstatic.com/generate_204
      interval: 300
    proxy: DIRECT
  sub:
    type: http
    url: https://sni.111000.dynv6.net/sub?clash
proxy-groups:
  - name: AI
    type: select
    use:
      - CrossWall (克洛斯)
rules:
  - MATCH,AI
`);

    const selection = syncProviderSelectionFromYaml(analysis.clash.proxyProviders, undefined);

    expect(selection).toEqual({
      selectedProviderName: "CrossWall (克洛斯)",
      subscriptionName: "CrossWall (克洛斯)",
      subscriptionUrl: "http://162.19.79.201/s/demo",
    });
  });

  it("保留当前 YAML 中仍然存在的 provider 选择", () => {
    const analysis = analyzeYaml(`proxy-providers:
  first:
    type: http
    url: https://example.com/first
  second:
    type: http
    url: https://example.com/second
`);

    const selection = syncProviderSelectionFromYaml(analysis.clash.proxyProviders, "second");

    expect(selection.selectedProviderName).toBe("second");
    expect(selection.subscriptionName).toBe("second");
    expect(selection.subscriptionUrl).toBe("https://example.com/second");
  });

  it("新增 provider 草稿不携带示例 URL", () => {
    expect(createProviderDraftSelection()).toEqual({
      selectedProviderName: undefined,
      subscriptionName: "新订阅",
      subscriptionUrl: "",
    });
    expect(syncProviderSelectionFromYaml([], "missing")).toEqual(createProviderDraftSelection());
  });
});

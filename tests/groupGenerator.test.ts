import { describe, expect, it } from "vitest";
import { generateDefaultGroups, groupsToYamlFragment } from "../src/services/groups/groupGenerator";

describe("groupGenerator", () => {
  it("根据节点生成预设 proxy-groups", () => {
    const groups = generateDefaultGroups([
      { id: "1", name: "HK-01", type: "ss" },
      { id: "2", name: "JP-01", type: "trojan" },
    ]);

    expect(groups.some((group) => group.name === "节点选择")).toBe(true);
    expect(groupsToYamlFragment(groups)).toContain("proxy-groups:");
  });
});


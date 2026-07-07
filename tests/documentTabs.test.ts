import { describe, expect, it } from "vitest";
import {
  appendDocumentTabs,
  closeDocumentTab,
  createDocumentTab,
  getActiveDocumentTab,
  updateDocumentTab,
  type DocumentTab,
} from "../src/services/editor/documentTabs";

function tab(id: string, name = `${id}.yaml`): DocumentTab {
  return createDocumentTab(
    {
      name,
      content: `${id}: true`,
      dirty: false,
    },
    id,
  );
}

describe("documentTabs", () => {
  it("按 activeId 获取活动文档，缺失时回退到第一个标签", () => {
    const tabs = [tab("a"), tab("b")];

    expect(getActiveDocumentTab(tabs, "b")?.name).toBe("b.yaml");
    expect(getActiveDocumentTab(tabs, "missing")?.name).toBe("a.yaml");
  });

  it("只更新指定标签并保留标签 id", () => {
    const tabs = updateDocumentTab([tab("a"), tab("b")], "b", (current) => ({
      ...current,
      content: "changed: true",
      dirty: true,
    }));

    expect(tabs[0]).toMatchObject({ id: "a", dirty: false });
    expect(tabs[1]).toMatchObject({ id: "b", content: "changed: true", dirty: true });
  });

  it("追加新标签时跳过重复 id", () => {
    const tabs = appendDocumentTabs([tab("a")], [tab("a", "duplicate.yaml"), tab("b")]);

    expect(tabs.map((item) => item.name)).toEqual(["a.yaml", "b.yaml"]);
  });

  it("关闭活动标签后选择右侧邻近标签", () => {
    const result = closeDocumentTab([tab("a"), tab("b"), tab("c")], "b", "b");

    expect(result.tabs.map((item) => item.id)).toEqual(["a", "c"]);
    expect(result.activeId).toBe("c");
  });

  it("关闭非活动标签时保持当前活动标签", () => {
    const result = closeDocumentTab([tab("a"), tab("b"), tab("c")], "c", "a");

    expect(result.tabs.map((item) => item.id)).toEqual(["b", "c"]);
    expect(result.activeId).toBe("c");
  });

  it("不会关闭最后一个标签", () => {
    const tabs = [tab("a")];
    const result = closeDocumentTab(tabs, "a", "a");

    expect(result.tabs).toBe(tabs);
    expect(result.activeId).toBe("a");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildBackupCatalog,
  parseBackupFileName,
  toggleStableSnapshot,
} from "../src/services/backup/backupCatalog";
import { makeBackupFileName } from "../src/services/backup/backupPolicy";
import { loadStableSnapshotIds, saveStableSnapshotIds } from "../src/services/backup/stableSnapshotStore";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("backupPolicy", () => {
  it("生成包含时间戳和原文件名的备份文件名", () => {
    const name = makeBackupFileName("C:/configs/openclash.yaml", new Date("2026-06-29T01:02:03"));

    expect(name).toBe("20260629-010203-openclash.yaml");
  });
});

describe("backupCatalog", () => {
  it("解析备份文件名中的时间戳和源 YAML 文件名", () => {
    const parsed = parseBackupFileName("20260629-010203-openclash.yaml");
    const createdAt = new Date(parsed?.createdAt ?? "");

    expect(parsed?.sourceFileName).toBe("openclash.yaml");
    expect(parsed?.timestamp).toBe("20260629-010203");
    expect(createdAt.getFullYear()).toBe(2026);
    expect(createdAt.getMonth()).toBe(5);
    expect(createdAt.getDate()).toBe(29);
    expect(createdAt.getHours()).toBe(1);
    expect(createdAt.getMinutes()).toBe(2);
    expect(createdAt.getSeconds()).toBe(3);
  });

  it("拒绝不符合备份命名规则或日期越界的文件名", () => {
    expect(parseBackupFileName("openclash.yaml")).toBeUndefined();
    expect(parseBackupFileName("20261329-010203-openclash.yaml")).toBeUndefined();
  });

  it("按源文件聚合备份快照并把最新版本排在前面", () => {
    const catalog = buildBackupCatalog([
      { path: "C:/backups/20260629-010203-openclash.yaml", name: "20260629-010203-openclash.yaml", bytes: 120 },
      { path: "C:/backups/20260629-020000-openclash.yaml", name: "20260629-020000-openclash.yaml", bytes: 150 },
      { path: "C:/backups/20260628-235959-lab.yml", name: "20260628-235959-lab.yml", bytes: 90 },
      { path: "C:/backups/manual.yaml", name: "manual.yaml", bytes: 60 },
    ]);

    expect(catalog.snapshots.map((snapshot) => snapshot.name)).toEqual([
      "20260629-020000-openclash.yaml",
      "20260629-010203-openclash.yaml",
      "20260628-235959-lab.yml",
      "manual.yaml",
    ]);
    expect(catalog.groups.map((group) => group.sourceFileName)).toEqual(["openclash.yaml", "lab.yml", "manual.yaml"]);
    expect(catalog.groups[0].snapshots).toHaveLength(2);
    expect(catalog.totalBytes).toBe(420);
    expect(catalog.unknownCount).toBe(1);
  });

  it("支持把任意备份快照标记为稳定版本", () => {
    const stable = toggleStableSnapshot([], "C:/backups/20260629-010203-openclash.yaml");
    const catalog = buildBackupCatalog(
      [{ path: "C:/backups/20260629-010203-openclash.yaml", name: "20260629-010203-openclash.yaml", bytes: 120 }],
      stable,
    );

    expect(catalog.stableCount).toBe(1);
    expect(catalog.snapshots[0].isStable).toBe(true);
    expect(toggleStableSnapshot(stable, "C:/backups/20260629-010203-openclash.yaml")).toEqual([]);
  });

  it("持久化稳定版本标记并过滤无效值", () => {
    const storage = createMemoryStorage();

    saveStableSnapshotIds([" C:/backups/a.yaml ", "", "C:/backups/a.yaml", "C:/backups/b.yaml"], storage);

    expect(loadStableSnapshotIds(storage)).toEqual(["C:/backups/a.yaml", "C:/backups/b.yaml"]);
  });

  it("清空稳定版本标记时移除本地存储项", () => {
    const storage = createMemoryStorage();
    saveStableSnapshotIds(["C:/backups/a.yaml"], storage);

    saveStableSnapshotIds([], storage);

    expect(loadStableSnapshotIds(storage)).toEqual([]);
  });

  it("稳定版本标记本地存储损坏时回退为空列表", () => {
    const storage = createMemoryStorage();
    storage.setItem("yaml-proxy-editor.stableBackupSnapshotIds", "{broken json");

    expect(loadStableSnapshotIds(storage)).toEqual([]);
  });
});

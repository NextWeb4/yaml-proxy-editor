import { describe, expect, it } from "vitest";
import { createBackupSnapshot, exportBackupPackage, listBackupEntries } from "../src/services/desktop/desktopBridge";

describe("desktopBridge backup behavior outside Tauri", () => {
  it("returns an empty backup list in browser or test preview mode", async () => {
    await expect(listBackupEntries()).resolves.toEqual([]);
  });

  it("does not pretend that manual snapshots succeeded outside Tauri", async () => {
    await expect(createBackupSnapshot("C:/configs/openclash.yaml")).rejects.toThrow("浏览器预览模式无法创建本地快照。");
  });

  it("does not pretend that backup package exports succeeded outside Tauri", async () => {
    await expect(exportBackupPackage()).rejects.toThrow("浏览器预览模式无法导出本地备份包。");
  });
});

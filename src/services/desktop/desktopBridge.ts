import type { WorkbenchDocument } from "../../types/domain";

export interface SaveResult {
  path: string;
  backupPath?: string;
}

export interface BackupEntry {
  path: string;
  name: string;
  bytes: number;
}

export interface BackupPackageExportResult {
  path: string;
  fileCount: number;
  totalBytes: number;
}

export interface YamlFileContent {
  path?: string;
  name: string;
  content: string;
}

export interface NativeSubscriptionFetchResult {
  content: string;
  status: number;
  bytes: number;
  contentType?: string;
  trafficHeader?: string;
  profile: string;
  profileLabel: string;
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openYamlWithDialog(): Promise<WorkbenchDocument | undefined> {
  if (!isTauriRuntime()) {
    return undefined;
  }

  const [{ open }, { invoke }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/api/core"),
  ]);
  const selected = await open({
    multiple: false,
    filters: [{ name: "YAML", extensions: ["yaml", "yml"] }],
  });

  if (typeof selected !== "string") {
    return undefined;
  }

  const content = await invoke<string>("read_text_file", { path: selected });
  return {
    path: selected,
    name: selected.split(/[\\/]/).pop() ?? "config.yaml",
    content,
    dirty: false,
  };
}

export async function openYamlFilesWithDialog(): Promise<YamlFileContent[] | undefined> {
  if (!isTauriRuntime()) {
    return undefined;
  }

  const [{ open }, { invoke }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/api/core"),
  ]);
  const selected = await open({
    multiple: true,
    filters: [{ name: "YAML", extensions: ["yaml", "yml"] }],
  });

  if (!selected) {
    return undefined;
  }

  const paths = Array.isArray(selected) ? selected : [selected];
  if (paths.length === 0) {
    return undefined;
  }

  return Promise.all(
    paths.map(async (path) => ({
      path,
      name: path.split(/[\\/]/).pop() ?? "config.yaml",
      content: await invoke<string>("read_text_file", { path }),
    })),
  );
}

export async function saveYamlDocument(document: WorkbenchDocument, saveAs = false): Promise<SaveResult | undefined> {
  if (!isTauriRuntime()) {
    downloadText(document.name, document.content);
    return undefined;
  }

  const [{ save }, { invoke }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/api/core"),
  ]);

  const path =
    saveAs || !document.path
      ? await save({
          defaultPath: document.path ?? document.name,
          filters: [{ name: "YAML", extensions: ["yaml", "yml"] }],
        })
      : document.path;

  if (!path) {
    return undefined;
  }

  return invoke<SaveResult>("write_text_file", {
    path,
    content: document.content,
  });
}

export async function readYamlFile(path: string): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("浏览器预览模式无法直接读取本地路径。");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("read_text_file", { path });
}

export async function listBackupEntries(): Promise<BackupEntry[]> {
  if (!isTauriRuntime()) {
    return [];
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<BackupEntry[]>("list_backups");
}

export async function createBackupSnapshot(sourcePath: string): Promise<BackupEntry> {
  if (!isTauriRuntime()) {
    throw new Error("浏览器预览模式无法创建本地快照。");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<BackupEntry>("create_backup_snapshot", { sourcePath });
}

export async function restoreBackupToTarget(backupPath: string, targetPath: string): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("浏览器预览模式无法回滚本地备份。");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("restore_backup", { backupPath, targetPath });
}

export async function exportBackupPackage(): Promise<BackupPackageExportResult | undefined> {
  if (!isTauriRuntime()) {
    throw new Error("浏览器预览模式无法导出本地备份包。");
  }

  const [{ save }, { invoke }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/api/core"),
  ]);
  const outputPath = await save({
    defaultPath: "yaml-backups-package.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (!outputPath) {
    return undefined;
  }

  return invoke<BackupPackageExportResult>("export_backup_package", { outputPath });
}

export async function fetchSubscriptionWithNativeClient(
  url: string,
  profile: string,
  timeoutMs?: number,
): Promise<NativeSubscriptionFetchResult> {
  if (!isTauriRuntime()) {
    throw new Error("浏览器预览模式无法使用本地订阅测试客户端。");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<NativeSubscriptionFetchResult>("fetch_subscription_url", {
    url,
    profile,
    timeoutMs,
  });
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "config.yaml";
  anchor.click();
  URL.revokeObjectURL(url);
}

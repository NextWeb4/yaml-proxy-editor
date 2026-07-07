type StableSnapshotStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const STABLE_SNAPSHOT_STORAGE_KEY = "yaml-proxy-editor.stableBackupSnapshotIds";

export function loadStableSnapshotIds(storage = getStableSnapshotStorage()): string[] {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(STABLE_SNAPSHOT_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return normalizeStableSnapshotIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveStableSnapshotIds(
  snapshotIds: Iterable<string>,
  storage = getStableSnapshotStorage(),
): void {
  if (!storage) {
    return;
  }

  const normalized = normalizeStableSnapshotIds(snapshotIds);
  if (normalized.length === 0) {
    storage.removeItem(STABLE_SNAPSHOT_STORAGE_KEY);
    return;
  }

  storage.setItem(STABLE_SNAPSHOT_STORAGE_KEY, JSON.stringify(normalized));
}

function normalizeStableSnapshotIds(snapshotIds: Iterable<unknown>): string[] {
  const normalized = new Set<string>();
  for (const snapshotId of snapshotIds) {
    if (typeof snapshotId !== "string") {
      continue;
    }
    const value = snapshotId.trim();
    if (value) {
      normalized.add(value);
    }
  }
  return Array.from(normalized);
}

function getStableSnapshotStorage(): StableSnapshotStorage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

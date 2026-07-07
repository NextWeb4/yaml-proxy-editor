export interface BackupCatalogEntry {
  path: string;
  name: string;
  bytes: number;
}

export interface BackupNameParts {
  sourceFileName: string;
  timestamp: string;
  createdAt: string;
}

export interface BackupSnapshot extends BackupCatalogEntry {
  id: string;
  sourceFileName: string;
  createdAt?: string;
  createdAtLabel: string;
  isStable: boolean;
  parseState: "parsed" | "unknown";
}

export interface BackupVersionGroup {
  sourceFileName: string;
  snapshots: BackupSnapshot[];
  latest?: BackupSnapshot;
  stableCount: number;
  totalBytes: number;
}

export interface BackupCatalog {
  snapshots: BackupSnapshot[];
  groups: BackupVersionGroup[];
  latestSnapshot?: BackupSnapshot;
  stableCount: number;
  totalBytes: number;
  unknownCount: number;
}

const BACKUP_NAME_PATTERN = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(.+\.ya?ml)$/i;

export function parseBackupFileName(name: string): BackupNameParts | undefined {
  const match = BACKUP_NAME_PATTERN.exec(name);
  if (!match) {
    return undefined;
  }

  const [, year, month, day, hour, minute, second, sourceFileName] = match;
  const timestamp = `${year}${month}${day}-${hour}${minute}${second}`;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) ||
    date.getMinutes() !== Number(minute) ||
    date.getSeconds() !== Number(second)
  ) {
    return undefined;
  }

  return {
    sourceFileName,
    timestamp,
    createdAt: date.toISOString(),
  };
}

export function buildBackupCatalog(
  entries: BackupCatalogEntry[],
  stableSnapshotIds: Iterable<string> = [],
): BackupCatalog {
  const stableIds = new Set(stableSnapshotIds);
  const snapshots = entries.map((entry) => toSnapshot(entry, stableIds));
  snapshots.sort(compareSnapshots);

  const groupsBySource = new Map<string, BackupSnapshot[]>();
  for (const snapshot of snapshots) {
    const groupSnapshots = groupsBySource.get(snapshot.sourceFileName) ?? [];
    groupSnapshots.push(snapshot);
    groupsBySource.set(snapshot.sourceFileName, groupSnapshots);
  }

  const groups = Array.from(groupsBySource.entries())
    .map(([sourceFileName, groupSnapshots]) => ({
      sourceFileName,
      snapshots: groupSnapshots,
      latest: groupSnapshots[0],
      stableCount: groupSnapshots.filter((snapshot) => snapshot.isStable).length,
      totalBytes: groupSnapshots.reduce((sum, snapshot) => sum + snapshot.bytes, 0),
    }))
    .sort((left, right) => compareSnapshots(left.latest, right.latest));

  return {
    snapshots,
    groups,
    latestSnapshot: snapshots[0],
    stableCount: snapshots.filter((snapshot) => snapshot.isStable).length,
    totalBytes: snapshots.reduce((sum, snapshot) => sum + snapshot.bytes, 0),
    unknownCount: snapshots.filter((snapshot) => snapshot.parseState === "unknown").length,
  };
}

export function toggleStableSnapshot(stableSnapshotIds: Iterable<string>, snapshotId: string): string[] {
  const next = new Set(stableSnapshotIds);
  if (next.has(snapshotId)) {
    next.delete(snapshotId);
  } else {
    next.add(snapshotId);
  }
  return Array.from(next);
}

export function formatBackupTime(createdAt?: string): string {
  if (!createdAt) {
    return "未知时间";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(createdAt));
}

function toSnapshot(entry: BackupCatalogEntry, stableIds: Set<string>): BackupSnapshot {
  const parsed = parseBackupFileName(entry.name);
  const id = entry.path || entry.name;

  return {
    ...entry,
    id,
    sourceFileName: parsed?.sourceFileName ?? entry.name,
    createdAt: parsed?.createdAt,
    createdAtLabel: formatBackupTime(parsed?.createdAt),
    isStable: stableIds.has(id),
    parseState: parsed ? "parsed" : "unknown",
  };
}

function compareSnapshots(left?: BackupSnapshot, right?: BackupSnapshot): number {
  const leftTime = left?.createdAt ? Date.parse(left.createdAt) : 0;
  const rightTime = right?.createdAt ? Date.parse(right.createdAt) : 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return (right?.name ?? "").localeCompare(left?.name ?? "");
}

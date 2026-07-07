import { atomizeChangeset, diff, type IAtomicChange } from "json-diff-ts";
import { parseDocument } from "yaml";
import type { Finding } from "../../types/domain";

export interface ConfigDiffEntry {
  id: string;
  type: IAtomicChange["type"];
  path: string;
  key: string;
  oldValue: string;
  value: string;
}

export interface ConfigDiffPreview {
  entries: ConfigDiffEntry[];
  findings: Finding[];
}

export function buildYamlDiffPreview(beforeYaml: string, afterYaml: string): ConfigDiffPreview {
  const before = parseYamlValue(beforeYaml, "before");
  const after = parseYamlValue(afterYaml, "after");
  const findings = [...before.findings, ...after.findings];

  if (findings.length > 0) {
    return { entries: [], findings };
  }

  const changes = diff(before.value, after.value, {
    embeddedObjKeys: {
      proxies: "name",
      "proxy-groups": "name",
      rules: "$value",
    },
    treatTypeChangeAsReplace: false,
  });
  const atomic = atomizeChangeset(changes);

  return {
    entries: atomic.map((change, index) => ({
      id: `${change.type}-${change.path}-${index}`,
      type: change.type,
      path: change.path,
      key: change.key,
      oldValue: summarizeDiffValue(change.oldValue),
      value: summarizeDiffValue(change.value),
    })),
    findings,
  };
}

function parseYamlValue(raw: string, side: "before" | "after"): { value: unknown; findings: Finding[] } {
  const document = parseDocument(raw, {
    prettyErrors: true,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    return {
      value: undefined,
      findings: document.errors.map((error, index) => ({
        id: `diff-${side}-yaml-error-${index}`,
        severity: "error",
        title: side === "before" ? "原配置无法对比" : "目标配置无法对比",
        message: error.message,
        path: "/",
      })),
    };
  }

  return {
    value: document.toJS({ maxAliasCount: 100 }),
    findings: [],
  };
}

function summarizeDiffValue(value: unknown): string {
  if (value === undefined) return "-";
  if (value === null) return "null";
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return truncate(JSON.stringify(value));
}

function truncate(value: string, maxLength = 120): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

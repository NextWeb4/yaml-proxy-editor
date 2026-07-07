import { parseDocument, stringify } from "yaml";
import type { Finding, MergePreview, ProxyGroup, ProxyNode, RuleItem } from "../../types/domain";
import { isRecord, parseProxyGroups, parseProxyNodes, parseRules } from "../clash/clashService";
import { normalizeRuleStrings } from "../rules/ruleEditor";

export type MergePriority = "local-first" | "incoming-first";
export type MergeConflictChoice = "local" | "incoming";

export interface MergeYamlOptions {
  nodePriority?: MergePriority;
  groupPriority?: MergePriority;
  rulePriority?: MergePriority;
  dnsPriority?: MergePriority;
  conflictResolutions?: Record<string, MergeConflictChoice>;
}

export interface MergeConflict {
  id: string;
  kind: "proxy" | "proxy-group" | "dns";
  label: string;
  path: string;
  localValue: string;
  incomingValue: string;
  selected: MergeConflictChoice;
}

export interface MergeYamlSummary {
  localProxyCount: number;
  incomingProxyCount: number;
  mergedProxyCount: number;
  mergedGroupCount: number;
  mergedRuleCount: number;
}

export interface MergeYamlResult {
  yaml: string;
  preview: MergePreview;
  findings: Finding[];
  conflicts: MergeConflict[];
  summary: MergeYamlSummary;
}

export interface MergeYamlBatchItem {
  name: string;
  content: string;
}

export interface MergeYamlBatchSourceSummary {
  name: string;
  incomingProxyCount: number;
  mergedProxyCount: number;
  findingCount: number;
  status: "merged" | "blocked";
}

export interface MergeYamlBatchSummary extends MergeYamlSummary {
  sourceCount: number;
  appliedSourceCount: number;
}

export interface MergeYamlBatchResult extends Omit<MergeYamlResult, "summary"> {
  summary: MergeYamlBatchSummary;
  sources: MergeYamlBatchSourceSummary[];
}

type ConfigRecord = Record<string, unknown>;

const ARRAY_DNS_KEYS = new Set(["nameserver", "fallback", "default-nameserver", "fake-ip-filter"]);
const GROUP_FIELD_CONFLICT_KEYS = new Set(["type", "url", "interval", "tolerance", "lazy", "filter"]);

export function mergeProxyNodes(localNodes: ProxyNode[], subscriptionNodes: ProxyNode[]): MergePreview {
  const nodesByIdentity = new Map<string, ProxyNode>();
  const findings: Finding[] = [];

  for (const node of [...localNodes, ...subscriptionNodes]) {
    const identity = proxyIdentity(node);
    if (nodesByIdentity.has(identity)) {
      findings.push({
        id: `dedupe-node-${identity}`,
        severity: "info",
        title: "节点已去重",
        message: `节点「${node.name}」与已有节点服务器、端口、协议一致。`,
        path: "/proxies",
      });
      continue;
    }
    nodesByIdentity.set(identity, node);
  }

  return {
    proxies: Array.from(nodesByIdentity.values()),
    proxyGroups: [],
    rules: [],
    findings,
  };
}

export function mergeGroups(localGroups: ProxyGroup[], generatedGroups: ProxyGroup[]): ProxyGroup[] {
  const groupsByName = new Map(localGroups.map((group) => [group.name, group]));
  for (const group of generatedGroups) {
    if (!groupsByName.has(group.name)) {
      groupsByName.set(group.name, group);
    }
  }
  return Array.from(groupsByName.values());
}

export function mergeRules(localRules: RuleItem[], templateRules: RuleItem[]): RuleItem[] {
  const seen = new Set(localRules.map((rule) => rule.raw));
  const merged = [...localRules];
  for (const rule of templateRules) {
    if (!seen.has(rule.raw)) {
      merged.push({ ...rule, index: merged.length });
      seen.add(rule.raw);
    }
  }
  return merged.map((rule, index) => ({ ...rule, index }));
}

export function mergeYamlConfigs(localYaml: string, incomingYaml: string, options: MergeYamlOptions = {}): MergeYamlResult {
  const nodePriority = options.nodePriority ?? "incoming-first";
  const groupPriority = options.groupPriority ?? "local-first";
  const rulePriority = options.rulePriority ?? "local-first";
  const dnsPriority = options.dnsPriority ?? "local-first";
  const local = parseYamlConfig(localYaml, "local");
  const incoming = parseYamlConfig(incomingYaml, "incoming");
  const parseFindings = [...local.findings, ...incoming.findings];

  if (parseFindings.length > 0) {
    return emptyMergeResult(localYaml, parseFindings);
  }

  const findings: Finding[] = [];
  const conflicts: MergeConflict[] = [];
  const mergedConfig: ConfigRecord =
    groupPriority === "incoming-first" ? { ...local.config, ...incoming.config } : { ...incoming.config, ...local.config };
  const mergedProxies = mergeProxyRecords(
    readRecordArray(local.config.proxies),
    readRecordArray(incoming.config.proxies),
    nodePriority,
    options.conflictResolutions ?? {},
    findings,
    conflicts,
  );
  const mergedGroups = mergeProxyGroupRecords(
    readRecordArray(local.config["proxy-groups"]),
    readRecordArray(incoming.config["proxy-groups"]),
    groupPriority,
    options.conflictResolutions ?? {},
    findings,
    conflicts,
  );
  const mergedRules = mergeRuleStrings(readStringArray(local.config.rules), readStringArray(incoming.config.rules), rulePriority, findings);
  const mergedDns = mergeDnsRecords(local.config.dns, incoming.config.dns, dnsPriority, options.conflictResolutions ?? {}, findings, conflicts);

  if (mergedProxies.length > 0) mergedConfig.proxies = mergedProxies;
  if (mergedGroups.length > 0) mergedConfig["proxy-groups"] = mergedGroups;
  if (mergedRules.length > 0) mergedConfig.rules = mergedRules;
  if (mergedDns) mergedConfig.dns = mergedDns;

  const yaml = stringify(mergedConfig, {
    indent: 2,
    lineWidth: 0,
  });
  const preview: MergePreview = {
    proxies: parseProxyNodes(mergedConfig.proxies, "merged"),
    proxyGroups: parseProxyGroups(mergedConfig["proxy-groups"]),
    rules: parseRules(mergedConfig.rules),
    findings,
  };

  return {
    yaml,
    preview,
    findings,
    conflicts,
    summary: {
      localProxyCount: readRecordArray(local.config.proxies).length,
      incomingProxyCount: readRecordArray(incoming.config.proxies).length,
      mergedProxyCount: mergedProxies.length,
      mergedGroupCount: mergedGroups.length,
      mergedRuleCount: mergedRules.length,
    },
  };
}

export function mergeYamlConfigBatch(
  localYaml: string,
  incomingItems: MergeYamlBatchItem[],
  options: MergeYamlOptions = {},
): MergeYamlBatchResult {
  const items = normalizeBatchItems(incomingItems);
  const localSnapshot = summarizeYamlConfig(localYaml);

  if (items.length === 0) {
    return {
      yaml: localYaml,
      preview: localSnapshot.preview,
      findings: localSnapshot.findings,
      conflicts: [],
      summary: {
        ...localSnapshot.summary,
        sourceCount: 0,
        appliedSourceCount: 0,
      },
      sources: [],
    };
  }

  let currentYaml = localYaml;
  let totalIncomingProxyCount = 0;
  let appliedSourceCount = 0;
  let lastResult: MergeYamlResult | undefined;
  const findings: Finding[] = [];
  const sources: MergeYamlBatchSourceSummary[] = [];

  for (const [index, item] of items.entries()) {
    const result = mergeYamlConfigs(currentYaml, item.content, options);
    const hasBlockingError = result.findings.some((finding) => finding.severity === "error");
    const sourceFindings = tagFindingsWithSource(result.findings, item.name, index);

    findings.push(...sourceFindings);
    totalIncomingProxyCount += result.summary.incomingProxyCount;
    sources.push({
      name: item.name,
      incomingProxyCount: result.summary.incomingProxyCount,
      mergedProxyCount: result.summary.mergedProxyCount,
      findingCount: result.findings.length,
      status: hasBlockingError ? "blocked" : "merged",
    });

    if (hasBlockingError) {
      const currentSnapshot = summarizeYamlConfig(currentYaml);
      return {
        yaml: currentYaml,
        preview: {
          ...currentSnapshot.preview,
          findings,
        },
        findings,
        conflicts: result.conflicts,
        summary: {
          ...currentSnapshot.summary,
          incomingProxyCount: totalIncomingProxyCount,
          sourceCount: items.length,
          appliedSourceCount,
        },
        sources,
      };
    }

    currentYaml = result.yaml;
    lastResult = result;
    appliedSourceCount += 1;
  }

  const finalPreview = lastResult?.preview ?? localSnapshot.preview;
  const finalSummary = lastResult?.summary ?? localSnapshot.summary;

  return {
    yaml: currentYaml,
    preview: {
      ...finalPreview,
      findings,
    },
    findings,
    conflicts: lastResult?.conflicts ?? [],
    summary: {
      localProxyCount: localSnapshot.summary.localProxyCount,
      incomingProxyCount: totalIncomingProxyCount,
      mergedProxyCount: finalSummary.mergedProxyCount,
      mergedGroupCount: finalSummary.mergedGroupCount,
      mergedRuleCount: finalSummary.mergedRuleCount,
      sourceCount: items.length,
      appliedSourceCount,
    },
    sources,
  };
}

function proxyIdentity(node: ProxyNode): string {
  return [node.type, node.server ?? node.name, node.port ?? ""].join("|").toLowerCase();
}

function parseYamlConfig(source: string, side: "local" | "incoming"): { config: ConfigRecord; findings: Finding[] } {
  const document = parseDocument(source, {
    prettyErrors: true,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    return {
      config: {},
      findings: document.errors.map((error, index) => ({
        id: `merge-${side}-yaml-error-${index}`,
        severity: "error",
        title: side === "local" ? "本地配置无法合并" : "待合并配置无法合并",
        message: error.message,
        path: "/merge",
      })),
    };
  }

  const value = document.toJS({ maxAliasCount: 100 });
  return {
    config: isRecord(value) ? { ...value } : {},
    findings: [],
  };
}

function mergeProxyRecords(
  localProxies: ConfigRecord[],
  incomingProxies: ConfigRecord[],
  priority: MergePriority,
  conflictResolutions: Record<string, MergeConflictChoice>,
  findings: Finding[],
  conflicts: MergeConflict[],
): ConfigRecord[] {
  const ordered =
    priority === "incoming-first"
      ? [
          ...incomingProxies.map((proxy) => ({ proxy, side: "incoming" as const })),
          ...localProxies.map((proxy) => ({ proxy, side: "local" as const })),
        ]
      : [
          ...localProxies.map((proxy) => ({ proxy, side: "local" as const })),
          ...incomingProxies.map((proxy) => ({ proxy, side: "incoming" as const })),
        ];
  const result: ConfigRecord[] = [];
  const identitySet = new Set<string>();
  const nameToEntry = new Map<
    string,
    {
      identity: string;
      index: number;
      proxy: ConfigRecord;
      side: MergeConflictChoice;
    }
  >();

  for (const { proxy, side } of ordered) {
    const identity = proxyRecordIdentity(proxy);
    const name = String(proxy.name ?? "");
    const existingNameEntry = name ? nameToEntry.get(name) : undefined;

    if (identitySet.has(identity)) {
      findings.push({
        id: `merge-dedupe-proxy-${identity}`,
        severity: "info",
        title: "合并节点已去重",
        message: `节点「${name || identity}」与已有节点服务器、端口、协议一致。`,
        path: "/proxies",
      });
      continue;
    }

    if (existingNameEntry && existingNameEntry.identity !== identity) {
      const id = `merge-proxy-name-conflict-${name}`;
      const localProxy = existingNameEntry.side === "local" ? existingNameEntry.proxy : side === "local" ? proxy : undefined;
      const incomingProxy = existingNameEntry.side === "incoming" ? existingNameEntry.proxy : side === "incoming" ? proxy : undefined;
      const selected = conflictResolutions[id] ?? (priority === "incoming-first" ? "incoming" : "local");
      const shouldReplace = selected === side;

      conflicts.push({
        id,
        kind: "proxy",
        label: `节点「${name}」`,
        path: "/proxies",
        localValue: summarizeProxyRecord(localProxy),
        incomingValue: summarizeProxyRecord(incomingProxy),
        selected,
      });
      findings.push({
        id,
        severity: "warning",
        title: "节点名称冲突",
        message: `节点「${name}」名称相同但服务器或协议不同，已${conflictResolutions[id] ? "按手动选择" : "按全局策略"}保留${selected === "incoming" ? "待合并配置" : "本地配置"}。`,
        path: "/proxies",
      });
      if (shouldReplace) {
        result[existingNameEntry.index] = proxy;
        identitySet.delete(existingNameEntry.identity);
        identitySet.add(identity);
        nameToEntry.set(name, {
          identity,
          index: existingNameEntry.index,
          proxy,
          side,
        });
      }
      continue;
    }

    identitySet.add(identity);
    if (name) {
      nameToEntry.set(name, {
        identity,
        index: result.length,
        proxy,
        side,
      });
    }
    result.push(proxy);
  }

  return result;
}

function mergeProxyGroupRecords(
  localGroups: ConfigRecord[],
  incomingGroups: ConfigRecord[],
  priority: MergePriority,
  conflictResolutions: Record<string, MergeConflictChoice>,
  findings: Finding[],
  conflicts: MergeConflict[],
): ConfigRecord[] {
  const primaryGroups = priority === "incoming-first" ? incomingGroups : localGroups;
  const secondaryGroups = priority === "incoming-first" ? localGroups : incomingGroups;
  const groupsByName = new Map<string, ConfigRecord>();

  for (const group of primaryGroups) {
    groupsByName.set(String(group.name ?? "未命名分组"), { ...group });
  }

  for (const group of secondaryGroups) {
    const name = String(group.name ?? "未命名分组");
    const existing = groupsByName.get(name);
    if (!existing) {
      groupsByName.set(name, { ...group });
      continue;
    }

    const localGroup = priority === "incoming-first" ? group : existing;
    const incomingGroup = priority === "incoming-first" ? existing : group;
    groupsByName.set(name, mergeGroupRecord(localGroup, incomingGroup, name, priority, conflictResolutions, findings, conflicts));
  }

  return Array.from(groupsByName.values());
}

function mergeGroupRecord(
  localGroup: ConfigRecord,
  incomingGroup: ConfigRecord,
  name: string,
  priority: MergePriority,
  conflictResolutions: Record<string, MergeConflictChoice>,
  findings: Finding[],
  conflicts: MergeConflict[],
): ConfigRecord {
  const primary = priority === "incoming-first" ? incomingGroup : localGroup;
  const secondary = priority === "incoming-first" ? localGroup : incomingGroup;
  const merged: ConfigRecord = { ...secondary, ...primary };
  merged.proxies = mergeStringLists(readStringArray(primary.proxies), readStringArray(secondary.proxies));
  const mergedUse = mergeStringLists(readStringArray(primary.use), readStringArray(secondary.use));
  if (mergedUse.length > 0) merged.use = mergedUse;

  for (const key of GROUP_FIELD_CONFLICT_KEYS) {
    if (!(key in localGroup) || !(key in incomingGroup) || valuesEqual(localGroup[key], incomingGroup[key])) continue;

    const id = `merge-group-field-conflict-${name}-${key}`;
    const selected = conflictResolutions[id] ?? (priority === "incoming-first" ? "incoming" : "local");
    merged[key] = selected === "incoming" ? incomingGroup[key] : localGroup[key];
    conflicts.push({
      id,
      kind: "proxy-group",
      label: `分组「${name}」字段「${key}」`,
      path: `/proxy-groups/${name}/${key}`,
      localValue: summarizeConfigValue(localGroup[key]),
      incomingValue: summarizeConfigValue(incomingGroup[key]),
      selected,
    });
    findings.push({
      id,
      severity: "info",
      title: "代理分组字段冲突",
      message: `分组「${name}」字段「${key}」不同，已${conflictResolutions[id] ? "按手动选择" : "按全局策略"}保留${selected === "incoming" ? "待合并配置" : "本地配置"}。`,
      path: `/proxy-groups/${name}`,
    });
  }

  return merged;
}

function mergeRuleStrings(
  localRules: string[],
  incomingRules: string[],
  priority: MergePriority,
  findings: Finding[],
): string[] {
  const primaryRules = priority === "incoming-first" ? incomingRules : localRules;
  const secondaryRules = priority === "incoming-first" ? localRules : incomingRules;
  const primaryParsed = parseRules(primaryRules);
  const secondaryParsed = parseRules(secondaryRules);
  const nonMatchRules = [
    ...primaryParsed.filter((rule) => rule.type !== "MATCH").map((rule) => rule.raw),
    ...secondaryParsed.filter((rule) => rule.type !== "MATCH").map((rule) => rule.raw),
  ];
  const match =
    [...primaryParsed].reverse().find((rule) => rule.type === "MATCH") ??
    [...secondaryParsed].reverse().find((rule) => rule.type === "MATCH");
  const beforeCount = [...primaryRules, ...secondaryRules].filter(Boolean).length;
  const merged = normalizeRuleStrings([...nonMatchRules, match?.raw ?? "MATCH,DIRECT"]);

  if (merged.length < beforeCount) {
    findings.push({
      id: "merge-rules-deduped",
      severity: "info",
      title: "合并规则已去重",
      message: "重复分流规则已在合并时移除，并保持 MATCH 在最后。",
      path: "/rules",
    });
  }

  return merged;
}

function mergeDnsRecords(
  localDns: unknown,
  incomingDns: unknown,
  priority: MergePriority,
  conflictResolutions: Record<string, MergeConflictChoice>,
  findings: Finding[],
  conflicts: MergeConflict[],
): ConfigRecord | undefined {
  if (!isRecord(localDns) && !isRecord(incomingDns)) return undefined;
  if (!isRecord(localDns)) return isRecord(incomingDns) ? { ...incomingDns } : undefined;
  if (!isRecord(incomingDns)) return { ...localDns };

  const primary = priority === "incoming-first" ? incomingDns : localDns;
  const secondary = priority === "incoming-first" ? localDns : incomingDns;
  const keys = new Set([...Object.keys(secondary), ...Object.keys(primary)]);
  const merged: ConfigRecord = {};

  for (const key of keys) {
    if (ARRAY_DNS_KEYS.has(key)) {
      merged[key] = mergeStringLists(readStringArray(primary[key]), readStringArray(secondary[key]));
      continue;
    }

    if (key in localDns && key in incomingDns) {
      if (valuesEqual(localDns[key], incomingDns[key])) {
        merged[key] = primary[key];
      } else {
        const id = `merge-dns-field-conflict-${key}`;
        const selected = conflictResolutions[id] ?? (priority === "incoming-first" ? "incoming" : "local");
        merged[key] = selected === "incoming" ? incomingDns[key] : localDns[key];
        conflicts.push({
          id,
          kind: "dns",
          label: `DNS 字段「${key}」`,
          path: `/dns/${key}`,
          localValue: summarizeConfigValue(localDns[key]),
          incomingValue: summarizeConfigValue(incomingDns[key]),
          selected,
        });
        findings.push({
          id,
          severity: "info",
          title: "DNS 字段冲突",
          message: `DNS 字段「${key}」不同，已${conflictResolutions[id] ? "按手动选择" : "按全局策略"}保留${selected === "incoming" ? "待合并配置" : "本地配置"}。`,
          path: `/dns/${key}`,
        });
      }
      continue;
    }

    merged[key] = key in primary ? primary[key] : secondary[key];
  }

  return merged;
}

function emptyMergeResult(source: string, findings: Finding[]): MergeYamlResult {
  return {
    yaml: source,
    preview: {
      proxies: [],
      proxyGroups: [],
      rules: [],
      findings,
    },
    findings,
    conflicts: [],
    summary: {
      localProxyCount: 0,
      incomingProxyCount: 0,
      mergedProxyCount: 0,
      mergedGroupCount: 0,
      mergedRuleCount: 0,
    },
  };
}

function summarizeYamlConfig(source: string): { preview: MergePreview; findings: Finding[]; summary: MergeYamlSummary } {
  const parsed = parseYamlConfig(source, "local");
  if (parsed.findings.length > 0) {
    return {
      preview: {
        proxies: [],
        proxyGroups: [],
        rules: [],
        findings: parsed.findings,
      },
      findings: parsed.findings,
      summary: {
        localProxyCount: 0,
        incomingProxyCount: 0,
        mergedProxyCount: 0,
        mergedGroupCount: 0,
        mergedRuleCount: 0,
      },
    };
  }

  const proxies = readRecordArray(parsed.config.proxies);
  const groups = readRecordArray(parsed.config["proxy-groups"]);
  const rules = readStringArray(parsed.config.rules);

  return {
    preview: {
      proxies: parseProxyNodes(parsed.config.proxies, "local"),
      proxyGroups: parseProxyGroups(parsed.config["proxy-groups"]),
      rules: parseRules(parsed.config.rules),
      findings: [],
    },
    findings: [],
    summary: {
      localProxyCount: proxies.length,
      incomingProxyCount: 0,
      mergedProxyCount: proxies.length,
      mergedGroupCount: groups.length,
      mergedRuleCount: rules.length,
    },
  };
}

function normalizeBatchItems(items: MergeYamlBatchItem[]): MergeYamlBatchItem[] {
  return items.map((item, index) => ({
    name: item.name.trim() || `YAML ${index + 1}`,
    content: item.content,
  }));
}

function tagFindingsWithSource(findings: Finding[], sourceName: string, sourceIndex: number): Finding[] {
  return findings.map((finding, index) => ({
    ...finding,
    id: `merge-source-${sourceIndex + 1}-${sanitizeIdSegment(sourceName)}-${finding.id}-${index}`,
    message: `来源 ${sourceName}：${finding.message}`,
  }));
}

function sanitizeIdSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "yaml";
}

function proxyRecordIdentity(proxy: ConfigRecord): string {
  return [proxy.type ?? "unknown", proxy.server ?? proxy.name ?? "", proxy.port ?? ""].join("|").toLowerCase();
}

function summarizeProxyRecord(proxy: ConfigRecord | undefined): string {
  if (!proxy) return "未提供";
  const type = String(proxy.type ?? "unknown");
  const server = String(proxy.server ?? proxy.name ?? "unknown");
  const port = proxy.port === undefined ? "" : `:${String(proxy.port)}`;
  return `${type} ${server}${port}`;
}

function summarizeConfigValue(value: unknown): string {
  if (value === undefined) return "未提供";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  const serialized = JSON.stringify(value);
  if (!serialized) return String(value);
  return serialized.length > 96 ? `${serialized.slice(0, 93)}...` : serialized;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readRecordArray(value: unknown): ConfigRecord[] {
  return Array.isArray(value) ? value.filter(isRecord).map((item) => ({ ...item })) : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function mergeStringLists(primary: string[], secondary: string[]): string[] {
  return Array.from(new Set([...primary, ...secondary]));
}

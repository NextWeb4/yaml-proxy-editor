import { isMap, isSeq, parseDocument, type Document, type YAMLMap, type YAMLSeq } from "yaml";
import type { Finding, StructureNode, YamlAnalysis, YamlFormatSummary, YamlInventorySection } from "../../types/domain";
import { analyzeClashConfig, isRecord, parseRules } from "../clash/clashService";

const CLASH_SECTION_LABELS: Record<string, string> = {
  port: "基础端口配置",
  "socks-port": "基础端口配置",
  "redir-port": "基础端口配置",
  "mixed-port": "基础端口配置",
  "tproxy-port": "基础端口配置",
  "allow-lan": "基础端口配置",
  mode: "基础端口配置",
  "log-level": "基础端口配置",
  "external-controller": "OpenClash 兼容配置",
  secret: "OpenClash 兼容配置",
  dns: "DNS 配置",
  tun: "TUN 配置",
  profile: "OpenClash 兼容配置",
  proxies: "代理节点",
  "proxy-providers": "代理订阅",
  "proxy-groups": "代理分组",
  "rule-providers": "规则订阅",
  rules: "分流规则",
  sniffer: "嗅探配置",
  hosts: "OpenClash 兼容配置",
};

export function analyzeYaml(source: string): YamlAnalysis {
  const strictDocument = parseDocument(source, {
    prettyErrors: true,
    uniqueKeys: true,
  });
  const looseDocument = parseDocument(source, {
    prettyErrors: true,
    uniqueKeys: false,
  });
  const syntaxFindings = collectSyntaxFindings(strictDocument);
  const hasStrictError = syntaxFindings.some((finding) => finding.severity === "error");
  const readableValue = looseDocument.errors.length === 0 ? looseDocument.toJS({ maxAliasCount: 100 }) : undefined;
  const value = hasStrictError ? readableValue : strictDocument.toJS({ maxAliasCount: 100 });
  const structure = buildStructure(looseDocument.errors.length === 0 ? looseDocument : strictDocument);
  const duplicateKeyCount = syntaxFindings.filter(isDuplicateKeyFinding).length;
  const clash = analyzeClashConfig(value);

  return {
    value,
    formatted: hasStrictError ? undefined : formatYaml(source),
    syntaxFindings,
    structure,
    formatSummary: buildFormatSummary(value, duplicateKeyCount),
    inventory: buildInventory(value),
    clash,
  };
}

export function formatYaml(source: string): string {
  const document = parseDocument(source, {
    prettyErrors: true,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("; "));
  }

  return document.toString({
    indent: 2,
    lineWidth: 0,
  });
}

export interface SaveValidationResult {
  canSave: boolean;
  findings: Finding[];
}

export function validateYamlBeforeSave(source: string): SaveValidationResult {
  const document = parseDocument(source, {
    prettyErrors: true,
    uniqueKeys: true,
  });
  const findings = collectSyntaxFindings(document);

  return {
    canSave: !findings.some((finding) => finding.severity === "error"),
    findings,
  };
}

function collectSyntaxFindings(document: Document.Parsed): Finding[] {
  const errors = document.errors.map<Finding>((error, index) => ({
    id: `yaml-error-${index}`,
    severity: "error",
    title: "YAML 语法错误",
    message: error.message,
    path: "/",
    position: {
      offset: Array.isArray(error.pos) ? error.pos[0] : undefined,
    },
  }));

  const warnings = document.warnings.map<Finding>((warning, index) => ({
    id: `yaml-warning-${index}`,
    severity: "warning",
    title: "YAML 警告",
    message: warning.message,
    path: "/",
    position: {
      offset: Array.isArray(warning.pos) ? warning.pos[0] : undefined,
    },
  }));

  return [...errors, ...warnings];
}

function buildFormatSummary(value: unknown, duplicateKeyCount: number): YamlFormatSummary {
  const topLevelKeys = isRecord(value) ? Object.keys(value) : [];
  const rootKind = value === undefined
    ? "invalid"
    : value === null
      ? "empty"
      : Array.isArray(value)
        ? "array"
        : isRecord(value)
          ? "object"
          : "scalar";

  return {
    rootKind,
    dialect: detectDialect(topLevelKeys),
    topLevelKeys,
    readable: value !== undefined,
    duplicateKeyCount,
  };
}

function detectDialect(keys: string[]): YamlFormatSummary["dialect"] {
  const keySet = new Set(keys);
  if (
    keySet.has("proxy-groups") ||
    keySet.has("proxies") ||
    keySet.has("proxy-providers") ||
    keySet.has("rules") ||
    keySet.has("rule-providers")
  ) {
    return keySet.has("dns") || keySet.has("tun") || keySet.has("profile") || keySet.has("sniffer")
      ? "Clash/Mihomo/OpenClash"
      : "Clash-like";
  }
  return keys.length > 0 ? "通用 YAML" : "无法识别";
}

function buildInventory(value: unknown): YamlInventorySection[] {
  if (Array.isArray(value)) {
    return [
      {
        id: "root-array",
        title: "根列表",
        count: value.length,
        items: value.slice(0, 120).map((item, index) => ({
          id: `root-array-${index}`,
          label: `${index + 1}. ${summarizeValue(item)}`,
          path: `/${index}`,
        })),
      },
    ];
  }

  if (!isRecord(value)) return [];

  return [
    providerInventory(value["proxy-providers"], "proxy-providers", "代理订阅"),
    proxyInventory(value.proxies),
    proxyGroupInventory(value["proxy-groups"]),
    ruleProviderInventory(value["rule-providers"]),
    ruleInventory(value.rules),
    dnsInventory(value.dns),
    tunInventory(value.tun),
    recordFieldInventory(value.profile, "profile", "Profile"),
    recordFieldInventory(value.sniffer, "sniffer", "嗅探"),
    recordFieldInventory(value.hosts, "hosts", "Hosts"),
    topLevelInventory(value),
  ].filter((section): section is YamlInventorySection => section !== undefined && section.count > 0);
}

function providerInventory(value: unknown, key: "proxy-providers" | "rule-providers", title: string): YamlInventorySection | undefined {
  if (!isRecord(value)) return undefined;

  const entries = Object.entries(value);
  return {
    id: key,
    title,
    count: entries.length,
    items: entries.slice(0, 120).map(([name, provider]) => ({
      id: `${key}-${slugId(name)}`,
      label: name,
      detail: providerDetail(provider),
      path: `/${key}/${escapeJsonPointer(name)}`,
    })),
  };
}

function proxyInventory(value: unknown): YamlInventorySection | undefined {
  if (!Array.isArray(value)) return undefined;

  return {
    id: "proxies",
    title: "本地节点",
    count: value.length,
    items: value.slice(0, 120).map((proxy, index) => {
      const name = isRecord(proxy) && typeof proxy.name === "string" ? proxy.name : `未命名节点 ${index + 1}`;
      const type = isRecord(proxy) ? String(proxy.type ?? "unknown") : "unknown";
      const server = isRecord(proxy) && typeof proxy.server === "string" ? proxy.server : "";
      const port = isRecord(proxy) && proxy.port !== undefined ? String(proxy.port) : "";
      return {
        id: `proxy-${index}-${slugId(name)}`,
        label: name,
        detail: [type, [server, port].filter(Boolean).join(":")].filter(Boolean).join(" · "),
        path: `/proxies/${index}`,
      };
    }),
  };
}

function proxyGroupInventory(value: unknown): YamlInventorySection | undefined {
  if (!Array.isArray(value)) return undefined;

  return {
    id: "proxy-groups",
    title: "策略组",
    count: value.length,
    items: value.slice(0, 120).map((group, index) => {
      const name = isRecord(group) && typeof group.name === "string" ? group.name : `未命名分组 ${index + 1}`;
      const type = isRecord(group) ? String(group.type ?? "select") : "select";
      const proxies = isRecord(group) && Array.isArray(group.proxies) ? group.proxies.length : 0;
      const use = isRecord(group) && Array.isArray(group.use) ? group.use.length : 0;
      return {
        id: `proxy-group-${index}-${slugId(name)}`,
        label: name,
        detail: `${type} · proxies ${proxies} · use ${use}`,
        path: `/proxy-groups/${index}`,
      };
    }),
  };
}

function ruleProviderInventory(value: unknown): YamlInventorySection | undefined {
  return providerInventory(value, "rule-providers", "规则订阅");
}

function ruleInventory(value: unknown): YamlInventorySection | undefined {
  if (!Array.isArray(value)) return undefined;

  const rules = parseRules(value.map(String));
  return {
    id: "rules",
    title: "分流规则",
    count: value.length,
    items: rules.slice(0, 120).map((rule) => ({
      id: `rule-${rule.index}`,
      label: `${rule.index + 1}. ${truncate(rule.raw, 74)}`,
      detail: [rule.type, rule.target ? `→ ${rule.target}` : undefined].filter(Boolean).join(" "),
      path: `/rules/${rule.index}`,
    })),
  };
}

function dnsInventory(value: unknown): YamlInventorySection | undefined {
  if (!isRecord(value)) return undefined;

  const fields = [
    ["enable", value.enable],
    ["listen", value.listen],
    ["ipv6", value.ipv6],
    ["enhanced-mode", value["enhanced-mode"]],
    ["nameserver", listCount(value.nameserver)],
    ["fallback", listCount(value.fallback)],
    ["nameserver-policy", objectCount(value["nameserver-policy"])],
    ["fake-ip-filter", listCount(value["fake-ip-filter"])],
  ].filter(([, fieldValue]) => fieldValue !== undefined);

  return {
    id: "dns",
    title: "DNS 配置",
    count: fields.length,
    items: fields.map(([key, fieldValue]) => ({
      id: `dns-${key}`,
      label: String(key),
      detail: String(fieldValue),
      path: `/dns/${key}`,
    })),
  };
}

function tunInventory(value: unknown): YamlInventorySection | undefined {
  if (!isRecord(value)) return undefined;

  const fields = ["enable", "stack", "auto-route", "auto-detect-interface", "strict-route", "dns-hijack"]
    .filter((key) => value[key] !== undefined)
    .map((key) => [key, Array.isArray(value[key]) ? `${value[key].length} 项` : value[key]] as const);

  return {
    id: "tun",
    title: "TUN 配置",
    count: fields.length,
    items: fields.map(([key, fieldValue]) => ({
      id: `tun-${key}`,
      label: key,
      detail: String(fieldValue),
      path: `/tun/${key}`,
    })),
  };
}

function recordFieldInventory(value: unknown, key: string, title: string): YamlInventorySection | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  return {
    id: key,
    title,
    count: entries.length,
    items: entries.slice(0, 80).map(([name, fieldValue]) => ({
      id: `${key}-${slugId(name)}`,
      label: name,
      detail: summarizeValue(fieldValue),
      path: `/${key}/${escapeJsonPointer(name)}`,
    })),
  };
}

function topLevelInventory(value: Record<string, unknown>): YamlInventorySection {
  const knownKeys = new Set([
    "proxy-providers",
    "proxies",
    "proxy-groups",
    "rule-providers",
    "rules",
    "dns",
    "tun",
    "profile",
    "sniffer",
    "hosts",
  ]);
  const entries = Object.entries(value).filter(([key]) => !knownKeys.has(key));

  return {
    id: "top-level",
    title: "其他顶层字段",
    count: entries.length,
    items: entries.slice(0, 80).map(([key, fieldValue]) => ({
      id: `top-${slugId(key)}`,
      label: key,
      detail: summarizeValue(fieldValue),
      path: `/${escapeJsonPointer(key)}`,
    })),
  };
}

function buildStructure(document: Document.Parsed): StructureNode[] {
  const root = document.contents;
  if (!isMap(root)) {
    return [];
  }

  const grouped = new Map<string, StructureNode>();

  for (const item of root.items) {
    const key = String(item.key?.toJSON?.() ?? item.key ?? "");
    if (!key) {
      continue;
    }

    const sectionLabel = CLASH_SECTION_LABELS[key] ?? "其他配置";
    const sectionId = `section-${sectionLabel}`;
    const section =
      grouped.get(sectionId) ??
      ({
        id: sectionId,
        label: sectionLabel,
        kind: "section",
        path: "/",
        children: [],
      } satisfies StructureNode);

    section.children?.push(nodeForValue(key, item.value, `/${key}`));
    section.count = section.children?.length ?? 0;
    grouped.set(sectionId, section);
  }

  return Array.from(grouped.values());
}

function providerDetail(provider: unknown): string {
  if (!isRecord(provider)) return summarizeValue(provider);
  const type = String(provider.type ?? "unknown");
  const behavior = provider.behavior ? String(provider.behavior) : undefined;
  const interval = provider.interval ? `${provider.interval}s` : undefined;
  const urlHost = typeof provider.url === "string" ? summarizeUrl(provider.url) : undefined;
  return [type, behavior, interval, urlHost].filter(Boolean).join(" · ");
}

function summarizeValue(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} 项`;
  if (isRecord(value)) return `${Object.keys(value).length} 个字段`;
  if (value === null) return "null";
  if (value === undefined) return "";
  return truncate(String(value), 80);
}

function summarizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}${url.pathname && url.pathname !== "/" ? "/..." : "/"}`;
  } catch {
    return truncate(rawUrl, 80);
  }
}

function listCount(value: unknown): string | undefined {
  return Array.isArray(value) ? `${value.length} 项` : value === undefined ? undefined : summarizeValue(value);
}

function objectCount(value: unknown): string | undefined {
  return isRecord(value) ? `${Object.keys(value).length} 项` : value === undefined ? undefined : summarizeValue(value);
}

function isDuplicateKeyFinding(finding: Finding): boolean {
  return /unique|duplicate|duplicated|重复/i.test(finding.message);
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, Math.max(0, length - 1))}…` : value;
}

function escapeJsonPointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function slugId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function nodeForValue(key: string, value: unknown, path: string): StructureNode {
  if (isSeq(value)) {
    return {
      id: path,
      label: key,
      kind: "collection",
      path,
      count: (value as YAMLSeq).items.length,
    };
  }

  if (isMap(value)) {
    const map = value as YAMLMap;
    return {
      id: path,
      label: key,
      kind: "collection",
      path,
      count: map.items.length,
      children: map.items.slice(0, 20).map((item) => {
        const childKey = String((item.key as { toJSON?: () => unknown } | undefined)?.toJSON?.() ?? item.key ?? "");
        return nodeForValue(childKey, item.value, `${path}/${childKey}`);
      }),
    };
  }

  return {
    id: path,
    label: key,
    kind: "field",
    path,
  };
}

import { isMap, parseDocument, stringify, type Document } from "yaml";
import type { Finding } from "../../types/domain";
import { isRecord, parseRules } from "../clash/clashService";

export interface ProxyProviderInput {
  name: string;
  url: string;
  previousName?: string;
}

export interface ProxyProviderBatchInput {
  name: string;
  url: string;
}

export interface ProxyProviderPreviewInput {
  name: string;
  url: string;
  existingProvider?: unknown;
}

export interface ProxyProviderEditSummary {
  providerName: string;
  updatedExisting: boolean;
  addedToGroupCount: number;
  duplicateProviderCount: number;
  removedFromGroupCount?: number;
}

export interface ProxyProviderEditResult {
  yaml: string;
  findings: Finding[];
  summary: ProxyProviderEditSummary;
}

export interface ProxyProviderBatchEditSummary {
  requestedCount: number;
  upsertedCount: number;
  createdCount: number;
  updatedCount: number;
  invalidCount: number;
  addedToGroupCount: number;
  duplicateProviderCount: number;
}

export interface ProxyProviderBatchEditResult {
  yaml: string;
  findings: Finding[];
  summary: ProxyProviderBatchEditSummary;
}

export interface LeakProtectionSummary {
  dnsChanged: boolean;
  ruleChangedCount: number;
  tunChanged: boolean;
  duplicateProviderCount: number;
  privacyTarget: string;
  domesticTarget: string;
}

export interface LeakProtectionResult {
  yaml: string;
  findings: Finding[];
  summary: LeakProtectionSummary;
}

const DEFAULT_PROVIDER_INTERVAL = 86400;
const DEFAULT_HEALTH_CHECK_INTERVAL = 300;
const DEFAULT_HEALTH_CHECK_URL = "https://www.gstatic.com/generate_204";
const DOMESTIC_DNS = ["223.5.5.5", "119.29.29.29"];
const GLOBAL_DNS = ["tls://1.1.1.1#国外", "tls://8.8.8.8#国外", "tls://9.9.9.9#国外"];
const GLOBAL_FALLBACK_DNS = ["tls://1.0.0.1#国外", "tls://8.8.4.4#国外", "tls://149.112.112.112#国外"];
const LEAK_TEST_DOMAINS = ["ipleak.net", "browserleaks.com", "dnsleaktest.com", "ipinfo.io", "ifconfig.me"];
const LEAK_POLICY_DOMAINS = [
  ...LEAK_TEST_DOMAINS,
  "cloudflare.com",
  "google.com",
  "github.com",
  "openai.com",
  "chatgpt.com",
];
const PRIVATE_IP_RULES = [
  "127.0.0.0/8",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "224.0.0.0/4",
];
const FAKE_IP_FILTER = [
  "+.lan",
  "+.local",
  "geosite:private",
  "geosite:cn",
  "+.msftconnecttest.com",
  "+.msftncsi.com",
  "+.pool.ntp.org",
  "+.ntp.org",
  "+.time.apple.com",
  "+.time.windows.com",
  "localhost",
  "time.*.com",
  "ntp.*.com",
];

export function buildProxyProviderPreviewYaml(input: ProxyProviderPreviewInput): string {
  const name = input.name.trim() || "新订阅";
  const url = input.url.trim() || "https://your-subscription-url.example/sub";
  return stringify(
    {
      "proxy-providers": {
        [name]: buildProxyProviderRecord(input.existingProvider, url),
      },
    },
    { indent: 2, lineWidth: 0 },
  );
}

export function upsertProxyProviderInYaml(source: string, input: ProxyProviderInput): ProxyProviderEditResult {
  const emptySummary: ProxyProviderEditSummary = {
    providerName: input.name.trim(),
    updatedExisting: false,
    addedToGroupCount: 0,
    duplicateProviderCount: 0,
  };
  const name = input.name.trim();
  const previousName = input.previousName?.trim();
  const urlResult = parseHttpUrl(input.url);

  if (!name) {
    return {
      yaml: source,
      summary: emptySummary,
      findings: [editError("proxy-provider-name-empty", "订阅写入失败", "订阅名称不能为空。", "/proxy-providers")],
    };
  }

  if (!urlResult.ok) {
    return {
      yaml: source,
      summary: { ...emptySummary, providerName: name },
      findings: [editError("proxy-provider-url-invalid", "订阅写入失败", urlResult.error, "/proxy-providers/url")],
    };
  }

  const parsed = parseConfigLoose(source, "订阅写入失败", "/proxy-providers");
  if (parsed.findings.length > 0) return { yaml: source, summary: { ...emptySummary, providerName: name }, findings: parsed.findings };

  const providers = ensureRecordField(parsed.config, "proxy-providers");
  const existingProvider = previousName && isRecord(providers[previousName]) ? providers[previousName] : providers[name];
  const renamedExisting = Boolean(previousName && previousName !== name && isRecord(providers[previousName]));
  const updatedExisting = isRecord(existingProvider);
  providers[name] = buildProxyProviderRecord(existingProvider, urlResult.url);
  if (renamedExisting) {
    delete providers[previousName!];
    renameProviderInUseGroups(parsed.config, previousName!, name);
  }

  const addedToGroupCount = addProviderToExistingUseGroups(parsed.config, name);
  const summary: ProxyProviderEditSummary = {
    providerName: name,
    updatedExisting,
    addedToGroupCount,
    duplicateProviderCount: parsed.duplicateProviderCount,
  };

  return {
    yaml: stringify(parsed.config, { indent: 2, lineWidth: 0 }),
    summary,
    findings: [
      {
        id: "proxy-provider-upserted",
        severity: "info",
        title: renamedExisting ? "订阅 provider 已重命名" : updatedExisting ? "订阅 provider 已更新" : "订阅 provider 已添加",
        message: `已写入 proxy-providers.${name}，并加入 ${addedToGroupCount} 个 use 分组。`,
        path: `/proxy-providers/${name}`,
      },
      ...duplicateProviderFinding(parsed.duplicateProviderCount),
    ],
  };
}

export function upsertProxyProvidersInYaml(source: string, inputs: ProxyProviderBatchInput[]): ProxyProviderBatchEditResult {
  const emptySummary: ProxyProviderBatchEditSummary = {
    requestedCount: inputs.length,
    upsertedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    invalidCount: 0,
    addedToGroupCount: 0,
    duplicateProviderCount: 0,
  };
  const parsed = parseConfigLoose(source, "批量订阅写入失败", "/proxy-providers");
  if (parsed.findings.length > 0) return { yaml: source, summary: emptySummary, findings: parsed.findings };

  const providers = ensureRecordField(parsed.config, "proxy-providers");
  const findings: Finding[] = [];
  const summary: ProxyProviderBatchEditSummary = {
    ...emptySummary,
    duplicateProviderCount: parsed.duplicateProviderCount,
  };

  for (const [index, input] of inputs.entries()) {
    const name = input.name.trim();
    if (!name) {
      summary.invalidCount += 1;
      findings.push(editError(`proxy-provider-batch-name-empty-${index}`, "批量订阅写入失败", `第 ${index + 1} 条订阅名称不能为空。`, "/proxy-providers"));
      continue;
    }

    const urlResult = parseHttpUrl(input.url);
    if (!urlResult.ok) {
      summary.invalidCount += 1;
      findings.push(editError(`proxy-provider-batch-url-invalid-${index}`, "批量订阅写入失败", `${name}：${urlResult.error}`, `/proxy-providers/${name}/url`));
      continue;
    }

    const updatedExisting = isRecord(providers[name]);
    providers[name] = buildProxyProviderRecord(providers[name], urlResult.url);
    summary.upsertedCount += 1;
    summary.updatedCount += updatedExisting ? 1 : 0;
    summary.createdCount += updatedExisting ? 0 : 1;
    summary.addedToGroupCount += addProviderToExistingUseGroups(parsed.config, name);
  }

  const yaml = summary.upsertedCount > 0 ? stringify(parsed.config, { indent: 2, lineWidth: 0 }) : source;

  if (summary.upsertedCount > 0) {
    findings.unshift({
      id: "proxy-provider-batch-upserted",
      severity: "info",
      title: "批量订阅已写入",
      message: `请求 ${summary.requestedCount} 条，写入 ${summary.upsertedCount} 条（新增 ${summary.createdCount}，更新 ${summary.updatedCount}），加入 use 分组 ${summary.addedToGroupCount} 次。`,
      path: "/proxy-providers",
    });
  }

  findings.push(...duplicateProviderFinding(parsed.duplicateProviderCount));

  return {
    yaml,
    summary,
    findings,
  };
}

export function deleteProxyProviderFromYaml(source: string, providerName: string): ProxyProviderEditResult {
  const name = providerName.trim();
  const emptySummary: ProxyProviderEditSummary = {
    providerName: name,
    updatedExisting: false,
    addedToGroupCount: 0,
    duplicateProviderCount: 0,
    removedFromGroupCount: 0,
  };
  if (!name) {
    return {
      yaml: source,
      summary: emptySummary,
      findings: [editError("proxy-provider-delete-empty", "订阅删除失败", "订阅名称不能为空。", "/proxy-providers")],
    };
  }

  const parsed = parseConfigLoose(source, "订阅删除失败", "/proxy-providers");
  if (parsed.findings.length > 0) return { yaml: source, summary: emptySummary, findings: parsed.findings };

  const providers = parsed.config["proxy-providers"];
  if (!isRecord(providers) || !isRecord(providers[name])) {
    return {
      yaml: source,
      summary: { ...emptySummary, duplicateProviderCount: parsed.duplicateProviderCount },
      findings: [editError("proxy-provider-delete-missing", "订阅删除失败", `没有找到 proxy-providers.${name}。`, "/proxy-providers")],
    };
  }

  delete providers[name];
  const removedFromGroupCount = removeProviderFromUseGroups(parsed.config, name);

  return {
    yaml: stringify(parsed.config, { indent: 2, lineWidth: 0 }),
    summary: {
      providerName: name,
      updatedExisting: true,
      addedToGroupCount: 0,
      duplicateProviderCount: parsed.duplicateProviderCount,
      removedFromGroupCount,
    },
    findings: [
      {
        id: "proxy-provider-deleted",
        severity: "info",
        title: "订阅 provider 已删除",
        message: `已删除 proxy-providers.${name}，并从 ${removedFromGroupCount} 个 use 引用中移除。`,
        path: "/proxy-providers",
      },
      ...duplicateProviderFinding(parsed.duplicateProviderCount),
    ],
  };
}

export function applyLeakProtectionToYaml(source: string): LeakProtectionResult {
  const parsed = parseConfigLoose(source, "防泄露优化失败", "/");
  const emptySummary: LeakProtectionSummary = {
    dnsChanged: false,
    ruleChangedCount: 0,
    tunChanged: false,
    duplicateProviderCount: parsed.duplicateProviderCount,
    privacyTarget: "GLOBAL",
    domesticTarget: "DIRECT",
  };

  if (parsed.findings.length > 0) return { yaml: source, summary: emptySummary, findings: parsed.findings };

  const privacyTarget = pickPrivacyTarget(parsed.config);
  const domesticTarget = pickDomesticTarget(parsed.config);
  const beforeDns = JSON.stringify(parsed.config.dns ?? null);
  hardenDns(parsed.config);
  const dnsChanged = JSON.stringify(parsed.config.dns ?? null) !== beforeDns;
  const beforeTun = JSON.stringify(parsed.config.tun ?? null);
  hardenTun(parsed.config);
  const tunChanged = JSON.stringify(parsed.config.tun ?? null) !== beforeTun;
  const ruleChangedCount = hardenRules(parsed.config, privacyTarget, domesticTarget);

  const summary: LeakProtectionSummary = {
    dnsChanged,
    ruleChangedCount,
    tunChanged,
    duplicateProviderCount: parsed.duplicateProviderCount,
    privacyTarget,
    domesticTarget,
  };

  return {
    yaml: stringify(parsed.config, { indent: 2, lineWidth: 0 }),
    summary,
    findings: [
      {
        id: "leak-protection-applied",
        severity: "info",
        title: "防泄露优化已应用",
        message: `已校准 DNS/fake-ip/TUN，并新增或修正 ${ruleChangedCount} 条 IP 与泄露测试规则。`,
        path: "/",
      },
      ...duplicateProviderFinding(parsed.duplicateProviderCount),
    ],
  };
}

export function redactConfigUrl(rawUrl: string): string {
  const parsed = parseHttpUrl(rawUrl);
  if (!parsed.ok) return "[URL 已隐藏]";

  const url = new URL(parsed.url);
  const params = Array.from(url.searchParams.keys())
    .sort()
    .map((key) => `${key}=<redacted>`);
  const base = `${url.protocol}//${url.host}${url.pathname && url.pathname !== "/" ? "/..." : "/"}`;
  return params.length > 0 ? `${base}?${params.join("&")}` : base;
}

function parseConfigLoose(
  source: string,
  title: string,
  path: string,
): { config: Record<string, unknown>; findings: Finding[]; duplicateProviderCount: number } {
  const document = parseDocument(source, {
    prettyErrors: true,
    uniqueKeys: false,
  });
  const duplicateProviderCount = countDuplicateKeys(document, "proxy-providers");

  if (document.errors.length > 0) {
    return {
      config: {},
      duplicateProviderCount,
      findings: document.errors.map((error, index) => ({
        id: `config-optimizer-yaml-error-${index}`,
        severity: "error",
        title,
        message: error.message,
        path,
      })),
    };
  }

  const value = document.toJS({ maxAliasCount: 100 });
  if (value === null && !source.trim()) {
    return { config: {}, findings: [], duplicateProviderCount };
  }

  if (!isRecord(value)) {
    return {
      config: {},
      duplicateProviderCount,
      findings: [editError("config-root-not-object", title, "当前 YAML 根节点不是对象，无法安全修改。", path)],
    };
  }

  return { config: { ...value }, findings: [], duplicateProviderCount };
}

function hardenDns(config: Record<string, unknown>) {
  config.ipv6 = false;
  const dns = ensureRecordField(config, "dns");
  dns.enable = true;
  dns.listen = typeof dns.listen === "string" && dns.listen.trim() ? dns.listen : "0.0.0.0:7874";
  dns.ipv6 = false;
  dns["enhanced-mode"] = "fake-ip";
  dns["fake-ip-range"] = typeof dns["fake-ip-range"] === "string" ? dns["fake-ip-range"] : "198.18.0.1/16";
  dns["fake-ip-filter-mode"] = typeof dns["fake-ip-filter-mode"] === "string" ? dns["fake-ip-filter-mode"] : "blacklist";

  mergeStringListField(dns, "default-nameserver", DOMESTIC_DNS);
  mergeStringListField(dns, "proxy-server-nameserver", DOMESTIC_DNS);
  mergeStringListField(dns, "direct-nameserver", DOMESTIC_DNS);
  mergeStringListField(dns, "nameserver", [...DOMESTIC_DNS, ...GLOBAL_DNS]);
  mergeStringListField(dns, "fallback", GLOBAL_FALLBACK_DNS);
  mergeStringListField(dns, "fake-ip-filter", FAKE_IP_FILTER);

  const policy = ensureRecordField(dns, "nameserver-policy");
  mergeStringListField(policy, "geosite:private", DOMESTIC_DNS);
  mergeStringListField(policy, "geosite:cn", DOMESTIC_DNS);
  mergeStringListField(policy, "geosite:geolocation-!cn", GLOBAL_DNS);
  for (const domain of LEAK_POLICY_DOMAINS) {
    mergeStringListField(policy, `+.${domain}`, GLOBAL_DNS.slice(0, 2));
  }

  const fallbackFilter = ensureRecordField(dns, "fallback-filter");
  fallbackFilter.geoip = true;
  fallbackFilter["geoip-code"] = "CN";
  mergeStringListField(fallbackFilter, "ipcidr", ["240.0.0.0/4", "0.0.0.0/32"]);
}

function hardenTun(config: Record<string, unknown>) {
  const tun = ensureRecordField(config, "tun");
  if (tun.enable === undefined) tun.enable = false;
  tun.stack = typeof tun.stack === "string" && tun.stack.trim() ? tun.stack : "gvisor";
  tun["endpoint-independent-nat"] = true;
  tun["auto-route"] = false;
  tun["auto-detect-interface"] = false;
  tun["auto-redirect"] = false;
  tun["strict-route"] = true;
}

function hardenRules(config: Record<string, unknown>, privacyTarget: string, domesticTarget: string): number {
  const currentRules = Array.isArray(config.rules) ? config.rules.map(String) : [];
  let changedCount = 0;

  for (const cidr of PRIVATE_IP_RULES) {
    if (upsertRule(currentRules, { type: "IP-CIDR", value: cidr, target: domesticTarget, options: ["no-resolve"] })) {
      changedCount += 1;
    }
  }

  if (upsertRule(currentRules, { type: "GEOIP", value: "CN", target: domesticTarget, options: ["no-resolve"] })) {
    changedCount += 1;
  }

  for (const domain of LEAK_TEST_DOMAINS) {
    if (upsertRule(currentRules, { type: "DOMAIN-SUFFIX", value: domain, target: privacyTarget })) {
      changedCount += 1;
    }
  }

  config.rules = normalizeRuleList(currentRules, privacyTarget);
  return changedCount;
}

function addProviderToExistingUseGroups(config: Record<string, unknown>, providerName: string): number {
  const groups = config["proxy-groups"];
  if (!Array.isArray(groups)) return 0;

  let updated = 0;
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.use)) continue;
    const use = group.use.map(String);
    if (use.includes(providerName)) continue;
    group.use = [...use, providerName];
    updated += 1;
  }

  return updated;
}

function renameProviderInUseGroups(config: Record<string, unknown>, oldName: string, newName: string): number {
  const groups = config["proxy-groups"];
  if (!Array.isArray(groups)) return 0;

  let updated = 0;
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.use)) continue;
    let changed = false;
    const use = group.use.map((provider) => {
      if (String(provider) === oldName) {
        changed = true;
        return newName;
      }
      return String(provider);
    });
    if (!changed) continue;
    group.use = Array.from(new Set(use));
    updated += 1;
  }

  return updated;
}

function removeProviderFromUseGroups(config: Record<string, unknown>, providerName: string): number {
  const groups = config["proxy-groups"];
  if (!Array.isArray(groups)) return 0;

  let removed = 0;
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.use)) continue;
    const use = group.use.map(String);
    const nextUse = use.filter((name) => name !== providerName);
    if (nextUse.length === use.length) continue;
    group.use = nextUse;
    removed += use.length - nextUse.length;
  }

  return removed;
}

function buildProxyProviderRecord(existingProvider: unknown, url: string): Record<string, unknown> {
  const existing = isRecord(existingProvider) ? { ...existingProvider } : {};
  const healthCheck = isRecord(existing["health-check"]) ? existing["health-check"] : {};

  return {
    ...existing,
    url,
    type: typeof existing.type === "string" ? existing.type : "http",
    interval: Number.isInteger(existing.interval) ? existing.interval : DEFAULT_PROVIDER_INTERVAL,
    "health-check": {
      ...healthCheck,
      enable: typeof healthCheck.enable === "boolean" ? healthCheck.enable : true,
      url: typeof healthCheck.url === "string" ? healthCheck.url : DEFAULT_HEALTH_CHECK_URL,
      interval: Number.isInteger(healthCheck.interval) ? healthCheck.interval : DEFAULT_HEALTH_CHECK_INTERVAL,
    },
    proxy: typeof existing.proxy === "string" ? existing.proxy : "DIRECT",
  };
}

function pickPrivacyTarget(config: Record<string, unknown>): string {
  const groupNames = getProxyGroupNames(config);
  const preferred = ["Test", "防泄露测试", "国外", "节点选择", "Proxy", "自动选择", "所有-稳定不断流", "所有-自动"];
  return preferred.find((name) => groupNames.includes(name)) ?? groupNames.find((name) => !/国内|直连|Block|拒绝/i.test(name)) ?? "GLOBAL";
}

function pickDomesticTarget(config: Record<string, unknown>): string {
  const groupNames = getProxyGroupNames(config);
  return groupNames.find((name) => name === "国内" || name.includes("直连")) ?? "DIRECT";
}

function getProxyGroupNames(config: Record<string, unknown>): string[] {
  const groups = config["proxy-groups"];
  if (!Array.isArray(groups)) return [];
  return groups
    .filter(isRecord)
    .map((group) => (typeof group.name === "string" ? group.name.trim() : ""))
    .filter(Boolean);
}

function upsertRule(
  rules: string[],
  spec: { type: string; value: string; target: string; options?: string[] },
): boolean {
  const nextRule = [spec.type, spec.value, spec.target, ...(spec.options ?? [])].join(",");
  const existingIndex = parseRules(rules).findIndex(
    (rule) => rule.type === spec.type && rule.value.toLowerCase() === spec.value.toLowerCase(),
  );

  if (existingIndex >= 0) {
    if (rules[existingIndex] === nextRule) return false;
    rules[existingIndex] = nextRule;
    return true;
  }

  const matchIndex = parseRules(rules).findIndex((rule) => rule.type === "MATCH");
  rules.splice(matchIndex >= 0 ? matchIndex : rules.length, 0, nextRule);
  return true;
}

function normalizeRuleList(rules: string[], fallbackTarget: string): string[] {
  const parsed = parseRules(rules);
  const match = [...parsed].reverse().find((rule) => rule.type === "MATCH")?.raw ?? `MATCH,${fallbackTarget}`;
  const seen = new Set<string>();
  const nonMatch = parsed
    .filter((rule) => rule.type !== "MATCH")
    .map((rule) => rule.raw.trim())
    .filter(Boolean)
    .filter((rule) => {
      if (seen.has(rule)) return false;
      seen.add(rule);
      return true;
    });

  return [...nonMatch, match];
}

function mergeStringListField(target: Record<string, unknown>, key: string, additions: string[]) {
  target[key] = uniquePreservingOrder([...asStringArray(target[key]), ...additions]);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function ensureRecordField(target: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = target[key];
  if (isRecord(value)) return value;
  const next: Record<string, unknown> = {};
  target[key] = next;
  return next;
}

function parseHttpUrl(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  const cleanUrl = rawUrl.trim();
  if (!cleanUrl) return { ok: false, error: "订阅 URL 不能为空。" };

  try {
    const url = new URL(cleanUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "订阅 URL 只允许 http 或 https。" };
    }
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, error: "订阅 URL 格式不正确。" };
  }
}

function countDuplicateKeys(document: Document.Parsed, sectionKey: string): number {
  const root = document.contents;
  if (!isMap(root)) return 0;
  const section = root.get(sectionKey, true);
  if (!isMap(section)) return 0;

  const seen = new Set<string>();
  let duplicates = 0;
  for (const item of section.items) {
    const rawKey = item.key as { toJSON?: () => unknown; value?: unknown } | undefined;
    const key = String(rawKey?.toJSON?.() ?? rawKey?.value ?? item.key ?? "");
    if (!key) continue;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
  }
  return duplicates;
}

function duplicateProviderFinding(count: number): Finding[] {
  return count > 0
    ? [
        {
          id: "proxy-provider-duplicates-normalized",
          severity: "info",
          title: "重复 provider 已归并",
          message: `发现 ${count} 个重复 proxy-provider 名称，写回时已按 YAML 解析结果保留一个。`,
          path: "/proxy-providers",
        },
      ]
    : [];
}

function editError(id: string, title: string, message: string, path: string): Finding {
  return {
    id,
    severity: "error",
    title,
    message,
    path,
  };
}

function uniquePreservingOrder(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

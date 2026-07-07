import type { ClashConfigSummary, Finding, ProxyGroup, ProxyNode, ProxyProvider, RuleItem, StructureNode } from "../../types/domain";
import { auditDnsConfig } from "../audit/dnsAudit";
import { NO_RESOLVE_RULE_TYPES, RULE_OPTIONS, SUPPORTED_RULE_TYPE_SET } from "../rules/ruleTypes";

const PORT_KEYS = ["port", "socks-port", "redir-port", "mixed-port", "tproxy-port"] as const;
const BASIC_CONFIG_KEYS = [...PORT_KEYS, "allow-lan", "mode", "log-level"] as const;
const OPENCLASH_COMPAT_KEYS = ["external-controller", "secret", "hosts", "profile"] as const;
const BUILT_IN_TARGETS = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS", "GLOBAL"]);
const RULE_TYPES_WITH_TARGET = SUPPORTED_RULE_TYPE_SET;
const BROAD_RULE_TYPES = new Set(["GEOSITE", "GEOIP", "RULE-SET"]);

export function analyzeClashConfig(value: unknown): ClashConfigSummary {
  const config = isRecord(value) ? value : {};
  const proxies = parseProxyNodes(config.proxies, "local");
  const proxyGroups = parseProxyGroups(config["proxy-groups"]);
  const proxyProviders = parseProxyProviders(config["proxy-providers"], proxyGroups);
  const rules = parseRules(config.rules);
  const ports = Object.fromEntries(PORT_KEYS.filter((key) => key in config).map((key) => [key, config[key]]));

  const referenceFindings = validateReferences(proxies, proxyGroups, rules);
  const ruleFindings = validateRules(rules);
  const dnsFindings = auditDnsConfig(config.dns, rules, config);
  const findings = [
    ...referenceFindings,
    ...ruleFindings,
    ...dnsFindings,
    ...validateTopLevel(config),
  ];

  return {
    ports,
    mode: typeof config.mode === "string" ? config.mode : undefined,
    logLevel: typeof config["log-level"] === "string" ? config["log-level"] : undefined,
    proxyCount: proxies.length,
    proxyProviderCount: countObjectKeys(config["proxy-providers"]),
    proxyGroupCount: proxyGroups.length,
    ruleProviderCount: countObjectKeys(config["rule-providers"]),
    ruleCount: rules.length,
    dnsEnabled: isRecord(config.dns) ? config.dns.enable === true || config.dns.enabled === true : false,
    hasTun: isRecord(config.tun),
    hasProfile: isRecord(config.profile),
    hasSniffer: isRecord(config.sniffer),
    hasHosts: isRecord(config.hosts),
    proxies,
    proxyProviders,
    proxyGroups,
    rules,
    structure: buildClashStructure(config, proxies, proxyGroups, rules),
    findings,
  };
}

export function parseProxyProviders(value: unknown, proxyGroups: ProxyGroup[] = []): ProxyProvider[] {
  if (!isRecord(value)) {
    return [];
  }

  const usedBy = new Map<string, string[]>();
  for (const group of proxyGroups) {
    for (const providerName of group.use ?? []) {
      usedBy.set(providerName, [...(usedBy.get(providerName) ?? []), group.name]);
    }
  }

  return Object.entries(value).map(([name, provider]) => {
    const record = isRecord(provider) ? provider : {};
    const healthCheck = isRecord(record["health-check"]) ? record["health-check"] : undefined;
    return {
      name,
      type: String(record.type ?? "unknown"),
      url: typeof record.url === "string" ? record.url : undefined,
      interval: typeof record.interval === "number" ? record.interval : Number(record.interval) || undefined,
      proxy: typeof record.proxy === "string" ? record.proxy : undefined,
      healthCheck: healthCheck
        ? {
            enable: typeof healthCheck.enable === "boolean" ? healthCheck.enable : undefined,
            url: typeof healthCheck.url === "string" ? healthCheck.url : undefined,
            interval: typeof healthCheck.interval === "number" ? healthCheck.interval : Number(healthCheck.interval) || undefined,
          }
        : undefined,
      usedBy: usedBy.get(name) ?? [],
      raw: record,
    };
  });
}

export function parseProxyNodes(value: unknown, subscriptionName?: string): ProxyNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((proxy, index) => {
    const name = typeof proxy.name === "string" && proxy.name.trim() ? proxy.name : `未命名节点 ${index + 1}`;
    const type = typeof proxy.type === "string" ? proxy.type : "unknown";
    return {
      id: `${subscriptionName ?? "local"}:${name}:${index}`,
      name,
      type,
      server: typeof proxy.server === "string" ? proxy.server : undefined,
      port: typeof proxy.port === "number" ? proxy.port : Number(proxy.port) || undefined,
      region: detectRegion(name),
      rate: detectRate(name),
      subscriptionName,
      raw: proxy,
    };
  });
}

export function parseProxyGroups(value: unknown): ProxyGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((group) => ({
    name: String(group.name ?? "未命名分组"),
    type: String(group.type ?? "select"),
    proxies: Array.isArray(group.proxies) ? group.proxies.map(String) : [],
    use: Array.isArray(group.use) ? group.use.map(String) : undefined,
    url: typeof group.url === "string" ? group.url : undefined,
    interval: typeof group.interval === "number" ? group.interval : undefined,
    tolerance: typeof group.tolerance === "number" ? group.tolerance : undefined,
    lazy: typeof group.lazy === "boolean" ? group.lazy : undefined,
    filter: typeof group.filter === "string" ? group.filter : undefined,
  }));
}

export function parseRules(value: unknown): RuleItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((rule, index) => parseRule(String(rule), index));
}

export function validateReferences(proxies: ProxyNode[], proxyGroups: ProxyGroup[], rules: RuleItem[]): Finding[] {
  const proxyNames = new Set(proxies.map((proxy) => proxy.name));
  const groupNames = new Set(proxyGroups.map((group) => group.name));
  const selectableTargets = new Set([...proxyNames, ...groupNames, ...BUILT_IN_TARGETS]);
  const findings: Finding[] = [];

  for (const group of proxyGroups) {
    for (const target of group.proxies) {
      if (!selectableTargets.has(target)) {
        findings.push({
          id: `missing-proxy-${group.name}-${target}`,
          severity: "error",
          title: "代理分组引用不存在",
          message: `分组「${group.name}」引用了不存在的节点或分组「${target}」。`,
          path: `/proxy-groups/${group.name}`,
          suggestion: "删除该引用，或先添加同名节点 / 分组。",
        });
      }
    }
  }

  for (const rule of rules) {
    if (rule.target && !groupNames.has(rule.target) && !BUILT_IN_TARGETS.has(rule.target)) {
      findings.push({
        id: `missing-rule-target-${rule.index}`,
        severity: "error",
        title: "规则目标不存在",
        message: `第 ${rule.index + 1} 条规则指向不存在的目标「${rule.target}」。`,
        path: `/rules/${rule.index}`,
        suggestion: "将规则目标改为已有分组，或创建对应分组。",
      });
    }
  }

  const matchIndex = rules.findIndex((rule) => rule.type === "MATCH");
  if (matchIndex >= 0 && matchIndex !== rules.length - 1) {
    findings.push({
      id: "match-not-last",
      severity: "warning",
      title: "MATCH 规则不在最后",
      message: "MATCH 是兜底规则，放在中间会导致后续规则永远无法命中。",
      path: `/rules/${matchIndex}`,
      suggestion: "将 MATCH 移动到 rules 最后一行。",
      autoFixable: true,
    });
  }

  const seenRules = new Map<string, number>();
  for (const rule of rules) {
    const normalized = rule.raw.trim();
    const previous = seenRules.get(normalized);
    if (previous !== undefined) {
      findings.push({
        id: `duplicate-rule-${rule.index}`,
        severity: "warning",
        title: "重复规则",
        message: `第 ${rule.index + 1} 条规则与第 ${previous + 1} 条重复。`,
        path: `/rules/${rule.index}`,
        suggestion: "保留优先级更明确的一条。",
      });
    }
    seenRules.set(normalized, rule.index);
  }

  return findings;
}

function validateRules(rules: RuleItem[]): Finding[] {
  return [
    ...validateRuleSyntax(rules),
    ...validateRuleOrderRisks(rules),
    ...validateDomesticForeignIntent(rules),
  ];
}

function validateRuleSyntax(rules: RuleItem[]): Finding[] {
  const findings: Finding[] = [];

  for (const rule of rules) {
    const parts = splitRule(rule.raw);
    if (!SUPPORTED_RULE_TYPE_SET.has(rule.type)) {
      findings.push({
        id: `invalid-rule-type-${rule.index}`,
        severity: "error",
        title: "不支持的规则类型",
        message: `第 ${rule.index + 1} 条规则类型「${rule.type}」不在当前支持列表中。`,
        path: `/rules/${rule.index}`,
        suggestion: "改为 Clash / Mihomo 支持的规则类型，或删除该规则。",
      });
      continue;
    }

    if (rule.type === "MATCH") {
      if (!parts[1]) {
        findings.push({
          id: `invalid-rule-format-${rule.index}`,
          severity: "error",
          title: "MATCH 规则缺少目标",
          message: `第 ${rule.index + 1} 条 MATCH 规则需要写成 MATCH,目标。`,
          path: `/rules/${rule.index}`,
          suggestion: "为 MATCH 指定 DIRECT、GLOBAL 或已有代理分组。",
        });
      }
      continue;
    }

    const targetIndex = getRuleTargetIndex(rule.type, parts);
    const value = targetIndex === undefined ? "" : parts.slice(1, targetIndex).join(",").trim();
    if (!value || targetIndex === undefined) {
      findings.push({
        id: `invalid-rule-format-${rule.index}`,
        severity: "error",
        title: "规则字段不完整",
        message: `第 ${rule.index + 1} 条规则需要至少包含 类型,匹配值,目标。`,
        path: `/rules/${rule.index}`,
        suggestion: "补齐匹配值和目标分组，例如 DOMAIN-SUFFIX,example.com,节点选择。",
      });
    }

    const options = targetIndex === undefined ? [] : parts.slice(targetIndex + 1);
    if (options.includes("no-resolve") && !NO_RESOLVE_RULE_TYPES.has(rule.type)) {
      findings.push({
        id: `invalid-rule-option-${rule.index}`,
        severity: "warning",
        title: "no-resolve 使用位置异常",
        message: `第 ${rule.index + 1} 条规则类型「${rule.type}」通常不使用 no-resolve。`,
        path: `/rules/${rule.index}`,
        suggestion: "仅在 GEOIP、IP-CIDR、IP-CIDR6、IP-SUFFIX、IP-ASN 等 IP 类规则中保留 no-resolve。",
      });
    }
  }

  return findings;
}

function validateRuleOrderRisks(rules: RuleItem[]): Finding[] {
  const findings: Finding[] = [];

  for (const rule of rules) {
    if (!BROAD_RULE_TYPES.has(rule.type) || !rule.target) continue;

    const shadowedRule = rules.find(
      (candidate) =>
        candidate.index > rule.index &&
        isSpecificRule(candidate) &&
        candidate.target &&
        candidate.target !== rule.target,
    );

    if (shadowedRule) {
      findings.push({
        id: `rule-order-risk-${rule.index}-${shadowedRule.index}`,
        severity: "warning",
        title: "规则顺序可能遮挡后续规则",
        message: `第 ${rule.index + 1} 条宽泛规则可能先命中，导致第 ${shadowedRule.index + 1} 条更具体规则无法生效。`,
        path: `/rules/${rule.index}`,
        suggestion: "将 DOMAIN、DOMAIN-SUFFIX、IP-CIDR 等更具体规则放到 GEOSITE、GEOIP、RULE-SET 前面。",
      });
    }
  }

  return findings;
}

function validateDomesticForeignIntent(rules: RuleItem[]): Finding[] {
  const findings: Finding[] = [];

  for (const rule of rules) {
    if (!rule.target) continue;

    if (isDomesticRule(rule) && isProxyLikeTarget(rule.target) && !isDirectLikeTarget(rule.target)) {
      findings.push({
        id: `domestic-rule-proxy-target-${rule.index}`,
        severity: "warning",
        title: "国内规则疑似走代理",
        message: `第 ${rule.index + 1} 条国内规则指向「${rule.target}」，可能让国内站点走代理。`,
        path: `/rules/${rule.index}`,
        suggestion: "如需国内直连，请改为 DIRECT 或明确的国内直连分组。",
      });
    }

    if (isForeignRule(rule) && isDirectLikeTarget(rule.target)) {
      findings.push({
        id: `foreign-rule-direct-target-${rule.index}`,
        severity: "warning",
        title: "国外规则疑似直连",
        message: `第 ${rule.index + 1} 条国外规则指向「${rule.target}」，可能导致境外站点直连或泄露真实出口。`,
        path: `/rules/${rule.index}`,
        suggestion: "如需代理境外站点，请改为代理分组或自动选择分组。",
      });
    }
  }

  return findings;
}

function validateTopLevel(config: Record<string, unknown>): Finding[] {
  const findings: Finding[] = [];

  if (!Array.isArray(config.proxies) && !isRecord(config["proxy-providers"])) {
    findings.push({
      id: "no-proxy-source",
      severity: "warning",
      title: "缺少节点来源",
      message: "配置中没有 proxies，也没有 proxy-providers。",
      path: "/proxies",
      suggestion: "添加本地节点、订阅节点，或配置 proxy-providers。",
    });
  }

  if (!Array.isArray(config.rules)) {
    findings.push({
      id: "no-rules",
      severity: "warning",
      title: "缺少分流规则",
      message: "配置中没有 rules，OpenClash 分流行为不可控。",
      path: "/rules",
      suggestion: "添加 rules，并确保最后一条是 MATCH 兜底规则。",
    });
  }

  return findings;
}

function parseRule(raw: string, index: number): RuleItem {
  const parts = splitRule(raw);
  const type = parts[0] || "UNKNOWN";
  const targetIndex = getRuleTargetIndex(type, parts);
  const value = type === "MATCH" ? "" : targetIndex === undefined ? parts.slice(1).join(",") : parts.slice(1, targetIndex).join(",");
  const target = getRuleTarget(type, parts);

  return {
    index,
    type,
    value,
    target,
    raw,
  };
}

export function splitRule(raw: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of raw) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  parts.push(current.trim());
  return parts;
}

function getRuleTarget(type: string, parts: string[]): string | undefined {
  const index = getRuleTargetIndex(type, parts);
  return index === undefined ? undefined : parts[index] || undefined;
}

function getRuleTargetIndex(type: string, parts: string[]): number | undefined {
  if (!RULE_TYPES_WITH_TARGET.has(type)) {
    return undefined;
  }

  if (type === "MATCH") {
    return parts[1] ? 1 : undefined;
  }

  for (let index = parts.length - 1; index >= 2; index -= 1) {
    const part = parts[index];
    if (part && !RULE_OPTIONS.has(part)) {
      return index;
    }
  }
  return undefined;
}

function isSpecificRule(rule: RuleItem): boolean {
  return ["DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "IP-CIDR", "IP-CIDR6", "SRC-IP-CIDR", "PROCESS-NAME"].includes(
    rule.type,
  );
}

function isDomesticRule(rule: RuleItem): boolean {
  const value = rule.value.toLowerCase();
  if (rule.type === "GEOIP") return value === "cn";
  if (rule.type === "GEOSITE") return value === "cn" || value === "geolocation-cn" || value.endsWith("-cn");
  if (rule.type === "DOMAIN-SUFFIX") return value === "cn" || value.endsWith(".cn");
  return false;
}

function isForeignRule(rule: RuleItem): boolean {
  const value = rule.value.toLowerCase();
  return rule.type === "GEOSITE" && (value === "geolocation-!cn" || value.includes("geolocation-!cn"));
}

function isDirectLikeTarget(target: string): boolean {
  const upper = target.toUpperCase();
  return upper === "DIRECT" || target.includes("直连") || target.includes("国内");
}

function isProxyLikeTarget(target: string): boolean {
  const upper = target.toUpperCase();
  return upper === "GLOBAL" || /代理|节点|国外|自动|选择/i.test(target);
}

function buildClashStructure(
  config: Record<string, unknown>,
  proxies: ProxyNode[],
  proxyGroups: ProxyGroup[],
  rules: RuleItem[],
): StructureNode[] {
  return [
    {
      id: "ports",
      label: "基础端口配置",
      kind: "section",
      path: "/",
      count: BASIC_CONFIG_KEYS.filter((key) => key in config).length,
    },
    { id: "dns", label: "DNS 配置", kind: "section", path: "/dns", count: isRecord(config.dns) ? 1 : 0 },
    { id: "tun", label: "TUN 配置", kind: "section", path: "/tun", count: isRecord(config.tun) ? 1 : 0 },
    { id: "proxies", label: "代理节点", kind: "collection", path: "/proxies", count: proxies.length },
    {
      id: "proxy-providers",
      label: "代理订阅",
      kind: "collection",
      path: "/proxy-providers",
      count: countObjectKeys(config["proxy-providers"]),
    },
    {
      id: "proxy-groups",
      label: "代理分组",
      kind: "collection",
      path: "/proxy-groups",
      count: proxyGroups.length,
    },
    {
      id: "rule-providers",
      label: "规则订阅",
      kind: "collection",
      path: "/rule-providers",
      count: countObjectKeys(config["rule-providers"]),
    },
    { id: "rules", label: "分流规则", kind: "collection", path: "/rules", count: rules.length },
    { id: "sniffer", label: "嗅探配置", kind: "section", path: "/sniffer", count: isRecord(config.sniffer) ? 1 : 0 },
    {
      id: "openclash-compat",
      label: "OpenClash 兼容配置",
      kind: "section",
      path: "/",
      count: OPENCLASH_COMPAT_KEYS.filter((key) => key in config).length,
    },
  ];
}

function countObjectKeys(value: unknown): number {
  return isRecord(value) ? Object.keys(value).length : 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detectRegion(name: string): string | undefined {
  const regions: Array<[RegExp, string]> = [
    [/香港|Hong Kong|\bHK\b/i, "香港"],
    [/台湾|Taiwan|\bTW\b/i, "台湾"],
    [/日本|Japan|\bJP\b/i, "日本"],
    [/韩国|Korea|\bKR\b/i, "韩国"],
    [/新加坡|Singapore|\bSG\b/i, "新加坡"],
    [/美国|United States|\bUS\b/i, "美国"],
    [/英国|United Kingdom|\bUK\b/i, "英国"],
  ];

  return regions.find(([pattern]) => pattern.test(name))?.[1];
}

function detectRate(name: string): string | undefined {
  return name.match(/(\d+(?:\.\d+)?\s*[xX倍])/u)?.[1]?.replace(/\s+/g, "");
}

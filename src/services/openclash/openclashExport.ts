import { stringify, parseDocument } from "yaml";
import type { Finding, ProxyGroup, ProxyNode, RuleItem } from "../../types/domain";
import { analyzeClashConfig, isRecord, parseProxyGroups, parseProxyNodes, parseRules } from "../clash/clashService";
import { generateDefaultGroups } from "../groups/groupGenerator";
import { mergeGroups, mergeProxyNodes } from "../merge/mergeConfig";

export interface OpenClashExportResult {
  yaml: string;
  findings: Finding[];
  summary: {
    proxyCount: number;
    proxyGroupCount: number;
    ruleCount: number;
  };
}

const DEFAULT_SELECTOR = "节点选择";

export function buildOpenClashExport(source: string, subscriptionNodes: ProxyNode[] = []): OpenClashExportResult {
  const document = parseDocument(source, {
    prettyErrors: true,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    return {
      yaml: source,
      findings: document.errors.map((error, index) => ({
        id: `openclash-export-yaml-error-${index}`,
        severity: "error",
        title: "无法导出",
        message: error.message,
        path: "/",
      })),
      summary: {
        proxyCount: 0,
        proxyGroupCount: 0,
        ruleCount: 0,
      },
    };
  }

  const rawConfig = document.toJS({ maxAliasCount: 100 });
  const config = isRecord(rawConfig) ? { ...rawConfig } : {};
  const findings: Finding[] = [];

  applyBaseDefaults(config, findings);

  const localNodes = parseProxyNodes(config.proxies, "local");
  const mergedNodes = mergeProxyNodes(localNodes, subscriptionNodes);
  const exportNodes = mergedNodes.proxies.map(toClashProxy).filter(isRecord);
  config.proxies = exportNodes;
  findings.push(...mergedNodes.findings);

  const currentGroups = parseProxyGroups(config["proxy-groups"]);
  const generatedGroups = generateDefaultGroups(mergedNodes.proxies);
  const mergedGroups = mergeGroups(currentGroups, generatedGroups);
  config["proxy-groups"] = mergedGroups.map(toClashGroup);

  const normalizedRules = normalizeRules(parseRules(config.rules), mergedGroups, findings);
  config.rules = normalizedRules.map((rule) => rule.raw);

  const exportedYaml = stringify(config, {
    indent: 2,
    lineWidth: 0,
  });
  const exportedAnalysis = analyzeClashConfig(config);

  return {
    yaml: exportedYaml,
    findings: [...findings, ...exportedAnalysis.findings],
    summary: {
      proxyCount: exportedAnalysis.proxyCount,
      proxyGroupCount: exportedAnalysis.proxyGroupCount,
      ruleCount: exportedAnalysis.ruleCount,
    },
  };
}

function applyBaseDefaults(config: Record<string, unknown>, findings: Finding[]): void {
  const defaults: Array<[string, unknown, string]> = [
    ["mixed-port", 7890, "缺少 mixed-port，已补默认端口 7890。"],
    ["allow-lan", true, "缺少 allow-lan，已补 true 以适配常见 OpenClash 局域网使用场景。"],
    ["mode", "rule", "缺少 mode，已补 rule。"],
    ["log-level", "info", "缺少 log-level，已补 info。"],
  ];

  for (const [key, value, message] of defaults) {
    if (!(key in config)) {
      config[key] = value;
      findings.push({
        id: `openclash-default-${key}`,
        severity: "info",
        title: "已补基础字段",
        message,
        path: `/${key}`,
      });
    }
  }
}

function normalizeRules(rules: RuleItem[], groups: ProxyGroup[], findings: Finding[]): RuleItem[] {
  const groupNames = new Set(groups.map((group) => group.name));
  const fallbackTarget = groupNames.has(DEFAULT_SELECTOR) ? DEFAULT_SELECTOR : groups[0]?.name ?? "DIRECT";
  const nonMatchRules = rules.filter((rule) => rule.type !== "MATCH");
  const matchRule = rules.find((rule) => rule.type === "MATCH");

  if (!matchRule) {
    findings.push({
      id: "openclash-add-match",
      severity: "info",
      title: "已补 MATCH 兜底",
      message: `未发现 MATCH 规则，已补到「${fallbackTarget}」。`,
      path: "/rules",
    });
  }

  if (matchRule && matchRule.index !== rules.length - 1) {
    findings.push({
      id: "openclash-move-match",
      severity: "info",
      title: "已移动 MATCH",
      message: "MATCH 规则已移动到最后，避免后续规则无法命中。",
      path: `/rules/${matchRule.index}`,
    });
  }

  const normalized = [
    ...nonMatchRules,
    {
      index: nonMatchRules.length,
      type: "MATCH",
      value: "",
      target: matchRule?.target ?? fallbackTarget,
      raw: `MATCH,${matchRule?.target ?? fallbackTarget}`,
    },
  ];

  return normalized.map((rule, index) => ({ ...rule, index }));
}

function toClashProxy(node: ProxyNode): Record<string, unknown> | undefined {
  if (node.raw && !("line" in node.raw) && isRecord(node.raw)) {
    return node.raw;
  }

  if (!node.server || !node.port) {
    return undefined;
  }

  return {
    name: node.name,
    type: node.type,
    server: node.server,
    port: node.port,
  };
}

function toClashGroup(group: ProxyGroup): Record<string, unknown> {
  const value: Record<string, unknown> = {
    name: group.name,
    type: group.type,
  };

  if (group.proxies.length > 0) value.proxies = group.proxies;
  if (group.use?.length) value.use = group.use;
  if (group.url) value.url = group.url;
  if (group.interval) value.interval = group.interval;
  if (group.tolerance) value.tolerance = group.tolerance;
  if (group.lazy !== undefined) value.lazy = group.lazy;
  if (group.filter) value.filter = group.filter;

  return value;
}


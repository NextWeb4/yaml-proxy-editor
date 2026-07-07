import { parseDocument, stringify } from "yaml";
import { isRecord, parseRules, splitRule } from "../clash/clashService";
import type { Finding, RuleItem } from "../../types/domain";
import { SUPPORTED_RULE_TYPES, SUPPORTED_RULE_TYPE_SET } from "./ruleTypes";
export { SUPPORTED_RULE_TYPES } from "./ruleTypes";

export interface RuleDraft {
  type: string;
  value?: string;
  target: string;
  noResolve?: boolean;
}

export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  rules: RuleDraft[];
}

export interface RuleEditResult {
  yaml: string;
  findings: Finding[];
}

interface ParsedRuleImport {
  rules: string[];
  skippedCount: number;
  findings: Finding[];
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: "direct-cn",
    name: "国内直连",
    description: "常见国内域名和 CN IP 直连。",
    rules: [
      { type: "GEOSITE", value: "cn", target: "DIRECT" },
      { type: "GEOIP", value: "CN", target: "DIRECT", noResolve: true },
    ],
  },
  {
    id: "foreign-proxy",
    name: "国外代理",
    description: "非中国站点走指定代理分组。",
    rules: [{ type: "GEOSITE", value: "geolocation-!cn", target: "__TARGET__" }],
  },
  {
    id: "ai-proxy",
    name: "AI 服务",
    description: "OpenAI、Anthropic、Gemini 等服务走代理。",
    rules: [
      { type: "DOMAIN-SUFFIX", value: "openai.com", target: "__TARGET__" },
      { type: "DOMAIN-SUFFIX", value: "chatgpt.com", target: "__TARGET__" },
      { type: "DOMAIN-SUFFIX", value: "anthropic.com", target: "__TARGET__" },
      { type: "DOMAIN-SUFFIX", value: "claude.ai", target: "__TARGET__" },
      { type: "DOMAIN-SUFFIX", value: "googleapis.com", target: "__TARGET__" },
    ],
  },
  {
    id: "streaming-proxy",
    name: "流媒体",
    description: "常见海外流媒体走代理。",
    rules: [
      { type: "GEOSITE", value: "netflix", target: "__TARGET__" },
      { type: "DOMAIN-SUFFIX", value: "disneyplus.com", target: "__TARGET__" },
      { type: "DOMAIN-SUFFIX", value: "youtube.com", target: "__TARGET__" },
    ],
  },
  {
    id: "ads-reject",
    name: "广告拦截",
    description: "常见广告规则拒绝连接。",
    rules: [
      { type: "GEOSITE", value: "category-ads-all", target: "REJECT" },
      { type: "DOMAIN-KEYWORD", value: "ads", target: "REJECT" },
    ],
  },
  {
    id: "ipleak-proxy",
    name: "泄露测试",
    description: "IP/DNS 泄露测试站点走代理分组。",
    rules: [
      { type: "DOMAIN-SUFFIX", value: "ipleak.net", target: "__TARGET__" },
      { type: "DOMAIN-SUFFIX", value: "browserleaks.com", target: "__TARGET__" },
      { type: "DOMAIN-SUFFIX", value: "dnsleaktest.com", target: "__TARGET__" },
    ],
  },
];

export function buildRuleRaw(draft: RuleDraft): string {
  const type = draft.type.trim().toUpperCase();
  const target = draft.target.trim();
  const value = draft.value?.trim() ?? "";

  if (!SUPPORTED_RULE_TYPE_SET.has(type)) {
    throw new Error(`不支持的规则类型：${draft.type}`);
  }

  if (!target) {
    throw new Error("规则目标不能为空。");
  }

  if (type === "MATCH") {
    return `MATCH,${target}`;
  }

  if (!value) {
    throw new Error("规则匹配值不能为空。");
  }

  const parts = [type, value, target];
  if (draft.noResolve && (type === "IP-CIDR" || type === "IP-CIDR6" || type === "GEOIP")) {
    parts.push("no-resolve");
  }

  return parts.join(",");
}

export function addRuleToYaml(source: string, draft: RuleDraft): RuleEditResult {
  const parsed = parseConfig(source);
  if (parsed.findings.length > 0) return { yaml: source, findings: parsed.findings };

  const nextRules = insertBeforeMatch(readRuleStrings(parsed.config), buildRuleRaw(draft));
  return writeRules(parsed.config, nextRules);
}

export function deleteRuleFromYaml(source: string, index: number): RuleEditResult {
  const parsed = parseConfig(source);
  if (parsed.findings.length > 0) return { yaml: source, findings: parsed.findings };

  const rules = readRuleStrings(parsed.config);
  if (index < 0 || index >= rules.length) {
    return {
      yaml: source,
      findings: [
        {
          id: "rule-index-out-of-range",
          severity: "error",
          title: "规则索引无效",
          message: `无法删除第 ${index + 1} 条规则，当前只有 ${rules.length} 条。`,
          path: "/rules",
        },
      ],
    };
  }

  rules.splice(index, 1);
  return writeRules(parsed.config, rules);
}

export function moveRuleInYaml(source: string, index: number, direction: -1 | 1): RuleEditResult {
  const parsed = parseConfig(source);
  if (parsed.findings.length > 0) return { yaml: source, findings: parsed.findings };

  const rules = readRuleStrings(parsed.config);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || index >= rules.length || targetIndex >= rules.length) {
    return { yaml: source, findings: [] };
  }

  const [rule] = rules.splice(index, 1);
  rules.splice(targetIndex, 0, rule);
  return writeRules(parsed.config, rules);
}

export function applyRuleTemplateToYaml(source: string, templateId: string, targetGroup: string): RuleEditResult {
  const template = RULE_TEMPLATES.find((item) => item.id === templateId);
  if (!template) {
    return {
      yaml: source,
      findings: [
        {
          id: "unknown-rule-template",
          severity: "error",
          title: "规则模板不存在",
          message: `未找到规则模板：${templateId}`,
          path: "/rules",
        },
      ],
    };
  }

  const parsed = parseConfig(source);
  if (parsed.findings.length > 0) return { yaml: source, findings: parsed.findings };

  const rules = readRuleStrings(parsed.config);
  for (const draft of template.rules) {
    const target = draft.target === "__TARGET__" ? targetGroup : draft.target;
    const raw = buildRuleRaw({ ...draft, target });
    if (!rules.includes(raw)) {
      rules.push(raw);
    }
  }

  return writeRules(parsed.config, rules);
}

export function importRulesToYaml(source: string, rawInput: string): RuleEditResult {
  const parsed = parseConfig(source);
  if (parsed.findings.length > 0) return { yaml: source, findings: parsed.findings };

  const imported = parseRuleImport(rawInput);
  if (imported.rules.length === 0) {
    return {
      yaml: source,
      findings: [
        ...imported.findings,
        {
          id: "rules-import-empty",
          severity: "warning",
          title: "没有可导入的规则",
          message: `批量输入中没有有效规则，已跳过 ${imported.skippedCount} 行。`,
          path: "/rules",
        },
      ],
    };
  }

  const existingRules = normalizeRuleStrings(readRuleStrings(parsed.config));
  const existingParsed = parseRules(existingRules);
  const importedParsed = parseRules(imported.rules);
  const importedMatch = [...importedParsed].reverse().find((rule) => rule.type === "MATCH");
  const existingMatch = [...existingParsed].reverse().find((rule) => rule.type === "MATCH");
  const mergedRules = [
    ...existingParsed.filter((rule) => rule.type !== "MATCH").map((rule) => rule.raw),
    ...importedParsed.filter((rule) => rule.type !== "MATCH").map((rule) => rule.raw),
    importedMatch?.raw ?? existingMatch?.raw ?? "MATCH,DIRECT",
  ];

  const result = writeRules(parsed.config, mergedRules);
  const nextRules = readRuleStrings(parseConfig(result.yaml).config);
  const existingSet = new Set(existingRules);
  const addedCount = nextRules.filter((rule) => !existingSet.has(rule)).length;
  const totalSkipped = imported.skippedCount + Math.max(0, mergedRules.length - nextRules.length);

  return {
    yaml: result.yaml,
    findings: [
      {
        id: "rules-imported",
        severity: "info",
        title: "规则批量导入完成",
        message: `新增 ${addedCount} 条规则，跳过 ${totalSkipped} 行或重复项。`,
        path: "/rules",
      },
      ...imported.findings,
      ...result.findings,
    ],
  };
}

export function commentRulesInYaml(source: string, indexes: number[]): RuleEditResult {
  const parsed = parseConfig(source);
  if (parsed.findings.length > 0) return { yaml: source, findings: parsed.findings };

  const rules = readRuleStrings(parsed.config);
  const requestedIndexes = new Set(indexes.filter(Number.isInteger));
  const parsedRules = parseRules(rules);
  const invalidCount = Array.from(requestedIndexes).filter((index) => index < 0 || index >= rules.length).length;
  const matchCount = parsedRules.filter((rule) => requestedIndexes.has(rule.index) && rule.type === "MATCH").length;
  const commentableRules = parsedRules.filter((rule) => requestedIndexes.has(rule.index) && rule.type !== "MATCH");

  if (requestedIndexes.size === 0 || commentableRules.length === 0) {
    return {
      yaml: source,
      findings: [
        {
          id: "rules-comment-empty",
          severity: "warning",
          title: "没有可注释的规则",
          message: requestedIndexes.size === 0 ? "请先选择需要注释的非 MATCH 规则。" : "所选规则不能被注释或索引无效。",
          path: "/rules",
        },
      ],
    };
  }

  const commentedIndexes = new Set(commentableRules.map((rule) => rule.index));
  const remainingRules = rules.filter((_, index) => !commentedIndexes.has(index));
  const result = writeRules(parsed.config, remainingRules);
  const findings: Finding[] = [
    {
      id: "rules-commented",
      severity: "info",
      title: "规则批量注释完成",
      message: `已注释 ${commentableRules.length} 条规则。`,
      path: "/rules",
    },
    ...result.findings,
  ];

  if (matchCount > 0) {
    findings.push({
      id: "rules-comment-match-skipped",
      severity: "warning",
      title: "已跳过 MATCH",
      message: "MATCH 兜底规则必须保留启用状态，未参与批量注释。",
      path: "/rules",
    });
  }

  if (invalidCount > 0) {
    findings.push({
      id: "rules-comment-invalid-index",
      severity: "warning",
      title: "已跳过无效索引",
      message: `有 ${invalidCount} 个所选规则索引超出当前 rules 范围。`,
      path: "/rules",
    });
  }

  return {
    yaml: injectCommentedRules(result.yaml, commentableRules.map((rule) => rule.raw)),
    findings,
  };
}

export function normalizeRuleStrings(rawRules: string[], fallbackTarget = "DIRECT"): string[] {
  const seen = new Set<string>();
  const deduped = rawRules
    .map((rule) => rule.trim())
    .filter(Boolean)
    .filter((rule) => {
      if (seen.has(rule)) return false;
      seen.add(rule);
      return true;
    });
  const parsed = parseRules(deduped);
  const nonMatch = parsed.filter((rule) => rule.type !== "MATCH").map((rule) => rule.raw);
  const match = [...parsed].reverse().find((rule) => rule.type === "MATCH");

  return [...nonMatch, match?.raw ?? `MATCH,${fallbackTarget}`];
}

function parseRuleImport(rawInput: string): ParsedRuleImport {
  const findings: Finding[] = [];
  const rules: string[] = [];
  let skippedCount = 0;

  rawInput.split(/\r?\n/u).forEach((line, index) => {
    const parsed = parseImportLine(line, index + 1);
    if (parsed.rule) {
      rules.push(parsed.rule);
      return;
    }

    skippedCount += 1;
    if (parsed.finding) {
      findings.push(parsed.finding);
    }
  });

  return { rules, skippedCount, findings };
}

function parseImportLine(line: string, lineNumber: number): { rule?: string; finding?: Finding } {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return {};
  }

  const withoutListMarker = trimmed.startsWith("- ") ? trimmed.slice(2).trim() : trimmed;
  const parts = splitRule(withoutListMarker).filter(Boolean);
  const type = (parts[0] ?? "").toUpperCase();

  if (!SUPPORTED_RULE_TYPE_SET.has(type)) {
    return {
      finding: {
        id: `rules-import-unsupported-${lineNumber}`,
        severity: "warning",
        title: "跳过不支持的规则",
        message: `第 ${lineNumber} 行规则类型不受支持：${parts[0] ?? trimmed}`,
        path: `/rules/import/${lineNumber}`,
      },
    };
  }

  if (type === "MATCH") {
    const target = parts[1];
    if (!target) {
      return {
        finding: {
          id: `rules-import-invalid-match-${lineNumber}`,
          severity: "warning",
          title: "跳过无效 MATCH",
          message: `第 ${lineNumber} 行 MATCH 缺少目标。`,
          path: `/rules/import/${lineNumber}`,
        },
      };
    }
    return { rule: `MATCH,${target}` };
  }

  const targetIndex = findRuleTargetIndex(parts);
  const value = targetIndex === undefined ? "" : parts.slice(1, targetIndex).join(",");
  const target = targetIndex === undefined ? undefined : parts[targetIndex];
  if (!value || !target || targetIndex === undefined) {
    return {
      finding: {
        id: `rules-import-invalid-${lineNumber}`,
        severity: "warning",
        title: "跳过无效规则",
        message: `第 ${lineNumber} 行需要至少包含 类型,匹配值,目标。`,
        path: `/rules/import/${lineNumber}`,
      },
    };
  }

  return { rule: [type, value, target, ...parts.slice(targetIndex + 1)].join(",") };
}

function findRuleTargetIndex(parts: string[]): number | undefined {
  for (let index = parts.length - 1; index >= 2; index -= 1) {
    const part = parts[index];
    if (part && !["no-resolve", "src"].includes(part)) {
      return index;
    }
  }
  return undefined;
}

function injectCommentedRules(source: string, rules: string[]): string {
  const lines = source.split(/\r?\n/u);
  const rulesLineIndex = lines.findIndex((line) => /^rules:\s*$/u.test(line));
  const comments = rules.map((rule) => `  # - ${rule}`);

  if (rulesLineIndex < 0) {
    return `${source.trimEnd()}\nrules:\n${comments.join("\n")}\n`;
  }

  lines.splice(rulesLineIndex + 1, 0, ...comments);
  return lines.join("\n");
}

function parseConfig(source: string): { config: Record<string, unknown>; findings: Finding[] } {
  const document = parseDocument(source, {
    prettyErrors: true,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    return {
      config: {},
      findings: document.errors.map((error, index) => ({
        id: `rule-editor-yaml-error-${index}`,
        severity: "error",
        title: "规则编辑失败",
        message: error.message,
        path: "/rules",
      })),
    };
  }

  const value = document.toJS({ maxAliasCount: 100 });
  return {
    config: isRecord(value) ? { ...value } : {},
    findings: [],
  };
}

function readRuleStrings(config: Record<string, unknown>): string[] {
  return Array.isArray(config.rules) ? config.rules.map(String) : [];
}

function insertBeforeMatch(rules: string[], rawRule: string): string[] {
  if (rules.includes(rawRule)) {
    return normalizeRuleStrings(rules);
  }

  const parsed = parseRules(rules);
  const matchIndex = parsed.findIndex((rule) => rule.type === "MATCH");
  const nextRules = [...rules];
  nextRules.splice(matchIndex >= 0 ? matchIndex : nextRules.length, 0, rawRule);
  return normalizeRuleStrings(nextRules);
}

function writeRules(config: Record<string, unknown>, rules: string[]): RuleEditResult {
  const normalized = normalizeRuleStrings(rules);
  const beforeCount = rules.length;
  config.rules = normalized;

  const findings: Finding[] = [];
  if (normalized.length < beforeCount) {
    findings.push({
      id: "rules-deduped",
      severity: "info",
      title: "规则已去重",
      message: "重复规则已在写入前移除。",
      path: "/rules",
    });
  }

  const parsed = parseRules(normalized);
  if (parsed.at(-1)?.type !== "MATCH") {
    findings.push({
      id: "rules-match-normalized",
      severity: "warning",
      title: "MATCH 规则异常",
      message: "规则编辑器未能将 MATCH 规则保持在最后。",
      path: "/rules",
    });
  }

  return {
    yaml: stringify(config, {
      indent: 2,
      lineWidth: 0,
    }),
    findings,
  };
}

import type { Finding } from "../../types/domain";
import { parseAllowedSubscriptionUrl, redactSubscriptionUrl } from "./subscriptionRefresh";

export interface BatchSubscriptionItem {
  name: string;
  url: string;
  redactedUrl: string;
  lineNumber: number;
}

export interface BatchSubscriptionParseResult {
  items: BatchSubscriptionItem[];
  findings: Finding[];
}

export function parseBatchSubscriptionInput(rawInput: string): BatchSubscriptionParseResult {
  const findings: Finding[] = [];
  const items: BatchSubscriptionItem[] = [];
  const usedNames = new Set<string>();

  rawInput.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;

    const urlMatch = line.match(/https?:\/\/\S+/i);
    if (!urlMatch?.[0]) {
      findings.push(batchFinding(lineNumber, "error", "批量订阅格式错误", `第 ${lineNumber} 行没有发现 http(s) 订阅 URL。`));
      return;
    }

    const rawUrl = trimUrlToken(urlMatch[0]);
    let url: URL;
    try {
      url = parseAllowedSubscriptionUrl(rawUrl);
    } catch (error) {
      findings.push(batchFinding(lineNumber, "error", "批量订阅 URL 无效", `第 ${lineNumber} 行：${error instanceof Error ? error.message : String(error)}`));
      return;
    }

    const name = nextUniqueName(inferSubscriptionName(line, urlMatch.index ?? 0, rawUrl, url, lineNumber), usedNames);
    usedNames.add(name);
    items.push({
      name,
      url: url.toString(),
      redactedUrl: redactSubscriptionUrl(url.toString()),
      lineNumber,
    });
  });

  if (items.length === 0 && findings.length === 0 && rawInput.trim()) {
    findings.push(batchFinding(0, "error", "批量订阅格式错误", "没有发现可导入的订阅 URL。"));
  }

  return { items, findings };
}

function inferSubscriptionName(line: string, urlIndex: number, rawUrl: string, url: URL, lineNumber: number): string {
  const beforeUrl = line.slice(0, urlIndex).trim().replace(/[|,，;；:：]+$/g, "").trim();
  if (beforeUrl) return beforeUrl;

  const afterUrl = line.slice(urlIndex + rawUrl.length).trim().replace(/^[|,，;；:：]+/g, "").trim();
  if (afterUrl && !afterUrl.startsWith("#")) return afterUrl;

  return url.hostname.replace(/^www\./i, "") || `订阅 ${lineNumber}`;
}

function trimUrlToken(value: string): string {
  return value.replace(/[),，;；。]+$/g, "");
}

function nextUniqueName(baseName: string, usedNames: Set<string>): string {
  const cleanBase = baseName.trim() || "未命名订阅";
  if (!usedNames.has(cleanBase)) return cleanBase;

  let index = 2;
  let candidate = `${cleanBase}-${index}`;
  while (usedNames.has(candidate)) {
    index += 1;
    candidate = `${cleanBase}-${index}`;
  }
  return candidate;
}

function batchFinding(lineNumber: number, severity: Finding["severity"], title: string, message: string): Finding {
  return {
    id: `batch-subscription-line-${lineNumber}-${severity}`,
    severity,
    title,
    message,
    path: lineNumber > 0 ? `/batch-subscriptions/${lineNumber}` : "/batch-subscriptions",
  };
}

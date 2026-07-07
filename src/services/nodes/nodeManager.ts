import { parseDocument, stringify } from "yaml";
import type { Finding, ProxyGroup, ProxyNode } from "../../types/domain";
import { isRecord } from "../clash/clashService";

export interface NodeFilter {
  keyword?: string;
  type?: string;
  region?: string;
  rate?: string;
  subscriptionName?: string;
}

export interface NormalizedNodeMetadata {
  region?: string;
  rate?: string;
}

export interface NodeEditResult {
  yaml: string;
  findings: Finding[];
}

export interface SubscriptionNodeImportOptions {
  targetGroupName?: string;
}

export interface SubscriptionNodeImportSummary {
  requestedCount: number;
  importedCount: number;
  skippedDuplicateCount: number;
  renamedCount: number;
  addedToGroupCount: number;
  targetGroupName?: string;
}

export interface SubscriptionNodeImportResult extends NodeEditResult {
  summary: SubscriptionNodeImportSummary;
}

export function attachNodeGroups(nodes: ProxyNode[], groups: ProxyGroup[]): ProxyNode[] {
  const groupsByNode = new Map<string, string[]>();
  for (const group of groups) {
    for (const proxyName of group.proxies) {
      groupsByNode.set(proxyName, [...(groupsByNode.get(proxyName) ?? []), group.name]);
    }
  }

  return nodes.map((node) => ({
    ...node,
    groups: groupsByNode.get(node.name) ?? [],
  }));
}

export function filterProxyNodes(nodes: ProxyNode[], filter: NodeFilter): ProxyNode[] {
  const keyword = filter.keyword?.trim().toLowerCase();

  return nodes.filter((node) => {
    const metadata = inferNodeMetadata(node);
    if (keyword) {
      const haystack = [node.name, node.server, node.subscriptionName].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    if (filter.type && node.type !== filter.type) return false;
    if (filter.region && metadata.region !== filter.region) return false;
    if (filter.rate && metadata.rate !== filter.rate) return false;
    if (filter.subscriptionName && node.subscriptionName !== filter.subscriptionName) return false;
    return true;
  });
}

export function getNodeFilterOptions(nodes: ProxyNode[]): {
  types: string[];
  regions: string[];
  rates: string[];
  subscriptions: string[];
} {
  return {
    types: uniqueSorted(nodes.map((node) => node.type)),
    regions: uniqueSorted(nodes.map((node) => inferNodeMetadata(node).region)),
    rates: uniqueSorted(nodes.map((node) => inferNodeMetadata(node).rate)),
    subscriptions: uniqueSorted(nodes.map((node) => node.subscriptionName)),
  };
}

export function normalizeProxyNodes(nodes: ProxyNode[]): ProxyNode[] {
  return nodes.map((node) => {
    const metadata = inferNodeMetadata(node);
    return {
      ...node,
      region: metadata.region,
      rate: metadata.rate,
    };
  });
}

export function renameProxyNodeInYaml(source: string, oldName: string, newName: string): NodeEditResult {
  const parsed = parseConfig(source);
  if (parsed.findings.length > 0) return { yaml: source, findings: parsed.findings };

  const cleanOldName = oldName.trim();
  const cleanNewName = newName.trim();
  if (!cleanNewName) {
    return {
      yaml: source,
      findings: [
        {
          id: "node-rename-empty",
          severity: "error",
          title: "节点重命名失败",
          message: "新节点名称不能为空。",
          path: "/proxies",
        },
      ],
    };
  }

  const proxies = Array.isArray(parsed.config.proxies) ? parsed.config.proxies : [];
  if (proxies.some((proxy) => isRecord(proxy) && proxy.name === cleanNewName && proxy.name !== cleanOldName)) {
    return {
      yaml: source,
      findings: [
        {
          id: "node-rename-duplicate",
          severity: "error",
          title: "节点重命名失败",
          message: `已存在名为「${cleanNewName}」的节点。`,
          path: "/proxies",
        },
      ],
    };
  }

  let renamed = 0;
  for (const proxy of proxies) {
    if (isRecord(proxy) && proxy.name === cleanOldName) {
      proxy.name = cleanNewName;
      renamed += 1;
    }
  }

  if (renamed === 0) {
    return {
      yaml: source,
      findings: [
        {
          id: "node-rename-not-found",
          severity: "error",
          title: "节点重命名失败",
          message: `没有找到节点「${cleanOldName}」。`,
          path: "/proxies",
        },
      ],
    };
  }

  const updatedReferences = updateGroupProxyNames(parsed.config, cleanOldName, cleanNewName);
  return {
    yaml: stringify(parsed.config, { indent: 2, lineWidth: 0 }),
    findings: [
      {
        id: "node-renamed",
        severity: "info",
        title: "节点已重命名",
        message: `已将「${cleanOldName}」改为「${cleanNewName}」，并更新 ${updatedReferences} 个分组引用。`,
        path: "/proxies",
      },
    ],
  };
}

export function disableProxyNodesInYaml(source: string, nodeNames: string[]): NodeEditResult {
  const parsed = parseConfig(source);
  if (parsed.findings.length > 0) return { yaml: source, findings: parsed.findings };

  const disabled = new Set(nodeNames.map((name) => name.trim()).filter(Boolean));
  if (disabled.size === 0) {
    return { yaml: source, findings: [] };
  }

  let removedReferences = 0;
  const groups = parsed.config["proxy-groups"];
  if (Array.isArray(groups)) {
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.proxies)) continue;
      const proxyList = group.proxies;
      const nextProxyList = proxyList.filter((proxy) => !disabled.has(String(proxy)));
      group.proxies = nextProxyList;
      removedReferences += proxyList.length - nextProxyList.length;
    }
  }

  return {
    yaml: stringify(parsed.config, { indent: 2, lineWidth: 0 }),
    findings: [
      {
        id: "nodes-disabled",
        severity: removedReferences > 0 ? "info" : "warning",
        title: "节点已从分组禁用",
        message:
          removedReferences > 0
            ? `已从 proxy-groups 中移除 ${removedReferences} 个节点引用，proxies 原始节点保留。`
            : "没有发现需要移除的分组引用。",
        path: "/proxy-groups",
      },
    ],
  };
}

export function addProxyNodesToGroupInYaml(source: string, nodeNames: string[], groupName: string): NodeEditResult {
  const parsed = parseConfig(source);
  if (parsed.findings.length > 0) return { yaml: source, findings: parsed.findings };

  const cleanGroupName = groupName.trim();
  if (!cleanGroupName) {
    return {
      yaml: source,
      findings: [
        {
          id: "node-group-empty",
          severity: "error",
          title: "加入分组失败",
          message: "目标分组不能为空。",
          path: "/proxy-groups",
        },
      ],
    };
  }

  const requestedNodes = uniquePreservingOrder(nodeNames.map((name) => name.trim()).filter(Boolean));
  if (requestedNodes.length === 0) {
    return { yaml: source, findings: [] };
  }

  const groups = parsed.config["proxy-groups"];
  if (!Array.isArray(groups)) {
    return {
      yaml: source,
      findings: [
        {
          id: "node-group-missing-section",
          severity: "error",
          title: "加入分组失败",
          message: "当前 YAML 没有 proxy-groups，无法加入分组。",
          path: "/proxy-groups",
        },
      ],
    };
  }

  const targetGroup = groups.find((group) => isRecord(group) && group.name === cleanGroupName);
  if (!isRecord(targetGroup)) {
    return {
      yaml: source,
      findings: [
        {
          id: "node-group-not-found",
          severity: "error",
          title: "加入分组失败",
          message: `没有找到分组「${cleanGroupName}」。`,
          path: "/proxy-groups",
        },
      ],
    };
  }

  const localProxyNames = new Set(
    (Array.isArray(parsed.config.proxies) ? parsed.config.proxies : [])
      .filter(isRecord)
      .map((proxy) => (typeof proxy.name === "string" ? proxy.name : ""))
      .filter(Boolean),
  );
  const addableNodes = requestedNodes.filter((name) => localProxyNames.has(name));
  const skippedMissing = requestedNodes.length - addableNodes.length;
  const currentProxyList = Array.isArray(targetGroup.proxies) ? targetGroup.proxies.map(String) : [];
  const currentProxySet = new Set(currentProxyList);
  const nodesToAdd = addableNodes.filter((name) => !currentProxySet.has(name));

  targetGroup.proxies = [...currentProxyList, ...nodesToAdd];

  const skippedDuplicates = addableNodes.length - nodesToAdd.length;
  const skippedMessages = [
    skippedDuplicates > 0 ? `${skippedDuplicates} 个已在分组中` : "",
    skippedMissing > 0 ? `${skippedMissing} 个不在当前 YAML proxies 中` : "",
  ].filter(Boolean);

  return {
    yaml: stringify(parsed.config, { indent: 2, lineWidth: 0 }),
    findings: [
      {
        id: "nodes-added-to-group",
        severity: nodesToAdd.length > 0 ? "info" : "warning",
        title: "节点已加入分组",
        message:
          nodesToAdd.length > 0
            ? `已将 ${nodesToAdd.length} 个节点加入「${cleanGroupName}」${skippedMessages.length ? `，跳过 ${skippedMessages.join("、")}。` : "。"}`
            : `没有新增节点到「${cleanGroupName}」${skippedMessages.length ? `，跳过 ${skippedMessages.join("、")}。` : "。"}`,
        path: `/proxy-groups/${cleanGroupName}`,
      },
    ],
  };
}

export function importSubscriptionNodesToYaml(
  source: string,
  nodes: ProxyNode[],
  options: SubscriptionNodeImportOptions = {},
): SubscriptionNodeImportResult {
  const emptySummary: SubscriptionNodeImportSummary = {
    requestedCount: nodes.length,
    importedCount: 0,
    skippedDuplicateCount: 0,
    renamedCount: 0,
    addedToGroupCount: 0,
    targetGroupName: options.targetGroupName,
  };
  const parsed = parseConfig(source);
  if (parsed.findings.length > 0) return { yaml: source, findings: parsed.findings, summary: emptySummary };

  if (nodes.length === 0) {
    return {
      yaml: source,
      summary: emptySummary,
      findings: [
        {
          id: "subscription-import-empty",
          severity: "warning",
          title: "订阅节点导入失败",
          message: "当前订阅没有可导入节点。",
          path: "/subscription",
        },
      ],
    };
  }

  if (parsed.config.proxies !== undefined && !Array.isArray(parsed.config.proxies)) {
    return {
      yaml: source,
      summary: emptySummary,
      findings: [
        {
          id: "subscription-import-proxies-invalid",
          severity: "error",
          title: "订阅节点导入失败",
          message: "当前 YAML 的 proxies 不是数组，无法安全追加订阅节点。",
          path: "/proxies",
        },
      ],
    };
  }

  const proxies = Array.isArray(parsed.config.proxies) ? parsed.config.proxies : [];
  parsed.config.proxies = proxies;
  const identityToName = new Map<string, string>();
  const nodeNames = new Set<string>();

  for (const proxy of proxies) {
    if (!isRecord(proxy)) continue;
    const name = typeof proxy.name === "string" ? proxy.name : "";
    if (name) nodeNames.add(name);
    identityToName.set(proxyRecordIdentity(proxy), name);
  }

  let skippedDuplicateCount = 0;
  let importedCount = 0;
  let renamedCount = 0;
  const importedNames: string[] = [];

  for (const node of nodes) {
    const proxy = toClashProxy(node);
    const originalName = String(proxy.name ?? node.name ?? "").trim();
    if (!originalName) continue;

    proxy.name = originalName;
    const identity = proxyRecordIdentity(proxy);
    const existingName = identityToName.get(identity);
    if (existingName) {
      skippedDuplicateCount += 1;
      importedNames.push(existingName);
      continue;
    }

    if (nodeNames.has(originalName)) {
      proxy.name = nextAvailableNodeName(originalName, nodeNames);
      renamedCount += 1;
    }

    const importedName = String(proxy.name);
    proxies.push(proxy);
    importedCount += 1;
    nodeNames.add(importedName);
    identityToName.set(proxyRecordIdentity(proxy), importedName);
    importedNames.push(importedName);
  }

  const uniqueImportedNames = uniquePreservingOrder(importedNames);
  const groupResult = addImportedNodesToGroup(parsed.config, uniqueImportedNames, options.targetGroupName);
  const summary: SubscriptionNodeImportSummary = {
    requestedCount: nodes.length,
    importedCount,
    skippedDuplicateCount,
    renamedCount,
    addedToGroupCount: groupResult.addedToGroupCount,
    targetGroupName: options.targetGroupName,
  };
  const findings: Finding[] = [
    {
      id: "subscription-nodes-imported",
      severity: importedCount > 0 ? "info" : "warning",
      title: "订阅节点导入完成",
      message: `请求 ${nodes.length} 个节点，新增 ${importedCount} 个，跳过重复 ${skippedDuplicateCount} 个${
        renamedCount > 0 ? `，自动改名 ${renamedCount} 个` : ""
      }${groupResult.messageSuffix}`,
      path: "/proxies",
    },
  ];

  if (groupResult.finding) findings.push(groupResult.finding);

  return {
    yaml: stringify(parsed.config, { indent: 2, lineWidth: 0 }),
    findings,
    summary,
  };
}

export function exportProxyNodesYaml(nodes: ProxyNode[]): string {
  return stringify(
    {
      proxies: nodes.map((node) => toClashProxy(node)),
    },
    { indent: 2, lineWidth: 0 },
  );
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
        id: `node-manager-yaml-error-${index}`,
        severity: "error",
        title: "节点管理失败",
        message: error.message,
        path: "/proxies",
      })),
    };
  }

  const value = document.toJS({ maxAliasCount: 100 });
  return {
    config: isRecord(value) ? { ...value } : {},
    findings: [],
  };
}

function inferNodeMetadata(node: ProxyNode): NormalizedNodeMetadata {
  return {
    region: node.region ?? inferNodeRegion(node),
    rate: node.rate ?? inferNodeRate(node),
  };
}

function inferNodeRegion(node: ProxyNode): string | undefined {
  const text = collectNodeText(node);
  return REGION_PATTERNS.find(([pattern]) => pattern.test(text))?.[1];
}

function inferNodeRate(node: ProxyNode): string | undefined {
  const text = collectNodeText(node);
  const direct = text.match(/(?:倍率|rate|ratio|x-rate|traffic-rate)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(?:x|倍)/i)?.[1];
  if (direct) return normalizeRateValue(direct);

  const multiplier = text.match(/(?<![a-z0-9])(\d+(?:\.\d+)?)\s*(?:x|倍)(?![a-z0-9])/i)?.[1];
  if (multiplier) return normalizeRateValue(multiplier);

  return undefined;
}

function normalizeRateValue(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value}x`;
  return `${Number.isInteger(numeric) ? numeric : numeric.toString()}x`;
}

function collectNodeText(node: ProxyNode): string {
  const raw = node.raw ?? {};
  const rawValues = [
    raw.name,
    raw.server,
    raw.country,
    raw.region,
    raw.location,
    raw.remark,
    raw.remarks,
    raw.label,
    raw.tag,
    raw["x-region"],
    raw["x-country"],
    raw["x-rate"],
    raw.rate,
    raw.ratio,
  ]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .join(" ");
  return [node.name, node.server, node.subscriptionName, rawValues].filter(Boolean).join(" ");
}

const REGION_PATTERNS: Array<[RegExp, string]> = [
  [/🇭🇰|香港|港(?!元)|Hong\s*Kong|\bHK\b|\bHKG\b|HongKong|\.hk\b|hk[.-]/i, "香港"],
  [/🇲🇴|澳门|澳門|Macau|Macao|\bMO\b|\.mo\b|mo[.-]/i, "澳门"],
  [/🇹🇼|台湾|臺灣|台灣|Taiwan|\bTW\b|\bTPE\b|\.tw\b|tw[.-]/i, "台湾"],
  [/🇯🇵|日本|东京|大阪|川日|沪日|Japan|Tokyo|Osaka|\bJP\b|\bNRT\b|\bHND\b|\.jp\b|jp[.-]/i, "日本"],
  [/🇸🇬|新加坡|狮城|Singapore|\bSG\b|\bSIN\b|\.sg\b|sg[.-]/i, "新加坡"],
  [/🇰🇷|韩国|韓国|首尔|首爾|Korea|Seoul|\bKR\b|\bICN\b|\.kr\b|kr[.-]/i, "韩国"],
  [/🇺🇸|美国|美國|洛杉矶|洛杉磯|西雅图|西雅圖|圣何塞|聖何塞|纽约|紐約|United\s*States|America|Los\s*Angeles|San\s*Jose|Seattle|New\s*York|\bUS\b|\bUSA\b|\bLAX\b|\bSJC\b|\.us\b|us[.-]/i, "美国"],
  [/🇬🇧|英国|英國|伦敦|倫敦|United\s*Kingdom|Britain|London|\bUK\b|\bGB\b|\.uk\b|uk[.-]/i, "英国"],
  [/🇩🇪|德国|德國|法兰克福|法蘭克福|Germany|Frankfurt|\bDE\b|\bFRA\b|\.de\b|de[.-]/i, "德国"],
  [/🇫🇷|法国|法國|巴黎|France|Paris|\bFR\b|\bCDG\b|\.fr\b|fr[.-]/i, "法国"],
  [/🇳🇱|荷兰|荷蘭|阿姆斯特丹|Netherlands|Holland|Amsterdam|\bNL\b|\bAMS\b|\.nl\b|nl[.-]/i, "荷兰"],
  [/🇨🇦|加拿大|Canada|Toronto|Vancouver|多伦多|多倫多|温哥华|溫哥華|\bCA\b|\.ca\b|ca[.-]/i, "加拿大"],
  [/🇦🇺|澳大利亚|澳洲|澳大利亞|Australia|Sydney|悉尼|\bAU\b|\.au\b|au[.-]/i, "澳大利亚"],
  [/🇷🇺|俄罗斯|俄羅斯|Russia|Moscow|莫斯科|\bRU\b|\.ru\b|ru[.-]/i, "俄罗斯"],
  [/🇹🇷|土耳其|Turkey|Istanbul|伊斯坦布尔|伊斯坦堡|\bTR\b|\.tr\b|tr[.-]/i, "土耳其"],
  [/🇮🇳|印度|India|Mumbai|孟买|孟買|\bIN\b|\.in\b|in[.-]/i, "印度"],
  [/🇹🇭|泰国|泰國|Thailand|Bangkok|曼谷|\bTH\b|\.th\b|th[.-]/i, "泰国"],
  [/🇻🇳|越南|Vietnam|Ho\s*Chi\s*Minh|Hanoi|胡志明|河内|河內|\bVN\b|\.vn\b|vn[.-]/i, "越南"],
  [/🇵🇭|菲律宾|菲律賓|Philippines|Manila|马尼拉|馬尼拉|\bPH\b|\.ph\b|ph[.-]/i, "菲律宾"],
  [/🇲🇾|马来西亚|馬來西亞|Malaysia|Kuala\s*Lumpur|吉隆坡|\bMY\b|\.my\b|my[.-]/i, "马来西亚"],
  [/🇮🇩|印度尼西亚|印尼|Indonesia|Jakarta|雅加达|雅加達|\bID\b|\.id\b|id[.-]/i, "印度尼西亚"],
  [/🇧🇷|巴西|Brazil|Sao\s*Paulo|São\s*Paulo|圣保罗|聖保羅|\bBR\b|\.br\b|br[.-]/i, "巴西"],
  [/🇦🇷|阿根廷|Argentina|Buenos\s*Aires|布宜诺斯|布宜諾斯|\bAR\b|\.ar\b|ar[.-]/i, "阿根廷"],
  [/🇿🇦|南非|South\s*Africa|Johannesburg|约翰内斯堡|約翰尼斯堡|\bZA\b|\.za\b|za[.-]/i, "南非"],
];

function updateGroupProxyNames(config: Record<string, unknown>, oldName: string, newName: string): number {
  let updated = 0;
  const groups = config["proxy-groups"];
  if (!Array.isArray(groups)) return updated;

  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.proxies)) continue;
    group.proxies = group.proxies.map((proxy) => {
      if (String(proxy) === oldName) {
        updated += 1;
        return newName;
      }
      return proxy;
    });
  }

  return updated;
}

export function toClashProxy(node: ProxyNode): Record<string, unknown> {
  if (node.raw && !("line" in node.raw) && isRecord(node.raw)) {
    return { ...node.raw };
  }

  return {
    name: node.name,
    type: node.type,
    server: node.server,
    port: node.port,
  };
}

function addImportedNodesToGroup(
  config: Record<string, unknown>,
  nodeNames: string[],
  targetGroupName?: string,
): { addedToGroupCount: number; messageSuffix: string; finding?: Finding } {
  const cleanGroupName = targetGroupName?.trim();
  if (!cleanGroupName) return { addedToGroupCount: 0, messageSuffix: "。" };

  const groups = config["proxy-groups"];
  if (!Array.isArray(groups)) {
    return {
      addedToGroupCount: 0,
      messageSuffix: `，未加入分组「${cleanGroupName}」。`,
      finding: {
        id: "subscription-import-group-missing-section",
        severity: "warning",
        title: "订阅节点未加入分组",
        message: "当前 YAML 没有 proxy-groups，已仅导入 proxies。",
        path: "/proxy-groups",
      },
    };
  }

  const targetGroup = groups.find((group) => isRecord(group) && group.name === cleanGroupName);
  if (!isRecord(targetGroup)) {
    return {
      addedToGroupCount: 0,
      messageSuffix: `，未加入分组「${cleanGroupName}」。`,
      finding: {
        id: "subscription-import-group-not-found",
        severity: "warning",
        title: "订阅节点未加入分组",
        message: `没有找到分组「${cleanGroupName}」，已仅导入 proxies。`,
        path: "/proxy-groups",
      },
    };
  }

  const currentProxyList = Array.isArray(targetGroup.proxies) ? targetGroup.proxies.map(String) : [];
  const currentProxySet = new Set(currentProxyList);
  const nodesToAdd = nodeNames.filter((name) => !currentProxySet.has(name));
  targetGroup.proxies = [...currentProxyList, ...nodesToAdd];

  return {
    addedToGroupCount: nodesToAdd.length,
    messageSuffix: `，加入「${cleanGroupName}」${nodesToAdd.length} 个。`,
  };
}

function proxyRecordIdentity(proxy: Record<string, unknown>): string {
  return [proxy.type ?? "unknown", proxy.server ?? proxy.name ?? "", proxy.port ?? ""].join("|").toLowerCase();
}

function nextAvailableNodeName(baseName: string, existingNames: Set<string>): string {
  let index = 2;
  let candidate = `${baseName} (导入 ${index})`;
  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `${baseName} (导入 ${index})`;
  }
  return candidate;
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}

function uniquePreservingOrder(values: string[]): string[] {
  return Array.from(new Set(values));
}

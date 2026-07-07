export type FindingSeverity = "info" | "warning" | "error";

export interface SourcePosition {
  offset?: number;
  line?: number;
  column?: number;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  title: string;
  message: string;
  path?: string;
  suggestion?: string;
  autoFixable?: boolean;
  position?: SourcePosition;
}

export interface StructureNode {
  id: string;
  label: string;
  kind: "section" | "field" | "collection" | "item";
  path: string;
  count?: number;
  children?: StructureNode[];
}

export interface YamlFormatSummary {
  rootKind: "object" | "array" | "scalar" | "empty" | "invalid";
  dialect: "Clash/Mihomo/OpenClash" | "Clash-like" | "通用 YAML" | "无法识别";
  topLevelKeys: string[];
  readable: boolean;
  duplicateKeyCount: number;
}

export interface YamlInventoryItem {
  id: string;
  label: string;
  detail?: string;
  path: string;
}

export interface YamlInventorySection {
  id: string;
  title: string;
  count: number;
  items: YamlInventoryItem[];
}

export interface ProxyNode {
  id: string;
  name: string;
  type: string;
  server?: string;
  port?: number;
  region?: string;
  rate?: string;
  latencyMs?: number;
  downloadMbps?: number;
  failCount?: number;
  stabilityScore?: number;
  subscriptionName?: string;
  groups?: string[];
  raw?: Record<string, unknown>;
}

export interface ProxyGroup {
  name: string;
  type: string;
  proxies: string[];
  use?: string[];
  url?: string;
  interval?: number;
  tolerance?: number;
  lazy?: boolean;
  filter?: string;
}

export interface ProxyProvider {
  name: string;
  type: string;
  url?: string;
  interval?: number;
  proxy?: string;
  healthCheck?: {
    enable?: boolean;
    url?: string;
    interval?: number;
  };
  usedBy: string[];
  raw?: Record<string, unknown>;
}

export interface RuleItem {
  index: number;
  type: string;
  value: string;
  target?: string;
  raw: string;
  disabled?: boolean;
}

export interface ClashConfigSummary {
  ports: Record<string, unknown>;
  mode?: string;
  logLevel?: string;
  proxyCount: number;
  proxyProviderCount: number;
  proxyGroupCount: number;
  ruleProviderCount: number;
  ruleCount: number;
  dnsEnabled: boolean;
  hasTun: boolean;
  hasProfile: boolean;
  hasSniffer: boolean;
  hasHosts: boolean;
  proxies: ProxyNode[];
  proxyProviders: ProxyProvider[];
  proxyGroups: ProxyGroup[];
  rules: RuleItem[];
  structure: StructureNode[];
  findings: Finding[];
}

export interface YamlAnalysis {
  value: unknown;
  formatted?: string;
  syntaxFindings: Finding[];
  structure: StructureNode[];
  formatSummary: YamlFormatSummary;
  inventory: YamlInventorySection[];
  clash: ClashConfigSummary;
}

export interface SubscriptionParseResult {
  name: string;
  nodes: ProxyNode[];
  findings: Finding[];
  format: "clash-yaml" | "base64-links" | "unknown";
  traffic?: {
    upload?: number;
    download?: number;
    total?: number;
    expire?: number;
  };
}

export interface MergePreview {
  proxies: ProxyNode[];
  proxyGroups: ProxyGroup[];
  rules: RuleItem[];
  findings: Finding[];
}

export interface WorkbenchDocument {
  path?: string;
  name: string;
  content: string;
  dirty: boolean;
}

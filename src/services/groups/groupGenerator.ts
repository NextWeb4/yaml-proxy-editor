import type { ProxyGroup, ProxyNode } from "../../types/domain";

const PRESET_NAMES = {
  selector: "节点选择",
  auto: "自动选择",
  lowLatency: "低延迟",
  fast: "高速节点",
  stable: "稳定节点",
  global: "国外网站",
  cn: "国内直连",
  streaming: "流媒体",
  ai: "AI 服务",
  fallback: "漏网之鱼",
};

export function generateDefaultGroups(nodes: ProxyNode[]): ProxyGroup[] {
  const nodeNames = nodes.map((node) => node.name);
  const selectable = ["DIRECT", ...nodeNames];

  return [
    {
      name: PRESET_NAMES.selector,
      type: "select",
      proxies: [PRESET_NAMES.auto, PRESET_NAMES.lowLatency, PRESET_NAMES.fast, PRESET_NAMES.stable, ...selectable],
    },
    {
      name: PRESET_NAMES.auto,
      type: "url-test",
      proxies: nodeNames,
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      lazy: true,
    },
    {
      name: PRESET_NAMES.lowLatency,
      type: "url-test",
      proxies: nodeNames,
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 30,
      lazy: true,
    },
    {
      name: PRESET_NAMES.fast,
      type: "select",
      proxies: nodeNames,
      filter: "倍率|x|X|高速|Premium",
    },
    {
      name: PRESET_NAMES.stable,
      type: "fallback",
      proxies: nodeNames,
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      lazy: true,
    },
    { name: PRESET_NAMES.global, type: "select", proxies: [PRESET_NAMES.selector, PRESET_NAMES.auto, ...nodeNames] },
    { name: PRESET_NAMES.cn, type: "select", proxies: ["DIRECT", PRESET_NAMES.selector] },
    { name: PRESET_NAMES.streaming, type: "select", proxies: [PRESET_NAMES.selector, PRESET_NAMES.auto, ...nodeNames] },
    { name: PRESET_NAMES.ai, type: "select", proxies: [PRESET_NAMES.selector, PRESET_NAMES.auto, ...nodeNames] },
    { name: PRESET_NAMES.fallback, type: "select", proxies: [PRESET_NAMES.selector, "DIRECT"] },
  ];
}

export function groupsToYamlFragment(groups: ProxyGroup[]): string {
  const lines = ["proxy-groups:"];
  for (const group of groups) {
    lines.push(`  - name: ${JSON.stringify(group.name)}`);
    lines.push(`    type: ${group.type}`);
    if (group.url) lines.push(`    url: ${JSON.stringify(group.url)}`);
    if (group.interval) lines.push(`    interval: ${group.interval}`);
    if (group.tolerance) lines.push(`    tolerance: ${group.tolerance}`);
    if (group.lazy !== undefined) lines.push(`    lazy: ${group.lazy}`);
    if (group.filter) lines.push(`    filter: ${JSON.stringify(group.filter)}`);
    lines.push("    proxies:");
    for (const proxy of group.proxies) {
      lines.push(`      - ${JSON.stringify(proxy)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}


import type { WorkbenchDocument } from "../../types/domain";

export type YamlTemplateId = "clash" | "mihomo" | "openclash";

export interface YamlTemplate {
  id: YamlTemplateId;
  name: string;
  filename: string;
  description: string;
  content: string;
}

const YAML_TEMPLATES: YamlTemplate[] = [
  {
    id: "openclash",
    name: "OpenClash",
    filename: "new-openclash.yaml",
    description: "带 DNS、TUN 入口和 OpenClash 常见端口的基础配置。",
    content: `mixed-port: 7890
redir-port: 7892
tproxy-port: 7895
allow-lan: true
mode: rule
log-level: info
external-controller: 0.0.0.0:9090
secret: ""

dns:
  enable: true
  enhanced-mode: fake-ip
  listen: 0.0.0.0:7874
  nameserver:
    - 223.5.5.5
    - 119.29.29.29
  fallback:
    - 1.1.1.1
    - 8.8.8.8
  fallback-filter:
    geoip: true
    geoip-code: CN

tun:
  enable: false
  stack: system
  auto-route: true
  auto-detect-interface: true

proxies: []

proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - DIRECT

rules:
  - GEOIP,CN,DIRECT
  - MATCH,节点选择
`,
  },
  {
    id: "mihomo",
    name: "Mihomo",
    filename: "new-mihomo.yaml",
    description: "启用 Mihomo 常用 profile、sniffer 和并发连接字段。",
    content: `mixed-port: 7890
allow-lan: true
mode: rule
log-level: info
unified-delay: true
tcp-concurrent: true

profile:
  store-selected: true
  store-fake-ip: true

sniffer:
  enable: true
  sniff:
    HTTP:
      ports:
        - 80
    TLS:
      ports:
        - 443

dns:
  enable: true
  enhanced-mode: fake-ip
  nameserver:
    - 223.5.5.5
  fallback:
    - 1.1.1.1
  fallback-filter:
    geoip: true
    geoip-code: CN

proxies: []

proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - DIRECT

rules:
  - GEOIP,CN,DIRECT
  - MATCH,节点选择
`,
  },
  {
    id: "clash",
    name: "Clash",
    filename: "new-clash.yaml",
    description: "保守 Clash 基础配置，不启用 Mihomo 专有字段。",
    content: `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info

dns:
  enable: true
  nameserver:
    - 223.5.5.5
    - 119.29.29.29

proxies: []

proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - DIRECT

rules:
  - GEOIP,CN,DIRECT
  - MATCH,节点选择
`,
  },
];

export function listYamlTemplates(): YamlTemplate[] {
  return YAML_TEMPLATES.map((template) => ({ ...template }));
}

export function getYamlTemplate(id: YamlTemplateId): YamlTemplate {
  const template = YAML_TEMPLATES.find((item) => item.id === id);
  if (!template) {
    throw new Error(`未知 YAML 模板：${id}`);
  }
  return { ...template };
}

export function createYamlTemplateDocument(id: YamlTemplateId): WorkbenchDocument {
  const template = getYamlTemplate(id);
  return {
    name: template.filename,
    content: template.content,
    dirty: true,
  };
}

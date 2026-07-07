import type { Finding, RuleItem } from "../../types/domain";
import { isRecord } from "../clash/clashService";

const CHINA_DNS_PATTERNS = [/223\.5\.5\.5/, /223\.6\.6\.6/, /119\.29\.29\.29/, /114\.114\.114\.114/];
const GLOBAL_DNS_PATTERNS = [/1\.1\.1\.1/, /8\.8\.8\.8/, /9\.9\.9\.9/, /dns\.google/i, /cloudflare/i];
const LEAK_TEST_PATTERNS = [/ipleak/i, /browserleaks/i, /dnsleaktest/i, /webrtc/i];
const LEAK_TEST_POLICY_DOMAINS = ["+.ipleak.net", "+.browserleaks.com", "+.dnsleaktest.com", "+.ipinfo.io", "+.ifconfig.me"];

export function auditDnsConfig(dns: unknown, rules: RuleItem[], config?: Record<string, unknown>): Finding[] {
  const findings: Finding[] = [];

  if (config?.ipv6 === true) {
    findings.push({
      id: "top-level-ipv6-enabled",
      severity: "warning",
      title: "IPv6 可能绕过代理",
      message: "顶层 ipv6 已启用，部分环境可能出现 IPv6 直连或 DNS 结果不受预期策略控制。",
      path: "/ipv6",
      suggestion: "无明确 IPv6 分流需求时设置 ipv6: false，并确认 dns.ipv6 也关闭。",
    });
  }

  if (!isRecord(dns)) {
    findings.push({
      id: "dns-missing",
      severity: "warning",
      title: "DNS 未配置",
      message: "未发现 dns 配置，OpenClash 环境下可能无法控制 fake-ip、fallback 和 DNS 分流。",
      path: "/dns",
      suggestion: "添加 dns.enable、enhanced-mode、nameserver、fallback 和 fallback-filter。",
    });
    return findings;
  }

  const enabled = dns.enable === true || dns.enabled === true;
  if (!enabled) {
    findings.push({
      id: "dns-disabled",
      severity: "warning",
      title: "DNS 未启用",
      message: "dns.enable 未开启，fake-ip 和 fallback-filter 不会生效。",
      path: "/dns/enable",
      suggestion: "确认运行模式后开启 dns.enable。",
    });
  }

  if (dns["enhanced-mode"] !== "fake-ip") {
    findings.push({
      id: "fake-ip-not-enabled",
      severity: "info",
      title: "fake-ip 未启用",
      message: "当前 enhanced-mode 不是 fake-ip，部分分流和泄露控制策略不可用。",
      path: "/dns/enhanced-mode",
      suggestion: "需要 fake-ip 场景时设置 enhanced-mode: fake-ip，并维护 fake-ip-filter。",
    });
  }

  if (dns.ipv6 === true) {
    findings.push({
      id: "dns-ipv6-enabled",
      severity: "warning",
      title: "DNS IPv6 已启用",
      message: "dns.ipv6 已启用，可能解析 AAAA 记录并触发 IPv6 出口不一致。",
      path: "/dns/ipv6",
      suggestion: "无明确 IPv6 分流需求时设置 dns.ipv6: false。",
    });
  }

  const nameserver = asStringList(dns.nameserver);
  const defaultNameserver = asStringList(dns["default-nameserver"]);
  const directNameserver = asStringList(dns["direct-nameserver"]);
  const fallback = asStringList(dns.fallback);
  const nameserverPolicy = isRecord(dns["nameserver-policy"]) ? dns["nameserver-policy"] : {};

  if (
    nameserver.length > 0 &&
    ![...nameserver, ...defaultNameserver, ...directNameserver].some(matchesAny(CHINA_DNS_PATTERNS))
  ) {
    findings.push({
      id: "nameserver-no-cn",
      severity: "warning",
      title: "nameserver 缺少国内 DNS",
      message: "国内直连域名可能被送往境外 DNS，造成解析结果和分流不稳定。",
      path: "/dns/nameserver",
      suggestion: "至少保留一个可信国内 DNS，例如 223.5.5.5 或 119.29.29.29。",
    });
  }

  if (fallback.length > 0 && !fallback.some(matchesAny(GLOBAL_DNS_PATTERNS))) {
    findings.push({
      id: "fallback-no-global",
      severity: "warning",
      title: "fallback 缺少境外 DNS",
      message: "国外站点可能仍由国内 DNS 解析，影响代理命中和访问稳定性。",
      path: "/dns/fallback",
      suggestion: "按你的网络环境配置可信境外 DNS，并配合 fallback-filter。",
    });
  }

  const policyKeys = Object.keys(nameserverPolicy);
  const missingLeakPolicy = LEAK_TEST_POLICY_DOMAINS.filter((domain) => !policyKeys.includes(domain));
  if (missingLeakPolicy.length > 0) {
    findings.push({
      id: "nameserver-policy-missing-leak-tests",
      severity: "warning",
      title: "泄露测试域名缺少 DNS 策略",
      message: `nameserver-policy 未覆盖 ${missingLeakPolicy.slice(0, 3).join("、")} 等泄露测试域名。`,
      path: "/dns/nameserver-policy",
      suggestion: "将泄露测试域名固定到可信境外 DNS，避免被默认 DNS 策略误解析。",
    });
  }

  const fakeIpFilter = asStringList(dns["fake-ip-filter"]);
  if (!fakeIpFilter.includes("geosite:private") || !fakeIpFilter.some((item) => item.includes(".lan"))) {
    findings.push({
      id: "fake-ip-filter-missing-private",
      severity: "warning",
      title: "fake-ip-filter 私有域名不足",
      message: "fake-ip-filter 缺少 geosite:private 或局域网域名，可能影响本地设备与系统连通性探测。",
      path: "/dns/fake-ip-filter",
      suggestion: "保留 geosite:private、+.lan、+.local 和常见 NTP / 系统探测域名。",
    });
  }

  if (!isRecord(dns["fallback-filter"]) || dns["fallback-filter"].geoip !== true) {
    findings.push({
      id: "fallback-filter-risk",
      severity: "warning",
      title: "fallback-filter 未完整启用",
      message: "fallback-filter.geoip 未开启时，国内外 DNS 结果可能混用。",
      path: "/dns/fallback-filter",
      suggestion: "开启 fallback-filter.geoip，并确认 geoip-code。",
    });
  }

  const leakRules = rules.filter((rule) => LEAK_TEST_PATTERNS.some((pattern) => pattern.test(rule.raw)));
  for (const rule of leakRules) {
    if (rule.target === "DIRECT") {
      findings.push({
        id: `leak-test-direct-${rule.index}`,
        severity: "warning",
        title: "泄露测试站直连风险",
        message: `第 ${rule.index + 1} 条规则将泄露测试相关域名指向 DIRECT。`,
        path: `/rules/${rule.index}`,
        suggestion: "确认这是刻意行为；否则改到代理或专用隐私分组。",
      });
    }
  }

  return findings;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function matchesAny(patterns: RegExp[]) {
  return (value: string) => patterns.some((pattern) => pattern.test(value));
}

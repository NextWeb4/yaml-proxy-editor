import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import {
  checkOpenClashCompatibility,
  diagnoseOpenClashLog,
} from "../src/services/openclash/openclashCompatibility";

function parse(raw: string): unknown {
  return parseDocument(raw).toJS();
}

describe("openclashCompatibility", () => {
  it("发现端口冲突、异常 mode 和公开 controller 风险", () => {
    const findings = checkOpenClashCompatibility(
      parse(`mixed-port: 7890
redir-port: 7890
mode: tunnel
log-level: trace
external-controller: 0.0.0.0:9090
secret: ""
`),
    );

    expect(findings.some((finding) => finding.id === "openclash-port-conflict-7890")).toBe(true);
    expect(findings.some((finding) => finding.id === "openclash-invalid-mode")).toBe(true);
    expect(findings.some((finding) => finding.id === "openclash-public-controller-without-secret")).toBe(true);
  });

  it("发现 provider 格式和 proxy-groups use 引用错误", () => {
    const findings = checkOpenClashCompatibility(
      parse(`proxy-groups:
  - name: 自动选择
    type: url-test
    use:
      - missing-provider
proxy-providers:
  demo:
    type: http
rule-providers:
  reject:
    type: http
    url: https://example.com/reject.yaml
`),
    );

    expect(findings.some((finding) => finding.id.includes("missing-provider"))).toBe(true);
    expect(findings.some((finding) => finding.id === "openclash-proxy-providers-missing-url-demo")).toBe(true);
    expect(findings.some((finding) => finding.id === "openclash-rule-provider-behavior-reject")).toBe(true);
  });

  it("发现 provider URL、interval、path 和 health-check 风险", () => {
    const findings = checkOpenClashCompatibility(
      parse(`proxy-providers:
  bad:
    type: http
    url: ftp://example.com/proxies.yaml
    path: ./providers/shared.yaml
    interval: 0
  duplicate:
    type: http
    url: https://example.com/proxies.yaml
    path: ./providers/shared.yaml
    health-check:
      enable: true
      interval: -1
rule-providers:
  local:
    type: file
    url: https://example.com/rules.yaml
    path: ./rules/local.yaml
    behavior: classical
`),
    );

    expect(findings.some((finding) => finding.id === "openclash-proxy-providers-invalid-url-bad")).toBe(true);
    expect(findings.some((finding) => finding.id === "openclash-proxy-providers-invalid-interval-bad")).toBe(true);
    expect(findings.some((finding) => finding.id.startsWith("openclash-proxy-providers-path-conflict"))).toBe(true);
    expect(findings.some((finding) => finding.id === "openclash-proxy-providers-health-check-missing-url-duplicate")).toBe(true);
    expect(findings.some((finding) => finding.id === "openclash-proxy-providers-health-check-invalid-interval-duplicate")).toBe(true);
    expect(findings.some((finding) => finding.id === "openclash-rule-providers-file-provider-url-local")).toBe(true);
  });

  it("诊断 OpenClash 启动日志", () => {
    const findings = diagnoseOpenClashLog(`
level=error msg="Parse config error: yaml: line 12: did not find expected key"
level=error msg="listen tcp :7890: bind: address already in use"
`);

    expect(findings.some((finding) => finding.id === "openclash-log-yaml-parse")).toBe(true);
    expect(findings.some((finding) => finding.id === "openclash-log-port-bind")).toBe(true);
  });
});

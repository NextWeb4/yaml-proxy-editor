export const sampleConfig = `mixed-port: 7890
allow-lan: true
mode: rule
log-level: info

dns:
  enable: true
  enhanced-mode: fake-ip
  nameserver:
    - 223.5.5.5
    - 119.29.29.29
  fallback:
    - 1.1.1.1
    - 8.8.8.8
  fallback-filter:
    geoip: true
    geoip-code: CN

proxies:
  - name: "HK-01 1x"
    type: ss
    server: hk.example.local
    port: 443
    cipher: aes-128-gcm
    password: example
  - name: "JP-01 1x"
    type: trojan
    server: jp.example.local
    port: 443
    password: example

proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - 自动选择
      - HK-01 1x
      - JP-01 1x
      - DIRECT
  - name: 自动选择
    type: url-test
    proxies:
      - HK-01 1x
      - JP-01 1x
    url: https://www.gstatic.com/generate_204
    interval: 300
  - name: 备用节点
    type: select
    proxies:
      - HK-01 1x

rules:
  - DOMAIN-SUFFIX,cn,DIRECT
  - DOMAIN-SUFFIX,openai.com,节点选择
  - MATCH,节点选择
`;

export const DEFAULT_SPEEDTEST_CONTROLLER_URL = "http://127.0.0.1:9090";
export const DEFAULT_LATENCY_TEST_URL = "https://www.gstatic.com/generate_204";
export const DEFAULT_DOWNLOAD_TEST_URL = "https://speed.cloudflare.com/__down?bytes=5242880";
export const DEFAULT_DOWNLOAD_TEST_BYTES = 5 * 1024 * 1024;

export const SPEEDTEST_DEFAULT_URL_REFERENCES = [
  {
    name: "MetaCubeX Mihomo url-test / health-check examples",
    url: "https://wiki.metacubex.one/en/config/proxy-groups/url-test/",
    adopted: DEFAULT_LATENCY_TEST_URL,
  },
  {
    name: "Cloudflare speedtest download endpoint",
    url: "https://github.com/cloudflare/speedtest",
    adopted: DEFAULT_DOWNLOAD_TEST_URL,
  },
] as const;

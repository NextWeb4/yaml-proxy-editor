import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOWNLOAD_TEST_BYTES,
  DEFAULT_DOWNLOAD_TEST_URL,
  DEFAULT_LATENCY_TEST_URL,
  DEFAULT_SPEEDTEST_CONTROLLER_URL,
  SPEEDTEST_DEFAULT_URL_REFERENCES,
} from "../src/services/speedtest/speedtestDefaults";
import { parseAllowedSpeedtestUrl, parseLocalControllerUrl } from "../src/services/speedtest/speedtestRunner";

describe("speedtest default URLs", () => {
  it("uses common HTTPS probe URLs that pass speedtest URL validation", () => {
    const latencyUrl = parseAllowedSpeedtestUrl(DEFAULT_LATENCY_TEST_URL);
    const downloadUrl = parseAllowedSpeedtestUrl(DEFAULT_DOWNLOAD_TEST_URL);

    expect(parseLocalControllerUrl(DEFAULT_SPEEDTEST_CONTROLLER_URL)).toBe("http://127.0.0.1:9090");
    expect(latencyUrl.protocol).toBe("https:");
    expect(latencyUrl.hostname).toBe("www.gstatic.com");
    expect(latencyUrl.pathname).toBe("/generate_204");
    expect(downloadUrl.protocol).toBe("https:");
    expect(downloadUrl.hostname).toBe("speed.cloudflare.com");
    expect(downloadUrl.pathname).toBe("/__down");
    expect(Number(downloadUrl.searchParams.get("bytes"))).toBe(DEFAULT_DOWNLOAD_TEST_BYTES);
  });

  it("keeps source references beside adopted defaults for review", () => {
    expect(SPEEDTEST_DEFAULT_URL_REFERENCES.map((reference) => reference.adopted)).toEqual([
      DEFAULT_LATENCY_TEST_URL,
      DEFAULT_DOWNLOAD_TEST_URL,
    ]);
  });
});

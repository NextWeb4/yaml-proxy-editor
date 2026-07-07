import { describe, expect, it } from "vitest";
import { parseBatchSubscriptionInput } from "../src/services/subscription/batchSubscription";

describe("batchSubscription", () => {
  it("从多行文本解析名称和订阅 URL，并为重复名称加后缀", () => {
    const result = parseBatchSubscriptionInput(`
# comment
机场A https://a.example/sub?token=secret
机场A, https://b.example/sub
https://c.example/sub
bad line
`);

    expect(result.items).toEqual([
      {
        name: "机场A",
        url: "https://a.example/sub?token=secret",
        redactedUrl: "https://a.example/...?token=<redacted>",
        lineNumber: 3,
      },
      {
        name: "机场A-2",
        url: "https://b.example/sub",
        redactedUrl: "https://b.example/...",
        lineNumber: 4,
      },
      {
        name: "c.example",
        url: "https://c.example/sub",
        redactedUrl: "https://c.example/...",
        lineNumber: 5,
      },
    ]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      severity: "error",
      path: "/batch-subscriptions/6",
    });
  });
});

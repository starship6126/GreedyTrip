import { afterEach, describe, expect, it } from "vitest";
import { safeError } from "@/lib/utils";

const originalMossKey = process.env.MOSS_PROJECT_KEY;

afterEach(() => {
  if (originalMossKey === undefined) delete process.env.MOSS_PROJECT_KEY;
  else process.env.MOSS_PROJECT_KEY = originalMossKey;
});

describe("safeError", () => {
  it("redacts configured credentials before an error reaches an API response", () => {
    process.env.MOSS_PROJECT_KEY = "private-moss-value";

    const result = safeError(
      new Error("Request rejected for private-moss-value"),
      "Request failed",
    );

    expect(result).toBe("Request rejected for [redacted]");
    expect(result).not.toContain("private-moss-value");
  });

  it("redacts common bearer and API-key token shapes", () => {
    const bearerToken = "abcdefghijklmnopqrstuv";
    const legacyProviderToken = `sk-${"exampletoken123456789"}`;
    const result = safeError(
      new Error(
        `Bearer ${bearerToken} api_key=visible-looking-value ${legacyProviderToken}`,
      ),
      "Request failed",
    );

    expect(result).not.toContain(bearerToken);
    expect(result).not.toContain("visible-looking-value");
    expect(result).not.toContain(legacyProviderToken);
  });

  it("uses the fallback for non-errors and collapses multiline details", () => {
    expect(safeError(undefined, "Request failed")).toBe("Request failed");
    expect(safeError(new Error("line one\nline two"), "Request failed")).toBe("line one line two");
  });
});

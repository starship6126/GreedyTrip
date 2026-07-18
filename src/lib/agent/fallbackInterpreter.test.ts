import { describe, expect, it } from "vitest";
import { interpretLocally } from "@/lib/agent/fallbackInterpreter";

describe("fallback interpreter", () => {
  it.each([
    ["yes, let's go", "accept"],
    ["another one", "reject"],
    ["that feels too touristy", "reject"],
    ["too crowded", "reject"],
    ["it is closed", "report_closed"],
    ["show me the map", "show_map"],
    ["show photos", "show_photos"],
  ])("recognizes %s", (utterance, intent) => {
    expect(interpretLocally(utterance).intent).toBe(intent);
  });

  it("creates a strong negative touristy memory", () => {
    const result = interpretLocally("That feels too touristy");
    expect(result.memories[0]).toMatchObject({ polarity: -1, strength: 3, topic: "touristy" });
  });
});

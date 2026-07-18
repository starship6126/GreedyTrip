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

  it("handles core Korean commands on the local fast path", () => {
    expect(interpretLocally("지도 보여줘").intent).toBe("show_map");
    const touristy = interpretLocally("너무 관광객 많은 곳 같아");
    expect(touristy.intent).toBe("reject");
    expect(touristy.memories[0]).toMatchObject({ topic: "touristy", polarity: -1, strength: 3 });
  });

  it("extracts Korean interview chips deterministically", () => {
    expect(interpretLocally("조용하고 차분한 곳", 0).profilePatch).toEqual({ ambience: "quiet" });
    expect(interpretLocally("이십분", 1).profilePatch).toEqual({ maxWalkMinutes: 20 });
    expect(interpretLocally("미술과 숨은 로컬 장소", 2).profilePatch).toEqual({ interests: ["art", "hidden"] });
    expect(interpretLocally("독특한 경험", 3).profilePatch).toEqual({ priority: "uniqueness" });
  });
});

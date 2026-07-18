import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { selectGreedyNextMove } from "@/lib/greedy/decision";
import {
  DEFAULT_MOSS_INDEX_NAME,
  createSerializedCloudExecutor,
  getMossRuntimeMetrics,
  hashUserScope,
  mossIndexName,
  setMossCloudSyncStatus,
} from "@/lib/moss/client";
import {
  MIN_MEMORY_SIMILARITY,
  addMemories,
  buildCanonicalMemoryDocuments,
  canonicalPreferenceId,
  evidenceFromQueryDocuments,
  localMemories,
  mossUserScopeFilter,
  queryMemoryEvidence,
  selectStrongestEvidenceByTopic,
  type ScopedMemoryEvidence,
} from "@/lib/moss/memory";
import type { Candidate, DecisionContext, MemoryItem } from "@/lib/types";

const mossSdk = vi.hoisted(() => {
  const docs = new Map<string, { id: string; text: string; metadata?: Record<string, string> }>();
  const state = {
    addCalls: 0,
    queryCalls: 0,
    pushCalls: 0,
    lastQueryOptions: undefined as unknown,
  };
  const session = {
    name: "greedytrip-demo-memory",
    get docCount() { return docs.size; },
    async addDocs(input: Array<{ id: string; text: string; metadata?: Record<string, string> }>) {
      state.addCalls += 1;
      let added = 0;
      let updated = 0;
      for (const document of input) {
        if (docs.has(document.id)) updated += 1;
        else added += 1;
        docs.set(document.id, document);
      }
      return { added, updated };
    },
    async deleteDocs(ids: string[]) {
      let deleted = 0;
      for (const id of ids) if (docs.delete(id)) deleted += 1;
      return deleted;
    },
    async query(_query: string, options: { filter?: { condition?: { $eq?: string } } }) {
      state.queryCalls += 1;
      state.lastQueryOptions = options;
      const userScope = options.filter?.condition?.$eq;
      return {
        docs: [...docs.values()]
          .filter((document) => !userScope || document.metadata?.userScope === userScope)
          .map((document) => ({ ...document, score: 0.9 })),
      };
    },
    async pushIndex() {
      state.pushCalls += 1;
      return { jobId: `job-${state.pushCalls}`, indexName: "greedytrip-demo-memory", docCount: docs.size, status: "submitted" };
    },
  };
  return { docs, state, session };
});

vi.mock("@moss-dev/moss", () => ({
  MossClient: class MockMossClient {
    async session() { return mossSdk.session; }
    async getJobStatus(jobId: string) {
      return { jobId, status: "completed", progress: 1, createdAt: "now", updatedAt: "now", completedAt: "now" };
    }
  },
}));

const originalEnvironment = {
  MOSS_INDEX_NAME: process.env.MOSS_INDEX_NAME,
  MOSS_PROJECT_ID: process.env.MOSS_PROJECT_ID,
  MOSS_PROJECT_KEY: process.env.MOSS_PROJECT_KEY,
};

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function memory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: `incoming-${Math.random()}`,
    text: "The user prefers quiet, calm places.",
    polarity: 1,
    strength: 2,
    topic: "ambience",
    kind: "interview",
    createdAt: "2026-07-18T18:20:00.000Z",
    ...overrides,
  };
}

describe("fixed Moss session architecture", () => {
  it("uses one fixed index name regardless of user or reset identity", () => {
    delete process.env.MOSS_INDEX_NAME;
    expect(mossIndexName()).toBe(DEFAULT_MOSS_INDEX_NAME);
    expect(canonicalPreferenceId(hashUserScope("first-user"), memory())).not.toBe(
      canonicalPreferenceId(hashUserScope("reset-user"), memory()),
    );
    expect(mossIndexName()).toBe(DEFAULT_MOSS_INDEX_NAME);
  });

  it("hashes user scope deterministically without exposing the identifier", () => {
    const scope = hashUserScope("Traveler@Example.com");
    expect(scope).toMatch(/^[a-f0-9]{12}$/);
    expect(scope).toBe(hashUserScope("traveler@example.com"));
    expect(scope).not.toContain("traveler");
  });

  it("serializes cloud tasks so pushes cannot overlap", async () => {
    const executor = createSerializedCloudExecutor();
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const task = (name: string) => executor.enqueue(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`start-${name}`);
      await new Promise((resolve) => setTimeout(resolve, 4));
      order.push(`end-${name}`);
      active -= 1;
    });
    await Promise.all([task("a"), task("b"), task("c")]);
    expect(maxActive).toBe(1);
    expect(order).toEqual(["start-a", "end-a", "start-b", "end-b", "start-c", "end-c"]);
  });

  it("does not label a submitted cloud job completed", () => {
    setMossCloudSyncStatus("submitted", "Completion pending", "job-1");
    expect(getMossRuntimeMetrics().cloudSync).toMatchObject({
      status: "submitted",
      jobId: "job-1",
    });
  });
});

describe("canonical scoped Moss memories", () => {
  it("serializes every metadata value as a string", () => {
    const [document] = buildCanonicalMemoryDocuments(
      "traveler@example.com",
      [memory({ topic: "touristy", polarity: -1, strength: 3, kind: "rejection" })],
      "trip-001",
    );
    expect(document.id).toMatch(/^pref:[a-f0-9]{12}:touristy$/);
    expect(document.metadata).toBeDefined();
    expect(Object.values(document.metadata ?? {}).every((value) => typeof value === "string")).toBe(true);
    expect(document.metadata?.userScope).toBe(hashUserScope("traveler@example.com"));
    expect(document.metadata?.tripId).not.toBe("trip-001");
  });

  it("uses stable topic IDs and deduplicates same-topic documents before upsert", () => {
    const documents = buildCanonicalMemoryDocuments("stable-user", [
      memory({ id: "one", text: "Quiet is good." }),
      memory({ id: "two", text: "Now I prefer lively places." }),
    ]);
    expect(documents).toHaveLength(1);
    expect(documents[0].id).toBe(`pref:${hashUserScope("stable-user")}:ambience`);
    expect(documents[0].text).toBe("Now I prefer lively places.");
  });

  it("creates a hashed userScope equality filter", () => {
    const first = mossUserScopeFilter("first-user");
    const second = mossUserScopeFilter("second-user");
    expect(first).toEqual({ field: "userScope", condition: { $eq: hashUserScope("first-user") } });
    expect(first.condition.$eq).not.toBe(second.condition.$eq);
  });

  it("upserts fallback memory by canonical topic instead of appending duplicates", async () => {
    delete process.env.MOSS_PROJECT_ID;
    delete process.env.MOSS_PROJECT_KEY;
    const user = `canonical-${crypto.randomUUID()}`;
    await addMemories(user, [memory({ id: "first", text: "I prefer quiet places." })]);
    await addMemories(user, [memory({ id: "second", text: "I now prefer lively places." })]);
    expect(localMemories(user)).toHaveLength(1);
    expect(localMemories(user)[0].text).toBe("I now prefer lively places.");
  });

  it("reranks from local addDocs and query without waiting for pushIndex", async () => {
    vi.useFakeTimers();
    process.env.MOSS_PROJECT_ID = "project";
    process.env.MOSS_PROJECT_KEY = "key";
    const user = `live-local-${crypto.randomUUID()}`;
    const beforeAdds = mossSdk.state.addCalls;
    const beforeQueries = mossSdk.state.queryCalls;
    const beforePushes = mossSdk.state.pushCalls;

    const updated = await addMemories(user, [memory({
      topic: "touristy",
      text: "That feels too touristy.",
      polarity: -1,
      strength: 3,
      kind: "rejection",
    })], true);
    const retrieved = await queryMemoryEvidence(
      user,
      "Major downtown landmark with exceptionally high review volume and strong visitor recognition.",
    );

    expect(updated.mode).toBe("Live");
    expect(mossSdk.state.addCalls - beforeAdds).toBe(1);
    expect(mossSdk.state.queryCalls - beforeQueries).toBe(1);
    expect(mossSdk.state.pushCalls - beforePushes).toBe(0);
    expect(retrieved.evidence[0]).toMatchObject({ polarity: -1, strength: 3 });
    expect(mossSdk.state.lastQueryOptions).toMatchObject({
      topK: 6,
      alpha: 0.9,
      filter: mossUserScopeFilter(user),
    });
  });
});

describe("bounded retrieval evidence", () => {
  const evidence = (overrides: Partial<ScopedMemoryEvidence> = {}): ScopedMemoryEvidence => ({
    memoryId: "one",
    text: "Preference evidence",
    topic: "ambience",
    similarity: 0.8,
    polarity: 1,
    strength: 2,
    contribution: 1.5,
    ...overrides,
  });

  it("ignores results below the configurable minimum similarity", () => {
    const selected = selectStrongestEvidenceByTopic([
      evidence({ memoryId: "weak", similarity: MIN_MEMORY_SIMILARITY - 0.01 }),
      evidence({ memoryId: "strong", similarity: MIN_MEMORY_SIMILARITY + 0.01 }),
    ], MIN_MEMORY_SIMILARITY);
    expect(selected.map((item) => item.memoryId)).toEqual(["strong"]);
  });

  it("keeps only the strongest evidence per topic", () => {
    const selected = selectStrongestEvidenceByTopic([
      evidence({ memoryId: "weak", contribution: 0.4 }),
      evidence({ memoryId: "strong", contribution: 1.2 }),
      evidence({ memoryId: "other", topic: "budget", contribution: -0.7, polarity: -1 }),
    ], 0);
    expect(selected).toHaveLength(2);
    expect(selected.find((item) => item.topic === "ambience")?.memoryId).toBe("strong");
  });

  it("caps each topic contribution instead of treating similarity as a probability", () => {
    const selected = evidenceFromQueryDocuments([{
      id: "strong-negative",
      text: "The user dislikes crowded places.",
      metadata: { topic: "crowding", polarity: "-1", strength: "3" },
      score: 1,
    }], "A crowded and noisy venue", 0);
    expect(selected[0].similarity).toBe(1);
    expect(selected[0].contribution).toBe(-1.5);
  });

  it("applies tourist feedback to related popularity language without keyword filtering", async () => {
    delete process.env.MOSS_PROJECT_ID;
    delete process.env.MOSS_PROJECT_KEY;
    const user = `touristy-${crypto.randomUUID()}`;
    await addMemories(user, [memory({
      topic: "touristy",
      text: "That feels too touristy.",
      polarity: -1,
      strength: 3,
      kind: "rejection",
    })]);
    const popular = await queryMemoryEvidence(
      user,
      "Major downtown landmark with exceptionally high review volume, strong visitor recognition, and limited independent-local signals.",
    );
    const independent = await queryMemoryEvidence(
      user,
      "Small independent local art space with 86 reviews and a hidden-gem signal.",
    );
    expect(popular.evidence.some((item) => item.polarity === -1)).toBe(true);
    expect(independent.evidence).toHaveLength(0);
  });

  it("uses Moss similarity as bounded evidence while deterministic utility still chooses argmax", () => {
    const context: DecisionContext = {
      location: { lat: 37.7841, lng: -122.4075, label: "Powell Street" },
      timestamp: "2026-07-18T15:00:00-07:00",
      profile: { ambience: "balanced", maxWalkMinutes: 10, interests: [], priority: "balanced", interviewComplete: true },
      memoryVersion: 1,
      currentCandidateAccepted: false,
      excludedCandidateIds: [],
      unavailableCandidateIds: [],
      visitedCandidateIds: [],
      recentCategoryHistory: [],
      trigger: "START",
    };
    const semanticFavorite: Candidate = {
      id: "semantic-favorite",
      name: "Distant Generic Room",
      category: "Public place",
      sourceKeyword: "public place",
      lat: 37.7905,
      lng: -122.4075,
      rating: 3.8,
      reviewCount: 800,
      photoUrls: [],
      isOpenNow: null,
      tags: [],
      fetchedAt: context.timestamp,
      dataSource: "fixture",
    };
    const utilityWinner: Candidate = {
      ...semanticFavorite,
      id: "utility-winner",
      name: "Nearby Independent Find",
      lat: 37.7842,
      rating: 5,
      reviewCount: 40,
      isOpenNow: true,
      tags: ["hidden", "independent", "local"],
    };
    const highSimilarity = evidenceFromQueryDocuments([{
      id: "semantic-memory",
      text: "Strong semantic match",
      metadata: { topic: "interest:general", polarity: "1", strength: "3" },
      score: 1,
    }], "Strong semantic match", 0);
    const result = selectGreedyNextMove([
      { candidate: semanticFavorite, evidence: highSimilarity },
      { candidate: utilityWinner, evidence: [] },
    ], context);

    expect(highSimilarity[0].similarity).toBe(1);
    expect(result.ranked[0].candidateId).toBe("utility-winner");
    expect(result.decision.selectedCandidateId).toBe("utility-winner");
  });
});

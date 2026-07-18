# GreedyTrip engineering guide

GreedyTrip is **Greedy Search × Trip**, an anti-itinerary voice agent. It learns a traveler’s preferences, builds a feasible nearby frontier, and confidently recommends exactly one highest-value next move under the current state. Never generate or imply a full-day itinerary, present a menu of equivalent options, or claim a globally optimal day.

## Product and decision invariants

- The normal UI displays one active recommendation and zero planned-ahead stops. Ranked alternatives are Judge/Presentation mode only.
- The final choice is `argmax` over deterministic candidate utility. OpenAI, Moss, and Bright Data never select the winner.
- Bright Data builds the frontier. Moss retrieves preference evidence. GreedyTrip applies the heuristic and chooses the next node.
- Every meaningful event reranks. Speech is separate: interrupt only when required or when net gain reaches the exported 8-point threshold.
- Switching friction is 5 after acceptance, 1 before acceptance, and 0 for rejection, manual alternatives, or current-place unavailability.
- Below threshold, retain the current move, skip text-to-speech, and create a Decision Snapshot with an explicit silence reason.
- Every recommendation contains deterministic WHY THIS, WHY NOW, and WHAT CHANGED explanations.
- Use one fixed Moss index, `greedytrip-demo-memory`, and a module/global singleton `MossClient` and `SessionIndex` for the long-running Node demo. Reset rotates hashed `userScope`/`tripId`, not the index name.
- Moss metadata values are strings. Canonical stable topic IDs use `addDocs(..., { upsert: true })`; unexplained rejection and closure events do not create durable preference documents.
- Await local `addDocs`, immediately retrieve and rerank, then schedule a debounced serialized `pushIndex` checkpoint. Never wait for cloud sync or label a submitted job completed.
- Expose Local Index, Retrieval, and Cloud Sync separately. Retrieval uses user-scope filtering, a minimum similarity threshold, strongest evidence per topic, bounded contributions, and approximately `topK: 6` / `alpha: 0.9`.

## Fixed implementation rules

- Next.js App Router, strict TypeScript, React, Tailwind CSS, Vitest, Zod, OpenAI, `@moss-dev/moss`, lucide-react, and browser-native speech, geolocation, and Wake Lock APIs.
- No database, authentication, general-purpose agent framework, booking system, maintained scraping code, route optimizer, or multi-stop planner.
- Bright Data is the source for live Google Maps public-place data. Fixture and cache modes must be clearly labeled.
- Moss is a server-only, in-process semantic runtime that indexes and retrieves soft, evolving preferences locally. Optional cloud checkpoints are persistence only; hard constraints remain structured state.
- OpenAI may interpret language, but it must never rank candidates or generate numeric scores.
- Scoring must be deterministic, pure, inspectable, clamped, and return every score component.
- Never fabricate opening hours, prices, wait times, crowd levels, or safety claims. Derived labels must be described as heuristics; unknown inputs remain neutral.
- Missing credentials must activate honest fallbacks and must never crash the app or expose secrets.
- Moss routes use the Node runtime. The local singleton is not inherently coordinated across multiple serverless instances; the primary demo target is one long-running Node process.
- Before completion, run lint, strict typecheck, Vitest, and the production build. Keep greedy scoring and refresh-policy coverage credential-free.

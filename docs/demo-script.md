# GreedyTrip three-minute demo

## Before going on stage

1. On the Windows demo machine, run `start-demo.cmd prepare`, then `start-demo.cmd`.
2. Open the app and Presentation/Judge mode.
3. Press **Reset Demo** so the stage indicator is at **1. Interview**.
4. Confirm the integration badges honestly say Live, Cached, Fixture, or Fallback, and Moss shows separate Local Index, Retrieval, and Cloud Sync states.
5. Keep voice enabled, but use the visible controls immediately if the room or microphone is unreliable.

Presentation controls are reliability fallbacks. Events created by them are visibly labeled **Simulated demo event** and still use the real decision pipeline.

## Timed walkthrough

### 0:00–0:20 — Hook and name reveal

Say:

> Most travel apps solve a route-planning problem. GreedyTrip solves a next-decision problem.
>
> GreedyTrip means Greedy Search plus Trip: observe the current state, choose one move, learn, and recompute.

Show:

- `// GREEDY SEARCH × TRIP`
- `next = argmax utility(place | now, memory)`
- Frontier **0**, Selected **0**, Planned ahead **0**

Clarify:

> We are not pretending to optimize the entire day. That would become stale as soon as the user moves, rejects something, or finds a place closed.

### 0:20–0:50 — Interview and frontier expansion

Tap **Start Trip** or the Presentation Mode **Start Interview** control. Answer with the visible chips:

1. **Quiet & calm**
2. **10 minutes**
3. **Art + hidden gems**
4. **Uniqueness**

While the interview runs, point to OBSERVE and REMEMBER in the Greedy Loop and say:

> Bright Data is building the available frontier while Moss indexes the traveler’s evolving preferences locally.

If credentials are absent, explicitly say that the badge shows the deterministic fixture rather than implying a live sponsor request.

### 0:50–1:15 — First greedy commit

Show the single active recommendation and the COMMIT step. The deterministic fixture chooses the nearby, credible, relatively popular art candidate. A current Bright Data cache can produce a different real winner; always describe the candidate and evidence actually visible on screen.

Say:

> GreedyTrip does not show ten search results. It commits to one current winner.

Point out:

- **Committed to the current highest-value move**
- Frontier candidate count
- Selected **1 next move**
- Planned ahead **0 stops**
- WHY THIS, WHY NOW, and WHAT CHANGED

Do not expose a future sequence. If useful, briefly open Judge view to show that ranked alternatives exist only there.

### 1:15–1:55 — Teach the heuristic

Say or type:

> That feels too touristy.

Or press Presentation Mode **Submit “That feels too touristy”**.

Show the LEARN and RECOMPUTE steps, then Decision Shift:

- the real ranking snapshot before feedback;
- the strong negative tourist-oriented memory;
- the canonical topic document added or updated in the fixed `greedytrip-demo-memory` session;
- Moss Local Index and Retrieval states, real `addDocs` duration and query latency;
- retrieved memory text, similarity, polarity, strength, and resulting Memory Fit delta;
- the real ranking after feedback;
- candidate score and rank deltas;
- the largest semantic penalty, which proves that the touristy Moss memory affected a popularity-risk candidate even when the rejected live winner itself was not popularity-tagged;
- the quieter independent art winner.

Say:

> This was not only a different-result button. The rejected move became infeasible, the sentence was also stored as preference memory, and every remaining candidate was re-evaluated. The panel shows the largest semantic penalty separately.

Then:

> Bright Data builds the frontier. Moss retrieves preference evidence. GreedyTrip applies the heuristic and chooses the next node.

Do not say Moss selected the destination. The deterministic utility engine selected the new maximum. Immediate reranking follows the completed local `addDocs` update and does not wait for cloud sync. A cloud job marked submitted must not be described as completed.

### 1:55–2:20 — Intelligent silence

Use the first movement control that changes location by more than 300 meters for this flow, normally **Move to Yerba Buena**. The UI labels it **Simulated demo event**.

The scores must recompute, but the current move should remain best or the challenger’s net gain should remain below 8. The app must not speak.

Show:

> Context changed. The current move is still best. No interruption needed.

If a challenger is slightly ahead, the valid alternate message is:

> A new option ranked slightly higher, but not enough to interrupt your current move.

Say:

> GreedyTrip recalculated, but it stayed silent. The agent does not speak whenever rankings change. Silence is also a decision.

### 2:20–2:40 — Meaningful intervention

Press **Mark Current Place Unavailable**. This is a clearly labeled simulated availability event and makes replacement mandatory.

Show in Judge view:

- raw gain;
- switching friction (**0** because unavailable bypasses commitment);
- net gain;
- the **8-point** threshold;
- **Decision: Interrupt** and the actual reason.

Let the agent speak the new recommendation. Say:

> It interrupted only when the current move became invalid and a replacement was necessary. After acceptance, ordinary alternatives pay five points of switching friction; below an eight-point net gain, the agent stays silent.

Point to WHY THIS, WHY NOW, and WHAT CHANGED. Never hardcode or announce a numeric improvement that differs from the real panel value.

### 2:40–2:52 — Map and photos

Say or type:

> Show me the map and photos.

Or press **Open Map & Photos**. The drawer opens only on request. If source photos or an embed key are unavailable, show the honest placeholder, coordinate preview, and Google Maps deep link.

### 2:52–3:00 — Close

Say:

> Bright Data builds the frontier. Moss retrieves preference evidence. GreedyTrip applies the heuristic and chooses one next move.
>
> No itinerary. One decision. Continuously re-optimized.

Alternative final line:

> Search less. Move better.

## Presentation Mode control map

| Control | Stage | Expected result |
|---|---|---|
| Reset Demo | 1. Interview | Clears demo state |
| Start Interview | 1. Interview | Begins interview and candidate collection |
| Submit “That feels too touristy” | 3. Learn | Stores feedback and creates Decision Shift |
| Move to Powell Street | Context control | Simulated location update |
| Move to Yerba Buena | 4. Silent Recompute | Reranks without speech in the signature flow |
| Move to Union Square | Context control | Second available simulated location |
| Mark Current Place Unavailable | 5. Intervention | Bypasses switching friction and speaks replacement |
| Open Map & Photos | 6. Visual Detail | Opens requested visual drawer |
| Replay Latest Agent Line | Current stage | Replays only the latest existing agent line |

## Likely judge questions

### Why is this “greedy” instead of a normal recommender?

It formalizes each moment as a feasible frontier and selects `argmax Utility(c | S_t)`, commits to only that action, then recomputes when `S_t` changes. It does not return a results menu or optimize a multi-stop day.

### Does “greedy” mean globally optimal?

No. It means the best current move under known context. Preferences, location, time, and availability change, so GreedyTrip intentionally makes adaptive one-step decisions rather than claiming a globally optimal day.

### Why Moss instead of JSON preferences?

Structured JSON is correct for hard constraints such as a ten-minute walk. Moss indexes nuanced and evolving preferences locally during the conversation—“too touristy,” “small contemporary art,” or “more local”—and retrieves relevant evidence independently for each candidate. GreedyTrip’s deterministic engine still decides the winner.

### Is Moss a remote preference database?

No. `addDocs` and candidate queries run locally in one server-side `SessionIndex`. The fixed cloud index is `greedytrip-demo-memory`; hashed `userScope` metadata isolates users. `pushIndex` is only a serialized background checkpoint, and ranking never waits for it.

### What Moss evidence reaches utility?

Queries use approximately `topK: 6`, `alpha: 0.9`, the current `userScope` filter, and a minimum similarity threshold. Only the strongest bounded result per topic contributes. Similarity is evidence rather than probability or a final score.

### Why Bright Data instead of a Places API?

Bright Data’s hosted Google Maps dataset expands the nearby public-place frontier without maintained scraping infrastructure. The app demonstrates the asynchronous trigger, progress, snapshot, normalization, and neighborhood cache flow. It does not ask Bright Data to rank places.

### Why not search after every tiny change?

Movement and feedback usually require cheap immediate reranking, not fresh collection. Event-driven frontier refresh reduces latency and sponsor load. The separate intervention gate prevents unwanted voice interruptions.

### What prevents constant rerouting?

The engine subtracts five points of switching friction after acceptance, one point before acceptance, and zero after rejection/manual change or unavailability. A normal challenger must then clear an eight-point net-improvement threshold.

### How is touristiness or crowd risk measured?

It is never claimed as a live fact. Review volume and derived highly-visited tags are labeled heuristics. A negative touristy memory changes how deterministic utility treats relevant evidence.

### What is real versus simulated?

Filtering, utility, memory evidence, snapshots, score deltas, intervention logic, speech gates, and API orchestration are real. The three movement buttons and the unavailability control are labeled simulated demo events. Candidate badges state Live, Cached, Fixture, or Fallback.

### Does this Moss session work across serverless instances?

Not by itself. The primary demo is one long-running local Node process with a singleton local session. An in-memory `SessionIndex` is not inherently coordinated across multiple serverless instances; production scaling would require an explicit coordination strategy.

### Is background voice fully supported?

No. The MVP uses page-active browser speech APIs and best-effort Wake Lock. Production would require a native or explicitly permissioned background voice architecture.

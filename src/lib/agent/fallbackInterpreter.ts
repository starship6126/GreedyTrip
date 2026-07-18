import type { TurnInterpretation } from "@/lib/types";

const base = (overrides: Partial<TurnInterpretation>): TurnInterpretation => ({
  intent: "other",
  profilePatch: {},
  memories: [],
  conciseAcknowledgement: "I heard you.",
  ...overrides,
});

export function interpretLocally(utterance: string, interviewStep?: number): TurnInterpretation {
  const value = utterance.trim().toLowerCase();

  if (/\b(show|open).*(map|photos?|pictures?)|\b(map|photos?|pictures?)\b|지도|사진|포토/.test(value)) {
    return base({ intent: /photo|picture|사진|포토/.test(value) && !/map|지도/.test(value) ? "show_photos" : "show_map", conciseAcknowledgement: "Opening the map and photos." });
  }
  if (/\b(yes|yep|sure|accept|let'?s go|sounds good|works for me)\b|^(네|예|응|좋아|가자|좋습니다)[.! ]*$/.test(value)) {
    return base({ intent: "accept", conciseAcknowledgement: "Great. I’ll keep adapting as you move." });
  }
  if ((/\b(no|nope|another|different|reject|not this)\b|다른|별로|싫어|아니/.test(value)) && !/tourist|crowd|noisy|far|expensive|관광|붐비|시끄|멀|비싸/.test(value)) {
    return base({ intent: "reject", conciseAcknowledgement: "Got it. I’ll try a different next move." });
  }
  if (/\b(closed|shut|not open)\b|닫았|닫혀|영업\s*안/.test(value)) {
    return base({ intent: "report_closed", conciseAcknowledgement: "Thanks. I’ll remove it and recalculate." });
  }
  if (/\b(why|explain)\b|왜|설명/.test(value)) return base({ intent: "explain", conciseAcknowledgement: "Here’s what drove the choice." });
  if (/\b(repeat|say that again)\b|다시\s*말|반복/.test(value)) return base({ intent: "repeat", conciseAcknowledgement: "I’ll repeat it." });
  if (/\b(pause|stop listening)\b|일시\s*정지|듣기\s*중지/.test(value)) return base({ intent: "pause", conciseAcknowledgement: "Paused." });
  if (/\b(resume|continue|start listening)\b|계속|재개/.test(value)) return base({ intent: "resume", conciseAcknowledgement: "I’m listening again." });
  if (/tourist|관광객|관광지|너무\s*유명/.test(value)) {
    return base({
      intent: "reject",
      memories: [{ text: "The user strongly dislikes tourist-oriented attractions and prefers less obvious local discoveries.", polarity: -1, strength: 3, topic: "touristy", kind: "rejection" }],
      conciseAcknowledgement: "Got it. I’ll avoid tourist-oriented places.",
      feedbackReason: "Too touristy",
    });
  }
  if (/crowd|noisy|packed|붐비|시끄러|사람\s*많/.test(value)) {
    return base({
      intent: "reject",
      memories: [{ text: "The user strongly dislikes crowded and noisy venues.", polarity: -1, strength: 3, topic: "crowding", kind: "rejection" }],
      conciseAcknowledgement: "Understood. I’ll favor calmer options.",
      feedbackReason: "Too crowded",
    });
  }
  if (/too far|walk.*too|far away|너무\s*멀|걷기.*힘/.test(value)) {
    return base({
      intent: "reject",
      memories: [{ text: "The user dislikes long walks for the next stop.", polarity: -1, strength: 3, topic: "walking", kind: "rejection" }],
      profilePatch: { maxWalkMinutes: 5 },
      conciseAcknowledgement: "Understood. I’ll keep the next walk shorter.",
      feedbackReason: "Too far",
    });
  }

  if (interviewStep === 0) {
    const ambience = /quiet|calm|peace|조용|차분|평화/.test(value) ? "quiet" : /lively|social|energy|busy|활기|사교/.test(value) ? "lively" : "balanced";
    const memoryText = ambience === "quiet" ? "The user prefers quiet, calm places." : ambience === "lively" ? "The user prefers lively, social places." : "The user likes a balance of calm and lively places.";
    return base({
      intent: "interview_answer",
      profilePatch: { ambience },
      memories: [{ text: memoryText, polarity: 1, strength: 2, topic: "ambience", kind: "interview" }],
      conciseAcknowledgement: ambience === "quiet" ? "Quiet and calm. Got it." : ambience === "lively" ? "Lively and social. Got it." : "A balanced atmosphere. Got it.",
    });
  }
  if (interviewStep === 1) {
    const maxWalkMinutes = /twenty|20|이십분/.test(value) ? 20 : /five|5|오분/.test(value) ? 5 : 10;
    return base({
      intent: "interview_answer",
      profilePatch: { maxWalkMinutes },
      memories: [{ text: `The user prefers to walk no more than ${maxWalkMinutes} minutes.`, polarity: -1, strength: 2, topic: "walking", kind: "interview" }],
      conciseAcknowledgement: `${maxWalkMinutes} minutes is your walking limit.`,
    });
  }
  if (interviewStep === 2) {
    const interests = [
      /art|gallery|design|미술|예술|갤러리|디자인/.test(value) ? "art" : null,
      /food|restaurant|eat|음식|맛집|식당/.test(value) ? "food" : null,
      /tech|technology|science|기술|과학/.test(value) ? "tech" : null,
      /hidden|local|gem|unusual|숨은|로컬|현지/.test(value) ? "hidden" : null,
    ].filter((item): item is "art" | "food" | "tech" | "hidden" => item !== null).slice(0, 2);
    const selected: Array<"art" | "food" | "tech" | "hidden"> = interests.length ? interests : ["hidden"];
    return base({
      intent: "interview_answer",
      profilePatch: { interests: selected },
      memories: selected.map((interest) => ({
        text: interest === "hidden" ? "The user enjoys hidden gems and independent local places." : interest === "art" ? "The user enjoys art and art-focused places." : `The user enjoys ${interest} and ${interest}-focused places.`,
        polarity: 1 as const,
        strength: 2 as const,
        topic: "interest" as const,
        kind: "interview" as const,
      })),
      conciseAcknowledgement: `I’ll focus on ${selected.join(" and ")}.`,
    });
  }
  if (interviewStep === 3) {
    const priority = /cost|budget|cheap|low|가격|예산|저렴/.test(value) ? "budget" : /comfort|dark|편안|안전/.test(value) ? "comfort" : /unique|unusual|different|독특|특별/.test(value) ? "uniqueness" : "balanced";
    const text = priority === "budget" ? "The user prioritizes low-cost stops." : priority === "comfort" ? "The user prioritizes comfort after dark." : priority === "uniqueness" ? "The user values unusual experiences over famous landmarks." : "The user wants a balanced next move.";
    return base({
      intent: "interview_answer",
      profilePatch: { priority },
      memories: [{ text, polarity: 1, strength: 2, topic: priority === "budget" ? "budget" : priority === "comfort" ? "comfort" : "interest", kind: "interview" }],
      conciseAcknowledgement: "Got it. One strong next move at a time.",
    });
  }

  return base({ conciseAcknowledgement: "Tell me whether to go, try another, or open the map." });
}

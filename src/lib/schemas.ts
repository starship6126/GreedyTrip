import { z } from "zod";

export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().min(1).max(120),
});

export const userProfileSchema = z.object({
  ambience: z.enum(["quiet", "lively", "balanced"]),
  maxWalkMinutes: z.union([z.literal(5), z.literal(10), z.literal(20)]),
  interests: z.array(z.enum(["art", "food", "tech", "hidden"])).max(4),
  priority: z.enum(["budget", "uniqueness", "comfort", "balanced"]),
  interviewComplete: z.boolean(),
});

export const candidateSchema = z.object({
  id: z.string().min(1),
  placeId: z.string().optional(),
  name: z.string().min(1),
  category: z.string().min(1),
  sourceKeyword: z.string().min(1),
  address: z.string().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().nonnegative().optional(),
  priceLevel: z.number().min(0).max(4).optional(),
  website: z.string().url().optional(),
  googleMapsUrl: z.string().url().optional(),
  photoUrls: z.array(z.string().url()),
  rawOpeningHours: z.unknown().optional(),
  isOpenNow: z.boolean().nullable(),
  closesAt: z.string().optional(),
  tags: z.array(z.string()),
  fetchedAt: z.string(),
  dataSource: z.enum(["brightdata-live", "brightdata-cache", "fixture"]),
});

export const memoryTopicSchema = z.enum([
  "ambience",
  "walking",
  "interest",
  "budget",
  "touristy",
  "crowding",
  "availability",
  "comfort",
  "other",
]);

export const memoryDraftSchema = z.object({
  text: z.string().min(3).max(240),
  polarity: z.union([z.literal(-1), z.literal(1)]),
  strength: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  topic: memoryTopicSchema,
  kind: z.enum(["interview", "acceptance", "rejection"]),
});

export const memoryItemSchema = memoryDraftSchema.extend({
  id: z.string().min(1),
  createdAt: z.string(),
});

export const refreshTriggerSchema = z.enum([
  "START",
  "MOVED_300M",
  "REJECTED",
  "CURRENT_UNAVAILABLE",
  "MEAL_WINDOW",
  "CLOSING_WINDOW",
  "POOL_LOW",
  "PREFERENCE_UPDATED",
  "MANUAL",
]);

export const turnInterpretationSchema = z.object({
  intent: z.enum([
    "interview_answer",
    "accept",
    "reject",
    "show_map",
    "show_photos",
    "explain",
    "repeat",
    "report_closed",
    "report_bad",
    "pause",
    "resume",
    "other",
  ]),
  profilePatch: z.object({
    ambience: z.enum(["quiet", "lively", "balanced"]).optional(),
    maxWalkMinutes: z.union([z.literal(5), z.literal(10), z.literal(20)]).optional(),
    interests: z.array(z.enum(["art", "food", "tech", "hidden"])).max(4).optional(),
    priority: z.enum(["budget", "uniqueness", "comfort", "balanced"]).optional(),
  }),
  memories: z.array(memoryDraftSchema).max(4),
  conciseAcknowledgement: z.string().min(1).max(180),
  feedbackReason: z.string().max(240).optional(),
});

export const candidatesRequestSchema = z.object({
  location: geoPointSchema,
  trigger: refreshTriggerSchema,
  forceRefresh: z.boolean().optional().default(false),
});

export const agentTurnRequestSchema = z.object({
  userId: z.string().min(3).max(100),
  tripId: z.string().min(3).max(100).default("trip-legacy"),
  tripPhase: z.enum(["idle", "interviewing", "ready", "navigating", "paused"]),
  utterance: z.string().trim().min(1).max(500),
  interviewStep: z.number().int().min(0).max(3).optional(),
  currentCandidate: candidateSchema.optional(),
});

export const recommendRequestSchema = z.object({
  userId: z.string().min(3).max(100),
  tripId: z.string().min(3).max(100).default("trip-legacy"),
  profile: userProfileSchema,
  candidates: z.array(candidateSchema).min(1).max(50),
  location: geoPointSchema,
  previousLocation: geoPointSchema.optional(),
  currentTime: z.string(),
  excludedCandidateIds: z.array(z.string()).max(100),
  unavailableCandidateIds: z.array(z.string()).max(100).default([]),
  currentCandidateId: z.string().optional(),
  currentCandidateAccepted: z.boolean().default(false),
  visitedCandidateIds: z.array(z.string()).max(100).default([]),
  recentCategoryHistory: z.array(z.string()).max(12).default([]),
  remainingTravelMinutes: z.number().positive().optional(),
  memoryVersion: z.number().int().nonnegative().default(0),
  trigger: refreshTriggerSchema,
});

import type { Candidate } from "@/lib/types";
import { walkingMinutes } from "@/lib/geo";

export function candidateText(candidate: Candidate, distanceMeters: number): string {
  const facts = [
    `${candidate.name}.`,
    `${candidate.category}.`,
    `${walkingMinutes(distanceMeters)} minutes walking.`,
  ];

  if (candidate.rating !== undefined) {
    facts.push(
      candidate.reviewCount !== undefined
        ? `Rating ${candidate.rating} from ${candidate.reviewCount} reviews.`
        : `Rating ${candidate.rating}.`,
    );
  } else {
    facts.push("Rating information unavailable.");
  }

  const publicTags = candidate.tags.filter(
    (tag) => !["synthetic-demo", "tourist-oriented-heuristic", "highly-visited"].includes(tag),
  );
  if (publicTags.length) facts.push(`Derived heuristic tags: ${publicTags.join(", ")}.`);
  if (candidate.tags.includes("highly-visited") || (candidate.reviewCount ?? 0) >= 1_500) {
    facts.push("Heuristic: major downtown landmark with exceptionally high review volume, strong visitor recognition, and limited independent-local signals.");
  }
  if (candidate.tags.includes("independent") || candidate.tags.includes("local")) {
    facts.push("Heuristic: less obvious local discovery with strong independent neighborhood signals.");
  }
  if (candidate.priceLevel === undefined) facts.push("Price information unavailable.");
  if (candidate.isOpenNow === null) facts.push("Current opening status unknown.");

  return facts.join(" ");
}

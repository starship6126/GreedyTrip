import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GreedyTrip Anti-Itinerary Voice Agent",
    short_name: "GreedyTrip",
    description: "One high-value next move at a time.",
    start_url: "/",
    display: "standalone",
    background_color: "#090b0a",
    theme_color: "#9cfbb6",
  };
}

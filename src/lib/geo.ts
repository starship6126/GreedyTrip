import type { GeoPoint } from "@/lib/types";

const EARTH_RADIUS_METERS = 6_371_000;
const WALKING_METERS_PER_MINUTE = 80;

export function haversineMeters(a: Pick<GeoPoint, "lat" | "lng">, b: Pick<GeoPoint, "lat" | "lng">): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function walkingMinutes(distanceMeters: number): number {
  return Math.max(1, Math.ceil(distanceMeters / WALKING_METERS_PER_MINUTE));
}

export const DEMO_LOCATIONS: GeoPoint[] = [
  { lat: 37.7841, lng: -122.4075, label: "Powell Street Station" },
  { lat: 37.7851, lng: -122.4024, label: "Yerba Buena" },
  { lat: 37.7879, lng: -122.4075, label: "Union Square" },
];

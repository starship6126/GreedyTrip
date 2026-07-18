import { Crosshair, LocateFixed, MapPin } from "lucide-react";
import { DEMO_LOCATIONS } from "@/lib/geo";
import type { GeoPoint } from "@/lib/types";

export function LocationSimulator({ current, movementMeters, onMove, onRealLocation }: { current: GeoPoint; movementMeters: number; onMove: (location: GeoPoint) => void; onRealLocation: () => void }) {
  return (
    <section className="utility-panel location-panel">
      <div className="panel-heading">
        <div><span className="eyebrow"><Crosshair size={14} /> Movement simulator</span><h3>{current.label}</h3></div>
        <span className="distance-readout">{movementMeters > 0 ? `${Math.round(movementMeters)} m moved` : "Starting point"}</span>
      </div>
      <div className="location-buttons">
        {DEMO_LOCATIONS.map((location) => (
          <button type="button" key={location.label} className={current.label === location.label ? "is-current" : ""} onClick={() => onMove(location)}>
            <MapPin size={15} /> {location.label.replace(" Station", "")}
          </button>
        ))}
        <button type="button" onClick={onRealLocation}><LocateFixed size={15} /> Use my location</button>
      </div>
    </section>
  );
}

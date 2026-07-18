"use client";

import { useState } from "react";
import { ArrowUpRight, ImageOff, MapPin, X } from "lucide-react";
import type { Candidate } from "@/lib/types";

export function MapPhotoDrawer({ candidate, open, onClose }: { candidate?: Candidate; open: boolean; onClose: () => void }) {
  const [failed, setFailed] = useState<string[]>([]);
  if (!open || !candidate) return null;
  const query = candidate.placeId
    ? `place_id:${candidate.placeId}`
    : `${candidate.name} ${candidate.address ?? `${candidate.lat},${candidate.lng}`}`;
  const mapsUrl = candidate.googleMapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(candidate.name)}&query_place_id=${encodeURIComponent(candidate.placeId ?? "")}`;
  const embedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="visual-drawer" role="dialog" aria-modal="true" aria-labelledby="visual-title">
        <div className="drawer-handle" />
        <header><div><span className="eyebrow">Map & photos</span><h2 id="visual-title">{candidate.name}</h2></div><button type="button" onClick={onClose} aria-label="Close map and photos"><X /></button></header>
        <div className="photo-strip">
          {candidate.photoUrls.filter((url) => !failed.includes(url)).slice(0, 3).map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt={`${candidate.name} photo ${index + 1}`} loading="lazy" onError={() => setFailed((items) => [...items, url])} />
          ))}
          {candidate.photoUrls.filter((url) => !failed.includes(url)).length === 0 && <div className="photo-empty"><ImageOff size={34} /><strong>No source photos available</strong><span>We won’t invent one.</span></div>}
        </div>
        <div className="map-area">
          {embedKey ? (
            <iframe title={`Map showing ${candidate.name}`} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(embedKey)}&q=${encodeURIComponent(query)}`} />
          ) : (
            <div className="map-fallback"><div className="coordinate-grid" aria-hidden="true" /><MapPin size={30} /><strong>{candidate.lat.toFixed(4)}, {candidate.lng.toFixed(4)}</strong><span>Embed key not configured · deep link is ready</span></div>
          )}
        </div>
        {candidate.address && <p className="drawer-address"><MapPin size={16} /> {candidate.address}</p>}
        <a className="maps-link" href={mapsUrl} target="_blank" rel="noreferrer">Open in Google Maps <ArrowUpRight size={17} /></a>
      </section>
    </div>
  );
}

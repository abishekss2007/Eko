import { CloudFog, LocateFixed, Search } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { searchPlaces } from "../lib/api";
import type { GeocodeResult, Place } from "../types";

export const QUICK_PICKS: Place[] = [
  { name: "Delhi", latitude: 28.6139, longitude: 77.209 },
  { name: "Ghaziabad", latitude: 28.6692, longitude: 77.4538 },
  { name: "Noida", latitude: 28.5355, longitude: 77.391 },
  { name: "Lucknow", latitude: 26.8467, longitude: 80.9462 },
  { name: "Kolkata", latitude: 22.5726, longitude: 88.3639 },
  { name: "Mumbai", latitude: 19.076, longitude: 72.8777 },
];

interface Props {
  place: Place;
  onPlace: (place: Place) => void;
  simulate: boolean;
  onSimulate: (on: boolean) => void;
}

export function LocationBar({ place, onPlace, simulate, onSimulate }: Props) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [status, setStatus] = useState("");

  const onSearch = async (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setStatus("Type at least 2 letters.");
      return;
    }
    setStatus("Searching…");
    try {
      const found = await searchPlaces(q);
      setResults(found);
      setStatus(found.length ? `${found.length} places found.` : "No places found.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Search failed.");
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setStatus("Location is not available in this browser.");
      return;
    }
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPlace({ name: "My location", latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setStatus("Using your location.");
      },
      () => setStatus("Could not get your location. Search for a city instead."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  return (
    <div className="space-y-4">
      <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2" role="search">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor={inputId} className="mb-1 block text-sm font-semibold">
            Search city or locality
          </label>
          <input
            id={inputId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={80}
            autoComplete="address-level2"
            className="input"
            placeholder="e.g. Gurugram"
          />
        </div>
        <button type="submit" className="btn-primary">
          <Search aria-hidden="true" size={18} /> Search
        </button>
        <button type="button" onClick={useMyLocation} className="btn-secondary">
          <LocateFixed aria-hidden="true" size={18} /> Use my location
        </button>
      </form>

      <p role="status" className="min-h-[1.25rem] text-sm text-slate-700">
        {status}
      </p>

      {results.length > 0 && (
        <ul aria-label="Search results" className="flex flex-wrap gap-2">
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  onPlace({ name: r.name, latitude: r.latitude, longitude: r.longitude });
                  setResults([]);
                  setStatus(`Showing ${r.name}.`);
                }}
              >
                {[r.name, r.admin1, r.country].filter(Boolean).join(", ")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick pick cities">
        {QUICK_PICKS.map((p) => (
          <button
            key={p.name}
            type="button"
            className="chip"
            aria-pressed={place.name === p.name}
            onClick={() => onPlace(p)}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-red-800 bg-red-50 p-3">
        <button
          type="button"
          role="switch"
          aria-checked={simulate}
          onClick={() => onSimulate(!simulate)}
          className={simulate ? "btn-danger" : "btn-secondary"}
        >
          <CloudFog aria-hidden="true" size={18} />
          {simulate ? "Stop simulation" : "Simulate severe winter smog"}
        </button>
        <p className="text-sm text-red-900">
          Demo mode: NAQI 418 (Severe), 9 °C, 3 km/h wind. Test alerts and SOS any day of the year.
        </p>
      </div>
    </div>
  );
}

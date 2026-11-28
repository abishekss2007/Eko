import { CloudFog, History, LocateFixed, MapPin, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useDebounced } from "../hooks/useDebounced";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { searchPlaces } from "../lib/api";
import type { GeocodeResult, Place } from "../types";

/** One-tap picks for India's most-searched cities. Any other place on Earth is a search away. */
export const QUICK_PICKS: Place[] = [
  { name: "Delhi", latitude: 28.6139, longitude: 77.209 },
  { name: "Mumbai", latitude: 19.076, longitude: 72.8777 },
  { name: "Kolkata", latitude: 22.5726, longitude: 88.3639 },
  { name: "Chennai", latitude: 13.0827, longitude: 80.2707 },
  { name: "Bengaluru", latitude: 12.9716, longitude: 77.5946 },
  { name: "Hyderabad", latitude: 17.385, longitude: 78.4867 },
  { name: "Ahmedabad", latitude: 23.0225, longitude: 72.5714 },
  { name: "Pune", latitude: 18.5204, longitude: 73.8567 },
  { name: "Jaipur", latitude: 26.9124, longitude: 75.7873 },
  { name: "Lucknow", latitude: 26.8467, longitude: 80.9462 },
  { name: "Patna", latitude: 25.5941, longitude: 85.1376 },
  { name: "Chandigarh", latitude: 30.7333, longitude: 76.7794 },
  { name: "Ghaziabad", latitude: 28.6692, longitude: 77.4538 },
  { name: "Noida", latitude: 28.5355, longitude: 77.391 },
  { name: "Gurugram", latitude: 28.4595, longitude: 77.0266 },
];

const MAX_RECENT = 5;
const SUGGEST_DELAY_MS = 300;

/** "Connaught Place, New Delhi, Delhi, India" for the list; "Connaught Place, New Delhi" as the place name. */
export function placeLabel(r: GeocodeResult): string {
  return [r.name, r.area, r.admin1, r.country].filter((part, i, all) => part && all.indexOf(part) === i).join(", ");
}

export function toPlace(r: GeocodeResult): Place {
  const context = r.area ?? r.admin1 ?? r.country;
  const name = context && context !== r.name ? `${r.name}, ${context}` : r.name;
  return { name: name.slice(0, 80), latitude: r.latitude, longitude: r.longitude };
}

function parseRecent(raw: unknown): Place[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is Place =>
        typeof p?.name === "string" &&
        typeof p.latitude === "number" &&
        typeof p.longitude === "number" &&
        Math.abs(p.latitude) <= 90 &&
        Math.abs(p.longitude) <= 180,
    )
    .slice(0, MAX_RECENT)
    .map((p) => ({ name: p.name.slice(0, 80), latitude: p.latitude, longitude: p.longitude }));
}

const samePlace = (a: Place, b: Place) =>
  a.name === b.name && Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;

interface Props {
  place: Place;
  onPlace: (place: Place) => void;
  simulate: boolean;
  onSimulate: (on: boolean) => void;
}

export function LocationBar({ place, onPlace, simulate, onSimulate }: Props) {
  const inputId = useId();
  const listId = useId();
  const hintId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const [recent, setRecent] = useLocalStorage<Place[]>("saanssafe.recentPlaces", parseRecent, []);
  const pending = useRef<AbortController | null>(null);
  // Set when a choice fills the box, so the debounced effect does not search for it again.
  const chosen = useRef<string | null>(null);
  const settled = useDebounced(query.trim(), SUGGEST_DELAY_MS);

  const runSearch = async (q: string) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setStatus("Searching…");
    try {
      const found = await searchPlaces(q, controller.signal);
      if (controller.signal.aborted) return;
      setResults(found);
      setActive(found.length ? 0 : -1);
      setOpen(found.length > 0);
      setStatus(
        found.length
          ? `${found.length} ${found.length === 1 ? "place" : "places"} found. Use the arrow keys to choose.`
          : `No places found for “${q}”. Try a nearby town, or add the state or country after a comma.`,
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus(err instanceof Error ? err.message : "Search failed.");
    }
  };

  // Suggest places as the user types.
  useEffect(() => {
    if (settled.length < 2 || settled === chosen.current) return;
    void runSearch(settled);
  }, [settled]);

  useEffect(() => () => pending.current?.abort(), []);

  const choose = (p: Place) => {
    onPlace(p);
    setRecent((prev) => [p, ...prev.filter((r) => !samePlace(r, p))].slice(0, MAX_RECENT));
    setOpen(false);
    setResults([]);
    setActive(-1);
    setStatus(`Showing ${p.name}.`);
  };

  const chooseResult = (r: GeocodeResult) => {
    const p = toPlace(r);
    chosen.current = p.name;
    setQuery(p.name);
    choose(p);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setStatus("Type at least 2 letters.");
      return;
    }
    const pick = open ? results[active] : undefined;
    if (pick) chooseResult(pick);
    else void runSearch(q);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      setActive((i) => (i + step + results.length) % results.length);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
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
      () => setStatus("Could not get your location. Search for a place instead."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" role="search">
        <div className="relative min-w-[12rem] flex-1">
          <label htmlFor={inputId} className="mb-1 block text-sm font-semibold">
            Search any city, town, village or locality
          </label>
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
            aria-describedby={hintId}
            value={query}
            onChange={(e) => {
              chosen.current = null;
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) {
                pending.current?.abort();
                setResults([]);
                setOpen(false);
              }
            }}
            onKeyDown={onKeyDown}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onFocus={() => results.length > 0 && setOpen(true)}
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            className="input"
            placeholder="e.g. Connaught Place, Varanasi, London"
          />
          <p id={hintId} className="sr-only">
            Suggestions appear as you type. Add a state or country after a comma to narrow them.
          </p>
          <div
            id={listId}
            role="listbox"
            aria-label="Place suggestions"
            hidden={!open}
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-slate-300 bg-white py-1 shadow-lg"
          >
            {results.map((r, i) => (
              // Keyboard choice is handled on the combobox (arrow keys + Enter), per the ARIA combobox pattern.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <div
                key={`${r.latitude},${r.longitude},${r.name}`}
                id={optionId(i)}
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                // mousedown keeps focus in the box so the blur handler does not close the list first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => chooseResult(r)}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-[44px] cursor-pointer items-center gap-2 px-3 py-2 text-slate-900 ${
                  i === active ? "bg-brand-50" : ""
                }`}
              >
                <MapPin aria-hidden="true" size={16} className="shrink-0 text-brand-700" />
                <span>
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-slate-600">
                    {placeLabel(r).slice(r.name.length) /* the ", area, state, country" tail */}
                  </span>
                </span>
              </div>
            ))}
          </div>
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

      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Recent places">
          <History aria-hidden="true" size={16} className="text-slate-600" />
          {recent.map((p) => (
            <button
              key={`${p.name},${p.latitude},${p.longitude}`}
              type="button"
              className="chip"
              aria-pressed={samePlace(place, p)}
              onClick={() => choose(p)}
            >
              {p.name}
            </button>
          ))}
        </div>
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

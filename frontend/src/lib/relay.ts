/**
 * Browser relay. Free data providers (Open-Meteo, Photon) limit requests per IP address, and a
 * shared host's address is often over the limit. When the API says a provider refused it, this
 * browser fetches exactly those provider URLs itself, hands the JSON to `/api/relay`, and the
 * API retries the calculation with it. The server keeps that data private to this browser.
 */

export interface ProviderRequest {
  url: string;
  params: Record<string, string>;
}

/** The only places the browser will fetch from on the server's behalf (also in the CSP). */
const PROVIDER_URLS = new Set([
  "https://air-quality-api.open-meteo.com/v1/air-quality",
  "https://api.open-meteo.com/v1/forecast",
  "https://geocoding-api.open-meteo.com/v1/search",
  "https://archive-api.open-meteo.com/v1/archive",
  "https://photon.komoot.io/api/",
]);
export const RELAY_ID_HEADER = "X-Relay-Id";
export const RELAY_WANTED_HEADER = "X-Relay-Wanted";
const MAX_REQUESTS = 8;

let relayId: string | null = null;
const inFlight = new Map<string, Promise<void>>();

/** Header to send with API requests once this browser has relayed data. */
export function relayHeaders(): Record<string, string> {
  return relayId ? { [RELAY_ID_HEADER]: relayId } : {};
}

/** Only well-formed requests to known providers, at most a handful. */
export function parseRequests(value: unknown): ProviderRequest[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is ProviderRequest =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ProviderRequest).url === "string" &&
        PROVIDER_URLS.has((item as ProviderRequest).url) &&
        typeof (item as ProviderRequest).params === "object" &&
        (item as ProviderRequest).params !== null &&
        Object.values((item as ProviderRequest).params).every((v) => typeof v === "string"),
    )
    .slice(0, MAX_REQUESTS);
}

async function fetchProvider(item: ProviderRequest, signal?: AbortSignal) {
  const response = await fetch(`${item.url}?${new URLSearchParams(item.params)}`, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok) throw new Error(`Provider answered ${response.status}`);
  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("Unexpected provider data");
  return { ...item, data };
}

/**
 * Fetch these provider requests in the browser and give the results to the API.
 * Returns true when at least one result reached the server. Requests that fail are skipped.
 */
export async function relay(requests: ProviderRequest[], signal?: AbortSignal): Promise<boolean> {
  if (requests.length === 0) return false;
  const key = JSON.stringify(requests);
  const pending = inFlight.get(key);
  if (pending) {
    await pending;
    return true;
  }
  let sent = false;
  const job = (async () => {
    const settled = await Promise.allSettled(requests.map((item) => fetchProvider(item, signal)));
    const responses = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
    if (responses.length === 0) return;
    const receipt = await fetch("/api/relay", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ...(relayId ? { id: relayId } : {}), responses }),
      signal,
    });
    if (!receipt.ok) return;
    const body = (await receipt.json()) as { id?: unknown };
    if (typeof body.id === "string") {
      relayId = body.id;
      sent = true;
    }
  })();
  inFlight.set(key, job);
  try {
    await job;
  } finally {
    inFlight.delete(key);
  }
  return sent;
}

/** Test hook: forget the relay id. */
export function resetRelay(): void {
  relayId = null;
  inFlight.clear();
}

import type {
  AirReport,
  CivicRequest,
  CivicResponse,
  CommuteRequest,
  CommuteResponse,
  DemoShieldRequest,
  GeocodeResult,
  DayDetail,
  HistoryReport,
  HouseholdDto,
  IndoorRequest,
  IndoorResponse,
  PlanRequest,
  PlanResponse,
  ShieldRequest,
  ShieldResponse,
} from "../types";
import { type ProviderRequest, RELAY_WANTED_HEADER, parseRequests, relay, relayHeaders } from "./relay";

/** A provider may need a second round (place search first, then air for it). */
const MAX_RELAY_ROUNDS = 2;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A safe, human message: the server's own text for 4xx, generic text otherwise. */
async function errorMessage(response: Response): Promise<string> {
  if (response.status === 429) return "Too many requests. Please wait a minute and try again.";
  if (response.status >= 500) return "The service is temporarily unavailable. Please try again.";
  if (response.status === 422) return "Please check the details and try again.";
  const detail = await response
    .json()
    .then((b: { detail?: unknown }) => b.detail)
    .catch(() => undefined);
  return typeof detail === "string" ? detail : "The request could not be processed.";
}

/** Provider requests the API asks this browser to make (see lib/relay.ts), if any. */
async function relayRequests(response: Response): Promise<ProviderRequest[]> {
  if (response.status !== 502) return [];
  const body = await response
    .clone()
    .json()
    .catch(() => undefined);
  return parseRequests((body as { relay?: unknown } | undefined)?.relay);
}

async function request<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...relayHeaders(),
    },
  });
  // Slow, optional data (the long-term archive): fetch it in the background for the next poll.
  const wanted = response.headers.get(RELAY_WANTED_HEADER);
  if (wanted) {
    try {
      void relay(parseRequests(JSON.parse(wanted))).catch(() => undefined);
    } catch {
      /* ignore a malformed header */
    }
  }
  if (!response.ok) {
    const needed = attempt < MAX_RELAY_ROUNDS ? await relayRequests(response) : [];
    if (needed.length > 0 && (await relay(needed, init.signal ?? undefined).catch(() => false))) {
      return request<T>(path, init, attempt + 1);
    }
    throw new ApiError(await errorMessage(response), response.status);
  }
  return (await response.json()) as T;
}

export function fetchAir(lat: number, lon: number, simulate: boolean, signal?: AbortSignal): Promise<AirReport> {
  const params = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), simulate: String(simulate) });
  return request<AirReport>(`/api/air?${params}`, { signal });
}

export function fetchHistory(lat: number, lon: number, days: number, signal?: AbortSignal): Promise<HistoryReport> {
  const params = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), days: String(days) });
  return request<HistoryReport>(`/api/history?${params}`, { signal });
}

export function fetchDay(lat: number, lon: number, date: string, signal?: AbortSignal): Promise<DayDetail> {
  const params = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), date });
  return request<DayDetail>(`/api/history/day?${params}`, { signal });
}

export function searchPlaces(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  return request<GeocodeResult[]>(`/api/geocode?${new URLSearchParams({ q: query })}`, { signal });
}

function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body), signal });
}

export const fetchShield = (body: ShieldRequest, signal?: AbortSignal) => post<ShieldResponse>("/api/shield", body, signal);
/** Guided demo for guests: the server picks the sample family. */
export const fetchDemoShield = (body: DemoShieldRequest, signal?: AbortSignal) =>
  post<ShieldResponse>("/api/shield/demo", body, signal);
export const fetchPlan = (body: PlanRequest, signal?: AbortSignal) => post<PlanResponse>("/api/plan", body, signal);
export const fetchIndoor = (body: IndoorRequest) => post<IndoorResponse>("/api/indoor", body);
export const fetchCommute = (body: CommuteRequest) => post<CommuteResponse>("/api/commute", body);
export const fetchCivic = (body: CivicRequest) => post<CivicResponse>("/api/civic", body);

export interface Account {
  id: number;
  name: string;
  email: string;
}

export const signUp = (body: { name: string; email: string; password: string }) => post<Account>("/api/auth/signup", body);
export const logIn = (body: { email: string; password: string }) => post<Account>("/api/auth/login", body);
export const fetchMe = () => request<Account>("/api/auth/me");
export const fetchDemoAccount = () => request<{ email: string; password: string }>("/api/auth/demo");

/** The signed-in account's family. Guests get a 401: adding family members needs an account. */
export const fetchFamily = (signal?: AbortSignal) => request<HouseholdDto>("/api/family", { signal });
export const saveFamily = (body: HouseholdDto) =>
  request<HouseholdDto>("/api/family", { method: "PUT", body: JSON.stringify(body) });
export async function logOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

import type {
  AirReport,
  CivicRequest,
  CivicResponse,
  CommuteRequest,
  CommuteResponse,
  GeocodeResult,
  IndoorRequest,
  IndoorResponse,
  PlanRequest,
  PlanResponse,
  ShieldRequest,
  ShieldResponse,
} from "../types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (!response.ok) {
    const message =
      response.status === 429
        ? "Too many requests. Please wait a minute and try again."
        : response.status >= 500
          ? "Air-quality data is temporarily unavailable."
          : "The request could not be processed.";
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export function fetchAir(lat: number, lon: number, simulate: boolean, signal?: AbortSignal): Promise<AirReport> {
  const params = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), simulate: String(simulate) });
  return request<AirReport>(`/api/air?${params}`, { signal });
}

export function searchPlaces(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  return request<GeocodeResult[]>(`/api/geocode?${new URLSearchParams({ q: query })}`, { signal });
}

function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body), signal });
}

export const fetchShield = (body: ShieldRequest, signal?: AbortSignal) => post<ShieldResponse>("/api/shield", body, signal);
export const fetchPlan = (body: PlanRequest, signal?: AbortSignal) => post<PlanResponse>("/api/plan", body, signal);
export const fetchIndoor = (body: IndoorRequest) => post<IndoorResponse>("/api/indoor", body);
export const fetchCommute = (body: CommuteRequest) => post<CommuteResponse>("/api/commute", body);
export const fetchCivic = (body: CivicRequest) => post<CivicResponse>("/api/civic", body);

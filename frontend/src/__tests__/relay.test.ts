import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAir, fetchHistory } from "../lib/api";
import { parseRequests, resetRelay } from "../lib/relay";

const FORECAST = { url: "https://api.open-meteo.com/v1/forecast", params: { latitude: "28.61" } };
const ARCHIVE = { url: "https://archive-api.open-meteo.com/v1/archive", params: { latitude: "28.61" } };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

describe("browser relay", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetRelay();
  });

  it("fetches what the server could not, hands it over, and retries with the relay id", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    let relayed = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.startsWith("https://api.open-meteo.com/")) return json({ current: { temperature_2m: 12 } });
        if (url === "/api/relay") {
          relayed = true;
          return json({ id: "relay-id-0123456789abcdef" });
        }
        return relayed ? json({ ok: true }) : json({ detail: "Air-quality provider is unavailable", relay: [FORECAST] }, 502);
      }),
    );

    await expect(fetchAir(28.61, 77.21, false)).resolves.toEqual({ ok: true });

    const provider = calls.find((c) => c.url.startsWith("https://api.open-meteo.com/"));
    expect(provider?.url).toBe("https://api.open-meteo.com/v1/forecast?latitude=28.61");
    expect(provider?.init?.credentials).toBe("omit");
    const posted = JSON.parse(String(calls.find((c) => c.url === "/api/relay")?.init?.body));
    expect(posted.responses[0]).toMatchObject({ ...FORECAST, data: { current: { temperature_2m: 12 } } });
    const retry = calls.at(-1);
    expect((retry?.init?.headers as Record<string, string>)["X-Relay-Id"]).toBe("relay-id-0123456789abcdef");
  });

  it("gives up with the normal error when the browser cannot reach the provider either", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("https://") ? json({}, 429) : json({ detail: "x", relay: [FORECAST] }, 502),
      ),
    );
    await expect(fetchAir(28.61, 77.21, false)).rejects.toThrow("The service is temporarily unavailable");
  });

  it("fetches wanted background data without delaying the answer", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        seen.push(url);
        if (url.startsWith("https://archive-api")) return json({ daily: {} });
        if (url === "/api/relay") return json({ id: "relay-id-0123456789abcdef" });
        return json({ long_term_pending: true }, 200, { "X-Relay-Wanted": JSON.stringify([ARCHIVE]) });
      }),
    );
    await expect(fetchHistory(28.61, 77.21, 30)).resolves.toEqual({ long_term_pending: true });
    await vi.waitFor(() => expect(seen).toContain("/api/relay"));
  });

  it("ignores anything but known provider URLs", () => {
    expect(
      parseRequests([
        FORECAST,
        { url: "https://evil.example/steal", params: {} },
        { url: FORECAST.url, params: { a: 1 } },
        "nope",
      ]),
    ).toEqual([FORECAST]);
    expect(parseRequests({})).toEqual([]);
  });
});

describe("browser relay with parallel requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetRelay();
  });

  it("puts every hand-over under the same relay id", async () => {
    const posted: { id?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("https://")) return json({ ok: 1 });
        if (url === "/api/relay") {
          posted.push(JSON.parse(String(init?.body)) as { id?: string });
          return json({ id: "relay-id-0123456789abcdef" });
        }
        const headers = (init?.headers ?? {}) as Record<string, string>;
        if (headers["X-Relay-Id"] && posted.length >= 2) return json({ ok: true });
        const which = url.startsWith("/api/air") ? FORECAST : ARCHIVE;
        return json({ detail: "x", relay: [which] }, 502);
      }),
    );
    await Promise.all([fetchAir(28.61, 77.21, false), fetchHistory(28.61, 77.21, 7)]);
    expect(posted).toHaveLength(2);
    expect(posted[0]?.id).toBeUndefined();
    expect(posted[1]?.id).toBe("relay-id-0123456789abcdef");
  });
});

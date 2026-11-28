import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import App from "../App";
import { HistoryPanel } from "../components/HistoryPanel";
import { LanguageProvider } from "../lib/language";
import { navigate } from "../lib/router";
import { HISTORY, stubFetch } from "./fixtures";

const DELHI = { name: "New Delhi", latitude: 28.6139, longitude: 77.209 };

describe("HistoryPanel", () => {
  it("shows yesterday, the period records with dates, and the all-time records", async () => {
    stubFetch();
    const { container } = render(<HistoryPanel place={DELHI} />);
    expect(await screen.findByRole("heading", { name: /Yesterday in New Delhi/ })).toBeInTheDocument();
    expect(screen.getByText("NAQI 312, Very Poor", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/1\.3 °C warmer than usual/)).toBeInTheDocument();

    const records = screen.getByRole("list", { name: "Records for this period" });
    expect(within(records).getByText("29.8 °C")).toBeInTheDocument();
    expect(within(records).getByText(/24 Nov at 15:00/)).toBeInTheDocument();
    expect(within(records).getByText("NAQI 405")).toBeInTheDocument();
    expect(screen.getByText(/5 of 7 days were Poor or worse/)).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: /All-time records since 1991/ })).toBeInTheDocument();
    expect(screen.getByText("47.2 °C")).toBeInTheDocument();
    expect(screen.getByText(/record high/)).toHaveTextContent("2009");
    expect(screen.getByRole("table", { hidden: true })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("asks for the chosen period and remembers it", async () => {
    const fetchMock = stubFetch();
    render(<HistoryPanel place={DELHI} />);
    await screen.findByRole("heading", { name: /Yesterday in/ });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("days=30"), expect.anything());
    await userEvent.click(screen.getByRole("radio", { name: "7 days" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("days=7"), expect.anything()));
    expect(window.localStorage.getItem("saanssafe.historyDays")).toBe("7");
  });

  it("still shows the weather when air history and the archive are missing", async () => {
    stubFetch({
      "/api/history": {
        status: 200,
        body: {
          ...HISTORY,
          long_term: null,
          air_available: false,
          records: { ...HISTORY.records, worst_air: null, cleanest_air: null, pm2_5_peak: null, average_naqi: null },
        },
      },
    });
    render(<HistoryPanel place={DELHI} />);
    expect(await screen.findByText(/Air-quality history is not available/)).toBeInTheDocument();
    expect(screen.queryByText(/All-time records/)).toBeNull();
  });

  it("explains when history cannot be loaded", async () => {
    stubFetch({ "/api/history": { status: 502, body: { detail: "Weather history is unavailable" } } });
    render(<HistoryPanel place={DELHI} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/temporarily unavailable/);
  });
});

describe("History view", () => {
  beforeEach(() => navigate("/app"));

  it("loads history only when the History tab is opened", async () => {
    const fetchMock = stubFetch();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByText(/NAQI 418, Severe/);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/history"))).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "History" }));
    expect(window.location.hash).toBe("#history");
    expect(await screen.findByRole("heading", { name: /Yesterday in/ })).toBeVisible();
  });
});

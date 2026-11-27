import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import App from "../App";
import { navigate } from "../lib/router";
import { LanguageProvider } from "../lib/language";
import { speak } from "../lib/speech";
import { stubFetch } from "./fixtures";

describe("App", () => {
  beforeEach(() => navigate("/app"));

  it("loads the dashboard with no accessibility violations", async () => {
    stubFetch();
    const { container } = render(<LanguageProvider><App /></LanguageProvider>);
    expect(await screen.findByText(/NAQI 418, Severe/)).toBeInTheDocument();
    expect(screen.getByText(/Winter smog trap: Detected/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Skip to main content/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("requests simulated data when the smog simulation is switched on", async () => {
    const fetchMock = stubFetch();
    render(<LanguageProvider><App /></LanguageProvider>);
    const toggle = screen.getByRole("switch", { name: /Simulate severe winter smog/ });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("simulate=true"), expect.anything()));
  });

});

vi.mock("../lib/speech", () => ({ canSpeak: () => false, speak: vi.fn(), stopSpeaking: vi.fn() }));

describe("App extras", () => {
  beforeEach(() => navigate("/app"));

  it("shows today's plan and switches the advice language", async () => {
    const fetchMock = stubFetch();
    render(<LanguageProvider><App /></LanguageProvider>);
    expect(await screen.findByText(/Severe smog today/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/Language for advice/), "hi");
    expect(document.documentElement.lang).toBe("hi");
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url, init]) => url === "/api/plan" && String((init as RequestInit).body).includes('"language":"hi"')),
      ).toBe(true),
    );
  });

  it("runs the guided demo with a demo family and reads the SOS script", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFetch();
    Element.prototype.scrollIntoView = vi.fn();
    render(<LanguageProvider><App /></LanguageProvider>);
    await userEvent.click(screen.getByRole("button", { name: /60-second demo/ }));
    expect(screen.getByText(/Smog spike: the simulation pushes NAQI to 418/)).toBeInTheDocument();
    expect(await screen.findByText(/Showing a demo family/)).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("simulate=true"), expect.anything()));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(speak).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(screen.queryByText(/Showing a demo family/)).toBeNull();
    // A guest's demo uses the server's own sample family; nothing is saved and no family is sent.
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toContain("/api/shield/demo");
    expect(urls).not.toContain("/api/shield");
    expect(urls).not.toContain("/api/family");
    vi.useRealTimers();
  });
});

describe("App navigation", () => {
  beforeEach(() => navigate("/app"));

  it("switches views from the section bar and remembers the view in the address", async () => {
    stubFetch();
    render(<LanguageProvider><App /></LanguageProvider>);
    const today = screen.getByRole("button", { name: "Today" });
    expect(today).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("button", { name: "Commute" }));
    expect(screen.getByRole("button", { name: "Commute" })).toHaveAttribute("aria-current", "page");
    expect(today).not.toHaveAttribute("aria-current");
    expect(window.location.hash).toBe("#commute");
    expect(screen.getByRole("heading", { name: /Cleaner, low-emission commute/ })).toBeVisible();
  });

  it("opens the SOS panel from the header in one tap", async () => {
    stubFetch();
    render(<LanguageProvider><App /></LanguageProvider>);
    await userEvent.click(screen.getByRole("link", { name: "SOS" }));
    expect(screen.getByRole("heading", { name: "Emergency SOS" })).toBeVisible();
    await waitFor(() => expect(document.getElementById("sos")).toHaveFocus());
  });

  it("opens the view named in the link", () => {
    stubFetch();
    window.history.replaceState({}, "", "/app#family");
    render(<LanguageProvider><App /></LanguageProvider>);
    expect(screen.getByRole("button", { name: "Family" })).toHaveAttribute("aria-current", "page");
  });

  it("toggles dark mode and remembers it", async () => {
    stubFetch();
    render(<LanguageProvider><App /></LanguageProvider>);
    const toggle = screen.getByRole("button", { name: "Dark mode" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("saanssafe.theme")).toBe("dark");
    await userEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { axe } from "vitest-axe";
import { LocationBar, QUICK_PICKS, placeLabel, toPlace } from "../components/LocationBar";
import type { GeocodeResult, Place } from "../types";
import { stubFetch } from "./fixtures";

const RESULTS: GeocodeResult[] = [
  { name: "Connaught Place", area: "New Delhi", admin1: "Delhi", country: "India", latitude: 28.6315, longitude: 77.2195 },
  { name: "Varanasi", area: null, admin1: "Uttar Pradesh", country: "India", latitude: 25.3176, longitude: 82.9739 },
];

function Harness({ onPlace }: { onPlace: (p: Place) => void }) {
  const [place, setPlace] = useState<Place>(QUICK_PICKS[0] as Place);
  return (
    <LocationBar
      place={place}
      onPlace={(p) => {
        setPlace(p);
        onPlace(p);
      }}
      simulate={false}
      onSimulate={() => {}}
    />
  );
}

describe("place labels", () => {
  it("joins the parts without repeats and names a locality with its city", () => {
    expect(placeLabel(RESULTS[0] as GeocodeResult)).toBe("Connaught Place, New Delhi, Delhi, India");
    expect(placeLabel({ name: "Delhi", area: null, admin1: "Delhi", country: "India", latitude: 0, longitude: 0 })).toBe(
      "Delhi, India",
    );
    expect(toPlace(RESULTS[0] as GeocodeResult).name).toBe("Connaught Place, New Delhi");
    expect(toPlace(RESULTS[1] as GeocodeResult).name).toBe("Varanasi, Uttar Pradesh");
  });
});

describe("LocationBar", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("suggests places while typing and picks one with the keyboard", async () => {
    const fetchMock = stubFetch({ "/api/geocode": { status: 200, body: RESULTS } });
    vi.stubGlobal("fetch", fetchMock);
    const onPlace = vi.fn();
    const { container } = render(<Harness onPlace={onPlace} />);

    const box = screen.getByRole("combobox", { name: /Search any city, town, village or locality/ });
    await userEvent.type(box, "Conn");
    const list = await screen.findByRole("listbox", { name: "Place suggestions" });
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/geocode?q=Conn"), expect.anything());
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onPlace).toHaveBeenLastCalledWith({ name: "Varanasi, Uttar Pradesh", latitude: 25.3176, longitude: 82.9739 });
    expect(list).not.toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Showing Varanasi, Uttar Pradesh.");

    // The choice is remembered as a recent place.
    const recent = screen.getByRole("group", { name: "Recent places" });
    expect(recent).toHaveTextContent("Varanasi, Uttar Pradesh");
    expect(JSON.parse(window.localStorage.getItem("saanssafe.recentPlaces") ?? "[]")).toHaveLength(1);
  });

  it("picks a suggestion with the mouse", async () => {
    vi.stubGlobal("fetch", stubFetch({ "/api/geocode": { status: 200, body: RESULTS } }));
    const onPlace = vi.fn();
    render(<Harness onPlace={onPlace} />);
    await userEvent.type(screen.getByRole("combobox"), "Connaught");
    await userEvent.click(await screen.findByRole("option", { name: /Connaught Place/ }));
    expect(onPlace).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Connaught Place, New Delhi" }));
  });

  it("explains how to narrow a search that finds nothing", async () => {
    vi.stubGlobal("fetch", stubFetch({ "/api/geocode": { status: 200, body: [] } }));
    render(<Harness onPlace={vi.fn()} />);
    await userEvent.type(screen.getByRole("combobox"), "Zzyzx{Enter}");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/No places found for “Zzyzx”/));
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
  });

  it("offers quick picks for major Indian cities", async () => {
    vi.stubGlobal("fetch", stubFetch());
    const onPlace = vi.fn();
    render(<Harness onPlace={onPlace} />);
    const picks = screen.getByRole("group", { name: "Quick pick cities" });
    expect(picks).toHaveTextContent(/Bengaluru/);
    await userEvent.click(screen.getByRole("button", { name: "Chennai" }));
    expect(onPlace).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Chennai" }));
    expect(screen.getByRole("button", { name: "Chennai" })).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores corrupt recent places in storage", () => {
    window.localStorage.setItem("saanssafe.recentPlaces", JSON.stringify([{ name: 1 }, "x", { name: "Agra", latitude: 27.18, longitude: 78.01 }]));
    vi.stubGlobal("fetch", stubFetch());
    render(<Harness onPlace={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Recent places" })).toHaveTextContent("Agra");
  });
});

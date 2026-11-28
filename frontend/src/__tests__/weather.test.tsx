import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { ForecastSheet } from "../components/ForecastSheet";
import { WeatherHero } from "../components/WeatherHero";
import { shortDay, shortHour, weatherLook } from "../lib/weather";
import type { AirReport, WeatherOutlook } from "../types";
import { AIR } from "./fixtures";

const OUTLOOK: WeatherOutlook = {
  weather_code: 45,
  condition: "Fog",
  is_day: true,
  today_max_c: 17,
  today_min_c: 8,
  hourly: AIR.forecast.map((p, i) => ({
    time: p.time,
    temperature_c: 9 + (i % 6),
    weather_code: i === 2 ? 61 : 45,
    precipitation_probability: i === 2 ? 40 : 0,
    is_day: true,
  })),
  daily: ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"].map(
    (date, i) => ({ date, weather_code: i === 1 ? 95 : 45, temp_max_c: 17 + i, temp_min_c: 8, precipitation_probability: i === 1 ? 80 : 0 }),
  ),
};
const WITH_WEATHER: AirReport = { ...AIR, weather: OUTLOOK };

describe("weather helpers", () => {
  it("maps WMO codes to icons, day and night", () => {
    expect(weatherLook(0).Icon).not.toBe(weatherLook(0, false).Icon);
    expect(weatherLook(61).tone).toContain("rain");
    expect(weatherLook(null).Icon).toBe(weatherLook(3).Icon);
    expect(weatherLook(1234).Icon).toBe(weatherLook(3).Icon);
  });

  it("labels hours and days like a weather app", () => {
    expect(shortHour("2026-11-20T00:00:00")).toBe("12 AM");
    expect(shortHour("2026-11-20T13:00:00")).toBe("1 PM");
    expect(shortHour("2026-11-20T13:00:00", true)).toBe("Now");
    expect(shortDay("2026-11-20", true)).toBe("Today");
    expect(shortDay("2026-11-21")).toBe("SAT");
  });
});

describe("WeatherHero", () => {
  it("shows place, temperature, sky, high/low and NAQI as text", async () => {
    const { container } = render(
      <WeatherHero report={WITH_WEATHER} placeName="Delhi" loading={false} onChangePlace={() => {}} />,
    );
    expect(screen.getByRole("heading", { name: /^Delhi/ })).toBeInTheDocument();
    expect(screen.getByText("Temperature 9 °C")).toBeInTheDocument();
    expect(screen.getByText("Fog")).toBeInTheDocument();
    expect(screen.getByText("High 17 °C,")).toBeInTheDocument();
    expect(screen.getByText(/NAQI 418 · Severe/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("works without a forecast and offers to change place", async () => {
    const onChange = vi.fn();
    render(<WeatherHero report={AIR} placeName="Delhi" loading={false} onChangePlace={onChange} />);
    expect(screen.getByText("Weather now")).toBeInTheDocument();
    expect(screen.queryByText(/High/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Change place" }));
    expect(onChange).toHaveBeenCalled();
  });

  it("says when it is loading", () => {
    render(<WeatherHero report={null} placeName="Delhi" loading onChangePlace={() => {}} />);
    expect(screen.getByText("Loading the weather and air…")).toBeInTheDocument();
  });
});

describe("ForecastSheet", () => {
  it("shows the next hours with temperature, rain chance and PM2.5, then the week", async () => {
    const { container } = render(<ForecastSheet report={WITH_WEATHER} />);
    const hours = screen.getByRole("list", { name: "Next 24 hours" });
    const items = within(hours).getAllByRole("listitem");
    expect(items).toHaveLength(24);
    expect(items[0]).toHaveTextContent("Now");
    expect(items[2]).toHaveTextContent("40%");
    expect(items[0]).toHaveTextContent("PM2.5 270");
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(screen.getByRole("tab", { name: "Weekly Forecast" }));
    expect(screen.getByRole("tab", { name: "Weekly Forecast" })).toHaveAttribute("aria-selected", "true");
    const days = within(screen.getByRole("list", { name: "Next 7 days" })).getAllByRole("listitem");
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveTextContent("Today");
    expect(days[1]).toHaveTextContent("80%");
    expect(days[1]).toHaveTextContent("High 18°");
  });

  it("shows the sky now on the Now pill, matching the big card", () => {
    const dusk: AirReport = {
      ...AIR,
      weather: { ...OUTLOOK, weather_code: 0, is_day: true, hourly: OUTLOOK.hourly.map((h) => ({ ...h, weather_code: 0, is_day: false })) },
    };
    const { container } = render(<ForecastSheet report={dusk} />);
    const pills = container.querySelectorAll("li.pill");
    // lucide names its icons in the class list: the first pill is the sun, the next one the moon.
    expect(pills[0]?.querySelector("svg")?.getAttribute("class")).toMatch(/lucide-sun/);
    expect(pills[1]?.querySelector("svg")?.getAttribute("class")).toMatch(/lucide-moon/);
  });

  it("switches tabs with the arrow keys", async () => {
    render(<ForecastSheet report={WITH_WEATHER} />);
    screen.getByRole("tab", { name: "Hourly Forecast" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Weekly Forecast" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Weekly Forecast" })).toHaveAttribute("aria-selected", "true");
  });

  it("falls back to the PM2.5 forecast when the weather forecast is missing", async () => {
    render(<ForecastSheet report={AIR} />);
    expect(within(screen.getByRole("list", { name: "Next 24 hours" })).getAllByRole("listitem")).toHaveLength(24);
    await userEvent.click(screen.getByRole("tab", { name: "Weekly Forecast" }));
    expect(screen.getByText("The 7-day forecast is not available right now.")).toBeInTheDocument();
  });
});

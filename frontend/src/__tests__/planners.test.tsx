import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { CivicDrafter } from "../components/CivicDrafter";
import { CommutePlanner } from "../components/CommutePlanner";
import { ImpactTracker } from "../components/ImpactTracker";
import { IndoorPlanner } from "../components/IndoorPlanner";
import { TodayPlan } from "../components/TodayPlan";
import { pretty } from "../lib/format";
import { parseImpact, totals, type ImpactEntry } from "../lib/impact";
import { PLAN, stubFetch } from "./fixtures";

const CONTEXT = { latitude: 28.61, longitude: 77.21, simulate: true, language: "en" as const };
const DADI = [{ id: "a", name: "Dadi", ageGroup: "senior" as const, sensitivities: ["copd" as const], careNote: "" }];

describe("TodayPlan", () => {
  it("shows one decision with real names and typeset units", async () => {
    const { container } = render(<TodayPlan data={PLAN} members={DADI} loading={false} />);
    expect(screen.getByText(/stay indoors, especially Dadi/)).toBeInTheDocument();
    expect(screen.getByText(/140 µg\/m³/)).toBeInTheDocument();
    expect(screen.getByText("Stay in")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("IndoorPlanner", () => {
  it("submits the room and lists budget fixes with explanations", async () => {
    const fetchMock = stubFetch();
    const { container } = render(<IndoorPlanner context={CONTEXT} />);
    await userEvent.click(screen.getByRole("radio", { name: "Under ₹5,000" }));
    await userEvent.click(screen.getByRole("button", { name: /Plan my clean room/ }));
    expect(await screen.findByText(/210 m³\/h of clean air/)).toBeInTheDocument();
    expect(screen.getByText("Smog leaks in through open windows.")).toBeInTheDocument();
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.budget_tier).toBe("under_5000");
    expect(body.room).toEqual({ length_m: 4, width_m: 3.5, height_m: 3 });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("CommutePlanner", () => {
  it("recommends a cleaner option, explains the maths and logs impact", async () => {
    stubFetch();
    const onLog = vi.fn();
    const { container } = render(<CommutePlanner context={CONTEXT} onLog={onLog} />);
    await userEvent.click(screen.getByRole("button", { name: /Find my cleaner commute/ }));
    expect(await screen.findByText("Metro at 11:00")).toBeInTheDocument();
    expect(screen.getByText(/55.9 µg \(60%\)/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /How we calculate/ }));
    const dialog = screen.getByRole("dialog", { name: /How we calculate impact/ });
    expect(within(dialog).getByText(/US EPA Exposure Factors/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    await userEvent.click(screen.getByRole("button", { name: /I did this today/ }));
    expect(onLog).toHaveBeenCalledWith({ label: "Metro at 11:00", dose_ug: 55.9, co2_kg: 1.2 });
    expect(await axe(container)).toHaveNoViolations();
  });

  it("runs the demo trip when asked by the guided demo", async () => {
    const fetchMock = stubFetch();
    render(<CommutePlanner context={CONTEXT} onLog={vi.fn()} demoRun={1} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({ distance_km: 12, current_mode: "car_petrol_solo", departure: "09:00" });
    expect(screen.getByLabelText(/One-way distance/)).toHaveValue(12);
  });
});

describe("ImpactTracker", () => {
  it("totals logged commutes and counts habits", async () => {
    const entries: ImpactEntry[] = [{ id: "1", date: "2026-11-20", label: "Metro", dose_ug: 55.9, co2_kg: 1.2 }];
    const onChange = vi.fn();
    const { container } = render(<ImpactTracker entries={entries} onChange={onChange} />);
    expect(screen.getByText("55.9 µg")).toBeInTheDocument();
    expect(screen.getByText("1.20 kg")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Wet-mopped/ }));
    expect(onChange.mock.calls[0]?.[0]).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("validates stored entries", () => {
    expect(parseImpact("x")).toEqual([]);
    expect(parseImpact([{ id: "1", date: "d", label: "l", dose_ug: "NaN", co2_kg: 1 }])).toEqual([]);
    expect(totals([{ id: "1", date: "d", label: "l", dose_ug: -5, co2_kg: 1 }]).dose_ug).toBe(0);
  });
});

describe("CivicDrafter", () => {
  it("drafts a note from the form", async () => {
    const fetchMock = stubFetch();
    const { container } = render(<CivicDrafter context={CONTEXT} />);
    await userEvent.click(screen.getByRole("radio", { name: /Open-burning complaint/ }));
    await userEvent.type(screen.getByLabelText(/What have you seen/), "Garbage burning at night");
    await userEvent.click(screen.getByRole("button", { name: /Draft the note/ }));
    expect(await screen.findByText(/Please stop open burning/)).toBeInTheDocument();
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({ kind: "burning_report", observation: "Garbage burning at night" });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("pretty", () => {
  it("typesets units", () => {
    expect(pretty("PM2.5 140 ug/m3, 210 m3/h, 37.5 ug, 1.2 kg CO2, 9 C")).toBe(
      "PM2.5 140 µg/m³, 210 m³/h, 37.5 µg, 1.2 kg CO₂, 9 °C",
    );
  });
});

import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { NaqiBadge } from "../components/AirDashboard";
import { BestWindowChart } from "../components/BestWindowChart";
import { SosPanel } from "../components/SosPanel";
import { AIR } from "./fixtures";

describe("NaqiBadge", () => {
  it("shows value and category as text, not colour alone", () => {
    render(<NaqiBadge value={418} category="Severe" />);
    expect(screen.getByText("418")).toBeInTheDocument();
    expect(screen.getByText("Severe")).toBeInTheDocument();
  });
});

describe("BestWindowChart", () => {
  it("summarises the window and offers an accessible table", async () => {
    const { container } = render(<BestWindowChart forecast={AIR.forecast} window={AIR.best_window} />);
    expect(screen.getByRole("img", { name: /14:00 to 16:00/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { hidden: true })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("handles no window", () => {
    render(<BestWindowChart forecast={[]} window={null} />);
    expect(screen.getByText(/No clean daytime window/)).toBeInTheDocument();
  });
});

describe("SosPanel", () => {
  it("renders one-tap tel links and asks for missing numbers", async () => {
    const { container } = render(
      <SosPanel
        doctorPhone="+91 98765 43210"
        hospitalPhone=""
        ambulance="108"
        emergency="112"
        handoff="I am calling about Asha."
        redFlags={["Chest pain"]}
      />,
    );
    expect(screen.getByRole("link", { name: /Call family doctor/ })).toHaveAttribute("href", "tel:+919876543210");
    expect(screen.getByRole("link", { name: /108 Ambulance/ })).toHaveAttribute("href", "tel:108");
    expect(screen.getByRole("link", { name: /112 Emergency/ })).toHaveAttribute("href", "tel:112");
    expect(screen.queryByRole("link", { name: /Call hospital/ })).toBeNull();
    expect(screen.getByText("I am calling about Asha.")).toBeInTheDocument();
    expect(screen.getByText("Chest pain")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

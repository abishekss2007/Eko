import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import App from "../App";
import { stubFetch } from "./fixtures";

describe("App", () => {
  it("loads the dashboard with no accessibility violations", async () => {
    stubFetch();
    const { container } = render(<App />);
    expect(await screen.findByText(/NAQI 418, Severe/)).toBeInTheDocument();
    expect(screen.getByText(/Winter smog trap: Detected/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Skip to main content/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("requests simulated data when the smog simulation is switched on", async () => {
    const fetchMock = stubFetch();
    render(<App />);
    const toggle = screen.getByRole("switch", { name: /Simulate severe winter smog/ });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("simulate=true"), expect.anything()));
  });

  it("runs the Family Health Shield without sending names or phone numbers", async () => {
    const fetchMock = stubFetch();
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /Add family member/ }));
    const name = screen.getByLabelText(/Name \(stays on this device\)/);
    await userEvent.clear(name);
    await userEvent.type(name, "Asha");
    await userEvent.type(screen.getByLabelText(/Family doctor phone/), "9876543210");

    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(within(alert).getByText(/Asha: Emergency/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call family doctor/ })).toHaveAttribute("href", "tel:9876543210");
    expect(screen.getByText(/I am calling about Asha/)).toBeInTheDocument();

    const shieldCalls = fetchMock.mock.calls.filter(([url]) => String(url) === "/api/shield");
    expect(shieldCalls.length).toBeGreaterThan(0);
    for (const [, init] of shieldCalls) {
      const body = String((init as RequestInit).body);
      expect(body).not.toContain("Asha");
      expect(body).not.toContain("9876543210");
      expect(body).toContain("Member_1");
    }
  });
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import App from "../App";
import { AuthProvider } from "../lib/auth";
import { LanguageProvider } from "../lib/language";
import { navigate } from "../lib/router";
import { stubFetch } from "./fixtures";

vi.mock("../lib/speech", () => ({ canSpeak: () => false, speak: vi.fn(), stopSpeaking: vi.fn() }));

const ACCOUNT = { id: 7, name: "Asha", email: "asha@example.com" };
const DEMO = { email: "demo@saanssafe.app", password: "SaansSafe-Demo-2026" };

function renderApp() {
  return render(
    <AuthProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </AuthProvider>,
  );
}

const callsTo = (fetchMock: ReturnType<typeof vi.fn>, path: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url) === path);

describe("family members need an account", () => {
  beforeEach(() => navigate("/app#family"));

  it("asks guests to sign in instead of letting them add family members", async () => {
    const fetchMock = stubFetch();
    const { container } = renderApp();
    expect(await screen.findByText("Sign in to add your family")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.queryByRole("button", { name: /Add family member/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Create free account/ })).toHaveAttribute("href", "/signup?next=family");
    expect(screen.getByRole("link", { name: /^Log in$/ })).toHaveAttribute("href", "/login?next=family");
    // SOS still works for guests.
    expect(screen.getByRole("heading", { name: "Emergency SOS" })).toBeInTheDocument();
    expect(callsTo(fetchMock, "/api/family")).toHaveLength(0);
    expect(callsTo(fetchMock, "/api/shield")).toHaveLength(0);
  });

  it("lets a signed-in user add a member, saves it to the account and never sends names to the Shield", async () => {
    const fetchMock = stubFetch({ "/api/auth/me": { status: 200, body: ACCOUNT } });
    renderApp();
    await userEvent.click(await screen.findByRole("button", { name: /Add family member/ }));
    const name = screen.getByLabelText(/^Name$/);
    await userEvent.clear(name);
    await userEvent.type(name, "Asha");
    await userEvent.type(screen.getByLabelText(/Family doctor phone/), "98765abc43210");

    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(within(alert).getByText(/Asha: Emergency/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call family doctor/ })).toHaveAttribute("href", "tel:9876543210");
    expect(screen.getByText(/I am calling about Asha/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Saved to your account.")).toBeInTheDocument());
    const saves = fetchMock.mock.calls.filter(
      ([url, init]) => String(url) === "/api/family" && (init as RequestInit | undefined)?.method === "PUT",
    );
    const saved = JSON.parse(String((saves.at(-1)?.[1] as RequestInit).body));
    expect(saved.members[0]).toMatchObject({ name: "Asha", age_group: "adult" });
    expect(saved.doctor_phone).toBe("9876543210");

    const shieldCalls = callsTo(fetchMock, "/api/shield");
    expect(shieldCalls.length).toBeGreaterThan(0);
    for (const [, init] of shieldCalls) {
      const body = String((init as RequestInit).body);
      expect(body).not.toContain("Asha");
      expect(body).not.toContain("9876543210");
      expect(body).toContain("Member_1");
    }
  });

  it("loads the family saved to the account", async () => {
    stubFetch({
      "/api/auth/me": { status: 200, body: ACCOUNT },
      "/api/family": {
        status: 200,
        body: {
          members: [{ id: "m1", name: "Dadi", age_group: "senior", sensitivities: ["copd"], care_note: "" }],
          doctor_phone: "",
          hospital_phone: "",
        },
      },
    });
    renderApp();
    expect(await screen.findByDisplayValue("Dadi")).toBeInTheDocument();
    expect(screen.getByLabelText("COPD")).toBeChecked();
  });
});

describe("demo account", () => {
  it("shows the demo credentials and logs straight in to the family view", async () => {
    const fetchMock = stubFetch({ "/api/auth/login": { status: 200, body: { id: 1, name: "Demo Family", email: DEMO.email } } });
    navigate("/login?next=family");
    renderApp();
    const box = await screen.findByRole("region", { name: "Try the demo account" });
    expect(within(box).getByText(DEMO.email)).toBeInTheDocument();
    expect(within(box).getByText(DEMO.password)).toBeInTheDocument();
    await userEvent.click(within(box).getByRole("button", { name: /Log in to the demo account/ }));

    await waitFor(() => expect(window.location.pathname).toBe("/app"));
    expect(window.location.hash).toBe("#family");
    const login = callsTo(fetchMock, "/api/auth/login")[0];
    expect(JSON.parse(String((login?.[1] as RequestInit).body))).toEqual(DEMO);
  });

  it("hides the demo box when the server has no demo account", async () => {
    stubFetch({ "/api/auth/demo": { status: 404, body: { detail: "There is no demo account." } } });
    navigate("/login");
    renderApp();
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Try the demo account")).toBeNull());
  });
});

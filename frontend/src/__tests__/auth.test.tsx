import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import App from "../App";
import { AuthProvider } from "../lib/auth";
import { LanguageProvider } from "../lib/language";
import { navigate } from "../lib/router";
import { stubFetch } from "./fixtures";

vi.mock("../lib/speech", () => ({ canSpeak: () => false, speak: vi.fn(), stopSpeaking: vi.fn() }));

const ACCOUNT = { id: 1, name: "Asha", email: "asha@example.com" };

function renderApp() {
  return render(
    <AuthProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </AuthProvider>,
  );
}

describe("landing page", () => {
  it("offers sign up, log in, the demo and guest access with no accessibility violations", async () => {
    stubFetch();
    const { container } = renderApp();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Sign up|Create free account/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Watch the 60-second demo/ })).toHaveAttribute("href", "/app?demo=1");
    expect(screen.getAllByRole("link", { name: /Continue as a guest/ })[0]).toHaveAttribute("href", "/app");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("goes straight into the app as a guest", async () => {
    stubFetch();
    renderApp();
    const [guest] = screen.getAllByRole("link", { name: /Continue as a guest/ });
    await userEvent.click(guest as HTMLElement);
    expect(window.location.pathname).toBe("/app");
    expect(await screen.findByText(/NAQI 418, Severe/)).toBeInTheDocument();
    expect(screen.getByText("Guest")).toBeInTheDocument();
  });
});

describe("sign up and log in", () => {
  it("renders an accessible sign-up form", async () => {
    stubFetch();
    navigate("/signup");
    const { container } = renderApp();
    expect(screen.getByRole("heading", { name: /Create your account/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("creates an account and opens the app signed in", async () => {
    const fetchMock = stubFetch({ "/api/auth/signup": { status: 201, body: ACCOUNT } });
    navigate("/signup");
    renderApp();
    await userEvent.type(screen.getByLabelText(/Your name/), "Asha");
    await userEvent.type(screen.getByLabelText(/E-mail/), "asha@example.com");
    await userEvent.type(screen.getByLabelText(/^Password/), "smog-safe-2026");
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));

    expect(await screen.findByText(/Hi, Asha/)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/app");
    const call = fetchMock.mock.calls.find(([url]) => String(url) === "/api/auth/signup");
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      name: "Asha",
      email: "asha@example.com",
      password: "smog-safe-2026",
    });
  });

  it("blocks short passwords before calling the server", async () => {
    const fetchMock = stubFetch();
    navigate("/signup");
    renderApp();
    await userEvent.type(screen.getByLabelText(/Your name/), "Asha");
    await userEvent.type(screen.getByLabelText(/E-mail/), "asha@example.com");
    await userEvent.type(screen.getByLabelText(/^Password/), "short");
    await userEvent.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByText(/at least 8 characters/)).toHaveFocus();
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/auth/signup")).toBe(false);
  });

  it("announces a wrong password and keeps the user on the log-in page", async () => {
    stubFetch({ "/api/auth/login": { status: 401, body: { detail: "E-mail or password is incorrect." } } });
    navigate("/login");
    renderApp();
    await userEvent.type(screen.getByLabelText(/E-mail/), "asha@example.com");
    await userEvent.type(screen.getByLabelText(/^Password/), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: /^Log in$/ }));
    expect(await screen.findByText("E-mail or password is incorrect.")).toHaveFocus();
    expect(window.location.pathname).toBe("/login");
  });

  it("shows and hides the password", async () => {
    stubFetch();
    navigate("/login");
    renderApp();
    const password = screen.getByLabelText(/^Password/);
    expect(password).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
  });

  it("logs out from the app header and returns to the landing page", async () => {
    const fetchMock = stubFetch({ "/api/auth/me": { status: 200, body: ACCOUNT }, "/api/auth/logout": { status: 204 } });
    navigate("/app");
    renderApp();
    await userEvent.click(await screen.findByRole("button", { name: /Log out/ }));
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
  });
});

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallButton } from "../components/InstallButton";

function offerInstall() {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return prompt;
}

describe("InstallButton", () => {
  it("stays hidden until the browser offers to install", () => {
    render(<InstallButton variant="menu" />);
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });

  it("opens the browser's install prompt and then hides", async () => {
    render(<InstallButton variant="menu" />);
    const prompt = offerInstall();
    await userEvent.click(screen.getByRole("button", { name: "Install app" }));
    expect(prompt).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });

  it("shows the Add to Home Screen steps on iPhone", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    render(<InstallButton variant="icon" />);
    const button = screen.getByRole("button", { name: "Install app" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(screen.getByRole("status")).toHaveTextContent("Add to Home Screen");
  });
});

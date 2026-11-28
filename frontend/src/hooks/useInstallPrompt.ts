import { useEffect, useState } from "react";

/** Chrome and Edge's install event; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function standalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Lets the page offer "Install app". `canInstall` is true once the browser says the app can be installed
 * (Android Chrome, desktop Chrome/Edge); `ios` is true on iPhone/iPad Safari, which installs only from the Share menu.
 */
export function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(standalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return {
    installed,
    canInstall: event !== null,
    ios: ios && !installed,
    install: async () => {
      if (!event) return;
      await event.prompt();
      await event.userChoice;
      setEvent(null);
    },
  };
}

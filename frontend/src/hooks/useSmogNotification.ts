import { useCallback, useEffect, useRef, useState } from "react";

type Permission = NotificationPermission | "unsupported";

function currentPermission(): Permission {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
}

/** Browser notifications for smog alerts. Each distinct alert is shown once. */
export function useSmogNotification(alert: { key: string; title: string; body: string } | null) {
  const [permission, setPermission] = useState<Permission>(currentPermission);
  const lastShown = useRef<string | null>(null);

  const request = useCallback(async () => {
    if (permission === "unsupported") return;
    setPermission(await Notification.requestPermission());
  }, [permission]);

  useEffect(() => {
    if (!alert || permission !== "granted" || lastShown.current === alert.key) return;
    lastShown.current = alert.key;
    const options: NotificationOptions = { body: alert.body, tag: "saanssafe-smog", icon: "/favicon.svg" };
    const viaWorker = navigator.serviceWorker?.controller
      ? navigator.serviceWorker.ready.then((reg) => reg.showNotification(alert.title, options))
      : Promise.reject(new Error("no worker"));
    viaWorker.catch(() => new Notification(alert.title, options));
  }, [alert, permission]);

  return { permission, request };
}

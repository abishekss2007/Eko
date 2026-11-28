import { Download, Share } from "lucide-react";
import { useState } from "react";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

interface Props {
  /** "menu" is a full row in the PC sidebar; "icon" is a round header button on phones. */
  variant: "menu" | "icon";
  className?: string;
}

/**
 * "Install app": the browser's install prompt where it offers one (Chrome/Edge on Android and PC), and the
 * Share → Add to Home Screen steps on iPhone and iPad. Hidden once the app is installed or can't be.
 */
export function InstallButton({ variant, className = "" }: Props) {
  const { installed, canInstall, ios, install } = useInstallPrompt();
  const [howTo, setHowTo] = useState(false);
  if (installed || (!canInstall && !ios)) return null;

  const onClick = () => (canInstall ? void install() : setHowTo((open) => !open));
  const menu = variant === "menu";

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={canInstall ? undefined : howTo}
        title="Install app"
        className={
          menu
            ? "flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-base font-semibold text-slate-600 transition hover:bg-slate-900/10 hover:text-slate-950"
            : "btn-ghost !px-2.5"
        }
      >
        <Download aria-hidden="true" size={menu ? 20 : 18} />
        <span className={menu ? "" : "sr-only"}>Install app</span>
      </button>
      {howTo && (
        <p
          role="status"
          className={`card z-40 p-3 text-sm text-slate-900 ${menu ? "mt-2" : "absolute right-0 top-full mt-2 w-56"}`}
        >
          In Safari, tap <Share aria-label="Share" className="inline" size={14} /> Share, then <strong>Add to Home Screen</strong>.
        </p>
      )}
    </div>
  );
}

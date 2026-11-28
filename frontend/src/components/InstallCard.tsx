import { Download, Share } from "lucide-react";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

/** "Add SaansSafe to your home screen": a real install button where the browser allows it, a how-to on iPhone. */
export function InstallCard() {
  const { installed, canInstall, ios, install } = useInstallPrompt();
  if (installed || (!canInstall && !ios)) return null;
  return (
    <section aria-labelledby="install-title" className="card mt-6 flex flex-wrap items-center gap-3 p-4">
      <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
      <div className="min-w-0 flex-1">
        <h2 id="install-title" className="font-semibold text-slate-950">
          Get the SaansSafe app
        </h2>
        <p className="text-sm text-slate-700">
          {canInstall ? (
            "Install it on your phone. It opens full screen and SOS works offline."
          ) : (
            <>
              In Safari, tap <Share aria-label="Share" className="inline" size={14} /> Share, then Add to Home Screen.
            </>
          )}
        </p>
      </div>
      {canInstall && (
        <button type="button" className="btn-primary" onClick={install}>
          <Download aria-hidden="true" size={18} /> Install
        </button>
      )}
    </section>
  );
}

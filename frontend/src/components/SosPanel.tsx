import { Ambulance, Copy, Hospital, Phone, ShieldAlert, Stethoscope } from "lucide-react";
import { useState, type ReactNode } from "react";
import { telHref } from "../lib/household";
import { ReadAloudButton } from "./ReadAloudButton";

interface Props {
  doctorPhone: string;
  hospitalPhone: string;
  ambulance: string;
  emergency: string;
  handoff: string;
  redFlags: string[];
}

function CallLink({ href, icon, label, detail }: { href: string | null; icon: ReactNode; label: string; detail: string }) {
  if (!href) {
    return (
      <p className="flex min-h-[64px] items-center gap-3 rounded-xl border-2 border-dashed border-slate-400 p-3 text-slate-700">
        {icon}
        <span>
          <span className="block font-bold">{label}</span>
          {detail}
        </span>
      </p>
    );
  }
  return (
    <a
      href={href}
      className="flex min-h-[64px] items-center gap-3 rounded-xl bg-red-800 p-3 text-white hover:bg-red-900 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-900"
    >
      {icon}
      <span>
        <span className="block text-lg font-bold">{label}</span>
        {detail}
      </span>
    </a>
  );
}

/** One-tap calls and a script to read to the doctor. Works offline from local data. */
export function SosPanel({ doctorPhone, hospitalPhone, ambulance, emergency, handoff, redFlags }: Props) {
  const [copied, setCopied] = useState("");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(handoff);
      setCopied("Summary copied.");
    } catch {
      setCopied("Copy failed. Please read the summary aloud instead.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <CallLink
          href={telHref(doctorPhone)}
          icon={<Stethoscope aria-hidden="true" size={28} />}
          label="Call family doctor"
          detail={doctorPhone || "Add the number under Family Health Shield"}
        />
        <CallLink
          href={telHref(hospitalPhone)}
          icon={<Hospital aria-hidden="true" size={28} />}
          label="Call hospital"
          detail={hospitalPhone || "Add the number under Family Health Shield"}
        />
        <CallLink
          href={telHref(ambulance)}
          icon={<Ambulance aria-hidden="true" size={28} />}
          label={`${ambulance} Ambulance`}
          detail="Medical emergency"
        />
        <CallLink
          href={telHref(emergency)}
          icon={<Phone aria-hidden="true" size={28} />}
          label={`${emergency} Emergency`}
          detail="National emergency line"
        />
      </div>

      <div className="rounded-xl border-2 border-slate-800 p-4">
        <h3 className="mb-1 text-lg font-bold">30-second doctor handoff</h3>
        <p className="mb-3 text-sm text-slate-700">Read this out when the call connects.</p>
        <p className="mb-3 text-lg">{handoff}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copy} className="btn-secondary">
            <Copy aria-hidden="true" size={18} /> Copy summary
          </button>
          <ReadAloudButton text={handoff} label="Read summary aloud" />
        </div>
        <p role="status" className="mt-2 text-sm">
          {copied}
        </p>
      </div>

      {redFlags.length > 0 && (
        <div className="rounded-xl border-2 border-red-800 bg-red-50 p-4 text-red-950">
          <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
            <ShieldAlert aria-hidden="true" size={22} /> Call now if you see
          </h3>
          <ul className="list-disc space-y-1 pl-6">
            {redFlags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

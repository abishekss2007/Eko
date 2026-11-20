import { BellRing, CheckCircle2, HeartPulse, Sparkles } from "lucide-react";
import { untokenize, type Member } from "../lib/household";
import { RISK_CLASSES, RISK_LABELS, isAlertLevel } from "../lib/naqi";
import type { ShieldResponse } from "../types";
import { ReadAloudButton } from "./ReadAloudButton";

interface Props {
  result: ShieldResponse;
  members: Member[];
  notificationPermission: NotificationPermission | "unsupported";
  onEnableNotifications: () => void;
}

export function ShieldResults({ result, members, notificationPermission, onEnableNotifications }: Props) {
  const name = (text: string) => untokenize(text, members);
  const textById = new Map(result.narrative.member_alerts.map((a) => [a.member_id, a]));
  const atRisk = result.risk.members.filter((m) => isAlertLevel(m.risk_level));

  return (
    <div className="space-y-4">
      {result.risk.should_alert && (
        <div role="alert" className="rounded-xl border-2 border-red-900 bg-red-900 p-4 text-white">
          <p className="flex items-center gap-2 text-lg font-bold">
            <BellRing aria-hidden="true" size={22} /> Smog alert for your family
          </p>
          <p>
            {atRisk.map((m) => `${name(m.member_id)}: ${RISK_LABELS[m.risk_level]}`).join(" · ")}. Follow the
            stay-safe steps below and keep the SOS panel ready.
          </p>
          {notificationPermission === "default" && (
            <button type="button" onClick={onEnableNotifications} className="btn-light mt-3">
              Turn on alert notifications
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-prose text-lg">{name(result.narrative.climate_smog_summary)}</p>
        <ReadAloudButton text={name(result.narrative.climate_smog_summary)} />
      </div>
      <p className="flex items-center gap-1 text-sm text-slate-700">
        <Sparkles aria-hidden="true" size={16} />
        {result.narrative_source === "gemini"
          ? "Explained by Gemini from verified numbers. Every number was checked against our calculations."
          : "Rule-based explanation (AI unavailable or not needed). Risk levels always come from our calculations."}
      </p>

      <ul className="grid gap-4">
        {result.risk.members.map((risk) => {
          const text = textById.get(risk.member_id);
          return (
            <li key={risk.member_id} className="rounded-xl border border-slate-300 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold">{name(risk.member_id)}</h3>
                <span className={`rounded-full border-2 px-3 py-1 text-sm font-bold ${RISK_CLASSES[risk.risk_level]}`}>
                  {RISK_LABELS[risk.risk_level]} risk
                </span>
              </div>
              {text && (
                <>
                  <p className="mb-2">{name(text.impact_reasoning)}</p>
                  <h4 className="font-semibold">Stay safe at home</h4>
                  <ul className="mb-2 space-y-1">
                    {text.stay_safe_steps.map((step) => (
                      <li key={step} className="flex gap-2">
                        <CheckCircle2 aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-emerald-700" />
                        {name(step)}
                      </li>
                    ))}
                  </ul>
                  <p className="flex gap-2 rounded-lg bg-sky-50 p-2 text-sky-950">
                    <HeartPulse aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
                    {name(text.care_plan_reminder)}
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";

export interface DemoStep {
  target: string;
  caption: string;
  seconds: number;
  action?: "simulate" | "speak" | "commute";
}

/** Guided 60-second judge demo. Steps advance on a timer; users can skip or stop. */
export const DEMO_STEPS: DemoStep[] = [
  {
    target: "air",
    caption: "Smog spike: the simulation pushes NAQI to 418 (Severe) and detects cold, still air trapping the smog.",
    seconds: 10,
    action: "simulate",
  },
  {
    target: "today",
    caption: "Today's plan: our rules turn the numbers into one decision for the family. Gemini only words it.",
    seconds: 10,
  },
  {
    target: "shield",
    caption: "Family alert: Dadi has COPD, so she is at emergency risk. Each person gets stay-safe steps and a doctor's-note reminder.",
    seconds: 10,
  },
  {
    target: "sos",
    caption: "One-tap SOS: call 108, 112 or the family doctor, with a 30-second handoff script read aloud.",
    seconds: 12,
    action: "speak",
  },
  {
    target: "commute",
    caption: "Cleaner commute: switching from a solo car to the metro at a cleaner hour cuts inhaled PM2.5 and CO₂.",
    seconds: 10,
    action: "commute",
  },
  {
    target: "top",
    caption: "Every number comes from code with cited sources, and is checked before display. That's SaansSafe.",
    seconds: 8,
  },
];

export function useDemo(autoStart: boolean, onAction: (action: DemoStep["action"]) => void, onEnd: () => void) {
  const [step, setStep] = useState(autoStart ? 0 : -1);
  const actions = useRef(onAction);
  const end = useRef(onEnd);
  useEffect(() => {
    actions.current = onAction;
    end.current = onEnd;
  });

  const stop = useCallback(() => {
    setStep(-1);
    end.current();
  }, []);
  const next = useCallback(() => {
    setStep((s) => {
      if (s + 1 >= DEMO_STEPS.length) {
        end.current();
        return -1;
      }
      return s + 1;
    });
  }, []);
  const start = useCallback(() => setStep(0), []);

  useEffect(() => {
    const current = DEMO_STEPS[step];
    if (!current) return;
    actions.current(current.action);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const scroll = window.setTimeout(() => {
      document.getElementById(current.target)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }, 400);
    const timer = window.setTimeout(next, current.seconds * 1000);
    return () => {
      window.clearTimeout(scroll);
      window.clearTimeout(timer);
    };
  }, [step, next]);

  return { step, active: step >= 0, current: DEMO_STEPS[step] ?? null, start, next, stop };
}

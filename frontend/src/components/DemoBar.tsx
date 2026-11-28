import { Pause, SkipForward } from "lucide-react";
import { DEMO_STEPS, type DemoStep } from "../hooks/useDemo";

interface Props {
  step: number;
  current: DemoStep;
  onNext: () => void;
  onStop: () => void;
}

/** Caption bar for the guided demo. Announced politely to screen readers. */
export function DemoBar({ step, current, onNext, onStop }: Props) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-4 border-amber-400 bg-ink-950/95 text-snow shadow-2xl backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <p className="text-sm font-bold text-sun" aria-hidden="true">
          Demo {step + 1}/{DEMO_STEPS.length}
        </p>
        <p role="status" className="min-w-0 flex-1 text-lg">
          <span className="sr-only">
            Demo step {step + 1} of {DEMO_STEPS.length}:{" "}
          </span>
          {current.caption}
        </p>
        <button type="button" onClick={onNext} className="btn-light">
          <SkipForward aria-hidden="true" size={18} /> Next
        </button>
        <button type="button" onClick={onStop} className="btn-light">
          <Pause aria-hidden="true" size={18} /> Stop demo
        </button>
      </div>
    </div>
  );
}

import { Copy, Megaphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { fetchCivic } from "../lib/api";
import { pretty } from "../lib/format";
import type { CivicRequest, CivicResponse } from "../types";
import { Field, SourceNote } from "./Field";

interface Props {
  context: Pick<CivicRequest, "latitude" | "longitude" | "simulate" | "language">;
}

/** Drafts a note for the RWA or the ward office. Text only: the family sends it themselves. */
export function CivicDrafter({ context }: Props) {
  const [kind, setKind] = useState<CivicRequest["kind"]>("rwa_advisory");
  const [locality, setLocality] = useState("");
  const [observation, setObservation] = useState("");
  const [result, setResult] = useState<CivicResponse | null>(null);
  const [status, setStatus] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("Drafting…");
    try {
      setResult(await fetchCivic({ ...context, kind, locality, observation }));
      setStatus("Draft ready. Review it before sending.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not draft the note.");
    }
  };

  const text = result ? pretty(`${result.draft.subject}\n\n${result.draft.body}`) : "";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={submit} className="space-y-3">
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">What do you want to send?</legend>
          {(
            [
              ["rwa_advisory", "Clean-air request to our RWA"],
              ["burning_report", "Open-burning complaint to the ward office"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-[44px] items-center gap-2">
              <input type="radio" name="civic-kind" className="h-5 w-5" checked={kind === value} onChange={() => setKind(value)} />
              {label}
            </label>
          ))}
        </fieldset>
        <Field id="locality" label="Locality or society (optional)">
          <input id="locality" className="input" maxLength={60} value={locality} onChange={(e) => setLocality(e.target.value)} />
        </Field>
        <Field id="observation" label="What have you seen? (optional)" hint={`${observation.length}/300. Don't include names or phone numbers.`}>
          <textarea
            id="observation"
            className="input min-h-[5rem]"
            maxLength={300}
            aria-describedby="observation-hint"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
          />
        </Field>
        <button type="submit" className="btn-primary">
          <Megaphone aria-hidden="true" size={18} /> Draft the note
        </button>
        <p role="status" className="text-sm">
          {status}
        </p>
      </form>
      <div aria-live="polite">
        {result && (
          <div className="space-y-3 rounded-xl border border-slate-300 p-4">
            <p className="font-bold">{pretty(result.draft.subject)}</p>
            <p className="whitespace-pre-line">{pretty(result.draft.body)}</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                navigator.clipboard.writeText(text).then(
                  () => setStatus("Draft copied."),
                  () => setStatus("Copy failed; select the text instead."),
                )
              }
            >
              <Copy aria-hidden="true" size={18} /> Copy draft
            </button>
            <SourceNote source={result.narrative_source} />
          </div>
        )}
      </div>
    </div>
  );
}

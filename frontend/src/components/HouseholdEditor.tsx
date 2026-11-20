import { Lock, Plus, Trash2 } from "lucide-react";
import {
  AGE_GROUPS,
  CARE_NOTE_MAX,
  MAX_MEMBERS,
  SENSITIVITIES,
  newMember,
  type Household,
  type Member,
} from "../lib/household";
import type { Sensitivity } from "../types";

interface Props {
  household: Household;
  onChange: (next: Household) => void;
}

function MemberFields({
  member,
  index,
  onChange,
  onRemove,
}: {
  member: Member;
  index: number;
  onChange: (m: Member) => void;
  onRemove: () => void;
}) {
  const base = `member-${member.id}`;
  const toggle = (s: Sensitivity) =>
    onChange({
      ...member,
      sensitivities: member.sensitivities.includes(s)
        ? member.sensitivities.filter((x) => x !== s)
        : [...member.sensitivities, s],
    });

  return (
    <fieldset className="space-y-3 rounded-xl border border-slate-300 p-4">
      <legend className="px-1 font-bold">Family member {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${base}-name`} className="mb-1 block text-sm font-semibold">
            Name (stays on this device)
          </label>
          <input
            id={`${base}-name`}
            className="input"
            value={member.name}
            maxLength={40}
            autoComplete="off"
            onChange={(e) => onChange({ ...member, name: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`${base}-age`} className="mb-1 block text-sm font-semibold">
            Age group
          </label>
          <select
            id={`${base}-age`}
            className="input"
            value={member.ageGroup}
            onChange={(e) => onChange({ ...member, ageGroup: e.target.value as Member["ageGroup"] })}
          >
            {AGE_GROUPS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Health conditions</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {SENSITIVITIES.map((s) => (
            <label key={s.value} className="flex min-h-[44px] items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={member.sensitivities.includes(s.value)}
                onChange={() => toggle(s.value)}
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${base}-note`} className="mb-1 block text-sm font-semibold">
          Doctor&apos;s care note (optional)
        </label>
        <textarea
          id={`${base}-note`}
          className="input min-h-[4.5rem]"
          value={member.careNote}
          maxLength={CARE_NOTE_MAX}
          aria-describedby={`${base}-note-help`}
          placeholder="e.g. Avoid cold morning air; keep rescue inhaler in bag"
          onChange={(e) => onChange({ ...member, careNote: e.target.value })}
        />
        <p id={`${base}-note-help`} className="text-sm text-slate-700">
          {member.careNote.length}/{CARE_NOTE_MAX} characters. Phone numbers are removed before sending.
        </p>
      </div>
      <button type="button" onClick={onRemove} className="btn-secondary">
        <Trash2 aria-hidden="true" size={18} /> Remove {member.name || `member ${index + 1}`}
      </button>
    </fieldset>
  );
}

export function HouseholdEditor({ household, onChange }: Props) {
  const { members } = household;
  const setMember = (i: number, m: Member) => onChange({ ...household, members: members.map((x, j) => (j === i ? m : x)) });

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-sm">
        <Lock aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
        Names, notes and phone numbers are saved only in this browser. The server receives age group,
        conditions and the care note under a code such as Member_1, never names or numbers.
      </p>
      {members.map((m, i) => (
        <MemberFields
          key={m.id}
          member={m}
          index={i}
          onChange={(next) => setMember(i, next)}
          onRemove={() => onChange({ ...household, members: members.filter((_, j) => j !== i) })}
        />
      ))}
      <button
        type="button"
        className="btn-primary"
        disabled={members.length >= MAX_MEMBERS}
        onClick={() => onChange({ ...household, members: [...members, newMember(members.length)] })}
      >
        <Plus aria-hidden="true" size={18} /> Add family member
      </button>

      <fieldset className="grid gap-3 rounded-xl border border-slate-300 p-4 sm:grid-cols-2">
        <legend className="px-1 font-bold">Emergency contacts (stay on this device)</legend>
        <div>
          <label htmlFor="doctor-phone" className="mb-1 block text-sm font-semibold">
            Family doctor phone
          </label>
          <input
            id="doctor-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={20}
            className="input"
            value={household.doctorPhone}
            onChange={(e) => onChange({ ...household, doctorPhone: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="hospital-phone" className="mb-1 block text-sm font-semibold">
            Preferred hospital phone
          </label>
          <input
            id="hospital-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={20}
            className="input"
            value={household.hospitalPhone}
            onChange={(e) => onChange({ ...household, hospitalPhone: e.target.value })}
          />
        </div>
      </fieldset>
    </div>
  );
}

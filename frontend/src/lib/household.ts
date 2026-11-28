import type { AgeGroup, HouseholdDto, MemberPayload, Sensitivity } from "../types";

/** Saved to the signed-in account. Sent to the Shield and the AI only as Member_N codes. */
export interface Member {
  id: string;
  name: string;
  ageGroup: AgeGroup;
  sensitivities: Sensitivity[];
  careNote: string;
}

export interface Household {
  members: Member[];
  doctorPhone: string;
  hospitalPhone: string;
}

export const AGE_GROUPS: { value: AgeGroup; label: string }[] = [
  { value: "infant", label: "Infant (under 2)" },
  { value: "child", label: "Child (2-12)" },
  { value: "adult", label: "Adult" },
  { value: "senior", label: "Senior (60+)" },
];

export const SENSITIVITIES: { value: Sensitivity; label: string }[] = [
  { value: "asthma", label: "Asthma" },
  { value: "copd", label: "COPD" },
  { value: "heart_disease", label: "Heart disease" },
  { value: "pregnancy", label: "Pregnancy" },
  { value: "diabetes", label: "Diabetes" },
];

export const MAX_MEMBERS = 10;
export const CARE_NOTE_MAX = 200;
export const EMPTY_HOUSEHOLD: Household = { members: [], doctorPhone: "", hospitalPhone: "" };

const PHONE = /\+?\d[\d\s().-]{6,}\d/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const TOKEN = /Member_(\d{1,2})/g;

export function newMember(index: number): Member {
  return {
    id: crypto.randomUUID(),
    name: `Family member ${index + 1}`,
    ageGroup: "adult",
    sensitivities: [],
    careNote: "",
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace real names with Member_N tokens and strip phone numbers and e-mails,
 * so nothing identifying leaves the device. The server re-checks this.
 */
export function tokenize(members: Member[]): MemberPayload[] {
  const names = members
    .map((m, i) => ({ name: m.name.trim(), token: `Member_${i + 1}` }))
    .filter((n) => n.name.length >= 2)
    .sort((a, b) => b.name.length - a.name.length);
  return members.map((m, i) => {
    let note = m.careNote.replace(EMAIL, "[contact removed]").replace(PHONE, "[number removed]");
    for (const { name, token } of names) {
      note = note.replace(new RegExp(escapeRegExp(name), "gi"), token);
    }
    return {
      member_id: `Member_${i + 1}`,
      age_group: m.ageGroup,
      sensitivities: m.sensitivities,
      care_note: note.slice(0, CARE_NOTE_MAX),
    };
  });
}

/** Map Member_N tokens in server text back to the family's own names. */
export function untokenize(text: string, members: Member[]): string {
  return text.replace(TOKEN, (match, n: string) => members[Number(n) - 1]?.name || match);
}

function isMember(value: unknown): value is Member {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.name === "string" &&
    AGE_GROUPS.some((a) => a.value === m.ageGroup) &&
    Array.isArray(m.sensitivities) &&
    m.sensitivities.every((s) => SENSITIVITIES.some((x) => x.value === s)) &&
    typeof m.careNote === "string"
  );
}

/** Validate untrusted localStorage content; fall back to an empty household. */
export function parseHousehold(raw: unknown): Household {
  if (typeof raw !== "object" || raw === null) return EMPTY_HOUSEHOLD;
  const h = raw as Record<string, unknown>;
  const members = Array.isArray(h.members) ? h.members.filter(isMember).slice(0, MAX_MEMBERS) : [];
  return {
    members,
    doctorPhone: typeof h.doctorPhone === "string" ? h.doctorPhone.slice(0, 20) : "",
    hospitalPhone: typeof h.hospitalPhone === "string" ? h.hospitalPhone.slice(0, 20) : "",
  };
}

/** Digits and a leading + only, safe for a tel: link. Empty if implausible. */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return /^\+?\d{3,15}$/.test(digits) ? `tel:${digits}` : null;
}

/** Server shape ↔ app shape. The server re-validates everything it receives. */
export function toDto(h: Household): HouseholdDto {
  return {
    members: h.members.map((m) => ({
      id: m.id,
      name: m.name,
      age_group: m.ageGroup,
      sensitivities: m.sensitivities,
      care_note: m.careNote,
    })),
    doctor_phone: h.doctorPhone,
    hospital_phone: h.hospitalPhone,
  };
}

export function fromDto(dto: HouseholdDto): Household {
  return parseHousehold({
    members: dto.members.map((m) => ({
      id: m.id,
      name: m.name,
      ageGroup: m.age_group,
      sensitivities: m.sensitivities,
      careNote: m.care_note,
    })),
    doctorPhone: dto.doctor_phone,
    hospitalPhone: dto.hospital_phone,
  });
}

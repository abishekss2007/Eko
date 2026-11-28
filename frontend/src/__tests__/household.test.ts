import { parseHousehold, telHref, tokenize, untokenize, type Member } from "../lib/household";

const members: Member[] = [
  { id: "a", name: "Asha", ageGroup: "senior", sensitivities: ["copd"], careNote: "Asha must call 98765 43210 or dr@x.in" },
  { id: "b", name: "Ravi", ageGroup: "child", sensitivities: [], careNote: "" },
];

describe("tokenize", () => {
  it("replaces names with tokens and strips phone numbers and e-mails", () => {
    const payload = tokenize(members);
    expect(payload.map((m) => m.member_id)).toEqual(["Member_1", "Member_2"]);
    const json = JSON.stringify(payload);
    expect(json).not.toContain("Asha");
    expect(json).not.toContain("Ravi");
    expect(json).not.toContain("98765");
    expect(json).not.toContain("dr@x.in");
    expect(payload[0]?.care_note).toContain("Member_1 must call [number removed]");
  });

  it("maps tokens back to names", () => {
    expect(untokenize("Member_1 and Member_2, not Member_9", members)).toBe("Asha and Ravi, not Member_9");
  });
});

describe("parseHousehold", () => {
  it("drops invalid stored data", () => {
    expect(parseHousehold("junk").members).toEqual([]);
    const parsed = parseHousehold({
      members: [members[0], { name: "x", ageGroup: "teen" }],
      doctorPhone: 123,
      hospitalPhone: "011-2345",
    });
    expect(parsed.members).toHaveLength(1);
    expect(parsed.doctorPhone).toBe("");
    expect(parsed.hospitalPhone).toBe("011-2345");
  });
});

describe("telHref", () => {
  it("keeps only digits and a leading plus", () => {
    expect(telHref("+91 98765-43210")).toBe("tel:+919876543210");
    expect(telHref("108")).toBe("tel:108");
    expect(telHref("javascript:alert(1)")).toBeNull();
    expect(telHref("")).toBeNull();
  });
});

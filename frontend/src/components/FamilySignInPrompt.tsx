import { LogIn, UserPlus, UsersRound } from "lucide-react";
import { Link } from "../lib/router";

/** Shown to guests in place of the family editor: adding family members needs an account. */
export function FamilySignInPrompt() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/60 p-5">
      <p className="mb-2 flex items-center gap-2 text-lg font-bold text-slate-900">
        <UsersRound aria-hidden="true" size={22} className="shrink-0 text-brand-700" />
        Sign in to add your family
      </p>
      <p className="mb-4 text-slate-700">
        You are browsing as a guest. Create a free account or log in to add family members, save their health
        conditions and emergency contacts, and get personal smog alerts for each of them.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/signup?next=family" className="btn-primary">
          <UserPlus aria-hidden="true" size={18} /> Create free account
        </Link>
        <Link href="/login?next=family" className="btn-secondary">
          <LogIn aria-hidden="true" size={18} /> Log in
        </Link>
      </div>
      <p className="mt-3 text-sm text-slate-700">
        Just looking? The log-in page has a demo account with a sample family.
      </p>
    </div>
  );
}

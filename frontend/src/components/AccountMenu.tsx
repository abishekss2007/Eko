import { LogIn, LogOut, UserRound } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Link, navigate } from "../lib/router";

/** Header account area: who is signed in, or a way to sign in for guests. */
export function AccountMenu() {
  const { user, logout } = useAuth();
  if (user === undefined) return null;
  if (!user) {
    return (
      <>
        <span className="text-sm text-slate-200">Guest</span>
        <Link href="/login" className="btn-light">
          <LogIn aria-hidden="true" size={18} /> Log in
        </Link>
      </>
    );
  }
  return (
    <>
      <span className="inline-flex items-center gap-1 text-sm text-slate-100">
        <UserRound aria-hidden="true" size={16} /> Hi, {user.name}
      </span>
      <button
        type="button"
        className="btn-light"
        onClick={async () => {
          await logout();
          navigate("/");
        }}
      >
        <LogOut aria-hidden="true" size={18} /> Log out
      </button>
    </>
  );
}

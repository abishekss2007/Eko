import { LogIn, LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Link, navigate } from "../lib/router";

/** Header account area: who is signed in, or a way to sign in for guests. Icon-only on small screens. */
export function AccountMenu() {
  const { user, logout } = useAuth();
  if (user === undefined) return null;
  if (!user) {
    return (
      <Link href="/login" className="btn-ghost !px-3" title="Log in">
        <LogIn aria-hidden="true" size={18} />
        <span className="sr-only md:not-sr-only">Log in</span>
        <span className="sr-only"> (browsing as a guest)</span>
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <span className="hidden items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-1 pr-3 text-sm font-medium text-slate-800 md:inline-flex">
        <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-teal-700 text-xs font-bold text-white">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        Hi, {user.name}
      </span>
      <button
        type="button"
        className="btn-ghost !px-3"
        title="Log out"
        onClick={async () => {
          await logout();
          navigate("/");
        }}
      >
        <LogOut aria-hidden="true" size={18} />
        <span className="sr-only">Log out</span>
      </button>
    </div>
  );
}

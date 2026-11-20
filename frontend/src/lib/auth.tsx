import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchMe, logIn, logOut, signUp, type Account } from "./api";

interface AuthState {
  /** undefined while checking the session cookie, null when signed out. */
  user: Account | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  login: async () => {},
  signup: async () => {},
  logout: async () => {},
});

/** The session is an HttpOnly cookie, so the browser can't read it; we ask /api/auth/me. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    fetchMe().then(
      (me) => live && setUser(me),
      () => live && setUser(null),
    );
    return () => {
      live = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => setUser(await logIn({ email, password })), []);
  const signup = useCallback(
    async (name: string, email: string, password: string) => setUser(await signUp({ name, email, password })),
    [],
  );
  const logout = useCallback(async () => {
    await logOut().catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, signup, logout }), [user, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

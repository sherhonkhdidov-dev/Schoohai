import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { meFn } from "./api";
import { ApiErr, call } from "./errors";
import type { TKey } from "./i18n";

export type Me = {
  id: string; role: "student" | "teacher" | "parent"; fullName: string; phone: string; school: string | null; cls: string | null; code: string; coins: number; subject: string | null;
  teacher: { name: string; subject: string | null; code: string } | null;
  child: { name: string; code: string; school: string | null; cls: string | null } | null;
};

type Ctx = { token: string; me: Me; refresh: () => Promise<void>; replaceToken: (token: string) => Promise<void>; logout: () => void };
const AuthCtx = createContext<Ctx | null>(null);
export const useAuth = () => { const c = useContext(AuthCtx); if (!c) throw new Error("no auth"); return c; };

const KEY = "zumrad-token";
type State = { status: "loading" } | { status: "anon" } | { status: "error"; code: string } | { status: "ready"; token: string; me: Me };

const Gate = createContext<{ login: (token: string) => void } | null>(null);
export const useLogin = () => { const c = useContext(Gate); if (!c) throw new Error("no gate"); return c.login; };

export function AuthProvider({ children, anon, loading, failed }: { children: ReactNode; anon: ReactNode; loading: ReactNode; failed: (code: string, retry: () => void) => ReactNode }) {
  const [st, setSt] = useState<State>({ status: "loading" });
  const load = useCallback(async (token: string | null) => {
    if (!token) return setSt({ status: "anon" });
    try {
      const me = (await call(meFn({ data: { token } }))) as Me;
      localStorage.setItem(KEY, token);
      setSt({ status: "ready", token, me });
    } catch (e) {
      const code = e instanceof ApiErr ? e.code : "server";
      if (code === "unauthorized") { localStorage.removeItem(KEY); setSt({ status: "anon" }); }
      else setSt({ status: "error", code });
    }
  }, []);
  useEffect(() => { void load(localStorage.getItem(KEY)); }, [load]);
  const logout = useCallback(() => { localStorage.removeItem(KEY); setSt({ status: "anon" }); }, []);

  if (st.status === "loading") return <>{loading}</>;
  if (st.status === "error") return <>{failed(st.code, () => { setSt({ status: "loading" }); void load(localStorage.getItem(KEY)); })}</>;
  if (st.status === "anon") return <Gate.Provider value={{ login: (t) => { setSt({ status: "loading" }); void load(t); } }}>{anon}</Gate.Provider>;
  const { token, me } = st;
  return <AuthCtx.Provider value={{ token, me, refresh: () => load(token), replaceToken: (t) => load(t), logout }}>{children}</AuthCtx.Provider>;
}

/** Load data from the server for the signed-in user. A rejected session logs the user out. */
export function useServer<T>(fn: (token: string) => Promise<T>, deps: unknown[] = []) {
  const { token, logout } = useAuth();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn(token)
      .then((d) => { if (live) { setData(d); setError(undefined); } })
      .catch((e) => { const c = e instanceof ApiErr ? e.code : "server"; if (c === "unauthorized") logout(); else if (live) setError(c); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, n, ...deps]);
  return { data, loading, error, reload: () => setN((x) => x + 1) };
}

const MAP: Record<string, TKey> = {
  not_configured: "errNotConfigured", rate_limited: "errRate", ai_busy: "aiBusy", unauthorized: "errUnauthorized", invalid: "errInvalid", locked: "errLocked",
  pending: "verdictReview", rejected: "verdictRejected", bad_code: "errBadCode", pin_taken: "errPinTaken", ai_blocked: "errAiBlocked",
  not_enough: "notEnough", conflict: "errConflict", bad_file: "errBadFile", bad_video: "errBadFile", bad_pin: "errBadPin", pin_same: "errPinSame",
};
export const codeKey = (code: string): TKey => MAP[code] ?? "aiUnavailable";
export const errKey = (e: unknown): TKey => codeKey(e instanceof ApiErr ? e.code : "server");

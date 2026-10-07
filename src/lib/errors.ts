export class AppError extends Error {
  constructor(public code: string) { super(code); }
}
export class ConfigError extends Error {}
export type Res<T> = { ok: true; data: T } | { ok: false; error: string };
export async function run<T>(f: () => Promise<T>): Promise<Res<T>> {
  try {
    return { ok: true, data: await f() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.code };
    console.error("[api]", e);
    return { ok: false, error: e instanceof ConfigError ? "not_configured" : "server" };
  }
}
export class ApiErr extends Error { constructor(public code: string) { super(code); } }
export async function call<T>(p: Promise<Res<T>>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new ApiErr(r.error);
  return r.data;
}

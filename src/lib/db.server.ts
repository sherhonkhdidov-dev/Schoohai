/** SERVER-ONLY. Supabase access via REST with the service_role key (never sent to the browser). */
import { AppError, ConfigError } from "./errors";

export function env(name: string): string | undefined {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env?.[name];
}

function cfg() {
  const base = env("SUPABASE_URL")?.replace(/\/$/, ""), key = env("SUPABASE_SERVICE_KEY");
  if (!base || !key) throw new ConfigError("SUPABASE_URL / SUPABASE_SERVICE_KEY not set");
  return { base, key };
}

export const eq = (v: string | number | boolean) => `eq.${v}`;
export const inList = (ids: string[]) => `in.(${ids.join(",")})`;

export async function rest<T = any>(table: string, o: { method?: "GET" | "POST" | "PATCH" | "DELETE"; q?: Record<string, string>; body?: unknown; prefer?: string } = {}): Promise<T> {
  const { base, key } = cfg();
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(o.q ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: o.method ?? "GET",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: o.prefer ?? "return=representation" },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 409 || text.includes("23505")) throw new AppError("conflict");
    throw new Error(`db ${res.status}: ${text.slice(0, 300)}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const select = <T = any>(table: string, q: Record<string, string>) => rest<T[]>(table, { q });
export async function one<T = any>(table: string, q: Record<string, string>): Promise<T | null> {
  return (await rest<T[]>(table, { q: { ...q, limit: "1" } }))[0] ?? null;
}
export async function insert<T = any>(table: string, row: Record<string, unknown>): Promise<T> {
  return (await rest<T[]>(table, { method: "POST", body: row }))[0]!;
}
export const patch = <T = any>(table: string, q: Record<string, string>, body: Record<string, unknown>) => rest<T[]>(table, { method: "PATCH", q, body });

/* ---- PIN hashing (PBKDF2, 100k iterations: the Cloudflare Workers maximum) ---- */
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...(b instanceof Uint8Array ? b : new Uint8Array(b))].map((x) => x.toString(16).padStart(2, "0")).join("");
export const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
export async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100_000 }, key, 256));
}
export async function sha256(s: string) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }

const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const genCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => ALPHA[b % ALPHA.length]).join("");

/* ---- sessions: HMAC-signed token ---- */
const b64u = (buf: ArrayBuffer | Uint8Array) => { const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ""; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function hmacKey() {
  const secret = env("SESSION_SECRET");
  if (!secret || secret.length < 24) throw new ConfigError("SESSION_SECRET must be set (24+ chars)");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signToken(uid: string, days = 30) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64u(enc.encode(JSON.stringify({ uid, iat: now, exp: now + days * 86400 })));
  return `${body}.${b64u(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)))}`;
}
async function verifyToken(token: string): Promise<string | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(), fromB64u(sig), enc.encode(body)))) return null;
    const c = JSON.parse(new TextDecoder().decode(fromB64u(body))) as { uid: string; exp: number };
    return c.exp > Math.floor(Date.now() / 1000) ? c.uid : null;
  } catch { return null; }
}

export type UserRow = {
  id: string; role: "student" | "teacher" | "parent"; full_name: string; phone: string; age: number | null; school: string | null;
  class_label: string | null; father_name: string | null; subject: string | null; code: string; teacher_id: string | null;
  child_id: string | null; status: "approved" | "pending" | "rejected"; coins: number;
};
const COLS = "id,role,full_name,phone,age,school,class_label,father_name,subject,code,teacher_id,child_id,status,coins";

export async function auth(token: string, role?: UserRow["role"]): Promise<UserRow> {
  const uid = await verifyToken(token);
  if (!uid) throw new AppError("unauthorized");
  const u = await one<UserRow>("users", { select: COLS, id: eq(uid) });
  if (!u || u.status !== "approved") throw new AppError("unauthorized");
  if (role && u.role !== role) throw new AppError("forbidden");
  return u;
}
export const userCols = COLS;

/* ---- time helpers: school days follow Asia/Tashkent (UTC+5) ---- */
const TZ = 5 * 3600_000;
export const dayKey = (t: number | string) => new Date(new Date(t).getTime() + TZ).toISOString().slice(0, 10);
export const dayStartIso = (t = Date.now()) => new Date(Math.floor((t + TZ) / 86400_000) * 86400_000 - TZ).toISOString();
export function weekKey(t = Date.now()) {
  const d = new Date(t + TZ); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = d.getUTCFullYear(); const w = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86400_000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

/* ---- Storage (private bucket "videos") ---- */
export async function uploadMedia(path: string, bytes: ArrayBuffer, contentType: string) {
  const { base, key } = cfg();
  const res = await fetch(`${base}/storage/v1/object/videos/${path}`, { method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": contentType, "x-upsert": "true" }, body: bytes });
  if (!res.ok) throw new Error(`storage ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
export async function signedMediaUrl(path: string) {
  const { base, key } = cfg();
  const res = await fetch(`${base}/storage/v1/object/sign/videos/${path}`, { method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }) });
  if (!res.ok) throw new Error(`storage sign ${res.status}`);
  const { signedURL } = (await res.json()) as { signedURL: string };
  return signedURL.startsWith("http") ? signedURL : `${base}${signedURL.startsWith("/storage/v1") ? "" : "/storage/v1"}${signedURL}`;
}

/* ---- login throttle (4-6 digit PINs are brute-forceable without it) ---- */
export async function assertNotLocked(phone: string) {
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const rows = await select("login_attempts", { select: "id", phone: eq(phone), at: `gte.${since}`, limit: "10" });
  if (rows.length >= 8) throw new AppError("locked");
}
export const recordFailure = (phone: string) => insert("login_attempts", { phone });

/* ---- in-app notifications (never allowed to break the action that triggered them) ---- */
export async function notify(userIds: (string | null | undefined)[], kind: string, meta: Record<string, unknown> = {}) {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return;
  try {
    await rest("notifications", { method: "POST", body: ids.map((user_id) => ({ user_id, kind, meta })), prefer: "return=minimal" });
  } catch (e) { console.error("[notify]", e); }
}
export async function parentIdsOf(studentIds: string[]): Promise<string[]> {
  if (!studentIds.length) return [];
  const rows = await select<{ id: string }>("users", { select: "id", role: eq("parent"), child_id: inList(studentIds), status: eq("approved") });
  return rows.map((r) => r.id);
}

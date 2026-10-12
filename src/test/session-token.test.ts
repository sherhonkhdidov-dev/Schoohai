// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { auth, hashPin, newSalt, signToken } from "../lib/db.server";

// A tiny in-memory stand-in for Supabase REST: only GET /rest/v1/users?id=eq.<id>.
type Row = Record<string, unknown>;
let users: Record<string, Row> = {};

const salt = newSalt();
const baseUser = async (pin: string, over: Row = {}): Promise<Row> => ({
  id: "11111111-1111-1111-1111-111111111111", role: "student", full_name: "Test User", phone: "+998901234567", age: 10, school: "1", class_label: "5A",
  father_name: null, subject: null, code: "ABC234", teacher_id: null, child_id: null, status: "approved", coins: 0,
  pin_salt: salt, pin_hash: await hashPin(pin, salt), ...over,
});

beforeEach(async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "sb_secret_test";
  process.env.SESSION_SECRET = "x".repeat(40);
  users = { u1: await baseUser("123456") };
  users.u1!.id = "u1";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
    const row = users[id];
    return new Response(JSON.stringify(row ? [row] : []), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});

describe("session tokens are bound to the PIN", () => {
  it("accepts a fresh token and never leaks the pin hash", async () => {
    const u = await auth(await signToken("u1"));
    expect(u.id).toBe("u1");
    expect("pin_hash" in u).toBe(false);
  });

  it("rejects an old token once the PIN has changed, accepts a new one", async () => {
    const old = await signToken("u1");
    const s2 = newSalt();
    users.u1!.pin_salt = s2;
    users.u1!.pin_hash = await hashPin("654321", s2);
    await expect(auth(old)).rejects.toThrow("unauthorized");
    expect((await auth(await signToken("u1"))).id).toBe("u1");
  });

  it("rejects tampered tokens and tokens without a PIN binding", async () => {
    const tok = await signToken("u1");
    await expect(auth(tok.slice(0, -2) + "xx")).rejects.toThrow("unauthorized");
    const enc = new TextEncoder();
    const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
    const body = b64u(enc.encode(JSON.stringify({ uid: "u1", iat: 1, exp: Math.floor(Date.now() / 1000) + 3600 })));
    const key = await crypto.subtle.importKey("raw", enc.encode(process.env.SESSION_SECRET!), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))));
    await expect(auth(`${body}.${sig}`)).rejects.toThrow("unauthorized");
  });

  it("rejects accounts that are not approved", async () => {
    const tok = await signToken("u1");
    users.u1!.status = "pending";
    await expect(auth(tok)).rejects.toThrow("unauthorized");
  });

  it("enforces the required role", async () => {
    await expect(auth(await signToken("u1"), "teacher")).rejects.toThrow("forbidden");
  });
});

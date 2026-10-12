import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AppError, run } from "./errors";
import { MENU, SHOP } from "./catalog";
import type { HistoryData, HomeworkResult } from "./types";

type D = typeof import("./db.server");

const token = z.string().min(20).max(1500);
const lang = z.enum(["ru", "en", "uz", "tj"]);
const image = z.object({ mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().min(100).max(7_000_000) });
const phone = z.string().min(7).max(24).transform((s) => s.replace(/[^\d+]/g, "")).refine((s) => s.length >= 7, "phone");
const pin = z.string().regex(/^\d{6}$/);
const code = z.string().length(6).transform((s) => s.toUpperCase());
const head = z.object({ headB64: z.string().max(200_000), size: z.number().int().nonnegative(), type: z.string().max(60) });

/* ---------------- helpers ---------------- */
async function assertPinFree(d: D, ph: string, p: string) {
  const rows = await d.select<{ pin_hash: string; pin_salt: string }>("users", { select: "pin_hash,pin_salt", phone: d.eq(ph), status: "neq.rejected" });
  for (const r of rows) if ((await d.hashPin(p, r.pin_salt)) === r.pin_hash) throw new AppError("pin_taken");
}
async function createUser(d: D, ph: string, p: string, fields: Record<string, unknown>): Promise<string> {
  const salt = d.newSalt(), pin_hash = await d.hashPin(p, salt);
  for (let i = 0; i < 6; i++) {
    try {
      const u = await d.insert<{ id: string }>("users", { ...fields, phone: ph, pin_hash, pin_salt: salt, code: d.genCode() });
      return u.id;
    } catch (e) { if (!(e instanceof AppError && e.code === "conflict")) throw e; }
  }
  throw new Error("could not allocate user code");
}
async function addCoins(d: D, id: string, delta: number): Promise<number> {
  for (let i = 0; i < 4; i++) {
    const cur = (await d.one<{ coins: number }>("users", { select: "coins", id: d.eq(id) }))!.coins;
    if (cur + delta < 0) throw new AppError("not_enough");
    const rows = await d.patch<{ coins: number }>("users", { id: d.eq(id), coins: d.eq(cur) }, { coins: cur + delta });
    if (rows.length) return rows[0]!.coins;
  }
  throw new AppError("busy");
}
async function childOf(d: D, u: import("./db.server").UserRow) {
  if (u.role === "student") return u;
  if (u.role !== "parent" || !u.child_id) throw new AppError("forbidden");
  const c = await d.one<import("./db.server").UserRow>("users", { select: d.userCols, id: d.eq(u.child_id) });
  if (!c) throw new AppError("forbidden");
  return c;
}
async function teacherIdOf(d: D, u: import("./db.server").UserRow) {
  if (u.role === "teacher") return u.id;
  return (await childOf(d, u)).teacher_id;
}
const maskPhone = (p: string) => (p.length > 6 ? `${p.slice(0, 4)}${"•".repeat(p.length - 6)}${p.slice(-2)}` : p);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const studentsOf = (d: D, teacherId: string) => d.select<{ id: string; full_name: string; class_label: string | null }>("users", { select: "id,full_name,class_label", teacher_id: d.eq(teacherId), role: d.eq("student") });

/* ---------------- auth ---------------- */
export const registerStudentFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ fullName: z.string().min(3).max(100), father: z.string().min(2).max(60), age: z.coerce.number().int().min(5).max(20), school: z.string().min(1).max(120), cls: z.string().min(1).max(20), phone, phoneOwner: z.enum(["self", "parent"]), pin, teacherCode: code }))
  .handler(({ data }) => run(async () => {
    const d = await import("./db.server");
    const t = await d.one<{ id: string }>("users", { select: "id", code: d.eq(data.teacherCode), role: d.eq("teacher"), status: d.eq("approved") });
    if (!t) throw new AppError("bad_code");
    await assertPinFree(d, data.phone, data.pin);
    const id = await createUser(d, data.phone, data.pin, { role: "student", full_name: data.fullName, father_name: data.father, age: data.age, school: data.school, class_label: data.cls, teacher_id: t.id });
    return { token: await d.signToken(id) };
  }));

export const registerParentFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ fullName: z.string().min(3).max(100), phone, pin, childCode: code }))
  .handler(({ data }) => run(async () => {
    const d = await import("./db.server");
    const c = await d.one<{ id: string; school: string | null }>("users", { select: "id,school", code: d.eq(data.childCode), role: d.eq("student") });
    if (!c) throw new AppError("bad_code");
    await assertPinFree(d, data.phone, data.pin);
    const id = await createUser(d, data.phone, data.pin, { role: "parent", full_name: data.fullName, child_id: c.id, school: c.school });
    return { token: await d.signToken(id) };
  }));

export const registerTeacherFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ fullName: z.string().min(3).max(120), age: z.coerce.number().int().min(18).max(90), school: z.string().min(1).max(160), subject: z.string().min(1).max(80), phone, pin, diploma: image, photo: image, diplomaHead: head, photoHead: head, lang }))
  .handler(({ data }) => run(async () => {
    const d = await import("./db.server"), ai = await import("./ai.server");
    const since = new Date(Date.now() - 86400_000).toISOString();
    if ((await d.select("users", { select: "id", phone: d.eq(data.phone), role: d.eq("teacher"), created_at: `gte.${since}` })).length >= 3) throw new AppError("locked");
    await assertPinFree(d, data.phone, data.pin);
    const bytes = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
    const f1 = ai.scanFileHeader("diploma", bytes(data.diplomaHead.headB64), data.diplomaHead);
    const f2 = ai.scanFileHeader("photo", bytes(data.photoHead.headB64), data.photoHead);
    const out = await ai.verifyTeacherDocs({ diploma: data.diploma, photo: data.photo, fullName: data.fullName, school: data.school, subject: data.subject, lang: data.lang, forensics: { flags: [...f1.flags, ...f2.flags], hardFail: f1.hardFail || f2.hardFail, facts: [...f1.facts, ...f2.facts] } });
    const status = out.verdict === "approved" ? "approved" : out.verdict === "manual_review" ? "pending" : "rejected";
    const id = await createUser(d, data.phone, data.pin, { role: "teacher", full_name: data.fullName, age: data.age, school: data.school, subject: data.subject, status });
    await d.insert("teacher_reviews", { user_id: id, verdict: out.verdict, risk: out.check.riskScore, reasons: out.reasons, summary: out.check.summary, extracted: { holderName: out.check.holderName, institution: out.check.institution, year: out.check.year } });
    return { verdict: out.verdict, riskScore: out.check.riskScore, reasons: out.reasons, summary: out.check.summary, token: status === "approved" ? await d.signToken(id) : null };
  }));

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ phone, pin }))
  .handler(({ data }) => run(async () => {
    const d = await import("./db.server");
    await d.assertNotLocked(data.phone);
    const rows = await d.select<{ id: string; pin_hash: string; pin_salt: string; status: string }>("users", { select: "id,pin_hash,pin_salt,status", phone: d.eq(data.phone) });
    for (const r of rows) {
      if ((await d.hashPin(data.pin, r.pin_salt)) !== r.pin_hash) continue;
      if (r.status === "pending") throw new AppError("pending");
      if (r.status === "rejected") throw new AppError("rejected");
      return { token: await d.signToken(r.id) };
    }
    await d.recordFailure(data.phone);
    throw new AppError("invalid");
  }));

export const meFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server");
  const u = await d.auth(data.token);
  const base = { id: u.id, role: u.role, fullName: u.full_name, phone: maskPhone(u.phone), school: u.school, cls: u.class_label, code: u.code, coins: u.coins, subject: u.subject };
  let teacher: { name: string; subject: string | null; code: string } | null = null, child: { name: string; code: string; school: string | null; cls: string | null } | null = null;
  const c = u.role === "parent" ? await childOf(d, u) : null;
  if (c) child = { name: c.full_name, code: c.code, school: c.school, cls: c.class_label };
  const tid = u.role === "teacher" ? null : (c ?? u).teacher_id;
  if (tid) { const t = await d.one<{ full_name: string; subject: string | null; code: string }>("users", { select: "full_name,subject,code", id: d.eq(tid) }); if (t) teacher = { name: t.full_name, subject: t.subject, code: t.code }; }
  return { ...base, teacher, child };
}));

/** Change the PIN. Needs the current PIN; every token issued before the change stops working, a fresh one is returned. */
export const changePinFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, currentPin: pin, newPin: pin })).handler(({ data }) => run(async () => {
  const d = await import("./db.server");
  const u = await d.auth(data.token);
  await d.assertNotLocked(u.phone);
  const row = await d.one<{ pin_hash: string; pin_salt: string }>("users", { select: "pin_hash,pin_salt", id: d.eq(u.id) });
  if (!row || (await d.hashPin(data.currentPin, row.pin_salt)) !== row.pin_hash) { await d.recordFailure(u.phone); throw new AppError("bad_pin"); }
  if (data.newPin === data.currentPin) throw new AppError("pin_same");
  const others = await d.select<{ pin_hash: string; pin_salt: string }>("users", { select: "pin_hash,pin_salt", phone: d.eq(u.phone), id: `neq.${u.id}`, status: "neq.rejected" });
  for (const r of others) if ((await d.hashPin(data.newPin, r.pin_salt)) === r.pin_hash) throw new AppError("pin_taken");
  const salt = d.newSalt();
  await d.patch("users", { id: d.eq(u.id) }, { pin_salt: salt, pin_hash: await d.hashPin(data.newPin, salt) });
  return { token: await d.signToken(u.id) };
}));

/* ---------------- check history ---------------- */
/** Student / parent: AI checks of the child's homework and handwriting (photos are not stored, only results). Teacher: own document verification. */
export const historyFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  const out: HistoryData = { child: "", homework: [], handwriting: [], reviews: [] };
  if (u.role === "teacher") {
    const rows = await d.select<{ id: string; verdict: string; risk: number; reasons: unknown; summary: string | null; created_at: string }>("teacher_reviews", { select: "id,verdict,risk,reasons,summary,created_at", user_id: d.eq(u.id), order: "created_at.desc", limit: "20" });
    out.reviews = rows.map((r) => ({ id: r.id, verdict: r.verdict, risk: r.risk, summary: r.summary ?? "", reasons: strs(r.reasons).slice(0, 5), at: r.created_at }));
    return out;
  }
  const s = await childOf(d, u);
  out.child = s.full_name;
  const hw = await d.select<{ id: string; subject: string | null; stars: number; understood: boolean; copy_risk: number; seconds: number; created_at: string; result: Partial<HomeworkResult> | null }>("submissions", { select: "id,subject,stars,understood,copy_risk,seconds,created_at,result", student_id: d.eq(s.id), order: "created_at.desc", limit: "50" });
  const hand = await d.select<{ id: string; score: number; created_at: string; result: { summary?: string } | null }>("handwriting", { select: "id,score,created_at,result", student_id: d.eq(s.id), order: "created_at.desc", limit: "50" });
  out.homework = hw.map((r) => ({
    id: r.id, subject: r.subject, stars: r.stars, allDone: Boolean(r.result?.allDone), understood: r.understood,
    exercisesDone: Number(r.result?.exercisesDone ?? 0), exercisesExpected: r.result?.exercisesExpected ?? null, copyRisk: r.copy_risk, seconds: r.seconds,
    mistakes: strs(r.result?.mistakes).slice(0, 6), feedback: strs(r.result?.feedback).slice(0, 4), at: r.created_at,
  }));
  out.handwriting = hand.map((r) => ({ id: r.id, score: r.score, summary: typeof r.result?.summary === "string" ? r.result.summary : "", at: r.created_at }));
  return out;
}));

/* ---------------- tasks ---------------- */
export const tasksFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  const tid = await teacherIdOf(d, u);
  if (!tid) return [];
  const rows = await d.select<{ id: string; subject: string; text: string; file_path: string | null; file_type: string | null; voice_path: string | null; created_at: string }>("tasks", { select: "id,subject,text,file_path,file_type,voice_path,created_at", teacher_id: d.eq(tid), order: "created_at.desc", limit: "10" });
  return rows.map((r) => ({ id: r.id, subject: r.subject, text: r.text, at: r.created_at, fileType: r.file_type, hasFile: Boolean(r.file_path), hasVoice: Boolean(r.voice_path) }));
}));

/** FormData: token, subject, text, optional file (image/video <= 15 MB), optional voice (audio <= 3 MB). */
export const createTaskFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => { if (!(v instanceof FormData)) throw new Error("FormData expected"); return v; })
  .handler(({ data }) => run(async () => {
    const d = await import("./db.server");
    const u = await d.auth(String(data.get("token") ?? ""), "teacher");
    const subject = z.string().min(1).max(80).parse(data.get("subject"));
    const text = z.string().min(1).max(2000).parse(data.get("text"));
    const file = data.get("file"), voice = data.get("voice");
    const row = await d.insert<{ id: string }>("tasks", { teacher_id: u.id, subject, text });
    const upd: Record<string, unknown> = {};
    if (file instanceof File && file.size > 0) {
      if (!/^(image|video)\//.test(file.type) || file.size > 15_000_000) throw new AppError("bad_file");
      upd.file_path = `${u.id}/task-${row.id}-file`; upd.file_type = file.type.split("/")[0];
      await d.uploadMedia(upd.file_path as string, await file.arrayBuffer(), file.type);
    }
    if (voice instanceof File && voice.size > 0) {
      if (!voice.type.startsWith("audio/") || voice.size > 3_000_000) throw new AppError("bad_file");
      upd.voice_path = `${u.id}/task-${row.id}-voice`;
      await d.uploadMedia(upd.voice_path as string, await voice.arrayBuffer(), voice.type);
    }
    if (Object.keys(upd).length) await d.patch("tasks", { id: d.eq(row.id) }, upd);
    const studs = (await studentsOf(d, u.id)).map((s) => s.id);
    await d.notify([...studs, ...(await d.parentIdsOf(studs))], "new_task", { subject });
    return true;
  }));

export const taskMediaFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, taskId: z.string().uuid(), kind: z.enum(["file", "voice"]) })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  const t = await d.one<{ teacher_id: string; file_path: string | null; voice_path: string | null }>("tasks", { select: "teacher_id,file_path,voice_path", id: d.eq(data.taskId) });
  if (!t || t.teacher_id !== (await teacherIdOf(d, u))) throw new AppError("forbidden");
  const path = data.kind === "file" ? t.file_path : t.voice_path;
  if (!path) throw new AppError("not_found");
  return d.signedMediaUrl(path);
}));

/* ---------------- AI grading ---------------- */
export const gradeHomeworkFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, taskId: z.string().uuid().nullable(), image, seconds: z.number().int().min(0).max(86400), lang })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"), ai = await import("./ai.server");
  const u = await d.auth(data.token, "student");
  const task = data.taskId ? await d.one<{ id: string; subject: string; text: string; teacher_id: string }>("tasks", { select: "id,subject,text,teacher_id", id: d.eq(data.taskId) }) : null;
  if (task && task.teacher_id !== u.teacher_id) throw new AppError("forbidden");
  const result = await ai.gradeHomework({ image: data.image, taskText: task?.text ?? "", subject: task?.subject ?? "-", lang: data.lang });
  if (!result.isHomeworkPhoto) return { result, submissionId: null, coinsAwarded: 0, coins: u.coins };
  const today = await d.select("submissions", { select: "id", student_id: d.eq(u.id), task_id: task ? d.eq(task.id) : "is.null", created_at: `gte.${d.dayStartIso()}`, limit: "1" });
  const sub = await d.insert<{ id: string }>("submissions", { student_id: u.id, task_id: task?.id ?? null, subject: task?.subject ?? null, stars: result.stars, understood: result.understood, copy_risk: result.copyRisk, seconds: data.seconds, result });
  const award = today.length ? 0 : result.stars * 10;
  const coins = award ? await addCoins(d, u.id, award) : u.coins;
  await d.notify(await d.parentIdsOf([u.id]), "homework_done", { child: u.full_name, stars: result.stars });
  return { result, submissionId: sub.id, coinsAwarded: award, coins };
}));

export const gradeHandwritingFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, image, lang })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"), ai = await import("./ai.server");
  const u = await d.auth(data.token, "student");
  const result = await ai.gradeHandwriting({ image: data.image, lang: data.lang });
  if (result.isHandwriting) await d.insert("handwriting", { student_id: u.id, score: result.score, result });
  return result;
}));

/* ---------------- stats / rating ---------------- */
export const statsFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  if (u.role === "teacher") return { avg: null as number | null, days: 0, minutes: 0, hand: null as number | null, handHistory: [] as number[], doneToday: false, child: "" };
  const s = await childOf(d, u);
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const subs = await d.select<{ stars: number; seconds: number; created_at: string }>("submissions", { select: "stars,seconds,created_at", student_id: d.eq(s.id), created_at: `gte.${since}` });
  const hw = await d.select<{ score: number; created_at: string }>("handwriting", { select: "score,created_at", student_id: d.eq(s.id), order: "created_at.desc", limit: "8" });
  const hist = hw.map((x) => x.score).reverse();
  return {
    avg: subs.length ? +(subs.reduce((a, x) => a + x.stars, 0) / subs.length).toFixed(1) : null,
    days: new Set(subs.map((x) => d.dayKey(x.created_at))).size,
    minutes: Math.round(subs.reduce((a, x) => a + x.seconds, 0) / 60),
    hand: hist.length ? hist[hist.length - 1]! : null,
    handHistory: hist,
    doneToday: (await d.select("submissions", { select: "id", student_id: d.eq(s.id), created_at: `gte.${d.dayStartIso()}`, limit: "1" })).length > 0,
    child: s.full_name,
  };
}));

export const ratingFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  const tid = await teacherIdOf(d, u);
  if (!tid) return [];
  const studs = await studentsOf(d, tid);
  if (!studs.length) return [];
  const me = u.role === "student" ? u.id : u.role === "parent" ? u.child_id : null;
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const subs = await d.select<{ student_id: string; created_at: string }>("submissions", { select: "student_id,created_at", student_id: d.inList(studs.map((s) => s.id)), created_at: `gte.${since}`, limit: "5000" });
  const days = new Map<string, Set<string>>();
  for (const s of subs) { if (!days.has(s.student_id)) days.set(s.student_id, new Set()); days.get(s.student_id)!.add(d.dayKey(s.created_at)); }
  return studs.map((s) => ({ name: s.full_name, days: days.get(s.id)?.size ?? 0, me: s.id === me })).sort((a, b) => b.days - a.days).slice(0, 20);
}));

/* ---------------- help requests + teacher video ---------------- */
export const requestHelpFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, submissionId: z.string().uuid() })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "student");
  const sub = await d.one<{ id: string; subject: string | null; result: { mistakes?: string[] } }>("submissions", { select: "id,subject,result", id: d.eq(data.submissionId), student_id: d.eq(u.id) });
  if (!sub) throw new AppError("forbidden");
  if (await d.one("help_requests", { select: "id", submission_id: d.eq(sub.id) })) return true;
  await d.insert("help_requests", { student_id: u.id, submission_id: sub.id, subject: sub.subject, mistakes: sub.result.mistakes ?? [] });
  await d.notify([u.teacher_id], "help_request", { student: u.full_name, subject: sub.subject ?? "" });
  return true;
}));

export const helpRequestsFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  let studs: { id: string; full_name: string }[];
  if (u.role === "teacher") studs = await studentsOf(d, u.id);
  else { const c = await childOf(d, u); studs = [{ id: c.id, full_name: c.full_name }]; }
  if (!studs.length) return [];
  const rows = await d.select<{ id: string; student_id: string; subject: string | null; mistakes: string[]; video_path: string | null; created_at: string }>("help_requests", { select: "id,student_id,subject,mistakes,video_path,created_at", student_id: d.inList(studs.map((s) => s.id)), order: "created_at.desc", limit: "50" });
  const name = new Map(studs.map((s) => [s.id, s.full_name]));
  return rows.map((r) => ({ id: r.id, student: name.get(r.student_id) ?? "", subject: r.subject, mistakes: r.mistakes, at: r.created_at, hasVideo: Boolean(r.video_path) }));
}));

export const answerHelpFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => { if (!(v instanceof FormData)) throw new Error("FormData expected"); return v; })
  .handler(({ data }) => run(async () => {
    const d = await import("./db.server");
    const u = await d.auth(String(data.get("token") ?? ""), "teacher");
    const id = z.string().uuid().parse(data.get("requestId"));
    const file = data.get("video");
    if (!(file instanceof File) || !file.type.startsWith("video/") || file.size > 25_000_000) throw new AppError("bad_video");
    const r = await d.one<{ student_id: string }>("help_requests", { select: "student_id", id: d.eq(id) });
    const st = r && (await d.one<{ teacher_id: string | null }>("users", { select: "teacher_id", id: d.eq(r.student_id) }));
    if (!r || st?.teacher_id !== u.id) throw new AppError("forbidden");
    const path = `${u.id}/${id}`;
    await d.uploadMedia(path, await file.arrayBuffer(), file.type);
    await d.patch("help_requests", { id: d.eq(id) }, { video_path: path, answered_at: new Date().toISOString() });
    const hr = await d.one<{ subject: string | null }>("help_requests", { select: "subject", id: d.eq(id) });
    await d.notify([r.student_id, ...(await d.parentIdsOf([r.student_id]))], "help_answered", { subject: hr?.subject ?? "" });
    return true;
  }));

export const videoUrlFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, requestId: z.string().uuid() })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  const r = await d.one<{ student_id: string; video_path: string | null }>("help_requests", { select: "student_id,video_path", id: d.eq(data.requestId) });
  if (!r?.video_path) throw new AppError("not_found");
  const st = await d.one<{ teacher_id: string | null }>("users", { select: "teacher_id", id: d.eq(r.student_id) });
  const allowed = u.id === r.student_id || u.child_id === r.student_id || (u.role === "teacher" && st?.teacher_id === u.id);
  if (!allowed) throw new AppError("forbidden");
  return d.signedMediaUrl(r.video_path);
}));

/* ---------------- shop / canteen / bazaar ---------------- */
export const buyRewardFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, itemId: z.string().max(40) })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "student");
  const item = SHOP.find((x) => x.id === data.itemId);
  if (!item) throw new AppError("bad_input");
  const coins = await addCoins(d, u.id, -item.price);
  await d.insert("rewards_bought", { student_id: u.id, item_id: item.id, price: item.price });
  return { coins };
}));

export const orderFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, items: z.array(z.string().max(40)).min(1).max(30) })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "student");
  const lines = data.items.map((id) => MENU.find((m) => m.id === id));
  if (lines.some((x) => !x)) throw new AppError("bad_input");
  const total = lines.reduce((a, x) => a + x!.price, 0);
  await d.insert("orders", { student_id: u.id, items: data.items, total });
  return { total };
}));

export const marketFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  const school = (await childOf(d, u).catch(() => u)).school;
  if (!school) return [];
  const rows = await d.select<{ id: string; seller_id: string; title: string; price: number | null; kind: "sell" | "swap"; reserved_by: string | null }>("market_items", { select: "id,seller_id,title,price,kind,reserved_by", school: d.eq(school), order: "created_at.desc", limit: "30" });
  const ids = [...new Set(rows.flatMap((r) => [r.seller_id, r.reserved_by].filter(Boolean) as string[]))];
  const names = ids.length ? await d.select<{ id: string; full_name: string; class_label: string | null }>("users", { select: "id,full_name,class_label", id: d.inList(ids) }) : [];
  const nm = new Map(names.map((n) => [n.id, `${n.full_name}${n.class_label ? ` · ${n.class_label}` : ""}`]));
  return rows.map((r) => ({ id: r.id, title: r.title, price: r.price, kind: r.kind, seller: nm.get(r.seller_id) ?? "", mine: r.seller_id === u.id, reserved: Boolean(r.reserved_by), reservedBy: r.seller_id === u.id && r.reserved_by ? nm.get(r.reserved_by) ?? "" : null }));
}));

export const sellFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, title: z.string().min(2).max(80), price: z.number().int().min(0).max(10_000_000).nullable(), kind: z.enum(["sell", "swap"]) })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "student");
  await d.insert("market_items", { seller_id: u.id, school: u.school, title: data.title, price: data.kind === "swap" ? null : data.price, kind: data.kind });
  return true;
}));

export const reserveFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, itemId: z.string().uuid() })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "student");
  const rows = await d.patch("market_items", { id: d.eq(data.itemId), reserved_by: "is.null", school: d.eq(u.school ?? ""), seller_id: `neq.${u.id}` }, { reserved_by: u.id });
  if (!rows.length) throw new AppError("conflict");
  await d.notify([rows[0].seller_id], "item_reserved", { title: rows[0].title });
  return true;
}));

/* ---------------- anonymous questions, notebook, announcements ---------------- */
export const questionsFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  const tid = await teacherIdOf(d, u);
  if (!tid) return [];
  const qs = await d.select<{ id: string; author_id: string; text: string; created_at: string }>("questions", { select: "id,author_id,text,created_at", teacher_id: d.eq(tid), order: "created_at.desc", limit: "20" });
  const rs = qs.length ? await d.select<{ question_id: string; text: string; author_id: string }>("replies", { select: "question_id,text,author_id", question_id: d.inList(qs.map((q) => q.id)), order: "created_at.asc" }) : [];
  return qs.map((q) => ({ id: q.id, text: q.text, mine: q.author_id === u.id, replies: rs.filter((r) => r.question_id === q.id).map((r) => ({ text: r.text, mine: r.author_id === u.id })) }));
}));
export const askFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, text: z.string().min(2).max(500) })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "student");
  if (!u.teacher_id) throw new AppError("forbidden");
  await d.insert("questions", { teacher_id: u.teacher_id, author_id: u.id, text: data.text });
  return true;
}));
export const replyFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, questionId: z.string().uuid(), text: z.string().min(1).max(500) })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  const q = await d.one<{ teacher_id: string; author_id: string }>("questions", { select: "teacher_id,author_id", id: d.eq(data.questionId) });
  if (!q || q.teacher_id !== (await teacherIdOf(d, u))) throw new AppError("forbidden");
  await d.insert("replies", { question_id: data.questionId, author_id: u.id, text: data.text });
  if (q.author_id !== u.id) await d.notify([q.author_id], "question_reply");
  return true;
}));

export const notebookFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "student");
  return (await d.one<{ text: string }>("notebooks", { select: "text", student_id: d.eq(u.id) }))?.text ?? "";
}));
export const saveNotebookFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, text: z.string().max(20000) })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "student");
  await d.rest("notebooks", { method: "POST", q: { on_conflict: "student_id" }, body: { student_id: u.id, text: data.text, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates,return=minimal" });
  return true;
}));

export const announcementsFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  const tid = await teacherIdOf(d, u);
  if (!tid) return [];
  const rows = await d.select<{ id: string; text: string; created_at: string }>("announcements", { select: "id,text,created_at", teacher_id: d.eq(tid), order: "created_at.desc", limit: "3" });
  const signed = u.role === "parent" && rows.length ? await d.select<{ announcement_id: string }>("announcement_signs", { select: "announcement_id", parent_id: d.eq(u.id), announcement_id: d.inList(rows.map((r) => r.id)) }) : [];
  return rows.map((r) => ({ id: r.id, text: r.text, at: r.created_at, signed: signed.some((s) => s.announcement_id === r.id) }));
}));
export const createAnnouncementFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, text: z.string().min(2).max(500) })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "teacher");
  await d.insert("announcements", { teacher_id: u.id, text: data.text });
  const studs = (await studentsOf(d, u.id)).map((s) => s.id);
  await d.notify([...studs, ...(await d.parentIdsOf(studs))], "announcement", { text: data.text.slice(0, 80) });
  return true;
}));
export const signAnnouncementFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, id: z.string().uuid() })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "parent");
  const a = await d.one<{ teacher_id: string }>("announcements", { select: "teacher_id", id: d.eq(data.id) });
  if (!a || a.teacher_id !== (await teacherIdOf(d, u))) throw new AppError("forbidden");
  await d.rest("announcement_signs", { method: "POST", q: { on_conflict: "announcement_id,parent_id" }, body: { announcement_id: data.id, parent_id: u.id }, prefer: "resolution=ignore-duplicates,return=minimal" });
  return true;
}));

/* ---------------- parent signature journal ---------------- */
export const signaturesFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "parent");
  const rows = await d.select<{ week: string; speed: number; pressure: number; forged: boolean; img: string; hash: string; prev: string; created_at: string }>("signatures", { select: "week,speed,pressure,forged,img,hash,prev,created_at", parent_id: d.eq(u.id), order: "created_at.desc", limit: "20" });
  const wk = d.weekKey();
  return { week: wk, signed: rows.some((r) => r.week === wk && !r.forged), journal: rows.map((r) => ({ ...r, at: r.created_at })) };
}));

export const signReportFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token, speed: z.number().min(0).max(100000), pressure: z.number().min(0).max(1), img: z.string().max(250_000).startsWith("data:image/") })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "parent");
  if (!u.child_id) throw new AppError("forbidden");
  const prevRows = await d.select<{ speed: number; pressure: number; forged: boolean; hash: string }>("signatures", { select: "speed,pressure,forged,hash", parent_id: d.eq(u.id), order: "created_at.desc", limit: "20" });
  const base = prevRows.filter((r) => !r.forged);
  const avg = base.length ? base.reduce((a, r) => a + r.speed, 0) / base.length : data.speed;
  const avgP = base.length ? base.reduce((a, r) => a + Number(r.pressure), 0) / base.length : data.pressure;
  const forged = base.length >= 1 && (Math.abs(data.speed - avg) / Math.max(avg, 1) > 0.45 || Math.abs(data.pressure - avgP) > 0.25);
  const prev = prevRows[0]?.hash ?? "00000000";
  const week = d.weekKey();
  const hash = (await d.sha256(`${prev}|${week}|${data.speed}|${data.pressure}|${data.img.length}|${Date.now()}`)).slice(0, 16);
  await d.insert("signatures", { parent_id: u.id, child_id: u.child_id, week, speed: Math.round(data.speed), pressure: data.pressure, forged, img: data.img, hash, prev });
  if (forged) {
    const ch = await d.one<{ teacher_id: string | null; full_name: string }>("users", { select: "teacher_id,full_name", id: d.eq(u.child_id) });
    await d.notify([ch?.teacher_id], "forged_signature", { child: ch?.full_name ?? "" });
  }
  return { forged };
}));

export const signalsFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token, "teacher");
  const studs = await studentsOf(d, u.id);
  if (!studs.length) return [];
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const rows = await d.select<{ child_id: string; created_at: string }>("signatures", { select: "child_id,created_at", child_id: d.inList(studs.map((s) => s.id)), forged: d.eq(true), created_at: `gte.${since}`, order: "created_at.desc", limit: "20" });
  const nm = new Map(studs.map((s) => [s.id, s.full_name]));
  return rows.map((r) => ({ child: nm.get(r.child_id) ?? "", at: r.created_at }));
}));

/* ---------------- in-app notifications ---------------- */
export const notificationsFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  const rows = await d.select<{ id: string; kind: string; meta: Record<string, string | number>; is_read: boolean; created_at: string }>("notifications", { select: "id,kind,meta,is_read,created_at", user_id: d.eq(u.id), order: "created_at.desc", limit: "30" });
  return rows.map((r) => ({ id: r.id, kind: r.kind, meta: r.meta, read: r.is_read, at: r.created_at }));
}));
export const readNotificationsFn = createServerFn({ method: "POST" }).inputValidator(z.object({ token })).handler(({ data }) => run(async () => {
  const d = await import("./db.server"); const u = await d.auth(data.token);
  await d.patch("notifications", { user_id: d.eq(u.id), is_read: d.eq(false) }, { is_read: true });
  return true;
}));

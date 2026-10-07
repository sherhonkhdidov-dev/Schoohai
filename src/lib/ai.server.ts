/**
 * SERVER-ONLY. Free AI via Google Gemini API (AI Studio free tier).
 * Env: GEMINI_API_KEY (required), GEMINI_MODEL (optional, default gemini-2.5-flash).
 */
import { z } from "zod";
import { AppError, ConfigError } from "./errors";
import { env } from "./db.server";

type Img = { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };
const LANG_NAME = { ru: "Russian", en: "English", uz: "Uzbek (Latin script)", tj: "Tajik (Cyrillic)" } as const;
export type Lang = keyof typeof LANG_NAME;

async function callGemini<T>(o: { system: string; text: string; images: Img[]; schema: z.ZodType<T> }): Promise<T> {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new ConfigError("GEMINI_API_KEY is not set");
  const model = env("GEMINI_MODEL") || "gemini-2.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: [...o.images.map((i) => ({ inline_data: { mime_type: i.mediaType, data: i.data } })), { text: o.text }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (res.status === 429) throw new AppError("rate_limited");
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").replace(/^```(?:json)?|```$/gm, "").trim();
  if (!raw) throw new AppError("ai_blocked");
  return o.schema.parse(JSON.parse(raw));
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, Math.round(n)));
const strs = (max: number) => z.array(z.string()).catch([]).transform((a) => a.slice(0, max));

/* ---------------- Homework ---------------- */
const HomeworkSchema = z.object({
  isHomeworkPhoto: z.boolean(),
  stars: z.coerce.number(),
  exercisesExpected: z.coerce.number().nullable().catch(null),
  exercisesDone: z.coerce.number().catch(0),
  allDone: z.boolean().catch(false),
  understood: z.boolean().catch(true),
  mistakes: strs(6),
  copyRisk: z.coerce.number().catch(0),
  copyReasons: strs(4),
  feedback: strs(3),
});
export type HomeworkResult = z.infer<typeof HomeworkSchema>;

export async function gradeHomework(i: { image: Img; taskText: string; subject: string; lang: Lang }): Promise<HomeworkResult> {
  const r = await callGemini({
    schema: HomeworkSchema,
    system:
      "You are a careful, fair school teacher's assistant grading a photo of a student's notebook. Grade only what is visible; never invent exercises. " +
      "If the image is not a notebook/homework page set isHomeworkPhoto=false and stars=1. " +
      "copyRisk (0-100) is a SUSPICION estimate that the work is not handwritten by the student (printed text, screenshot of a screen, typed font, answers without needed working). " +
      "You cannot search the internet: never claim it was copied from a specific site, only describe visible signs. Neat honest work must get a low copyRisk. " +
      `Write mistakes, copyReasons and feedback in ${LANG_NAME[i.lang]}; feedback is short, kind, concrete (max 3). ` +
      'Reply with JSON only: {"isHomeworkPhoto":bool,"stars":1-5,"exercisesExpected":int|null,"exercisesDone":int,"allDone":bool,"understood":bool (false if mistakes show the topic is not understood),"mistakes":[string],"copyRisk":0-100,"copyReasons":[string],"feedback":[string]}',
    text: `Subject: ${i.subject}\nAssigned task:\n${i.taskText || "(not provided)"}\nGrade the attached notebook photo.`,
    images: [i.image],
  });
  return { ...r, stars: clamp(r.stars, 1, 5), copyRisk: clamp(r.copyRisk, 0, 100), exercisesDone: Math.max(0, Math.round(r.exercisesDone)) };
}

/* ---------------- Handwriting ---------------- */
const HandSchema = z.object({
  isHandwriting: z.boolean(),
  score: z.coerce.number(),
  legibility: z.coerce.number().catch(0),
  evenness: z.coerce.number().catch(0),
  tips: z.array(z.object({ letter: z.string(), tip: z.string() })).catch([]).transform((a) => a.slice(0, 3)),
  summary: z.string().catch(""),
});
export type HandwritingResult = z.infer<typeof HandSchema>;

export async function gradeHandwriting(i: { image: Img; lang: Lang }): Promise<HandwritingResult> {
  const r = await callGemini({
    schema: HandSchema,
    system:
      "You assess a school student's handwriting from a photo. Score 0-100 for neatness (legibility, even letter size, baseline, spacing, consistent slant). " +
      "If there is no handwriting set isHandwriting=false and score=0. Be encouraging but honest; do not inflate. At most 3 letter-specific tips (one letter + one short actionable tip). " +
      `Write tips and summary in ${LANG_NAME[i.lang]}. JSON only: {"isHandwriting":bool,"score":0-100,"legibility":0-100,"evenness":0-100,"tips":[{"letter":string,"tip":string}],"summary":string}`,
    text: "Assess the handwriting in the attached photo.",
    images: [i.image],
  });
  return { ...r, score: clamp(r.score, 0, 100) };
}

/* ---------------- Teacher verification ---------------- */
export type Forensics = { flags: string[]; hardFail: boolean; facts: string[] };

/** Deterministic checks on the first bytes of the ORIGINAL upload (before client resizing strips metadata). */
export function scanFileHeader(label: string, head: Uint8Array, meta: { size: number; type: string }): Forensics {
  const flags: string[] = [], facts: string[] = [];
  let hardFail = false;
  const text = new TextDecoder("latin1").decode(head).toLowerCase();
  const aiMarkers = ["stable diffusion", "midjourney", "dall-e", "dall·e", "firefly", "comfyui", "automatic1111", "novelai", "leonardo.ai", "sdxl", "negative prompt", "cfg scale", "made with google ai", "synthid", "imagen"];
  const hit = aiMarkers.find((m) => text.includes(m));
  if (hit) { flags.push(`${label}: generator metadata found ("${hit}")`); hardFail = true; }
  if (text.includes("c2pa") || text.includes("jumbf") || text.includes("contentcredentials")) {
    facts.push(`${label}: contains Content Credentials (C2PA) manifest`);
    if (text.includes("trainedalgorithmicmedia")) { flags.push(`${label}: Content Credentials declare AI-generated media`); hardFail = true; }
  }
  const ed = ["adobe photoshop", "gimp", "canva", "pixlr", "photopea", "snapseed"].find((m) => text.includes(m));
  if (ed) flags.push(`${label}: editing software tag found (${ed})`);
  if (head[0] === 0xff && head[1] === 0xd8 && !text.includes("exif")) facts.push(`${label}: JPEG without camera EXIF (screenshot, messenger-compressed or stripped)`);
  if (meta.type === "image/png") facts.push(`${label}: PNG format`);
  if (meta.size < 40_000) flags.push(`${label}: very small file (${Math.round(meta.size / 1024)} KB)`);
  return { flags, hardFail, facts };
}

const TeacherSchema = z.object({
  diplomaIsDocument: z.boolean(),
  holderName: z.string().nullable().catch(null),
  institution: z.string().nullable().catch(null),
  year: z.string().nullable().catch(null),
  nameMatches: z.boolean(),
  nameNote: z.string().catch(""),
  tamperSigns: strs(6),
  aiGeneratedSigns: strs(6),
  screenOrPrintedCopy: z.boolean().catch(false),
  photoIsFrontalPerson: z.boolean(),
  photoSinglePerson: z.boolean(),
  photoLooksSynthetic: z.boolean(),
  photoNote: z.string().catch(""),
  riskScore: z.coerce.number(),
  summary: z.string().catch(""),
});
export type TeacherCheck = z.infer<typeof TeacherSchema>;
export type Verdict = "approved" | "manual_review" | "rejected";

export async function verifyTeacherDocs(i: { diploma: Img; photo: Img; fullName: string; school: string; subject: string; lang: Lang; forensics: Forensics }) {
  const check = await callGemini({
    schema: TeacherSchema,
    system:
      "You are a document-screening analyst for a school platform. Examine a teacher's diploma image (image 1) and 3x4 portrait (image 2). " +
      "You CANNOT confirm a diploma exists in any registry, so never say it is authentic; report only visible evidence. " +
      "Look for: inconsistent fonts or spacing, pasted text blocks, blur/cloning around names, dates or stamps, unnatural paper, garbled or non-existent words, impossible seals, generic template layouts, warped text, screen moire / photo of a monitor, typical AI-image artifacts (melted letters, nonsense text, over-smooth surfaces). " +
      "Portrait: must be one real person, face frontal and fully visible; flag illustrations, heavy filters, stock/celebrity-like images and synthetic faces. " +
      "riskScore 0-100 (0 no concerns, 100 clearly forged/synthetic); be calibrated: ordinary phone photos with mild blur or glare are not suspicious. Names may be in any script: compare allowing for transliteration. " +
      `Write nameNote, tamperSigns, aiGeneratedSigns, photoNote, summary in ${LANG_NAME[i.lang]}. ` +
      'JSON only: {"diplomaIsDocument":bool,"holderName":string|null,"institution":string|null,"year":string|null,"nameMatches":bool,"nameNote":string,"tamperSigns":[string],"aiGeneratedSigns":[string],"screenOrPrintedCopy":bool,"photoIsFrontalPerson":bool,"photoSinglePerson":bool,"photoLooksSynthetic":bool,"photoNote":string,"riskScore":0-100,"summary":string}',
    text: `Claimed full name: ${i.fullName}\nClaimed school: ${i.school}\nClaimed subject: ${i.subject}\nImage 1 = diploma, image 2 = 3x4 portrait.`,
    images: [i.diploma, i.photo],
  });
  const reasons: string[] = [...i.forensics.flags];
  let risk = clamp(check.riskScore, 0, 100);
  if (i.forensics.flags.length) risk = Math.max(risk, 55);
  let verdict: Verdict;
  if (i.forensics.hardFail || !check.diplomaIsDocument || check.photoLooksSynthetic || risk >= 70) verdict = "rejected";
  else if (!check.photoIsFrontalPerson || !check.photoSinglePerson || check.aiGeneratedSigns.length >= 2 || !check.nameMatches || risk > 25 || check.tamperSigns.length || check.screenOrPrintedCopy || i.forensics.flags.length) verdict = "manual_review";
  else verdict = "approved";
  if (!check.nameMatches) reasons.push(check.nameNote);
  reasons.push(...check.tamperSigns, ...check.aiGeneratedSigns);
  if (!check.photoIsFrontalPerson || !check.photoSinglePerson || check.photoLooksSynthetic) reasons.push(check.photoNote);
  return { verdict, check: { ...check, riskScore: risk }, reasons: reasons.filter(Boolean).slice(0, 8) };
}

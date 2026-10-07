import { useState } from "react";
import { LANGS, useT } from "@/lib/i18n";
import type { Role } from "@/lib/store";
import { loginFn, registerParentFn, registerStudentFn, registerTeacherFn } from "@/lib/api";
import { useLogin, errKey } from "@/lib/auth";
import { call } from "@/lib/errors";
import { prepareImage, readHead } from "@/lib/media";
import { Btn, FilePick, Label } from "./ui";

export function LangChip({ dark = true }: { dark?: boolean }) {
  const { lang, setLang } = useT();
  const i = LANGS.findIndex((l) => l.code === lang);
  return (
    <button onClick={() => setLang(LANGS[(i + 1) % 4]!.code)} className={`clip-chip flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold ${dark ? "bg-paper/10 text-paper ring-1 ring-paper/20" : "bg-ink text-paper"}`}>
      {LANGS.map((l) => <span key={l.code} className={l.code === lang ? "text-acid" : "opacity-50"}>{l.short}</span>)}
    </button>
  );
}

export function Header() {
  const { t } = useT();
  return (
    <div className="relative flex items-center justify-between px-5 pb-3 pt-7">
      <div className="flex items-center gap-2.5">
        <span className="clip-coin grid size-9 place-items-center bg-acid font-display text-lg text-ink">Z</span>
        <div className="leading-none text-paper">
          <div className="text-[15px] font-extrabold tracking-tight">ЗУМРАД</div>
          <div className="text-[9px] uppercase tracking-[0.25em] opacity-50">{t("school")}</div>
        </div>
      </div>
      <LangChip />
    </div>
  );
}

export function Onboarding() {
  const { t } = useT();
  const [role, setRole] = useState<Role | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-ink">
        <div className="stripes pointer-events-none absolute inset-0 opacity-60" />
        <Header />
        <div className="clip-lean relative px-5 pb-10 pt-2">
          <h1 className="max-w-[14ch] font-display text-[42px] uppercase leading-[0.92] text-paper">
            {mode === "login" ? t("loginTitle") : role ? t(role) : t("chooseTitle1")}<br />{mode === "register" && !role && <span className="text-acid">{t("chooseTitle2")}</span>}
          </h1>
        </div>
      </div>
      <div className="mx-auto max-w-[440px] px-4 py-6">
        {mode === "login" && <LoginForm />}
        {mode === "register" && !role && (
          <div className="space-y-3">
            {(["student", "teacher", "parent"] as Role[]).map((r, i) => (
              <button key={r} onClick={() => setRole(r)} style={{ animationDelay: `${i * 70}ms` }}
                className={`rise clip-card flex w-full items-center gap-4 p-5 text-left ${i === 0 ? "bg-acid text-ink" : i === 1 ? "bg-ink text-paper" : "bg-card ring-1 ring-ink/10"}`}>
                <span className="text-3xl">{["🎒", "🧑‍🏫", "👨‍👩‍👧"][i]}</span>
                <span className="flex-1"><span className="block font-display text-[24px] uppercase leading-none">{t(r)}</span><span className="text-[12px] opacity-70">{t(`${r}Desc` as never)}</span></span>
                <span className="font-display text-2xl">→</span>
              </button>
            ))}
          </div>
        )}
        {mode === "register" && role === "student" && <StudentForm onBack={() => setRole(null)} />}
        {mode === "register" && role === "teacher" && <TeacherForm onBack={() => setRole(null)} />}
        {mode === "register" && role === "parent" && <ParentForm onBack={() => setRole(null)} />}
        {!(mode === "register" && role) && (
          <button className="mt-6 w-full text-center text-[13px] font-bold underline" onClick={() => { setRole(null); setMode(mode === "login" ? "register" : "login"); }}>
            {mode === "login" ? t("noAccount") : t("haveAccount")}
          </button>
        )}
      </div>
    </div>
  );
}

function F({ label, ...p }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <div><Label>{label}</Label><input className="field" {...p} /></div>;
}

function useForm(keys: string[]) {
  const [v, setV] = useState<any>(Object.fromEntries(keys.map((k) => [k, ""])));
  const bind = (k: string) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value }) });
  return { v, setV, bind };
}

const pinProps = { type: "password", inputMode: "numeric" as const, maxLength: 6, autoComplete: "off" };
const validPin = (p: string) => /^\d{6}$/.test(p);

function Actions({ onBack, busy, label, onClick }: { onBack?: () => void; busy: boolean; label: string; onClick: () => void }) {
  return <div className="flex gap-2 pt-2">{onBack && <Btn variant="ink" onClick={onBack}>←</Btn>}<Btn className="flex-1" disabled={busy} onClick={onClick}>{busy ? "…" : label}</Btn></div>;
}

function useSubmit() {
  const { t } = useT();
  const login = useLogin();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (job: () => Promise<{ token: string }>) => {
    setErr(""); setBusy(true);
    try { login((await job()).token); } catch (e) { setErr(t(errKey(e))); setBusy(false); }
  };
  return { err, setErr, busy, go };
}

function LoginForm() {
  const { t } = useT();
  const { v, bind } = useForm(["phone", "pin"]);
  const { err, setErr, busy, go } = useSubmit();
  return (
    <div className="rise space-y-3">
      <F label={t("phone")} type="tel" {...bind("phone")} placeholder="+998 __ ___ __ __" />
      <F label={t("pin")} {...pinProps} {...bind("pin")} />
      {err && <p className="text-[13px] font-bold text-destructive">{err}</p>}
      <Actions busy={busy} label={t("loginBtn")} onClick={() => (!v.phone.trim() || !validPin(v.pin)) ? setErr(t("fillAll")) : void go(() => call(loginFn({ data: { phone: v.phone, pin: v.pin } })))} />
    </div>
  );
}

function StudentForm({ onBack }: { onBack: () => void }) {
  const { t } = useT();
  const { v, bind } = useForm(["fullName", "father", "age", "school", "cls", "phone", "pin", "teacherCode"]);
  const [noPhone, setNoPhone] = useState(false);
  const { err, setErr, busy, go } = useSubmit();
  const submit = () => {
    if ((Object.values(v) as string[]).some((x) => !x.trim()) || !validPin(v.pin) || v.teacherCode.trim().length !== 6) return setErr(t("fillAll"));
    void go(() => call(registerStudentFn({ data: { fullName: v.fullName, father: v.father, age: Number(v.age), school: v.school, cls: v.cls, phone: v.phone, phoneOwner: noPhone ? "parent" : "self", pin: v.pin, teacherCode: v.teacherCode } })));
  };
  return (
    <div className="rise space-y-3">
      <F label={t("fullName")} {...bind("fullName")} placeholder="Каримов Азиз" />
      <F label={t("fatherName")} {...bind("father")} />
      <div className="grid grid-cols-2 gap-3"><F label={t("age")} type="number" {...bind("age")} /><F label={t("classLabel")} {...bind("cls")} placeholder="7 «А»" /></div>
      <F label={t("schoolName")} {...bind("school")} placeholder="№12" />
      <label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={noPhone} onChange={(e) => setNoPhone(e.target.checked)} className="size-4 accent-ink" />{t("noPhone")}</label>
      <F label={noPhone ? t("parentPhone") : t("phone")} type="tel" {...bind("phone")} placeholder="+998 __ ___ __ __" />
      <F label={t("pin")} {...pinProps} {...bind("pin")} />
      <F label={t("teacherCode")} maxLength={6} {...bind("teacherCode")} />
      {err && <p className="text-[13px] font-bold text-destructive">{err}</p>}
      <Actions onBack={onBack} busy={busy} label={t("registerBtn")} onClick={submit} />
    </div>
  );
}

function ParentForm({ onBack }: { onBack: () => void }) {
  const { t } = useT();
  const { v, bind } = useForm(["fullName", "phone", "pin", "childCode"]);
  const { err, setErr, busy, go } = useSubmit();
  return (
    <div className="rise space-y-3">
      <F label={t("parentName")} {...bind("fullName")} />
      <F label={t("phone")} type="tel" {...bind("phone")} />
      <F label={t("pin")} {...pinProps} {...bind("pin")} />
      <F label={t("childCode")} maxLength={6} {...bind("childCode")} />
      {err && <p className="text-[13px] font-bold text-destructive">{err}</p>}
      <Actions onBack={onBack} busy={busy} label={t("registerBtn")} onClick={() => ((Object.values(v) as string[]).some((x) => !x.trim()) || !validPin(v.pin) || v.childCode.trim().length !== 6) ? setErr(t("fillAll")) : void go(() => call(registerParentFn({ data: { fullName: v.fullName, phone: v.phone, pin: v.pin, childCode: v.childCode } })))} />
    </div>
  );
}

type Verdict = "approved" | "manual_review" | "rejected";
type Outcome = { verdict: Verdict; riskScore: number; reasons: string[]; summary: string; token: string | null };

function TeacherForm({ onBack }: { onBack: () => void }) {
  const { t, lang } = useT();
  const login = useLogin();
  const { v, bind } = useForm(["fullName", "age", "school", "subject", "phone", "pin"]);
  const [diploma, setDiploma] = useState<{ url: string; file: File }>();
  const [photo, setPhoto] = useState<{ url: string; file: File }>();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Outcome | null>(null);

  const submit = async () => {
    if ((Object.values(v) as string[]).some((x) => !x.trim()) || !validPin(v.pin) || !diploma || !photo) return setErr(t("fillAll"));
    if (![diploma.file, photo.file].every((f) => f.type.startsWith("image/") && f.size < 20_000_000)) return setErr(t("errBadFile"));
    setErr(""); setBusy(true);
    try {
      const [d, p, dh, ph] = await Promise.all([prepareImage(diploma.file), prepareImage(photo.file), readHead(diploma.file), readHead(photo.file)]);
      const res = await call(registerTeacherFn({ data: { fullName: v.fullName, age: Number(v.age), school: v.school, subject: v.subject, phone: v.phone, pin: v.pin, diploma: d, photo: p, diplomaHead: dh, photoHead: ph, lang } }));
      setOut(res as Outcome);
      if (res.verdict === "approved" && res.token) setTimeout(() => login(res.token!), 2000);
    } catch (e) { setErr(t(errKey(e))); } finally { setBusy(false); }
  };

  if (busy) {
    return (
      <div className="rise clip-card bg-ink p-6 text-paper">
        <div className="text-[9px] uppercase tracking-[0.25em] text-acid">{t("verifyTitle")}</div>
        <div className="mt-1 animate-pulse font-display text-[26px] uppercase">{t("aiChecking")}</div>
      </div>
    );
  }
  if (out) {
    const ok = out.verdict === "approved";
    return (
      <div className="rise space-y-3">
        <div className={`clip-card p-5 ${ok ? "bg-acid text-ink" : "bg-ink text-paper"}`}>
          <div className="text-[9px] uppercase tracking-[0.25em] opacity-70">{t("verifyTitle")} · {t("risk")} {out.riskScore}/100</div>
          <div className="mt-1 font-display text-[24px] uppercase leading-tight">{ok ? t("verdictApproved") : out.verdict === "rejected" ? t("verdictRejected") : t("verdictReview")}</div>
          {out.summary && <p className="mt-2 text-[13px] opacity-80">{out.summary}</p>}
        </div>
        {!ok && out.reasons.length > 0 && (
          <div className="clip-card bg-card p-4 ring-1 ring-ink/10"><Label>{t("reasons")}</Label>{out.reasons.map((r, i) => <p key={i} className="text-[13px]">• {r}</p>)}</div>
        )}
        <p className="text-[11px] text-muted-foreground">{t("registryNote")}</p>
        {!ok && <Btn variant="ink" className="w-full" onClick={onBack}>←</Btn>}
      </div>
    );
  }
  return (
    <div className="rise space-y-3">
      <F label={t("fullName")} {...bind("fullName")} />
      <div className="grid grid-cols-2 gap-3"><F label={t("age")} type="number" {...bind("age")} /><F label={t("subject")} {...bind("subject")} /></div>
      <F label={t("schoolName")} {...bind("school")} />
      <F label={t("phone")} type="tel" {...bind("phone")} />
      <F label={t("pin")} {...pinProps} {...bind("pin")} />
      <FilePick label={t("diploma")} value={diploma?.url} onChange={(url, file) => setDiploma({ url, file })} />
      <FilePick label={t("photo34")} value={photo?.url} onChange={(url, file) => setPhoto({ url, file })} />
      <p className="text-[11px] text-muted-foreground">{t("registryNote")}</p>
      {err && <p className="text-[13px] font-bold text-destructive">{err}</p>}
      <div className="flex gap-2 pt-2"><Btn variant="ink" onClick={onBack}>←</Btn><Btn className="flex-1" onClick={() => void submit()}>{t("sendCheck")}</Btn></div>
    </div>
  );
}

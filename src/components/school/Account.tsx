import { useState } from "react";
import { changePinFn, historyFn } from "@/lib/api";
import { codeKey, errKey, useAuth, useServer } from "@/lib/auth";
import { call } from "@/lib/errors";
import { useT } from "@/lib/i18n";
import type { HistoryHand, HistoryHw, HistoryReview } from "@/lib/types";
import { alertsMuted, setAlertsMuted } from "./Notifications";
import { Btn, Card, Label, Sheet, Stars } from "./ui";

const pinProps = { type: "password", inputMode: "numeric" as const, maxLength: 6, autoComplete: "off" };
const validPin = (p: string) => /^\d{6}$/.test(p);
const when = (iso: string) => new Date(iso).toLocaleString();

/* ---------------- profile ---------------- */
export function ProfileCard() {
  const { t } = useT();
  const { me } = useAuth();
  const rows: [string, string | null][] = [[t("phone"), me.phone], [t("schoolName"), me.school], [t("classLabel"), me.cls], [t("subject"), me.subject]];
  return (
    <Card>
      <Label>{t("profile")}</Label>
      <div className="flex items-center gap-3">
        <span className="clip-coin grid size-12 shrink-0 place-items-center bg-acid font-display text-xl text-ink">{me.fullName.trim().charAt(0).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="truncate font-bold">{me.fullName}</p>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t(me.role)}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-[13px]">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="text-right font-bold">{v}</span></div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------- notification preference (this device) ---------------- */
export function AlertsSetting() {
  const { t } = useT();
  const [perm, setPerm] = useState<NotificationPermission | "none">(typeof Notification === "undefined" ? "none" : Notification.permission);
  const [muted, setMuted] = useState(alertsMuted);
  const toggle = () => { setAlertsMuted(!muted); setMuted(!muted); };
  return (
    <Card className="space-y-2">
      <Label>🔔 {t("notifications")}</Label>
      {perm === "default" && <Btn className="w-full" onClick={() => void Notification.requestPermission().then(setPerm)}>{t("enableAlerts")}</Btn>}
      {(perm === "denied" || perm === "none") && <p className="text-[12px] text-muted-foreground">{t("alertsBlocked")}</p>}
      {perm === "granted" && (
        <button onClick={toggle} role="switch" aria-checked={!muted} className="flex w-full items-center justify-between gap-3 text-left">
          <span className="text-[13px] font-bold">{muted ? t("alertsOff") : t("alertsOn")}</span>
          <span className={`relative h-6 w-11 shrink-0 transition ${muted ? "bg-ink/20" : "bg-acid"}`}><span className={`absolute top-1 size-4 bg-ink transition-all ${muted ? "left-1" : "left-6"}`} /></span>
        </button>
      )}
    </Card>
  );
}

/* ---------------- account protection: change PIN ---------------- */
export function Security() {
  const { t } = useT();
  const { token, replaceToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  const submit = async () => {
    setBusy(true); setErr(""); setOk(false);
    try {
      const r = await call(changePinFn({ data: { token, currentPin: cur, newPin: next } }));
      setCur(""); setNext(""); setOpen(false); setOk(true);
      await replaceToken(r.token);
    } catch (e) { setErr(t(errKey(e))); } finally { setBusy(false); }
  };

  return (
    <Card className="space-y-3">
      <Label>🔒 {t("security")}</Label>
      <p className="text-[12px] text-muted-foreground">{t("securityHint")}</p>
      {!open && <Btn variant="ink" className="w-full" onClick={() => { setOpen(true); setOk(false); setErr(""); }}>{t("changePin")}</Btn>}
      {open && (
        <div className="space-y-2">
          <div><Label>{t("currentPin")}</Label><input className="field" {...pinProps} value={cur} onChange={(e) => setCur(e.target.value.replace(/\D/g, ""))} /></div>
          <div><Label>{t("newPin")}</Label><input className="field" {...pinProps} value={next} onChange={(e) => setNext(e.target.value.replace(/\D/g, ""))} /></div>
          <div className="flex gap-2">
            <Btn variant="ink" onClick={() => { setOpen(false); setCur(""); setNext(""); setErr(""); }}>←</Btn>
            <Btn className="flex-1" disabled={busy || !validPin(cur) || !validPin(next)} onClick={() => void submit()}>{busy ? "…" : t("save")}</Btn>
          </div>
        </div>
      )}
      {ok && <p className="font-bold text-success">{t("pinChanged")}</p>}
      {err && <p className="font-bold text-destructive">{err}</p>}
    </Card>
  );
}

/* ---------------- check history ---------------- */
function HwItem({ x }: { x: HistoryHw }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const has = x.mistakes.length > 0 || x.feedback.length > 0;
  return (
    <Card className="space-y-1.5">
      <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => has && setOpen(!open)} aria-expanded={open}>
        <div><Label>{x.subject ?? "-"} · {when(x.at)}</Label><Stars n={x.stars} className="text-[20px]" /></div>
        {has && <span className="font-display text-xl leading-none">{open ? "−" : "+"}</span>}
      </button>
      <p className="text-[12px]">
        {x.allDone ? "✔" : "✖"} {x.exercisesDone}{x.exercisesExpected ? `/${x.exercisesExpected}` : ""} {t("exercises")} · {t("plagiarism")}:{" "}
        <b className={x.copyRisk > 40 ? "text-destructive" : "text-success"}>{x.copyRisk}%</b>
      </p>
      {!x.understood && <p className="text-[12px] font-bold text-destructive">{t("understoodNo")}</p>}
      {open && (
        <div className="space-y-1 border-t border-ink/10 pt-2">
          {x.mistakes.length > 0 && <Label>{t("mistakes")}</Label>}
          {x.mistakes.map((m, i) => <p key={i} className="text-[13px]">• {m}</p>)}
          {x.feedback.map((f, i) => <p key={i} className="text-[13px]">✍ {f}</p>)}
        </div>
      )}
    </Card>
  );
}

function HandItem({ x }: { x: HistoryHand }) {
  const { t } = useT();
  return (
    <Card className="space-y-1.5">
      <div className="flex items-center justify-between gap-2"><Label>{t("handwriting")} · {when(x.at)}</Label><span className="font-display text-2xl">{x.score}%</span></div>
      <div className="h-1.5 bg-ink/10"><div className="h-full bg-acid" style={{ width: `${Math.max(0, Math.min(100, x.score))}%` }} /></div>
      {x.summary && <p className="text-[13px]">{x.summary}</p>}
    </Card>
  );
}

function ReviewItem({ x }: { x: HistoryReview }) {
  const { t } = useT();
  const [label, tone] = x.verdict === "approved" ? [t("histApproved"), "bg-success text-paper"] : x.verdict === "manual_review" ? [t("histReview"), "bg-acid text-ink"] : [t("histRejected"), "bg-destructive text-paper"];
  return (
    <Card className="space-y-1.5">
      <div className="flex items-center justify-between gap-2"><Label>{when(x.at)}</Label><span className={`clip-chip px-2 py-1 text-[11px] font-extrabold ${tone}`}>{label}</span></div>
      <p className="text-[12px]">{t("risk")}: <b>{x.risk}/100</b></p>
      {x.summary && <p className="text-[13px]">{x.summary}</p>}
      {x.reasons.map((r, i) => <p key={i} className="text-[12px] text-muted-foreground">• {r}</p>)}
    </Card>
  );
}

export function CheckHistory({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const { me } = useAuth();
  const q = useServer((token) => call(historyFn({ data: { token } })));
  const [tab, setTab] = useState<"hw" | "hand">("hw");
  const d = q.data;
  const teacher = me.role === "teacher";
  const empty = d && (teacher ? d.reviews.length === 0 : (tab === "hw" ? d.homework : d.handwriting).length === 0);

  return (
    <Sheet title={t("history")} onClose={onClose}>
      {!teacher && d?.child && <Label>{d.child}</Label>}
      {teacher && <Label>{t("historyReviews")}</Label>}
      {!teacher && (
        <div className="flex gap-2">
          {(["hw", "hand"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`clip-chip flex-1 px-3 py-2 text-[12px] font-extrabold ${tab === k ? "bg-acid text-ink" : "bg-card ring-1 ring-ink/10"}`}>
              {k === "hw" ? t("homework") : t("handwriting")}{d ? ` · ${(k === "hw" ? d.homework : d.handwriting).length}` : ""}
            </button>
          ))}
        </div>
      )}
      {q.loading && <p className="animate-pulse text-[13px] font-bold">{t("loading")}</p>}
      {q.error && <p className="font-bold text-destructive">{t(codeKey(q.error))}</p>}
      {empty && <p className="py-4 text-center text-[13px] text-muted-foreground">{t("noHistory")}</p>}
      {d && teacher && d.reviews.map((x) => <ReviewItem key={x.id} x={x} />)}
      {d && !teacher && tab === "hw" && d.homework.map((x) => <HwItem key={x.id} x={x} />)}
      {d && !teacher && tab === "hand" && d.handwriting.map((x) => <HandItem key={x.id} x={x} />)}
      <p className="text-[11px] text-muted-foreground">{t("historyNote")}</p>
    </Sheet>
  );
}

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { codeKey, errKey, useAuth, useServer } from "@/lib/auth";
import { call } from "@/lib/errors";
import {
  answerHelpFn, announcementsFn, askFn, buyRewardFn, createAnnouncementFn, createTaskFn, gradeHandwritingFn, gradeHomeworkFn, helpRequestsFn, marketFn,
  notebookFn, orderFn, questionsFn, ratingFn, replyFn, requestHelpFn, reserveFn, saveNotebookFn, sellFn, signAnnouncementFn, signReportFn, signalsFn,
  signaturesFn, statsFn, taskMediaFn, videoUrlFn,
} from "@/lib/api";
import { prepareImage } from "@/lib/media";
import { MENU, SHOP } from "@/lib/catalog";
import type { HandwritingResult, HomeworkResult } from "@/lib/types";
import { Btn, Card, FilePick, Label, Sheet, Stars } from "./ui";

type P = { onClose: () => void };
export type TaskItem = { id: string; subject: string; text: string; at: string; fileType: string | null; hasFile: boolean; hasVoice: boolean };

const Err = ({ code }: { code?: string | undefined }) => {
  const { t } = useT();
  return code ? <p className="font-bold text-destructive">{t(codeKey(code))}</p> : null;
};
const Loading = () => { const { t } = useT(); return <p className="animate-pulse text-[13px] font-bold">{t("loading")}</p>; };

export function useStatsData() {
  return useServer((token) => call(statsFn({ data: { token } })));
}

/* ---------------- homework ---------------- */
export function HwCheck({ onClose, seconds, task, onDone }: P & { seconds: number; task: TaskItem | null; onDone: () => void }) {
  const { t, lang } = useT();
  const { token } = useAuth();
  const [img, setImg] = useState<string>();
  const [phase, setPhase] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const [r, setR] = useState<HomeworkResult | null>(null);
  const [subId, setSubId] = useState<string | null>(null);
  const [award, setAward] = useState(0);
  const [asked, setAsked] = useState(false);

  const run = async (url: string, file: File) => {
    setImg(url); setPhase("busy"); setErr(""); setR(null); setAsked(false); setAward(0);
    try {
      const image = await prepareImage(file);
      const res = await call(gradeHomeworkFn({ data: { token, taskId: task?.id ?? null, image, seconds, lang } }));
      setR(res.result); setSubId(res.submissionId); setAward(res.coinsAwarded); setPhase("done"); onDone();
    } catch (e) { setErr(t(errKey(e))); setPhase("error"); }
  };
  const ask = async () => {
    if (!subId) return;
    try { await call(requestHelpFn({ data: { token, submissionId: subId } })); setAsked(true); onDone(); } catch (e) { setErr(t(errKey(e))); }
  };

  return (
    <Sheet title={t("photoNotebook")} onClose={onClose}>
      {task ? <Card><Label>{task.subject}</Label><p className="text-[13px]">{task.text}</p></Card> : <p className="text-[13px] text-muted-foreground">{t("noTasks")}</p>}
      <FilePick label={t("photoNotebook")} value={img} onChange={(u, f) => void run(u, f)} />
      {phase === "busy" && <Card dark><p className="animate-pulse font-bold">{t("aiChecking")}</p></Card>}
      {err && <Card className="ring-2 ring-destructive/40"><p className="font-bold text-destructive">{err}</p></Card>}
      {phase === "done" && r && !r.isHomeworkPhoto && <Card className="ring-2 ring-destructive/40"><p className="font-bold text-destructive">{t("notNotebook")}</p></Card>}
      {phase === "done" && r?.isHomeworkPhoto && (
        <Card dark className="rise space-y-2">
          <Label>{t("aiResult")}</Label>
          <Stars n={r.stars} className="text-[28px]" />
          <p className={r.allDone ? "text-acid" : "text-destructive"}>{r.allDone ? "✔ " + t("allDone") : "✖ " + t("someMissing")} · {r.exercisesDone}{r.exercisesExpected ? `/${r.exercisesExpected}` : ""} {t("exercises")}</p>
          <p>{t("plagiarism")}: <b className={r.copyRisk > 40 ? "text-destructive" : "text-acid"}>{r.copyRisk}%</b> <span className="text-[11px] opacity-60">({t("suspicion")})</span></p>
          {r.copyRisk > 40 && r.copyReasons.map((x, i) => <p key={i} className="text-[12px] opacity-80">• {x}</p>)}
          {r.mistakes.length > 0 && <div><Label>{t("mistakes")}</Label>{r.mistakes.map((x, i) => <p key={i} className="text-[13px]">• {x}</p>)}</div>}
          {r.feedback.map((x, i) => <p key={i} className="text-[13px] text-acid">✍ {x}</p>)}
          <p>{t("timeSpent")}: <b>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</b>{award > 0 && <> · <b className="text-acid">+{award} {t("coins")}</b></>}</p>
        </Card>
      )}
      {phase === "done" && r?.isHomeworkPhoto && subId && (
        <Btn variant={r.understood ? "ink" : "acid"} className="w-full" disabled={asked} onClick={() => void ask()}>{asked ? "✔ " + t("requestSent") : t("notUnderstood")}</Btn>
      )}
    </Sheet>
  );
}

export function Handwriting({ onClose, onDone }: P & { onDone: () => void }) {
  const { t, lang } = useT();
  const { token } = useAuth();
  const stats = useStatsData();
  const [img, setImg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<HandwritingResult | null>(null);
  const hist = stats.data?.handHistory ?? [];
  const last = hist[hist.length - 1], prev = hist[hist.length - 2] ?? last;

  const run = async (url: string, file: File) => {
    setImg(url); setBusy(true); setErr(""); setRes(null);
    try {
      const image = await prepareImage(file);
      const out = await call(gradeHandwritingFn({ data: { token, image, lang } }));
      if (!out.isHandwriting) setErr(t("notHandwriting")); else { setRes(out); stats.reload(); onDone(); }
    } catch (e) { setErr(t(errKey(e))); } finally { setBusy(false); }
  };

  return (
    <Sheet title={t("handwriting")} onClose={onClose}>
      <Card dark>
        <div className="flex items-end justify-between">
          <span className="font-display text-6xl text-acid">{last === undefined ? "—" : `${last}%`}</span>
          {last !== undefined && hist.length > 1 && <span className={`font-bold ${last >= (prev ?? last) ? "text-acid" : "text-destructive"}`}>{last >= (prev ?? last) ? "▲" : "▼"} {last - (prev ?? last)}</span>}
        </div>
        {hist.length > 0 && (
          <div className="mt-4 flex h-28 items-end gap-2">
            {hist.slice(-6).map((v, i, a) => <div key={i} className="flex flex-1 flex-col items-center gap-1"><div className="w-full bg-acid transition-all" style={{ height: `${v}%`, opacity: 0.4 + ((i + 1) / a.length) * 0.6 }} /><span className="text-[9px] opacity-60">{v}</span></div>)}
          </div>
        )}
      </Card>
      <FilePick label={t("checkHw")} value={img} onChange={(u, f) => void run(u, f)} />
      {busy && <Card dark><p className="animate-pulse font-bold">{t("aiChecking")}</p></Card>}
      {err && <Card className="ring-2 ring-destructive/40"><p className="font-bold text-destructive">{err}</p></Card>}
      {res && (
        <Card className="rise">
          <Label>{t("coachNote")}</Label>
          <p className="text-[13px]">{res.summary}</p>
          {res.tips.map((x, i) => <p key={i} className="mt-1 font-bold">✍ «{x.letter}» — {x.tip}</p>)}
        </Card>
      )}
    </Sheet>
  );
}

/* ---------------- teacher video answers ---------------- */
function VideoPlayer({ requestId }: { requestId: string }) {
  const { token } = useAuth();
  const [src, setSrc] = useState<string>();
  const [bad, setBad] = useState(false);
  useEffect(() => { call(videoUrlFn({ data: { token, requestId } })).then(setSrc).catch(() => setBad(true)); }, [token, requestId]);
  if (bad) return <p className="text-[12px] text-destructive">⚠</p>;
  return src ? <video src={src} controls playsInline className="aspect-video w-full bg-ink" /> : <div className="stripes grid aspect-video place-items-center bg-ink/10 text-[12px]">…</div>;
}

/** Student / parent: help requests and the teacher's video answers. */
export function Videos({ onClose }: P) {
  const { t } = useT();
  const list = useServer((token) => call(helpRequestsFn({ data: { token } })));
  return (
    <Sheet title={t("videoFromTeacher")} onClose={onClose}>
      {list.loading && <Loading />}
      <Err code={list.error} />
      {list.data?.length === 0 && <p className="text-[13px] text-muted-foreground">{t("noRequests")}</p>}
      {list.data?.map((x) => (
        <Card key={x.id} className="space-y-2">
          <Label>{x.subject ?? "-"} · {new Date(x.at).toLocaleDateString()}</Label>
          {x.hasVideo ? <VideoPlayer requestId={x.id} /> : <p className="text-[13px] font-bold">{t("noVideoYet")}</p>}
        </Card>
      ))}
    </Sheet>
  );
}

/** Teacher: students who did not understand the task, with a video reply. */
export function TeacherRequests({ onClose, onDone }: P & { onDone: () => void }) {
  const { t } = useT();
  const { token } = useAuth();
  const list = useServer((tk) => call(helpRequestsFn({ data: { token: tk } })));
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");
  const open = list.data?.filter((x) => !x.hasVideo) ?? [];
  const send = async (id: string, file: File) => {
    setBusyId(id); setErr(""); setMsg("");
    try {
      const fd = new FormData(); fd.set("token", token); fd.set("requestId", id); fd.set("video", file);
      await call(answerHelpFn({ data: fd }));
      setMsg(t("videoSent")); list.reload(); onDone();
    } catch (e) { setErr(t(errKey(e))); } finally { setBusyId(""); }
  };
  return (
    <Sheet title={t("didntUnderstand")} onClose={onClose}>
      {list.loading && <Loading />}
      <Err code={list.error} />
      {!list.loading && open.length === 0 && <p className="text-[13px] text-muted-foreground">{t("noRequests")}</p>}
      {open.map((x) => (
        <Card key={x.id} className="space-y-2">
          <Label>{x.student} · {x.subject ?? "-"}</Label>
          {x.mistakes.slice(0, 3).map((m, i) => <p key={i} className="text-[12px]">• {m}</p>)}
          {busyId === x.id ? <p className="animate-pulse font-bold">…</p> : <FilePick label={t("sendVideo")} accept="video/*" onChange={(_u, f) => void send(x.id, f)} />}
        </Card>
      ))}
      {msg && <p className="font-bold text-success">{msg}</p>}
      {err && <p className="font-bold text-destructive">{err}</p>}
    </Sheet>
  );
}

/* ---------------- tasks ---------------- */
export function TaskMedia({ task }: { task: TaskItem }) {
  const { token } = useAuth();
  const { t } = useT();
  const [file, setFile] = useState<string>();
  const [voice, setVoice] = useState<string>();
  useEffect(() => {
    if (task.hasFile) call(taskMediaFn({ data: { token, taskId: task.id, kind: "file" } })).then(setFile).catch(() => {});
    if (task.hasVoice) call(taskMediaFn({ data: { token, taskId: task.id, kind: "voice" } })).then(setVoice).catch(() => {});
  }, [token, task.id, task.hasFile, task.hasVoice]);
  if (!task.hasFile && !task.hasVoice) return null;
  return (
    <div className="relative mt-3 space-y-2">
      {file && (task.fileType === "video" ? <video src={file} controls playsInline className="w-full bg-ink" /> : <img src={file} alt={t("attachment")} className="w-full" />)}
      {voice && <div><div className="text-[10px] uppercase tracking-widest text-acid">{t("voiceNote")}</div><audio src={voice} controls className="w-full" /></div>}
    </div>
  );
}

export function TeacherTask({ onClose, onDone }: P & { onDone: () => void }) {
  const { t } = useT();
  const { token, me } = useAuth();
  const [text, setText] = useState("");
  const [subject, setSubject] = useState(me.subject ?? "");
  const [file, setFile] = useState<{ url: string; file: File }>();
  const [rec, setRec] = useState(0);
  const [audio, setAudio] = useState<{ url: string; file: File }>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const mr = useRef<MediaRecorder | null>(null);

  const record = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(s); const chunks: Blob[] = []; mr.current = m;
      m.ondataavailable = (e) => chunks.push(e.data);
      m.onstop = () => {
        const type = m.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        setAudio({ url: URL.createObjectURL(blob), file: new File([blob], "voice", { type }) });
        s.getTracks().forEach((x) => x.stop()); setRec(0);
      };
      m.start(); setRec(30);
      const id = setInterval(() => setRec((r) => { if (r <= 1) { clearInterval(id); if (m.state === "recording") m.stop(); return 0; } return r - 1; }), 1000);
    } catch { setRec(0); }
  };
  const publish = async () => {
    setBusy(true); setErr(""); setDone(false);
    try {
      const fd = new FormData(); fd.set("token", token); fd.set("subject", subject.trim()); fd.set("text", text.trim());
      if (file) fd.set("file", file.file);
      if (audio) fd.set("voice", audio.file);
      await call(createTaskFn({ data: fd }));
      setDone(true); setText(""); setFile(undefined); setAudio(undefined); onDone();
    } catch (e) { setErr(t(errKey(e))); } finally { setBusy(false); }
  };
  return (
    <Sheet title={t("newTask")} onClose={onClose}>
      <div><Label>{t("subject")}</Label><input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div><Label>{t("taskText")}</Label><textarea className="field h-28" value={text} onChange={(e) => setText(e.target.value)} /></div>
      <FilePick label={t("attach")} value={file?.file.type.startsWith("image/") ? file.url : undefined} onChange={(url, f) => setFile({ url, file: f })} accept="image/*,video/*" />
      {file && !file.file.type.startsWith("image/") && <p className="text-[12px] font-bold text-success">✔ {file.file.name}</p>}
      <Btn variant="ink" className="w-full" onClick={() => rec ? mr.current?.stop() : void record()}>🎙 {rec ? `${t("recording")} ${rec}s` : t("voice")}</Btn>
      {audio && <audio src={audio.url} controls className="w-full" />}
      <Btn className="w-full" disabled={!text.trim() || !subject.trim() || busy} onClick={() => void publish()}>{busy ? "…" : t("publish")}</Btn>
      {done && <p className="font-bold text-success">{t("published")}</p>}
      {err && <p className="font-bold text-destructive">{err}</p>}
    </Sheet>
  );
}

/* ---------------- questions, notebook ---------------- */
export function Help({ onClose }: P) {
  const { t } = useT();
  const { token, me } = useAuth();
  const list = useServer((tk) => call(questionsFn({ data: { token: tk } })));
  const [q, setQ] = useState(""); const [err, setErr] = useState("");
  const [r, setR] = useState<Record<string, string>>({});
  const ask = async () => { try { await call(askFn({ data: { token, text: q.trim() } })); setQ(""); list.reload(); } catch (e) { setErr(t(errKey(e))); } };
  const reply = async (id: string) => { try { await call(replyFn({ data: { token, questionId: id, text: (r[id] ?? "").trim() } })); setR({ ...r, [id]: "" }); list.reload(); } catch (e) { setErr(t(errKey(e))); } };
  return (
    <Sheet title={t("help")} onClose={onClose}>
      {me.role === "student" && <>
        <Label>{t("askAnon")}</Label>
        <textarea className="field h-24" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("writeHere")} />
        <Btn className="w-full" disabled={q.trim().length < 2} onClick={() => void ask()}>{t("send")}</Btn>
      </>}
      {err && <p className="font-bold text-destructive">{err}</p>}
      {list.loading && <Loading />}
      {list.data?.length === 0 && <p className="text-[13px] text-muted-foreground">{t("noQuestions")}</p>}
      {list.data?.map((x) => (
        <Card key={x.id} className="space-y-2">
          <p className="font-bold">{x.text}{x.mine && <span className="ml-2 text-[10px] opacity-60">({t("mine")})</span>}</p>
          {x.replies.map((a, i) => <p key={i} className="border-l-2 border-acid pl-2 text-[13px]">{a.text}{a.mine && <span className="ml-2 text-[10px] opacity-60">({t("mine")})</span>}</p>)}
          {me.role === "student" && <div className="flex gap-2"><input className="field flex-1" value={r[x.id] ?? ""} onChange={(e) => setR({ ...r, [x.id]: e.target.value })} placeholder={t("reply")} /><Btn className="px-3" disabled={!(r[x.id] ?? "").trim()} onClick={() => void reply(x.id)}>→</Btn></div>}
        </Card>
      ))}
    </Sheet>
  );
}

export function Forgot({ onClose }: P) {
  const { t } = useT();
  const { token } = useAuth();
  const nb = useServer((tk) => call(notebookFn({ data: { token: tk } })));
  const [text, setText] = useState<string | null>(null);
  const [ok, setOk] = useState(false); const [err, setErr] = useState("");
  const value = text ?? nb.data ?? "";
  const save = async () => { try { await call(saveNotebookFn({ data: { token, text: value } })); setOk(true); } catch (e) { setErr(t(errKey(e))); } };
  return (
    <Sheet title={t("forgot")} onClose={onClose}>
      {nb.loading ? <Loading /> : <>
        <textarea className="field h-64 bg-[repeating-linear-gradient(transparent_0_27px,var(--border)_27px_28px)] leading-[28px]" value={value} onChange={(e) => { setText(e.target.value); setOk(false); }} placeholder={t("writeHere")} />
        <Btn className="w-full" onClick={() => void save()}>{t("save")}</Btn>
      </>}
      {ok && <p className="font-bold text-success">{t("saved")}</p>}
      {err && <p className="font-bold text-destructive">{err}</p>}
    </Sheet>
  );
}

/* ---------------- canteen, bazaar, rewards ---------------- */
export function Canteen({ onClose }: P) {
  const { t } = useT();
  const { token } = useAuth();
  const [cart, setCart] = useState<string[]>([]); const [done, setDone] = useState(false); const [err, setErr] = useState("");
  const total = cart.reduce((s, id) => s + (MENU.find((m) => m.id === id)?.price ?? 0), 0);
  const order = async () => { try { await call(orderFn({ data: { token, items: cart } })); setDone(true); setCart([]); } catch (e) { setErr(t(errKey(e))); } };
  return (
    <Sheet title={t("canteen")} onClose={onClose}>
      {MENU.map((m) => (
        <button key={m.id} onClick={() => { setDone(false); setCart([...cart, m.id]); }} className="clip-card flex w-full items-center gap-3 bg-card p-3 ring-1 ring-ink/10">
          <span className="text-2xl">{m.emoji}</span><span className="flex-1 text-left font-bold">{m.name}</span><span className="text-[13px]">{m.price.toLocaleString()}</span>
          <span className="clip-chip bg-acid px-2 py-0.5 text-[12px] font-bold">+{cart.filter((c) => c === m.id).length || ""}</span>
        </button>
      ))}
      <Btn className="w-full" disabled={!cart.length} onClick={() => void order()}>{t("order")} · {total.toLocaleString()}</Btn>
      {cart.length > 0 && <button className="text-[12px] underline" onClick={() => setCart([])}>{t("clear")}</button>}
      {done && <p className="font-bold text-success">{t("ordered")}</p>}
      {err && <p className="font-bold text-destructive">{err}</p>}
    </Sheet>
  );
}

export function Bazaar({ onClose }: P) {
  const { t } = useT();
  const { token, me } = useAuth();
  const list = useServer((tk) => call(marketFn({ data: { token: tk } })));
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState(""); const [price, setPrice] = useState(""); const [swap, setSwap] = useState(false);
  const [err, setErr] = useState("");
  const sell = async () => {
    try { await call(sellFn({ data: { token, title: title.trim(), price: swap ? null : Number(price) || 0, kind: swap ? "swap" : "sell" } })); setForm(false); setTitle(""); setPrice(""); list.reload(); } catch (e) { setErr(t(errKey(e))); }
  };
  const reserve = async (id: string) => { try { await call(reserveFn({ data: { token, itemId: id } })); list.reload(); } catch (e) { setErr(t(errKey(e))); } };
  return (
    <Sheet title={t("bazaar")} onClose={onClose}>
      {list.loading && <Loading />}
      {list.data?.length === 0 && <p className="text-[13px] text-muted-foreground">{t("noItems")}</p>}
      <div className="grid grid-cols-2 gap-3">
        {list.data?.map((x) => (
          <Card key={x.id}>
            <div className="text-[13px] font-bold">{x.title}</div>
            <div className="text-[11px] text-muted-foreground">{x.seller}</div>
            <div className="mt-1 font-display text-lg">{x.kind === "swap" ? t("exchange") : `${(x.price ?? 0).toLocaleString()}`}</div>
            {x.mine ? <p className="mt-2 text-[11px] font-bold">{x.reserved ? `${t("reserved")}: ${x.reservedBy}` : t("mine")}</p>
              : x.reserved ? <p className="mt-2 text-[11px] font-bold">{t("reserved")}</p>
              : me.role === "student" ? <Btn className="mt-2 w-full py-2 text-[12px]" onClick={() => void reserve(x.id)}>{x.kind === "swap" ? t("exchange") : t("reserve")}</Btn> : null}
          </Card>
        ))}
      </div>
      {err && <p className="font-bold text-destructive">{err}</p>}
      {me.role === "student" && (form ? (
        <Card className="space-y-2">
          <input className="field" placeholder={t("sellTitle")} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="flex items-center gap-2 text-[13px] font-semibold"><input type="checkbox" checked={swap} onChange={(e) => setSwap(e.target.checked)} className="size-4 accent-ink" />{t("exchange")}</label>
          {!swap && <input className="field" type="number" placeholder={t("price")} value={price} onChange={(e) => setPrice(e.target.value)} />}
          <Btn className="w-full" disabled={title.trim().length < 2} onClick={() => void sell()}>{t("send")}</Btn>
        </Card>
      ) : <Btn variant="ink" className="w-full" onClick={() => setForm(true)}>+ {t("sell")}</Btn>)}
    </Sheet>
  );
}

export function Rewards({ onClose, onDone }: P & { onDone: () => void }) {
  const { t } = useT();
  const { token, me } = useAuth();
  const [msg, setMsg] = useState("");
  const buy = async (id: string) => { try { await call(buyRewardFn({ data: { token, itemId: id } })); setMsg(t("bought")); onDone(); } catch (e) { setMsg(t(errKey(e))); } };
  return (
    <Sheet title={t("rewards")} onClose={onClose}>
      <Card dark className="flex items-center justify-between"><span>{t("coins")}</span><span className="font-display text-3xl text-acid">{me.coins}</span></Card>
      {SHOP.map((s) => (
        <button key={s.id} onClick={() => void buy(s.id)} className="clip-card flex w-full items-center gap-3 bg-card p-3 ring-1 ring-ink/10">
          <span className="text-2xl">{s.emoji}</span><span className="flex-1 text-left font-bold">{s.name}</span><span className="clip-chip bg-acid px-2 py-1 text-[12px] font-extrabold">{s.price}</span>
        </button>
      ))}
      {msg && <p className="font-bold">{msg}</p>}
    </Sheet>
  );
}

export function Rating({ onClose }: P) {
  const { t } = useT();
  const list = useServer((token) => call(ratingFn({ data: { token } })));
  return (
    <Sheet title={t("rating")} onClose={onClose}>
      <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">🔥 {t("regularity")} · {t("notGrades")}</p>
      {list.loading && <Loading />}
      {list.data?.length === 0 && <p className="text-[13px] text-muted-foreground">{t("noItems")}</p>}
      {list.data?.map((x, i) => (
        <div key={i} className={`clip-card flex items-center gap-3 p-3 ${x.me ? "bg-acid" : i === 0 ? "bg-ink text-paper" : "bg-card ring-1 ring-ink/10"}`}>
          <span className="w-8 font-display text-2xl">{i + 1}</span><span className="flex-1 font-bold">{x.name}{x.me ? ` (${t("you")})` : ""}</span><span className="text-[13px] font-bold">{x.days} {t("days")}</span>
        </div>
      ))}
    </Sheet>
  );
}

/* ---------------- weekly report with signature ---------------- */
export function WeeklyReport({ onClose }: P) {
  const { t } = useT();
  const { token, me } = useAuth();
  const stats = useStatsData();
  const sigs = useServer((tk) => call(signaturesFn({ data: { token: tk } })));
  const canvas = useRef<HTMLCanvasElement>(null);
  const pts = useRef<{ x: number; y: number; t: number; p: number }[]>([]);
  const drawing = useRef(false);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const current = sigs.data?.journal.find((j) => j.week === sigs.data?.week);

  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) * (400 / r.width), y: (e.clientY - r.top) * (150 / r.height) }; };
  const down = (e: React.PointerEvent) => { drawing.current = true; const c = canvas.current!.getContext("2d")!; const { x, y } = pos(e); c.beginPath(); c.moveTo(x, y); pts.current.push({ x, y, t: performance.now(), p: e.pressure || 0.5 }); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return; const c = canvas.current!.getContext("2d")!; const { x, y } = pos(e);
    c.lineWidth = 1.5 + (e.pressure || 0.5) * 3; c.lineCap = "round"; c.strokeStyle = getComputedStyle(document.body).color; c.lineTo(x, y); c.stroke();
    pts.current.push({ x, y, t: performance.now(), p: e.pressure || 0.5 });
  };
  const clear = () => { canvas.current!.getContext("2d")!.clearRect(0, 0, 999, 999); pts.current = []; };
  const sign = async () => {
    const p = pts.current; if (p.length < 10) return;
    let dist = 0; for (let i = 1; i < p.length; i++) dist += Math.hypot(p[i]!.x - p[i - 1]!.x, p[i]!.y - p[i - 1]!.y);
    const speed = Math.round(dist / ((p[p.length - 1]!.t - p[0]!.t) / 1000 || 1));
    const pressure = +(p.reduce((s, q) => s + q.p, 0) / p.length).toFixed(2);
    setBusy(true); setErr("");
    try { await call(signReportFn({ data: { token, speed, pressure, img: canvas.current!.toDataURL("image/png") } })); clear(); sigs.reload(); }
    catch (e) { setErr(t(errKey(e))); } finally { setBusy(false); }
  };
  const ok = sigs.data?.signed;

  return (
    <Sheet title={t("weekly")} onClose={onClose}>
      <div id="report" className="clip-card space-y-3 bg-card p-4 ring-1 ring-ink/10">
        <div className="flex items-start justify-between">
          <div><Label>{t("everyFriday")}</Label><div className="font-display text-2xl uppercase">{me.child?.name} · {sigs.data?.week ?? ""}</div></div>
          <span className={`clip-chip px-2 py-1 text-[11px] font-extrabold ${ok ? "bg-success text-paper" : "bg-destructive text-paper"}`}>{ok ? t("confirmed") : t("unconfirmed")}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-muted p-2"><div className="font-display text-2xl">{stats.data?.avg ?? "—"}</div><div className="text-[10px]">{t("stars")}</div></div>
          <div className="bg-muted p-2"><div className="font-display text-2xl">{stats.data?.hand == null ? "—" : `${stats.data.hand}%`}</div><div className="text-[10px]">{t("handwriting")}</div></div>
          <div className="bg-muted p-2"><div className="font-display text-2xl">{stats.data?.days ?? 0}/7</div><div className="text-[10px]">{t("regularity")}</div></div>
        </div>
        {current && <img src={current.img} alt="" className="h-20" />}
        {current && <p className={`text-[13px] font-bold ${current.forged ? "text-destructive" : "text-success"}`}>{current.forged ? t("forgery") : t("genuine")}</p>}
      </div>
      <div className="no-print">
        <Label>{t("signHere")}</Label>
        <canvas ref={canvas} width={400} height={150} className="w-full touch-none bg-card ring-1 ring-ink/20" onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} onPointerLeave={() => (drawing.current = false)} />
        <div className="mt-2 flex gap-2"><Btn variant="ink" onClick={clear}>{t("clear")}</Btn><Btn className="flex-1" disabled={busy} onClick={() => void sign()}>{busy ? "…" : t("sign")}</Btn></div>
        {err && <p className="mt-2 font-bold text-destructive">{err}</p>}
        <Btn variant="ink" className="mt-2 w-full" onClick={() => window.print()}>⬇ {t("downloadPdf")}</Btn>
      </div>
      <div className="no-print">
        <Label>🔒 {t("journal")}</Label>
        {sigs.data?.journal.map((j) => (
          <div key={j.hash} className="border-b py-2 font-mono text-[11px]">
            <span className={j.forged ? "text-destructive" : "text-success"}>●</span> {j.week} · {new Date(j.at).toLocaleString()} · {t("speed")} {j.speed} · {t("pressure")} {Number(j.pressure).toFixed(2)}<br /><span className="opacity-50">#{j.hash} ← #{j.prev}</span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/* ---------------- teacher dashboard blocks ---------------- */
export function Signals() {
  const { t } = useT();
  const s = useServer((token) => call(signalsFn({ data: { token } })));
  return (
    <Card><Label>{t("signals")}</Label>
      {s.data?.length ? s.data.map((x, i) => <p key={i} className="text-[13px] font-bold text-destructive">⚠ {x.child} · {new Date(x.at).toLocaleDateString()}</p>) : <p className="text-[13px] text-success">✔ {t("noSignals")}</p>}
    </Card>
  );
}

export function Announcements() {
  const { t } = useT();
  const { token, me } = useAuth();
  const list = useServer((tk) => call(announcementsFn({ data: { token: tk } })));
  const [text, setText] = useState(""); const [err, setErr] = useState("");
  const post = async () => { try { await call(createAnnouncementFn({ data: { token, text: text.trim() } })); setText(""); list.reload(); } catch (e) { setErr(t(errKey(e))); } };
  const sign = async (id: string) => { try { await call(signAnnouncementFn({ data: { token, id } })); list.reload(); } catch (e) { setErr(t(errKey(e))); } };
  return (
    <Card className="space-y-2"><Label>📢 {t("announcements")}</Label>
      {list.data?.length === 0 && <p className="text-[13px] text-muted-foreground">{t("noAnnouncements")}</p>}
      {list.data?.map((a) => (
        <div key={a.id}><p className="font-bold">{a.text}</p><p className="text-[10px] opacity-60">{new Date(a.at).toLocaleDateString()}</p>
          {me.role === "parent" && <Btn className="mt-2 w-full py-2" disabled={a.signed} onClick={() => void sign(a.id)}>{a.signed ? "✔ " + t("confirmed") : t("sign")}</Btn>}
        </div>
      ))}
      {me.role === "teacher" && <><textarea className="field h-20" placeholder={t("newAnnouncement")} value={text} onChange={(e) => setText(e.target.value)} /><Btn className="w-full" disabled={text.trim().length < 2} onClick={() => void post()}>{t("publish")}</Btn></>}
      {err && <p className="font-bold text-destructive">{err}</p>}
    </Card>
  );
}

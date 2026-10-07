import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { I18nProvider, LANGS, useT, type TKey } from "@/lib/i18n";
import { AuthProvider, codeKey, useAuth, useServer } from "@/lib/auth";
import { call } from "@/lib/errors";
import { helpRequestsFn, tasksFn } from "@/lib/api";
import { Header, Onboarding } from "@/components/school/Onboarding";
import { Btn, Card, Label, Sheet } from "@/components/school/ui";
import * as F from "@/components/school/Features";
import { BellButton, NotificationsSheet, useNotifications } from "@/components/school/Notifications";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Зумрад — умная школа с AI" },
      { name: "description", content: "Домашка с AI-проверкой, рейтинг регулярности, почерк, недельный отчёт с подписью родителей." },
      { property: "og:title", content: "Зумрад — умная школа с AI" },
      { property: "og:description", content: "Ученик, учитель и родитель в одном приложении." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#c8ff00" },
    ],
  }),
  component: () => <I18nProvider><Root /></I18nProvider>,
});

function Root() {
  const { t } = useT();
  return (
    <AuthProvider
      loading={<div className="grid min-h-screen place-items-center bg-ink font-display text-2xl uppercase text-acid">{t("connecting")}</div>}
      anon={<Onboarding />}
      failed={(code, retry) => (
        <div className="grid min-h-screen place-items-center bg-ink p-6 text-center text-paper">
          <div className="space-y-4"><p className="font-bold">{t(codeKey(code))}</p><Btn onClick={retry}>{t("retry")}</Btn></div>
        </div>
      )}
    >
      <Shell />
    </AuthProvider>
  );
}

type Open = null | "check" | "help" | "forgot" | "videos" | "requests" | "canteen" | "bazaar" | "rewards" | "rating" | "hand" | "weekly" | "settings" | "task" | "notifs";

function Shell() {
  const { t, lang, setLang } = useT();
  const { me, refresh, logout } = useAuth();
  const [open, setOpen] = useState<Open>(null);
  const [tab, setTab] = useState(0);
  const notifs = useNotifications();
  const [running, setRunning] = useState<number | null>(null);
  const [secs, setSecs] = useState(0);
  useEffect(() => { if (running === null) return; const id = setInterval(() => setSecs(Math.floor((Date.now() - running) / 1000)), 500); return () => clearInterval(id); }, [running]);

  const isTeacher = me.role === "teacher";
  const stats = F.useStatsData();
  const tasks = useServer((token) => call(tasksFn({ data: { token } })));
  const reqs = useServer((token) => call(helpRequestsFn({ data: { token } })));
  const task = tasks.data?.[0] ?? null;
  const openReqs = reqs.data?.filter((x) => !x.hasVideo).length ?? 0;
  const first = me.fullName.split(" ").slice(-1)[0] || me.fullName;
  const close = () => setOpen(null);
  const changed = () => { void refresh(); stats.reload(); tasks.reload(); reqs.reload(); };
  const s = stats.data;

  const tabs: [string, TKey, Open][] = me.role === "student"
    ? [["🏠", "home", null], ["📋", "homework", "check"], ["🛒", "bazaar", "bazaar"], ["⚙️", "settings", "settings"]]
    : isTeacher ? [["🏠", "home", null], ["➕", "newTask", "task"], ["🏆", "rating", "rating"], ["⚙️", "settings", "settings"]]
    : [["🏠", "home", null], ["📄", "weekly", "weekly"], ["✍", "handwriting", "hand"], ["⚙️", "settings", "settings"]];

  return (
    <div className="mx-auto min-h-screen max-w-[440px] pb-24">
      <div className="relative overflow-hidden bg-ink">
        <div className="stripes pointer-events-none absolute inset-0 opacity-60" />
        <Header />
        <div className="clip-lean relative px-5 pb-8 pt-1">
          <div className="absolute right-5 top-1"><BellButton unread={notifs.unread} onClick={() => setOpen("notifs")} /></div>
          <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-paper/50">{t(me.role)} · {me.school ?? ""}{me.cls ? ` · ${me.cls}` : ""}{isTeacher ? ` · ✔ ${t("verified")}` : ""}</div>
          <div className="mt-1 font-display text-[34px] uppercase leading-none text-paper">{t("hello")}, <span className="text-acid">{first}!</span></div>
        </div>
      </div>

      <div className="space-y-4 px-4 pt-5">
        {me.role === "student" && <>
          <Card dark className="relative overflow-hidden">
            <div className="stripes pointer-events-none absolute inset-y-0 right-0 w-24 opacity-40" />
            <div className="relative flex items-start justify-between">
              <div><div className="text-[9px] uppercase tracking-[0.22em] text-acid">{t("todayHw")}</div><div className="mt-1 text-[20px] font-bold">{task ? task.subject : t("noTasks")}</div>{task && <div className="mt-1 line-clamp-3 text-[12px] text-paper/70">{task.text}</div>}</div>
              {s?.avg != null && <div className="text-right text-[11px] text-paper/60">{t("avgStars")}<div className="text-[18px] font-bold text-acid">{s.avg}★</div></div>}
            </div>
            {task && <F.TaskMedia task={task} />}
            <div className="relative mt-3 flex flex-wrap gap-2 text-[11px] text-paper/60"><span className="px-2 py-0.5 text-acid ring-1 ring-acid/40">{t("aiReady")}</span></div>
            <div className="relative mt-4 flex gap-2">
              <Btn className="flex-1" onClick={() => running === null ? (setSecs(0), setRunning(Date.now())) : setRunning(null)}>
                {running === null ? (secs ? `${t("start")} · ${fmt(secs)}` : t("start")) : `${t("stop")} · ${fmt(secs)}`}
              </Btn>
              <Btn variant="ghost" onClick={() => { setRunning(null); setOpen("check"); }}>{t("photoNotebook")}</Btn>
            </div>
          </Card>

          <div>
            <div className="flex items-center justify-between">
              <button onClick={() => setOpen("rating")} className="clip-chip bg-acid px-2.5 py-1 text-[11px] font-extrabold">🔥 {t("regularity")} · {s?.days ?? 0}</button>
              <button onClick={() => setOpen("rewards")} className="flex items-center gap-1 text-[12px] font-bold"><span className="clip-coin grid size-5 place-items-center bg-acid font-display text-[9px]">₵</span>{me.coins}</button>
            </div>
            <div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5, 6, 7].map((i) => <span key={i} className={`h-1.5 flex-1 ${i <= (s?.days ?? 0) ? "bg-acid" : "bg-ink/15"}`} />)}</div>
          </div>

          <div>
            <Label>{t("quick")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {([["💬", "help", "help"], ["📓", "forgot", "forgot"], ["🎬", "videoFromTeacher", "videos"], ["🍽️", "canteen", "canteen"], ["🎁", "rewards", "rewards"]] as [string, TKey, Open][]).map(([e, k, o]) => (
                <button key={k} onClick={() => setOpen(o)} className="clip-card bg-card p-2.5 text-left ring-1 ring-ink/5 active:scale-95"><span className="text-[18px]">{e}</span><div className="mt-1 text-[11px] font-bold leading-tight">{t(k)}</div></button>
              ))}
            </div>
          </div>
          <HandCard score={s?.hand ?? null} onClick={() => setOpen("hand")} />
          <F.Announcements />
        </>}

        {isTeacher && <>
          <Btn className="w-full py-4 font-display text-xl uppercase" onClick={() => setOpen("task")}>+ {t("newTask")}</Btn>
          <button onClick={() => setOpen("requests")} className="clip-card block w-full bg-ink p-4 text-left text-paper">
            <Label>{t("didntUnderstand")}</Label>
            <p className="font-display text-3xl uppercase text-acid">{openReqs} <span className="text-[14px] text-paper/70">{t("needsHelp")}</span></p>
          </button>
          <F.Signals />
          <F.Announcements />
          <Btn variant="ink" className="w-full" onClick={() => setOpen("rating")}>🏆 {t("rating")}</Btn>
        </>}

        {me.role === "parent" && <>
          <div className="grid grid-cols-3 gap-2">
            <Card dark className="text-center"><div className="font-display text-2xl text-acid">{s?.minutes ?? 0}′</div><div className="text-[10px]">{t("timeSpent")}</div></Card>
            <Card dark className="text-center"><div className="font-display text-2xl text-acid">{s?.avg ?? "—"}★</div><div className="text-[10px]">{t("stars")}</div></Card>
            <Card dark className="text-center"><div className="font-display text-2xl text-acid">{s?.hand == null ? "—" : `${s.hand}%`}</div><div className="text-[10px]">✍</div></Card>
          </div>
          {s && <Card className={`flex items-center gap-3 ring-2 ${s.doneToday ? "ring-success/50" : "ring-destructive/40"}`}><span className="text-2xl">{s.doneToday ? "✅" : "🔔"}</span><span className="font-bold">{s.doneToday ? t("doneToday") : t("reminder")}</span></Card>}
          <button onClick={() => setOpen("videos")} className="clip-card block w-full bg-ink p-4 text-left text-paper"><Label>{t("videoFromTeacher")}</Label><p className="font-bold text-acid">🎬 {t("videoFromTeacher")} →</p></button>
          <button onClick={() => setOpen("weekly")} className="clip-card w-full bg-acid p-4 text-left"><div className="font-display text-2xl uppercase">📄 {t("weekly")}</div><div className="text-[12px] font-semibold">{t("signHere")} →</div></button>
          <F.Announcements />
          <HandCard score={s?.hand ?? null} onClick={() => setOpen("hand")} />
        </>}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 bg-ink/95">
        <div className="mx-auto flex max-w-[440px]">
          {tabs.map(([e, k, o], i) => (
            <button key={k} onClick={() => { setTab(i); setOpen(o); }} className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold ${tab === i && !open || open === o && o ? "text-acid" : "text-paper/45"}`}>
              <span className="text-[16px]">{e}</span>{t(k)}
            </button>
          ))}
        </div>
      </nav>

      {open === "notifs" && <NotificationsSheet items={notifs.items} markRead={notifs.markRead} onClose={close} />}
      {open === "check" && <F.HwCheck onClose={close} seconds={secs} task={task} onDone={changed} />}
      {open === "help" && <F.Help onClose={close} />}
      {open === "forgot" && <F.Forgot onClose={close} />}
      {open === "videos" && <F.Videos onClose={close} />}
      {open === "requests" && <F.TeacherRequests onClose={close} onDone={changed} />}
      {open === "canteen" && <F.Canteen onClose={close} />}
      {open === "bazaar" && <F.Bazaar onClose={close} />}
      {open === "rewards" && <F.Rewards onClose={close} onDone={changed} />}
      {open === "rating" && <F.Rating onClose={close} />}
      {open === "hand" && <F.Handwriting onClose={close} onDone={changed} />}
      {open === "weekly" && <F.WeeklyReport onClose={close} />}
      {open === "task" && <F.TeacherTask onClose={close} onDone={changed} />}
      {open === "settings" && (
        <Sheet title={t("settings")} onClose={close}>
          {me.role !== "parent" && <Card dark><Label>{t("yourCode")}</Label><div className="font-display text-4xl tracking-[0.3em] text-acid">{me.code}</div><p className="mt-1 text-[12px] opacity-70">{t(me.role === "teacher" ? "codeHintTeacher" : "codeHintStudent")}</p></Card>}
          {me.teacher && <Card><Label>{t("linkedTeacher")}</Label><p className="font-bold">{me.teacher.name}{me.teacher.subject ? ` · ${me.teacher.subject}` : ""}</p></Card>}
          {me.child && <Card><Label>{t("linkedChild")}</Label><p className="font-bold">{me.child.name}{me.child.cls ? ` · ${me.child.cls}` : ""}</p></Card>}
          <Label>{t("language")}</Label>
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)} className={`clip-card flex w-full items-center justify-between p-4 font-bold ${lang === l.code ? "bg-acid" : "bg-card ring-1 ring-ink/10"}`}>{l.label}{lang === l.code && <span>✔</span>}</button>
          ))}
          <Btn variant="ink" className="w-full" onClick={() => { close(); logout(); }}>{t("logout")}</Btn>
        </Sheet>
      )}
    </div>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function HandCard({ onClick, score }: { onClick: () => void; score: number | null }) {
  const { t } = useT();
  return (
    <button onClick={onClick} className="clip-card block w-full bg-card p-3 text-left ring-1 ring-ink/5">
      <div className="flex justify-between"><Label>{t("handwriting")}</Label><span className="font-display">{score === null ? "—" : `${score}%`}</span></div>
      <div className="h-1.5 bg-ink/10"><div className="h-full bg-acid" style={{ width: `${score ?? 0}%` }} /></div>
      <div className="mt-2 text-[11px] text-muted-foreground">{t("checkHw")} →</div>
    </button>
  );
}

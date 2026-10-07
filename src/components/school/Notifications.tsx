import { useCallback, useEffect, useRef, useState } from "react";
import { notificationsFn, readNotificationsFn } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ApiErr, call } from "@/lib/errors";
import { useT, type TKey } from "@/lib/i18n";
import { Btn, Card, Sheet } from "./ui";

export type Notif = { id: string; kind: string; meta: Record<string, string | number>; read: boolean; at: string };

const KIND: Record<string, TKey> = {
  help_request: "nHelp", help_answered: "nHelpAnswered", new_task: "nTask", announcement: "nAnnouncement",
  question_reply: "nReply", item_reserved: "nReserved", forged_signature: "nForged", homework_done: "nHomework",
};
const POLL_MS = 30_000;

export function notifText(t: (k: TKey) => string, n: Notif) {
  const key = KIND[n.kind];
  if (!key) return "";
  return t(key).replace(/\{(\w+)\}/g, (_, k: string) => String(n.meta?.[k] ?? ""));
}

async function showSystem(title: string, body: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker?.ready;
    if (reg) await reg.showNotification(title, { body, icon: "/favicon.ico", tag: "zumrad" });
    else new Notification(title, { body });
  } catch { /* system notifications are optional */ }
}

/** Polls the server; when the app is in the background, new items also appear as phone/desktop notifications. */
export function useNotifications() {
  const { token, logout } = useAuth();
  const { t } = useT();
  const [items, setItems] = useState<Notif[]>([]);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const list = (await call(notificationsFn({ data: { token } }))) as Notif[];
      if (seen.current === null) seen.current = new Set(list.map((x) => x.id));
      else {
        const fresh = list.filter((x) => !x.read && !seen.current!.has(x.id));
        fresh.forEach((x) => seen.current!.add(x.id));
        if (document.visibilityState !== "visible") fresh.forEach((x) => void showSystem("Зумрад", notifText(t, x)));
      }
      setItems(list);
    } catch (e) {
      if (e instanceof ApiErr && e.code === "unauthorized") logout();
    }
  }, [token, logout, t]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const markRead = useCallback(async () => {
    setItems((l) => l.map((x) => ({ ...x, read: true })));
    try { await call(readNotificationsFn({ data: { token } })); } catch { /* retried on next open */ }
  }, [token]);

  return { items, unread: items.filter((x) => !x.read).length, markRead };
}

export function BellButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="notifications" className="clip-chip relative bg-acid px-3 py-1.5 text-[16px] leading-none text-ink active:scale-95">
      🔔
      {unread > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-extrabold leading-[18px] text-white">{unread > 9 ? "9+" : unread}</span>}
    </button>
  );
}

export function NotificationsSheet({ items, onClose, markRead }: { items: Notif[]; onClose: () => void; markRead: () => void }) {
  const { t } = useT();
  const [perm, setPerm] = useState<NotificationPermission | "none">(typeof Notification === "undefined" ? "none" : Notification.permission);
  useEffect(() => { markRead(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const shown = items.map((n) => ({ n, text: notifText(t, n) })).filter((x) => x.text);
  return (
    <Sheet title={t("notifications")} onClose={onClose}>
      {perm === "default" && <Btn className="w-full" onClick={() => void Notification.requestPermission().then(setPerm)}>🔔 {t("enableAlerts")}</Btn>}
      {perm === "denied" && <p className="text-[12px] text-muted-foreground">{t("alertsBlocked")}</p>}
      {!shown.length && <p className="py-6 text-center text-[13px] text-muted-foreground">{t("noNotifications")}</p>}
      {shown.map(({ n, text }) => (
        <Card key={n.id} className={n.read ? "" : "ring-2 ring-acid"}>
          <div className="text-[13px] font-bold">{text}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">{new Date(n.at).toLocaleString()}</div>
        </Card>
      ))}
    </Sheet>
  );
}

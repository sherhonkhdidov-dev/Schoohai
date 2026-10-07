import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";

export function Btn({ children, onClick, variant = "acid", className = "", disabled, type = "button" }: { children: ReactNode; onClick?: () => void; variant?: "acid" | "ink" | "ghost"; className?: string; disabled?: boolean; type?: "button" | "submit" }) {
  const v = { acid: "bg-acid text-ink", ink: "bg-ink text-paper", ghost: "bg-paper/10 text-paper ring-1 ring-paper/25" }[variant];
  return <button type={type} disabled={disabled} onClick={onClick} className={`clip-btn px-4 py-3 text-[14px] font-extrabold transition active:scale-[.98] disabled:opacity-40 ${v} ${className}`}>{children}</button>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60" onClick={onClose}>
      <div className="rise max-h-[92vh] w-full max-w-[440px] overflow-y-auto bg-background pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="relative sticky top-0 z-10 flex items-center justify-between bg-ink px-5 py-4 text-paper">
          <div className="stripes pointer-events-none absolute inset-0 opacity-40" />
          <h2 className="relative font-display text-[24px] uppercase leading-none">{title}</h2>
          <button onClick={onClose} className="relative clip-chip bg-acid px-3 py-1 text-[12px] font-bold text-ink">{t("close")}</button>
        </div>
        <div className="space-y-4 px-5 pt-5">{children}</div>
      </div>
    </div>
  );
}

export function Card({ children, dark, className = "" }: { children: ReactNode; dark?: boolean; className?: string }) {
  return <div className={`clip-card p-4 ${dark ? "bg-ink text-paper" : "bg-card ring-1 ring-ink/5"} ${className}`}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.25em] text-muted-foreground">{children}</div>;
}

export function Stars({ n, className = "" }: { n: number; className?: string }) {
  return <span className={className}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? "text-acid" : "opacity-30"}>★</span>)}</span>;
}

export function FilePick({ label, value, onChange, accept = "image/*" }: { label: string; value?: string | undefined; onChange: (url: string, file: File) => void; accept?: string }) {
  return (
    <label className="clip-card flex cursor-pointer items-center gap-3 bg-card p-3 ring-1 ring-ink/10">
      {value ? <img src={value} alt="" className="h-14 w-14 object-cover" /> : <span className="grid h-14 w-14 place-items-center bg-muted text-xl">📷</span>}
      <span className="text-[13px] font-bold">{label}</span>
      {value && <span className="ml-auto text-success">✔</span>}
      <input type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(URL.createObjectURL(f), f); }} />
    </label>
  );
}

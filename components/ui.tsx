import clsx from "clsx";
import type { ReactNode } from "react";
import { STATUSES, type Status } from "@/lib/types";

/** Jauge de score : huit barres arrondies, remplies dans l'orange de marque. */
export function Gauge({ percent, className }: { percent: number; className?: string }) {
  const cells = 8;
  const on = Math.round((Math.max(0, Math.min(100, percent)) / 100) * cells);
  return (
    <span className={clsx("gauge", className)} aria-hidden="true">
      {Array.from({ length: cells }, (_, i) => (
        <i key={i} data-on={i < on ? "1" : "0"} />
      ))}
    </span>
  );
}

export function Score({ percent, disqualified }: { percent: number; disqualified?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Gauge percent={disqualified ? 0 : percent} />
      <span
        className={clsx(
          "text-[13px] font-semibold tabular-nums",
          disqualified ? "text-custom2 line-through" : "text-black"
        )}
      >
        {percent}
      </span>
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("eyebrow", className)}>{children}</p>;
}

/** Chaque statut a sa pastille : le vert de marque pour les profils retenus. */
const STATUS_STYLE: Record<Status, string> = {
  nouveau: "border-custom3 bg-white text-custom1",
  en_revue: "border-primaire/30 bg-primaire/10 text-primaire-hover",
  entretien: "border-primaire bg-primaire text-white",
  retenu: "border-secondaire bg-secondaire text-white",
  refuse: "border-custom3 bg-wash text-custom2",
};

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const label = STATUSES.find((s) => s.value === status)?.label ?? status;
  return (
    <span className={clsx("pill text-[12px]", STATUS_STYLE[status], className)}>{label}</span>
  );
}

/** Repère compact dans les listes denses, quand la pastille prendrait trop de place. */
export function StatusDot({ status }: { status: Status }) {
  const tone: Record<Status, string> = {
    nouveau: "bg-custom3",
    en_revue: "bg-primaire/40",
    entretien: "bg-primaire",
    retenu: "bg-secondaire",
    refuse: "bg-custom2/40",
  };
  return <span aria-hidden="true" className={clsx("inline-block h-2.5 w-2.5 shrink-0 rounded-full", tone[status])} />;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-custom3 bg-wash px-6 py-16 text-center">
      <p className="display text-[20px]">{title}</p>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-custom1">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

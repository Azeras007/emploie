import clsx from "clsx";
import type { ReactNode } from "react";

/** Eight-cell gauge — the app's one recurring signature mark. */
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
      <span className={clsx("font-mono text-[12px] tabular-nums", disqualified && "line-through opacity-40")}>
        {percent}
      </span>
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("eyebrow", className)}>{children}</p>;
}

export function StatusDot({ status }: { status: string }) {
  const filled = status === "retenu" || status === "entretien";
  const crossed = status === "refuse";
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "inline-block h-2 w-2 shrink-0 border border-ink",
        filled && "bg-ink",
        crossed && "opacity-25",
        status === "en_revue" && "bg-[linear-gradient(135deg,var(--ink)_50%,transparent_50%)]"
      )}
    />
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-rule px-6 py-20 text-center">
      <p className="display text-[20px]">{title}</p>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-muted">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

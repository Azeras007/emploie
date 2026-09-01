"use client";

import clsx from "clsx";
import { useState, type ReactNode } from "react";

/* Petites briques d'interface communes aux quatre sections des réglages.
   Noir & blanc, filets 1px, aucune arrondi, cibles tactiles ≥ 44px. */

/** Champ étiqueté : libellé mono au-dessus, contrôle en dessous. */
export function Field({
  label,
  hint,
  warning,
  className,
  children,
}: {
  label: string;
  hint?: string;
  warning?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="eyebrow block">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint ? <span className="mt-1.5 block text-[12px] leading-snug text-custom1">{hint}</span> : null}
      {warning ? (
        <span className="mt-1.5 flex items-start gap-1.5 border-l-2 border-primaire pl-2 text-[10px] uppercase leading-[1.5] tracking-[0.12em]">
          {warning}
        </span>
      ) : null}
    </label>
  );
}

/** Case à cocher carrée, libellé mono, zone cliquable haute de 44px. */
export function Check({
  checked,
  onChange,
  label,
  hint,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx("flex min-h-[44px] items-center gap-3 text-left", className)}
    >
      <span
        className={clsx(
          "grid h-[18px] w-[18px] shrink-0 place-items-center border border-primaire transition-colors",
          checked ? "bg-primaire text-sur-primaire" : "bg-paper"
        )}
      >
        {checked ? (
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
            <path d="M2 6.4 4.6 9 10 3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12px] leading-snug text-custom1">{hint}</span> : null}
      </span>
    </button>
  );
}

/** Bouton carré 44×44 pour les actions d'icône (monter / descendre). */
export function SquareBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="grid h-11 w-11 shrink-0 place-items-center border border-custom3 bg-paper text-[13px]
                 transition-colors hover:border-primaire disabled:opacity-25 disabled:hover:border-custom3"
    >
      {children}
    </button>
  );
}

/** Suppression en deux temps : un premier clic arme, le second confirme. */
export function ConfirmButton({
  onConfirm,
  label = "Supprimer",
  confirmLabel = "Confirmer",
  className,
}: {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);

  return (
    <button
      type="button"
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      className={clsx(
        "inline-flex min-h-[44px] select-none items-center px-2 text-[13px] font-semibold transition-colors",
        armed ? "text-ink underline underline-offset-4" : "text-custom1 hover:text-ink",
        className
      )}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/** Bandeau de message (erreur ou succès) — filet + typo, pas de couleur. */
export function Notice({ kind, children }: { kind: "error" | "ok"; children: ReactNode }) {
  return (
    <p
      className={clsx(
        "border-l-2 py-1 pl-3 text-[11px] uppercase leading-[1.6] tracking-[0.12em]",
        kind === "error" ? "border-primaire text-ink" : "border-custom3 text-custom1"
      )}
    >
      {children}
    </p>
  );
}

/** Convertit une saisie en nombre, ou undefined si le champ est vide. */
export function numOrUndef(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

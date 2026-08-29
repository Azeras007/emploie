"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";

const LINKS = [
  { href: "/admin", label: "Dossiers" },
  { href: "/admin/reglages", label: "Réglages" },
];

export default function AdminNav({
  username,
  brand,
  ephemeral,
  problem,
  seen,
}: {
  username: string;
  brand: string;
  ephemeral?: boolean;
  problem?: string;
  seen?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/candidats") : pathname.startsWith(href);

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.replace("/connexion");
    router.refresh();
  }

  return (
    <>
      {problem ? (
        <div className="border-b border-ink bg-ink px-5 py-2.5 md:px-8">
          <p className="mx-auto max-w-[1180px] text-[12px] leading-relaxed text-paper">{problem}</p>
          {seen && seen.length > 0 && (
            <ul className="mx-auto mt-1.5 flex max-w-[1180px] flex-wrap gap-x-5 gap-y-0.5">
              {seen.map((line) => (
                <li key={line} className="font-mono text-[10px] text-paper/60">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : ephemeral ? (
        <p className="border-b border-rule bg-wash px-5 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted md:px-8">
          Stockage local temporaire — ajoutez DATABASE_URL pour conserver les dossiers
        </p>
      ) : null}
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1180px] items-center gap-5 px-5 py-3.5 md:px-8">
        <Link href="/admin" className="shrink-0 font-mono text-[11px] uppercase tracking-[0.18em]">
          {brand}
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                "shrink-0 border-b-2 px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                isActive(link.href)
                  ? "border-ink text-ink"
                  : "border-transparent text-muted hover:text-ink"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-muted sm:inline">
            {username}
          </span>
          <button onClick={logout} className="btn-quiet">
            Quitter
          </button>
        </div>
      </div>

      </header>
    </>
  );
}

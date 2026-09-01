"use client";

import { appPath } from "@/lib/basePath";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import Logo from "@/components/Logo";

import { peut } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const LINKS: { href: string; label: string; permission: Parameters<typeof peut>[1] }[] = [
  { href: "/admin", label: "Dossiers", permission: "candidatures" },
  { href: "/admin/reglages", label: "Réglages", permission: "liens" },
];

export default function AdminNav({
  username,
  role,
  ephemeral,
  problem,
  seen,
}: {
  username: string;
  role: Role;
  ephemeral?: boolean;
  problem?: string;
  seen?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin" || pathname.startsWith("/admin/candidats")
      : pathname.startsWith(href);

  async function logout() {
    await fetch(appPath("/api/admin/session"), { method: "DELETE" });
    router.replace("/connexion");
    router.refresh();
  }

  return (
    <>
      {/* Rouge et non vert : ce bandeau annonce une panne de stockage, pas un
          profil retenu. Le `danger` de la palette est fixe — il ne suit pas la
          charte du client — donc le texte blanc y est toujours lisible. */}
      {problem ? (
        <div className="bg-danger px-5 py-3 md:px-8">
          <p className="mx-auto max-w-[1180px] text-[13px] leading-relaxed text-white">{problem}</p>
          {seen && seen.length > 0 && (
            <ul className="mx-auto mt-1.5 flex max-w-[1180px] flex-wrap gap-x-5 gap-y-0.5">
              {seen.map((line) => (
                <li key={line} className="text-[11px] text-white/60">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : ephemeral ? (
        <p className="bg-corail-pale px-5 py-2 text-center text-[12px] font-medium text-corail-fonce md:px-8">
          Stockage local temporaire — reliez une base de données pour conserver les dossiers
        </p>
      ) : null}

      <header className="sticky top-0 z-30 border-b border-custom3 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-5 px-5 py-3 md:px-8">
          <Logo href="/admin" height={28} priority />

          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
            {/* Un responsable de magasin n'a rien à régler : le lien disparaît
                plutôt que de mener à une page qui le refusera. */}
            {LINKS.filter((link) => peut({ role, storeId: null }, link.permission)).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                  isActive(link.href)
                    ? "bg-primaire/10 text-primaire-hover"
                    : "text-custom1 hover:text-primaire"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-sm font-medium text-custom1 sm:inline">{username}</span>
            <button onClick={logout} className="btn-quiet">
              Quitter
            </button>
          </div>
        </div>
      </header>
    </>
  );
}

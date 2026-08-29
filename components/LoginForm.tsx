"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

export default function LoginForm({
  setup,
  storageProblem,
  storageSeen,
}: {
  setup: boolean;
  storageProblem?: string;
  storageSeen?: string[];
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (setup && password !== confirm) {
      setError("Les deux mots de passe ne sont pas identiques.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(setup ? "/api/admin/inscription" : "/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const raw = await res.text();
      let data: { error?: string } = {};
      try {
        data = JSON.parse(raw);
      } catch {
        // Le serveur n'a pas répondu en JSON : on remonte ce qu'on a plutôt qu'un message creux.
      }
      if (!res.ok) {
        throw new Error(
          data.error ||
            `Le serveur a répondu ${res.status}${res.statusText ? ` ${res.statusText}` : ""}. ` +
              "Consultez les journaux du serveur pour le détail."
        );
      }
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
      setBusy(false);
    }
  }

  return (
    <div className="rise w-full max-w-[26rem]">
      <Logo height={34} className="mb-9" priority />
      <p className="eyebrow text-primaire">{setup ? "Première mise en route" : "Espace recrutement"}</p>
      <h1 className="display mt-4 text-[32px] leading-[1.05] md:text-[42px]">
        {setup ? "Créez votre compte" : "Connexion"}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-custom1">
        {setup
          ? "Un seul compte suffit : choisissez un identifiant et un mot de passe. Aucune adresse e-mail n'est demandée."
          : "Entrez votre identifiant et votre mot de passe."}
      </p>

      {storageProblem && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-primaire/30">
          <div className="bg-primaire/5 p-4">
            <p className="eyebrow text-primaire-hover">Configuration à terminer</p>
            <p className="mt-2 text-[14px] leading-relaxed">{storageProblem}</p>
          </div>

          {storageSeen && storageSeen.length > 0 && (
            <div className="border-t border-primaire/20 bg-wash p-4">
              <p className="eyebrow">Ce que le serveur reçoit</p>
              <ul className="mt-2 space-y-1">
                {storageSeen.map((line) => (
                  <li key={line} className="text-[12px] leading-relaxed text-custom1">
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] leading-relaxed text-custom2">
                Une variable ajoutée sur Vercel n'arrive qu'au déploiement suivant : après avoir
                relié la base, lancez un Redeploy.
              </p>
            </div>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-10 space-y-7">
        <label className="block">
          <span className="eyebrow block">Identifiant</span>
          <input
            className="field mt-1.5"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            autoFocus
          />
        </label>

        <label className="block">
          <span className="eyebrow block">Mot de passe</span>
          <input
            className="field mt-1.5"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={setup ? "new-password" : "current-password"}
            required
          />
        </label>

        {setup && (
          <label className="block">
            <span className="eyebrow block">Confirmez le mot de passe</span>
            <input
              className="field mt-1.5"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-primaire/10 px-4 py-3 text-[14px] leading-relaxed text-primaire-hover">
            {error}
          </p>
        )}

        <button type="submit" className="btn w-full" disabled={busy || Boolean(storageProblem)}>
          {busy ? "Un instant…" : setup ? "Créer le compte" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ setup }: { setup: boolean }) {
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Connexion impossible.");
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
      setBusy(false);
    }
  }

  return (
    <div className="rise w-full max-w-[26rem]">
      <p className="eyebrow">{setup ? "Première mise en route" : "Espace recrutement"}</p>
      <h1 className="display mt-4 text-[32px] leading-[1.05] md:text-[42px]">
        {setup ? "Créez votre compte" : "Connexion"}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        {setup
          ? "Un seul compte suffit : choisissez un identifiant et un mot de passe. Aucune adresse e-mail n'est demandée."
          : "Entrez votre identifiant et votre mot de passe."}
      </p>

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
          <p role="alert" className="border-l-2 border-ink pl-3 text-[14px]">
            {error}
          </p>
        )}

        <button type="submit" className="btn w-full" disabled={busy}>
          {busy ? "Un instant…" : setup ? "Créer le compte" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

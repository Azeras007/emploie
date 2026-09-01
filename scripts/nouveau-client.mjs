#!/usr/bin/env node
/**
 * Prépare une instance pour une nouvelle enseigne.
 *
 * Le produit se vend en instances séparées : une base, un dossier de fichiers,
 * un port, un processus. L'isolation est totale — une panne chez l'un
 * n'atteint personne, et les CV d'une enseigne ne peuvent pas se retrouver
 * dans la liste d'une autre par une requête mal filtrée.
 *
 * Le prix de cette isolation, c'est un montage à répéter à chaque vente. Ce
 * script le fait : il engendre le `.env`, la configuration PM2, et affiche les
 * quelques commandes qui restent à taper.
 *
 *     node scripts/nouveau-client.mjs gemo
 *     node scripts/nouveau-client.mjs gemo --port 3212 --racine /srv/candidatures
 *
 * Il ne crée pas la base lui-même et ne touche à rien d'existant : il refuse
 * d'écraser un `.env` déjà présent. Un script d'installation qui écrase la
 * configuration d'une instance en service est une catastrophe silencieuse.
 */

import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";

const RACINE_FICHIERS_DEFAUT = "/srv/candidatures";
const PORT_DEPART = 3210;

/* ------------------------------------------------------------------ *
 * Arguments
 * ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const positionnels = args.filter((a) => !a.startsWith("--"));
const option = (nom) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const slug = (positionnels[0] ?? "").trim().toLowerCase();
if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(slug)) {
  echouer(
    "Indiquez un identifiant d'enseigne : lettres minuscules, chiffres et tirets.\n" +
      "  node scripts/nouveau-client.mjs gemo"
  );
}

const racineFichiers = option("racine") ?? RACINE_FICHIERS_DEFAUT;
const portDemande = option("port") ? Number(option("port")) : null;
if (portDemande !== null && !Number.isInteger(portDemande)) {
  echouer("--port attend un nombre entier.");
}

/* ------------------------------------------------------------------ *
 * Montage
 * ------------------------------------------------------------------ */

const dossier = process.cwd();
const cheminEnv = path.join(dossier, ".env");
const cheminPm2 = path.join(dossier, "ecosystem.config.cjs");

if (existsSync(cheminEnv)) {
  echouer(
    `Un fichier .env existe déjà dans ${dossier}.\n` +
      "Ce script ne l'écrase pas : une instance en service y a ses identifiants.\n" +
      "Déplacez-le, ou lancez le script depuis un autre dossier."
  );
}

const port = portDemande ?? (await premierPortLibre(PORT_DEPART));
const base = `candidatures_${slug.replace(/-/g, "_")}`;
const fichiers = path.join(racineFichiers, slug);
const secret = randomBytes(32).toString("base64");

writeFileSync(
  cheminEnv,
  `# Instance « ${slug} » — engendrée le ${new Date().toISOString().slice(0, 10)}
#
# Ce fichier contient des secrets. Il n'est pas versionné, et ne doit jamais
# l'être : le .gitignore du dépôt l'exclut déjà.

# Signe les sessions administrateur et les documents téléversés.
AUTH_SECRET=${secret}

# La base de l'enseigne. L'application y crée ses tables au premier démarrage,
# le compte doit donc pouvoir créer des tables.
DATABASE_URL=postgresql://localhost:5432/${base}

# Où sont rangés les CV. HORS du dossier de l'application : un déploiement
# recopie le dépôt et effacerait un dossier situé à l'intérieur.
UPLOAD_DIR=${fichiers}

# Le port d'écoute, réécrit par le serveur frontal.
PORT=${port}

# Serveur d'envoi des e-mails. Sans lui, rien n'est envoyé — et l'écran des
# réglages le dit clairement plutôt que d'échouer en silence.
# SMTP_URL=smtp://utilisateur:motdepasse@smtp.exemple.fr:587

# Préfixe d'URL. La chaîne vide sert l'application à la racine du domaine ;
# les adresses des QR codes suivent automatiquement.
# BASE_PATH=/candidature
`,
  { mode: 0o600 }
);

writeFileSync(
  cheminPm2,
  `// Configuration PM2 de l'instance « ${slug} », engendrée par
// scripts/nouveau-client.mjs.
//
// ⚠️ AUCUN SECRET ICI — ce fichier est versionné. Les identifiants vivent
// dans le .env de la machine, que PM2 charge tout seul.
module.exports = {
  apps: [
    {
      name: "candidatures-${slug}",
      script: "npm",
      args: "start",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      env: { PORT: ${port}, NODE_ENV: "production" },
      time: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
`
);

try {
  mkdirSync(fichiers, { recursive: true, mode: 0o700 });
} catch (err) {
  // Le dossier vit souvent hors de portée de l'utilisateur courant : on le
  // signale sans échouer, la commande est rappelée plus bas.
  console.log(`\n  (dossier des fichiers non créé : ${err.message})`);
}

/* ------------------------------------------------------------------ *
 * Ce qui reste à faire
 * ------------------------------------------------------------------ */

console.log(`
Instance « ${slug} » préparée dans ${dossier}

  .env                    port ${port}, base ${base}
  ecosystem.config.cjs    application PM2 « candidatures-${slug} »
  ${fichiers}${" ".repeat(Math.max(1, 22 - fichiers.length))}dossier des CV

Il reste à :

  1. créer la base
     createdb ${base}

  2. installer et bâtir
     npm ci && npm run build

  3. démarrer
     pm2 start ecosystem.config.cjs && pm2 save

  4. router le domaine public vers http://127.0.0.1:${port}
     (le préfixe /candidature, sauf si vous videz BASE_PATH)

  5. ouvrir /candidature/admin pour créer le compte propriétaire,
     puis Réglages → Marque pour habiller l'application aux couleurs
     de l'enseigne — l'analyse de son site fait le plus gros.

Le mot de passe du propriétaire se choisit à la première visite. Personne,
pas même vous, ne peut le lire ensuite : il n'est stocké que haché.
`);

/* ------------------------------------------------------------------ *
 * Utilitaires
 * ------------------------------------------------------------------ */

function echouer(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/**
 * Le premier port libre à partir de `depart`.
 *
 * On teste l'écoute réelle plutôt que de tenir une liste : une liste se
 * désynchronise du jour où quelqu'un démarre une instance à la main.
 */
async function premierPortLibre(depart) {
  for (let port = depart; port < depart + 200; port++) {
    if (await libre(port)) return port;
  }
  echouer(`Aucun port libre entre ${depart} et ${depart + 200}.`);
}

function libre(port) {
  return new Promise((resoudre) => {
    const serveur = createServer();
    serveur.once("error", () => resoudre(false));
    serveur.once("listening", () => serveur.close(() => resoudre(true)));
    // Sans hôte : toutes les interfaces, IPv4 et IPv6.
    //
    // Écouter sur « 127.0.0.1 » réussissait alors qu'un processus occupait
    // déjà le port en IPv6 — Node y écoute par défaut sur « *:port ». Le
    // script attribuait donc un port déjà pris, et la deuxième instance
    // refusait de démarrer.
    serveur.listen(port);
  });
}

# Candidatures

Un questionnaire de candidature et le back-office pour le dépouiller. Noir et blanc, sans fioriture,
utilisable au doigt sur un téléphone.

- **Côté candidat** — un lien, dix questions posées une par une, puis le dépôt du CV et de la lettre.
- **Côté recruteur** — un compte (identifiant + mot de passe, pas d'e-mail), la liste des dossiers
  classés par pertinence, la fiche complète de chaque profil avec le CV affiché dans la page.
- **Le tri est à vous** — les questions et les règles de pertinence s'éditent depuis les réglages,
  sans toucher au code.

## Démarrer en local

```bash
npm install
npm run dev
```

L'app tourne sur http://localhost:3210. Sans configuration, elle range tout dans `.data/`
(base JSON + fichiers) : rien à installer, mais rien de durable non plus.

La première visite sur `/admin` propose de créer le compte administrateur. Il n'y en a qu'un.

## Les adresses

| Adresse | À quoi ça sert |
|---|---|
| `/` | Page d'accueil, deux portes : postuler ou administrer |
| `/candidature` | Le questionnaire, ouvert à tous |
| `/candidature/<jeton>` | Le même, via un lien d'invitation traçable |
| `/connexion` | Connexion (ou création du compte à la première visite) |
| `/admin` | La liste des dossiers |
| `/admin/candidats/<id>` | La fiche d'un candidat — ajoutez `#documents` pour ouvrir les pièces |
| `/admin/reglages` | Questionnaire, règles de tri, liens d'invitation, mot de passe |

## Mettre en ligne sur Vercel

1. Importez ce dépôt dans Vercel.
2. **Storage → Marketplace Database Providers → Neon** : créez une base Postgres et reliez-la au
   projet. Neon injecte `DATABASE_URL`. La table est créée toute seule au premier accès.
   Supabase fait aussi l'affaire : n'importe quelle URL PostgreSQL convient.

   Ne créez pas `DATABASE_URL` à la main avant cette étape : Vercel refuse alors de la créer
   (« already has an existing environment variable »), et une variable vide ne relie rien.
   Si c'est déjà fait, supprimez-la puis reliez la base. L'app lit aussi `POSTGRES_URL`,
   `STORAGE_URL` et `NEON_DATABASE_URL`, au cas où vous choisiriez un préfixe personnalisé.
3. **Storage → Blob** : créez un magasin. Vercel injecte `BLOB_READ_WRITE_TOKEN`.
4. **Settings → Environment Variables** : ajoutez `AUTH_SECRET`, généré par
   `openssl rand -base64 32`. Sans lui, l'espace admin refuse de démarrer — c'est voulu :
   il signe les sessions et les documents déposés.
5. Déployez, ouvrez `/connexion`, créez votre compte.

Sans base de données ni Blob, l'app fonctionne quand même sur Vercel — mais chaque déploiement
efface les candidatures. Un bandeau vous le rappelle dans l'admin.

## Comment le tri fonctionne

Une règle regarde une réponse et fait une chose :

| Effet | Ce qui se passe |
|---|---|
| Ajoute des points | Le profil gagne des points si la condition est vraie |
| Retire des points | Le profil en perd |
| Critère obligatoire | Le profil est écarté si la condition est **fausse** |
| Critère éliminatoire | Le profil est écarté si la condition est **vraie** |

Le score est le rapport entre les points obtenus et les points possibles, ramené sur 100.
Au-dessus du seuil que vous fixez, la candidature est signalée comme pertinente. La page de
réglages simule le résultat sur les candidatures déjà reçues, avant même d'enregistrer.

## Documents acceptés

PDF, Word (`.doc`, `.docx`), OpenDocument, RTF, texte, Markdown, CSV, HTML et les images
(PNG, JPEG, WebP, GIF, AVIF, HEIC, TIFF), plus PowerPoint et ZIP. 4 Mo par fichier.

S'affichent directement dans la fiche : les PDF, les images, les `.docx` (convertis en HTML) et
tout ce qui est du texte. Les autres formats se téléchargent. Les fichiers HTML ou SVG sont
toujours servis en téléchargement, jamais affichés dans la page : un CV piégé n'a rien à faire
dans l'origine de l'application.

## Sous le capot

Next.js 15 (App Router), TypeScript, Tailwind. Deux pilotes interchangeables pour la base
(PostgreSQL ou fichier JSON) et pour les fichiers (Vercel Blob ou disque local), choisis au
démarrage selon les variables d'environnement présentes. Sessions par JWT signé dans un cookie
`httpOnly`, mots de passe hachés avec bcrypt.

Sur Vercel Blob, les documents sont déposés en **accès privé** : ils ne sortent du stockage que
par `/api/fichiers`, qui vérifie la session administrateur ou le jeton de partage. Une URL
publique, même imprévisible, resterait lisible à vie par quiconque la récupère — ce n'est pas
une propriété acceptable pour un CV.

Les documents sont envoyés un par un avant l'envoi du formulaire : ça contourne la limite de
4,5 Mo par requête sur Vercel et donne un retour immédiat au candidat. Chaque fichier revient
signé (HMAC), et l'envoi final refuse tout document que le serveur n'a pas lui-même émis.

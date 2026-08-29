# Candidatures — Valeur Ajoutée

Un questionnaire de candidature et le back-office pour le dépouiller, aux couleurs de
Valeur Ajoutée, utilisable au doigt sur un téléphone.

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

L'application est servie sous `/candidature` (option `basePath`), routes API et fichiers
statiques compris. Elle se greffe ainsi sur le domaine de Valeur Ajoutée par une simple
réécriture, sans qu'aucune ligne de code n'ait à connaître le domaine hôte.

| Adresse | À quoi ça sert |
|---|---|
| `/candidature` | Le questionnaire, ouvert à tous |
| `/candidature/l/<jeton>` | Le même, via un lien traçable — l'adresse des QR codes |
| `/candidature/connexion` | Connexion (ou création du compte à la première visite) |
| `/candidature/admin` | La liste des dossiers |
| `/candidature/admin/candidats/<id>` | La fiche d'un candidat — `#documents` ouvre les pièces |
| `/candidature/admin/reglages` | Questionnaire, tri, liens et QR codes, mot de passe |

### Greffe sur valeur-ajoutee.com

Dans le dépôt du site principal, `next.config.mjs` réécrit `/candidature/*` vers cette
application dès que la variable `RECRUTEMENT_URL` est renseignée (sans elle, la règle
est inerte). Les QR codes portent donc une adresse du domaine principal : si
l'application déménage, seule cette destination change et tous les codes déjà imprimés
continuent de fonctionner.

## QR codes

Chaque lien de candidature — et le questionnaire général — dispose d'un QR code
téléchargeable depuis Réglages → Compte & liens :

| Format | Pour quoi |
|---|---|
| Affiche A4 / A5 (PDF) | Prête à imprimer : logotype, accroche, code encadré, adresse en clair |
| SVG (noir, ou orange) | Vectoriel — le format à donner à un imprimeur pour une devanture |
| PNG 512 / 1024 / 2048 px | Écrans, réseaux sociaux, documents bureautiques |

**Un QR imprimé ne se corrige plus.** Trois garanties le protègent :

1. L'adresse est bâtie sur le **domaine public** réglable dans les réglages, jamais sur
   celui de l'hébergeur.
2. Un jeton inconnu, désactivé ou supprimé **n'est jamais une erreur** : le questionnaire
   général répond à sa place. Seul le suivi de provenance est perdu.
3. Un lien marqué « imprimé » **ne peut plus être supprimé** tant que la mention subsiste.

Le code est produit avec la correction d'erreur maximale (niveau H). Mesuré sur un masque
d'un seul tenant, il reste lisible jusqu'à environ 10 % de sa surface occultée — les 30 %
souvent cités valent pour des altérations dispersées. Comptez 6 cm de côté au minimum sur
une vitrine.

## Mettre en ligne sur Vercel

1. Importez ce dépôt dans Vercel.
2. **Storage → Marketplace Database Providers → Neon** : créez une base Postgres et reliez-la au
   projet. Neon injecte `DATABASE_URL`. La table est créée toute seule au premier accès.
   Supabase fait aussi l'affaire : n'importe quelle URL PostgreSQL convient.

   Ne créez pas `DATABASE_URL` à la main avant cette étape : Vercel refuse alors de la créer
   (« already has an existing environment variable »), et une variable vide ne relie rien.
   Si c'est déjà fait, supprimez-la puis reliez la base.

   Le préfixe personnalisé de Vercel est géré : l'app reconnaît toute variable dont le nom
   finit par `DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`
   ou `POSTGRES_URL_NON_POOLING` — donc `STORAGE_DATABASE_URL` aussi bien que `DATABASE_URL`.
   Les variantes `NO_SSL` sont ignorées : la connexion à la base reste chiffrée.
3. **Storage → Blob** : créez un magasin **et reliez-le au projet** (*Connect Project*) —
   créer le magasin ne suffit pas, c'est la connexion qui injecte le jeton. Comme pour la base,
   un préfixe personnalisé est géré : l'app reconnaît tout nom finissant par
   `BLOB_READ_WRITE_TOKEN`, donc `STORAGE_BLOB_READ_WRITE_TOKEN` aussi bien.
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

## Identité visuelle

Palette, typographie et logotype repris du site Valeur Ajoutée
(`/Users/laurans/Code/Valeur_ajoutee`) : orange `#f46f40` et vert `#234737`, gris neutres
`#5b5b5b` / `#a0a0a0` / `#dbdbdb`, Fraunces pour les titres et Manrope pour le texte, formes
généreusement arrondies et ombres douces.

Les valeurs sont regroupées en tête de `app/globals.css` — les changer là suffit à changer
l'identité de toute l'application. Le logotype vit dans `public/logos/LOGO-TEXTE.jpg` et
s'insère via le composant `components/Logo.tsx`.

## La base de données

Les candidatures vivent dans la **base Valeur Ajoutée**, pas dans une base séparée. Le schéma
appartient au dépôt du site principal, dans la migration
`prisma/migrations/20260829180000_add_recruitment/` :

| Table | Contenu |
|---|---|
| `JobApplication` | Identité, statut, notes, référence, jetons de provenance et de partage |
| `JobApplicationAnswer` | Une ligne par réponse, avec le libellé de la question recopié |
| `JobApplicationDocument` | CV, lettre et pièces jointes — référence vers Vercel Blob |
| `JobInviteLink` | Liens traçables et leur mention « imprimé » |
| `Recruiter` | Le compte du back-office |
| `RecruitmentSetting` | Questionnaire, règles de tri, seuil, domaine public |

Les réponses sont éclatées en lignes plutôt que rangées en JSON : elles deviennent
interrogeables directement en SQL, sans passer par l'application.

```sql
select a."questionLabel", count(*)
  from "JobApplicationAnswer" a
 where a."valueText" = 'Immédiatement'
 group by 1;
```

Le libellé de la question est **recopié à l'enregistrement**. Le questionnaire reste donc
modifiable sans rendre illisibles les candidatures déjà reçues.

### Appliquer la migration

L'historique Prisma du site remonte à une époque SQLite : `prisma migrate deploy` ne peut pas
le rejouer. La migration s'applique donc directement, et elle est **rejouable** — chaque objet
n'est créé que s'il n'existe pas.

```bash
psql "$DATABASE_URL" -f prisma/migrations/20260829180000_add_recruitment/migration.sql
```

Elle ne fait que créer six tables : rien d'existant n'est modifié ni supprimé.

Si la migration n'a pas été appliquée, ou si le schéma dérive, l'application le dit à la
connexion en nommant la table ou la colonne manquante — plutôt que d'échouer à la première
candidature.

## Sous le capot

Next.js 15 (App Router), TypeScript, Tailwind. Deux pilotes interchangeables pour la base
(les tables relationnelles ci-dessus, ou un fichier JSON en développement) et pour les fichiers
(Vercel Blob ou disque local), choisis au démarrage selon les variables d'environnement. Sessions par JWT signé dans un cookie
`httpOnly`, mots de passe hachés avec bcrypt.

Sur Vercel Blob, les documents sont déposés en **accès privé** : ils ne sortent du stockage que
par `/api/fichiers`, qui vérifie la session administrateur ou le jeton de partage. Une URL
publique, même imprévisible, resterait lisible à vie par quiconque la récupère — ce n'est pas
une propriété acceptable pour un CV.

Si le magasin refuse le mode privé, le dépôt bascule en public plutôt que d'échouer, et le mode
retenu est enregistré avec le document. L'URL publique n'est jamais transmise au navigateur —
l'aperçu et le téléchargement passent toujours par la route vérifiée — mais quiconque
l'obtiendrait par un autre biais pourrait lire le fichier. Les journaux du déploiement notent
chaque bascule.

Les documents sont envoyés un par un avant l'envoi du formulaire : ça contourne la limite de
4,5 Mo par requête sur Vercel et donne un retour immédiat au candidat. Chaque fichier revient
signé (HMAC), et l'envoi final refuse tout document que le serveur n'a pas lui-même émis.

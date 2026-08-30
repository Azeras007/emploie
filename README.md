# Candidatures — Kiabi

Un questionnaire de candidature et le back-office pour le dépouiller, aux couleurs de Kiabi,
utilisable au doigt sur un téléphone — devant le magasin, dans la file, à l'arrêt de bus.

- **Côté candidat** — un lien ou un QR code sur la devanture, dix questions posées une par une,
  puis le dépôt du CV et de la lettre.
- **Côté recruteur** — un compte (identifiant + mot de passe, pas d'e-mail), la liste des dossiers
  classés par pertinence, la fiche complète de chaque profil avec le CV affiché dans la page.
- **Le tri est à vous** — les questions et les règles de pertinence s'éditent depuis les réglages,
  sans toucher au code.

## Démarrer en local

```bash
npm install
npm run dev
```

L'app tourne sur http://localhost:3210/candidature. Sans configuration, elle range tout dans
`.data/` (base JSON + fichiers) : rien à installer, mais rien de durable non plus.

La première visite sur `/candidature/admin` propose de créer le compte administrateur. Il n'y
en a qu'un.

## Les adresses

L'application est servie sous `/candidature` (option `basePath`), routes API et fichiers
statiques compris. Elle se greffe ainsi sur un domaine Kiabi par une simple réécriture, sans
qu'aucune ligne de code n'ait à connaître le domaine hôte.

| Adresse | À quoi ça sert |
|---|---|
| `/candidature` | Le questionnaire, ouvert à tous |
| `/candidature/l/<jeton>` | Le même, via un lien traçable — l'adresse des QR codes |
| `/candidature/connexion` | Connexion (ou création du compte à la première visite) |
| `/candidature/admin` | La liste des dossiers |
| `/candidature/admin/candidats/<id>` | La fiche d'un candidat — `#documents` ouvre les pièces |
| `/candidature/admin/reglages` | Questionnaire, tri, liens et QR codes, mot de passe |

`BASE_PATH` déplace tout ce bloc ailleurs ; la chaîne vide le remet à la racine du domaine.
Les adresses inscrites dans les QR codes suivent automatiquement — le préfixe n'est écrit
qu'à un seul endroit.

## QR codes

Chaque lien de candidature — et le questionnaire général — dispose d'un QR code
téléchargeable depuis Réglages → Compte & liens :

| Format | Pour quoi |
|---|---|
| Affiche A4 / A5 (PDF) | Prête à imprimer : logotype, accroche, code encadré, adresse en clair |
| SVG (noir, ou bleu Kiabi) | Vectoriel — le format à donner à un imprimeur pour une devanture |
| PNG 512 / 1024 / 2048 px | Écrans, réseaux sociaux, documents bureautiques |

**Un QR imprimé ne se corrige plus.** Trois garanties le protègent :

1. L'adresse est bâtie sur le **domaine public** réglable dans les réglages, jamais sur celui
   de l'hébergeur du moment.
2. Un jeton inconnu, désactivé ou supprimé **n'est jamais une erreur** : le questionnaire
   général répond à sa place. Seul le suivi de provenance est perdu.
3. Un lien marqué « imprimé » **ne peut plus être supprimé** tant que la mention subsiste.

La version de marque du code est **bleu pétrole**, et non corail : un lecteur distingue les
modules par leur luminance, et le corail n'en offre pas assez sur blanc pour être lu de loin
ou par mauvaise lumière.

Le code est produit avec la correction d'erreur maximale (niveau H). Mesuré sur un masque
d'un seul tenant, il reste lisible jusqu'à environ 10 % de sa surface occultée — les 30 %
souvent cités valent pour des altérations dispersées. Comptez 6 cm de côté au minimum sur
une vitrine.

## Mettre en ligne

```bash
git clone <ce-dépôt> ~/kiabi-recrutement
cd ~/kiabi-recrutement
npm ci && npm run build
pm2 start ecosystem.config.cjs && pm2 save
```

Son `.env` (voir `.env.example`) :

```bash
DATABASE_URL="postgresql://…/kiabi_recrutement"   # le compte doit pouvoir créer des tables
AUTH_SECRET="…"                                   # openssl rand -base64 32
UPLOAD_DIR="/srv/kiabi-candidatures-fichiers"     # HORS du dépôt
```

Puis, sur le domaine public, une réécriture de `/candidature/*` vers `http://127.0.0.1:3210`.

### Où vivent les CV

Sur le disque, dans `UPLOAD_DIR`, rangés par année et par mois. **Ce dossier doit être hors
du dépôt** : le déploiement recopie l'application et effacerait un dossier situé à
l'intérieur. L'application le signale d'elle-même si `UPLOAD_DIR` tombe dans son propre
répertoire.

Sauvegardez ce dossier avec votre base : les deux sont indissociables — la base référence des
fichiers, les fichiers n'ont de sens que reliés à une candidature.

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

Les règles livrées traduisent les priorités d'un magasin : la disponibilité **le samedi** et
sur les **temps forts** pèse plus lourd que le nombre d'années d'expérience, et un trajet
court prédit mieux la tenue dans la durée qu'un CV bien tourné.

## Documents acceptés

PDF, Word (`.doc`, `.docx`), OpenDocument, RTF, texte, Markdown, CSV, HTML et les images
(PNG, JPEG, WebP, GIF, AVIF, HEIC, TIFF), plus PowerPoint et ZIP. 4 Mo par fichier.

S'affichent directement dans la fiche : les PDF, les images, les `.docx` (convertis en HTML) et
tout ce qui est du texte. Les autres formats se téléchargent. Les fichiers HTML ou SVG sont
toujours servis en téléchargement, jamais affichés dans la page : un CV piégé n'a rien à faire
dans l'origine de l'application.

## Identité visuelle

Palette et typographie du système de design Kiabi :

| Rôle | Couleur |
|---|---|
| Actions, aplats sombres, titres | Bleu pétrole `#040037` (survol `#36335f`) |
| Accents, jauges, alertes | Corail `#ff4529` (texte `#b5311d`, fond `#ffecea`) |
| Profils retenus | Vert profond `#00565a` |
| Gris neutres | `#4c4c54` / `#87878c` / `#e2e2e4` / `#f8f8f8` |

Figtree pour les titres, Inter pour le texte — les deux familles de kiabi.com. Angles
généreux (12 px pour les champs, 16 px pour les cartes, pilules pour les boutons) et ombres
diffuses plutôt que portées.

Les valeurs sont regroupées en tête de `app/globals.css`, et reprises dans
`tailwind.config.ts` — les changer là suffit à changer l'identité de toute l'application.

### Le logotype

Le dépôt n'embarque **aucun fichier de marque**. En son absence, `components/Logo.tsx`
compose « Kiabi » en Figtree très gras, au bleu pétrole. Pour utiliser le logotype officiel :

```bash
cp kiabi.svg public/logos/            # et kiabi.png pour les affiches PDF
echo 'NEXT_PUBLIC_LOGO_FILE=/logos/kiabi.svg' >> .env
```

Il remplace alors le lettrage partout — en-tête, back-office, confirmation, 404 — sans toucher
au code. Voir `public/logos/LISEZMOI.txt`.

## La base de données

L'application est seule maîtresse de sa base : elle **crée ses tables au premier démarrage**,
avec un script rejouable qui ne détruit ni ne modifie rien d'existant (`lib/schema.ts`). Le
compte indiqué dans `DATABASE_URL` doit donc pouvoir créer des tables ; s'il ne le peut pas,
l'écran d'état du back-office le dit avec l'erreur exacte.

| Table | Contenu |
|---|---|
| `JobApplication` | Identité, statut, notes, référence, jetons de provenance et de partage |
| `JobApplicationAnswer` | Une ligne par réponse, avec le libellé de la question recopié |
| `JobApplicationDocument` | CV, lettre et pièces jointes — chemin du fichier sur le disque |
| `JobInviteLink` | Liens traçables et leur mention « imprimé » |
| `Recruiter` | Le compte du back-office |
| `RecruitmentSetting` | Questionnaire, règles de tri, seuil, domaine public |

Les réponses sont éclatées en lignes plutôt que rangées en JSON : elles deviennent
interrogeables directement en SQL, sans passer par l'application.

```sql
select count(*)
  from "JobApplicationAnswer"
 where "questionId" = 'creneaux'
   and 'Le samedi' = any("valueList");
```

Le libellé de la question est **recopié à l'enregistrement**. Le questionnaire reste donc
modifiable sans rendre illisibles les candidatures déjà reçues.

Si le schéma dérive — une colonne renommée à la main, une table supprimée — l'application le
dit à la connexion en nommant la table ou la colonne manquante, plutôt que d'échouer à la
première candidature.

## Sous le capot

Next.js 15 (App Router), TypeScript, Tailwind. Aucune dépendance à un hébergeur : les données
vont dans PostgreSQL (un fichier JSON en développement), les documents sur le disque. Sessions
par JWT signé dans un cookie `httpOnly`, mots de passe hachés avec bcrypt.

Les documents ne sont jamais servis en statique : ils passent par `/candidature/api/fichiers`,
qui vérifie la session administrateur ou le jeton de partage avant d'envoyer le moindre octet.
Un CV n'est donc lisible que par vous, ou par qui reçoit un lien de partage. Les fichiers HTML
et SVG sont toujours servis en téléchargement, jamais affichés dans la page : un CV piégé n'a
rien à faire dans l'origine de l'application.

Les documents sont envoyés un par un, avant la soumission du formulaire : le candidat voit
chaque dépôt aboutir ou échouer immédiatement, plutôt que de découvrir un échec après avoir
tout rempli. Chaque fichier revient signé (HMAC), et l'envoi final refuse tout document que le
serveur n'a pas lui-même émis.

# Candidatures

Un espace de candidature en marque blanche : le candidat répond à dix questions
et dépose son CV, le recruteur dépouille. L'application prend l'identité
visuelle de l'enseigne en quelques minutes, à partir de son propre site.

- **Côté candidat** — un lien ou un QR code sur la devanture, dix questions
  posées une par une, puis le dépôt du CV et de la lettre. Utilisable au doigt,
  debout, dans la file.
- **Côté recruteur** — les dossiers classés par pertinence, la fiche complète de
  chaque profil avec le CV affiché dans la page, et le tri réglable sans toucher
  au code.
- **Côté vous** — une instance par enseigne, montée par une commande, habillée
  depuis le back-office.

## Démarrer en local

```bash
npm install
npm run dev
```

L'app tourne sur http://localhost:3210/candidature. Sans configuration, elle
range tout dans `.data/` (base JSON + fichiers) : rien à installer, mais rien de
durable non plus. La première visite sur `/candidature/admin` propose de créer
le compte propriétaire.

| Commande | |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run verif` | Compilation de vérification, **dans un répertoire séparé** |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |

`verif` bâtit dans `.next-verif` et non dans `.next` : un `next build` lancé
pendant qu'un serveur de développement tourne écrase les fragments que celui-ci
sert encore, et la page se retrouve sans style, avec des 404 partout.

## Habiller une enseigne

Réglages → **Marque**. Collez l'adresse du site du client et lancez l'analyse :
l'application lit la page et ses feuilles de style, y relève les couleurs, les
polices et les logotypes, et vous propose un thème. Vous corrigez ce qui doit
l'être, vous enregistrez, c'est en ligne — ni recompilation, ni redéploiement.

**Quatre couleurs suffisent.** Le moteur en dérive dix-sept, en surveillant les
contrastes :

| Vous donnez | Il calcule |
|---|---|
| Principale | Le survol, le fond pâle, et **la couleur du texte posé dessus** |
| Accent | Le fond des alertes, et un ton assez foncé pour que leur texte se lise |
| Profils retenus | Le texte de la pastille |
| Encre | Les gris, teintés de 3 % de la couleur principale |

C'est ce calcul qui évite l'accident classique de la marque blanche : une
enseigne au jaune vif obtient des boutons à texte **noir**, pas des boutons
blancs sur jaune. L'écran affiche les rapports de contraste avant que vous
n'enregistriez.

Un site sur deux refuse les requêtes automatiques — Kiabi, La Redoute et
Decathlon répondent 403. Ce n'est pas une panne, c'est leur décision. Dans ce
cas, ouvrez le site dans votre navigateur, copiez l'adresse d'une de ses
feuilles de style et collez-la : l'analyse la prend telle quelle. Ou saisissez
les couleurs à la main, c'est l'affaire de deux minutes.

Le logotype s'importe d'un clic depuis l'analyse, ou depuis un fichier. Il est
rangé **en base** avec le reste du thème : une sauvegarde de la base restaure
tout, sans dossier de fichiers à traîner à côté.

## Vendre une instance

Une enseigne, une instance : sa base, ses fichiers, son port, son processus.
Une panne chez l'un n'atteint personne, et les CV d'une enseigne ne peuvent pas
se retrouver dans la liste d'une autre par une requête mal filtrée.

```bash
git clone <ce-dépôt> ~/clients/gemo
cd ~/clients/gemo
node scripts/nouveau-client.mjs gemo
```

Le script engendre le `.env` (secret compris), la configuration PM2, le dossier
des fichiers, et affiche les quatre commandes qui restent. Il choisit un port
libre, ne crée pas la base lui-même, et **refuse d'écraser un `.env` existant** :
un script d'installation qui écrase la configuration d'une instance en service
est une catastrophe silencieuse.

## Les rôles

| Rôle | Ce qu'il peut |
|---|---|
| **Propriétaire** | Tout, marque et e-mails compris. Le vôtre. |
| **Administrateur** | Questionnaire, tri, magasins, comptes. Le client. |
| **Recruteur** | Toutes les candidatures, aucun réglage. |
| **Responsable de magasin** | Uniquement les candidatures de son magasin. |

La cloison du responsable de magasin tient partout, pas seulement à l'affichage :
la liste est filtrée sur le serveur avant de partir, l'accès direct à un dossier
d'un autre magasin répond « introuvable », les documents ne se téléchargent pas,
l'export ne les contient pas, et les alertes par e-mail ne partent pas.

Le rôle est relu en base à chaque requête : un compte rétrogradé ou désactivé
perd ses droits immédiatement, sans attendre l'expiration de son jeton.

Le dernier propriétaire actif ne peut être ni rétrogradé, ni désactivé, ni
supprimé — l'installation ne s'administrerait plus qu'en base.

## Magasins et QR codes

Un lien d'invitation vise un magasin. Le QR collé sur la vitrine de Lille dépose
les dossiers dans la liste de Lille, sans que le candidat ait à choisir.

| Format | Pour quoi |
|---|---|
| Affiche A4 / A5 (PDF) | Prête à imprimer : logotype, accroche, code encadré, adresse en clair |
| SVG (noir, ou couleur de marque) | Vectoriel — le format à donner à un imprimeur |
| PNG 512 / 1024 / 2048 px | Écrans, réseaux sociaux, documents bureautiques |

**Un QR imprimé ne se corrige plus.** Trois garanties le protègent :

1. L'adresse est bâtie sur le **domaine public** réglable dans les réglages,
   jamais sur celui de l'hébergeur du moment.
2. Un jeton inconnu, désactivé ou supprimé **n'est jamais une erreur** : le
   questionnaire général répond à sa place. Seul le suivi de provenance est
   perdu.
3. Un lien marqué « imprimé » **ne peut plus être supprimé**.

La version de marque du code reste sombre même si la charte est claire : un
lecteur distingue les modules par leur luminance, et un corail vif n'en offre
pas assez pour être lu de loin.

Correction d'erreur maximale (niveau H). Mesuré sur un masque d'un seul tenant,
le code reste lisible jusqu'à environ 10 % de sa surface occultée — les 30 %
souvent cités valent pour des altérations dispersées. Comptez 6 cm de côté au
minimum sur une vitrine.

## Données personnelles

Réglages → **Données & e-mails**.

- **Consentement** — une case à cocher au dernier écran, une fois que le
  candidat voit ce qu'il transmet. Le texte est réglable ; vide, aucun
  consentement n'est demandé. Il est vérifié côté serveur.
- **Conservation** — en mois, comptés depuis le dépôt. Deux ans par défaut, ce
  que retient le référentiel de la CNIL pour une candidature non retenue.
  Chaque dossier porte sa propre date d'échéance, figée au dépôt : changer le
  réglage n'applique jamais rétroactivement une durée que le candidat n'a pas
  connue.
- **Purge** — efface le dossier *et* ses fichiers. Un CV orphelin sur le disque
  est précisément la donnée qu'on croyait avoir effacée. Pour l'automatiser,
  appelez `POST /candidature/api/admin/purge` depuis une tâche planifiée.
- **Export CSV** — dans la portée du compte. Point-virgule et BOM pour Excel en
  français ; les champs commençant par `=`, `+`, `-` ou `@` sont neutralisés,
  pour qu'un candidat ne puisse pas faire exécuter une formule au recruteur.

## E-mails

Accusé de réception au candidat, alerte aux recruteurs à chaque dépôt. Les
modèles se règlent depuis le back-office, avec des jetons `{{prenom}}`,
`{{reference}}`, `{{enseigne}}`, `{{score}}`…

Les identifiants du serveur, eux, vivent dans `SMTP_URL` et jamais en base : un
administrateur d'enseigne règle les messages, il n'a pas à pouvoir lire ce mot
de passe ni à l'emporter dans un export.

```bash
SMTP_URL=smtp://utilisateur:motdepasse@smtp.exemple.fr:587
```

Un bouton d'essai permet de vérifier la configuration. Sans lui, la première
vérification serait une vraie candidature — et son échec, un candidat qui n'a
rien reçu. Un envoi qui échoue n'empêche jamais l'enregistrement d'une
candidature, et la raison de l'échec est journalisée.

## Comment le tri fonctionne

Une règle regarde une réponse et fait une chose :

| Effet | Ce qui se passe |
|---|---|
| Ajoute des points | Le profil gagne des points si la condition est vraie |
| Retire des points | Le profil en perd |
| Critère obligatoire | Le profil est écarté si la condition est **fausse** |
| Critère éliminatoire | Le profil est écarté si la condition est **vraie** |

Le score est le rapport entre les points obtenus et les points possibles, ramené
sur 100. La page de réglages simule le résultat sur les candidatures déjà
reçues, avant même d'enregistrer.

## Documents acceptés

PDF, Word (`.doc`, `.docx`), OpenDocument, RTF, texte, Markdown, CSV, HTML et
les images (PNG, JPEG, WebP, GIF, AVIF, HEIC, TIFF), plus PowerPoint et ZIP.
4 Mo par fichier.

S'affichent dans la fiche : les PDF, les images, les `.docx` (convertis) et tout
ce qui est du texte. Les fichiers HTML et SVG sont toujours servis en
téléchargement, jamais affichés dans la page : un CV piégé n'a rien à faire dans
l'origine de l'application.

## La base de données

L'application est seule maîtresse de sa base : elle **crée ses tables au premier
démarrage**, avec un script rejouable qui ne détruit ni ne modifie rien
d'existant (`lib/schema.ts`). Le compte de `DATABASE_URL` doit donc pouvoir
créer des tables ; sinon, l'écran d'état du back-office le dit avec l'erreur
exacte.

| Table | Contenu |
|---|---|
| `JobApplication` | Identité, statut, notes, magasin, consentement, échéance de purge |
| `JobApplicationAnswer` | Une ligne par réponse, avec le libellé de la question recopié |
| `JobApplicationDocument` | CV, lettre et pièces jointes — chemin du fichier sur le disque |
| `JobInviteLink` | Liens traçables, leur magasin et leur mention « imprimé » |
| `Store` | Les points de vente |
| `Recruiter` | Les comptes et leurs rôles |
| `EmailLog` | Les envois, réussis ou non, avec la raison de l'échec |
| `RecruitmentSetting` | Réglages et thème |

Les réponses sont éclatées en lignes plutôt que rangées en JSON : elles
deviennent interrogeables en SQL, sans passer par l'application.

```sql
select count(*)
  from "JobApplicationAnswer"
 where "questionId" = 'creneaux'
   and 'Le samedi' = any("valueList");
```

Le libellé de la question est **recopié à l'enregistrement** : le questionnaire
reste modifiable sans rendre illisibles les candidatures déjà reçues.

## Où vivent les CV

Sur le disque, dans `UPLOAD_DIR`, rangés par année et par mois. **Hors du dépôt**
— un déploiement recopie l'application et effacerait un dossier situé à
l'intérieur. L'application le signale d'elle-même si le chemin tombe dans son
propre répertoire.

Sauvegardez ce dossier avec la base : les deux sont indissociables.

## Sous le capot

Next.js 15 (App Router), TypeScript, Tailwind, PostgreSQL, PM2. Aucune
dépendance à un hébergeur particulier.

Sessions par JWT signé dans un cookie `httpOnly`, mots de passe hachés avec
bcrypt. Les documents ne sont jamais servis en statique : ils passent par une
route qui vérifie la session — et sa portée — ou le jeton de partage avant
d'envoyer le moindre octet.

L'analyse de charte fait des requêtes vers une adresse saisie dans un
formulaire, ce qui est une porte ouverte si on n'y prend pas garde :
`169.254.169.254` rend les jetons du fournisseur cloud, `localhost` sonde la
base. `lib/reseau.ts` ferme cette porte — schémas restreints, résolution DNS
vérifiée contre les plages réservées, redirections suivies à la main et
revalidées à chaque saut, corps lus par morceaux et coupés au plafond. Le
« DNS rebinding » reste théoriquement possible : Node ne permet pas de fixer
l'adresse résolue pour un `fetch`.

### Une réserve connue

`npm audit` signale `postcss@8.4.31`, épinglé par Next lui-même. Les failles
portent sur du CSS fourni par un tiers ; ici, seul notre propre CSS passe par
postcss, à la compilation. Forcer une version que le framework a figée coûterait
plus cher que la faille.

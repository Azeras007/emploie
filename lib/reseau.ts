import "server-only";
import dns from "dns/promises";
import net from "net";

/**
 * Garde-fous des requêtes sortantes.
 *
 * L'aspiration de charte va chercher le site d'un client — donc une adresse
 * saisie dans un formulaire. Une application qui suit une adresse arbitraire
 * depuis son serveur est une porte ouverte : `http://169.254.169.254/` rend les
 * jetons d'identité du fournisseur cloud, `http://localhost:5432` sonde la base,
 * `file://` lit le disque. C'est la faille SSRF, et elle se ferme ici.
 *
 * Ce module ne fait confiance à rien : ni au schéma, ni au nom d'hôte, ni à
 * l'adresse IP derrière, ni aux redirections.
 */

const SCHEMAS_AUTORISES = new Set(["http:", "https:"]);

/** Plages qu'aucune requête sortante n'a de raison d'atteindre. */
function estPriveeV4(ip: string): boolean {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  return (
    a === 0 || // « cette machine »
    a === 10 || // privé
    a === 127 || // boucle locale
    (a === 169 && b === 254) || // lien-local, et les métadonnées cloud
    (a === 172 && b >= 16 && b <= 31) || // privé
    (a === 192 && b === 168) || // privé
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 192 && b === 0) || // usages réservés
    (a === 198 && (b === 18 || b === 19)) || // bancs d'essai
    (a === 203 && b === 0) || // documentation
    a >= 224 // multicast et réservé
  );
}

function estPriveeV6(ip: string): boolean {
  const bas = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (bas === "::1" || bas === "::") return true;
  if (bas.startsWith("fe80") || bas.startsWith("fc") || bas.startsWith("fd")) return true;
  // ::ffff:a.b.c.d — une adresse v4 déguisée en v6.
  const v4 = bas.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return estPriveeV4(v4[1]);
  return false;
}

export function adresseInterdite(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return estPriveeV4(ip);
  if (version === 6) return estPriveeV6(ip);
  return true;
}

export class UrlRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlRefusee";
  }
}

/**
 * Vérifie qu'une adresse est publique, et la rend normalisée.
 *
 * La résolution DNS est refaite ici alors que `fetch` la refera pour son propre
 * compte : entre les deux, un serveur hostile peut changer sa réponse et
 * pointer vers une adresse privée. C'est le « DNS rebinding », et Node ne
 * permet pas de fixer l'adresse résolue pour une requête `fetch`. Le contrôle
 * ferme la porte aux adresses privées écrites en clair et à la grande majorité
 * des redirections hostiles ; il ne prétend pas être hermétique.
 */
export async function verifierUrlPublique(brut: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(brut.trim());
  } catch {
    throw new UrlRefusee("Adresse illisible. Attendu : https://exemple.fr");
  }

  if (!SCHEMAS_AUTORISES.has(url.protocol)) {
    throw new UrlRefusee(`Seuls http et https sont acceptés (reçu : ${url.protocol}).`);
  }

  const hote = url.hostname;
  if (net.isIP(hote)) {
    if (adresseInterdite(hote)) throw new UrlRefusee(`Adresse réservée refusée : ${hote}.`);
    return url;
  }

  let adresses: { address: string }[];
  try {
    adresses = await dns.lookup(hote, { all: true });
  } catch {
    throw new UrlRefusee(`Nom de domaine introuvable : ${hote}.`);
  }
  if (adresses.length === 0) throw new UrlRefusee(`Nom de domaine sans adresse : ${hote}.`);

  // Une seule adresse privée suffit à refuser : un domaine peut en publier
  // plusieurs, et rien ne garantit laquelle `fetch` retiendra.
  const interdite = adresses.find((a) => adresseInterdite(a.address));
  if (interdite) {
    throw new UrlRefusee(
      `${hote} pointe vers une adresse réservée (${interdite.address}). Requête refusée.`
    );
  }
  return url;
}

export interface Recuperation {
  url: string;
  contenu: string;
  typeMime: string;
}

const DELAI = 8_000;
const TAILLE_MAX = 3 * 1024 * 1024;
const REDIRECTIONS_MAX = 3;

/**
 * Télécharge une ressource texte, en suivant les redirections à la main.
 *
 * À la main, parce que `redirect: "follow"` laisserait le navigateur interne
 * suivre un saut vers `http://127.0.0.1` sans repasser par la vérification.
 * Chaque étape est donc revalidée.
 *
 * La réponse est lue par morceaux et coupée au-delà de 3 Mo : une feuille de
 * style de 400 Mo ne doit pas pouvoir saturer la mémoire du serveur.
 */
export async function recupererTexte(brut: string): Promise<Recuperation> {
  let cible = brut;

  for (let saut = 0; saut <= REDIRECTIONS_MAX; saut++) {
    const url = await verifierUrlPublique(cible);
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), DELAI);

    let reponse: Response;
    try {
      reponse = await fetch(url, {
        redirect: "manual",
        signal: controleur.signal,
        headers: {
          // Un agent honnête : les sites qui refusent les robots doivent
          // pouvoir le faire, plutôt que d'être contournés.
          "user-agent": "Mozilla/5.0 (compatible; CandidaturesBot/1.0; +analyse de charte)",
          accept: "text/html,text/css,*/*;q=0.5",
        },
      });
    } catch (err) {
      clearTimeout(minuteur);
      const cause = err instanceof Error ? err.message : String(err);
      throw new UrlRefusee(`${url.hostname} n'a pas répondu (${cause}).`);
    }
    clearTimeout(minuteur);

    if (reponse.status >= 300 && reponse.status < 400) {
      const suite = reponse.headers.get("location");
      if (!suite) throw new UrlRefusee(`Redirection sans destination depuis ${url.href}.`);
      cible = new URL(suite, url).href;
      continue;
    }

    if (!reponse.ok) {
      // 403 et 429 ne sont pas des pannes : le site refuse délibérément les
      // requêtes automatiques. Beaucoup de grandes enseignes le font. Plutôt
      // que de nous déguiser en navigateur pour passer outre — ce qui serait
      // contourner leur décision — on dit ce qui se passe et on indique la
      // porte de sortie : l'adresse d'une feuille de style se copie depuis les
      // outils de développement, et l'analyse la prend telle quelle.
      if (reponse.status === 403 || reponse.status === 429) {
        throw new UrlRefusee(
          `${url.hostname} refuse les requêtes automatiques (${reponse.status}). ` +
            "Ouvrez le site dans votre navigateur, copiez l'adresse d'une de ses feuilles " +
            "de style (.css) et collez-la ici — ou saisissez les couleurs à la main."
        );
      }
      throw new UrlRefusee(`${url.hostname} a répondu ${reponse.status}.`);
    }

    const typeMime = (reponse.headers.get("content-type") ?? "").split(";")[0].trim();
    const contenu = await lireBorne(reponse);
    return { url: url.href, contenu, typeMime };
  }

  throw new UrlRefusee(`Trop de redirections (plus de ${REDIRECTIONS_MAX}).`);
}

/**
 * La même chose, en binaire — pour les logotypes.
 *
 * Le plafond est passé en argument : un PNG de 256 Ko n'a pas les mêmes
 * besoins qu'une feuille de style. Le corps est lu par morceaux et la lecture
 * s'arrête net au-delà, plutôt que de laisser `arrayBuffer()` tout charger :
 * rien n'oblige un serveur distant à annoncer sa taille honnêtement.
 */
export async function recupererOctets(
  brut: string,
  plafond: number
): Promise<{ url: string; octets: Uint8Array; typeMime: string; tronque: boolean }> {
  const url = await verifierUrlPublique(brut);
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI);

  let reponse: Response;
  try {
    reponse = await fetch(url, { redirect: "error", signal: controleur.signal });
  } catch (err) {
    clearTimeout(minuteur);
    throw new UrlRefusee(
      `${url.hostname} n'a pas répondu (${err instanceof Error ? err.message : "erreur"}).`
    );
  }
  clearTimeout(minuteur);

  if (!reponse.ok) throw new UrlRefusee(`${url.hostname} a répondu ${reponse.status}.`);

  const typeMime = (reponse.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const corps = reponse.body;
  if (!corps) return { url: url.href, octets: new Uint8Array(), typeMime, tronque: false };

  const lecteur = corps.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  let tronque = false;
  while (true) {
    const { done, value } = await lecteur.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > plafond) {
      tronque = true;
      break;
    }
    morceaux.push(value);
  }
  await lecteur.cancel().catch(() => undefined);

  const octets = new Uint8Array(morceaux.reduce((n, m) => n + m.byteLength, 0));
  let position = 0;
  for (const morceau of morceaux) {
    octets.set(morceau, position);
    position += morceau.byteLength;
  }
  return { url: url.href, octets, typeMime, tronque };
}

async function lireBorne(reponse: Response): Promise<string> {
  const corps = reponse.body;
  if (!corps) return "";
  const lecteur = corps.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  while (total < TAILLE_MAX) {
    const { done, value } = await lecteur.read();
    if (done) break;
    if (value) {
      morceaux.push(value);
      total += value.byteLength;
    }
  }
  await lecteur.cancel().catch(() => undefined);
  const tampon = new Uint8Array(Math.min(total, TAILLE_MAX));
  let position = 0;
  for (const morceau of morceaux) {
    const reste = tampon.length - position;
    if (reste <= 0) break;
    tampon.set(morceau.subarray(0, reste), position);
    position += Math.min(morceau.byteLength, reste);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(tampon);
}

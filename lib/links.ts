import { BASE_PATH } from "./basePath";

/**
 * Construction des adresses publiques de candidature.
 *
 * Ces adresses finissent imprimées — sur une devanture, un flyer, une affiche —
 * et ne peuvent alors plus être corrigées. Elles sont donc bâties sur le
 * domaine public de l'enseigne, jamais sur celui de l'hébergeur du moment : si
 * l'application déménage, il suffit de rediriger le domaine, et tous les QR
 * déjà en circulation continuent de fonctionner.
 *
 * Le chemin, lui, est celui sous lequel l'application est réellement servie —
 * /candidature par défaut, la racine si BASE_PATH est vidé. Le déduire plutôt
 * que le réécrire est ce qui garantit qu'un QR imprimé pointe bien là où
 * l'application répond : les deux ne peuvent pas diverger.
 */
export const CANDIDATURE_PATH = BASE_PATH;

export function candidatureUrl(publicBaseUrl: string, token?: string | null): string {
  const base = (publicBaseUrl || "").trim().replace(/\/+$/, "");
  const suffix = token ? `${CANDIDATURE_PATH}/l/${token}` : CANDIDATURE_PATH;
  return `${base}${suffix}` || base;
}

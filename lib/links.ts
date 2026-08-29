/**
 * Construction des adresses publiques de candidature.
 *
 * Ces adresses finissent imprimées — sur une devanture, un flyer, une affiche —
 * et ne peuvent alors plus être corrigées. Elles sont donc bâties sur le
 * domaine public de l'entreprise, jamais sur celui de l'hébergeur du moment :
 * si l'application déménage, il suffit de rediriger le domaine, et tous les QR
 * déjà en circulation continuent de fonctionner.
 *
 * Le chemin, lui, est figé : /candidature pour le questionnaire général,
 * /candidature/l/<jeton> pour un lien traçable.
 */
export const CANDIDATURE_PATH = "/candidature";

export function candidatureUrl(publicBaseUrl: string, token?: string | null): string {
  const base = (publicBaseUrl || "").trim().replace(/\/+$/, "");
  const suffix = token ? `${CANDIDATURE_PATH}/l/${token}` : CANDIDATURE_PATH;
  return `${base}${suffix}`;
}

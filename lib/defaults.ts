import { DEFAULT_QUESTIONS } from "./questions";
import type { Settings } from "./types";

/**
 * Réglages de départ. Tout est modifiable depuis le back-office : ces valeurs
 * ne servent qu'à ce que l'application soit utilisable dès la première visite.
 *
 * Les règles ci-dessous traduisent les priorités d'un magasin : la
 * disponibilité le samedi et sur les temps forts pèse plus lourd que le nombre
 * d'années d'expérience, et un trajet court prédit mieux la tenue dans la durée
 * qu'un CV fourni.
 */
export const DEFAULT_SETTINGS: Settings = {
  questions: DEFAULT_QUESTIONS,
  rules: [
    {
      id: "r-samedi",
      label: "Disponible le samedi",
      target: "creneaux",
      operator: "includes",
      value: "Le samedi",
      points: 20,
      mode: "bonus",
      enabled: true,
    },
    {
      id: "r-temps-forts",
      label: "Disponible pendant les soldes et la rentrée",
      target: "creneaux",
      operator: "includes",
      value: "Pendant les soldes et la rentrée",
      points: 10,
      mode: "bonus",
      enabled: true,
    },
    {
      id: "r-experience",
      label: "A déjà travaillé en vente",
      target: "experience",
      operator: "not_equals",
      value: "Aucune expérience",
      points: 15,
      mode: "bonus",
      enabled: true,
    },
    {
      id: "r-trajet",
      label: "À moins de 30 minutes du magasin",
      target: "trajet",
      operator: "lte",
      value: "30",
      points: 15,
      mode: "bonus",
      enabled: true,
    },
    {
      id: "r-dispo",
      label: "Disponible immédiatement",
      target: "disponibilite",
      operator: "equals",
      value: "Immédiatement",
      points: 10,
      mode: "bonus",
      enabled: true,
    },
    {
      id: "r-cdi",
      label: "Ouvert au CDI",
      target: "contrat",
      operator: "includes",
      value: "CDI",
      points: 10,
      mode: "bonus",
      enabled: true,
    },
    {
      id: "r-relation",
      label: "Sait raconter une situation client",
      target: "relation_client",
      operator: "answered",
      value: "",
      points: 10,
      mode: "bonus",
      enabled: true,
    },
    {
      id: "r-motivation",
      label: "Motivation rédigée",
      target: "motivation",
      operator: "answered",
      value: "",
      points: 10,
      mode: "bonus",
      enabled: true,
    },
    {
      id: "r-cv",
      label: "CV fourni",
      target: "file",
      operator: "has_file",
      value: "cv",
      points: 10,
      mode: "required",
      enabled: true,
    },
  ],
  threshold: 60,
  hideDisqualified: false,
  defaultSort: "score",
  jobTitle: "Nous recrutons en magasin",
  companyName: "Kiabi",
  publicBaseUrl: "https://recrutement.kiabi.com",
  intro:
    "Dix questions, cinq minutes. Répondez franchement : c'est ce qui nous permet de vous proposer des horaires qui vous vont vraiment.",
};

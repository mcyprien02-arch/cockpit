export type Status = "ok" | "wn" | "dg" | null;

export interface Magasin {
  id: string;
  nom: string;
  ville: string | null;
  franchise: string | null;
  phase_vie?: "lancement" | "croissance" | "maturite" | null;
  annee_ouverture?: number | null;
  surface_m2?: number | null;
}

export interface Indicateur {
  id: string;
  nom: string;
  unite: string | null;
  direction: "up" | "down";
  seuil_ok: number | null;
  seuil_vigilance: number | null;
  poids: number;
  action_defaut: string | null;
  categorie: string;
  ordre: number;
}

export interface ValeurAvecIndicateur {
  magasin_id: string;
  indicateur_id: string;
  valeur: number;
  date_saisie: string;
  indicateur_nom: string;
  unite: string | null;
  direction: "up" | "down";
  seuil_ok: number | null;
  seuil_vigilance: number | null;
  categorie: string;
  poids: number;
  action_defaut: string | null;
  magasin_nom: string;
  status?: Status;
}

export interface CategorieScore {
  name: string;
  score: number;
  ok: number;
  wn: number;
  dg: number;
  total: number;
  items: ValeurAvecIndicateur[];
}

export interface ActionOuverte {
  id: string;
  magasin_id: string;
  magasin_nom: string;
  priorite: "P1" | "P2" | "P3";
  constat: string;
  action: string;
  responsable: string | null;
  echeance: string | null;
  statut: string;
}

export interface Visite {
  id: string;
  magasin_id: string;
  date_visite: string;
  consultant: string;
  score_global: number | null;
}

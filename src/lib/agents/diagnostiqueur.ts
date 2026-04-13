import type { ValeurAvecIndicateur } from "@/types";

export interface DiagAlerte {
  kpi: string;
  valeur: number;
  seuil: number;
  statut: "danger" | "vigilance";
  cout_cache_annuel: number;
  formule: string;
  famille: string;
}

export interface DiagReco {
  priorite: number;
  action: string;
  gain_estime: number;
  delai: string;
  adapte_phase: string;
}

export interface DiagNonNegociables {
  top20_vs_traite: boolean;
  masse_sal_ok: boolean;
  mix_rayon_ok: boolean;
  estaly_actif: boolean;
  merch_ok: boolean;
}

export interface DiagResult {
  score: number;
  alertes: DiagAlerte[];
  recommandations: DiagReco[];
  non_negociables: DiagNonNegociables;
  narratif: string;
}

export async function callDiagnostiqueur(
  valeurs: ValeurAvecIndicateur[],
  phase: "lancement" | "croissance" | "maturite" = "croissance"
): Promise<DiagResult> {
  const kpis = valeurs.map((v) => ({
    nom: v.indicateur_nom,
    valeur: v.valeur,
    unite: v.unite ?? "",
    statut: v.status,
    seuil_ok: v.seuil_ok,
    seuil_vigilance: v.seuil_vigilance,
    categorie: v.categorie,
    direction: v.direction,
  }));

  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "diagnostiqueur", data: { kpis, phase } }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result as DiagResult;
}

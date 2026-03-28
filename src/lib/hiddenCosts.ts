import type { ValeurAvecIndicateur } from "@/types";

export type ISEORCategory =
  | "Sursalaires"
  | "Surtemps"
  | "Surconsommations"
  | "Non-productions"
  | "Non-créations de potentiel"
  | "Risques";

export interface HiddenCost {
  label: string;
  detail: string;
  estimatedLoss: number | null; // €/an
  kpiName: string;
  severity: "dg" | "wn";
  iseorCategory: ISEORCategory;
}

export const ISEOR_CATEGORY_COLORS: Record<ISEORCategory, string> = {
  "Sursalaires":                "#f472b6",
  "Surtemps":                   "#ffb347",
  "Surconsommations":           "#a78bfa",
  "Non-productions":            "#ff4d6a",
  "Non-créations de potentiel": "#4da6ff",
  "Risques":                    "#ff6b6b",
};

export const ISEOR_CATEGORY_ICONS: Record<ISEORCategory, string> = {
  "Sursalaires":                "👥",
  "Surtemps":                   "⏱",
  "Surconsommations":           "♻️",
  "Non-productions":            "📉",
  "Non-créations de potentiel": "🌱",
  "Risques":                    "⚠️",
};

/** Estimate annual hidden costs from KPI values — mapped to ISEOR categories */
export function computeHiddenCosts(valeurs: ValeurAvecIndicateur[]): HiddenCost[] {
  const costs: HiddenCost[] = [];
  const get = (nom: string) => valeurs.find((v) => v.indicateur_nom === nom);

  // ── Turnover → Sursalaires ─────────────────────────────────
  const turnover = get("Turnover");
  const nbEtp = get("Nb ETP");
  if (turnover && turnover.status !== "ok") {
    const tv = turnover.valeur;
    const etp = nbEtp ? nbEtp.valeur : 6;
    const excessTv = Math.max(0, tv - 10);
    const annualCost = Math.round((excessTv / 100) * etp * 4500);
    if (annualCost > 0) {
      costs.push({
        kpiName: "Turnover",
        label: `Turnover élevé (${tv}%)`,
        detail: `Recrutement + intégration + formation × ${etp} ETP`,
        estimatedLoss: annualCost,
        severity: turnover.status === "dg" ? "dg" : "wn",
        iseorCategory: "Sursalaires",
      });
    }
  }

  // ── Polyvalence → Surtemps ─────────────────────────────────
  const polyvalence = get("Polyvalence");
  if (polyvalence && polyvalence.status !== "ok") {
    const pv = polyvalence.valeur;
    const etp = nbEtp ? nbEtp.valeur : 6;
    const gap = Math.max(0, 70 - pv);
    const annualCost = Math.round((gap / 100) * etp * 2000);
    if (annualCost > 0) {
      costs.push({
        kpiName: "Polyvalence",
        label: `Manque de polyvalence (${pv}%)`,
        detail: `Temps perdu en remplacement + attentes`,
        estimatedLoss: annualCost,
        severity: polyvalence.status === "dg" ? "dg" : "wn",
        iseorCategory: "Surtemps",
      });
    }
  }

  // ── Picea non utilisé → Surtemps ──────────────────────────
  const picea = get("Batterie / Picea");
  if (picea && picea.valeur === 0) {
    costs.push({
      kpiName: "Batterie / Picea",
      label: "Picea non déployé",
      detail: "Temps de diagnostic manuel + retours évitables",
      estimatedLoss: 3600,
      severity: "dg",
      iseorCategory: "Surtemps",
    });
  }

  // ── Outils non activés → Surtemps ─────────────────────────
  const tuileRep = get("Tuile réparation");
  if (tuileRep && tuileRep.valeur === 0) {
    costs.push({
      kpiName: "Tuile réparation",
      label: "Tuile réparation inactive",
      detail: "Gestion SAV manuelle = surtemps administratif",
      estimatedLoss: 1200,
      severity: "dg",
      iseorCategory: "Surtemps",
    });
  }

  // ── Stock âgé → Surconsommations ──────────────────────────
  const stockAge = get("Stock âgé");
  const valeurStock = get("Valeur stock");
  if (stockAge && stockAge.status !== "ok") {
    const sa = stockAge.valeur;
    const sv = valeurStock ? valeurStock.valeur : 150000;
    const excessStock = Math.max(0, sa - 30);
    const annualCost = Math.round((excessStock / 100) * sv * 0.38);
    if (annualCost > 0) {
      costs.push({
        kpiName: "Stock âgé",
        label: `Stock âgé (${sa}%)`,
        detail: `Marge perdue + démarque future sur stock immobilisé`,
        estimatedLoss: annualCost,
        severity: stockAge.status === "dg" ? "dg" : "wn",
        iseorCategory: "Surconsommations",
      });
    }
  }

  // ── Taux démarque → Surconsommations ──────────────────────
  const demarque = get("Taux de démarque");
  if (demarque && demarque.status !== "ok") {
    const dm = demarque.valeur;
    const sv = valeurStock ? valeurStock.valeur : 150000;
    const excessDm = Math.max(0, dm - 3);
    const annualCost = Math.round((excessDm / 100) * sv * 4);
    if (annualCost > 0) {
      costs.push({
        kpiName: "Taux de démarque",
        label: `Démarque élevée (${dm}%)`,
        detail: `Pertes inventaire dépassant la norme réseau`,
        estimatedLoss: annualCost,
        severity: demarque.status === "dg" ? "dg" : "wn",
        iseorCategory: "Surconsommations",
      });
    }
  }

  // ── Délai de vente → Non-productions ──────────────────────
  const delai = get("Délai de vente moyen");
  if (delai && delai.status !== "ok") {
    const d = delai.valeur;
    const target = delai.seuil_ok ?? 30;
    const excess = Math.max(0, d - target);
    const annualCost = Math.round(excess * 120);
    costs.push({
      kpiName: "Délai de vente moyen",
      label: `Rotation lente (${d}j vs cible ${target}j)`,
      detail: `Trésorerie immobilisée + démarque progressive`,
      estimatedLoss: annualCost,
      severity: delai.status === "dg" ? "dg" : "wn",
      iseorCategory: "Non-productions",
    });
  }

  // ── Taux d'achat ext. → Non-productions ───────────────────
  const tauxAchat = get("Taux d'achat ext. global");
  if (tauxAchat && tauxAchat.status !== "ok") {
    const current = tauxAchat.valeur;
    const target = tauxAchat.seuil_ok ?? 20;
    const gap = Math.max(0, target - current);
    const annualCost = Math.round(gap * 800);
    if (annualCost > 0) {
      costs.push({
        kpiName: "Taux d'achat ext. global",
        label: `Sourcing externe sous-exploité (${current}% vs ${target}%)`,
        detail: `Potentiel de rachat non réalisé`,
        estimatedLoss: annualCost,
        severity: tauxAchat.status === "dg" ? "dg" : "wn",
        iseorCategory: "Non-productions",
      });
    }
  }

  // ── Ventes complémentaires → Non-créations ─────────────────
  const ventesComp = get("Ventes complémentaires");
  if (ventesComp && ventesComp.status !== "ok") {
    const vc = ventesComp.valeur;
    const target = ventesComp.seuil_ok ?? 15;
    const gap = Math.max(0, target - vc);
    const annualCost = Math.round(gap * 600);
    if (annualCost > 0) {
      costs.push({
        kpiName: "Ventes complémentaires",
        label: `Ventes additionnelles insuffisantes (${vc}%)`,
        detail: `Opportunités cross-sell manquées`,
        estimatedLoss: annualCost,
        severity: ventesComp.status === "dg" ? "dg" : "wn",
        iseorCategory: "Non-créations de potentiel",
      });
    }
  }

  // ── Marketplace non utilisée → Non-créations ──────────────
  const marketplace = get("Tuile Marketplace");
  if (marketplace && marketplace.valeur === 0) {
    costs.push({
      kpiName: "Tuile Marketplace",
      label: "Marketplace inactive",
      detail: "Canal de vente digital non exploité",
      estimatedLoss: 8000,
      severity: "dg",
      iseorCategory: "Non-créations de potentiel",
    });
  }

  // ── Fidélisation faible → Non-créations ───────────────────
  const rattachement = get("Rattachement");
  if (rattachement && rattachement.status !== "ok") {
    const r = rattachement.valeur;
    const target = rattachement.seuil_ok ?? 65;
    const gap = Math.max(0, target - r);
    const annualCost = Math.round(gap * 400);
    if (annualCost > 0) {
      costs.push({
        kpiName: "Rattachement",
        label: `Programme fidélité sous-utilisé (${r}%)`,
        detail: `Clients non fidélisés = perte de récurrence`,
        estimatedLoss: annualCost,
        severity: rattachement.status === "dg" ? "dg" : "wn",
        iseorCategory: "Non-créations de potentiel",
      });
    }
  }

  // ── Produits certifiés → Risques ──────────────────────────
  const certif = get("Produits certifiés authentiques");
  if (certif && certif.valeur === 0) {
    costs.push({
      kpiName: "Produits certifiés authentiques",
      label: "Authentification non activée",
      detail: "Risque de rachat de produits contrefaits",
      estimatedLoss: 5000,
      severity: "dg",
      iseorCategory: "Risques",
    });
  }

  // ── Note Google basse → Risques ───────────────────────────
  const noteGoogle = get("Note Google");
  if (noteGoogle && noteGoogle.status !== "ok") {
    const ng = noteGoogle.valeur;
    const annualCost = Math.round((4.5 - ng) * 3000);
    if (annualCost > 0) {
      costs.push({
        kpiName: "Note Google",
        label: `E-réputation dégradée (${ng}/5)`,
        detail: `Impact sur le trafic et la confiance client`,
        estimatedLoss: annualCost,
        severity: noteGoogle.status === "dg" ? "dg" : "wn",
        iseorCategory: "Risques",
      });
    }
  }

  return costs;
}

/** Aggregate costs by ISEOR category */
export function aggregateByISEORCategory(costs: HiddenCost[]): Record<ISEORCategory, number> {
  const result = {} as Record<ISEORCategory, number>;
  const cats: ISEORCategory[] = [
    "Sursalaires", "Surtemps", "Surconsommations",
    "Non-productions", "Non-créations de potentiel", "Risques",
  ];
  cats.forEach((c) => {
    result[c] = costs
      .filter((h) => h.iseorCategory === c)
      .reduce((sum, h) => sum + (h.estimatedLoss ?? 0), 0);
  });
  return result;
}

export function formatEuro(n: number): string {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

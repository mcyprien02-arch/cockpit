import type { ValeurAvecIndicateur } from "@/types";

export interface HiddenCost {
  label: string;
  detail: string;
  estimatedLoss: number | null; // €/an
  kpiName: string;
  severity: "dg" | "wn";
}

/** Estimate annual hidden costs from KPI values */
export function computeHiddenCosts(valeurs: ValeurAvecIndicateur[]): HiddenCost[] {
  const costs: HiddenCost[] = [];
  const get = (nom: string) => valeurs.find((v) => v.indicateur_nom === nom);

  // ── Turnover ───────────────────────────────────────────────────
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
        label: `Turnover ${tv}%`,
        detail: `Coût estimé en recrutement + formation`,
        estimatedLoss: annualCost,
        severity: turnover.status === "dg" ? "dg" : "wn",
      });
    }
  }

  // ── Stock âgé ─────────────────────────────────────────────────
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
        label: `Stock âgé ${sa}%`,
        detail: `Marge perdue sur stock immobilisé`,
        estimatedLoss: annualCost,
        severity: stockAge.status === "dg" ? "dg" : "wn",
      });
    }
  }

  // ── Picea non utilisé ─────────────────────────────────────────
  const picea = get("Batterie / Picea");
  if (picea && picea.valeur === 0) {
    costs.push({
      kpiName: "Batterie / Picea",
      label: "Picea non déployé",
      detail: "Retours évitables non détectés à l'achat",
      estimatedLoss: 3600,
      severity: "dg",
    });
  }

  // ── TLAC / taux d'achat ext. ──────────────────────────────────
  const tauxAchat = get("Taux d'achat ext. global");
  if (tauxAchat && tauxAchat.status !== "ok") {
    const current = tauxAchat.valeur;
    const target = tauxAchat.seuil_ok ?? 20;
    const gap = Math.max(0, target - current);
    const annualCost = Math.round(gap * 800);
    if (annualCost > 0) {
      costs.push({
        kpiName: "Taux d'achat ext. global",
        label: `Sourcing externe ${current}% (cible ${target}%)`,
        detail: `Potentiel d'achat non exploité`,
        estimatedLoss: annualCost,
        severity: tauxAchat.status === "dg" ? "dg" : "wn",
      });
    }
  }

  // ── Délai de vente ─────────────────────────────────────────────
  const delai = get("Délai de vente moyen");
  if (delai && delai.status !== "ok") {
    const d = delai.valeur;
    const target = delai.seuil_ok ?? 30;
    const excess = Math.max(0, d - target);
    const annualCost = Math.round(excess * 120);
    costs.push({
      kpiName: "Délai de vente moyen",
      label: `Rotation lente ${d}j (cible ${target}j)`,
      detail: `Immobilisation trésorerie + démarque future`,
      estimatedLoss: annualCost,
      severity: delai.status === "dg" ? "dg" : "wn",
    });
  }

  // ── Produits certifiés ─────────────────────────────────────────
  const certif = get("Produits certifiés authentiques");
  if (certif && certif.valeur === 0) {
    costs.push({
      kpiName: "Produits certifiés authentiques",
      label: "Authentification non activée",
      detail: "Risque produits contrefaits non détectés",
      estimatedLoss: null,
      severity: "dg",
    });
  }

  return costs;
}

export function formatEuro(n: number): string {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

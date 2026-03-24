import type { ValeurAvecIndicateur, Status, CategorieScore } from "@/types";

export function getStatus(
  valeur: number | null | undefined,
  direction: "up" | "down",
  seuil_ok: number | null,
  seuil_vigilance: number | null
): Status {
  if (valeur == null || isNaN(valeur) || seuil_ok == null || seuil_vigilance == null) return null;
  if (direction === "up") {
    return valeur >= seuil_ok ? "ok" : valeur >= seuil_vigilance ? "wn" : "dg";
  }
  return valeur <= seuil_ok ? "ok" : valeur <= seuil_vigilance ? "wn" : "dg";
}

export function computeScore(valeurs: ValeurAvecIndicateur[]): number | null {
  const withStatus = valeurs.filter((v) => v.status !== null);
  if (withStatus.length === 0) return null;
  const totalWeight = withStatus.reduce((acc, v) => acc + (v.poids || 1), 0);
  const okWeight = withStatus
    .filter((v) => v.status === "ok")
    .reduce((acc, v) => acc + (v.poids || 1), 0);
  return Math.round((okWeight / totalWeight) * 100);
}

export function computeCategoryScores(valeurs: ValeurAvecIndicateur[]): CategorieScore[] {
  const groups: Record<string, CategorieScore> = {};
  valeurs
    .filter((v) => v.status !== null)
    .forEach((v) => {
      const cat = v.categorie || "Autre";
      if (!groups[cat]) {
        groups[cat] = { name: cat, score: 0, ok: 0, wn: 0, dg: 0, total: 0, items: [] };
      }
      groups[cat].total++;
      groups[cat][v.status as "ok" | "wn" | "dg"]++;
      groups[cat].items.push(v);
    });

  return Object.values(groups)
    .map((g) => ({ ...g, score: Math.round((g.ok / g.total) * 100) }))
    .sort((a, b) => a.score - b.score);
}

export function statusColor(status: Status): string {
  if (status === "ok") return "var(--accent)";
  if (status === "wn") return "var(--warn)";
  return "var(--danger)";
}

export function scoreColor(score: number | null): string {
  if (score === null) return "var(--textDim)";
  if (score >= 70) return "var(--accent)";
  if (score >= 45) return "var(--warn)";
  return "var(--danger)";
}

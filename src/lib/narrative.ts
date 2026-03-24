import type { CategorieScore } from "@/types";

interface NarrativeParams {
  score: number | null;
  previousScore: number | null;
  daysSinceLastVisit: number | null;
  categories: CategorieScore[];
  openActionsTotal: number;
  openActionsDone: number;
  openActionsLate: number;
  magasinNom: string;
}

export function generateNarrative(p: NarrativeParams): string {
  if (p.score === null || p.categories.length === 0) {
    return "Aucune donnée disponible pour ce magasin. Commencez par saisir les indicateurs via l'onglet KPIs.";
  }

  const sentences: string[] = [];
  const sorted = [...p.categories].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  // ── Phrase 1 : évolution du score ──────────────────────────────
  if (p.daysSinceLastVisit !== null && p.previousScore !== null) {
    const weeks = Math.round(p.daysSinceLastVisit / 7);
    const timeStr =
      weeks <= 1 ? "1 semaine" :
      weeks <= 4 ? `${weeks} semaines` :
      `${Math.round(weeks / 4)} mois`;
    const delta = p.score - p.previousScore;
    if (delta > 2) {
      sentences.push(
        `Depuis votre dernière visite il y a ${timeStr}, votre score est passé de ${p.previousScore} à ${p.score} (+${delta} pts).`
      );
    } else if (delta < -2) {
      sentences.push(
        `Depuis votre dernière visite il y a ${timeStr}, votre score a reculé de ${p.previousScore} à ${p.score} (${delta} pts).`
      );
    } else {
      sentences.push(
        `Depuis votre dernière visite il y a ${timeStr}, votre score est stable à ${p.score}.`
      );
    }
  } else {
    const level =
      p.score >= 70 ? "bon" :
      p.score >= 45 ? "moyen" : "insuffisant";
    sentences.push(`Score global de ${p.score}/100 — niveau ${level}.`);
  }

  // ── Phrase 2 : point fort + point faible ───────────────────────
  if (best && worst && best.name !== worst.name) {
    if (worst.score < 55 && worst.dg > 0) {
      sentences.push(
        `Point critique : ${worst.name} tire le score vers le bas (${worst.score}%, ${worst.dg} alerte${worst.dg > 1 ? "s" : ""} action).`
      );
    } else if (best.score >= 70) {
      sentences.push(`Point fort : ${best.name} est en bonne forme (${best.score}%).`);
    }
  }

  // ── Phrase 3 : plan d'action ───────────────────────────────────
  if (p.openActionsTotal > 0) {
    if (p.openActionsDone > 0 && p.openActionsLate > 0) {
      sentences.push(
        `${p.openActionsDone} action${p.openActionsDone > 1 ? "s" : ""} terminée${p.openActionsDone > 1 ? "s" : ""}, ${p.openActionsLate} en retard — à traiter en priorité.`
      );
    } else if (p.openActionsLate > 0) {
      sentences.push(
        `${p.openActionsLate} action${p.openActionsLate > 1 ? "s" : ""} du plan d'action en retard — à traiter en priorité.`
      );
    } else if (p.openActionsDone > 0) {
      sentences.push(
        `Bonne dynamique : ${p.openActionsDone} action${p.openActionsDone > 1 ? "s" : ""} terminée${p.openActionsDone > 1 ? "s" : ""} depuis la dernière visite.`
      );
    }
  }

  return sentences.join(" ");
}

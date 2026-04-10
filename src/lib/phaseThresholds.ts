/**
 * Phase-aware KPI thresholds + contextualized €-recommendations
 *
 * Three phases: lancement (yr 1-2) | croissance (yr 3-4) | maturite (yr 5+)
 * Each KPI gets phase-specific seuil_ok and seuil_vigilance values.
 */

export type Phase = "lancement" | "croissance" | "maturite";

interface PhaseThreshold {
  direction: "up" | "down";
  seuil_ok: Record<Phase, number>;
  seuil_vigilance: Record<Phase, number>;
  /** Returns a contextualized recommendation string */
  recommandation: (valeur: number, phase: Phase, ca?: number) => string;
}

// ─── KPI → phase thresholds ────────────────────────────────────
// Keys match partial indicateur_nom (case-insensitive contains match)
export const PHASE_THRESHOLDS: Record<string, PhaseThreshold> = {
  "gmroi": {
    direction: "up",
    seuil_ok:         { lancement: 2.2, croissance: 3.0, maturite: 3.5 },
    seuil_vigilance:  { lancement: 1.6, croissance: 2.2, maturite: 2.5 },
    recommandation(v, phase, ca = 500_000) {
      const target = this.seuil_ok[phase];
      if (v >= target) return `GMROI excellent à ${v.toFixed(2)} pour votre phase ${phase}. Maintenez la rotation du stock.`;
      const gap = (target - v).toFixed(2);
      const impact = Math.round(ca * (target - v) * 0.08);
      return `Votre GMROI à ${v.toFixed(2)} est sous la cible ${phase} (>${target}). Chaque +0.1 de GMROI représente ~${formatK(ca * 0.08)}€ de marge libérée. Action : réduisez le stock âgé > ${phase === "lancement" ? "20" : phase === "croissance" ? "15" : "10"}% et accélérez la rotation. Impact estimé si +${gap} GMROI : ~${formatK(impact)}€/an.`;
    },
  },
  "marge": {
    direction: "up",
    seuil_ok:         { lancement: 35, croissance: 37, maturite: 39 },
    seuil_vigilance:  { lancement: 30, croissance: 33, maturite: 36 },
    recommandation(v, phase, ca = 500_000) {
      const target = this.seuil_ok[phase];
      if (v >= target) return `Marge à ${v}% — dans la cible pour votre phase ${phase}.`;
      const impactAnnuel = Math.round(ca * (target - v) / 100);
      return `Votre marge à ${v}% est sous l'objectif ${phase} (>${target}%). Gain annuel si vous atteignez ${target}% : ~${formatK(impactAnnuel)}€. Actions : vérifiez l'écart cote EP vs prix d'achat réel, réduisez les accélérations non maîtrisées sur stock âgé, et challengez le TLAC (chaque accessoire vendu améliore la marge de +1 à +2pts).`;
    },
  },
  "ebe": {
    direction: "up",
    seuil_ok:         { lancement: 5, croissance: 7, maturite: 8 },
    seuil_vigilance:  { lancement: 2, croissance: 4, maturite: 5 },
    recommandation(v, phase, ca = 500_000) {
      const target = this.seuil_ok[phase];
      if (v >= target) return `EBE à ${v}% — dans la cible ${phase}.`;
      const impactAnnuel = Math.round(ca * (target - v) / 100);
      return `EBE à ${v}% sous la cible ${phase} (>${target}%). L'EBE est la synthèse de vos décisions : chaque point de marge gagné ET chaque point de masse salariale maîtrisé se retrouve ici. Chemin prioritaire : 1) Réduire stock âgé (libère du cash), 2) Maîtriser masse salariale, 3) Améliorer TLAC. Impact si +${target - v}pts : ~${formatK(impactAnnuel)}€/an.`;
    },
  },
  "masse sal": {
    direction: "down",
    seuil_ok:         { lancement: 18, croissance: 16, maturite: 15 },
    seuil_vigilance:  { lancement: 22, croissance: 20, maturite: 18 },
    recommandation(v, phase, ca = 500_000) {
      const target = this.seuil_ok[phase];
      if (v <= target) return `Masse salariale à ${v}% — maîtrisée pour votre phase ${phase}.`;
      const impactAnnuel = Math.round(ca * (v - target) / 100);
      return `Masse salariale à ${v}% — dépasse la cible ${phase} (<${target}%). Surcoût estimé vs cible : ~${formatK(impactAnnuel)}€/an. En phase ${phase}, les magasins qui réduisent ce ratio sans baisser les effectifs passent par une meilleure organisation des temps (GC/RD/GF). Analysez la répartition des activités et optimisez les plannings aux heures de flux.`;
    },
  },
  "ca.*etp|ca par etp|ca/etp": {
    direction: "up",
    seuil_ok:         { lancement: 200_000, croissance: 230_000, maturite: 250_000 },
    seuil_vigilance:  { lancement: 150_000, croissance: 180_000, maturite: 200_000 },
    recommandation(v, phase) {
      const target = this.seuil_ok[phase];
      if (v >= target) return `CA/ETP à ${formatK(v)}€ — dans la norme ${phase}.`;
      return `CA/ETP à ${formatK(v)}€ sous la cible ${phase} (>${formatK(target)}€). Soit une productivité insuffisante, soit un effectif trop important pour le CA. En phase ${phase}, ciblez ${formatK(target)}€ par ETP. Action : analyse du mix produit par vendeur, montée en compétences sur les gammes à forte marge.`;
    },
  },
  "stock âg|stock age": {
    direction: "down",
    seuil_ok:         { lancement: 20, croissance: 15, maturite: 10 },
    seuil_vigilance:  { lancement: 30, croissance: 22, maturite: 15 },
    recommandation(v, phase, ca = 500_000) {
      const target = this.seuil_ok[phase];
      if (v <= target) return `Stock âgé à ${v}% — conforme à la cible ${phase}.`;
      // Valeur stock = ca * 0.35 (rough estimate)
      const stockVal = ca * 0.35;
      const ageValeur = Math.round(stockVal * (v - target) / 100);
      return `Stock âgé à ${v}% dépasse la cible ${phase} (<${target}%). Cash immobilisé estimé : ~${formatK(ageValeur)}€. En phase ${phase}, un stock âgé élevé indique une sur-achat ou des achats non alignés avec la demande. Actions immédiates : identifier les 10 produits les plus anciens, lancer des accélérations progressives, réviser les critères d'achat.`;
    },
  },
  "délai de vente|delai de vente": {
    direction: "down",
    seuil_ok:         { lancement: 45, croissance: 35, maturite: 30 },
    seuil_vigilance:  { lancement: 60, croissance: 50, maturite: 45 },
    recommandation(v, phase) {
      const target = this.seuil_ok[phase];
      if (v <= target) return `Délai de vente à ${v}j — dans la cible ${phase}.`;
      return `Délai de vente à ${v}j dépasse la cible ${phase} (<${target}j). Plus un produit reste en rayon, plus votre capital est immobilisé et votre GMROI chute. Actions : pour tout produit > ${target + 15}j, déclenchez la démarque progressive. Réglez votre module démarque sur -10% à J+${target}, -20% à J+${target + 15}.`;
    },
  },
  "gamme.*tél|gamme telephone|gamme téléphon": {
    direction: "up",
    seuil_ok:         { lancement: 50, croissance: 65, maturite: 70 },
    seuil_vigilance:  { lancement: 35, croissance: 50, maturite: 55 },
    recommandation(v, phase) {
      const target = this.seuil_ok[phase];
      if (v >= target) return `Gamme téléphonie à ${v}% — bonne couverture pour la phase ${phase}.`;
      return `Gamme téléphonie à ${v}% sous la cible ${phase} (>${target}%). La téléphonie est la gamme la plus rentable. Un magasin en phase ${phase} doit avoir >${target}% de sa gamme couverte. Priorisez les achats téléphonie lors de vos prochaines collectes.`;
    },
  },
  "tlac": {
    direction: "up",
    seuil_ok:         { lancement: 1.0, croissance: 1.4, maturite: 1.8 },
    seuil_vigilance:  { lancement: 0.6, croissance: 0.9, maturite: 1.2 },
    recommandation(v, phase, ca = 500_000) {
      const target = this.seuil_ok[phase];
      if (v >= target) return `TLAC à ${v} — excellent pour la phase ${phase}.`;
      const nbVentes = Math.round(ca / 120); // ~120€ panier moyen
      const margeAcc = 25; // €/accessoire moyen
      const impactAnnuel = Math.round((target - v) * nbVentes * margeAcc);
      return `Votre TLAC à ${v} vous coûte ~${formatK(impactAnnuel)}€/an de marge manquée (cible ${phase} : >${target}). Un accessoire supplémentaire par vente suffit. Action : challenge vendeurs sur 1 accessoire systématique pendant 2 semaines. Affichez le TLAC de chaque vendeur en temps réel.`;
    },
  },
  "taux.*retour|retour": {
    direction: "down",
    seuil_ok:         { lancement: 8, croissance: 6, maturite: 5 },
    seuil_vigilance:  { lancement: 12, croissance: 9, maturite: 7 },
    recommandation(v, phase, ca = 500_000) {
      const target = this.seuil_ok[phase];
      if (v <= target) return `Taux de retour à ${v}% — maîtrisé pour la phase ${phase}.`;
      const nbVentes = Math.round(ca / 120);
      const impactAnnuel = Math.round((v - target) / 100 * nbVentes * 80);
      return `Taux de retour à ${v}% dépasse la cible ${phase} (<${target}%). Impact estimé : ~${formatK(impactAnnuel)}€/an de coûts de traitement + marge perdue. Principale cause : téléphones non testés à l'achat (Picea). Actions : activer Picea sur tous les postes, former l'équipe aux tests, activer Authentifier.com pour les produits > 150€.`;
    },
  },
  "note google|avis google": {
    direction: "up",
    seuil_ok:         { lancement: 4.0, croissance: 4.3, maturite: 4.5 },
    seuil_vigilance:  { lancement: 3.6, croissance: 3.9, maturite: 4.1 },
    recommandation(v, phase) {
      const target = this.seuil_ok[phase];
      if (v >= target) return `Note Google à ${v}/5 — bonne réputation pour la phase ${phase}.`;
      return `Note Google à ${v}/5 sous la cible ${phase} (>${target}). Chaque point de note Google influe sur le flux entrant. Actions : répondez à tous les avis négatifs sous 24h, formez l'équipe à demander un avis à chaque client satisfait, analysez les thèmes récurrents dans l'onglet "Voix du client".`;
    },
  },
  "nps": {
    direction: "up",
    seuil_ok:         { lancement: 55, croissance: 65, maturite: 70 },
    seuil_vigilance:  { lancement: 40, croissance: 50, maturite: 55 },
    recommandation(v, phase) {
      const target = this.seuil_ok[phase];
      if (v >= target) return `NPS à ${v} — dans la cible ${phase}.`;
      return `NPS à ${v} sous l'objectif ${phase} (>${target}). Le NPS reflète la fidélité client. En phase ${phase}, les magasins performants atteignent ${target}+ grâce à un accueil systématique et un suivi post-achat. Action prioritaire : mettre en place un rituel d'accueil standardisé + email/SMS de suivi J+7 après achat.`;
    },
  },
};

// ─── Match helper ─────────────────────────────────────────────
/** Find the PhaseThreshold for a given indicateur_nom */
export function getPhaseThreshold(indicateurNom: string): PhaseThreshold | null {
  const nom = indicateurNom.toLowerCase();
  for (const [key, thresh] of Object.entries(PHASE_THRESHOLDS)) {
    const patterns = key.split("|");
    if (patterns.some(p => new RegExp(p).test(nom))) {
      return thresh;
    }
  }
  return null;
}

/** Override seuil_ok / seuil_vigilance for a valeur based on phase */
export function applyPhaseThresholds<T extends {
  indicateur_nom: string;
  seuil_ok: number | null;
  seuil_vigilance: number | null;
  direction: "up" | "down";
}>(valeur: T, phase: Phase | null | undefined): T {
  if (!phase) return valeur;
  const thresh = getPhaseThreshold(valeur.indicateur_nom);
  if (!thresh) return valeur;
  return {
    ...valeur,
    seuil_ok: thresh.seuil_ok[phase],
    seuil_vigilance: thresh.seuil_vigilance[phase],
    direction: thresh.direction,
  };
}

/** Generate a contextualized recommendation for a KPI in alert */
export function getContextualReco(
  indicateurNom: string,
  valeur: number,
  phase: Phase,
  ca?: number
): string | null {
  const thresh = getPhaseThreshold(indicateurNom);
  if (!thresh) return null;
  return thresh.recommandation(valeur, phase, ca);
}

// ─── Utility ──────────────────────────────────────────────────
function formatK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + " k";
  return n.toFixed(0);
}

export { formatK };

/** Phase labels */
export const PHASE_LABELS: Record<Phase, string> = {
  lancement: "Lancement",
  croissance: "Croissance",
  maturite: "Maturité",
};

/** Phase tone / positioning for header badge */
export const PHASE_CONFIG: Record<Phase, { color: string; bg: string; desc: string }> = {
  lancement:  { color: "#4da6ff", bg: "#4da6ff18", desc: "Priorité : constituer le stock, se faire connaître, former l'équipe" },
  croissance: { color: "#ffb347", bg: "#ffb34718", desc: "Priorité : optimiser la gamme, structurer le management, rentabilité" },
  maturite:   { color: "#00d4aa", bg: "#00d4aa18", desc: "Priorité : maximiser le GMROI, réduire les coûts cachés, excellence" },
};

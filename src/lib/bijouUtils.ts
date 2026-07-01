// Shared bijouterie analysis utilities — BOR / BOPI families

/** Normalize for bijou type detection: uppercase + strip accents */
export function normBij(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Detect bijou category from Athéna libellé.
 * Priority: Fonte/Or brut > Bracelet > Bague > Collier > Pendentif >
 *           Boucles d'oreille > Autre
 * (Bracelet before Bague to handle "BRACELET JONC" correctly)
 */
export function detectTypeBijou(lib: string): string {
  if (!lib) return 'Autre';
  const u = normBij(lib);
  if (/FONTE|DENTAIRE|DEBRIS|BROUTILLE|LOT\s*FONTE|OR\s*BRUT/.test(u))        return 'Fonte/Or brut';
  if (/BRACELET|GOURMETTE|MANCHETTE/.test(u))                                   return 'Bracelet';
  if (/BAGUE|ALLIANCE|SOLITAIRE|CHEVALIERE|CHEVALIER\s|JONC|MARQUISE/.test(u)) return 'Bague';
  if (/COLLIER|SAUTOIR|RAS\s*DE\s*COU|CHAINE|CRAVACHE/.test(u))               return 'Collier';
  if (/PENDENTIF|PEDENTIF|PENDEINTIF|MEDAILLE|MEDAILLON|MEDAILLOON|CROIX|COEUR/.test(u)) return 'Pendentif';
  if (/BOUCLE|\bBO\b|PUCE|CREOLE|DORMEUSE|CLOU|PENDANTE/.test(u))             return "Boucles d'oreille";
  return 'Autre';
}

/**
 * Extract weight (g) from Athéna libellé.
 * Pattern: decimal (comma or dot) + optional space + G + (space/end/comma/period)
 * Returns null if not found or out of plausible range [0.05 g, 500 g].
 */
export function extractPoidsFromLib(lib: string): number | null {
  if (!lib) return null;
  const m = lib.toUpperCase().match(/(\d+[,.]?\d*)\s*G(?:\s|$|,|\.)/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  if (isNaN(v) || v < 0.05 || v > 500) return null;
  return Math.round(v * 1000) / 1000;
}

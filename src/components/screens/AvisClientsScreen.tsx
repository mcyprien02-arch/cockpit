"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface AvisTheme {
  theme: string;
  nb: number;
  lien_kpi?: string;
}

interface AvisResult {
  positifs: AvisTheme[];
  negatifs: AvisTheme[];
  action_prioritaire: string;
  score_etoiles?: number | null;
}

// ─── Local KPI snapshot reader ────────────────────────────────
function readKPIs(magasinId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(`kpi_snapshot_${magasinId}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ─── Google review text extractor ────────────────────────────
// Google copy-paste includes: author name, date, star line, text
// Example:
//   Jean Dupont
//   il y a 2 semaines
//   ★★★★☆
//   Super magasin, très bon accueil !
function extractReviewLines(raw: string): { text: string; stars: number | null }[] {
  const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
  const DATE_PAT = /^il y a|^(lun|mar|mer|jeu|ven|sam|dim)|^\d{1,2}\/\d{2}\/\d{4}|^[a-z]+ \d{4}$/i;
  const STAR_PAT = /^[★☆✩✭\*]{1,5}$|^\d[,\.]\d|note\s*:/i;
  const NAME_PAT = /^[A-ZÀÉÈÊ][a-zàéèêîïûü]+ [A-ZÀÉÈÊ][a-zàéèêîïûü]+(\.?\s*)$/;
  const REPLY_PAT = /^réponse du propriétaire|^réponse de/i;

  const reviews: { text: string; stars: number | null }[] = [];
  let buffer: string[] = [];
  let currentStars: number | null = null;

  const flush = () => {
    const text = buffer.join(" ").trim();
    if (text.length > 10) reviews.push({ text, stars: currentStars });
    buffer = [];
    currentStars = null;
  };

  for (const line of lines) {
    if (REPLY_PAT.test(line)) { flush(); continue; }

    // Star line
    const starCount = (line.match(/★/g) ?? []).length;
    if (STAR_PAT.test(line) || starCount > 0) {
      if (starCount > 0) currentStars = starCount;
      continue;
    }

    // Numeric rating "4/5" or "4.5/5"
    const numRating = line.match(/^(\d)[,.]?(\d?)\s*\/\s*5/);
    if (numRating) { currentStars = parseInt(numRating[1]); continue; }

    // Date or name lines — flush previous and skip
    if (DATE_PAT.test(line) || NAME_PAT.test(line)) {
      if (buffer.length > 0) flush();
      continue;
    }

    buffer.push(line);
  }
  flush();

  return reviews;
}

// ─── Local theme analysis ─────────────────────────────────────
const THEMES_POS: { theme: string; keywords: string[] }[] = [
  { theme: "Accueil chaleureux",    keywords: ["accueil", "sympa", "sympathique", "gentil", "souriant", "aimable", "agréable"] },
  { theme: "Rapport qualité/prix",  keywords: ["prix", "pas cher", "abordable", "rapport qualité", "bonne affaire", "intéressant"] },
  { theme: "Rapidité du service",   keywords: ["rapide", "vite", "efficace", "sans attente", "réactif", "expédié"] },
  { theme: "Qualité des produits",  keywords: ["qualité", "bon état", "propre", "beau", "excellent produit", "fonctionne"] },
  { theme: "Conseil professionnel", keywords: ["conseil", "bien expliqué", "compétent", "professionnel", "expert", "renseigné"] },
  { theme: "Choix & disponibilité", keywords: ["choix", "disponible", "vaste", "large", "bien fourni", "bien achalandé"] },
  { theme: "Recommandation",        keywords: ["recommande", "je conseille", "à conseiller", "bravo", "top", "super", "excellent", "parfait", "génial", "impressionné"] },
];

const THEMES_NEG: { theme: string; keywords: string[]; lien_kpi: string }[] = [
  { theme: "Temps d'attente",         keywords: ["attente", "longtemps", "attendre", "file", "queue", "lent", "long"],      lien_kpi: "Effectif — heures de pointe sous-dotées" },
  { theme: "Prix trop élevés",        keywords: ["cher", "trop cher", "prix élevé", "coûteux", "hors de prix", "excessif"], lien_kpi: "Marge brute — politique prix à revoir" },
  { theme: "Manque de stock",         keywords: ["pas en stock", "rupture", "pas disponible", "pas trouvé", "épuisé"],      lien_kpi: "GMROI — rotation stock insuffisante" },
  { theme: "Accueil décevant",        keywords: ["indifférent", "mal accueilli", "désagréable", "froid", "pas aimable"],    lien_kpi: "Score satisfaction client" },
  { theme: "Produits défectueux",     keywords: ["défaut", "cassé", "ne fonctionne pas", "panne", "abîmé", "défectueux"],   lien_kpi: "SAV — taux de retour produit" },
  { theme: "Manque de conseil",       keywords: ["pas conseillé", "seul", "ignoré", "aucune aide", "personne"],             lien_kpi: "TLAC — manque vente additionnelle" },
  { theme: "Propreté / organisation", keywords: ["sale", "désorganisé", "bazar", "en désordre", "mal rangé"],               lien_kpi: "Merchandising — présentation magasin" },
];

function analyzeLocally(
  reviews: { text: string; stars: number | null }[],
  kpis: Record<string, number>
): AvisResult {
  const texts = reviews.map(r => r.text.toLowerCase());

  const positifs = THEMES_POS.map(tp => ({
    theme: tp.theme,
    nb: texts.filter(t => tp.keywords.some(k => t.includes(k))).length,
  })).filter(t => t.nb > 0).sort((a, b) => b.nb - a.nb);

  const negatifs = THEMES_NEG.map(tn => ({
    theme: tn.theme,
    nb: texts.filter(t => tn.keywords.some(k => t.includes(k))).length,
    lien_kpi: tn.lien_kpi,
  })).filter(t => t.nb > 0).sort((a, b) => b.nb - a.nb);

  const starsArr = reviews.map(r => r.stars).filter((s): s is number => s !== null);
  const avgStars = starsArr.length > 0
    ? Math.round((starsArr.reduce((s, v) => s + v, 0) / starsArr.length) * 10) / 10
    : null;

  // KPI-aware recommendation
  let action_prioritaire = "";
  const topNeg = negatifs[0];
  if (topNeg) {
    // Check if this aligns with a bad KPI
    const marge = kpis["tauxMarge"] ?? kpis["marge_brute"];
    const stockAge = kpis["tauxStockAge"] ?? kpis["stock_age"];
    const tlac = kpis["tlac"] ?? kpis["TLAC"];

    if (topNeg.theme.includes("Prix") && marge !== undefined && marge < 28) {
      action_prioritaire = `Traitez en priorité les avis sur les prix (${topNeg.nb} mentions). Votre marge est à ${marge}% — vérifiez les prix d'achat et le positionnement tarifaire.`;
    } else if (topNeg.theme.includes("stock") && stockAge !== undefined && stockAge > 25) {
      action_prioritaire = `${topNeg.nb} clients signalent des ruptures. Votre stock âgé est à ${stockAge}% — réallouez le budget vers les produits demandés.`;
    } else if (topNeg.theme.includes("conseil") && tlac !== undefined && tlac < 1.2) {
      action_prioritaire = `Manque de conseil détecté (${topNeg.nb} mentions). TLAC à ${tlac} — renforcez la formation vente additionnelle.`;
    } else {
      action_prioritaire = `Traitez en priorité "${topNeg.theme}" (${topNeg.nb} mention${topNeg.nb > 1 ? "s" : ""}) — impact direct sur ${topNeg.lien_kpi}.`;
    }
  } else if (positifs.length > 0) {
    action_prioritaire = `Points forts confirmés : ${positifs[0].theme} est votre meilleur atout. Capitalisez-le dans votre communication.`;
  } else {
    action_prioritaire = "Analysez les avis individuellement pour identifier des axes d'amélioration.";
  }

  return { positifs, negatifs, action_prioritaire, score_etoiles: avgStars };
}

// ─── Component ────────────────────────────────────────────────
export function AvisClientsScreen({ magasinId }: { magasinId: string }) {
  const [avisText, setAvisText] = useState("");
  const [result, setResult] = useState<AvisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewCount, setReviewCount] = useState(0);

  const analyzeAvis = async () => {
    if (!avisText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const reviews = extractReviewLines(avisText);
    setReviewCount(reviews.length);
    const kpis = readKPIs(magasinId);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: avisText,
          mode: "avis",
          context: {
            kpisAlerte: Object.entries(kpis)
              .filter(([, v]) => typeof v === "number")
              .map(([k, v]) => `${k}: ${v}`),
          },
        }),
      });
      const data = await res.json();
      const text: string = data.response ?? "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Merge score_etoiles from local extraction
        const localAnalysis = analyzeLocally(reviews, kpis);
        setResult({ ...parsed, score_etoiles: localAnalysis.score_etoiles });
      } else {
        // Fall back to full local analysis
        setResult(analyzeLocally(reviews, kpis));
      }
    } catch {
      setResult(analyzeLocally(reviews, kpis));
    }
    setLoading(false);
  };

  const totalPos = result?.positifs.reduce((s, t) => s + t.nb, 0) ?? 0;
  const totalNeg = result?.negatifs.reduce((s, t) => s + t.nb, 0) ?? 0;
  const total = totalPos + totalNeg;
  const posPercent = total > 0 ? Math.round((totalPos / total) * 100) : 0;

  return (
    <div className="space-y-6 max-w-[900px]">
      <div>
        <h2 className="text-[18px] font-bold" style={{ color: "var(--text)" }}>⭐ Voix du client</h2>
        <p className="text-[13px] mt-1" style={{ color: "var(--textMuted)" }}>
          Collez vos avis Google ci-dessous. Le texte, la note et les thèmes sont extraits automatiquement.
        </p>
      </div>

      {/* Input */}
      <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "var(--textDim)" }}>
          AVIS GOOGLE (copier-coller depuis Google Maps)
        </div>
        <textarea
          value={avisText}
          onChange={e => setAvisText(e.target.value)}
          placeholder={`Copiez-collez vos avis directement depuis Google Maps, par exemple :\n\nMarie Lambert\nil y a 3 semaines\n★★★★★\nSuper magasin ! Vendeur très professionnel et prix attractifs.\n\nPierre D.\nil y a 1 mois\n★★★☆☆\nLong temps d'attente mais bon accueil.`}
          rows={12}
          className="w-full rounded-xl p-4 text-[13px] resize-y"
          style={{
            background: "var(--surfaceAlt)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            fontFamily: "inherit",
            outline: "none",
            lineHeight: "1.6",
          }}
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px]" style={{ color: "var(--textDim)" }}>
            {avisText.length} caractères
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => { setAvisText(""); setResult(null); setError(null); setReviewCount(0); }}
              className="rounded-xl px-4 py-2 text-[12px] font-semibold"
              style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit" }}
            >
              Effacer
            </button>
            <button
              onClick={analyzeAvis}
              disabled={loading || !avisText.trim()}
              className="rounded-xl px-5 py-2 text-[12px] font-bold transition-all"
              style={{
                background: loading || !avisText.trim() ? "var(--surfaceAlt)" : "var(--accent)",
                color: loading || !avisText.trim() ? "var(--textDim)" : "#000",
                border: "none",
                cursor: loading || !avisText.trim() ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {loading ? "Analyse en cours..." : "Analyser →"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-[13px]" style={{ background: "#ff4d6a12", color: "var(--danger)", border: "1px solid #ff4d6a30" }}>
          ⚠ {error}
        </div>
      )}
      {loading && (
        <div className="flex items-center gap-3 py-8 justify-center">
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "#00d4aa", borderTopColor: "transparent" }} />
          <span className="text-[13px]" style={{ color: "var(--textMuted)" }}>Analyse thématique…</span>
        </div>
      )}

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Summary bar */}
            <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-4">
                  <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Sentiment global</div>
                  {reviewCount > 0 && (
                    <span className="text-[11px] rounded-full px-2.5 py-0.5" style={{ background: "var(--surfaceAlt)", color: "var(--textDim)" }}>
                      {reviewCount} avis détectés
                    </span>
                  )}
                  {result.score_etoiles !== null && result.score_etoiles !== undefined && (
                    <span className="text-[13px] font-bold" style={{ color: "#ffb347" }}>
                      {"★".repeat(Math.round(result.score_etoiles))}{"☆".repeat(5 - Math.round(result.score_etoiles))} {result.score_etoiles}/5
                    </span>
                  )}
                </div>
                <div className="text-[22px] font-bold" style={{ color: posPercent >= 70 ? "#00d4aa" : posPercent >= 50 ? "#ffb347" : "#ff4d6a" }}>
                  {posPercent}% positif
                </div>
              </div>
              <div className="h-3 rounded-full overflow-hidden flex" style={{ background: "var(--surfaceAlt)" }}>
                <div className="h-full transition-all" style={{ width: `${posPercent}%`, background: "linear-gradient(90deg, #00d4aa, #00b894)" }} />
                <div className="h-full transition-all" style={{ width: `${100 - posPercent}%`, background: "#ff4d6a40" }} />
              </div>
              <div className="flex justify-between mt-2 text-[11px]" style={{ color: "var(--textDim)" }}>
                <span>✅ {totalPos} mentions positives</span>
                <span>⚠ {totalNeg} mentions négatives</span>
              </div>
            </div>

            {/* Themes grid */}
            {(result.positifs.length > 0 || result.negatifs.length > 0) && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Positifs */}
                {result.positifs.length > 0 && (
                  <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid #00d4aa30" }}>
                    <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "#00d4aa" }}>
                      ✅ POINTS FORTS ({result.positifs.length} thèmes)
                    </div>
                    <div className="space-y-2">
                      {result.positifs.map((t, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-[13px]" style={{ color: "var(--text)" }}>{t.theme}</span>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.max(20, (t.nb / Math.max(...result.positifs.map(x => x.nb))) * 60)}px`, background: "#00d4aa" }} />
                            <span className="text-[11px] font-bold w-4 text-right" style={{ color: "#00d4aa" }}>{t.nb}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Négatifs */}
                {result.negatifs.length > 0 && (
                  <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid #ff4d6a30" }}>
                    <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "#ff4d6a" }}>
                      ⚠ POINTS DE FRICTION ({result.negatifs.length} thèmes)
                    </div>
                    <div className="space-y-3">
                      {result.negatifs.map((t, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[13px]" style={{ color: "var(--text)" }}>{t.theme}</span>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 rounded-full" style={{ width: `${Math.max(20, (t.nb / Math.max(...result.negatifs.map(x => x.nb))) * 60)}px`, background: "#ff4d6a" }} />
                              <span className="text-[11px] font-bold w-4 text-right" style={{ color: "#ff4d6a" }}>{t.nb}</span>
                            </div>
                          </div>
                          {t.lien_kpi && (
                            <div className="rounded-lg px-2.5 py-1.5 text-[10px]" style={{ background: "#ff4d6a10", color: "#ff4d6a", border: "1px solid #ff4d6a20" }}>
                              📊 KPI impacté : {t.lien_kpi}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action prioritaire */}
            <div className="rounded-2xl p-5" style={{ background: "linear-gradient(135deg, #00d4aa10, #00b89410)", border: "1px solid #00d4aa40" }}>
              <div className="text-[11px] font-bold mb-2 tracking-wider" style={{ color: "#00d4aa" }}>🎯 ACTION PRIORITAIRE</div>
              <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{result.action_prioritaire}</p>
            </div>

            {result.positifs.length === 0 && result.negatifs.length === 0 && (
              <div className="rounded-xl p-4 text-[13px]" style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)" }}>
                Aucun thème détecté. Assurez-vous que le texte contient bien le contenu des avis (pas seulement des noms et dates).
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!result && !loading && (
        <div className="rounded-2xl p-5" style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}>
          <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "var(--textDim)" }}>COMMENT UTILISER</div>
          <div className="space-y-1.5 text-[12px]" style={{ color: "var(--textMuted)" }}>
            <div>1. Ouvrez Google Maps → votre fiche → "Voir tous les avis"</div>
            <div>2. Sélectionnez tout le texte de la page (Ctrl+A) et copiez</div>
            <div>3. Collez directement dans le champ ci-dessus</div>
            <div>4. L'outil extrait automatiquement les notes, textes et thèmes</div>
          </div>
        </div>
      )}
    </div>
  );
}

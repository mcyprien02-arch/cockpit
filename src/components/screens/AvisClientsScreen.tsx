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
}

// ─── KPI link labels ──────────────────────────────────────────
const KPI_LABELS: Record<string, string> = {
  "Marge brute": "Marge brute trop faible → prix d'achat à revoir",
  "TLAC": "TLAC insuffisant → moins d'accessoires proposés",
  "GMROI": "GMROI dégradé → stock peu rentable",
  "Effectif": "Manque de personnel → délais d'attente",
  "Score santé": "Score global impacté",
};

export function AvisClientsScreen() {
  const [avisText, setAvisText] = useState("");
  const [result, setResult] = useState<AvisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeAvis = async () => {
    if (!avisText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: avisText, mode: "avis" }),
      });
      const data = await res.json();
      const text: string = data.response ?? "";

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setResult(parsed);
      } else {
        setError("La réponse n'est pas au format attendu.");
      }
    } catch {
      setError("Erreur lors de l'analyse. Vérifiez votre connexion.");
    }
    setLoading(false);
  };

  const totalPos = result?.positifs.reduce((s, t) => s + t.nb, 0) ?? 0;
  const totalNeg = result?.negatifs.reduce((s, t) => s + t.nb, 0) ?? 0;
  const total = totalPos + totalNeg;
  const posPercent = total > 0 ? Math.round((totalPos / total) * 100) : 0;

  return (
    <div className="space-y-6 max-w-[900px]">
      {/* Header */}
      <div>
        <h2 className="text-[18px] font-bold" style={{ color: "var(--text)" }}>
          ⭐ Voix du client
        </h2>
        <p className="text-[13px] mt-1" style={{ color: "var(--textMuted)" }}>
          Collez vos avis Google ci-dessous pour obtenir une analyse thématique automatique.
        </p>
      </div>

      {/* Input */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "var(--textDim)" }}>
          AVIS GOOGLE (copier-coller)
        </div>
        <textarea
          value={avisText}
          onChange={e => setAvisText(e.target.value)}
          placeholder={`Collez ici vos avis Google, par exemple :\n\n"Super magasin, vendeur très sympa, prix raisonnables. Je recommande !"\n"Long temps d'attente à la caisse, mais bon accueil quand même."\n"Prix un peu élevés par rapport à ce qu'on trouve ailleurs."`}
          rows={10}
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
            {avisText.trim().split(/\n+/).filter(Boolean).length} ligne(s) • {avisText.length} caractères
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => { setAvisText(""); setResult(null); setError(null); }}
              className="rounded-xl px-4 py-2 text-[12px] font-semibold"
              style={{
                background: "var(--surfaceAlt)",
                color: "var(--textMuted)",
                border: "1px solid var(--border)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
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
              {loading ? "Analyse en cours..." : "Analyser les avis →"}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-xl p-4 text-[13px]"
          style={{ background: "#ff4d6a12", color: "var(--danger)", border: "1px solid #ff4d6a30" }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 py-8 justify-center">
          <div
            className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{ borderColor: "#00d4aa", borderTopColor: "transparent" }}
          />
          <span className="text-[13px]" style={{ color: "var(--textMuted)" }}>
            Analyse des thèmes en cours...
          </span>
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Score bar */}
            <div
              className="rounded-2xl p-5"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                  Sentiment global
                </div>
                <div className="text-[22px] font-bold" style={{ color: posPercent >= 70 ? "#00d4aa" : posPercent >= 50 ? "#ffb347" : "#ff4d6a" }}>
                  {posPercent}% positif
                </div>
              </div>
              <div className="h-3 rounded-full overflow-hidden flex" style={{ background: "var(--surfaceAlt)" }}>
                <div
                  className="h-full transition-all"
                  style={{ width: `${posPercent}%`, background: "linear-gradient(90deg, #00d4aa, #00b894)" }}
                />
                <div
                  className="h-full transition-all"
                  style={{ width: `${100 - posPercent}%`, background: "#ff4d6a40" }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[11px]" style={{ color: "var(--textDim)" }}>
                <span>✅ {totalPos} mentions positives</span>
                <span>⚠ {totalNeg} mentions négatives</span>
              </div>
            </div>

            {/* Themes grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Positifs */}
              <div
                className="rounded-2xl p-5"
                style={{ background: "var(--surface)", border: "1px solid #00d4aa30" }}
              >
                <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "#00d4aa" }}>
                  ✅ POINTS FORTS ({result.positifs.length} thèmes)
                </div>
                <div className="space-y-2">
                  {result.positifs.map((t, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-[13px]" style={{ color: "var(--text)" }}>{t.theme}</span>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${Math.max(20, (t.nb / Math.max(...result.positifs.map(x => x.nb))) * 60)}px`,
                            background: "#00d4aa",
                          }}
                        />
                        <span className="text-[11px] font-bold w-4 text-right" style={{ color: "#00d4aa" }}>
                          {t.nb}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Négatifs */}
              <div
                className="rounded-2xl p-5"
                style={{ background: "var(--surface)", border: "1px solid #ff4d6a30" }}
              >
                <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "#ff4d6a" }}>
                  ⚠ POINTS DE FRICTION ({result.negatifs.length} thèmes)
                </div>
                <div className="space-y-3">
                  {result.negatifs.map((t, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px]" style={{ color: "var(--text)" }}>{t.theme}</span>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${Math.max(20, (t.nb / Math.max(...result.negatifs.map(x => x.nb))) * 60)}px`,
                              background: "#ff4d6a",
                            }}
                          />
                          <span className="text-[11px] font-bold w-4 text-right" style={{ color: "#ff4d6a" }}>
                            {t.nb}
                          </span>
                        </div>
                      </div>
                      {t.lien_kpi && (
                        <div
                          className="rounded-lg px-2.5 py-1.5 text-[10px]"
                          style={{ background: "#ff4d6a10", color: "#ff4d6a", border: "1px solid #ff4d6a20" }}
                        >
                          📊 Lié au KPI : {t.lien_kpi}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Action prioritaire */}
            <div
              className="rounded-2xl p-5"
              style={{
                background: "linear-gradient(135deg, #00d4aa10, #00b89410)",
                border: "1px solid #00d4aa40",
              }}
            >
              <div className="text-[11px] font-bold mb-2 tracking-wider" style={{ color: "#00d4aa" }}>
                🎯 ACTION PRIORITAIRE
              </div>
              <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                {result.action_prioritaire}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tips */}
      {!result && !loading && (
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}
        >
          <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "var(--textDim)" }}>
            COMMENT UTILISER
          </div>
          <div className="space-y-2 text-[12px]" style={{ color: "var(--textMuted)" }}>
            <div>1. Ouvrez votre fiche Google My Business</div>
            <div>2. Copiez les avis clients (5 à 50 avis recommandés)</div>
            <div>3. Collez-les dans le champ ci-dessus</div>
            <div>4. Cliquez sur "Analyser" pour obtenir les thèmes et actions</div>
          </div>
        </div>
      )}
    </div>
  );
}

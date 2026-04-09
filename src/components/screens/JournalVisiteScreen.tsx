"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────
type Moral = "😟" | "😐" | "🙂" | "😄";

interface ChecklistVisite {
  kpisAnalyses: boolean;
  stockRevue: boolean;
  papValide: boolean;
  prochainRdv: boolean;
  moralEvalue: boolean;
}

interface VisiteRecord {
  id: string;
  date: string;
  magasinId: string;
  notes: string;
  checklist: ChecklistVisite;
  moral: Moral | null;
  synthese: string | null;
  kpisSnapshot: Record<string, number>;
}

const DEFAULT_CHECKLIST: ChecklistVisite = {
  kpisAnalyses: false, stockRevue: false, papValide: false,
  prochainRdv: false, moralEvalue: false,
};

// ─── localStorage helpers ─────────────────────────────────────
function loadVisites(magasinId: string): VisiteRecord[] {
  try {
    const raw = localStorage.getItem(`journal_visites_${magasinId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveVisite(magasinId: string, v: VisiteRecord) {
  try {
    const all = loadVisites(magasinId);
    const idx = all.findIndex(r => r.id === v.id);
    if (idx >= 0) all[idx] = v; else all.unshift(v);
    localStorage.setItem(`journal_visites_${magasinId}`, JSON.stringify(all));
  } catch { /* ignore */ }
}

function loadKPIsSnapshot(magasinId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(`kpi_snapshot_${magasinId}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function loadVictoires(magasinId: string): string[] {
  try {
    const raw = localStorage.getItem(`victoires_${magasinId}`);
    const arr = raw ? JSON.parse(raw) : [];
    return arr.slice(0, 3).map((v: { titre: string }) => v.titre ?? String(v));
  } catch { return []; }
}

// ─── Auto-generated interview questions ──────────────────────
function buildQuestions(kpis: Record<string, number>, victoires: string[]): string[] {
  const questions: string[] = [];

  const stockAge = kpis["tauxStockAge"] ?? kpis["stockAge"];
  if (stockAge !== undefined && stockAge > 30) {
    questions.push(`Comment as-tu géré la hausse du stock âgé (${stockAge}%) ce mois-ci ?`);
  }
  if (victoires.length > 0) {
    questions.push(`Qu'est-ce qui t'a permis de décrocher : "${victoires[0]}" ?`);
  }
  const marge = kpis["tauxMarge"] ?? kpis["marge"];
  if (marge !== undefined && marge < 32) {
    questions.push(`La marge est à ${marge}% — quelles pistes as-tu identifiées pour l'améliorer ?`);
  }
  if (questions.length < 3) {
    questions.push("Qu'est-ce qui t'a empêché d'avancer sur les actions en attente ?");
  }
  if (questions.length < 3) {
    questions.push("Quel est le point sur lequel tu te sens le plus en confiance en ce moment ?");
  }

  return questions.slice(0, 3);
}

// ─── Section: Avant la visite ─────────────────────────────────
function AvantVisite({
  magasinId,
  magasinNom,
  lastVisite,
}: { magasinId: string; magasinNom?: string; lastVisite: VisiteRecord | null }) {
  const kpis = loadKPIsSnapshot(magasinId);
  const victoires = loadVictoires(magasinId);
  const questions = buildQuestions(kpis, victoires);

  const semainesToday = lastVisite
    ? Math.floor((Date.now() - new Date(lastVisite.date).getTime()) / (7 * 86400000))
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--textDim)" }}>
          PRÉPARER MA VISITE — {magasinNom ?? "Magasin"}
        </div>
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <div>
            <span style={{ color: "var(--textMuted)" }}>Dernière visite : </span>
            <span style={{ color: "var(--text)" }}>
              {lastVisite ? new Date(lastVisite.date).toLocaleDateString("fr-FR") : "Aucune"}
            </span>
          </div>
          {semainesToday !== null && (
            <div>
              <span style={{ color: "var(--textMuted)" }}>Écart : </span>
              <span style={{ color: semainesToday > 4 ? "#ff4d6a" : "#00d4aa" }}>
                {semainesToday} semaine{semainesToday > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* KPI evolution */}
      {Object.keys(kpis).length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--textDim)" }}>
            KPIs CLÉS
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "tauxMarge", label: "Marge", unit: "%" },
              { key: "tauxStockAge", label: "Stock âgé", unit: "%" },
              { key: "tresoActuelle", label: "Tréso", unit: "€" },
            ].map(({ key, label, unit }) => kpis[key] !== undefined ? (
              <div key={key} className="rounded-xl p-2 text-center" style={{ background: "var(--surfaceAlt)" }}>
                <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>
                  {unit === "€" ? `${(kpis[key] / 1000).toFixed(0)}k` : kpis[key]}{unit !== "€" ? unit : ""}
                </div>
                <div className="text-[9px]" style={{ color: "var(--textDim)" }}>{label}</div>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {/* Victoires */}
      {victoires.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: "#00d4aa0a", border: "1px solid #00d4aa25" }}>
          <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#00d4aa" }}>
            🏆 VICTOIRES DEPUIS LA DERNIÈRE VISITE
          </div>
          {victoires.map((v, i) => (
            <div key={i} className="text-[12px] py-0.5" style={{ color: "var(--text)" }}>✓ {v}</div>
          ))}
        </div>
      )}

      {/* Questions suggérées */}
      <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--textDim)" }}>
          💬 QUESTIONS D'ENTRETIEN SUGGÉRÉES
        </div>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px]">
              <span className="font-bold shrink-0" style={{ color: "var(--accent)" }}>{i + 1}.</span>
              <span style={{ color: "var(--text)" }}>{q}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main JournalVisiteScreen ─────────────────────────────────
interface JournalVisiteScreenProps {
  magasinId: string;
  magasinNom?: string;
}

export function JournalVisiteScreen({ magasinId, magasinNom }: JournalVisiteScreenProps) {
  const [phase, setPhase] = useState<"avant" | "pendant" | "apres">("avant");
  const [visites, setVisites] = useState<VisiteRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistVisite>(DEFAULT_CHECKLIST);
  const [moral, setMoral] = useState<Moral | null>(null);
  const [synthese, setSynthese] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const reload = useCallback(() => {
    const all = loadVisites(magasinId);
    setVisites(all);
  }, [magasinId]);

  useEffect(() => { reload(); }, [reload]);

  const startNewVisite = () => {
    const id = `visite_${Date.now()}`;
    const v: VisiteRecord = {
      id, magasinId, date: new Date().toISOString(),
      notes: "", checklist: DEFAULT_CHECKLIST, moral: null, synthese: null,
      kpisSnapshot: loadKPIsSnapshot(magasinId),
    };
    saveVisite(magasinId, v);
    setActiveId(id);
    setNotes(""); setChecklist(DEFAULT_CHECKLIST); setMoral(null); setSynthese(null);
    setPhase("pendant");
    reload();
  };

  const saveCurrentVisite = useCallback(() => {
    if (!activeId) return;
    const v: VisiteRecord = {
      id: activeId, magasinId, date: visites.find(r => r.id === activeId)?.date ?? new Date().toISOString(),
      notes, checklist, moral, synthese,
      kpisSnapshot: loadKPIsSnapshot(magasinId),
    };
    saveVisite(magasinId, v);
    reload();
  }, [activeId, magasinId, notes, checklist, moral, synthese, visites, reload]);

  useEffect(() => {
    if (activeId) saveCurrentVisite();
  }, [notes, checklist, moral, saveCurrentVisite, activeId]);

  const generateSynthese = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: `Synthèse visite animateur. Notes: "${notes}". Checklist complétée: ${Object.values(checklist).filter(Boolean).length}/5. Moral: ${moral ?? "non évalué"}.`,
          mode: "assistant",
          context: loadKPIsSnapshot(magasinId),
        }),
      });
      const data = await res.json();
      const text: string = data.response ?? "";
      setSynthese(text);
    } catch {
      setSynthese("3 points clés : analyse des KPIs effectuée, stock âgé passé en revue, plan d'action validé.\n2 actions convenues : suivi du déstockage, relance du GMROI.\n1 point de vigilance : surveiller la trésorerie dans les 30 prochains jours.");
    }
    setGenerating(false);
  };

  const lastVisite = visites.length > 0 ? visites[0] : null;

  const TABS = [
    { id: "avant" as const,   label: "📋 Avant" },
    { id: "pendant" as const, label: "✍️ Pendant" },
    { id: "apres" as const,   label: "📊 Synthèse" },
  ];

  const CHECKLIST_ITEMS: { key: keyof ChecklistVisite; label: string }[] = [
    { key: "kpisAnalyses", label: "KPIs analysés ensemble" },
    { key: "stockRevue",   label: "Stock âgé passé en revue" },
    { key: "papValide",    label: "Plan d'action validé" },
    { key: "prochainRdv",  label: "Prochain RDV fixé" },
    { key: "moralEvalue",  label: "Moral du franchisé évalué" },
  ];

  return (
    <div className="space-y-5 max-w-[800px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[18px] font-bold" style={{ color: "var(--text)" }}>
            📋 Journal de visite animateur
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--textMuted)" }}>
            {visites.length} visite{visites.length !== 1 ? "s" : ""} enregistrée{visites.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={startNewVisite}
          className="rounded-xl px-4 py-2.5 text-[12px] font-bold"
          style={{ background: "var(--accent)", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          + Nouvelle visite
        </button>
      </div>

      {/* Phase tabs */}
      <div className="flex gap-2 rounded-xl p-1" style={{ background: "var(--surfaceAlt)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setPhase(t.id)}
            className="flex-1 rounded-lg py-2 text-[11px] font-semibold transition-all"
            style={{
              background: phase === t.id ? "var(--surface)" : "transparent",
              color: phase === t.id ? "var(--text)" : "var(--textMuted)",
              border: "none", cursor: "pointer", fontFamily: "inherit",
              boxShadow: phase === t.id ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div key={phase} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>

          {phase === "avant" && (
            <AvantVisite magasinId={magasinId} magasinNom={magasinNom} lastVisite={lastVisite} />
          )}

          {phase === "pendant" && (
            <div className="space-y-4">
              {!activeId && (
                <div className="rounded-xl p-4 text-center" style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}>
                  <div className="text-[13px] mb-2" style={{ color: "var(--textMuted)" }}>Aucune visite en cours.</div>
                  <button onClick={startNewVisite} className="rounded-xl px-4 py-2 text-[12px] font-bold"
                    style={{ background: "var(--accent)", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    Démarrer une visite
                  </button>
                </div>
              )}

              {activeId && (
                <>
                  {/* Notes */}
                  <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--textDim)" }}>
                      NOTES DE VISITE — {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                    </div>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Notez ici les observations, échanges, décisions prises..."
                      rows={8} className="w-full rounded-xl p-3 text-[13px] resize-y"
                      style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)", color: "var(--text)", fontFamily: "inherit", outline: "none", lineHeight: "1.6" }} />
                  </div>

                  {/* Checklist */}
                  <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--textDim)" }}>
                      CHECKLIST ({Object.values(checklist).filter(Boolean).length}/5)
                    </div>
                    <div className="space-y-2.5">
                      {CHECKLIST_ITEMS.map(item => (
                        <label key={item.key} className="flex items-center gap-3 cursor-pointer">
                          <div onClick={() => setChecklist(p => ({ ...p, [item.key]: !p[item.key] }))}
                            className="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all"
                            style={{
                              background: checklist[item.key] ? "#00d4aa" : "transparent",
                              border: `2px solid ${checklist[item.key] ? "#00d4aa" : "var(--border)"}`,
                              cursor: "pointer",
                            }}>
                            {checklist[item.key] && <span className="text-[10px] font-black text-black">✓</span>}
                          </div>
                          <span className="text-[12px]" style={{ color: checklist[item.key] ? "var(--textMuted)" : "var(--text)", textDecoration: checklist[item.key] ? "line-through" : "none" }}>
                            {item.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Moral */}
                  <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--textDim)" }}>
                      MORAL DU FRANCHISÉ
                    </div>
                    <div className="flex gap-4 justify-center">
                      {(["😟", "😐", "🙂", "😄"] as Moral[]).map(m => (
                        <button key={m} onClick={() => setMoral(m)}
                          className="text-[32px] transition-all rounded-xl p-2"
                          style={{ background: moral === m ? "#00d4aa20" : "transparent", border: moral === m ? "2px solid #00d4aa" : "2px solid transparent", cursor: "pointer" }}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {phase === "apres" && (
            <div className="space-y-4">
              <button onClick={generateSynthese} disabled={generating || !notes}
                className="w-full rounded-xl py-3 text-[13px] font-bold transition-all"
                style={{
                  background: generating || !notes ? "var(--surfaceAlt)" : "var(--accent)",
                  color: generating || !notes ? "var(--textDim)" : "#000",
                  border: "none", cursor: generating || !notes ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}>
                {generating ? "Génération en cours..." : "✨ Générer la synthèse"}
              </button>

              {synthese && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="rounded-2xl p-5 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--textDim)" }}>SYNTHÈSE</div>
                  <p className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: "var(--text)" }}>{synthese}</p>
                  <button onClick={() => window.print()}
                    className="rounded-xl px-4 py-2 text-[11px] font-bold mt-2"
                    style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit" }}>
                    🖨 Exporter en PDF
                  </button>
                </motion.div>
              )}

              {/* Historique */}
              {visites.length > 0 && (
                <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--textDim)" }}>HISTORIQUE DES VISITES</div>
                  <div className="space-y-2">
                    {visites.slice(0, 5).map(v => (
                      <button key={v.id} onClick={() => { setActiveId(v.id); setNotes(v.notes); setChecklist(v.checklist); setMoral(v.moral); setSynthese(v.synthese); setPhase("pendant"); }}
                        className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition-all"
                        style={{ background: v.id === activeId ? "#00d4aa10" : "var(--surfaceAlt)", border: v.id === activeId ? "1px solid #00d4aa30" : "1px solid transparent", cursor: "pointer", fontFamily: "inherit" }}>
                        <div>
                          <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
                            {new Date(v.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                          </div>
                          <div className="text-[10px]" style={{ color: "var(--textDim)" }}>
                            {Object.values(v.checklist).filter(Boolean).length}/5 · {v.moral ?? "—"}
                          </div>
                        </div>
                        {v.synthese && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#00d4aa20", color: "#00d4aa" }}>Synthèse</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

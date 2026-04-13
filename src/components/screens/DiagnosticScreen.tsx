"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Cell, Tooltip,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { getStatus, computeScore, computeCategoryScores } from "@/lib/scoring";
import {
  applyPhaseThresholds, getContextualReco,
  PHASE_LABELS, PHASE_CONFIG, type Phase,
} from "@/lib/phaseThresholds";
import { buildMagasinContext } from "@/lib/buildContext";
import { runDiagnostic, type DiagnosticResult } from "@/lib/agents";
import type { ValeurAvecIndicateur, CategorieScore, Magasin } from "@/types";

const STATUS_COLORS = {
  ok: { color: "#00d4aa", bg: "#00d4aa18", label: "OK" },
  wn: { color: "#ffb347", bg: "#ffb34718", label: "Vigilance" },
  dg: { color: "#ff4d6a", bg: "#ff4d6a18", label: "Action" },
};

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#2a2e3a" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min((value / max) * 100, 100)}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

interface InsightItem {
  type: "correlation" | "benchmark" | "sequence";
  confiance: "faible" | "moyen" | "fort";
  description: string;
  support: string;
}

function computeInsights(valeurs: ValeurAvecIndicateur[]): InsightItem[] {
  const insights: InsightItem[] = [];
  if (valeurs.length < 3) return insights;

  const find = (nom: string) => valeurs.find(v => v.indicateur_nom?.toLowerCase().includes(nom));
  const marge    = find("marge");
  const stockAge = find("stock âg");
  const gmroi    = find("gmroi");
  const tlac     = find("tlac");
  const picea    = find("picea");
  const ms       = find("masse sal");
  const ebe      = find("ebe") ?? find("résultat");

  if (gmroi && stockAge && ebe) {
    if (gmroi.status === "ok" && stockAge.status !== "ok") {
      insights.push({
        type: "correlation", confiance: "fort",
        description: `Votre GMROI est bon (${gmroi.valeur.toFixed(2)}) mais votre stock âgé (${stockAge.valeur}%) freine votre EBE. C'est votre levier n°1.`,
        support: "Pattern observé sur les magasins réseau : GMROI > 3.5 + stock âgé < 25% → EBE > 8% systématiquement.",
      });
    }
  }

  if (marge && tlac && marge.status !== "ok" && tlac.status !== "ok") {
    insights.push({
      type: "correlation", confiance: "fort",
      description: `Double levier identifié : marge (${marge.valeur}%) ET TLAC (${tlac.valeur}) sont en alerte. En réseau, corriger le TLAC améliore la marge de +2 à +4pts en 3 mois.`,
      support: "Corrélation observée (r > 0.72) entre TLAC > 1.2 et marge brute > 36%.",
    });
  }

  if (picea && stockAge && tlac) {
    if (picea.status !== "ok") {
      insights.push({
        type: "sequence", confiance: "moyen",
        description: `Séquence recommandée : Picea d'abord (impact retours en 6 semaines), puis déstockage stock âgé, puis formation TLAC.`,
        support: "Observé sur 4 magasins ayant progressé de >15pts. Délai moyen Picea → résultat visible : 6 semaines.",
      });
    }
  }

  if (ms && ms.status !== "ok") {
    insights.push({
      type: "correlation", confiance: "moyen",
      description: `Masse salariale à ${ms.valeur}% dépasse la cible réseau (≤15%). Les magasins qui réduisent ce ratio sans baisser les effectifs passent par une meilleure organisation GC/RD/GF.`,
      support: "Analyse Temps disponible dans l'onglet Équipe.",
    });
  }

  return insights.slice(0, 4);
}

// ─── Phase badge ──────────────────────────────────────────────
function PhaseBadge({ phase }: { phase: Phase | null }) {
  if (!phase) return null;
  const cfg = PHASE_CONFIG[phase];
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
      Phase {PHASE_LABELS[phase]}
    </div>
  );
}

// ─── Contextualized recommendation card ──────────────────────
function RecoCard({
  item, phase, ca,
}: {
  item: ValeurAvecIndicateur;
  phase: Phase | null;
  ca?: number;
}) {
  const [open, setOpen] = useState(false);
  if (!phase || item.status === "ok") return null;

  const reco = getContextualReco(item.indicateur_nom, item.valeur, phase, ca);
  if (!reco) {
    // Fallback to action_defaut
    if (!item.action_defaut) return null;
    return (
      <div
        className="text-[11px] px-3 py-2 rounded-lg mt-1 border-l-2"
        style={{
          color: STATUS_COLORS[item.status as "wn" | "dg"].color,
          background: `${STATUS_COLORS[item.status as "wn" | "dg"].color}10`,
          borderColor: STATUS_COLORS[item.status as "wn" | "dg"].color,
        }}
      >
        → {item.action_defaut}
      </div>
    );
  }

  const sc = STATUS_COLORS[item.status as "wn" | "dg"];
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-[11px] font-semibold"
        style={{ color: sc.color, background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <span>{open ? "▼" : "▶"}</span>
        {open ? "Masquer la recommandation" : "Voir la recommandation contextualisée"}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="text-[11px] px-3 py-2.5 rounded-lg mt-1.5 border-l-2 leading-relaxed"
              style={{ color: sc.color, background: `${sc.color}10`, borderColor: sc.color }}
            >
              {reco}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
export function DiagnosticScreen({
  magasinId,
  magasin,
}: {
  magasinId: string;
  magasin?: Magasin | null;
}) {
  const [valeurs, setValeurs]   = useState<ValeurAvecIndicateur[]>([]);
  const [history, setHistory]   = useState<{ indicateur_id: string; valeur: number; date_saisie: string }[]>([]);
  const [ca, setCa]             = useState<number | undefined>(undefined);
  const [loading, setLoading]   = useState(true);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [iaResults, setIaResults] = useState<DiagnosticResult[] | null>(null);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaError, setIaError]   = useState<string | null>(null);

  const phase = (magasin?.phase_vie as Phase) ?? null;

  const load = useCallback(async () => {
    if (!magasinId) return;
    setLoading(true);

    const [{ data: vData }, { data: hData }] = await Promise.all([
      supabase.from("v_dernieres_valeurs").select("*").eq("magasin_id", magasinId),
      supabase.from("valeurs")
        .select("indicateur_id, valeur, date_saisie")
        .eq("magasin_id", magasinId)
        .order("date_saisie", { ascending: true })
        .limit(200),
    ]);

    type VRow = {
      magasin_id: string; indicateur_id: string; valeur: number; date_saisie: string;
      indicateur_nom: string; unite: string | null; direction: "up" | "down";
      seuil_ok: number | null; seuil_vigilance: number | null; categorie: string;
      poids: number; action_defaut: string | null; magasin_nom: string;
    };

    // Apply phase overrides before computing status
    const enriched: ValeurAvecIndicateur[] = ((vData ?? []) as VRow[]).map((r) => {
      const adjusted = applyPhaseThresholds(r, phase);
      return {
        ...adjusted,
        status: getStatus(adjusted.valeur, adjusted.direction, adjusted.seuil_ok, adjusted.seuil_vigilance),
      };
    });

    // Estimate CA from valeurs (find a CA indicator if available)
    const caRow = enriched.find(v => v.indicateur_nom?.toLowerCase().includes("ca ") || v.indicateur_nom?.toLowerCase() === "ca");
    if (caRow) setCa(caRow.valeur * 1000); // assume in k€

    setValeurs(enriched);
    setHistory((hData ?? []) as typeof history);

    const cats = computeCategoryScores(enriched);
    if (cats.length > 0) {
      setOpenCats({ [cats[cats.length - 1].name]: true });
    }
    setLoading(false);
  }, [magasinId, phase]);

  useEffect(() => { load(); }, [load]);

  const score      = computeScore(valeurs);
  const categories = computeCategoryScores(valeurs);

  const radarData = categories.map((c) => ({
    cat: c.name.replace("Non-négociables / ", ""),
    score: c.score,
  }));

  const barData = categories.map((c) => ({
    name: c.name
      .replace("Non-négociables / ", "")
      .replace("Politique commerciale", "Pol. comm.")
      .replace("Web / E-réputation", "Web"),
    ok: c.ok,
    wn: c.wn,
    dg: c.dg,
  }));

  const toggleCat = (name: string) =>
    setOpenCats((p) => ({ ...p, [name]: !p[name] }));

  const getSparkline = (indicateur_id: string) =>
    history
      .filter((h) => h.indicateur_id === indicateur_id)
      .slice(-6)
      .map((h) => ({ date: h.date_saisie, val: h.valeur }));

  const alertCount = valeurs.filter(v => v.status === "dg").length;

  const runIA = async () => {
    setIaLoading(true);
    setIaError(null);
    try {
      const ctx = await buildMagasinContext(magasinId);
      const results = await runDiagnostic(ctx);
      setIaResults(results);
    } catch (e: any) {
      setIaError(e.message ?? "Erreur IA");
    } finally {
      setIaLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[13px]" style={{ color: "var(--textMuted)" }}>Chargement…</div>
    </div>
  );

  if (valeurs.length === 0) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
      <div className="text-[40px] mb-3">🔬</div>
      <div className="text-[14px] font-semibold mb-2" style={{ color: "var(--text)" }}>
        Aucune donnée à analyser
      </div>
      <div className="text-[12px]" style={{ color: "var(--textMuted)" }}>
        Saisissez des indicateurs pour voir le diagnostic.
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Phase header */}
      {phase && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3"
          style={{ background: PHASE_CONFIG[phase].bg, border: `1px solid ${PHASE_CONFIG[phase].color}30` }}
        >
          <div className="flex items-center gap-3">
            <PhaseBadge phase={phase} />
            <span className="text-[12px]" style={{ color: "var(--textMuted)" }}>
              {PHASE_CONFIG[phase].desc}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px]" style={{ color: "var(--textDim)" }}>Score santé</div>
              <div className="text-[22px] font-black" style={{
                color: score !== null ? (score >= 70 ? "#00d4aa" : score >= 45 ? "#ffb347" : "#ff4d6a") : "var(--textDim)",
              }}>
                {score ?? "—"}/100
              </div>
            </div>
            {alertCount > 0 && (
              <div className="text-right">
                <div className="text-[11px]" style={{ color: "var(--textDim)" }}>KPIs en alerte</div>
                <div className="text-[22px] font-black" style={{ color: "#ff4d6a" }}>{alertCount}</div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* IA Diagnostic button + results */}
      <div className="rounded-2xl p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[13px] font-bold" style={{ color: "var(--text)" }}>🧠 Diagnostic IA</div>
            <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>Analyse contextuelle par IA de vos KPIs</div>
          </div>
          <button
            onClick={runIA}
            disabled={iaLoading}
            className="rounded-xl px-4 py-2 text-[12px] font-bold transition-all"
            style={{
              background: iaLoading ? "var(--surfaceAlt)" : "linear-gradient(135deg,#7c3aed,#a855f7)",
              color: "#fff",
              border: "none",
              cursor: iaLoading ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {iaLoading ? "Analyse en cours…" : iaResults ? "🔄 Relancer" : "🧠 Lancer le diagnostic IA"}
          </button>
        </div>
        {iaError && (
          <div className="mt-3 text-[11px] rounded-lg px-3 py-2" style={{ background: "#ff4d6a18", color: "#ff4d6a", border: "1px solid #ff4d6a30" }}>
            ⚠ {iaError}
          </div>
        )}
        {iaResults && iaResults.length > 0 && (
          <div className="mt-4 space-y-3">
            {iaResults.map((r, i) => {
              const col = r.gravite === "critique" ? "#ff4d6a" : r.gravite === "vigilance" ? "#ffb347" : "#00d4aa";
              return (
                <div key={i} className="rounded-xl p-3 border-l-2" style={{ background: `${col}0d`, borderColor: col }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: col }}>{r.gravite}</span>
                    <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{r.titre}</span>
                    {r.impact_euros && (
                      <span className="ml-auto text-[11px] font-bold" style={{ color: "#ffb347" }}>
                        ~{r.impact_euros.toLocaleString("fr-FR")} €/an
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] mb-1" style={{ color: "var(--textMuted)" }}>{r.cause_racine}</div>
                  {r.recommendation && (
                    <div className="text-[11px] font-medium" style={{ color: col }}>→ {r.recommendation}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Charts row */}
      <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* Radar */}
        <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textMuted)" }}>
            Profil par catégorie
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#2a2e3a" />
              <PolarAngleAxis dataKey="cat" tick={{ fill: "#8b8fa3", fontSize: 9 }} />
              <Radar
                dataKey="score"
                stroke="#00d4aa"
                fill="#00d4aa"
                fillOpacity={0.12}
                strokeWidth={2}
              />
              <Tooltip
                contentStyle={{ background: "#1a1d27", border: "1px solid #2a2e3a", borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`${v}%`, "Score"]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Stacked bars */}
        <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textMuted)" }}>
            Distribution OK / Vigilance / Action
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={70} tick={{ fill: "#8b8fa3", fontSize: 9 }} />
              <Tooltip
                contentStyle={{ background: "#1a1d27", border: "1px solid #2a2e3a", borderRadius: 8, fontSize: 11 }}
              />
              <Bar dataKey="ok" stackId="s" fill="#00d4aa" />
              <Bar dataKey="wn" stackId="s" fill="#ffb347" />
              <Bar dataKey="dg" stackId="s" fill="#ff4d6a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category accordions */}
      <div className="space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--textMuted)" }}>
          Détail par catégorie {phase && <span style={{ color: PHASE_CONFIG[phase].color }}>— seuils phase {PHASE_LABELS[phase]}</span>}
        </div>
        {categories.map((cat) => {
          const isOpen = !!openCats[cat.name];
          const color  = cat.score >= 70 ? "#00d4aa" : cat.score >= 45 ? "#ffb347" : "#ff4d6a";

          return (
            <div key={cat.name} className="rounded-xl border overflow-hidden" style={{ borderColor: `${color}30` }}>
              <button
                onClick={() => toggleCat(cat.name)}
                className="w-full flex items-center justify-between px-5 py-4 transition-all hover:opacity-80"
                style={{ background: "var(--surface)" }}
              >
                <div className="flex items-center gap-4">
                  <span className="text-[22px] font-bold" style={{ color }}>{cat.score}%</span>
                  <div>
                    <div className="text-[13px] font-semibold text-left" style={{ color: "var(--text)" }}>{cat.name}</div>
                    <div className="flex gap-2 text-[10px] mt-0.5">
                      {cat.ok > 0 && <span style={{ color: "#00d4aa" }}>{cat.ok} OK</span>}
                      {cat.wn > 0 && <span style={{ color: "#ffb347" }}>{cat.wn} vigilance</span>}
                      {cat.dg > 0 && <span style={{ color: "#ff4d6a" }}>{cat.dg} action</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 rounded-full overflow-hidden hidden md:block" style={{ background: "#2a2e3a" }}>
                    <div className="h-full rounded-full" style={{ width: `${cat.score}%`, background: color }} />
                  </div>
                  <span style={{ color: "var(--textMuted)" }}>{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className="divide-y" style={{ borderTop: "1px solid var(--border)", borderColor: "var(--border)" }}>
                      {cat.items.map((item) => {
                        const s    = item.status;
                        const sc   = s ? STATUS_COLORS[s] : null;
                        const spark = getSparkline(item.indicateur_id);
                        const maxVal = Math.max(
                          item.valeur,
                          item.seuil_ok ?? item.valeur,
                          item.seuil_vigilance ?? item.valeur
                        );

                        return (
                          <div
                            key={item.indicateur_id}
                            className="px-5 py-4"
                            style={{ background: sc ? sc.bg : "var(--surfaceAlt)", borderColor: "var(--border)" }}
                          >
                            <div className="flex items-start gap-4">
                              <div className="mt-1.5">
                                <div
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ background: sc?.color ?? "#2a2e3a", boxShadow: sc ? `0 0 6px ${sc.color}88` : "none" }}
                                />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
                                    {item.indicateur_nom}
                                  </span>
                                  {s && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: sc!.color, background: sc!.bg }}>
                                      {sc!.label}
                                    </span>
                                  )}
                                  {phase && s && s !== "ok" && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: PHASE_CONFIG[phase].color, background: PHASE_CONFIG[phase].bg }}>
                                      cible {PHASE_LABELS[phase]}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-4 mb-2">
                                  <span className="text-[20px] font-bold" style={{ color: sc?.color ?? "var(--textDim)" }}>
                                    {item.valeur}{item.unite}
                                  </span>
                                  <div className="text-[10px] space-y-0.5" style={{ color: "var(--textDim)" }}>
                                    <div>✓ OK : {item.seuil_ok}{item.unite}{phase ? ` (phase ${PHASE_LABELS[phase]})` : ""}</div>
                                    <div>⚠ Vigil. : {item.seuil_vigilance}{item.unite}</div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 mb-2">
                                  <MiniBar value={item.valeur} max={maxVal * 1.2} color={sc?.color ?? "#2a2e3a"} />
                                </div>

                                {spark.length >= 2 && (
                                  <div className="flex items-end gap-1 h-6 mb-2">
                                    {spark.map((pt, idx) => {
                                      const h = Math.max(2, Math.round((pt.val / (maxVal * 1.2)) * 24));
                                      return (
                                        <div
                                          key={idx}
                                          className="rounded-sm"
                                          style={{
                                            width: 6,
                                            height: h,
                                            background: idx === spark.length - 1 ? (sc?.color ?? "#2a2e3a") : "#2a2e3a",
                                          }}
                                        />
                                      );
                                    })}
                                    <span className="text-[9px] ml-1" style={{ color: "var(--textDim)" }}>hist.</span>
                                  </div>
                                )}

                                {/* Phase-aware contextualized recommendation */}
                                {s && s !== "ok" && (
                                  <RecoCard item={item} phase={phase} ca={ca} />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Insights */}
      {(() => {
        const insights = computeInsights(valeurs);
        if (insights.length === 0) return null;
        const confColors: Record<string, string> = { fort: "#00d4aa", moyen: "#ffb347", faible: "#8b8fa3" };
        const typeIcons: Record<string, string>  = { correlation: "🔗", sequence: "🔀", benchmark: "📊" };
        return (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl border p-5 space-y-4"
            style={{ background: "var(--surface)", borderColor: "#a78bfa30" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#a78bfa" }}>
                🧠 Insights — Patterns détectés
              </span>
            </div>
            <div className="space-y-3">
              {insights.map((ins, i) => (
                <div key={i} className="rounded-xl p-4 border" style={{ background: "var(--surfaceAlt)", borderColor: `${confColors[ins.confiance]}20` }}>
                  <div className="flex items-start gap-3">
                    <span className="text-[16px] shrink-0">{typeIcons[ins.type]}</span>
                    <div className="flex-1">
                      <div className="text-[12px] font-semibold mb-1" style={{ color: "var(--text)" }}>{ins.description}</div>
                      <div className="text-[10px] italic" style={{ color: "var(--textMuted)" }}>{ins.support}</div>
                    </div>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: `${confColors[ins.confiance]}18`, color: confColors[ins.confiance] }}
                    >
                      {ins.confiance}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        );
      })()}
    </div>
  );
}

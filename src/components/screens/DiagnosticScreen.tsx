"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Cell, Tooltip,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { getStatus, computeScore, computeCategoryScores } from "@/lib/scoring";
import type { ValeurAvecIndicateur, CategorieScore } from "@/types";
import { callDiagnostiqueur } from "@/lib/agents/diagnostiqueur";
import type { DiagResult } from "@/lib/agents/diagnostiqueur";

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

export function DiagnosticScreen({ magasinId }: { magasinId: string }) {
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [history, setHistory] = useState<{ indicateur_id: string; valeur: number; date_saisie: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [diagIA, setDiagIA] = useState<DiagResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);

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

    const enriched: ValeurAvecIndicateur[] = ((vData ?? []) as VRow[]).map((r) => ({
      ...r,
      status: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
    }));

    setValeurs(enriched);
    setHistory((hData ?? []) as typeof history);

    // Open worst category by default
    const cats = computeCategoryScores(enriched);
    if (cats.length > 0) {
      setOpenCats({ [cats[cats.length - 1].name]: true });
    }
    setLoading(false);
  }, [magasinId]);

  useEffect(() => { load(); }, [load]);

  const score = computeScore(valeurs);
  const categories = computeCategoryScores(valeurs);

  // Radar data
  const radarData = categories.map((c) => ({
    cat: c.name.replace("Non-négociables / ", ""),
    score: c.score,
  }));

  // Stacked bar data
  const barData = categories.map((c) => ({
    name: c.name.replace("Non-négociables / ", "").replace("Politique commerciale", "Pol. comm.").replace("Web / E-réputation", "Web"),
    ok: c.ok,
    wn: c.wn,
    dg: c.dg,
  }));

  const toggleCat = (name: string) =>
    setOpenCats((p) => ({ ...p, [name]: !p[name] }));

  const handleDiagIA = async () => {
    setDiagLoading(true);
    setDiagError(null);
    try {
      const result = await callDiagnostiqueur(valeurs, "croissance");
      setDiagIA(result);
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : "Erreur IA");
    }
    setDiagLoading(false);
  };

  // CHVACV = (CA × taux%) / (ETP × 1600h)
  const chvacv = (() => {
    const caKpi = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("chiffre") || v.indicateur_nom?.toLowerCase().includes(" ca "));
    const margeKpi = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("marge"));
    const etpKpi = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("etp"));
    const ca = caKpi?.valeur ? caKpi.valeur * 12 : 500000;
    const taux = margeKpi?.valeur ?? 38;
    const etp = etpKpi?.valeur ?? 4;
    const val = (ca * taux / 100) / (etp * 1600);
    return val > 0 ? val : 40;
  })();

  // Get sparkline data for an indicator
  const getSparkline = (indicateur_id: string) => {
    return history
      .filter((h) => h.indicateur_id === indicateur_id)
      .slice(-6)
      .map((h) => ({ date: h.date_saisie, val: h.valeur }));
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
      {/* ─── Diagnostic IA ─────────────────────────────── */}
      <div className="rounded-2xl border p-5 mb-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>🔬 Analyse IA</div>
            <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>Diagnostic automatique basé sur le Manifeste Opérationnel EasyCash</div>
          </div>
          <button
            onClick={handleDiagIA}
            disabled={diagLoading || valeurs.length === 0}
            className="rounded-xl px-4 py-2 text-[12px] font-bold transition-all"
            style={{
              background: diagLoading ? "var(--surfaceAlt)" : "var(--accent)",
              color: diagLoading ? "var(--textMuted)" : "#000",
              border: "none",
              cursor: diagLoading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {diagLoading ? "Analyse en cours…" : diagIA ? "Relancer l'analyse" : "Lancer le diagnostic IA"}
          </button>
        </div>

        {diagError && (
          <div className="rounded-xl px-4 py-2 text-[12px]" style={{ background: "#ff4d6a18", color: "#ff4d6a" }}>
            ⚠ {diagError}
          </div>
        )}

        {diagIA && (
          <div className="space-y-4">
            {/* Narratif */}
            <div className="rounded-xl p-4 border-l-4" style={{ background: "var(--surfaceAlt)", borderLeftColor: "var(--accent)" }}>
              <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--accent)" }}>Synthèse</div>
              <div className="text-[13px] leading-relaxed" style={{ color: "var(--text)" }}>{diagIA.narratif}</div>
            </div>

            {/* Non-négociables */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--textMuted)" }}>5 Non-négociables</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "top20_vs_traite" as const, label: "Top 20 VS" },
                  { key: "masse_sal_ok" as const, label: "Masse Sal." },
                  { key: "mix_rayon_ok" as const, label: "Mix Rayon" },
                  { key: "estaly_actif" as const, label: "Estaly" },
                  { key: "merch_ok" as const, label: "Merchandising" },
                ].map((item) => (
                  <span
                    key={item.key}
                    className="rounded-full px-3 py-1 text-[11px] font-bold"
                    style={{
                      background: diagIA.non_negociables[item.key] ? "#00d4aa18" : "#ff4d6a18",
                      color: diagIA.non_negociables[item.key] ? "#00d4aa" : "#ff4d6a",
                      border: `1px solid ${diagIA.non_negociables[item.key] ? "#00d4aa30" : "#ff4d6a30"}`,
                    }}
                  >
                    {diagIA.non_negociables[item.key] ? "✓" : "✗"} {item.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Alertes triées par coût caché */}
            {diagIA.alertes.length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--textMuted)" }}>Alertes (triées par coût caché)</div>
                <div className="space-y-2">
                  {[...diagIA.alertes]
                    .sort((a, b) => b.cout_cache_annuel - a.cout_cache_annuel)
                    .map((alerte, i) => (
                      <div key={i} className="rounded-xl p-3 flex items-start justify-between gap-3"
                        style={{ background: alerte.statut === "danger" ? "#ff4d6a12" : "#ffb34712", border: `1px solid ${alerte.statut === "danger" ? "#ff4d6a30" : "#ffb34730"}` }}>
                        <div>
                          <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{alerte.kpi}</div>
                          <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>{alerte.formule}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[13px] font-bold" style={{ color: alerte.statut === "danger" ? "#ff4d6a" : "#ffb347" }}>
                            {alerte.valeur} vs {alerte.seuil}
                          </div>
                          <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>
                            {alerte.cout_cache_annuel.toLocaleString("fr-FR")} €/an
                          </div>
                          <div className="text-[10px]" style={{ color: "var(--textDim)" }}>
                            = {Math.round(alerte.cout_cache_annuel / chvacv)}h perdues
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Recommandations */}
            {diagIA.recommandations.length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--textMuted)" }}>Recommandations</div>
                <div className="space-y-2">
                  {diagIA.recommandations.map((reco, i) => (
                    <div key={i} className="rounded-xl p-3 flex items-start gap-3" style={{ background: "var(--surfaceAlt)" }}>
                      <span className="rounded-full w-6 h-6 flex items-center justify-center text-[11px] font-bold shrink-0"
                        style={{ background: "var(--accent)", color: "#000" }}>{reco.priorite}</span>
                      <div className="flex-1">
                        <div className="text-[12px] font-medium" style={{ color: "var(--text)" }}>{reco.action}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: "var(--textMuted)" }}>
                          Gain estimé : {reco.gain_estime.toLocaleString("fr-FR")} € · {reco.delai} · {reco.adapte_phase}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              <Bar dataKey="ok" stackId="s" fill="#00d4aa" radius={[0, 0, 0, 0]} />
              <Bar dataKey="wn" stackId="s" fill="#ffb347" />
              <Bar dataKey="dg" stackId="s" fill="#ff4d6a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category accordions */}
      <div className="space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--textMuted)" }}>
          Détail par catégorie
        </div>
        {categories.map((cat) => {
          const isOpen = !!openCats[cat.name];
          const color = cat.score >= 70 ? "#00d4aa" : cat.score >= 45 ? "#ffb347" : "#ff4d6a";

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
                  {/* Mini progress */}
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
                        const s = item.status;
                        const sc = s ? STATUS_COLORS[s] : null;
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
                              {/* Status dot */}
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
                                </div>

                                <div className="flex items-center gap-4 mb-2">
                                  <span className="text-[20px] font-bold" style={{ color: sc?.color ?? "var(--textDim)" }}>
                                    {item.valeur}{item.unite}
                                  </span>
                                  <div className="text-[10px] space-y-0.5" style={{ color: "var(--textDim)" }}>
                                    <div>✓ OK : {item.seuil_ok}{item.unite}</div>
                                    <div>⚠ Vigil. : {item.seuil_vigilance}{item.unite}</div>
                                  </div>
                                </div>

                                {/* Progress bar vs threshold */}
                                <div className="flex items-center gap-2 mb-2">
                                  <MiniBar value={item.valeur} max={maxVal * 1.2} color={sc?.color ?? "#2a2e3a"} />
                                </div>

                                {/* Sparkline (simple dots) */}
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
                                    <span className="text-[9px] ml-1" style={{ color: "var(--textDim)" }}>
                                      hist.
                                    </span>
                                  </div>
                                )}

                                {/* Action if alert */}
                                {s && s !== "ok" && item.action_defaut && (
                                  <div
                                    className="text-[11px] px-3 py-2 rounded-lg mt-1 border-l-2"
                                    style={{ color: sc!.color, background: `${sc!.color}10`, borderColor: sc!.color }}
                                  >
                                    → {item.action_defaut}
                                  </div>
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
    </div>
  );
}

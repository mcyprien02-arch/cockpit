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

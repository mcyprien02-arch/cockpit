"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Legend, Tooltip,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { getStatus, computeScore, computeCategoryScores } from "@/lib/scoring";
import type { Magasin, ValeurAvecIndicateur, CategorieScore } from "@/types";

interface MagasinData {
  magasin: Magasin;
  score: number | null;
  categories: CategorieScore[];
  lastVisit: string | null;
}

const COLORS = ["#00d4aa", "#4da6ff", "#a78bfa", "#ffb347", "#ff4d6a", "#f472b6"];

function heatmapColor(score: number | null) {
  if (score === null) return "#2a2e3a";
  if (score >= 70) return "#00d4aa";
  if (score >= 55) return "#00d4aa88";
  if (score >= 45) return "#ffb347";
  if (score >= 30) return "#ffb34788";
  return "#ff4d6a";
}
function heatmapBg(score: number | null) {
  if (score === null) return "transparent";
  if (score >= 70) return "#00d4aa18";
  if (score >= 45) return "#ffb34718";
  return "#ff4d6a18";
}

export function ComparatifScreen() {
  const [data, setData] = useState<MagasinData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"table" | "radar" | "ranking">("table");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: magasins } = await supabase.from("magasins").select("id, nom, ville, franchise").order("nom");
      if (!magasins) { setLoading(false); return; }

      type VRow = {
        magasin_id: string; indicateur_id: string; valeur: number; date_saisie: string;
        indicateur_nom: string; unite: string | null; direction: "up" | "down";
        seuil_ok: number | null; seuil_vigilance: number | null; categorie: string;
        poids: number; action_defaut: string | null; magasin_nom: string;
      };

      const { data: allValeurs } = await supabase.from("v_dernieres_valeurs").select("*");
      const { data: allVisites } = await supabase
        .from("visites").select("magasin_id, date_visite").order("date_visite", { ascending: false });

      const result: MagasinData[] = (magasins as Magasin[]).map((m) => {
        const mv: ValeurAvecIndicateur[] = ((allValeurs ?? []) as VRow[])
          .filter((v) => v.magasin_id === m.id)
          .map((v) => ({ ...v, status: getStatus(v.valeur, v.direction, v.seuil_ok, v.seuil_vigilance) }));

        const lastVisit = ((allVisites ?? []) as { magasin_id: string; date_visite: string }[])
          .find((v) => v.magasin_id === m.id)?.date_visite ?? null;

        return {
          magasin: m,
          score: computeScore(mv),
          categories: computeCategoryScores(mv),
          lastVisit,
        };
      });

      setData(result.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)));
      setLoading(false);
    }
    load();
  }, []);

  // All unique categories
  const allCats = Array.from(new Set(data.flatMap((d) => d.categories.map((c) => c.name)))).sort();

  // Radar data format
  const radarData = allCats.map((cat) => {
    const entry: Record<string, string | number> = { cat: cat.replace("Non-négociables / ", "") };
    data.forEach((d) => {
      entry[d.magasin.nom.replace("EasyCash ", "")] =
        d.categories.find((c) => c.name === cat)?.score ?? 0;
    });
    return entry;
  });

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[13px]" style={{ color: "var(--textMuted)" }}>Chargement…</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* View selector */}
      <div className="flex items-center gap-2">
        {(["table", "radar", "ranking"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold border transition-all"
            style={{
              background: view === v ? "var(--accent)" : "var(--surface)",
              borderColor: view === v ? "var(--accent)" : "var(--border)",
              color: view === v ? "#000" : "var(--textMuted)",
            }}
          >
            {v === "table" ? "🗂 Heatmap" : v === "radar" ? "🕸 Radar" : "🏆 Classement"}
          </button>
        ))}
      </div>

      {/* ── TABLE / HEATMAP ─────────────────────────────────── */}
      {view === "table" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border overflow-auto" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-[11px]" style={{ minWidth: 700 }}>
            <thead>
              <tr style={{ background: "var(--surface)" }}>
                <th className="text-left px-4 py-3 font-bold" style={{ color: "var(--textMuted)" }}>Magasin</th>
                <th className="px-3 py-3 font-bold text-center" style={{ color: "var(--textMuted)" }}>Score global</th>
                <th className="px-3 py-3 font-bold text-center" style={{ color: "var(--textMuted)" }}>Dernière visite</th>
                {allCats.map((c) => (
                  <th key={c} className="px-2 py-3 font-bold text-center text-[9px]" style={{ color: "var(--textMuted)", maxWidth: 80 }}>
                    {c.replace("Non-négociables / ", "").replace("Web / E-réputation", "Web").replace("Politique commerciale", "Pol. comm.")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <motion.tr
                  key={d.magasin.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="border-t"
                  style={{ borderColor: "var(--border)", background: i % 2 === 0 ? "var(--surfaceAlt)" : "var(--surface)" }}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold" style={{ color: "var(--text)" }}>{d.magasin.nom.replace("EasyCash ", "")}</div>
                    <div className="text-[10px]" style={{ color: "var(--textMuted)" }}>{d.magasin.franchise}</div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {d.score !== null ? (
                      <span className="text-[16px] font-bold" style={{ color: heatmapColor(d.score) }}>
                        {d.score}
                      </span>
                    ) : (
                      <span style={{ color: "var(--textDim)" }}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-[10px]" style={{ color: "var(--textMuted)" }}>
                    {d.lastVisit ? new Date(d.lastVisit).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  {allCats.map((cat) => {
                    const catData = d.categories.find((c) => c.name === cat);
                    const s = catData?.score ?? null;
                    return (
                      <td
                        key={cat}
                        className="px-2 py-3 text-center font-bold"
                        style={{ background: heatmapBg(s), color: heatmapColor(s) }}
                      >
                        {s !== null ? `${s}%` : "—"}
                      </td>
                    );
                  })}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* ── RADAR ─────────────────────────────────────────────── */}
      {view === "radar" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl p-6 border"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="text-[12px] font-semibold mb-4" style={{ color: "var(--text)" }}>
            Profil comparatif — tous les magasins
          </div>
          <ResponsiveContainer width="100%" height={450}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#2a2e3a" />
              <PolarAngleAxis dataKey="cat" tick={{ fill: "#8b8fa3", fontSize: 10 }} />
              {data.map((d, i) => (
                <Radar
                  key={d.magasin.id}
                  name={d.magasin.nom.replace("EasyCash ", "")}
                  dataKey={d.magasin.nom.replace("EasyCash ", "")}
                  stroke={COLORS[i % COLORS.length]}
                  fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.08}
                  strokeWidth={2}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--textMuted)" }} />
              <Tooltip
                contentStyle={{ background: "#1a1d27", border: "1px solid #2a2e3a", borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`${v}%`]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* ── RANKING ───────────────────────────────────────────── */}
      {view === "ranking" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {data.map((d, i) => {
            const color = COLORS[i % COLORS.length];
            const scoreVal = d.score ?? 0;
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
            return (
              <motion.div
                key={d.magasin.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-4 rounded-xl p-4 border"
                style={{ background: "var(--surface)", borderColor: `${color}30` }}
              >
                <span className="text-[24px] w-8 text-center">{medal}</span>
                <div className="flex-1">
                  <div className="font-semibold text-[14px]" style={{ color: "var(--text)" }}>
                    {d.magasin.nom}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--textMuted)" }}>
                    {d.magasin.franchise} · {d.magasin.ville}
                  </div>
                  {/* Progress bar */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#2a2e3a" }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${scoreVal}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{ background: heatmapColor(d.score) }}
                      />
                    </div>
                    <span className="text-[16px] font-bold w-12 text-right" style={{ color: heatmapColor(d.score) }}>
                      {d.score ?? "—"}
                    </span>
                  </div>
                </div>
                {/* Category mini-scores */}
                <div className="hidden md:flex gap-1 flex-wrap max-w-[220px]">
                  {d.categories.slice(0, 6).map((c) => (
                    <span
                      key={c.name}
                      className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: heatmapBg(c.score), color: heatmapColor(c.score) }}
                    >
                      {c.score}%
                    </span>
                  ))}
                </div>
              </motion.div>
            );
          })}

          {/* Cross-store alerts */}
          <div className="rounded-xl p-4 border mt-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textMuted)" }}>
              🔔 Alertes croisées
            </div>
            {allCats.map((cat) => {
              const withAlert = data.filter((d) => {
                const c = d.categories.find((x) => x.name === cat);
                return c && c.dg > 0;
              });
              if (withAlert.length < 2) return null;
              return (
                <div key={cat} className="flex items-center gap-2 py-2 border-b text-[11px]" style={{ borderColor: "var(--border)" }}>
                  <span className="font-bold" style={{ color: "#ff4d6a" }}>
                    {withAlert.length}/{data.length} magasins
                  </span>
                  <span style={{ color: "var(--text)" }}>ont un problème en <strong>{cat.replace("Non-négociables / ", "")}</strong></span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}

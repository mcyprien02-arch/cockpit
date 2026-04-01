"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { formatEuro } from "@/lib/hiddenCosts";

// ─── Types ────────────────────────────────────────────────────
type Nature = "GC" | "RD" | "GF" | "PS" | "PD";

interface NatureConfig {
  label: string;
  target: number;
  color: string;
}

interface AnalyseTempsScreenProps {
  magasinId: string;
}

// ─── Constants ────────────────────────────────────────────────
const NATURES: Nature[] = ["GC", "RD", "GF", "PS", "PD"];

const NATURE_CONFIG: Record<Nature, NatureConfig> = {
  GC: { label: "Gestion Courante",               target: 30, color: "#4da6ff" },
  RD: { label: "Régulation Dysfonctionnements",   target: 15, color: "#ff4d6a" },
  GF: { label: "Glissement de Fonction",          target: 10, color: "#ff8c42" },
  PS: { label: "Pilotage Stratégique",            target: 25, color: "#00d4aa" },
  PD: { label: "Prévention Dysfonctionnements",   target: 20, color: "#a78bfa" },
};

const DEFAULT_REEL: Record<Nature, number> = { GC: 30, RD: 15, GF: 10, PS: 25, PD: 20 };

// ─── Custom pie label ─────────────────────────────────────────
function renderPieLabel({
  cx, cy, midAngle, innerRadius, outerRadius, name, value,
}: {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number;
  name: string; value: number;
}) {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5 + 14;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  if (value < 5) return null;
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700}>
      {name} {value}%
    </text>
  );
}

// ─── Main Component ───────────────────────────────────────────
export function AnalyseTempsScreen({ magasinId }: AnalyseTempsScreenProps) {
  const [reel, setReel]           = useState<Record<Nature, number>>(DEFAULT_REEL);
  const [chvacv, setChvacv]       = useState<number>(40);
  const [nbEtp, setNbEtp]         = useState<number>(4);
  const [heuresAn, setHeuresAn]   = useState<number>(1607 * 4);

  // ── Load from localStorage ───────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`analyse_temps_${magasinId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.reel) setReel(parsed.reel);
        if (parsed.nbEtp) { setNbEtp(parsed.nbEtp); setHeuresAn(1607 * parsed.nbEtp); }
      }
      const savedChvacv = localStorage.getItem(`chvacv_${magasinId}`);
      if (savedChvacv) {
        const parsed = JSON.parse(savedChvacv);
        if (parsed.chvacv_calculee) setChvacv(parsed.chvacv_calculee);
        else if (parsed.ca_annuel && parsed.cv_annuelles && parsed.nb_heures_travaillees) {
          const calc = (parsed.ca_annuel - parsed.cv_annuelles) / parsed.nb_heures_travaillees;
          if (calc > 0) setChvacv(Math.round(calc * 100) / 100);
        }
      }
    } catch { /* ignore */ }
  }, [magasinId]);

  // ── Save ──────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(`analyse_temps_${magasinId}`, JSON.stringify({ reel, nbEtp }));
  }, [reel, nbEtp, magasinId]);

  const totalReel = NATURES.reduce((s, n) => s + reel[n], 0);

  const updateReel = (nature: Nature, val: number) => {
    setReel(prev => ({ ...prev, [nature]: Math.max(0, Math.min(100, val)) }));
  };

  // ── Computed values ───────────────────────────────────────────
  const rdGfReel    = reel.RD + reel.GF;
  const rdGfTarget  = NATURE_CONFIG.RD.target + NATURE_CONFIG.GF.target;
  const excessHours = Math.max(0, ((rdGfReel - rdGfTarget) / 100) * heuresAn);
  const coutEstime  = Math.round(excessHours * chvacv);
  const cout1h      = chvacv;

  // ── Pie data ─────────────────────────────────────────────────
  const pieReel  = NATURES.map(n => ({ name: n, value: reel[n], color: NATURE_CONFIG[n].color }));
  const pieIdeal = NATURES.map(n => ({ name: n, value: NATURE_CONFIG[n].target, color: NATURE_CONFIG[n].color }));

  // ── Diagnostics ───────────────────────────────────────────────
  const diagnostics: { icon: string; text: string; color: string }[] = [];
  if (reel.PS + reel.PD < 40) {
    diagnostics.push({ icon: "⚠", text: "Vous subissez plus que vous ne pilotez (PS+PD < 40%)", color: "#ffb347" });
  }
  if (reel.RD + reel.GF > 30) {
    diagnostics.push({ icon: "⛔", text: "Dysfonctionnements majeurs détectés (RD+GF > 30%)", color: "#ff4d6a" });
  }
  if (reel.RD > NATURE_CONFIG.RD.target) {
    diagnostics.push({
      icon: "💡",
      text: "Action recommandée : identifier et réduire les sources de dysfonctionnements → PAP",
      color: "#4da6ff",
    });
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="rounded-2xl border p-5"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider" style={{ color: "var(--textMuted)" }}>
            Coût horaire (CHVACV)
          </div>
          <div className="text-[28px] font-bold" style={{ color: "#00d4aa" }}>{formatEuro(cout1h)}</div>
          <div className="text-[12px] mt-1" style={{ color: "var(--textDim)" }}>1h de dysfonctionnement</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07 }}
          className="rounded-2xl border p-5"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider" style={{ color: "var(--textMuted)" }}>
            Temps non productif
          </div>
          <div
            className="text-[28px] font-bold"
            style={{ color: rdGfReel > rdGfTarget ? "#ff4d6a" : "#00d4aa" }}
          >
            {rdGfReel}%
          </div>
          <div className="text-[12px] mt-1" style={{ color: "var(--textDim)" }}>
            RD + GF réel (cible {rdGfTarget}%)
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="rounded-2xl border p-5"
          style={{ background: rdGfReel > rdGfTarget ? "#ff4d6a08" : "var(--surface)", borderColor: rdGfReel > rdGfTarget ? "#ff4d6a40" : "var(--border)" }}
        >
          <div className="text-[11px] font-semibold mb-1 uppercase tracking-wider" style={{ color: "var(--textMuted)" }}>
            Coût estimé des écarts
          </div>
          <div className="text-[28px] font-bold" style={{ color: coutEstime > 0 ? "#ff4d6a" : "#00d4aa" }}>
            {formatEuro(coutEstime)}
          </div>
          <div className="text-[12px] mt-1" style={{ color: "var(--textDim)" }}>
            {Math.round(excessHours)}h excès × {formatEuro(chvacv)}/h
          </div>
        </motion.div>
      </div>

      {/* Pie charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[
          { title: "Temps réel", data: pieReel },
          { title: "Temps idéal (cibles ISEOR)", data: pieIdeal },
        ].map(({ title, data }) => (
          <div key={title} className="rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-[13px] font-semibold mb-3" style={{ color: "var(--text)" }}>{title}</div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  labelLine={false}
                  label={renderPieLabel}
                >
                  {data.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 8, color: "var(--text)", fontSize: 12,
                  }}
                  formatter={(v: number | string, name: string) => [`${v}%`, NATURE_CONFIG[name as Nature]?.label ?? name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {data.map(d => (
                <div key={d.name} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--textMuted)" }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  {NATURE_CONFIG[d.name as Nature]?.label ?? d.name}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Configuration */}
      <div className="rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="text-[13px] font-semibold mb-4" style={{ color: "var(--text)" }}>Paramètres</div>
        <div className="flex flex-wrap gap-6">
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: "var(--textMuted)" }}>Nb ETP</span>
            <input
              type="number"
              min={1}
              max={20}
              value={nbEtp}
              onChange={e => {
                const v = parseInt(e.target.value) || 1;
                setNbEtp(v);
                setHeuresAn(1607 * v);
              }}
              className="rounded-xl px-3 py-2 text-[14px] font-semibold border w-24 focus:outline-none"
              style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)", fontFamily: "inherit" }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: "var(--textMuted)" }}>Heures/an équipe</span>
            <input
              type="number"
              value={heuresAn}
              onChange={e => setHeuresAn(parseInt(e.target.value) || 1)}
              className="rounded-xl px-3 py-2 text-[14px] font-semibold border w-32 focus:outline-none"
              style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)", fontFamily: "inherit" }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px]" style={{ color: "var(--textMuted)" }}>CHVACV (€/h)</span>
            <input
              type="number"
              value={chvacv}
              onChange={e => setChvacv(parseFloat(e.target.value) || 0)}
              className="rounded-xl px-3 py-2 text-[14px] font-semibold border w-28 focus:outline-none"
              style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)", fontFamily: "inherit" }}
            />
          </label>
        </div>
      </div>

      {/* Sliders */}
      <div className="rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Répartition réelle du temps</div>
          {Math.abs(totalReel - 100) > 0.5 && (
            <span className="text-[12px] font-semibold" style={{ color: "#ff4d6a" }}>
              ⚠ Total : {totalReel}% (doit faire 100%)
            </span>
          )}
          {Math.abs(totalReel - 100) <= 0.5 && (
            <span className="text-[12px]" style={{ color: "#00d4aa" }}>✓ Total : {totalReel}%</span>
          )}
        </div>
        <div className="space-y-5">
          {NATURES.map(nature => {
            const cfg   = NATURE_CONFIG[nature];
            const diff  = reel[nature] - cfg.target;
            const diffColor = diff > 0 ? "#ff4d6a" : diff < 0 ? "#ffb347" : "#00d4aa";
            return (
              <div key={nature}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: cfg.color }} />
                    <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
                      {nature} — {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[12px]">
                    <span style={{ color: cfg.color, fontWeight: 700 }}>{reel[nature]}%</span>
                    <span style={{ color: "var(--textDim)" }}>cible {cfg.target}%</span>
                    {diff !== 0 && (
                      <span style={{ color: diffColor, fontWeight: 600 }}>
                        {diff > 0 ? "+" : ""}{diff}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={reel[nature]}
                    onChange={e => updateReel(nature, parseInt(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer"
                    style={{
                      accentColor: cfg.color,
                      background: `linear-gradient(to right, ${cfg.color} ${reel[nature]}%, var(--surfaceAlt) ${reel[nature]}%)`,
                    }}
                  />
                  {/* Target marker */}
                  <div
                    className="absolute top-0 w-0.5 h-2 rounded-full pointer-events-none"
                    style={{
                      left: `${cfg.target}%`,
                      background: "rgba(255,255,255,0.4)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Coût des écarts */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <div className="px-5 py-4 border-b" style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)" }}>
          <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Coût des écarts</div>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
              {["Nature", "Réel", "Cible", "Écart", "Heures excès", "Coût estimé"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--textMuted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NATURES.map((nature, i) => {
              const cfg       = NATURE_CONFIG[nature];
              const ecart     = reel[nature] - cfg.target;
              const hExces    = Math.max(0, (ecart / 100) * heuresAn);
              const cout      = Math.round(hExces * chvacv);
              const ecartColor = ecart > 0 ? "#ff4d6a" : ecart < 0 ? "#ffb347" : "#00d4aa";
              return (
                <tr
                  key={nature}
                  style={{
                    background: i % 2 === 0 ? "var(--surface)" : "var(--surfaceAlt)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: cfg.color }} />
                      <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{nature}</span>
                      <span className="text-[11px]" style={{ color: "var(--textDim)" }}>{cfg.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] font-semibold" style={{ color: cfg.color }}>{reel[nature]}%</td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: "var(--textMuted)" }}>{cfg.target}%</td>
                  <td className="px-4 py-3 text-[13px] font-semibold" style={{ color: ecartColor }}>
                    {ecart > 0 ? "+" : ""}{ecart}%
                  </td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: "var(--textMuted)" }}>
                    {hExces > 0 ? `${Math.round(hExces)}h` : "—"}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-semibold" style={{ color: cout > 0 ? "#ff4d6a" : "var(--textDim)" }}>
                    {cout > 0 ? formatEuro(cout) : "—"}
                  </td>
                </tr>
              );
            })}
            {/* Total row */}
            <tr style={{ background: "var(--surfaceAlt)", borderTop: "2px solid var(--border)" }}>
              <td className="px-4 py-3 text-[13px] font-bold" style={{ color: "var(--text)" }}>Total</td>
              <td className="px-4 py-3 text-[13px] font-bold" style={{ color: totalReel === 100 ? "#00d4aa" : "#ff4d6a" }}>{totalReel}%</td>
              <td className="px-4 py-3 text-[12px]" style={{ color: "var(--textMuted)" }}>100%</td>
              <td colSpan={2} />
              <td className="px-4 py-3 text-[13px] font-bold" style={{ color: coutEstime > 0 ? "#ff4d6a" : "var(--textDim)" }}>
                {coutEstime > 0 ? formatEuro(coutEstime) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Diagnostics */}
      {diagnostics.length > 0 && (
        <div className="rounded-2xl border p-5 space-y-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Diagnostic automatique</div>
          {diagnostics.map((d, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl p-3 text-[13px] font-medium"
              style={{
                background: `${d.color}12`,
                border: `1px solid ${d.color}40`,
                color: d.color,
              }}
            >
              {d.icon} {d.text}
            </motion.div>
          ))}
        </div>
      )}

      {/* ISEOR note */}
      <div
        className="rounded-2xl border p-5 text-[12px]"
        style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--textDim)" }}
      >
        <span className="font-semibold" style={{ color: "var(--textMuted)" }}>Note ISEOR : </span>
        La méthode ISEOR (Socio-Économique) distingue 5 natures d&apos;activités. L&apos;objectif est de maximiser
        PS+PD (pilotage) et de réduire RD+GF (réactif/subi). Le CHVACV (Contribution Horaire à la Valeur Ajoutée
        sur Coûts Variables) permet de valoriser les heures perdues en dysfonctionnements en coût économique réel.
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { getStatus } from "@/lib/scoring";
import {
  computeHiddenCosts, aggregateByISEORCategory, formatEuro,
  ISEOR_CATEGORY_COLORS, ISEOR_CATEGORY_ICONS,
  type ISEORCategory,
} from "@/lib/hiddenCosts";
import type { ValeurAvecIndicateur } from "@/types";

const ISEOR_CATEGORIES: ISEORCategory[] = [
  "Sursalaires", "Surtemps", "Surconsommations",
  "Non-productions", "Non-créations de potentiel", "Risques",
];

interface Investment {
  id: string;
  label: string;
  montant: number;
  categorie: ISEORCategory;
  description: string;
}

const DEFAULT_INVESTMENTS: Investment[] = [
  { id: "1", label: "Formation équipe Picea", montant: 500, categorie: "Surtemps", description: "Formation initiale + certification" },
  { id: "2", label: "Abonnement Authentifier.com", montant: 300, categorie: "Risques", description: "Outil d'authentification produits" },
  { id: "3", label: "Optimisation sourcing externe", montant: 800, categorie: "Non-productions", description: "Foires, partenariats, dépôts vente" },
  { id: "4", label: "Programme fidélité (setup)", montant: 200, categorie: "Non-créations de potentiel", description: "Activation et communication" },
];

interface BalanceEconomiqueScreenProps {
  magasinId: string;
  magasin: { id: string; nom: string } | null;
}

// Custom tooltip for charts
function CustomTooltip({ active, payload }: { active?: boolean; payload?: { value: number; name: string }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 text-[11px] border shadow-xl"
      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
      <div className="font-bold mb-1">{payload[0].name}</div>
      <div>{formatEuro(payload[0].value)}</div>
    </div>
  );
}

export function BalanceEconomiqueScreen({ magasinId, magasin }: BalanceEconomiqueScreenProps) {
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [investments, setInvestments] = useState<Investment[]>(DEFAULT_INVESTMENTS);
  const [newInvestment, setNewInvestment] = useState({ label: "", montant: "", categorie: "Surtemps" as ISEORCategory, description: "" });
  const [addingInv, setAddingInv] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ISEORCategory | null>(null);
  const storageKey = `balance_investments_${magasinId}`;

  // Load investments from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setInvestments(JSON.parse(saved));
    } catch { /* noop */ }
  }, [storageKey]);

  const saveInvestments = useCallback((inv: Investment[]) => {
    setInvestments(inv);
    localStorage.setItem(storageKey, JSON.stringify(inv));
  }, [storageKey]);

  const load = useCallback(async () => {
    if (!magasinId) return;
    setLoading(true);
    const { data } = await supabase.from("v_dernieres_valeurs").select("*").eq("magasin_id", magasinId);
    type VRow = {
      magasin_id: string; indicateur_id: string; valeur: number; date_saisie: string;
      indicateur_nom: string; unite: string | null; direction: "up" | "down";
      seuil_ok: number | null; seuil_vigilance: number | null; categorie: string;
      poids: number; action_defaut: string | null; magasin_nom: string;
    };
    const enriched: ValeurAvecIndicateur[] = ((data ?? []) as VRow[]).map((r) => ({
      ...r,
      status: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
    }));
    setValeurs(enriched);
    setLoading(false);
  }, [magasinId]);

  useEffect(() => { load(); }, [load]);

  const costs = computeHiddenCosts(valeurs);
  const byCategory = aggregateByISEORCategory(costs);
  const totalCosts = costs.reduce((s, c) => s + (c.estimatedLoss ?? 0), 0);
  const totalInvestments = investments.reduce((s, i) => s + i.montant, 0);
  const potentialROI = totalCosts > 0 ? Math.round(((totalCosts * 0.6 - totalInvestments) / totalInvestments) * 100) : 0;
  const recoverableCosts = Math.round(totalCosts * 0.6);

  // Radar chart data
  const radarData = ISEOR_CATEGORIES.map((cat) => ({
    cat: cat.replace("Non-créations de potentiel", "Non-créations"),
    fullCat: cat,
    value: byCategory[cat],
    max: 20000,
  }));

  // Bar chart data
  const barData = ISEOR_CATEGORIES
    .map((cat) => ({ name: cat.replace("Non-créations de potentiel", "Non-créations"), value: byCategory[cat], cat }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  // Filtered costs
  const displayedCosts = activeCategory ? costs.filter((c) => c.iseorCategory === activeCategory) : costs;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[13px]" style={{ color: "var(--textMuted)" }}>Calcul des coûts cachés…</div>
    </div>
  );

  if (costs.length === 0) return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
      <div className="text-[40px] mb-3">🎉</div>
      <div className="text-[16px] font-semibold mb-2" style={{ color: "var(--text)" }}>Aucun coût caché détecté</div>
      <div className="text-[13px]" style={{ color: "var(--textMuted)" }}>
        Tous les KPIs sont dans le vert. Continuez comme ça !
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ── Header KPIs ───────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Coûts cachés estimés", value: formatEuro(totalCosts), sub: `${costs.length} dysfonctionnements`, color: "var(--danger)", bg: "#ff4d6a12" },
          { label: "Récupérable (60%)", value: formatEuro(recoverableCosts), sub: "Potentiel réaliste", color: "#ffb347", bg: "#ffb34712" },
          { label: "Investissement nécessaire", value: formatEuro(totalInvestments), sub: `${investments.length} actions planifiées`, color: "#4da6ff", bg: "#4da6ff12" },
          { label: "ROI potentiel", value: `${potentialROI > 0 ? "+" : ""}${potentialROI}%`, sub: "Sur 12 mois", color: potentialROI > 0 ? "#00d4aa" : "var(--danger)", bg: potentialROI > 0 ? "#00d4aa12" : "#ff4d6a12" },
        ].map(({ label, value, sub, color, bg }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5 border"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--textMuted)" }}>{label}</div>
            <div className="text-[22px] font-bold mb-1" style={{ color }}>{value}</div>
            <div className="inline-block px-2.5 py-1 rounded-lg text-[10px] font-semibold" style={{ background: bg, color }}>{sub}</div>
          </motion.div>
        ))}
      </div>

      {/* ── ISEOR Balance visuelle ─────────────────────────── */}
      <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--textMuted)" }}>
          Balance Économique ISEOR — Répartition des coûts cachés
        </div>

        {/* Category bars */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            {ISEOR_CATEGORIES.map((cat) => {
              const val = byCategory[cat];
              const pct = totalCosts > 0 ? (val / totalCosts) * 100 : 0;
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(isActive ? null : cat)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px]">{ISEOR_CATEGORY_ICONS[cat]}</span>
                      <span className="text-[12px] font-semibold" style={{ color: isActive ? ISEOR_CATEGORY_COLORS[cat] : "var(--text)" }}>{cat}</span>
                    </div>
                    <span className="text-[12px] font-bold" style={{ color: val > 0 ? ISEOR_CATEGORY_COLORS[cat] : "var(--textDim)" }}>
                      {val > 0 ? formatEuro(val) : "—"}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surfaceAlt)" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: ISEOR_CATEGORY_COLORS[cat], opacity: val > 0 ? 1 : 0.2 }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Radar chart */}
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <PolarGrid stroke="#ffffff10" />
                <PolarAngleAxis dataKey="cat" tick={{ fill: "#8b8fa3", fontSize: 10 }} />
                <Radar
                  name="Coûts cachés"
                  dataKey="value"
                  stroke="#ff4d6a"
                  fill="#ff4d6a"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 320px" }}>
        {/* ── Dysfonctionnements détaillés ──────────────────── */}
        <div className="space-y-4">
          {/* Filter chips */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveCategory(null)}
              className="px-3 py-1.5 rounded-xl text-[11px] font-semibold border"
              style={{
                background: activeCategory === null ? "var(--accent)" : "transparent",
                color: activeCategory === null ? "#000" : "var(--textMuted)",
                borderColor: activeCategory === null ? "var(--accent)" : "var(--border)",
              }}
            >
              Tout ({costs.length})
            </button>
            {ISEOR_CATEGORIES.filter((cat) => byCategory[cat] > 0).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold border"
                style={{
                  background: activeCategory === cat ? ISEOR_CATEGORY_COLORS[cat] + "30" : "transparent",
                  color: ISEOR_CATEGORY_COLORS[cat],
                  borderColor: activeCategory === cat ? ISEOR_CATEGORY_COLORS[cat] : "var(--border)",
                }}
              >
                {ISEOR_CATEGORY_ICONS[cat]} {cat.split(" ")[0]}
              </button>
            ))}
          </div>

          {/* Cost cards */}
          <div className="space-y-3">
            {displayedCosts.map((cost, i) => {
              const catColor = ISEOR_CATEGORY_COLORS[cost.iseorCategory];
              return (
                <motion.div
                  key={cost.kpiName}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-2xl p-4 border"
                  style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold"
                          style={{ background: catColor + "20", color: catColor }}>
                          {ISEOR_CATEGORY_ICONS[cost.iseorCategory]} {cost.iseorCategory}
                        </span>
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${cost.severity === "dg" ? "text-red-400" : "text-orange-400"}`}
                          style={{ background: cost.severity === "dg" ? "#ff4d6a18" : "#ffb34718" }}>
                          {cost.severity === "dg" ? "⛔ Critique" : "⚠ Vigilance"}
                        </span>
                      </div>
                      <div className="text-[13px] font-semibold mb-0.5" style={{ color: "var(--text)" }}>{cost.label}</div>
                      <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>{cost.detail}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[16px] font-bold" style={{ color: catColor }}>
                        {cost.estimatedLoss !== null ? formatEuro(cost.estimatedLoss) : "Non chiffré"}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--textDim)" }}>/an</div>
                    </div>
                  </div>

                  {/* ROI bar */}
                  {cost.estimatedLoss !== null && cost.estimatedLoss > 0 && (
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surfaceAlt)" }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, (cost.estimatedLoss / totalCosts) * 100 * 3)}%` }}
                          transition={{ duration: 0.8, ease: "easeOut", delay: i * 0.05 }}
                          className="h-full rounded-full"
                          style={{ background: catColor }}
                        />
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Bar chart */}
          {barData.length > 0 && (
            <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--textMuted)" }}>
                Classement par catégorie
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} margin={{ left: 10, right: 10 }}>
                  <XAxis dataKey="name" tick={{ fill: "#8b8fa3", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#8b8fa3", fontSize: 9 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k€`} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "#ffffff05" }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={index} fill={ISEOR_CATEGORY_COLORS[entry.cat as ISEORCategory]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Sidebar: Investissements & ROI ────────────────── */}
        <div className="space-y-4">
          {/* ROI summary */}
          <div className="rounded-2xl p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textMuted)" }}>
              Équation de valeur
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "#ff4d6a12" }}>
                <span className="text-[11px]" style={{ color: "var(--textMuted)" }}>Coûts cachés totaux</span>
                <span className="text-[13px] font-bold" style={{ color: "var(--danger)" }}>{formatEuro(totalCosts)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "#ffb34712" }}>
                <span className="text-[11px]" style={{ color: "var(--textMuted)" }}>Récupérable (60%)</span>
                <span className="text-[13px] font-bold" style={{ color: "#ffb347" }}>{formatEuro(recoverableCosts)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "#4da6ff12" }}>
                <span className="text-[11px]" style={{ color: "var(--textMuted)" }}>Investissement</span>
                <span className="text-[13px] font-bold" style={{ color: "#4da6ff" }}>− {formatEuro(totalInvestments)}</span>
              </div>
              <div className="h-px my-1" style={{ background: "var(--border)" }} />
              <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: potentialROI > 0 ? "#00d4aa14" : "#ff4d6a12" }}>
                <span className="text-[11px] font-bold" style={{ color: "var(--text)" }}>Gain net estimé</span>
                <span className="text-[15px] font-bold" style={{ color: potentialROI > 0 ? "#00d4aa" : "var(--danger)" }}>
                  {formatEuro(Math.max(0, recoverableCosts - totalInvestments))}
                </span>
              </div>
            </div>

            <div className="mt-4 text-center">
              <div className="text-[11px] mb-1" style={{ color: "var(--textMuted)" }}>ROI sur 12 mois</div>
              <div className="text-[32px] font-bold" style={{ color: potentialROI > 0 ? "#00d4aa" : "var(--danger)" }}>
                {potentialROI > 0 ? "+" : ""}{potentialROI}%
              </div>
            </div>
          </div>

          {/* Investment list */}
          <div className="rounded-2xl p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--textMuted)" }}>
                Plan d&apos;investissement
              </div>
              <button
                onClick={() => setAddingInv(!addingInv)}
                className="text-[11px] px-2.5 py-1 rounded-lg"
                style={{ background: "var(--accent)", color: "#000" }}
              >
                {addingInv ? "✕" : "+ Ajouter"}
              </button>
            </div>

            {addingInv && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="rounded-xl p-3 mb-3 space-y-2 border"
                style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)" }}
              >
                <input
                  placeholder="Libellé"
                  value={newInvestment.label}
                  onChange={(e) => setNewInvestment((p) => ({ ...p, label: e.target.value }))}
                  className="w-full rounded-lg px-3 py-1.5 text-[11px] border"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Montant €"
                    value={newInvestment.montant}
                    onChange={(e) => setNewInvestment((p) => ({ ...p, montant: e.target.value }))}
                    className="w-full rounded-lg px-3 py-1.5 text-[11px] border"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                  <select
                    value={newInvestment.categorie}
                    onChange={(e) => setNewInvestment((p) => ({ ...p, categorie: e.target.value as ISEORCategory }))}
                    className="w-full rounded-lg px-3 py-1.5 text-[11px] border"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                  >
                    {ISEOR_CATEGORIES.map((c) => (
                      <option key={c} value={c} style={{ background: "var(--surface)" }}>{c}</option>
                    ))}
                  </select>
                </div>
                <input
                  placeholder="Description (optionnel)"
                  value={newInvestment.description}
                  onChange={(e) => setNewInvestment((p) => ({ ...p, description: e.target.value }))}
                  className="w-full rounded-lg px-3 py-1.5 text-[11px] border"
                  style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                />
                <button
                  onClick={() => {
                    if (!newInvestment.label || !newInvestment.montant) return;
                    const inv: Investment = {
                      id: Date.now().toString(),
                      label: newInvestment.label,
                      montant: Number(newInvestment.montant),
                      categorie: newInvestment.categorie,
                      description: newInvestment.description,
                    };
                    saveInvestments([...investments, inv]);
                    setNewInvestment({ label: "", montant: "", categorie: "Surtemps", description: "" });
                    setAddingInv(false);
                  }}
                  className="w-full py-1.5 rounded-lg text-[11px] font-semibold"
                  style={{ background: "var(--accent)", color: "#000" }}
                >
                  Ajouter
                </button>
              </motion.div>
            )}

            <div className="space-y-2">
              {investments.map((inv) => {
                const catColor = ISEOR_CATEGORY_COLORS[inv.categorie];
                return (
                  <div
                    key={inv.id}
                    className="rounded-xl p-2.5 border flex items-start gap-2.5"
                    style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold mb-0.5" style={{ color: "var(--text)" }}>{inv.label}</div>
                      {inv.description && <div className="text-[10px]" style={{ color: "var(--textDim)" }}>{inv.description}</div>}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md mt-1 inline-block"
                        style={{ background: catColor + "20", color: catColor }}>
                        {inv.categorie}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[12px] font-bold" style={{ color: "#4da6ff" }}>{formatEuro(inv.montant)}</span>
                      <button
                        onClick={() => saveInvestments(investments.filter((i) => i.id !== inv.id))}
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ color: "var(--textDim)" }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ISEOR method note */}
          <div className="rounded-2xl p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)", borderLeft: "3px solid #4da6ff" }}>
            <div className="text-[11px] font-bold mb-2" style={{ color: "#4da6ff" }}>Méthode ISEOR</div>
            <div className="text-[10px] leading-relaxed" style={{ color: "var(--textMuted)" }}>
              La Balance Économique ISEOR quantifie l&apos;écart entre <strong style={{ color: "var(--text)" }}>les coûts cachés</strong> générés par les dysfonctionnements et <strong style={{ color: "var(--text)" }}>les investissements</strong> nécessaires pour les résorber. Un ROI positif valide la pertinence des actions correctives.
            </div>
            <div className="mt-2 text-[10px]" style={{ color: "var(--textDim)" }}>
              Source : Henri Savall & Véronique Zardet, ISEOR Lyon
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

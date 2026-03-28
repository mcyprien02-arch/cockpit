"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Legend, Tooltip,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────
interface Competence {
  id: string;
  nom: string;
  categorie: string;
}

interface TeamMember {
  id: string;
  nom: string;
  poste: string;
  ratings: Record<string, 0 | 1 | 2 | 3>; // competence_id → rating
}

interface GridData {
  members: TeamMember[];
  competences: Competence[];
}

// ─── Constants ────────────────────────────────────────────────
const RATING_CONFIG: Record<number, { label: string; color: string; bg: string; symbol: string }> = {
  0: { label: "Non maîtrisé",    color: "#ff4d6a", bg: "#ff4d6a20", symbol: "✗" },
  1: { label: "En apprentissage",color: "#ffb347", bg: "#ffb34720", symbol: "◑" },
  2: { label: "Maîtrisé",        color: "#ffd700", bg: "#ffd70020", symbol: "✓" },
  3: { label: "Expert",          color: "#00d4aa", bg: "#00d4aa20", symbol: "★" },
};

const MEMBER_COLORS = ["#00d4aa", "#4da6ff", "#a78bfa", "#ffb347", "#f472b6", "#ff6b6b"];

const DEFAULT_COMPETENCES: Competence[] = [
  // Techniques métier
  { id: "c1",  nom: "Rachat / Évaluation produit",      categorie: "Techniques métier" },
  { id: "c2",  nom: "Test Picea (batteries/logiciel)",   categorie: "Techniques métier" },
  { id: "c3",  nom: "Authentification produits",         categorie: "Techniques métier" },
  { id: "c4",  nom: "Logiciel EasyCash (maîtrise)",      categorie: "Techniques métier" },
  { id: "c5",  nom: "Diagnostic / Réparation basique",   categorie: "Techniques métier" },
  // Commercial & Client
  { id: "c6",  nom: "Accueil et conseil client",         categorie: "Commercial & Client" },
  { id: "c7",  nom: "Vente complémentaire (cross-sell)", categorie: "Commercial & Client" },
  { id: "c8",  nom: "Négociation rachat",                categorie: "Commercial & Client" },
  { id: "c9",  nom: "Programme fidélité / Encartage",    categorie: "Commercial & Client" },
  // Gestion & Admin
  { id: "c10", nom: "Gestion de caisse",                 categorie: "Gestion & Admin" },
  { id: "c11", nom: "Inventaire / Gestion stock",        categorie: "Gestion & Admin" },
  { id: "c12", nom: "Module étiquette & démarque",       categorie: "Gestion & Admin" },
  { id: "c13", nom: "Bilan quotidien / Reporting",       categorie: "Gestion & Admin" },
  // Management
  { id: "c14", nom: "Animation et motivation équipe",    categorie: "Management" },
  { id: "c15", nom: "Formation collaborateurs",          categorie: "Management" },
  { id: "c16", nom: "Conformité procédures réseau",      categorie: "Management" },
];

const CAT_COLORS: Record<string, string> = {
  "Techniques métier":  "#4da6ff",
  "Commercial & Client":"#00d4aa",
  "Gestion & Admin":    "#a78bfa",
  "Management":         "#ffb347",
};

const DEFAULT_GRID: GridData = {
  members: [
    { id: "m1", nom: "Membre 1", poste: "Responsable", ratings: {} },
    { id: "m2", nom: "Membre 2", poste: "Vendeur",      ratings: {} },
    { id: "m3", nom: "Membre 3", poste: "Vendeur",      ratings: {} },
  ],
  competences: DEFAULT_COMPETENCES,
};

// ─── Rating Cell ──────────────────────────────────────────────
function RatingCell({ rating, onChange }: { rating: 0 | 1 | 2 | 3; onChange: () => void }) {
  const cfg = RATING_CONFIG[rating];
  return (
    <motion.button
      onClick={onChange}
      whileTap={{ scale: 0.85 }}
      className="w-8 h-8 rounded-lg text-[13px] font-bold flex items-center justify-center transition-all hover:scale-110"
      style={{ background: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.color}50` }}
      title={`${cfg.symbol} ${cfg.label} — cliquer pour modifier`}
    >
      {cfg.symbol}
    </motion.button>
  );
}

// ─── Main Screen ──────────────────────────────────────────────
export function CompetencesISEORScreen({ magasinId }: { magasinId: string }) {
  const [grid, setGrid] = useState<GridData>(DEFAULT_GRID);
  const [view, setView] = useState<"grid" | "radar" | "besoins">("grid");
  const [addingMember, setAddingMember] = useState(false);
  const [newMember, setNewMember] = useState({ nom: "", poste: "" });
  const [saved, setSaved] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const storageKey = `competences_iseor_${magasinId}`;

  // Load from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try { setGrid(JSON.parse(stored)); } catch {}
    }
  }, [storageKey]);

  const saveGrid = useCallback((updated: GridData) => {
    setGrid(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }, [storageKey]);

  const cycleRating = (memberId: string, compId: string) => {
    const current = (grid.members.find((m) => m.id === memberId)?.ratings[compId] ?? 0) as 0 | 1 | 2 | 3;
    const next = ((current + 1) % 4) as 0 | 1 | 2 | 3;
    const updated: GridData = {
      ...grid,
      members: grid.members.map((m) =>
        m.id === memberId ? { ...m, ratings: { ...m.ratings, [compId]: next } } : m
      ),
    };
    saveGrid(updated);
  };

  const addMember = () => {
    if (!newMember.nom.trim()) return;
    const m: TeamMember = {
      id: `m${Date.now()}`,
      nom: newMember.nom,
      poste: newMember.poste,
      ratings: {},
    };
    saveGrid({ ...grid, members: [...grid.members, m] });
    setNewMember({ nom: "", poste: "" });
    setAddingMember(false);
  };

  const removeMember = (id: string) => {
    saveGrid({ ...grid, members: grid.members.filter((m) => m.id !== id) });
  };

  // ── Calculations ─────────────────────────────────────────────
  const memberScore = (m: TeamMember) => {
    const total = grid.competences.length * 3;
    const sum = grid.competences.reduce((s, c) => s + (m.ratings[c.id] ?? 0), 0);
    return total > 0 ? Math.round((sum / total) * 100) : 0;
  };

  const compPolyvalence = (compId: string) => {
    const scores = grid.members.map((m) => m.ratings[compId] ?? 0);
    const mastered = scores.filter((s) => s >= 2).length;
    return grid.members.length > 0 ? Math.round((mastered / grid.members.length) * 100) : 0;
  };

  const catScore = (categorie: string) => {
    const comps = grid.competences.filter((c) => c.categorie === categorie);
    if (comps.length === 0 || grid.members.length === 0) return 0;
    const total = comps.length * grid.members.length * 3;
    const sum = grid.members.reduce((s, m) =>
      s + comps.reduce((cs, c) => cs + (m.ratings[c.id] ?? 0), 0), 0
    );
    return total > 0 ? Math.round((sum / total) * 100) : 0;
  };

  const categories = Array.from(new Set(grid.competences.map((c) => c.categorie)));

  // Radar data (per member profile) or per category
  const radarData = categories.map((cat) => {
    const entry: Record<string, string | number> = { cat: cat.replace(" & ", "\n& ") };
    const comps = grid.competences.filter((c) => c.categorie === cat);
    grid.members.forEach((m) => {
      const maxScore = comps.length * 3;
      const score = comps.reduce((s, c) => s + (m.ratings[c.id] ?? 0), 0);
      entry[m.nom] = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    });
    return entry;
  });

  // Training needs
  const trainingNeeds = grid.competences
    .map((comp) => {
      const members = grid.members.filter((m) => (m.ratings[comp.id] ?? 0) < 2);
      return { comp, members, urgency: members.filter((m) => (m.ratings[comp.id] ?? 0) === 0).length };
    })
    .filter((n) => n.members.length > 0)
    .sort((a, b) => b.urgency - a.urgency);

  // Global team polyvalence
  const globalPoly = grid.competences.length > 0 && grid.members.length > 0
    ? Math.round(
        grid.competences.reduce((s, c) => s + compPolyvalence(c.id), 0) / grid.competences.length
      )
    : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[16px] font-bold" style={{ color: "var(--text)" }}>
            Grille de Compétences ISEOR
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--textMuted)" }}>
            {grid.members.length} collaborateurs · {grid.competences.length} compétences · Polyvalence globale : {" "}
            <span style={{ color: globalPoly >= 70 ? "#00d4aa" : globalPoly >= 50 ? "#ffb347" : "#ff4d6a", fontWeight: "bold" }}>
              {globalPoly}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[11px]" style={{ color: "#00d4aa" }}>✓ Sauvegardé</span>}
          {(["grid", "radar", "besoins"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
              style={{
                background: view === v ? "var(--accent)" : "var(--surface)",
                borderColor: view === v ? "var(--accent)" : "var(--border)",
                color: view === v ? "#000" : "var(--textMuted)",
              }}
            >
              {v === "grid" ? "🗂 Grille" : v === "radar" ? "🕸 Radar" : "📚 Formation"}
            </button>
          ))}
          <button
            onClick={() => setAddingMember(true)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            + Collaborateur
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap">
        {Object.entries(RATING_CONFIG).map(([r, cfg]) => (
          <div key={r} className="flex items-center gap-1.5 text-[10px]">
            <span className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold" style={{ background: cfg.bg, color: cfg.color }}>{cfg.symbol}</span>
            <span style={{ color: "var(--textMuted)" }}>{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Add member form */}
      <AnimatePresence>
        {addingMember && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl border"
            style={{ background: "var(--surface)", borderColor: "var(--accent)40" }}
          >
            <input
              value={newMember.nom}
              onChange={(e) => setNewMember((p) => ({ ...p, nom: e.target.value }))}
              placeholder="Nom du collaborateur"
              className="rounded-lg px-3 py-2 text-[12px] border"
              style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
              onKeyDown={(e) => e.key === "Enter" && addMember()}
            />
            <input
              value={newMember.poste}
              onChange={(e) => setNewMember((p) => ({ ...p, poste: e.target.value }))}
              placeholder="Poste"
              className="rounded-lg px-3 py-2 text-[12px] border"
              style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            <button onClick={addMember} className="px-4 py-2 rounded-lg text-[12px] font-semibold" style={{ background: "var(--accent)", color: "#000" }}>
              Ajouter
            </button>
            <button onClick={() => setAddingMember(false)} className="px-3 py-2 rounded-lg text-[12px] border" style={{ borderColor: "var(--border)", color: "var(--textMuted)" }}>
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── GRID VIEW ────────────────────────────────────────── */}
      {view === "grid" && (
        <div className="rounded-xl border overflow-auto" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-[11px]" style={{ minWidth: 700 }}>
            <thead>
              <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                <th className="text-left px-4 py-3 font-bold w-48" style={{ color: "var(--textMuted)" }}>Compétence</th>
                <th className="px-3 py-3 font-bold text-center text-[9px] uppercase tracking-wider" style={{ color: "var(--textDim)", minWidth: 60 }}>
                  Poly. %
                </th>
                {grid.members.map((m, i) => (
                  <th key={m.id} className="px-3 py-3 text-center" style={{ minWidth: 72 }}>
                    <div className="font-bold text-[11px]" style={{ color: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                      {m.nom.split(" ")[0]}
                    </div>
                    <div className="text-[9px]" style={{ color: "var(--textDim)" }}>{m.poste}</div>
                    <div className="text-[10px] font-bold mt-0.5" style={{ color: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                      {memberScore(m)}%
                    </div>
                    <button
                      onClick={() => removeMember(m.id)}
                      className="text-[9px] mt-0.5 hover:opacity-70"
                      style={{ color: "#ff4d6a55" }}
                    >✕</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <>
                  {/* Category header row */}
                  <tr key={`cat-${cat}`} style={{ background: `${CAT_COLORS[cat]}12` }}>
                    <td colSpan={2 + grid.members.length} className="px-4 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: CAT_COLORS[cat] ?? "var(--accent)" }}>
                        {cat}
                      </span>
                      <span className="text-[9px] ml-2" style={{ color: "var(--textDim)" }}>
                        Score moyen : {catScore(cat)}%
                      </span>
                    </td>
                  </tr>
                  {/* Competency rows */}
                  {grid.competences.filter((c) => c.categorie === cat).map((comp, ci) => {
                    const poly = compPolyvalence(comp.id);
                    return (
                      <motion.tr
                        key={comp.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: ci * 0.03 }}
                        className="border-b hover:opacity-90"
                        style={{
                          background: ci % 2 === 0 ? "var(--surfaceAlt)" : "var(--surface)",
                          borderColor: "var(--border)",
                        }}
                      >
                        <td className="px-4 py-2.5" style={{ color: "var(--text)" }}>{comp.nom}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className="text-[11px] font-bold"
                            style={{ color: poly >= 80 ? "#00d4aa" : poly >= 50 ? "#ffb347" : "#ff4d6a" }}
                          >
                            {poly}%
                          </span>
                        </td>
                        {grid.members.map((m) => (
                          <td key={m.id} className="px-3 py-2 text-center">
                            <div className="flex justify-center">
                              <RatingCell
                                rating={(m.ratings[comp.id] ?? 0) as 0 | 1 | 2 | 3}
                                onChange={() => cycleRating(m.id, comp.id)}
                              />
                            </div>
                          </td>
                        ))}
                      </motion.tr>
                    );
                  })}
                </>
              ))}

              {/* Polyvalence footer */}
              <tr style={{ background: "var(--surface)", borderTop: "2px solid var(--border)" }}>
                <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--textMuted)" }}>
                  Score individuel
                </td>
                <td className="px-3 py-3 text-center text-[11px] font-bold" style={{ color: globalPoly >= 70 ? "#00d4aa" : "#ffb347" }}>
                  {globalPoly}%
                </td>
                {grid.members.map((m, i) => {
                  const score = memberScore(m);
                  return (
                    <td key={m.id} className="px-3 py-3 text-center">
                      <div>
                        <div className="text-[14px] font-bold" style={{ color: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                          {score}%
                        </div>
                        <div className="mx-auto mt-1 w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "#2a2e3a" }}>
                          <div className="h-full rounded-full" style={{ width: `${score}%`, background: MEMBER_COLORS[i % MEMBER_COLORS.length] }} />
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── RADAR VIEW ───────────────────────────────────────── */}
      {view === "radar" && (
        <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 320px" }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl p-6 border"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="text-[12px] font-bold mb-3" style={{ color: "var(--text)" }}>
              Profil de compétences par catégorie
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#2a2e3a" />
                <PolarAngleAxis dataKey="cat" tick={{ fill: "#8b8fa3", fontSize: 10 }} />
                {grid.members.map((m, i) => (
                  <Radar
                    key={m.id}
                    name={m.nom}
                    dataKey={m.nom}
                    stroke={MEMBER_COLORS[i % MEMBER_COLORS.length]}
                    fill={MEMBER_COLORS[i % MEMBER_COLORS.length]}
                    fillOpacity={0.1}
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

          {/* Individual scores */}
          <div className="space-y-3">
            {grid.members.map((m, i) => {
              const score = memberScore(m);
              const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-xl p-4 border cursor-pointer"
                  onClick={() => setSelectedMember(selectedMember === m.id ? null : m.id)}
                  style={{
                    background: "var(--surface)",
                    borderColor: selectedMember === m.id ? color : "var(--border)",
                    boxShadow: selectedMember === m.id ? `0 0 16px ${color}30` : "none",
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[12px]" style={{ background: `${color}20`, color }}>
                      {m.nom[0]}
                    </div>
                    <div>
                      <div className="font-semibold text-[12px]" style={{ color: "var(--text)" }}>{m.nom}</div>
                      <div className="text-[10px]" style={{ color: "var(--textMuted)" }}>{m.poste}</div>
                    </div>
                    <div className="ml-auto text-[18px] font-bold" style={{ color }}>{score}%</div>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "#2a2e3a" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${score}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: color }}
                    />
                  </div>
                  {/* Category breakdown */}
                  <AnimatePresence>
                    {selectedMember === m.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-3 space-y-1.5"
                        style={{ overflow: "hidden" }}
                      >
                        {categories.map((cat) => {
                          const comps = grid.competences.filter((c) => c.categorie === cat);
                          const maxCat = comps.length * 3;
                          const sumCat = comps.reduce((s, c) => s + (m.ratings[c.id] ?? 0), 0);
                          const pct = maxCat > 0 ? Math.round((sumCat / maxCat) * 100) : 0;
                          const catColor = CAT_COLORS[cat] ?? color;
                          return (
                            <div key={cat} className="flex items-center gap-2">
                              <span className="text-[9px] w-28 shrink-0" style={{ color: "var(--textMuted)" }}>{cat}</span>
                              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "#2a2e3a" }}>
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: catColor }} />
                              </div>
                              <span className="text-[9px] w-6 text-right font-bold" style={{ color: catColor }}>{pct}%</span>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TRAINING NEEDS VIEW ──────────────────────────────── */}
      {view === "besoins" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="p-4 rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-[12px] font-semibold mb-1" style={{ color: "var(--text)" }}>
              Plan de Formation Prioritaire
            </div>
            <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>
              {trainingNeeds.length === 0
                ? "✓ Toutes les compétences sont maîtrisées — Félicitations !"
                : `${trainingNeeds.length} compétences nécessitent une action de formation.`}
            </div>
          </div>

          {trainingNeeds.map((need, i) => {
            const catColor = CAT_COLORS[need.comp.categorie] ?? "#8b8fa3";
            const urgencyColor = need.urgency >= 2 ? "#ff4d6a" : need.urgency >= 1 ? "#ffb347" : "#ffd700";
            return (
              <motion.div
                key={need.comp.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="rounded-xl p-4 border"
                style={{ background: "var(--surface)", borderColor: `${urgencyColor}30` }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="px-2 py-1 rounded-lg text-[10px] font-bold shrink-0"
                    style={{ background: `${urgencyColor}20`, color: urgencyColor }}
                  >
                    {need.urgency >= 2 ? "URGENT" : need.urgency >= 1 ? "PRIORITÉ" : "SUIVI"}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-[13px] mb-0.5" style={{ color: "var(--text)" }}>
                      {need.comp.nom}
                    </div>
                    <div className="text-[10px] mb-2" style={{ color: catColor }}>
                      {need.comp.categorie}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {need.members.map((m, mi) => {
                        const rating = m.ratings[need.comp.id] ?? 0;
                        const rc = RATING_CONFIG[rating];
                        return (
                          <span
                            key={m.id}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium"
                            style={{ background: rc.bg, color: rc.color }}
                          >
                            <span>{rc.symbol}</span>
                            <span>{m.nom}</span>
                            <span style={{ opacity: 0.7 }}>· {rc.label}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>
                      {need.members.length}/{grid.members.length} à former
                    </div>
                    <div className="text-[11px] font-bold mt-0.5" style={{ color: urgencyColor }}>
                      Poly. {compPolyvalence(need.comp.id)}%
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

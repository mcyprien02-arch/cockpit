"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────
type NiveauOp = "gestion" | "securite" | "developpement";
type NiveauCell = 0 | 1 | 2 | 3;

interface Competence {
  id: string;
  nom: string;
  famille: string;
  niveauOp: NiveauOp;
}

interface Collab {
  id: string;
  nom: string;
  poste: string;
}

type Matrix = Record<string, Record<string, NiveauCell>>;

interface CompetencesISEORScreenProps {
  magasinId: string;
}

// ─── Constants ────────────────────────────────────────────────
const OP_COLORS: Record<NiveauOp, string> = {
  gestion:       "#6b8fa3",
  securite:      "#00d4aa",
  developpement: "#a78bfa",
};

const FAMILLES = ["ACHAT", "VENTE", "MERCHANDISING", "DIGITAL", "GESTION"] as const;
type Famille = (typeof FAMILLES)[number];

const COMPETENCES: Competence[] = [
  // ACHAT
  { id: "a1", nom: "Accueil client vendeur",   famille: "ACHAT",         niveauOp: "gestion"       },
  { id: "a2", nom: "Découverte du besoin",      famille: "ACHAT",         niveauOp: "gestion"       },
  { id: "a3", nom: "Connaissance des cotes",    famille: "ACHAT",         niveauOp: "securite"      },
  { id: "a4", nom: "Négociation",               famille: "ACHAT",         niveauOp: "securite"      },
  { id: "a5", nom: "Test produit Picea",        famille: "ACHAT",         niveauOp: "securite"      },
  { id: "a6", nom: "Appel de stock oral",       famille: "ACHAT",         niveauOp: "developpement" },
  { id: "a7", nom: "Saisie enregistrement",     famille: "ACHAT",         niveauOp: "gestion"       },
  { id: "a8", nom: "Embasement",                famille: "ACHAT",         niveauOp: "developpement" },
  // VENTE
  { id: "v1", nom: "Accueil client acheteur",   famille: "VENTE",         niveauOp: "gestion"       },
  { id: "v2", nom: "Conseil orientation",       famille: "VENTE",         niveauOp: "gestion"       },
  { id: "v3", nom: "Argumentation vente",       famille: "VENTE",         niveauOp: "securite"      },
  { id: "v4", nom: "Vente additionnelle TLAC",  famille: "VENTE",         niveauOp: "developpement" },
  { id: "v5", nom: "Conclusion de vente",       famille: "VENTE",         niveauOp: "securite"      },
  { id: "v6", nom: "Encaissement",              famille: "VENTE",         niveauOp: "gestion"       },
  // MERCHANDISING
  { id: "m1", nom: "Tenue du rayon",            famille: "MERCHANDISING", niveauOp: "gestion"       },
  { id: "m2", nom: "Étiquetage",                famille: "MERCHANDISING", niveauOp: "gestion"       },
  { id: "m3", nom: "Mise en avant",             famille: "MERCHANDISING", niveauOp: "developpement" },
  { id: "m4", nom: "Appels de stock visuels",   famille: "MERCHANDISING", niveauOp: "developpement" },
  { id: "m5", nom: "Gestion vieux stock",       famille: "MERCHANDISING", niveauOp: "securite"      },
  // DIGITAL
  { id: "d1", nom: "Fiches produits web",       famille: "DIGITAL",       niveauOp: "gestion"       },
  { id: "d2", nom: "Gestion marketplace",       famille: "DIGITAL",       niveauOp: "securite"      },
  { id: "d3", nom: "Avis Google",               famille: "DIGITAL",       niveauOp: "developpement" },
  { id: "d4", nom: "Réseaux sociaux",           famille: "DIGITAL",       niveauOp: "developpement" },
  // GESTION
  { id: "g1", nom: "Inventaire",                famille: "GESTION",       niveauOp: "securite"      },
  { id: "g2", nom: "Démarque",                  famille: "GESTION",       niveauOp: "securite"      },
  { id: "g3", nom: "Caisse Z",                  famille: "GESTION",       niveauOp: "gestion"       },
  { id: "g4", nom: "Réception stock",           famille: "GESTION",       niveauOp: "gestion"       },
  { id: "g5", nom: "Procédures sécurité",       famille: "GESTION",       niveauOp: "securite"      },
];

const DEFAULT_COLLABS: Collab[] = [
  { id: "c1", nom: "Collaborateur 1", poste: "Vendeur" },
  { id: "c2", nom: "Collaborateur 2", poste: "Vendeur" },
];

const COLLAB_COLORS = ["#00d4aa", "#4da6ff", "#a78bfa", "#ffb347", "#f472b6", "#ff6b6b"];
const NIVEAU_LABELS = ["Non renseigné", "En cours", "Acquis partiel", "Maîtrisé"];

// ─── SVG Skill Cell ───────────────────────────────────────────
function SkillCell({
  niveau,
  niveauOp,
  onCycle,
  compNom,
}: {
  niveau: NiveauCell;
  niveauOp: NiveauOp;
  onCycle: () => void;
  compNom: string;
}) {
  const color = OP_COLORS[niveauOp];
  const [hovered, setHovered] = useState(false);

  const renderSVG = () => {
    if (niveau === 0) {
      return (
        <svg width="22" height="22" viewBox="0 0 22 22">
          <rect x="1" y="1" width="20" height="20" rx="2"
            fill="none" stroke="#4a5568" strokeWidth="1.5"
            strokeDasharray="4 2" />
          <line x1="4" y1="11" x2="18" y2="11" stroke="#4a5568" strokeWidth="1.5" />
        </svg>
      );
    }
    if (niveau === 1) {
      return (
        <svg width="22" height="22" viewBox="0 0 22 22">
          <rect x="1" y="1" width="20" height="20" rx="2"
            fill="none" stroke={color} strokeWidth="1.5" />
        </svg>
      );
    }
    if (niveau === 2) {
      return (
        <svg width="22" height="22" viewBox="0 0 22 22">
          <rect x="1" y="1" width="20" height="20" rx="2"
            fill="none" stroke={color} strokeWidth="1.5" />
          <rect x="2" y="11" width="18" height="9" rx="0"
            fill={color} opacity="0.85" />
        </svg>
      );
    }
    return (
      <svg width="22" height="22" viewBox="0 0 22 22">
        <rect x="1" y="1" width="20" height="20" rx="2"
          fill={color} stroke={color} strokeWidth="1.5" />
        <polyline points="6,11 9.5,14.5 16,8"
          fill="none" stroke="white" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  return (
    <div className="relative inline-flex">
      <button
        onClick={onCycle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex items-center justify-center transition-transform hover:scale-110 focus:outline-none"
        style={{ cursor: "pointer", background: "transparent", border: "none", padding: 4 }}
        title={`${compNom} — ${NIVEAU_LABELS[niveau]}`}
      >
        {renderSVG()}
      </button>
      {hovered && compNom && (
        <div
          className="absolute z-50 rounded-lg px-3 py-2 text-[11px] font-medium whitespace-nowrap pointer-events-none"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ color: "var(--text)" }}>{compNom}</div>
          <div style={{ color }}>{NIVEAU_LABELS[niveau]}</div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export function CompetencesISEORScreen({ magasinId }: CompetencesISEORScreenProps) {
  const [collabs, setCollabs]                   = useState<Collab[]>(DEFAULT_COLLABS);
  const [matrix, setMatrix]                     = useState<Matrix>({});
  const [view, setView]                         = useState<"grille" | "radar">("grille");
  const [simulerAbsenceId, setSimulerAbsenceId] = useState<string>("");
  const [newCollabNom, setNewCollabNom]         = useState("");
  const [showAddCollab, setShowAddCollab]       = useState(false);

  // ── Persist / load ──────────────────────────────────────────
  useEffect(() => {
    try {
      const savedCollabs = localStorage.getItem(`iseor_collabs_${magasinId}`);
      const savedMatrix  = localStorage.getItem(`iseor_matrix_${magasinId}`);
      if (savedCollabs) setCollabs(JSON.parse(savedCollabs));
      if (savedMatrix)  setMatrix(JSON.parse(savedMatrix));
    } catch { /* ignore */ }
  }, [magasinId]);

  useEffect(() => {
    localStorage.setItem(`iseor_collabs_${magasinId}`, JSON.stringify(collabs));
  }, [collabs, magasinId]);

  useEffect(() => {
    localStorage.setItem(`iseor_matrix_${magasinId}`, JSON.stringify(matrix));
  }, [matrix, magasinId]);

  // ── Cycle niveau (callback form avoids stale closure) ───────
  const cycleNiveau = useCallback((collabId: string, compId: string) => {
    setMatrix(prev => {
      const current = (prev[collabId]?.[compId] ?? 0) as NiveauCell;
      const next = ((current + 1) % 4) as NiveauCell;
      return {
        ...prev,
        [collabId]: { ...(prev[collabId] ?? {}), [compId]: next },
      };
    });
  }, []);

  // ── Stats ────────────────────────────────────────────────────
  const totalCells  = collabs.length * COMPETENCES.length;
  const filledCells = collabs.reduce((acc, c) =>
    acc + COMPETENCES.filter(comp => (matrix[c.id]?.[comp.id] ?? 0) > 0).length, 0);
  const pctRenseigne = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;

  const securiteComps   = COMPETENCES.filter(c => c.niveauOp === "securite");
  const alertesCritiques = securiteComps.filter(comp =>
    collabs.filter(c => (matrix[c.id]?.[comp.id] ?? 0) === 3).length <= 1
  );
  const besoinFormation  = securiteComps.filter(comp =>
    collabs.filter(c => (matrix[c.id]?.[comp.id] ?? 0) >= 2).length < 2
  );
  const collabsEnAlerte  = collabs.filter(c => {
    const nb0 = COMPETENCES.filter(comp => (matrix[c.id]?.[comp.id] ?? 0) === 0).length;
    return nb0 / COMPETENCES.length > 0.5;
  });

  const getScore = (collabId: string) => {
    const total = COMPETENCES.length * 3;
    const sum   = COMPETENCES.reduce((acc, comp) => acc + (matrix[collabId]?.[comp.id] ?? 0), 0);
    return total > 0 ? Math.round((sum / total) * 100) : 0;
  };

  // ── Scénario absence ────────────────────────────────────────
  const absenceCritical = new Set<string>();
  if (simulerAbsenceId) {
    COMPETENCES.forEach(comp => {
      const myLevel = matrix[simulerAbsenceId]?.[comp.id] ?? 0;
      if (myLevel === 3) {
        const othersOk = collabs
          .filter(c => c.id !== simulerAbsenceId)
          .some(c => (matrix[c.id]?.[comp.id] ?? 0) >= 2);
        if (!othersOk) absenceCritical.add(comp.id);
      }
    });
  }

  // ── Add/Remove collab ────────────────────────────────────────
  const addCollab = () => {
    if (!newCollabNom.trim()) return;
    const newC: Collab = { id: `c${Date.now()}`, nom: newCollabNom.trim(), poste: "Vendeur" };
    setCollabs(prev => [...prev, newC]);
    setNewCollabNom("");
    setShowAddCollab(false);
  };

  const removeCollab = (id: string) => {
    setCollabs(prev => prev.filter(c => c.id !== id));
    setMatrix(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
  };

  // ── Radar / bar data ────────────────────────────────────────
  const radarData = FAMILLES.map(famille => {
    const comps = COMPETENCES.filter(c => c.famille === famille);
    const entry: Record<string, string | number> = { famille };
    collabs.forEach(c => {
      const sum = comps.reduce((acc, comp) => acc + (matrix[c.id]?.[comp.id] ?? 0), 0);
      entry[c.nom] = comps.length > 0 ? Math.round((sum / (comps.length * 3)) * 100) : 0;
    });
    return entry;
  });

  const barData = FAMILLES.map(famille => {
    const comps = COMPETENCES.filter(c => c.famille === famille);
    const entry: Record<string, string | number> = { name: famille };
    collabs.forEach(c => {
      const sum = comps.reduce((acc, comp) => acc + (matrix[c.id]?.[comp.id] ?? 0), 0);
      entry[c.nom] = comps.length > 0 ? Math.round((sum / (comps.length * 3)) * 100) : 0;
    });
    return entry;
  });

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Collaborateurs",   value: collabs.length,            color: "#4da6ff", icon: "👥" },
          { label: "Alertes critiques", value: alertesCritiques.length,  color: "#ff4d6a", icon: "🚨" },
          { label: "Besoins formation", value: besoinFormation.length,   color: "#ffb347", icon: "📚" },
          { label: "% Renseigné",       value: `${pctRenseigne}%`,       color: "#00d4aa", icon: "✅" },
        ].map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="rounded-2xl p-4 border"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[18px]">{card.icon}</span>
              <span className="text-[11px]" style={{ color: "var(--textMuted)" }}>{card.label}</span>
            </div>
            <div className="text-[26px] font-bold" style={{ color: card.color }}>{card.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Alert banners */}
      <AnimatePresence>
        {alertesCritiques.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl p-4 text-[13px] font-medium"
            style={{ background: "#ff4d6a15", border: "1px solid #ff4d6a40", color: "#ff4d6a" }}
          >
            🚨 <strong>{alertesCritiques.length} compétence(s) sécurité</strong> avec ≤1 personne maîtrisée :{" "}
            {alertesCritiques.slice(0, 5).map(c => c.nom).join(", ")}{alertesCritiques.length > 5 ? "…" : ""}
          </motion.div>
        )}
        {collabsEnAlerte.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl p-4 text-[13px] font-medium"
            style={{ background: "#ffb34715", border: "1px solid #ffb34740", color: "#ffb347" }}
          >
            ⚠ <strong>{collabsEnAlerte.map(c => c.nom).join(", ")}</strong> — plus de 50% des compétences non renseignées
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View toggle */}
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          {(["grille", "radar"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-4 py-2 text-[12px] font-semibold transition-colors"
              style={{
                background: view === v ? "var(--accent)" : "var(--surface)",
                color: view === v ? "#000" : "var(--textMuted)",
                fontFamily: "inherit",
                cursor: "pointer",
                border: "none",
              }}
            >
              {v === "grille" ? "📋 Grille" : "📡 Radar"}
            </button>
          ))}
        </div>

        {/* Simuler absence */}
        <select
          value={simulerAbsenceId}
          onChange={e => setSimulerAbsenceId(e.target.value)}
          className="rounded-xl px-3 py-2 text-[12px] border"
          style={{
            background: simulerAbsenceId ? "#ff4d6a15" : "var(--surface)",
            borderColor: simulerAbsenceId ? "#ff4d6a60" : "var(--border)",
            color: simulerAbsenceId ? "#ff4d6a" : "var(--textMuted)",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          <option value="">👁 Simuler absence…</option>
          {collabs.map(c => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>

        {/* Add collab */}
        <button
          onClick={() => setShowAddCollab(v => !v)}
          className="rounded-xl px-4 py-2 text-[12px] font-semibold"
          style={{ background: "var(--accent)", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          + Collaborateur
        </button>

        {showAddCollab && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex gap-2">
            <input
              autoFocus
              value={newCollabNom}
              onChange={e => setNewCollabNom(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCollab()}
              placeholder="Prénom Nom"
              className="rounded-xl px-3 py-2 text-[12px] border"
              style={{
                background: "var(--surfaceAlt)", borderColor: "var(--border)",
                color: "var(--text)", fontFamily: "inherit", outline: "none",
              }}
            />
            <button
              onClick={addCollab}
              className="rounded-xl px-3 py-2 text-[12px] font-semibold"
              style={{ background: "#00d4aa30", color: "#00d4aa", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            >
              ✓
            </button>
          </motion.div>
        )}
      </div>

      {/* Absence scenario banner */}
      {simulerAbsenceId && absenceCritical.size > 0 && (
        <div
          className="rounded-xl p-4 text-[13px]"
          style={{ background: "#ff4d6a10", border: "1px solid #ff4d6a50" }}
        >
          <span style={{ color: "#ff4d6a", fontWeight: 700 }}>
            ⛔ En cas d&apos;absence de {collabs.find(c => c.id === simulerAbsenceId)?.nom} :
          </span>
          <span style={{ color: "var(--textMuted)" }} className="ml-2">
            {absenceCritical.size} compétence(s) sans backup —{" "}
            {Array.from(absenceCritical).map(id => COMPETENCES.find(c => c.id === id)?.nom).join(", ")}
          </span>
        </div>
      )}

      {/* Views */}
      <AnimatePresence mode="wait">
        {view === "grille" ? (
          <motion.div key="grille" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 600 }}>
                  <thead>
                    <tr style={{ background: "var(--surfaceAlt)", borderBottom: "1px solid var(--border)" }}>
                      <th
                        className="text-left px-4 py-3 text-[11px] font-semibold sticky left-0 z-10"
                        style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)", minWidth: 200 }}
                      >
                        Compétence
                      </th>
                      {collabs.map((c, ci) => (
                        <th
                          key={c.id}
                          className="px-3 py-3 text-center text-[11px] font-semibold group"
                          style={{ color: COLLAB_COLORS[ci % COLLAB_COLORS.length], minWidth: 88 }}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span>{c.nom}</span>
                            <span className="text-[10px] font-normal" style={{ color: "var(--textDim)" }}>
                              {getScore(c.id)}%
                            </span>
                            <button
                              onClick={() => removeCollab(c.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                background: "#ff4d6a20", color: "#ff4d6a",
                                border: "none", cursor: "pointer", fontFamily: "inherit",
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FAMILLES.map(famille => {
                      const comps = COMPETENCES.filter(c => c.famille === famille);
                      return (
                        <>
                          <tr key={`fam-${famille}`}>
                            <td
                              colSpan={collabs.length + 1}
                              className="px-4 py-2 text-[11px] font-bold tracking-wider uppercase sticky left-0"
                              style={{
                                background: "var(--bg)", color: "var(--textDim)",
                                borderTop: "1px solid var(--border)",
                                borderBottom: "1px solid var(--border)",
                              }}
                            >
                              {famille}
                            </td>
                          </tr>
                          {comps.map((comp, rowIdx) => {
                            const isCritical = absenceCritical.has(comp.id);
                            const rowBg = isCritical
                              ? "#ff4d6a08"
                              : rowIdx % 2 === 0 ? "var(--surface)" : "var(--surfaceAlt)";
                            return (
                              <tr
                                key={comp.id}
                                style={{ background: rowBg, borderBottom: "1px solid var(--border)" }}
                              >
                                <td
                                  className="px-4 py-2 text-[12px] sticky left-0 z-10"
                                  style={{ color: isCritical ? "#ff4d6a" : "var(--text)", background: rowBg, minWidth: 200 }}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full shrink-0"
                                      style={{ background: OP_COLORS[comp.niveauOp] }} />
                                    {comp.nom}
                                    {isCritical && <span className="text-[10px]">⛔</span>}
                                  </div>
                                </td>
                                {collabs.map(c => (
                                  <td key={c.id} className="px-3 py-2 text-center">
                                    <SkillCell
                                      niveau={matrix[c.id]?.[comp.id] ?? 0}
                                      niveauOp={comp.niveauOp}
                                      compNom={comp.nom}
                                      onCycle={() => cycleNiveau(c.id, comp.id)}
                                    />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="radar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="text-[13px] font-semibold mb-4" style={{ color: "var(--text)" }}>
                Radar équipe — par famille (%)
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="famille" tick={{ fill: "var(--textMuted)", fontSize: 11 }} />
                  {collabs.map((c, ci) => (
                    <Radar
                      key={c.id}
                      name={c.nom}
                      dataKey={c.nom}
                      stroke={COLLAB_COLORS[ci % COLLAB_COLORS.length]}
                      fill={COLLAB_COLORS[ci % COLLAB_COLORS.length]}
                      fillOpacity={0.12}
                      dot={false}
                    />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11, color: "var(--textMuted)" }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 8, color: "var(--text)", fontSize: 12,
                    }}
                    formatter={(v: number | string) => [`${v}%`]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="text-[13px] font-semibold mb-4" style={{ color: "var(--text)" }}>
                Score par famille et par collaborateur (%)
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} barGap={4}>
                  <XAxis dataKey="name" tick={{ fill: "var(--textMuted)", fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "var(--textMuted)", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 8, color: "var(--text)", fontSize: 12,
                    }}
                    formatter={(v: number | string) => [`${v}%`]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "var(--textMuted)" }} />
                  {collabs.map((c, ci) => (
                    <Bar key={c.id} dataKey={c.nom} fill={COLLAB_COLORS[ci % COLLAB_COLORS.length]} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Légende */}
      <div className="rounded-2xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--textMuted)" }}>Légende</div>
        <div className="flex flex-wrap gap-8">
          <div>
            <div className="text-[11px] font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--textDim)" }}>
              4 états
            </div>
            <div className="flex flex-col gap-2">
              {([0, 1, 2, 3] as NiveauCell[]).map(n => (
                <div key={n} className="flex items-center gap-2">
                  <SkillCell niveau={n} niveauOp="gestion" compNom="" onCycle={() => {}} />
                  <span className="text-[12px]" style={{ color: "var(--textMuted)" }}>{NIVEAU_LABELS[n]}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--textDim)" }}>
              Niveaux opérationnels
            </div>
            <div className="flex flex-col gap-2">
              {(Object.entries(OP_COLORS) as [NiveauOp, string][]).map(([op, color]) => (
                <div key={op} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                  <span className="text-[12px]" style={{ color: "var(--textMuted)" }}>
                    {op.charAt(0).toUpperCase() + op.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

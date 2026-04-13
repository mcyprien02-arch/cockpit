"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { getStatus } from "@/lib/scoring";
import type { ValeurAvecIndicateur } from "@/types";

// ─── ISEOR 5-level mastery ─────────────────────────────────────
const LEVELS = [
  { key: "■", label: "Maîtrise courante",       color: "#fff",    bg: "#1a1d27", border: "#1a1d27" },
  { key: "▧", label: "Pratique occasionnelle",   color: "#ffb347", bg: "#ffb34725", border: "#ffb347" },
  { key: "□", label: "Connaissance théorique",   color: "#4da6ff", bg: "#4da6ff18", border: "#4da6ff" },
  { key: "—", label: "Ni connaissance ni pratique", color: "#555a6e", bg: "var(--surfaceAlt)", border: "var(--border)" },
  { key: "○", label: "Objectif de formation",    color: "#00d4aa", bg: "#00d4aa18", border: "#00d4aa" },
];

// ─── Default operations by category ──────────────────────────
const DEFAULT_OPERATIONS: Record<string, string[]> = {
  "GESTION": [
    "Caisse et encaissements",
    "Mise en rayon et présentation",
    "Réception de marchandise",
    "Étiquetage et mise à prix",
    "SAV client",
    "Gestion des achats (rachat)",
    "Clôture de caisse et réconciliation",
    "Gestion des retours / échanges",
  ],
  "SÉCURITÉ": [
    "Inventaire",
    "Contrôle qualité produits",
    "Test produit (Picea, diagnostics)",
    "Gestion coffre et fond de caisse",
    "Ouverture / Fermeture magasin",
    "Gestion des accès et alarme",
    "Authentification anti-contrefaçon",
    "Gestion des anomalies caisse",
  ],
  "DÉVELOPPEMENT": [
    "Vente additionnelle Estaly",
    "Merchandising vitrine",
    "EC.fr et marketplaces",
    "Coaching vente équipe",
    "Accélération stock âgé",
    "Animation top 20 produits",
    "Fidélisation client (rattachement)",
    "Reporting et analyse KPIs",
  ],
};

const CAT_COLORS: Record<string, string> = {
  "GESTION": "#4da6ff",
  "SÉCURITÉ": "#ff4d6a",
  "DÉVELOPPEMENT": "#00d4aa",
};

// ─── Persistence key ──────────────────────────────────────────
function storageKey(magasinId: string) {
  return `competences_${magasinId}`;
}

interface CompetencesData {
  members: string[];
  grid: Record<string, Record<string, string>>;
  operations: Record<string, string[]>;
}

function defaultData(): CompetencesData {
  const grid: Record<string, Record<string, string>> = {};
  Object.entries(DEFAULT_OPERATIONS).forEach(([cat, ops]) => {
    ops.forEach((op) => {
      grid[`${cat}::${op}`] = {};
    });
  });
  return { members: ["Collaborateur 1"], grid, operations: DEFAULT_OPERATIONS };
}

// ─── Cell component ───────────────────────────────────────────
function Cell({ value, onClick }: { value: string; onClick: () => void }) {
  const level = LEVELS.find((l) => l.key === value) ?? LEVELS[3];
  return (
    <button
      onClick={onClick}
      title={level.label}
      style={{
        width: 36, height: 36,
        background: level.bg,
        border: `2px solid ${level.border}`,
        borderRadius: 6,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 16,
        color: level.color,
        fontWeight: "bold",
        transition: "all 0.15s",
        fontFamily: "inherit",
      }}
    >
      {value}
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────
export function CompetencesScreen({ magasinId }: { magasinId: string }) {
  const [data, setData] = useState<CompetencesData>(defaultData());
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [newMember, setNewMember] = useState("");
  const [newOp, setNewOp] = useState({ cat: "GESTION", label: "" });
  const [showLegend, setShowLegend] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(magasinId));
      if (raw) setData(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [magasinId]);

  // Load KPIs for CHVACV
  useEffect(() => {
    if (!magasinId) return;
    supabase.from("v_dernieres_valeurs").select("*").eq("magasin_id", magasinId).then(({ data: vData }) => {
      type VRow = {
        magasin_id: string; indicateur_id: string; valeur: number; date_saisie: string;
        indicateur_nom: string; unite: string | null; direction: "up" | "down";
        seuil_ok: number | null; seuil_vigilance: number | null; categorie: string;
        poids: number; action_defaut: string | null; magasin_nom: string;
      };
      setValeurs(((vData ?? []) as VRow[]).map((r) => ({
        ...r,
        status: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
      })));
    });
  }, [magasinId]);

  // Compute CHVACV
  const chvacv = (() => {
    const get = (p: string) => valeurs.find(v => v.indicateur_nom?.toLowerCase().includes(p.toLowerCase()))?.valeur;
    const direct = get("chvacv") ?? get("chva");
    if (direct && direct > 0) return direct;
    const caMensuel = get("ca") ?? get("chiffre");
    const caAnnuel = caMensuel ? caMensuel * 12 : null;
    const margePct = get("marge nette") ?? get("taux de marge") ?? 38;
    const nbEtp = get("nb etp") ?? get("etp") ?? 4;
    if (!caAnnuel) return 40; // default fallback
    const va = caAnnuel * (margePct / 100);
    return Math.round(va / ((nbEtp || 4) * 1600));
  })();

  const save = useCallback((d: CompetencesData) => {
    setData(d);
    try { localStorage.setItem(storageKey(magasinId), JSON.stringify(d)); } catch { /* ignore */ }
  }, [magasinId]);

  const cycleCell = (opKey: string, member: string) => {
    const current = data.grid[opKey]?.[member] ?? "—";
    const idx = LEVELS.findIndex((l) => l.key === current);
    const next = LEVELS[(idx + 1) % LEVELS.length].key;
    const newGrid = {
      ...data.grid,
      [opKey]: { ...data.grid[opKey], [member]: next },
    };
    save({ ...data, grid: newGrid });
  };

  const addMember = () => {
    const name = newMember.trim();
    if (!name || data.members.includes(name)) return;
    save({ ...data, members: [...data.members, name] });
    setNewMember("");
  };

  const removeMember = (m: string) => {
    const newGrid = Object.fromEntries(
      Object.entries(data.grid).map(([k, v]) => {
        const { [m]: _, ...rest } = v;
        return [k, rest];
      })
    );
    save({ ...data, members: data.members.filter((x) => x !== m), grid: newGrid });
  };

  const addOperation = () => {
    const label = newOp.label.trim();
    if (!label) return;
    const cat = newOp.cat;
    const existing = data.operations[cat] ?? [];
    if (existing.includes(label)) return;
    const opKey = `${cat}::${label}`;
    save({
      ...data,
      operations: { ...data.operations, [cat]: [...existing, label] },
      grid: { ...data.grid, [opKey]: {} },
    });
    setNewOp((p) => ({ ...p, label: "" }));
  };

  // ─── Computed alerts ────────────────────────────────────────
  const alerts: string[] = [];
  const allOps = Object.entries(data.operations).flatMap(([cat, ops]) => ops.map((op) => ({ cat, op })));

  allOps.forEach(({ cat, op }) => {
    const opKey = `${cat}::${op}`;
    const masters = data.members.filter((m) => data.grid[opKey]?.[m] === "■");
    if (masters.length === 1) {
      alerts.push(`⚠ "${op}" maîtrisée par ${masters[0]} uniquement — risque de dépendance`);
    }
    if (masters.length === 0 && cat === "SÉCURITÉ") {
      alerts.push(`🚨 "${op}" (Sécurité) : aucun maître — risque critique`);
    }
  });

  data.members.forEach((m) => {
    const devOps = (data.operations["DÉVELOPPEMENT"] ?? []);
    const devMastered = devOps.filter((op) => {
      const key = `DÉVELOPPEMENT::${op}`;
      return data.grid[key]?.[m] === "■" || data.grid[key]?.[m] === "▧";
    });
    if (devMastered.length === 0) {
      alerts.push(`📚 ${m} : aucune compétence développement — besoin formation`);
    }
    // Cost of absence
    const critOps = (data.operations["SÉCURITÉ"] ?? []).filter((op) => {
      const key = `SÉCURITÉ::${op}`;
      return data.grid[key]?.[m] === "■";
    });
    if (critOps.length >= 3) {
      const cout = Math.round(critOps.length * chvacv * 35);
      alerts.push(`💸 Si ${m} absent(e) 1 semaine : ~${cout.toLocaleString("fr-FR")}€ de coûts cachés (${critOps.length} ops critiques × ${chvacv}€/h × 35h)`);
    }
  });

  // ─── Summary per person ─────────────────────────────────────
  const personSummary = data.members.map((m) => {
    const total = allOps.length;
    const mastered = allOps.filter(({ cat, op }) => data.grid[`${cat}::${op}`]?.[m] === "■").length;
    const objective = allOps.filter(({ cat, op }) => data.grid[`${cat}::${op}`]?.[m] === "○").length;
    return { member: m, mastered, total, objective };
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[15px] font-bold" style={{ color: "var(--text)" }}>Grille de Compétences MSE</div>
          <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>
            Synoptique ISEOR — Manuel Mariposa O7 · CHVACV estimé : <strong style={{ color: "var(--accent)" }}>{chvacv}€/h</strong>
          </div>
        </div>
        <button
          onClick={() => setShowLegend((v) => !v)}
          className="rounded-xl px-3 py-1.5 text-[11px] font-medium"
          style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit" }}
        >
          {showLegend ? "Masquer" : "Afficher"} légende
        </button>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="rounded-xl p-4 border flex flex-wrap gap-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {LEVELS.map((l) => (
            <div key={l.key} className="flex items-center gap-2">
              <span style={{ width: 28, height: 28, background: l.bg, border: `2px solid ${l.border}`, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", color: l.color, fontWeight: "bold", fontSize: 14 }}>{l.key}</span>
              <span className="text-[11px]" style={{ color: "var(--textMuted)" }}>{l.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="rounded-xl p-4 border space-y-1.5" style={{ background: "#ff4d6a08", borderColor: "#ff4d6a30" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#ff4d6a" }}>Alertes automatiques</div>
          {alerts.slice(0, 6).map((a, i) => (
            <div key={i} className="text-[12px]" style={{ color: "var(--text)" }}>{a}</div>
          ))}
        </div>
      )}

      {/* Add member */}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={newMember}
          onChange={(e) => setNewMember(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addMember(); }}
          placeholder="Ajouter un collaborateur…"
          className="rounded-lg px-3 py-2 text-[12px] border"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)", fontFamily: "inherit", width: 220 }}
        />
        <button
          onClick={addMember}
          className="rounded-lg px-3 py-2 text-[12px] font-semibold"
          style={{ background: "var(--accent)", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          + Ajouter
        </button>
      </div>

      {/* Grid */}
      <div className="rounded-2xl border overflow-auto" style={{ borderColor: "var(--border)", maxHeight: "70vh" }}>
        <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
            <tr style={{ background: "var(--surface)" }}>
              <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--textMuted)", minWidth: 220, borderBottom: "1px solid var(--border)" }}>
                Opération
              </th>
              {data.members.map((m) => (
                <th key={m} className="px-2 py-3 text-[11px] font-semibold" style={{ color: "var(--text)", minWidth: 80, borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                  <div className="flex flex-col items-center gap-1">
                    <span>{m}</span>
                    <button
                      onClick={() => removeMember(m)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#ff4d6a", fontSize: 11, fontFamily: "inherit" }}
                    >✕</button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.operations).map(([cat, ops]) => (
              <>
                {/* Category header row */}
                <tr key={`cat-${cat}`} style={{ background: `${CAT_COLORS[cat]}15` }}>
                  <td
                    colSpan={data.members.length + 1}
                    className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: CAT_COLORS[cat], borderTop: `2px solid ${CAT_COLORS[cat]}40`, borderBottom: `1px solid ${CAT_COLORS[cat]}30` }}
                  >
                    {cat === "GESTION" ? "📋 Opérations de Gestion" : cat === "SÉCURITÉ" ? "🔒 Opérations de Sécurité" : "🚀 Opérations de Développement"}
                  </td>
                </tr>
                {ops.map((op, oi) => {
                  const opKey = `${cat}::${op}`;
                  const masters = data.members.filter((m) => data.grid[opKey]?.[m] === "■").length;
                  const isCritical = cat === "SÉCURITÉ" && masters <= 1;
                  return (
                    <motion.tr
                      key={opKey}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: oi * 0.02 }}
                      style={{
                        background: isCritical ? "#ff4d6a06" : oi % 2 === 0 ? "var(--surfaceAlt)" : "var(--surface)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <td className="px-4 py-2" style={{ color: isCritical ? "#ff4d6a" : "var(--text)", fontSize: 12 }}>
                        {op}
                        {isCritical && masters === 0 && <span className="ml-2 text-[10px] font-bold" style={{ color: "#ff4d6a" }}>⚠ AUCUN MAÎTRE</span>}
                        {isCritical && masters === 1 && <span className="ml-2 text-[10px]" style={{ color: "#ffb347" }}>⚠ 1 seul</span>}
                      </td>
                      {data.members.map((m) => (
                        <td key={m} className="px-2 py-2" style={{ textAlign: "center" }}>
                          <Cell
                            value={data.grid[opKey]?.[m] ?? "—"}
                            onClick={() => cycleCell(opKey, m)}
                          />
                        </td>
                      ))}
                    </motion.tr>
                  );
                })}
                {/* Add operation row for this category */}
                <tr key={`add-${cat}`} style={{ background: "transparent", borderBottom: `1px solid ${CAT_COLORS[cat]}20` }}>
                  <td colSpan={data.members.length + 1} className="px-4 py-1">
                    {newOp.cat === cat ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newOp.label}
                          onChange={(e) => setNewOp((p) => ({ ...p, label: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") addOperation(); }}
                          placeholder="Nouvelle opération…"
                          className="rounded px-2 py-1 text-[11px] border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)", fontFamily: "inherit", width: 200 }}
                          autoFocus
                        />
                        <button onClick={addOperation} style={{ background: "none", border: "none", cursor: "pointer", color: CAT_COLORS[cat], fontSize: 12, fontFamily: "inherit" }}>✓ Ajouter</button>
                        <button onClick={() => setNewOp((p) => ({ ...p, label: "" }))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--textMuted)", fontSize: 12, fontFamily: "inherit" }}>Annuler</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setNewOp({ cat, label: "" })}
                        className="text-[10px]"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--textDim)", fontFamily: "inherit" }}
                      >
                        + Ajouter une opération {cat.toLowerCase()}
                      </button>
                    )}
                  </td>
                </tr>
              </>
            ))}
          </tbody>
          {/* Summary footer */}
          <tfoot style={{ position: "sticky", bottom: 0 }}>
            <tr style={{ background: "var(--surface)", borderTop: "2px solid var(--border)" }}>
              <td className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--textMuted)" }}>
                Score compétences
              </td>
              {personSummary.map((ps) => (
                <td key={ps.member} className="px-2 py-2 text-center">
                  <div className="text-[14px] font-bold" style={{ color: ps.mastered / ps.total >= 0.6 ? "#00d4aa" : ps.mastered / ps.total >= 0.4 ? "#ffb347" : "#ff4d6a" }}>
                    {ps.mastered}/{ps.total}
                  </div>
                  {ps.objective > 0 && (
                    <div className="text-[9px]" style={{ color: "#00d4aa" }}>{ps.objective} obj.</div>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        {personSummary.map((ps) => {
          const pct = ps.total > 0 ? Math.round((ps.mastered / ps.total) * 100) : 0;
          const color = pct >= 60 ? "#00d4aa" : pct >= 40 ? "#ffb347" : "#ff4d6a";
          return (
            <div key={ps.member} className="rounded-xl p-3 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="text-[12px] font-semibold mb-1" style={{ color: "var(--text)" }}>{ps.member}</div>
              <div className="text-[20px] font-bold" style={{ color }}>{pct}%</div>
              <div className="text-[10px]" style={{ color: "var(--textMuted)" }}>{ps.mastered} / {ps.total} opérations maîtrisées</div>
              {ps.objective > 0 && (
                <div className="text-[10px] mt-1" style={{ color: "#00d4aa" }}>🎯 {ps.objective} en objectif</div>
              )}
              {(() => {
                const cost = chvacv;
                const critOps = Object.entries(data.operations["SÉCURITÉ"] ?? {}).filter(([, op]) =>
                  typeof op === "string" && data.grid[`SÉCURITÉ::${op}`]?.[ps.member] === "■"
                ).length;
                if (critOps === 0) return null;
                return (
                  <div className="text-[10px] mt-1" style={{ color: "#ffb347" }}>
                    Absence 1 sem. ≈ {Math.round(critOps * cost * 35).toLocaleString("fr-FR")}€
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

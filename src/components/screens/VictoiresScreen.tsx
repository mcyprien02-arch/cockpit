"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

interface Victoire {
  id: string;
  titre: string;
  description?: string;
  date: string;
  type: "kpi" | "pap" | "manuelle";
  icone: string;
}

// ─── localStorage helpers ─────────────────────────────────────
function loadVictoiresLocal(magasinId: string): Victoire[] {
  try {
    const raw = localStorage.getItem(`victoires_${magasinId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveVictoiresLocal(magasinId: string, v: Victoire[]) {
  try { localStorage.setItem(`victoires_${magasinId}`, JSON.stringify(v)); } catch { /* ignore */ }
}

// ─── KPI helpers ──────────────────────────────────────────────
const KPI_LABELS: Record<string, string> = {
  marge_brute: "Marge brute",
  ca_mensuel: "CA mensuel",
  tlac: "TLAC",
  gmroi: "GMROI",
  nb_achats: "Nb achats",
  panier_moyen: "Panier moyen",
};

function detectKPIVictories(valeurs: any[]): Victoire[] {
  const byKpi: Record<string, any[]> = {};
  for (const v of valeurs) {
    if (!byKpi[v.kpi_id]) byKpi[v.kpi_id] = [];
    byKpi[v.kpi_id].push(v);
  }

  const victories: Victoire[] = [];
  for (const [kpiId, rows] of Object.entries(byKpi)) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = rows[0];
    const prev = rows[1];
    if (latest.valeur > prev.valeur * 1.05) {
      const label = KPI_LABELS[kpiId] ?? kpiId;
      const pct = Math.round(((latest.valeur - prev.valeur) / prev.valeur) * 100);
      victories.push({
        id: `kpi_${kpiId}_${latest.date}`,
        titre: `${label} en hausse de ${pct}%`,
        description: `Passé de ${prev.valeur.toFixed(1)} à ${latest.valeur.toFixed(1)}`,
        date: latest.date,
        type: "kpi",
        icone: "📈",
      });
    }
  }
  return victories;
}

// ─── Main Component ───────────────────────────────────────────
interface VictoiresScreenProps {
  magasinId: string;
}

export function VictoiresScreen({ magasinId }: VictoiresScreenProps) {
  const [victoires, setVictoires] = useState<Victoire[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTitre, setNewTitre] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [celebrating, setCelebrating] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!magasinId) { setLoading(false); return; }

    const local = loadVictoiresLocal(magasinId);
    const allIds = new Set(local.map(v => v.id));
    const allVictoires: Victoire[] = [...local];

    // Load from Supabase
    try {
      const { data: valeurs } = await (supabase as any)
        .from("valeurs_kpi")
        .select("kpi_id, valeur, date")
        .eq("magasin_id", magasinId)
        .order("date", { ascending: false })
        .limit(200);

      if (valeurs && valeurs.length > 0) {
        const kpiVics = detectKPIVictories(valeurs);
        for (const v of kpiVics) {
          if (!allIds.has(v.id)) {
            allIds.add(v.id);
            allVictoires.push(v);
          }
        }
      }

      // PAP completed actions
      const { data: papDone } = await (supabase as any)
        .from("plans_action")
        .select("id, titre, updated_at")
        .eq("magasin_id", magasinId)
        .eq("statut", "done")
        .order("updated_at", { ascending: false })
        .limit(10);

      if (papDone) {
        for (const p of papDone) {
          const id = `pap_${p.id}`;
          if (!allIds.has(id)) {
            allIds.add(id);
            allVictoires.push({
              id,
              titre: `PAP accompli : ${p.titre}`,
              description: "Action du plan d'action marquée comme terminée",
              date: p.updated_at?.split("T")[0] ?? new Date().toISOString().split("T")[0],
              type: "pap",
              icone: "✅",
            });
          }
        }
      }
    } catch { /* ignore Supabase errors */ }

    // Sort by date desc
    allVictoires.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setVictoires(allVictoires);
    setLoading(false);
  }, [magasinId]);

  useEffect(() => { loadData(); }, [loadData]);

  const addVictoire = () => {
    if (!newTitre.trim()) return;
    const v: Victoire = {
      id: `manual_${Date.now()}`,
      titre: newTitre.trim(),
      description: newDesc.trim() || undefined,
      date: new Date().toISOString().split("T")[0],
      type: "manuelle",
      icone: "🏆",
    };
    const updated = [v, ...victoires];
    setVictoires(updated);
    saveVictoiresLocal(magasinId, updated.filter(x => x.type === "manuelle"));
    setNewTitre("");
    setNewDesc("");
    setShowForm(false);
    setCelebrating(v.id);
    setTimeout(() => setCelebrating(null), 2000);
  };

  const typeColors: Record<string, string> = {
    kpi: "#00d4aa",
    pap: "#6b8fa3",
    manuelle: "#a78bfa",
  };

  const typeLabels: Record<string, string> = {
    kpi: "KPI",
    pap: "PAP",
    manuelle: "Victoire",
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[900px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[18px] font-bold" style={{ color: "var(--text)" }}>
            🏆 Mur des victoires
          </h2>
          <p className="text-[13px] mt-1" style={{ color: "var(--textMuted)" }}>
            {victoires.length} victoire{victoires.length !== 1 ? "s" : ""} enregistrée{victoires.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="rounded-xl px-4 py-2.5 text-[12px] font-bold transition-all"
          style={{
            background: showForm ? "var(--surfaceAlt)" : "var(--accent)",
            color: showForm ? "var(--textMuted)" : "#000",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {showForm ? "Annuler" : "+ Ajouter une victoire"}
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="rounded-2xl p-5 space-y-3"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <div className="text-[11px] font-bold tracking-wider" style={{ color: "var(--textDim)" }}>
                NOUVELLE VICTOIRE
              </div>
              <input
                type="text"
                value={newTitre}
                onChange={e => setNewTitre(e.target.value)}
                placeholder="Ex: Score santé passé de 52 à 67 !"
                className="w-full rounded-xl px-4 py-2.5 text-[13px]"
                style={{
                  background: "var(--surfaceAlt)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  fontFamily: "inherit",
                  outline: "none",
                }}
                onKeyDown={e => { if (e.key === "Enter") addVictoire(); }}
              />
              <textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Détails optionnels..."
                rows={2}
                className="w-full rounded-xl px-4 py-2.5 text-[13px] resize-none"
                style={{
                  background: "var(--surfaceAlt)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <button
                onClick={addVictoire}
                disabled={!newTitre.trim()}
                className="rounded-xl px-5 py-2 text-[12px] font-bold"
                style={{
                  background: !newTitre.trim() ? "var(--surfaceAlt)" : "var(--accent)",
                  color: !newTitre.trim() ? "var(--textDim)" : "#000",
                  border: "none",
                  cursor: !newTitre.trim() ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                Enregistrer 🏆
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats bar */}
      {victoires.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {(["kpi", "pap", "manuelle"] as const).map(type => {
            const count = victoires.filter(v => v.type === type).length;
            return (
              <div
                key={type}
                className="rounded-xl p-3 text-center"
                style={{ background: "var(--surface)", border: `1px solid ${typeColors[type]}30` }}
              >
                <div className="text-[18px] font-bold" style={{ color: typeColors[type] }}>{count}</div>
                <div className="text-[10px] font-semibold mt-0.5" style={{ color: "var(--textDim)" }}>
                  {typeLabels[type]}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Victory wall */}
      {victoires.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}
        >
          <div className="text-[40px] mb-3">🏆</div>
          <div className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Pas encore de victoires
          </div>
          <div className="text-[12px] mt-2" style={{ color: "var(--textMuted)" }}>
            Les améliorations de KPIs et les PAP accomplis apparaîtront automatiquement ici.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {victoires.map((v, i) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  scale: celebrating === v.id ? [1, 1.02, 1] : 1,
                }}
                transition={{ delay: i * 0.04, duration: celebrating === v.id ? 0.3 : 0.2 }}
                className="rounded-2xl p-4 flex items-start gap-4"
                style={{
                  background: celebrating === v.id ? "#00d4aa10" : "var(--surface)",
                  border: celebrating === v.id ? "1px solid #00d4aa40" : "1px solid var(--border)",
                }}
              >
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] shrink-0"
                  style={{ background: typeColors[v.type] + "20" }}
                >
                  {v.icone}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                      {v.titre}
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide shrink-0"
                      style={{ background: typeColors[v.type] + "20", color: typeColors[v.type] }}
                    >
                      {typeLabels[v.type]}
                    </span>
                  </div>
                  {v.description && (
                    <div className="text-[12px] mt-1" style={{ color: "var(--textMuted)" }}>
                      {v.description}
                    </div>
                  )}
                  <div className="text-[10px] mt-1.5" style={{ color: "var(--textDim)" }}>
                    {new Date(v.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

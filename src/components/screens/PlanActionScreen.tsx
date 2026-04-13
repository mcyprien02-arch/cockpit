"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { computeHiddenCosts, formatEuro } from "@/lib/hiddenCosts";
import { callDecideur } from "@/lib/agents/decideur";
import type { ValeurAvecIndicateur } from "@/types";
import { getStatus } from "@/lib/scoring";

interface Action {
  id: string;
  priorite: "P1" | "P2" | "P3";
  constat: string;
  action: string;
  responsable: string | null;
  echeance: string | null;
  statut: "À faire" | "En cours" | "Fait" | "Abandonné";
  kpi_cible: string | null;
  commentaire: string | null;
  created_at: string;
}

const PRIORITE_COLORS: Record<string, { color: string; bg: string }> = {
  P1: { color: "#ff4d6a", bg: "#ff4d6a20" },
  P2: { color: "#ffb347", bg: "#ffb34720" },
  P3: { color: "#4da6ff", bg: "#4da6ff20" },
};
const STATUT_COLORS: Record<string, string> = {
  "À faire": "#8b8fa3",
  "En cours": "#4da6ff",
  "Fait": "#00d4aa",
  "Abandonné": "#555a6e",
};

function daysUntil(date: string | null) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export function PlanActionScreen({ magasinId }: { magasinId: string }) {
  const [actions, setActions] = useState<Action[]>([]);
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "P1" | "P2" | "P3">("all");
  const [generatingIA, setGeneratingIA] = useState(false);
  const [iaError, setIaError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Action>>({
    priorite: "P1", statut: "À faire",
    constat: "", action: "", responsable: "", kpi_cible: "", echeance: "", commentaire: ""
  });

  const load = useCallback(async () => {
    if (!magasinId) return;
    setLoading(true);

    const [{ data: aData }, { data: vData }] = await Promise.all([
      supabase.from("plans_action").select("*").eq("magasin_id", magasinId).order("priorite").order("created_at", { ascending: false }),
      supabase.from("v_dernieres_valeurs").select("*").eq("magasin_id", magasinId),
    ]);

    setActions((aData ?? []) as Action[]);

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
    setLoading(false);
  }, [magasinId]);

  useEffect(() => { load(); }, [load]);

  const hiddenCosts = computeHiddenCosts(valeurs);

  const handleAutoFill = async () => {
    const alerts = valeurs.filter((v) => v.status === "dg");
    if (alerts.length === 0) return;

    const toInsert = alerts.slice(0, 5).map((v) => ({
      magasin_id: magasinId,
      priorite: "P1" as const,
      constat: `${v.indicateur_nom} à ${v.valeur}${v.unite ?? ""} (seuil : ${v.seuil_ok}${v.unite ?? ""})`,
      action: v.action_defaut ?? "À définir",
      kpi_cible: v.indicateur_nom,
      statut: "À faire" as const,
      echeance: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
    }));

    await (supabase as any).from("plans_action").insert(toInsert);
    load();
  };

  const handleSave = async () => {
    if (!form.constat || !form.action) return;

    if (editingId) {
      await (supabase as any).from("plans_action").update({
        ...form, updated_at: new Date().toISOString(),
      }).eq("id", editingId);
    } else {
      await (supabase as any).from("plans_action").insert({
        ...form, magasin_id: magasinId,
      });
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ priorite: "P1", statut: "À faire", constat: "", action: "", responsable: "", kpi_cible: "", echeance: "", commentaire: "" });
    load();
  };

  const handleStatusChange = async (id: string, statut: string) => {
    await (supabase as any).from("plans_action").update({ statut, updated_at: new Date().toISOString() }).eq("id", id);
    setActions((prev) => prev.map((a) => a.id === id ? { ...a, statut: statut as Action["statut"] } : a));
  };

  const handleDelete = async (id: string) => {
    await (supabase as any).from("plans_action").delete().eq("id", id);
    setActions((prev) => prev.filter((a) => a.id !== id));
  };

  const handleEdit = (a: Action) => {
    setForm({ ...a });
    setEditingId(a.id);
    setShowForm(true);
  };

  const handleGenerateIA = async () => {
    setGeneratingIA(true);
    setIaError(null);
    try {
      const alertes = valeurs
        .filter((v) => v.status !== "ok")
        .map((v) => ({ nom: v.indicateur_nom, valeur: v.valeur, statut: v.status, seuil: v.seuil_ok }));
      const actions_existantes = actions
        .filter((a) => a.statut !== "Fait" && a.statut !== "Abandonné")
        .map((a) => ({ action: a.action, priorite: a.priorite, echeance: a.echeance, statut: a.statut }));
      const result = await callDecideur({ alertes, actions_existantes });
      if (result.nouvelles_actions?.length > 0) {
        const toInsert = result.nouvelles_actions.map((na) => ({
          magasin_id: magasinId,
          priorite: "P1" as const,
          constat: `IA — ${na.famille || na.kpi_cible || "Alerte détectée"}`,
          action: `[${na.qui}] ${na.quoi}`,
          responsable: na.qui,
          echeance: na.quand ? na.quand.split("T")[0] : null,
          kpi_cible: na.kpi_cible,
          statut: "À faire" as const,
          commentaire: `Gain estimé : ${na.combien}`,
        }));
        await (supabase as any).from("plans_action").insert(toInsert);
        load();
      }
    } catch (err) {
      setIaError(err instanceof Error ? err.message : "Erreur IA");
    }
    setGeneratingIA(false);
  };

  const filtered = actions.filter((a) => filter === "all" || a.priorite === filter);
  const open = actions.filter((a) => a.statut === "À faire" || a.statut === "En cours");
  const done = actions.filter((a) => a.statut === "Fait");
  const late = actions.filter((a) => {
    const d = daysUntil(a.echeance);
    return d !== null && d < 0 && a.statut !== "Fait" && a.statut !== "Abandonné";
  });

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[13px]" style={{ color: "var(--textMuted)" }}>Chargement…</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Missions du mois */}
      {(() => {
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const missions = actions.filter(a =>
          a.statut !== "Fait" && a.statut !== "Abandonné" &&
          a.echeance && a.echeance.startsWith(monthStr)
        );
        if (late.length === 0 && missions.length === 0) return null;
        return (
          <div className="rounded-2xl p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            {late.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#ff4d6a" }}>
                  ⚠ {late.length} action{late.length > 1 ? "s" : ""} en retard
                </div>
                <div className="space-y-1.5">
                  {late.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#ff4d6a10", border: "1px solid #ff4d6a25" }}>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#ff4d6a25", color: "#ff4d6a" }}>{a.priorite}</span>
                      <span className="text-[12px] flex-1 font-medium" style={{ color: "#ff4d6a" }}>{a.action}</span>
                      <span className="text-[10px] font-bold shrink-0" style={{ color: "#ff4d6a" }}>
                        {Math.abs(daysUntil(a.echeance)!)}j retard
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {missions.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--accent)" }}>
                  🎯 Missions de ce mois
                </div>
                <div className="space-y-1.5">
                  {missions.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--surfaceAlt)" }}>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: PRIORITE_COLORS[a.priorite]?.bg, color: PRIORITE_COLORS[a.priorite]?.color }}>{a.priorite}</span>
                      <span className="text-[12px] flex-1" style={{ color: "var(--text)" }}>{a.action}</span>
                      <span className="text-[10px]" style={{ color: "var(--textDim)" }}>{a.echeance ? new Date(a.echeance).toLocaleDateString("fr-FR") : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* IA error */}
      {iaError && (
        <div className="rounded-xl px-4 py-2 text-[12px]" style={{ background: "#ff4d6a18", color: "#ff4d6a" }}>⚠ {iaError}</div>
      )}

      {/* Header summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Actions ouvertes", value: open.length, color: "#4da6ff" },
          { label: "En retard", value: late.length, color: "#ff4d6a" },
          { label: "Terminées", value: done.length, color: "#00d4aa" },
          { label: "Total", value: actions.length, color: "#8b8fa3" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl p-4 border text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-[28px] font-bold" style={{ color }}>{value}</div>
            <div className="text-[11px] mt-1" style={{ color: "var(--textMuted)" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Hidden costs banner */}
      {hiddenCosts.length > 0 && (
        <div className="rounded-xl p-4 border" style={{ background: "#ff4d6a0c", borderColor: "#ff4d6a30" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#ff4d6a" }}>
            💸 Impact financier estimé si actions non réalisées
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {hiddenCosts.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.severity === "dg" ? "#ff4d6a" : "#ffb347" }} />
                <span style={{ color: "var(--text)" }}>{c.label}</span>
                {c.estimatedLoss && (
                  <span className="ml-auto font-bold shrink-0" style={{ color: "#ff4d6a" }}>
                    ~{formatEuro(c.estimatedLoss)}/an
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {(["all", "P1", "P2", "P3"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all"
              style={{
                background: filter === f ? (f === "all" ? "var(--accent)" : PRIORITE_COLORS[f]?.bg ?? "var(--accent)") : "var(--surface)",
                borderColor: filter === f ? (f === "all" ? "var(--accent)" : PRIORITE_COLORS[f]?.color ?? "var(--accent)") : "var(--border)",
                color: filter === f ? (f === "all" ? "#000" : PRIORITE_COLORS[f]?.color ?? "#000") : "var(--textMuted)",
              }}
            >
              {f === "all" ? "Toutes" : f}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerateIA}
            disabled={generatingIA || valeurs.length === 0}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all hover:opacity-90"
            style={{ background: generatingIA ? "var(--surfaceAlt)" : "#7c3aed18", color: generatingIA ? "var(--textMuted)" : "#a78bfa", border: "1px solid #a78bfa40", cursor: generatingIA ? "not-allowed" : "pointer", fontFamily: "inherit" }}
          >
            {generatingIA ? "Génération IA…" : "🤖 Générer actions IA"}
          </button>
          {valeurs.some((v) => v.status === "dg") && (
            <button
              onClick={handleAutoFill}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold border transition-all hover:opacity-90"
              style={{ borderColor: "#ffb347", color: "#ffb347", background: "#ffb34712" }}
            >
              ⚡ Auto-remplir depuis alertes
            </button>
          )}
          <button
            onClick={() => { setShowForm(true); setEditingId(null); }}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all hover:opacity-90 active:scale-95"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            + Nouvelle action
          </button>
        </div>
      </div>

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="rounded-2xl p-6 border"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="text-[14px] font-bold mb-4" style={{ color: "var(--text)" }}>
              {editingId ? "Modifier l'action" : "Nouvelle action"}
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>Constat *</label>
                <textarea
                  value={form.constat ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, constat: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg px-3 py-2 text-[12px] border resize-none"
                  style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>Action à mener *</label>
                <textarea
                  value={form.action ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, action: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg px-3 py-2 text-[12px] border resize-none"
                  style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>
              {[
                { key: "responsable", label: "Responsable", type: "text" },
                { key: "echeance", label: "Échéance", type: "date" },
                { key: "kpi_cible", label: "KPI cible", type: "text" },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>{label}</label>
                  <input
                    type={type}
                    value={(form as Record<string, string>)[key] ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-[12px] border"
                    style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
              ))}
              <div>
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>Priorité</label>
                <select
                  value={form.priorite ?? "P1"}
                  onChange={(e) => setForm((p) => ({ ...p, priorite: e.target.value as Action["priorite"] }))}
                  className="w-full rounded-lg px-3 py-2 text-[12px] border"
                  style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                >
                  <option>P1</option>
                  <option>P2</option>
                  <option>P3</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSave}
                className="px-5 py-2 rounded-xl text-[12px] font-semibold hover:opacity-90 active:scale-95"
                style={{ background: "var(--accent)", color: "#000" }}
              >
                {editingId ? "Mettre à jour" : "Créer l'action"}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="px-5 py-2 rounded-xl text-[12px] border hover:opacity-80"
                style={{ borderColor: "var(--border)", color: "var(--textMuted)" }}
              >
                Annuler
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: "var(--textMuted)" }}>
          <div className="text-[40px] mb-3">✅</div>
          <div className="text-[14px]">Aucune action pour ce filtre</div>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                {["Priorité", "Constat", "Action", "Responsable", "Échéance", "KPI cible", "Statut", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--textMuted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => {
                const days = daysUntil(a.echeance);
                const isLate = days !== null && days < 0 && a.statut !== "Fait" && a.statut !== "Abandonné";
                const pc = PRIORITE_COLORS[a.priorite];

                return (
                  <motion.tr
                    key={a.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b hover:opacity-90"
                    style={{
                      background: i % 2 === 0 ? "var(--surfaceAlt)" : "var(--surface)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ color: pc.color, background: pc.bg }}>
                        {a.priorite}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <span className="line-clamp-2 text-[11px]" style={{ color: "var(--textMuted)" }}>{a.constat}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="line-clamp-2 font-medium" style={{ color: "var(--text)" }}>{a.action}</span>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--textMuted)" }}>{a.responsable ?? "—"}</td>
                    <td className="px-4 py-3">
                      {a.echeance ? (
                        <div>
                          <div style={{ color: isLate ? "#ff4d6a" : "var(--text)" }}>
                            {new Date(a.echeance).toLocaleDateString("fr-FR")}
                          </div>
                          {days !== null && (
                            <div className="text-[10px]" style={{ color: isLate ? "#ff4d6a" : "var(--textDim)" }}>
                              {isLate ? `${Math.abs(days)}j retard` : days === 0 ? "Aujourd'hui" : `${days}j`}
                            </div>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: "var(--textMuted)" }}>{a.kpi_cible ?? "—"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={a.statut}
                        onChange={(e) => handleStatusChange(a.id, e.target.value)}
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold border"
                        style={{
                          background: "transparent",
                          borderColor: `${STATUT_COLORS[a.statut]}50`,
                          color: STATUT_COLORS[a.statut],
                        }}
                      >
                        {["À faire", "En cours", "Fait", "Abandonné"].map((s) => (
                          <option key={s} style={{ background: "var(--surface)", color: STATUT_COLORS[s] }}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(a)} className="text-[11px] hover:opacity-70" style={{ color: "var(--textMuted)" }}>✏️</button>
                        <button onClick={() => handleDelete(a.id)} className="text-[11px] hover:opacity-70" style={{ color: "#ff4d6a" }}>🗑</button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

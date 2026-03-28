"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { getStatus } from "@/lib/scoring";
import type { ValeurAvecIndicateur } from "@/types";

type PAPPeriode = "semaine" | "mois" | "trimestre";
type PAPStatut = "À lancer" | "En cours" | "Terminé" | "Abandonné";

interface PAPAction {
  id: string;
  ordre: number;
  objectif: string;          // Résultat attendu (SMART)
  action: string;             // Action concrète
  responsable: string;
  echeance: string;
  kpiImpacte: string;         // KPI qui sera amélioré
  avancement: number;         // 0-100%
  statut: PAPStatut;
  periode: PAPPeriode;
  impact: "fort" | "moyen" | "faible";
}

const STATUT_COLORS: Record<PAPStatut, { color: string; bg: string }> = {
  "À lancer": { color: "#8b8fa3", bg: "#8b8fa318" },
  "En cours": { color: "#4da6ff", bg: "#4da6ff18" },
  "Terminé":  { color: "#00d4aa", bg: "#00d4aa18" },
  "Abandonné":{ color: "#555a6e", bg: "#555a6e18" },
};

const IMPACT_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  fort:   { color: "#ff4d6a", bg: "#ff4d6a18", label: "Impact fort" },
  moyen:  { color: "#ffb347", bg: "#ffb34720", label: "Impact moyen" },
  faible: { color: "#4da6ff", bg: "#4da6ff18", label: "Impact faible" },
};

const MAX_PAP_ACTIONS = 10;

export function PAPScreen({ magasinId }: { magasinId: string }) {
  const [actions, setActions] = useState<PAPAction[]>([]);
  const [periode, setPeriode] = useState<PAPPeriode>("mois");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [form, setForm] = useState<Partial<PAPAction>>({
    statut: "À lancer", impact: "fort", avancement: 0, periode: "mois",
    objectif: "", action: "", responsable: "", echeance: "", kpiImpacte: "",
  });

  const storageKey = `pap_${magasinId}_${periode}`;

  // Load PAP from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try { setActions(JSON.parse(stored)); } catch {}
    } else {
      setActions([]);
    }
  }, [storageKey]);

  // Load KPI values for auto-generate
  useEffect(() => {
    if (!magasinId) return;
    supabase.from("v_dernieres_valeurs").select("*").eq("magasin_id", magasinId)
      .then(({ data }) => {
        type VRow = {
          magasin_id: string; indicateur_id: string; valeur: number; date_saisie: string;
          indicateur_nom: string; unite: string | null; direction: "up" | "down";
          seuil_ok: number | null; seuil_vigilance: number | null; categorie: string;
          poids: number; action_defaut: string | null; magasin_nom: string;
        };
        setValeurs(((data ?? []) as VRow[]).map((r) => ({
          ...r,
          status: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
        })));
      });
  }, [magasinId]);

  const saveActions = useCallback((updated: PAPAction[]) => {
    setActions(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    }
  }, [storageKey]);

  const handleSave = () => {
    if (!form.objectif || !form.action) return;
    let updated: PAPAction[];
    if (editingId) {
      updated = actions.map((a) =>
        a.id === editingId ? { ...a, ...form } as PAPAction : a
      );
    } else {
      if (actions.length >= MAX_PAP_ACTIONS) return;
      const newAction: PAPAction = {
        id: `pap_${Date.now()}`,
        ordre: actions.length + 1,
        objectif: form.objectif ?? "",
        action: form.action ?? "",
        responsable: form.responsable ?? "",
        echeance: form.echeance ?? "",
        kpiImpacte: form.kpiImpacte ?? "",
        avancement: form.avancement ?? 0,
        statut: form.statut ?? "À lancer",
        periode: periode,
        impact: form.impact ?? "fort",
      };
      updated = [...actions, newAction];
    }
    saveActions(updated);
    setShowForm(false);
    setEditingId(null);
    setForm({ statut: "À lancer", impact: "fort", avancement: 0, periode, objectif: "", action: "", responsable: "", echeance: "", kpiImpacte: "" });
  };

  const handleDelete = (id: string) => {
    saveActions(actions.filter((a) => a.id !== id).map((a, i) => ({ ...a, ordre: i + 1 })));
  };

  const handleEdit = (a: PAPAction) => {
    setForm({ ...a });
    setEditingId(a.id);
    setShowForm(true);
  };

  const handleAvancement = (id: string, val: number) => {
    const updated = actions.map((a) =>
      a.id === id ? { ...a, avancement: val, statut: val >= 100 ? "Terminé" as PAPStatut : val > 0 ? "En cours" as PAPStatut : a.statut } : a
    );
    saveActions(updated);
  };

  const handleStatut = (id: string, statut: PAPStatut) => {
    const updated = actions.map((a) =>
      a.id === id ? { ...a, statut, avancement: statut === "Terminé" ? 100 : a.avancement } : a
    );
    saveActions(updated);
  };

  const handleAutoGenerate = () => {
    const alerts = valeurs
      .filter((v) => v.status === "dg")
      .sort((a, b) => b.poids - a.poids)
      .slice(0, MAX_PAP_ACTIONS - actions.length);

    const newActions: PAPAction[] = alerts.map((v, i) => ({
      id: `pap_auto_${Date.now()}_${i}`,
      ordre: actions.length + i + 1,
      objectif: `Corriger ${v.indicateur_nom} : passer de ${v.valeur}${v.unite ?? ""} à ${v.seuil_ok}${v.unite ?? ""}`,
      action: v.action_defaut ?? "À définir",
      responsable: "",
      echeance: new Date(Date.now() + (i + 1) * 14 * 86400000).toISOString().split("T")[0],
      kpiImpacte: v.indicateur_nom,
      avancement: 0,
      statut: "À lancer",
      periode,
      impact: v.poids >= 3 ? "fort" : v.poids >= 2 ? "moyen" : "faible",
    }));

    saveActions([...actions, ...newActions]);
  };

  const handleReorder = (reordered: PAPAction[]) => {
    saveActions(reordered.map((a, i) => ({ ...a, ordre: i + 1 })));
  };

  // ── Stats ────────────────────────────────────────────────────
  const total = actions.length;
  const done = actions.filter((a) => a.statut === "Terminé").length;
  const inProgress = actions.filter((a) => a.statut === "En cours").length;
  const avgProgress = total > 0 ? Math.round(actions.reduce((s, a) => s + a.avancement, 0) / total) : 0;
  const globalCompletion = total > 0 ? Math.round((done / total) * 100) : 0;

  const daysUntil = (dateStr: string) =>
    dateStr ? Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="space-y-4">
      {/* Header KPIs */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Actions PAP", value: `${total}/${MAX_PAP_ACTIONS}`, color: "#4da6ff" },
          { label: "En cours", value: inProgress, color: "#4da6ff" },
          { label: "Terminées", value: done, color: "#00d4aa" },
          { label: "Avancement moyen", value: `${avgProgress}%`, color: avgProgress >= 70 ? "#00d4aa" : "#ffb347" },
          { label: "Taux de réussite", value: `${globalCompletion}%`, color: globalCompletion >= 80 ? "#00d4aa" : "#ffb347" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl p-4 border text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-[22px] font-bold" style={{ color }}>{value}</div>
            <div className="text-[10px] mt-1 uppercase tracking-wider" style={{ color: "var(--textMuted)" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="rounded-xl p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--textMuted)" }}>
              Progression du PAP — {periode}
            </span>
            <span className="text-[13px] font-bold" style={{ color: globalCompletion >= 70 ? "#00d4aa" : "#ffb347" }}>
              {globalCompletion}%
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: "#2a2e3a" }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${globalCompletion}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${globalCompletion >= 70 ? "#00d4aa" : "#ffb347"}, ${globalCompletion >= 70 ? "#4da6ff" : "#ff4d6a"})` }}
            />
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Period selector */}
        <div className="flex gap-2">
          {(["semaine", "mois", "trimestre"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriode(p)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border capitalize transition-all"
              style={{
                background: periode === p ? "var(--accent)" : "var(--surface)",
                borderColor: periode === p ? "var(--accent)" : "var(--border)",
                color: periode === p ? "#000" : "var(--textMuted)",
              }}
            >
              {p === "semaine" ? "Cette semaine" : p === "mois" ? "Ce mois" : "Ce trimestre"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {valeurs.some((v) => v.status === "dg") && actions.length < MAX_PAP_ACTIONS && (
            <button
              onClick={handleAutoGenerate}
              className="px-4 py-2 rounded-xl text-[11px] font-semibold border"
              style={{ borderColor: "#ffb347", color: "#ffb347", background: "#ffb34712" }}
            >
              ⚡ Générer depuis alertes
            </button>
          )}
          {actions.length < MAX_PAP_ACTIONS && (
            <button
              onClick={() => { setShowForm(true); setEditingId(null); }}
              className="px-4 py-2 rounded-xl text-[11px] font-semibold"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              + Ajouter action
            </button>
          )}
        </div>
      </div>

      {/* Add/Edit form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="rounded-2xl p-6 border"
            style={{ background: "var(--surface)", borderColor: "var(--accent)30" }}
          >
            <div className="text-[13px] font-bold mb-4" style={{ color: "var(--text)" }}>
              {editingId ? "Modifier l'action PAP" : `Nouvelle action PAP (${actions.length + 1}/${MAX_PAP_ACTIONS})`}
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>
                  Objectif (résultat attendu — SMART) *
                </label>
                <input
                  value={form.objectif ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, objectif: e.target.value }))}
                  placeholder="Ex: Augmenter le taux d'achat externe de 8.9% à 15% d'ici fin avril"
                  className="w-full rounded-lg px-3 py-2 text-[12px] border"
                  style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>
                  Action concrète *
                </label>
                <textarea
                  value={form.action ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, action: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg px-3 py-2 text-[12px] border resize-none"
                  style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>
              {[
                { key: "responsable", label: "Responsable", type: "text", placeholder: "Nom" },
                { key: "echeance", label: "Échéance", type: "date", placeholder: "" },
                { key: "kpiImpacte", label: "KPI impacté", type: "text", placeholder: "Ex: Taux d'achat ext." },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>{label}</label>
                  <input
                    type={type}
                    value={(form as Record<string, string>)[key] ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-lg px-3 py-2 text-[12px] border"
                    style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
              ))}
              <div>
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>Impact</label>
                <select
                  value={form.impact ?? "fort"}
                  onChange={(e) => setForm((p) => ({ ...p, impact: e.target.value as "fort" | "moyen" | "faible" }))}
                  className="w-full rounded-lg px-3 py-2 text-[12px] border"
                  style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                >
                  <option value="fort">Fort</option>
                  <option value="moyen">Moyen</option>
                  <option value="faible">Faible</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleSave} className="px-5 py-2 rounded-xl text-[12px] font-semibold" style={{ background: "var(--accent)", color: "#000" }}>
                {editingId ? "Mettre à jour" : "Ajouter au PAP"}
              </button>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-5 py-2 rounded-xl text-[12px] border" style={{ borderColor: "var(--border)", color: "var(--textMuted)" }}>
                Annuler
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PAP Actions — Reorderable list */}
      {actions.length === 0 ? (
        <div className="text-center py-16" style={{ color: "var(--textMuted)" }}>
          <div className="text-[48px] mb-3">🎯</div>
          <div className="text-[15px] font-semibold mb-2" style={{ color: "var(--text)" }}>
            PAP vide pour {periode === "semaine" ? "cette semaine" : periode === "mois" ? "ce mois" : "ce trimestre"}
          </div>
          <div className="text-[12px] mb-6" style={{ color: "var(--textMuted)" }}>
            Ajoutez jusqu&apos;à 10 actions prioritaires. Focalisez-vous sur l&apos;essentiel.
          </div>
          {valeurs.some((v) => v.status === "dg") && (
            <button onClick={handleAutoGenerate} className="px-5 py-2.5 rounded-xl text-[12px] font-semibold" style={{ background: "var(--accent)", color: "#000" }}>
              ⚡ Générer depuis les alertes KPI
            </button>
          )}
        </div>
      ) : (
        <Reorder.Group axis="y" values={actions} onReorder={handleReorder} className="space-y-3">
          {actions.map((action, i) => {
            const sc = STATUT_COLORS[action.statut];
            const ic = IMPACT_COLORS[action.impact];
            const days = daysUntil(action.echeance);
            const isLate = days !== null && days < 0 && action.statut !== "Terminé";

            return (
              <Reorder.Item key={action.id} value={action}>
                <motion.div
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-2xl p-5 border"
                  style={{
                    background: "var(--surface)",
                    borderColor: action.statut === "Terminé" ? "#00d4aa30" : isLate ? "#ff4d6a30" : "var(--border)",
                    cursor: "grab",
                  }}
                >
                  <div className="flex items-start gap-4">
                    {/* Number */}
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-[14px] shrink-0 mt-0.5"
                      style={{ background: ic.bg, color: ic.color }}
                    >
                      {action.ordre}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Objectif */}
                      <div className="font-semibold text-[13px] mb-1" style={{ color: "var(--text)" }}>
                        {action.objectif}
                      </div>

                      {/* Action */}
                      <div className="text-[11px] mb-2" style={{ color: "var(--textMuted)" }}>
                        → {action.action}
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 flex-wrap text-[10px] mb-3" style={{ color: "var(--textDim)" }}>
                        {action.responsable && <span>👤 {action.responsable}</span>}
                        {action.echeance && (
                          <span style={{ color: isLate ? "#ff4d6a" : days !== null && days <= 3 ? "#ffb347" : "var(--textDim)" }}>
                            📅 {new Date(action.echeance).toLocaleDateString("fr-FR")}
                            {days !== null && ` · ${isLate ? `${Math.abs(days)}j retard` : days === 0 ? "Aujourd'hui" : `${days}j`}`}
                          </span>
                        )}
                        {action.kpiImpacte && (
                          <span className="px-1.5 py-0.5 rounded" style={{ background: "#4da6ff12", color: "#4da6ff" }}>
                            📊 {action.kpiImpacte}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded" style={{ background: ic.bg, color: ic.color }}>
                          {ic.label}
                        </span>
                      </div>

                      {/* Progress bar + slider */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "#2a2e3a" }}>
                          <motion.div
                            animate={{ width: `${action.avancement}%` }}
                            transition={{ duration: 0.4 }}
                            className="h-full rounded-full"
                            style={{
                              background: action.avancement >= 100 ? "#00d4aa" :
                                action.avancement >= 50 ? "linear-gradient(90deg, #ffb347, #4da6ff)" :
                                "#ff4d6a",
                            }}
                          />
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={10}
                          value={action.avancement}
                          onChange={(e) => handleAvancement(action.id, parseInt(e.target.value))}
                          className="w-20"
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <span className="text-[11px] font-bold w-8" style={{ color: action.avancement >= 100 ? "#00d4aa" : "var(--textMuted)" }}>
                          {action.avancement}%
                        </span>
                      </div>
                    </div>

                    {/* Right actions */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <select
                        value={action.statut}
                        onChange={(e) => handleStatut(action.id, e.target.value as PAPStatut)}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg border"
                        style={{ background: sc.bg, borderColor: `${sc.color}40`, color: sc.color }}
                      >
                        {(["À lancer", "En cours", "Terminé", "Abandonné"] as PAPStatut[]).map((s) => (
                          <option key={s} style={{ background: "var(--surface)", color: STATUT_COLORS[s].color }}>{s}</option>
                        ))}
                      </select>
                      <div className="flex gap-1.5">
                        <button onClick={() => handleEdit(action)} className="text-[11px] p-1 rounded hover:opacity-70" style={{ color: "var(--textMuted)" }}>✏️</button>
                        <button onClick={() => handleDelete(action.id)} className="text-[11px] p-1 rounded hover:opacity-70" style={{ color: "#ff4d6a55" }}>🗑</button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      )}
    </div>
  );
}

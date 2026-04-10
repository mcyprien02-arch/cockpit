"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { getStatus } from "@/lib/scoring";
import { formatEuro } from "@/lib/hiddenCosts";
import type { ValeurAvecIndicateur } from "@/types";

// ── Types ─────────────────────────────────────────────────────
type PAPStatut = "À lancer" | "En cours" | "Terminé" | "Abandonné";
type PAPDuree = "court" | "moyen" | "long"; // <1m, 1-3m, 3-6m

interface PAPAction {
  id: string;
  axeId: string;
  objectif: string;
  action: string;
  responsable: string;
  echeance: string;      // ISO date
  kpiImpacte: string;
  avancement: number;    // 0-100
  statut: PAPStatut;
  duree: PAPDuree;
  impactFinancier: number; // €/an recyclage estimé
}

interface PAPAxe {
  id: string;
  label: string;
  description: string;
  couleur: string;
}

const DEFAULT_AXES: PAPAxe[] = [
  { id: "a1", label: "Qualité téléphonie", description: "Picea, authentification, retours", couleur: "#4da6ff" },
  { id: "a2", label: "Performance commerciale", description: "TLAC, ventes additionnelles, fidélisation", couleur: "#00d4aa" },
  { id: "a3", label: "Gestion du stock", description: "Stock âgé, délai de vente, rotation", couleur: "#ffb347" },
  { id: "a4", label: "Management & RH", description: "Turnover, polyvalence, compétences", couleur: "#a78bfa" },
  { id: "a5", label: "Digital & E-réputation", description: "Note Google, marketplace, web", couleur: "#f472b6" },
];

const STATUT_COLORS: Record<PAPStatut, { color: string; bg: string }> = {
  "À lancer": { color: "#8b8fa3", bg: "#8b8fa318" },
  "En cours": { color: "#4da6ff", bg: "#4da6ff18" },
  "Terminé":  { color: "#00d4aa", bg: "#00d4aa18" },
  "Abandonné":{ color: "#555a6e", bg: "#555a6e18" },
};

const DUREE_LABELS: Record<PAPDuree, { label: string; color: string; weeks: number }> = {
  court: { label: "Court terme < 1 mois",  color: "#ff4d6a", weeks: 4 },
  moyen: { label: "Moyen terme 1–3 mois",  color: "#ffb347", weeks: 12 },
  long:  { label: "Long terme 3–6 mois",   color: "#4da6ff", weeks: 26 },
};

const MONTHS = ["M1", "M2", "M3", "M4", "M5", "M6"];

// ── Helpers ────────────────────────────────────────────────────
function mkId() { return Math.random().toString(36).slice(2, 10); }

// Mapping statuts PAP UI ↔ DB
function toDbStatut(s: PAPStatut): string {
  if (s === "Terminé") return "Fait";
  if (s === "À lancer") return "À faire";
  return s;
}
function fromDbStatut(s: string): PAPStatut {
  if (s === "Fait") return "Terminé";
  if (s === "À faire") return "À lancer";
  if (s === "En cours") return "En cours";
  if (s === "Abandonné") return "Abandonné";
  return "À lancer";
}

export function PAPScreen({ magasinId }: { magasinId: string }) {
  const axesKey   = `pap_axes_${magasinId}`;
  const extKey    = `pap_ext_${magasinId}`; // axeId, duree, avancement, impactFinancier
  const chvacvKey = `chvacv_${magasinId}`;

  const [actions, setActions]       = useState<PAPAction[]>([]);
  const [axes, setAxes]             = useState<PAPAxe[]>(DEFAULT_AXES);
  const [valeurs, setValeurs]       = useState<ValeurAvecIndicateur[]>([]);
  const [chvacv, setChvacv]         = useState(40);
  const [view, setView]             = useState<"axes" | "gantt">("axes");
  const [editingAxe, setEditingAxe] = useState<string | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [formAxeId, setFormAxeId]   = useState<string>("");
  const [editActionId, setEditActionId] = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);

  const [form, setForm] = useState<Partial<PAPAction>>({
    statut: "À lancer", duree: "court", avancement: 0,
    objectif: "", action: "", responsable: "", echeance: "", kpiImpacte: "", impactFinancier: 0,
  });

  const loadExt = (): Record<string, Partial<PAPAction>> => {
    try { return JSON.parse(localStorage.getItem(extKey) ?? "{}"); } catch { return {}; }
  };
  const saveExt = (ext: Record<string, Partial<PAPAction>>) => {
    try { localStorage.setItem(extKey, JSON.stringify(ext)); } catch { /* noop */ }
  };

  // Load from Supabase
  const loadActions = useCallback(async () => {
    if (!magasinId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("plans_action")
      .select("id, action, constat, responsable, echeance, statut, priorite, kpi_cible")
      .eq("magasin_id", magasinId)
      .order("echeance", { ascending: true });

    const ext = loadExt();
    const rows: PAPAction[] = (data ?? []).map((r: any) => {
      const extra = ext[r.id] ?? {};
      return {
        id: r.id,
        axeId:           extra.axeId ?? axes[0]?.id ?? "a1",
        objectif:        r.constat ?? "",
        action:          r.action ?? "",
        responsable:     r.responsable ?? "",
        echeance:        r.echeance ?? "",
        kpiImpacte:      r.kpi_cible ?? "",
        avancement:      extra.avancement ?? 0,
        statut:          fromDbStatut(r.statut ?? "À faire"),
        duree:           extra.duree ?? "court",
        impactFinancier: extra.impactFinancier ?? 0,
      };
    });
    setActions(rows);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magasinId]);

  // Load axes + CHVACV
  useEffect(() => {
    try {
      const sx = localStorage.getItem(axesKey);
      if (sx) setAxes(JSON.parse(sx));
      const sc = localStorage.getItem(chvacvKey);
      if (sc) {
        const p = JSON.parse(sc);
        if (p.ca_annuel && p.cv_annuelles && p.nb_etp && p.heures_semaine && p.semaines_an) {
          const va = p.ca_annuel - p.cv_annuelles;
          const h = p.nb_etp * p.heures_semaine * p.semaines_an;
          if (h > 0) setChvacv(Math.round(va / h * 100) / 100);
        }
      }
    } catch { /* noop */ }
  }, [axesKey, chvacvKey]);

  useEffect(() => { loadActions(); }, [loadActions]);

  // Load KPI alerts
  const loadValeurs = useCallback(async () => {
    const { data } = await supabase.from("v_dernieres_valeurs").select("*").eq("magasin_id", magasinId);
    type VRow = { magasin_id: string; indicateur_id: string; valeur: number; date_saisie: string; indicateur_nom: string; unite: string | null; direction: "up" | "down"; seuil_ok: number | null; seuil_vigilance: number | null; categorie: string; poids: number; action_defaut: string | null; magasin_nom: string; };
    const enriched: ValeurAvecIndicateur[] = ((data ?? []) as VRow[]).map((r) => ({
      ...r, status: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
    }));
    setValeurs(enriched);
  }, [magasinId]);

  useEffect(() => { loadValeurs(); }, [loadValeurs]);

  // Save extra fields to localStorage
  const persistExt = (action: PAPAction) => {
    const ext = loadExt();
    ext[action.id] = {
      axeId: action.axeId,
      duree: action.duree,
      avancement: action.avancement,
      impactFinancier: action.impactFinancier,
    };
    saveExt(ext);
  };

  const saveAxes = (next: PAPAxe[]) => {
    setAxes(next);
    localStorage.setItem(axesKey, JSON.stringify(next));
  };

  // Update statut in DB and locally
  const updateStatut = async (id: string, statut: PAPStatut) => {
    await (supabase as any)
      .from("plans_action")
      .update({ statut: toDbStatut(statut) })
      .eq("id", id);
    setActions(prev => prev.map(a => a.id === id ? { ...a, statut } : a));
  };

  // Delete action
  const deleteAction = async (id: string) => {
    await (supabase as any).from("plans_action").delete().eq("id", id);
    const ext = loadExt();
    delete ext[id];
    saveExt(ext);
    setActions(prev => prev.filter(a => a.id !== id));
  };

  // ── Stats ──────────────────────────────────────────────────
  const stats = {
    total: actions.length,
    enCours: actions.filter((a) => a.statut === "En cours").length,
    terminees: actions.filter((a) => a.statut === "Terminé").length,
    enRetard: actions.filter((a) => a.statut !== "Terminé" && a.statut !== "Abandonné" && a.echeance && new Date(a.echeance) < new Date()).length,
    recyclageTotal: actions.filter((a) => a.statut !== "Abandonné").reduce((s, a) => s + (a.impactFinancier || 0), 0),
  };

  // ── Gantt helpers ──────────────────────────────────────────
  const today = new Date();
  const ganttStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const ganttEnd = new Date(ganttStart);
  ganttEnd.setMonth(ganttEnd.getMonth() + 6);

  function ganttPos(date: string): number {
    const d = new Date(date);
    const total = ganttEnd.getTime() - ganttStart.getTime();
    const offset = d.getTime() - ganttStart.getTime();
    return Math.max(0, Math.min(100, (offset / total) * 100));
  }

  function dureeWidth(duree: PAPDuree): number {
    return { court: 16, moyen: 33, long: 50 }[duree];
  }

  // ── Open form ─────────────────────────────────────────────
  const openForm = (axeId: string, existing?: PAPAction) => {
    setFormAxeId(axeId);
    if (existing) {
      setEditActionId(existing.id);
      setForm({ ...existing });
    } else {
      setEditActionId(null);
      setForm({ statut: "À lancer", duree: "court", avancement: 0, axeId, objectif: "", action: "", responsable: "", echeance: "", kpiImpacte: "", impactFinancier: 0 });
    }
    setShowForm(true);
  };

  const submitForm = async () => {
    if (!form.action) return;
    const dbStatut = toDbStatut(form.statut ?? "À lancer");

    if (editActionId) {
      // Update existing
      await (supabase as any)
        .from("plans_action")
        .update({
          action:      form.action,
          constat:     form.objectif,
          responsable: form.responsable,
          echeance:    form.echeance || null,
          statut:      dbStatut,
          kpi_cible:   form.kpiImpacte,
        })
        .eq("id", editActionId);

      const updated: PAPAction = {
        id: editActionId,
        axeId: formAxeId,
        objectif: form.objectif ?? "",
        action: form.action ?? "",
        responsable: form.responsable ?? "",
        echeance: form.echeance ?? "",
        kpiImpacte: form.kpiImpacte ?? "",
        avancement: form.avancement ?? 0,
        statut: form.statut ?? "À lancer",
        duree: form.duree ?? "court",
        impactFinancier: form.impactFinancier ?? 0,
      };
      persistExt(updated);
      setActions(prev => prev.map(a => a.id === editActionId ? updated : a));
    } else {
      // Insert new
      const { data: inserted } = await (supabase as any)
        .from("plans_action")
        .insert({
          magasin_id:  magasinId,
          action:      form.action,
          constat:     form.objectif,
          responsable: form.responsable,
          echeance:    form.echeance || null,
          statut:      dbStatut,
          priorite:    form.statut === "À lancer" ? "normale" : "haute",
          kpi_cible:   form.kpiImpacte,
        })
        .select("id")
        .single();

      if (inserted?.id) {
        const newAction: PAPAction = {
          id: inserted.id,
          axeId: formAxeId,
          objectif: form.objectif ?? "",
          action: form.action ?? "",
          responsable: form.responsable ?? "",
          echeance: form.echeance ?? "",
          kpiImpacte: form.kpiImpacte ?? "",
          avancement: form.avancement ?? 0,
          statut: form.statut ?? "À lancer",
          duree: form.duree ?? "court",
          impactFinancier: form.impactFinancier ?? 0,
        };
        persistExt(newAction);
        setActions(prev => [...prev, newAction]);
      }
    }
    setShowForm(false);
  };

  // ── Auto-generate from KPI alerts ─────────────────────────
  const autoGenerate = async () => {
    const alerts = valeurs.filter((v) => v.status === "dg" && v.action_defaut);
    const toInsert = alerts.slice(0, 5).filter(v => !actions.some(a => a.kpiImpacte === v.indicateur_nom));
    for (const v of toInsert) {
      const { data: inserted } = await (supabase as any)
        .from("plans_action")
        .insert({
          magasin_id:  magasinId,
          action:      v.action_defaut ?? `Action sur ${v.indicateur_nom}`,
          constat:     `Alerte KPI : ${v.indicateur_nom} = ${v.valeur}${v.unite ?? ""}`,
          echeance:    new Date(Date.now() + 30 * 24 * 3600000).toISOString().split("T")[0],
          statut:      "À faire",
          priorite:    "haute",
          kpi_cible:   v.indicateur_nom,
        })
        .select("id")
        .single();
      if (inserted?.id) {
        const newAction: PAPAction = {
          id: inserted.id,
          axeId: axes[0]?.id ?? "a1",
          objectif: `Alerte KPI : ${v.indicateur_nom}`,
          action: v.action_defaut ?? `Action sur ${v.indicateur_nom}`,
          responsable: "",
          echeance: new Date(Date.now() + 30 * 24 * 3600000).toISOString().split("T")[0],
          kpiImpacte: v.indicateur_nom,
          avancement: 0,
          statut: "À lancer",
          duree: "court",
          impactFinancier: 0,
        };
        persistExt(newAction);
        setActions(prev => [...prev, newAction]);
      }
    }
  };

  const alerts = valeurs.filter((v) => v.status === "dg");

  return (
    <div className="space-y-5">
      {/* ── Header stats ─────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Total actions", value: stats.total, color: "var(--text)", bg: "var(--surface)" },
          { label: "En cours", value: stats.enCours, color: "#4da6ff", bg: "#4da6ff12" },
          { label: "Terminées", value: stats.terminees, color: "#00d4aa", bg: "#00d4aa12" },
          { label: "En retard", value: stats.enRetard, color: "var(--danger)", bg: "#ff4d6a12" },
          { label: "Recyclage estimé", value: formatEuro(stats.recyclageTotal), color: "#00d4aa", bg: "#00d4aa12", isText: true },
        ].map(({ label, value, color, bg, isText }) => (
          <div key={label} className="rounded-xl p-4 border text-center" style={{ background: bg, borderColor: "transparent" }}>
            <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--textMuted)" }}>{label}</div>
            {isText
              ? <div className="text-[16px] font-black" style={{ color }}>{value}</div>
              : <div className="text-[28px] font-black" style={{ color }}>{value}</div>
            }
          </div>
        ))}
      </div>

      {/* ── Toolbar ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* View toggle */}
        <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {(["axes", "gantt"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className="px-4 py-2 text-[11px] font-semibold"
              style={{ background: view === v ? "var(--accent)" : "var(--surface)", color: view === v ? "#000" : "var(--textMuted)" }}>
              {v === "axes" ? "🎯 Axes" : "📅 Timeline"}
            </button>
          ))}
        </div>

        {alerts.length > 0 && (
          <button onClick={autoGenerate} className="px-4 py-2 rounded-xl text-[11px] font-semibold border"
            style={{ borderColor: "#ff4d6a40", color: "var(--danger)", background: "#ff4d6a08" }}>
            ⚡ Générer depuis {alerts.length} alerte{alerts.length > 1 ? "s" : ""}
          </button>
        )}

        <div className="flex-1" />
        <div className="text-[11px]" style={{ color: "var(--textDim)" }}>
          CHVACV : <span style={{ color: "#00d4aa" }}>{formatEuro(chvacv)}/h</span>
        </div>
      </div>

      {/* ── Vue AXES ─────────────────────────────────────── */}
      {view === "axes" && (
        <div className="space-y-4">
          {axes.map((axe) => {
            const axeActions = actions.filter((a) => a.axeId === axe.id);
            const done = axeActions.filter((a) => a.statut === "Terminé").length;
            const pct = axeActions.length > 0 ? Math.round((done / axeActions.length) * 100) : 0;
            const isEditing = editingAxe === axe.id;

            return (
              <motion.div key={axe.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border overflow-hidden"
                style={{ borderColor: axe.couleur + "40", background: "var(--surface)" }}>
                {/* Axe header */}
                <div className="flex items-center gap-4 px-5 py-4 border-b" style={{ borderColor: axe.couleur + "20", background: axe.couleur + "08" }}>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: axe.couleur }} />
                  {isEditing ? (
                    <input value={axe.label}
                      onChange={(e) => saveAxes(axes.map((a) => a.id === axe.id ? { ...a, label: e.target.value } : a))}
                      className="flex-1 rounded-lg px-3 py-1.5 text-[13px] font-bold border"
                      style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                      onBlur={() => setEditingAxe(null)}
                      autoFocus />
                  ) : (
                    <div className="flex-1">
                      <div className="text-[13px] font-bold" style={{ color: "var(--text)" }}>{axe.label}</div>
                      <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>{axe.description}</div>
                    </div>
                  )}
                  {/* Progress */}
                  <div className="flex items-center gap-3">
                    <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>{done}/{axeActions.length} actions</div>
                    <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surfaceAlt)" }}>
                      <motion.div className="h-full rounded-full" animate={{ width: `${pct}%` }}
                        style={{ background: axe.couleur }} />
                    </div>
                    <div className="text-[11px] font-bold" style={{ color: axe.couleur }}>{pct}%</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingAxe(isEditing ? null : axe.id)}
                      className="text-[10px] px-2 py-1 rounded border"
                      style={{ borderColor: "var(--border)", color: "var(--textMuted)" }}>
                      {isEditing ? "✓" : "✏"}
                    </button>
                    <button onClick={() => openForm(axe.id)}
                      className="text-[11px] px-3 py-1.5 rounded-lg font-semibold"
                      style={{ background: axe.couleur + "22", color: axe.couleur }}>
                      + Action
                    </button>
                  </div>
                </div>

                {/* Actions */}
                {axeActions.length === 0 ? (
                  <div className="px-5 py-4 text-[12px]" style={{ color: "var(--textDim)" }}>
                    Aucune action — cliquez sur &quot;+ Action&quot; pour en ajouter
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {axeActions.sort((a, b) => {
                      const order: Record<PAPDuree, number> = { court: 0, moyen: 1, long: 2 };
                      return order[a.duree] - order[b.duree];
                    }).map((action) => {
                      const sc = STATUT_COLORS[action.statut];
                      const dc = DUREE_LABELS[action.duree];
                      const isLate = action.statut !== "Terminé" && action.statut !== "Abandonné" && action.echeance && new Date(action.echeance) < new Date();
                      return (
                        <div key={action.id} className="px-5 py-3 flex items-start gap-4"
                          style={{ background: isLate ? "#ff4d6a04" : "transparent" }}>
                          <div className="mt-0.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: dc.color + "20", color: dc.color }}>
                              {action.duree === "court" ? "C" : action.duree === "moyen" ? "M" : "L"}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            {action.objectif && (
                              <div className="text-[10px] mb-0.5 italic" style={{ color: "var(--textDim)" }}>{action.objectif}</div>
                            )}
                            <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{action.action}</div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              {action.responsable && (
                                <span className="text-[10px]" style={{ color: "var(--textMuted)" }}>👤 {action.responsable}</span>
                              )}
                              {action.echeance && (
                                <span className="text-[10px]" style={{ color: isLate ? "var(--danger)" : "var(--textMuted)" }}>
                                  📅 {new Date(action.echeance).toLocaleDateString("fr-FR")} {isLate && "⚠ En retard"}
                                </span>
                              )}
                              {action.kpiImpacte && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: axe.couleur + "18", color: axe.couleur }}>
                                  KPI: {action.kpiImpacte}
                                </span>
                              )}
                              {action.impactFinancier > 0 && (
                                <span className="text-[10px] font-bold" style={{ color: "#00d4aa" }}>
                                  ~{formatEuro(action.impactFinancier)}/an recyclé
                                </span>
                              )}
                            </div>
                            {/* Progress bar */}
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surfaceAlt)" }}>
                                <div className="h-full rounded-full transition-all" style={{ width: `${action.avancement}%`, background: sc.color }} />
                              </div>
                              <span className="text-[10px] shrink-0" style={{ color: sc.color }}>{action.avancement}%</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <select value={action.statut}
                              onChange={(e) => updateStatut(action.id, e.target.value as PAPStatut)}
                              className="rounded-lg px-2 py-1 text-[10px] border font-semibold"
                              style={{ background: sc.bg, borderColor: "transparent", color: sc.color }}>
                              {(["À lancer", "En cours", "Terminé", "Abandonné"] as PAPStatut[]).map((s) => (
                                <option key={s} value={s} style={{ background: "var(--surface)" }}>{s}</option>
                              ))}
                            </select>
                            <button onClick={() => openForm(action.axeId, action)}
                              className="text-[10px] px-1.5 py-1 rounded" style={{ color: "var(--textDim)" }}>✏</button>
                            <button onClick={() => deleteAction(action.id)}
                              className="text-[10px] px-1.5 py-1 rounded" style={{ color: "var(--textDim)" }}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Vue GANTT ─────────────────────────────────────── */}
      {view === "gantt" && (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {/* Header mois */}
          <div className="flex border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="w-48 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest shrink-0" style={{ color: "var(--textMuted)" }}>
              Action
            </div>
            <div className="flex-1 grid border-l" style={{ gridTemplateColumns: `repeat(6, 1fr)`, borderColor: "var(--border)" }}>
              {MONTHS.map((m, i) => {
                const d = new Date(ganttStart);
                d.setMonth(d.getMonth() + i);
                return (
                  <div key={m} className="px-2 py-2.5 text-center text-[10px] font-semibold border-r last:border-r-0"
                    style={{ borderColor: "var(--border)", color: "var(--textMuted)" }}>
                    {d.toLocaleString("fr-FR", { month: "short" })}
                  </div>
                );
              })}
            </div>
          </div>

          {actions.filter((a) => a.statut !== "Abandonné").sort((a, b) => {
            const order: Record<PAPDuree, number> = { court: 0, moyen: 1, long: 2 };
            return order[a.duree] - order[b.duree];
          }).map((action, idx) => {
            const axe = axes.find((ax) => ax.id === action.axeId);
            const dc = DUREE_LABELS[action.duree];
            const sc = STATUT_COLORS[action.statut];
            const startPct = action.echeance ? Math.max(0, ganttPos(action.echeance) - dureeWidth(action.duree)) : idx * 10;
            const widthPct = dureeWidth(action.duree);
            return (
              <div key={action.id} className="flex items-center border-b last:border-b-0"
                style={{ background: idx % 2 === 0 ? "var(--surfaceAlt)" : "var(--surface)", borderColor: "var(--border)" }}>
                <div className="w-48 px-4 py-3 shrink-0">
                  <div className="text-[11px] font-semibold truncate" style={{ color: "var(--text)" }}>{action.action}</div>
                  {axe && <div className="text-[10px]" style={{ color: axe.couleur }}>{axe.label}</div>}
                </div>
                <div className="flex-1 relative h-10 border-l" style={{ borderColor: "var(--border)" }}>
                  {/* Today marker */}
                  <div className="absolute top-0 bottom-0 w-px z-10" style={{ left: `${ganttPos(new Date().toISOString())}%`, background: "#ff4d6a60" }} />
                  {/* Bar */}
                  <div className="absolute top-1/2 -translate-y-1/2 h-5 rounded-lg flex items-center px-2"
                    style={{ left: `${startPct}%`, width: `${widthPct}%`, background: dc.color + "30", border: `1px solid ${dc.color}40` }}>
                    <span className="text-[9px] font-semibold truncate" style={{ color: dc.color }}>{action.responsable || "—"}</span>
                  </div>
                  {/* Progress */}
                  <div className="absolute top-1/2 -translate-y-1/2 h-5 rounded-lg overflow-hidden"
                    style={{ left: `${startPct}%`, width: `${widthPct * action.avancement / 100}%`, background: dc.color + "60" }} />
                </div>
                <div className="w-24 px-3 text-right shrink-0">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: sc.bg, color: sc.color }}>{action.statut}</span>
                </div>
              </div>
            );
          })}

          {actions.filter((a) => a.statut !== "Abandonné").length === 0 && (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: "var(--textMuted)" }}>
              Aucune action planifiée — ajoutez des actions dans la vue Axes.
            </div>
          )}
        </div>
      )}

      {/* ── Modal formulaire ─────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "#00000080" }}
            onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="rounded-2xl border p-6 w-full max-w-lg space-y-4"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>
                {editActionId ? "Modifier" : "Nouvelle action"} — {axes.find((a) => a.id === formAxeId)?.label}
              </div>

              {[
                { key: "objectif" as const, label: "Objectif SMART (résultat attendu)", placeholder: "ex: Réduire le stock âgé de 48% à 30% d'ici 3 mois" },
                { key: "action" as const, label: "Action concrète *", placeholder: "ex: Identifier les 20 références les plus anciennes et lancer une promo" },
                { key: "responsable" as const, label: "Porteur de l'action", placeholder: "ex: Marie" },
                { key: "kpiImpacte" as const, label: "KPI impacté", placeholder: "ex: Stock âgé" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>{label}</label>
                  <input value={form[key] ?? ""} placeholder={placeholder}
                    onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-[12px] border"
                    style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }} />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Durée</label>
                  <select value={form.duree ?? "court"} onChange={(e) => setForm((p) => ({ ...p, duree: e.target.value as PAPDuree }))}
                    className="w-full rounded-xl px-3 py-2 text-[12px] border"
                    style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}>
                    {(Object.entries(DUREE_LABELS) as [PAPDuree, typeof DUREE_LABELS[PAPDuree]][]).map(([k, v]) => (
                      <option key={k} value={k} style={{ background: "var(--surface)" }}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Échéance</label>
                  <input type="date" value={form.echeance ?? ""} onChange={(e) => setForm((p) => ({ ...p, echeance: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2 text-[12px] border"
                    style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }} />
                </div>
                <div>
                  <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Statut</label>
                  <select value={form.statut ?? "À lancer"} onChange={(e) => setForm((p) => ({ ...p, statut: e.target.value as PAPStatut }))}
                    className="w-full rounded-xl px-3 py-2 text-[12px] border"
                    style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}>
                    {(["À lancer", "En cours", "Terminé", "Abandonné"] as PAPStatut[]).map((s) => (
                      <option key={s} value={s} style={{ background: "var(--surface)" }}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>
                    Impact financier estimé ({formatEuro(chvacv)}/h CHVACV)
                  </label>
                  <div className="relative">
                    <input type="number" min={0} value={form.impactFinancier ?? 0}
                      onChange={(e) => setForm((p) => ({ ...p, impactFinancier: Number(e.target.value) || 0 }))}
                      className="w-full rounded-xl px-3 py-2 pr-8 text-[12px] border"
                      style={{ background: "var(--surfaceAlt)", borderColor: "#00d4aa40", color: "#00d4aa" }} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: "var(--textDim)" }}>€</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Avancement ({form.avancement ?? 0}%)</label>
                <input type="range" min={0} max={100} step={5} value={form.avancement ?? 0}
                  onChange={(e) => setForm((p) => ({ ...p, avancement: Number(e.target.value) }))}
                  className="w-full" />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={submitForm} disabled={!form.action}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-bold disabled:opacity-40"
                  style={{ background: "var(--accent)", color: "#000" }}>
                  {editActionId ? "Mettre à jour" : "Ajouter l'action"}
                </button>
                <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl text-[12px] border"
                  style={{ borderColor: "var(--border)", color: "var(--textMuted)" }}>
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Note MSE ─────────────────────────────────────── */}
      <div className="rounded-2xl p-4 border text-[11px]"
        style={{ background: "var(--surface)", borderColor: "#4da6ff30", borderLeft: "3px solid #4da6ff", color: "var(--textMuted)" }}>
        <strong style={{ color: "#4da6ff" }}>Méthode ISEOR — PAP.</strong>
        {" "}Le PAP n&apos;est pas une liste de tâches. C&apos;est un plan structuré en <strong style={{ color: "var(--text)" }}>axes stratégiques</strong>,
        chacun avec des objectifs SMART et des actions portées par des personnes nommées.
        Revue tous les 6 mois. <strong style={{ color: "var(--text)" }}>Chaque action est liée à un coût caché recyclé.</strong>
      </div>
    </div>
  );
}

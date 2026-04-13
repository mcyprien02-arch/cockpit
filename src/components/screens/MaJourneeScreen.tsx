"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { buildMagasinContext } from "@/lib/buildContext";
import { runDecideur, type ActionDecideur } from "@/lib/agents";

// ─── Types ────────────────────────────────────────────────────
interface Mission {
  titre: string;
  description: string;
  priorite: "critique" | "haute" | "normale";
  source: "pap" | "kpi" | "calendrier";
  icone: string;
  papId?: string;
}

interface PAPAction {
  id: string;
  titre: string;
  statut: string;
  priorite: string;
  echeance?: string;
  impactEuros?: number;
}

// ─── Saisonnalité commerciale ─────────────────────────────────
const CALENDRIER: Record<number, { label: string; action: string; emoji: string }> = {
  1:  { label: "Janvier",    action: "Soldes d'hiver — pousser les destockages produits électro",             emoji: "❄️" },
  2:  { label: "Février",    action: "Saint-Valentin — mettre en avant les cadeaux et bijoux",                emoji: "💝" },
  3:  { label: "Mars",       action: "Rentrée gaming — smartphones et consoles en vedette",                   emoji: "🎮" },
  4:  { label: "Avril",      action: "Printemps — vélos, outillage, mobilier outdoor à proposer",             emoji: "🌸" },
  5:  { label: "Mai",        action: "Fête des Mères — bijoux, téléphones, sacs en avant",                    emoji: "💐" },
  6:  { label: "Juin",       action: "Fête des Pères — outillage, électro, jeux vidéo",                      emoji: "👔" },
  7:  { label: "Juillet",    action: "Soldes d'été — accélérer le stock âgé, animation prix",                emoji: "☀️" },
  8:  { label: "Août",       action: "Vacances — flux réduit, idéal pour rangement et réorganisation",       emoji: "🏖️" },
  9:  { label: "Septembre",  action: "Rentrée scolaire — calculatrices, cartables, fournitures bureautique", emoji: "📚" },
  10: { label: "Octobre",    action: "Halloween + Black Friday anticipé — déco, jeux, préparer stocks",      emoji: "🎃" },
  11: { label: "Novembre",   action: "Black Friday — préparer les lots à 15€, 30€, 50€",                     emoji: "🛒" },
  12: { label: "Décembre",   action: "Noël — console, téléphone, bijoux = top 3 cadeaux, stocks max",        emoji: "🎄" },
};

// ─── Mission algorithm ────────────────────────────────────────
function computeMission(papActions: PAPAction[], month: number): Mission[] {
  const missions: Mission[] = [];
  const today = new Date();

  const late = papActions.filter(a => {
    if (a.statut === "Fait" || a.statut === "Terminé" || a.statut === "Abandonné") return false;
    if (!a.echeance) return false;
    return new Date(a.echeance) <= today;
  });

  late.slice(0, 2).forEach(a => {
    missions.push({
      titre: a.titre,
      description: "Action PAP en retard — à traiter aujourd'hui",
      priorite: "critique",
      source: "pap",
      icone: "🔴",
      papId: a.id,
    });
  });

  const haute = papActions.filter(a =>
    a.statut !== "Fait" && a.statut !== "Terminé" && a.statut !== "Abandonné" &&
    (a.priorite === "haute" || a.priorite === "P1") &&
    !late.find(l => l.id === a.id)
  );
  haute.slice(0, 1).forEach(a => {
    missions.push({
      titre: a.titre,
      description: "Action haute priorité en cours",
      priorite: "haute",
      source: "pap",
      icone: "🟠",
      papId: a.id,
    });
  });

  const cal = CALENDRIER[month];
  if (cal) {
    missions.push({
      titre: `${cal.emoji} Action ${cal.label}`,
      description: cal.action,
      priorite: "normale",
      source: "calendrier",
      icone: cal.emoji,
    });
  }

  if (missions.length === 0) {
    missions.push({
      titre: "Vérifier les KPIs du jour",
      description: "Ouvrir l'onglet Diagnostic et valider les indicateurs clés",
      priorite: "normale",
      source: "kpi",
      icone: "📊",
    });
  }

  return missions.slice(0, 3);
}

// ─── Streak logic ─────────────────────────────────────────────
function loadStreak(): { count: number; lastDate: string } {
  try {
    const raw = localStorage.getItem("journee_streak");
    if (!raw) return { count: 0, lastDate: "" };
    return JSON.parse(raw);
  } catch {
    return { count: 0, lastDate: "" };
  }
}

function updateStreak(): number {
  const today     = new Date().toISOString().split("T")[0];
  const streak    = loadStreak();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  let newCount: number;
  if (streak.lastDate === today)      newCount = streak.count;
  else if (streak.lastDate === yesterday) newCount = streak.count + 1;
  else                                newCount = 1;
  try { localStorage.setItem("journee_streak", JSON.stringify({ count: newCount, lastDate: today })); } catch { /* ignore */ }
  return newCount;
}

// ─── GMROI Gauge ─────────────────────────────────────────────
function GmroiGauge({ gmroi }: { gmroi: number | null }) {
  const BOTTOM = 2.4;
  const TOP    = 3.8;
  const pct    = gmroi !== null
    ? Math.max(0, Math.min(100, ((gmroi - BOTTOM) / (TOP - BOTTOM)) * 100))
    : null;
  const color  = gmroi === null ? "#555a6e"
    : gmroi >= 3.5 ? "#00d4aa"
    : gmroi >= 2.8 ? "#ffb347"
    : "#ff4d6a";

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--textDim)" }}>
          GMROI — Position réseau
        </div>
        <div className="text-[22px] font-black" style={{ color }}>
          {gmroi !== null ? gmroi.toFixed(2) : "—"}
        </div>
      </div>

      {/* Track */}
      <div className="relative h-4 rounded-full overflow-visible" style={{ background: "#2a2e3a" }}>
        {/* Gradient fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{
            width: pct !== null ? `${pct}%` : "0%",
            background: `linear-gradient(90deg, #ff4d6a, #ffb347, #00d4aa)`,
          }}
        />
        {/* Thumb */}
        {pct !== null && (
          <motion.div
            initial={{ left: "0%" }}
            animate={{ left: `${Math.max(3, pct - 1.5)}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white"
            style={{ background: color, boxShadow: `0 0 8px ${color}88` }}
          />
        )}
        {/* Bench marks */}
        {/* Network average ~3.1 */}
        <div
          className="absolute top-0 bottom-0 w-0.5 rounded"
          style={{
            left: `${((3.1 - BOTTOM) / (TOP - BOTTOM)) * 100}%`,
            background: "#ffffff40",
          }}
        />
      </div>

      <div className="flex justify-between mt-1.5 text-[9px]" style={{ color: "var(--textDim)" }}>
        <span>Bottom réseau {BOTTOM}</span>
        <span style={{ color: "#ffffff60" }}>↑ Réseau moy. 3.1</span>
        <span>Top réseau {TOP}</span>
      </div>

      {gmroi !== null && gmroi < 2.4 && (
        <div className="mt-2 text-[11px] rounded-lg px-3 py-1.5" style={{ background: "#ff4d6a10", color: "#ff4d6a" }}>
          ⚠ GMROI sous le bas du réseau. Réduction de stock âgé prioritaire.
        </div>
      )}
      {gmroi !== null && gmroi >= 3.5 && (
        <div className="mt-2 text-[11px] rounded-lg px-3 py-1.5" style={{ background: "#00d4aa10", color: "#00d4aa" }}>
          ✓ Dans le top du réseau. Maintenez la discipline de rotation.
        </div>
      )}
    </div>
  );
}

// ─── Countdown helper ─────────────────────────────────────────
function Countdown({ echeance, isLate }: { echeance: string; isLate: boolean }) {
  const today = new Date();
  const due   = new Date(echeance);
  const diff  = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const absDiff = Math.abs(diff);

  if (isLate) {
    return (
      <span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: "#ff4d6a20", color: "#ff4d6a" }}>
        EN RETARD {absDiff}j
      </span>
    );
  }
  return (
    <span className="text-[10px] rounded-full px-2 py-0.5" style={{ background: "#ffb34720", color: "#ffb347" }}>
      dans {diff}j
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────
interface MaJourneeScreenProps {
  magasinId: string;
}

export function MaJourneeScreen({ magasinId }: MaJourneeScreenProps) {
  const [papActions, setPapActions]       = useState<PAPAction[]>([]);
  const [actionsMonth, setActionsMonth]   = useState<PAPAction[]>([]);
  const [missions, setMissions]           = useState<Mission[]>([]);
  const [streak, setStreak]               = useState(0);
  const [checkedMissions, setCheckedMissions] = useState<Set<number>>(new Set());
  const [loading, setLoading]             = useState(true);
  const [showConfetti, setShowConfetti]   = useState(false);
  const [gmroi, setGmroi]                 = useState<number | null>(null);
  const [iaActions, setIaActions]         = useState<ActionDecideur[] | null>(null);

  const month = new Date().getMonth() + 1;
  const cal   = CALENDRIER[month];
  const hour  = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  const mapRow = (r: Record<string, unknown>): PAPAction => ({
    id:     String(r.id ?? ""),
    titre:  String(r.action ?? r.titre ?? ""),
    statut: String(r.statut ?? "todo"),
    priorite: String(r.priorite ?? "normale"),
    echeance: r.echeance ? String(r.echeance) : undefined,
  });

  const loadData = useCallback(async () => {
    if (!magasinId) { setLoading(false); return; }

    try {
      // All non-done PAP actions
      const { data } = await (supabase as any)
        .from("plans_action")
        .select("id, action, titre, statut, priorite, echeance")
        .eq("magasin_id", magasinId)
        .not("statut", "in", '("Fait","Terminé","Abandonné")')
        .order("priorite", { ascending: false })
        .limit(20);

      const actions: PAPAction[] = (data ?? []).map(mapRow);
      setPapActions(actions);
      setMissions(computeMission(actions, month));

      // Monthly actions
      const now         = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

      const { data: monthData } = await (supabase as any)
        .from("plans_action")
        .select("id, action, titre, statut, priorite, echeance")
        .eq("magasin_id", magasinId)
        .not("statut", "in", '("Fait","Terminé","Abandonné")')
        .gte("echeance", startOfMonth)
        .lte("echeance", endOfMonth)
        .order("echeance", { ascending: true });

      setActionsMonth((monthData ?? []).map(mapRow));

      // GMROI from last values
      const { data: gmroiData } = await (supabase as any)
        .from("v_dernieres_valeurs")
        .select("valeur, indicateur_nom")
        .eq("magasin_id", magasinId)
        .ilike("indicateur_nom", "%gmroi%")
        .limit(1);

      if (gmroiData && gmroiData.length > 0) {
        setGmroi(Number(gmroiData[0].valeur));
      }
    } catch {
      setMissions(computeMission([], month));
    }

    const s = updateStreak();
    setStreak(s);
    setLoading(false);

    // Auto-run IA Décideur (non-blocking)
    try {
      const ctx = await buildMagasinContext(magasinId);
      const acts = await runDecideur(ctx);
      if (acts.length > 0) setIaActions(acts);
    } catch { /* IA is optional */ }
  }, [magasinId, month]);

  useEffect(() => { loadData(); }, [loadData]);

  const markDone = async (actionId: string, currentStatut: string) => {
    const newStatut = currentStatut === "Fait" ? "En cours" : "Fait";
    await (supabase as any)
      .from("plans_action")
      .update({ statut: newStatut })
      .eq("id", actionId);
    loadData();
  };

  const reportAction = async (actionId: string, newDate: string) => {
    await (supabase as any)
      .from("plans_action")
      .update({ echeance: newDate })
      .eq("id", actionId);
    loadData();
  };

  const toggleMission = async (idx: number) => {
    const mission = missions[idx];
    setCheckedMissions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
        if (next.size === missions.length) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 3000);
        }
      }
      return next;
    });
    if (mission?.source === "pap" && mission.papId) {
      const newStatut = checkedMissions.has(idx) ? "En cours" : "Fait";
      await (supabase as any)
        .from("plans_action")
        .update({ statut: newStatut })
        .eq("id", mission.papId);
      loadData();
    }
  };

  const priColors: Record<string, string> = {
    critique: "#ff4d6a",
    haute:    "#ffb347",
    normale:  "#00d4aa",
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
        ))}
      </div>
    );
  }

  const allDone = checkedMissions.size === missions.length && missions.length > 0;

  return (
    <div className="space-y-6 max-w-[900px]">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6"
        style={{ background: "linear-gradient(135deg, #1a2a3a, #0d1f2d)", border: "1px solid #00d4aa30" }}
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-[22px] font-bold" style={{ color: "#fff" }}>
              {greeting} 👋
            </div>
            <div className="text-[13px] mt-1" style={{ color: "#8fa3b3" }}>
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>

          {/* Streak */}
          <div
            className="flex items-center gap-3 rounded-xl px-5 py-3"
            style={{ background: "#00d4aa15", border: "1px solid #00d4aa30" }}
          >
            <span className="text-[28px]">🔥</span>
            <div>
              <div className="text-[22px] font-bold" style={{ color: "#00d4aa" }}>{streak}</div>
              <div className="text-[10px]" style={{ color: "#8fa3b3" }}>jours de suite</div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold" style={{ color: "#8fa3b3" }}>
              MISSIONS DU JOUR
            </span>
            <span className="text-[11px] font-semibold" style={{ color: "#00d4aa" }}>
              {checkedMissions.size}/{missions.length} complétées
            </span>
          </div>
          <div className="rounded-full h-2 overflow-hidden" style={{ background: "#ffffff15" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, #00d4aa, #00b894)" }}
              animate={{ width: `${missions.length > 0 ? (checkedMissions.size / missions.length) * 100 : 0}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      </motion.div>

      {/* Confetti */}
      <AnimatePresence>
        {showConfetti && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="rounded-2xl p-5 text-center"
            style={{ background: "linear-gradient(135deg, #00d4aa20, #00b89420)", border: "2px solid #00d4aa" }}
          >
            <div className="text-[36px] mb-2">🎉</div>
            <div className="text-[16px] font-bold" style={{ color: "#00d4aa" }}>Toutes les missions accomplies !</div>
            <div className="text-[12px] mt-1" style={{ color: "var(--textMuted)" }}>Excellent travail. Votre streak continue !</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GMROI Gauge */}
      <GmroiGauge gmroi={gmroi} />

      {/* Missions */}
      <div>
        <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "var(--textDim)" }}>
          PRIORITÉS DU JOUR
        </div>
        <div className="space-y-3">
          {missions.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="rounded-2xl p-4 flex items-start gap-4 cursor-pointer transition-all"
              style={{
                background: checkedMissions.has(i) ? "#00d4aa08" : "var(--surface)",
                border:     checkedMissions.has(i) ? "1px solid #00d4aa40" : "1px solid var(--border)",
                opacity:    checkedMissions.has(i) ? 0.7 : 1,
              }}
              onClick={() => toggleMission(i)}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all"
                style={{
                  background: checkedMissions.has(i) ? "#00d4aa" : "transparent",
                  border: `2px solid ${checkedMissions.has(i) ? "#00d4aa" : priColors[m.priorite]}`,
                }}
              >
                {checkedMissions.has(i) && <span className="text-[10px] text-black font-bold">✓</span>}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-semibold" style={{
                    color: "var(--text)",
                    textDecoration: checkedMissions.has(i) ? "line-through" : "none",
                  }}>
                    {m.icone} {m.titre}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                    style={{ background: priColors[m.priorite] + "20", color: priColors[m.priorite] }}
                  >
                    {m.priorite}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold"
                    style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)" }}>
                    {m.source === "pap" ? "PAP" : m.source === "calendrier" ? "Calendrier" : "KPI"}
                  </span>
                </div>
                <div className="text-[12px] mt-1" style={{ color: "var(--textMuted)" }}>
                  {m.description}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Actions du mois */}
      {actionsMonth.length > 0 ? (
        <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "var(--textDim)" }}>
            ACTIONS DU MOIS ({actionsMonth.length})
          </div>
          <div className="space-y-3">
            {actionsMonth.map(a => {
              const now    = new Date();
              const isLate = a.echeance ? new Date(a.echeance) < now : false;
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{
                    background: isLate ? "#ff4d6a08" : "var(--surfaceAlt)",
                    border: isLate ? "1px solid #ff4d6a20" : "1px solid transparent",
                  }}
                >
                  <span style={{ color: isLate ? "#ff4d6a" : "#ffb347", fontSize: 13 }}>
                    {isLate ? "⚠" : "○"}
                  </span>
                  <span className="flex-1 text-[12px]" style={{ color: "var(--text)" }}>{a.titre}</span>
                  <div className="flex items-center gap-2">
                    {a.echeance && (
                      <Countdown echeance={a.echeance} isLate={isLate} />
                    )}
                    {/* Fait button */}
                    <button
                      onClick={() => markDone(a.id, a.statut)}
                      className="text-[10px] font-semibold rounded-full px-2.5 py-1 transition-all"
                      style={{ background: "#00d4aa20", color: "#00d4aa", border: "none", cursor: "pointer" }}
                    >
                      Fait ✓
                    </button>
                    {/* Reporter button */}
                    <button
                      onClick={() => {
                        const newDate = prompt("Nouvelle échéance (YYYY-MM-DD) :");
                        if (newDate && /^\d{4}-\d{2}-\d{2}$/.test(newDate)) reportAction(a.id, newDate);
                      }}
                      className="text-[10px] font-semibold rounded-full px-2.5 py-1 transition-all"
                      style={{ background: "var(--surfaceAlt)", color: "var(--textDim)", border: "1px solid var(--border)", cursor: "pointer" }}
                    >
                      Reporter
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className="rounded-2xl p-5 text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="text-[28px] mb-2">📅</div>
          <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            Aucune action planifiée ce mois
          </div>
          <div className="text-[11px] mt-1" style={{ color: "var(--textMuted)" }}>
            Allez dans Diagnostic pour identifier vos priorités, puis créez un PAP.
          </div>
        </div>
      )}

      {/* IA Décideur suggestions */}
      {iaActions && iaActions.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid #7c3aed30" }}>
          <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "#a855f7" }}>
            🧠 PRIORITÉS IA
          </div>
          <div className="space-y-2">
            {iaActions.slice(0, 3).map((a, i) => {
              const col = a.priorite === "P1" ? "#ff4d6a" : a.priorite === "P2" ? "#ffb347" : "#00d4aa";
              return (
                <div key={i} className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: `${col}0d`, border: `1px solid ${col}20` }}>
                  <span className="text-[10px] font-bold rounded px-1.5 py-0.5 mt-0.5"
                    style={{ background: `${col}30`, color: col }}>{a.priorite}</span>
                  <div className="flex-1">
                    <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{a.action}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--textMuted)" }}>{a.pourquoi}</div>
                  </div>
                  <span className="text-[10px] shrink-0" style={{ color: "var(--textDim)" }}>
                    {a.echeance_jours}j
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Commercial calendar */}
      <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-[11px] font-bold mb-4 tracking-wider" style={{ color: "var(--textDim)" }}>
          CALENDRIER COMMERCIAL
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {Object.entries(CALENDRIER).map(([m, info]) => {
            const mNum     = parseInt(m);
            const isCurrent = mNum === month;
            return (
              <div
                key={m}
                className="rounded-xl p-2 text-center transition-all"
                style={{
                  background: isCurrent ? "#00d4aa15" : "var(--surfaceAlt)",
                  border:     isCurrent ? "1px solid #00d4aa40" : "1px solid transparent",
                }}
              >
                <div className="text-[18px]">{info.emoji}</div>
                <div className="text-[9px] font-bold mt-0.5"
                  style={{ color: isCurrent ? "#00d4aa" : "var(--textMuted)" }}>
                  {info.label.slice(0, 3).toUpperCase()}
                </div>
              </div>
            );
          })}
        </div>
        {cal && (
          <div className="mt-4 rounded-xl p-3 text-[12px]"
            style={{ background: "#00d4aa10", color: "var(--textMuted)", border: "1px solid #00d4aa20" }}>
            <span className="font-semibold" style={{ color: "#00d4aa" }}>Ce mois-ci ({cal.label}) :</span>{" "}
            {cal.action}
          </div>
        )}
      </div>

      {/* PAP pending quick view */}
      {papActions.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "var(--textDim)" }}>
            TOUTES LES ACTIONS PAP EN COURS ({papActions.length})
          </div>
          <div className="space-y-2">
            {papActions.slice(0, 5).map(a => {
              const isLate = a.echeance && new Date(a.echeance) < new Date();
              return (
                <div key={a.id} className="flex items-center gap-3 text-[12px]">
                  <span style={{ color: isLate ? "#ff4d6a" : "#ffb347" }}>
                    {isLate ? "⚠" : "○"}
                  </span>
                  <span style={{ color: "var(--text)" }}>{a.titre}</span>
                  {a.echeance && (
                    <span style={{ color: isLate ? "#ff4d6a" : "var(--textDim)", marginLeft: "auto" }}>
                      {new Date(a.echeance).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </div>
              );
            })}
            {papActions.length > 5 && (
              <div className="text-[11px] mt-1" style={{ color: "var(--textDim)" }}>
                +{papActions.length - 5} autres actions
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

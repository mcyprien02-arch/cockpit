"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────
interface Mission {
  titre: string;
  description: string;
  priorite: "critique" | "haute" | "normale";
  source: "pap" | "kpi" | "calendrier";
  icone: string;
}

interface PAPAction {
  id: string;
  titre: string;
  statut: string;
  priorite: string;
  echeance?: string;
}

// ─── Saisonnalité commerciale ─────────────────────────────────
const CALENDRIER: Record<number, { label: string; action: string; emoji: string }> = {
  1:  { label: "Janvier",   action: "Soldes d'hiver — pousser les destockages produits électro",         emoji: "❄️" },
  2:  { label: "Février",   action: "Saint-Valentin — mettre en avant les cadeaux et bijoux",             emoji: "💝" },
  3:  { label: "Mars",      action: "Rentrée gaming — smartphones et consoles en vedette",                emoji: "🎮" },
  4:  { label: "Avril",     action: "Printemps — vélos, outillage, mobilier outdoor à proposer",          emoji: "🌸" },
  5:  { label: "Mai",       action: "Fête des Mères — bijoux, téléphones, sacs en avant",                 emoji: "💐" },
  6:  { label: "Juin",      action: "Fête des Pères — outillage, électro, jeux vidéo",                   emoji: "👔" },
  7:  { label: "Juillet",   action: "Soldes d'été — accélérer le stock âgé, animation prix",             emoji: "☀️" },
  8:  { label: "Août",      action: "Vacances — flux réduit, idéal pour rangement et réorganisation",    emoji: "🏖️" },
  9:  { label: "Septembre", action: "Rentrée scolaire — calculatrices, cartables, fournitures bureautique", emoji: "📚" },
  10: { label: "Octobre",   action: "Halloween + Black Friday anticipé — déco, jeux, préparer stocks",   emoji: "🎃" },
  11: { label: "Novembre",  action: "Black Friday — préparer les lots à 15€, 30€, 50€",                  emoji: "🛒" },
  12: { label: "Décembre",  action: "Noël — console, téléphone, bijoux = top 3 cadeaux, stocks max",     emoji: "🎄" },
};

// ─── Mission algorithm ────────────────────────────────────────
function computeMission(papActions: PAPAction[], month: number): Mission[] {
  const missions: Mission[] = [];
  const today = new Date();

  // 1. PAP actions late or due today
  const late = papActions.filter(a => {
    if (a.statut === "done") return false;
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
    });
  });

  // 2. High priority PAP not done
  const haute = papActions.filter(a => a.statut !== "done" && a.priorite === "haute" && !late.find(l => l.id === a.id));
  haute.slice(0, 1).forEach(a => {
    missions.push({
      titre: a.titre,
      description: "Action haute priorité en cours",
      priorite: "haute",
      source: "pap",
      icone: "🟠",
    });
  });

  // 3. Seasonal action
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

  // Fill with generic if not enough
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
  const today = new Date().toISOString().split("T")[0];
  const streak = loadStreak();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  let newCount: number;
  if (streak.lastDate === today) {
    newCount = streak.count;
  } else if (streak.lastDate === yesterday) {
    newCount = streak.count + 1;
  } else {
    newCount = 1;
  }

  try {
    localStorage.setItem("journee_streak", JSON.stringify({ count: newCount, lastDate: today }));
  } catch { /* ignore */ }

  return newCount;
}

// ─── Main Component ───────────────────────────────────────────
interface MaJourneeScreenProps {
  magasinId: string;
}

export function MaJourneeScreen({ magasinId }: MaJourneeScreenProps) {
  const [papActions, setPapActions] = useState<PAPAction[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [streak, setStreak] = useState(0);
  const [checkedMissions, setCheckedMissions] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);

  const month = new Date().getMonth() + 1;
  const cal = CALENDRIER[month];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  const loadData = useCallback(async () => {
    if (!magasinId) { setLoading(false); return; }

    try {
      const { data } = await (supabase as any)
        .from("plans_action")
        .select("id, titre, statut, priorite, echeance")
        .eq("magasin_id", magasinId)
        .neq("statut", "done")
        .order("priorite", { ascending: false })
        .limit(20);

      const actions: PAPAction[] = (data ?? []).map((r: any) => ({
        id: r.id,
        titre: r.titre,
        statut: r.statut ?? "todo",
        priorite: r.priorite ?? "normale",
        echeance: r.echeance,
      }));
      setPapActions(actions);
      setMissions(computeMission(actions, month));
    } catch {
      setMissions(computeMission([], month));
    }

    const s = updateStreak();
    setStreak(s);
    setLoading(false);
  }, [magasinId, month]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleMission = (idx: number) => {
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
  };

  const priColors: Record<string, string> = {
    critique: "#ff4d6a",
    haute: "#ffb347",
    normale: "#00d4aa",
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

        {/* Progress */}
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

      {/* Confetti celebration */}
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
            <div className="text-[16px] font-bold" style={{ color: "#00d4aa" }}>Toutes les missions du jour accomplies !</div>
            <div className="text-[12px] mt-1" style={{ color: "var(--textMuted)" }}>Excellent travail. Votre streak continue !</div>
          </motion.div>
        )}
      </AnimatePresence>

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
                border: checkedMissions.has(i) ? "1px solid #00d4aa40" : "1px solid var(--border)",
                opacity: checkedMissions.has(i) ? 0.7 : 1,
              }}
              onClick={() => toggleMission(i)}
            >
              {/* Checkbox */}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all"
                style={{
                  background: checkedMissions.has(i) ? "#00d4aa" : "transparent",
                  border: `2px solid ${checkedMissions.has(i) ? "#00d4aa" : priColors[m.priorite]}`,
                }}
              >
                {checkedMissions.has(i) && (
                  <span className="text-[10px] text-black font-bold">✓</span>
                )}
              </div>

              {/* Content */}
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
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-semibold"
                    style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)" }}
                  >
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

      {/* Commercial calendar */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="text-[11px] font-bold mb-4 tracking-wider" style={{ color: "var(--textDim)" }}>
          CALENDRIER COMMERCIAL
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {Object.entries(CALENDRIER).map(([m, info]) => {
            const mNum = parseInt(m);
            const isCurrent = mNum === month;
            return (
              <div
                key={m}
                className="rounded-xl p-2 text-center transition-all"
                style={{
                  background: isCurrent ? "#00d4aa15" : "var(--surfaceAlt)",
                  border: isCurrent ? "1px solid #00d4aa40" : "1px solid transparent",
                }}
              >
                <div className="text-[18px]">{info.emoji}</div>
                <div
                  className="text-[9px] font-bold mt-0.5"
                  style={{ color: isCurrent ? "#00d4aa" : "var(--textMuted)" }}
                >
                  {info.label.slice(0, 3).toUpperCase()}
                </div>
              </div>
            );
          })}
        </div>
        {cal && (
          <div
            className="mt-4 rounded-xl p-3 text-[12px]"
            style={{ background: "#00d4aa10", color: "var(--textMuted)", border: "1px solid #00d4aa20" }}
          >
            <span className="font-semibold" style={{ color: "#00d4aa" }}>Ce mois-ci ({cal.label}) :</span>{" "}
            {cal.action}
          </div>
        )}
      </div>

      {/* PAP pending quick view */}
      {papActions.length > 0 && (
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "var(--textDim)" }}>
            PAP EN COURS ({papActions.length})
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

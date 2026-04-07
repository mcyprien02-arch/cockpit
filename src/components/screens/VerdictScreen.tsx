"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { getStatus, computeScore } from "@/lib/scoring";
import { computeHiddenCosts, formatEuro } from "@/lib/hiddenCosts";
import type { ValeurAvecIndicateur } from "@/types";

// ─── Animated circular gauge ──────────────────────────────────
function CircleGauge({ score }: { score: number | null }) {
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (score === null) return;
    const start = Date.now();
    const duration = 1600;
    const to = score;
    const animate = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(to * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [score]);

  const R = 100;
  const SIZE = 260;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const circ = 2 * Math.PI * R;
  const fill = (displayed / 100) * circ;
  const color = displayed >= 70 ? "#00d4aa" : displayed >= 45 ? "#ffb347" : "#ff4d6a";
  const label = score === null ? "—" : displayed >= 80 ? "Excellent" : displayed >= 70 ? "Bon" : displayed >= 55 ? "Moyen" : displayed >= 40 ? "Insuffisant" : "Critique";

  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id="vGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.5" />
          </linearGradient>
          <filter id="vGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={CX} cy={CY} r={R + 10} fill="none" stroke={color} strokeWidth="1" opacity="0.12" />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#2a2e3a" strokeWidth="14" />
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke="url(#vGrad)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`}
          strokeDashoffset="0"
          filter="url(#vGlow)"
          style={{ transform: `rotate(-90deg)`, transformOrigin: `${CX}px ${CY}px`, transition: "stroke 0.5s ease" }}
        />
        <text x={CX} y={CY - 8} textAnchor="middle" dominantBaseline="middle" fill={color}
          fontSize="52" fontWeight="800" fontFamily="DM Sans, sans-serif"
          style={{ filter: `drop-shadow(0 0 12px ${color}88)` }}>
          {score === null ? "—" : displayed}
        </text>
        <text x={CX} y={CY + 32} textAnchor="middle" fill={color} fontSize="12"
          fontWeight="600" fontFamily="DM Sans, sans-serif" opacity="0.9">
          {label}
        </text>
        <text x={CX} y={CY + 48} textAnchor="middle" fill="#555a6e" fontSize="10"
          fontFamily="DM Sans, sans-serif">
          score /100
        </text>
      </svg>
    </div>
  );
}

// ─── Auto-narrative generator ─────────────────────────────────
function buildNarrative(
  score: number | null,
  alerts: { label: string; estimatedLoss: number | null }[],
  valeurs: ValeurAvecIndicateur[]
): string {
  const gmroi = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("gmroi"));
  const stockAge = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("stock âg"));

  // Phrase 1: état global
  const p1 = score === null
    ? "Saisissez vos KPIs pour obtenir votre verdict."
    : score >= 70
      ? "Votre magasin est en bonne santé."
      : score >= 45
        ? "Votre magasin est en vigilance."
        : "Votre magasin est en situation critique.";

  // Phrase 2: 2 causes principales
  const top2 = alerts.slice(0, 2).map(a => {
    // Shorten the label
    const s = a.label;
    const paren = s.indexOf("(");
    return paren > 0 ? s.slice(0, paren).trim() : s;
  });

  let p2 = "";
  if (top2.length === 2) {
    p2 = `${top2[0]} et ${top2[1].toLowerCase()} pèsent sur la performance.`;
  } else if (top2.length === 1) {
    p2 = `${top2[0]} est le principal frein à la performance.`;
  } else if (gmroi && gmroi.status !== "ok" && gmroi.valeur) {
    p2 = `Le GMROI à ${gmroi.valeur.toFixed(1)} (cible 3.84) indique un stock peu rentable.`;
  } else if (stockAge && stockAge.status !== "ok") {
    p2 = `Le stock âgé immobilise de la trésorerie et dégrade la marge.`;
  }

  // Phrase 3: gain potentiel €
  const totalGain = alerts.reduce((s, a) => s + (a.estimatedLoss ?? 0), 0);
  let p3 = "";
  if (totalGain >= 5000) {
    const k = totalGain >= 1000 ? `${Math.round(totalGain / 1000)} 000` : String(totalGain);
    p3 = `Vous pouvez récupérer ~${k}€/an en agissant sur ces points.`;
  } else if (score !== null && score >= 70) {
    p3 = "Continuez sur cette lancée et visez le niveau Excellence.";
  } else if (score !== null) {
    p3 = "Des actions ciblées peuvent améliorer significativement vos résultats.";
  }

  return [p1, p2, p3].filter(Boolean).join(" ");
}

// ─── Alert card ───────────────────────────────────────────────
interface AlertCardProps {
  rank: number;
  label: string;
  detail: string;
  kpiName: string;
  loss: number | null;
  severity: "dg" | "wn";
  valeurs: ValeurAvecIndicateur[];
  onCreateAction: () => void;
}
function AlertCard({ rank, label, detail, kpiName, loss, severity, valeurs, onCreateAction }: AlertCardProps) {
  const color = severity === "dg" ? "#ff4d6a" : "#ffb347";
  // Find KPI value for this alert
  const kpi = valeurs.find(v => v.indicateur_nom === kpiName);
  const seuil = kpi?.seuil_ok;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.08 }}
      className="rounded-2xl p-4"
      style={{ background: "var(--surface)", border: `1px solid ${color}30` }}
    >
      <div className="flex items-start gap-3">
        {/* Rank badge */}
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5"
          style={{ background: `${color}20`, color }}
        >
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="text-[13px] font-bold" style={{ color: "var(--text)" }}>{label}</div>
            {loss !== null && loss > 0 && (
              <div
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold shrink-0"
                style={{ background: `${color}18`, color }}
              >
                ~{formatEuro(loss)}/an
              </div>
            )}
          </div>

          {/* Detail + KPI value vs seuil */}
          <div className="text-[11px] mt-0.5 mb-2" style={{ color: "var(--textMuted)" }}>{detail}</div>

          {kpi && seuil !== null && (
            <div className="flex items-center gap-2 mb-3 text-[11px]">
              <span style={{ color }}>
                Actuel : <strong>{kpi.valeur?.toFixed?.(1) ?? kpi.valeur}{kpi.unite ? ` ${kpi.unite}` : ""}</strong>
              </span>
              <span style={{ color: "var(--textDim)" }}>→</span>
              <span style={{ color: "#00d4aa" }}>
                Cible : <strong>{seuil}{kpi.unite ? ` ${kpi.unite}` : ""}</strong>
              </span>
            </div>
          )}

          {/* Action button */}
          <button
            onClick={onCreateAction}
            className="rounded-xl px-3.5 py-1.5 text-[11px] font-bold transition-all"
            style={{
              background: `${color}15`,
              color,
              border: `1px solid ${color}30`,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + Créer action →
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Mission du jour ──────────────────────────────────────────
function MissionDuJour({
  alerts,
  papActions,
}: {
  alerts: { label: string; estimatedLoss: number | null; kpiName: string }[];
  papActions: { id: string; action: string; echeance?: string; priorite?: string }[];
}) {
  // Priority: PAP late → échéance < 3j → highest € KPI
  const today = new Date();
  const latePap = papActions.find(a => a.echeance && new Date(a.echeance) <= today);
  const urgentPap = papActions.find(a => {
    if (!a.echeance) return false;
    const d = (new Date(a.echeance).getTime() - today.getTime()) / 86400000;
    return d <= 3 && d >= 0;
  });
  const topAlert = alerts[0];

  const mission = latePap
    ? { text: latePap.action, why: "Action PAP en retard — à traiter en priorité", color: "#ff4d6a" }
    : urgentPap
      ? { text: urgentPap.action, why: "Échéance dans moins de 3 jours", color: "#ffb347" }
      : topAlert
        ? {
            text: `Agir sur : ${topAlert.kpiName}`,
            why: topAlert.estimatedLoss
              ? `Impact estimé : ${formatEuro(topAlert.estimatedLoss)}/an`
              : "KPI le plus critique du moment",
            color: "#00d4aa",
          }
        : null;

  if (!mission) return null;

  return (
    <div
      className="rounded-2xl p-4 flex items-start gap-3"
      style={{
        background: `${mission.color}0f`,
        border: `1px solid ${mission.color}30`,
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-[16px] shrink-0"
        style={{ background: `${mission.color}20` }}
      >
        🎯
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--textDim)" }}>
          MISSION DU JOUR
        </div>
        <div className="text-[13px] font-bold" style={{ color: "var(--text)" }}>{mission.text}</div>
        <div className="text-[11px] mt-0.5" style={{ color: mission.color }}>{mission.why}</div>
      </div>
    </div>
  );
}

// ─── GMROI widget ─────────────────────────────────────────────
function GmroiWidget({ valeurs }: { valeurs: ValeurAvecIndicateur[] }) {
  const gmroi = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("gmroi"));
  const stock = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("valeur stock"));
  if (!gmroi?.valeur) return null;

  const BENCHMARK = 3.84;
  const current = gmroi.valeur;
  const gap = BENCHMARK - current;
  const stockVal = stock?.valeur ?? 150000;
  const impactEuro = gap > 0 ? Math.round(gap * stockVal * 0.38) : 0;
  const color = current >= BENCHMARK ? "#00d4aa" : current >= 2.5 ? "#ffb347" : "#ff4d6a";

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--surface)", border: `1px solid ${color}30` }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--textDim)" }}>GMROI</div>
        <div className="text-[10px]" style={{ color: "var(--textDim)" }}>Cible réseau : 3.84</div>
      </div>
      <div className="flex items-end gap-4">
        <div className="text-[32px] font-black" style={{ color }}>{current.toFixed(2)}</div>
        {gap > 0.05 && (
          <div className="mb-1.5">
            <div className="text-[11px]" style={{ color: "#ff4d6a" }}>
              Écart : −{gap.toFixed(2)}
            </div>
            {impactEuro > 0 && (
              <div className="text-[11px] font-bold" style={{ color: "#ffb347" }}>
                ~{formatEuro(impactEuro)}/an bloqués
              </div>
            )}
          </div>
        )}
        {gap <= 0.05 && (
          <div className="mb-1.5 text-[11px] font-semibold" style={{ color: "#00d4aa" }}>
            Au-dessus de la cible ✓
          </div>
        )}
      </div>
      {/* Mini bar */}
      <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "#ffffff10" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, (current / Math.max(BENCHMARK, current)) * 100)}%`,
            background: color,
            transition: "width 1s ease",
          }}
        />
      </div>
    </div>
  );
}

// ─── Main VerdictScreen ───────────────────────────────────────
interface VerdictScreenProps {
  magasinId: string;
  onNavigate: (tab: string) => void;
  mode: "consultant" | "franchisé";
}

export function VerdictScreen({ magasinId, onNavigate, mode }: VerdictScreenProps) {
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [papActions, setPapActions] = useState<{ id: string; action: string; echeance?: string; priorite?: string }[]>([]);
  const [bonnesPratiques, setBonnesPratiques] = useState<{ action: string; magasinNom: string; kpi: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!magasinId) return;
    setLoading(true);

    const { data: vData } = await supabase
      .from("v_dernieres_valeurs")
      .select("*")
      .eq("magasin_id", magasinId);

    type VRow = {
      magasin_id: string; indicateur_id: string; valeur: number; date_saisie: string;
      indicateur_nom: string; unite: string | null; direction: "up" | "down";
      seuil_ok: number | null; seuil_vigilance: number | null; categorie: string;
      poids: number; action_defaut: string | null; magasin_nom: string;
    };

    const enriched: ValeurAvecIndicateur[] = ((vData ?? []) as VRow[]).map(r => ({
      ...r,
      status: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
    }));
    setValeurs(enriched);

    // Load PAP
    try {
      const { data: papData } = await (supabase as any)
        .from("plans_action")
        .select("id, action, echeance, priorite")
        .eq("magasin_id", magasinId)
        .neq("statut", "done")
        .order("priorite", { ascending: false })
        .limit(10);
      setPapActions((papData ?? []) as typeof papActions);
    } catch {
      try {
        const raw = localStorage.getItem(`pap_actions_${magasinId}`);
        if (raw) setPapActions(JSON.parse(raw));
      } catch { /* ignore */ }
    }

    // Load bonnes pratiques from DB
    try {
      const { data: bpData } = await (supabase as any)
        .from("bonnes_pratiques")
        .select("action_source, indicateur_nom, magasins(nom)")
        .eq("magasin_source_id", magasinId)
        .order("amelioration_pct", { ascending: false })
        .limit(3);
      if (bpData && bpData.length > 0) {
        setBonnesPratiques(bpData.map((r: any) => ({
          action: r.action_source,
          magasinNom: r.magasins?.nom ?? "Autre magasin",
          kpi: r.indicateur_nom,
        })));
      }
    } catch { /* table may not exist yet */ }

    setLoading(false);
  }, [magasinId]);

  useEffect(() => { loadData(); }, [loadData]);

  const score = computeScore(valeurs);
  const hiddenCosts = computeHiddenCosts(valeurs);
  // Sort by impact €, take top 3
  const top3Alerts = hiddenCosts
    .filter(c => c.estimatedLoss != null && c.estimatedLoss > 0)
    .sort((a, b) => (b.estimatedLoss ?? 0) - (a.estimatedLoss ?? 0))
    .slice(0, 3);

  const narrative = buildNarrative(score, top3Alerts, valeurs);
  const totalLoss = top3Alerts.reduce((s, a) => s + (a.estimatedLoss ?? 0), 0);
  const scoreColor = score === null ? "#555a6e" : score >= 70 ? "#00d4aa" : score >= 45 ? "#ffb347" : "#ff4d6a";

  if (loading) {
    return (
      <div className="space-y-4 max-w-[1000px]">
        <div className="h-64 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-32 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
          <div className="h-32 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
        </div>
      </div>
    );
  }

  // Empty state
  if (valeurs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center max-w-[500px] mx-auto">
        <div className="text-[48px] mb-4">📊</div>
        <div className="text-[18px] font-bold mb-2" style={{ color: "var(--text)" }}>Pas encore de KPIs</div>
        <div className="text-[13px] mb-6" style={{ color: "var(--textMuted)" }}>
          Saisissez vos premiers indicateurs pour obtenir votre verdict.
        </div>
        <button
          onClick={() => onNavigate("saisie")}
          className="rounded-xl px-6 py-3 text-[13px] font-bold"
          style={{ background: "var(--accent)", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          Saisir mes KPIs →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[1000px]">

      {/* ── Hero: score + narrative ───────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex flex-col sm:flex-row items-center gap-6 p-6">
          {/* Gauge */}
          <div className="shrink-0">
            <CircleGauge score={score} />
          </div>

          {/* Right: narrative + totals */}
          <div className="flex-1 space-y-4">
            {/* Score label row */}
            <div className="flex items-center gap-3 flex-wrap">
              <div
                className="rounded-full px-4 py-1.5 text-[13px] font-black"
                style={{ background: `${scoreColor}18`, color: scoreColor }}
              >
                {score !== null ? (score >= 70 ? "✓ Magasin en bonne santé" : score >= 45 ? "⚠ Magasin en vigilance" : "✗ Situation critique") : "Données insuffisantes"}
              </div>
              {totalLoss > 0 && (
                <div
                  className="rounded-full px-3 py-1.5 text-[12px] font-bold"
                  style={{ background: "#ff4d6a18", color: "#ff4d6a" }}
                >
                  ~{formatEuro(totalLoss)}/an à récupérer
                </div>
              )}
            </div>

            {/* Narrative */}
            <p
              className="text-[15px] leading-relaxed font-medium"
              style={{ color: "var(--text)" }}
            >
              {narrative}
            </p>

            {/* Quick stats */}
            <div className="flex gap-4 flex-wrap">
              {[
                { label: "KPIs OK", count: valeurs.filter(v => v.status === "ok").length, color: "#00d4aa" },
                { label: "Vigilance", count: valeurs.filter(v => v.status === "wn").length, color: "#ffb347" },
                { label: "Action requise", count: valeurs.filter(v => v.status === "dg").length, color: "#ff4d6a" },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-[12px] font-bold" style={{ color: s.color }}>{s.count}</span>
                  <span className="text-[11px]" style={{ color: "var(--textDim)" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mission du jour */}
        <div className="px-6 pb-5">
          <MissionDuJour alerts={top3Alerts} papActions={papActions} />
        </div>
      </motion.div>

      {/* ── TOP 3 ALERTES ────────────────────────────────── */}
      {top3Alerts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-bold tracking-wider" style={{ color: "var(--textDim)" }}>
              TOP {top3Alerts.length} ALERTES
            </div>
            {mode === "consultant" && (
              <button
                onClick={() => onNavigate("kpis_gps")}
                className="text-[11px] font-semibold"
                style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                Voir tous les KPIs →
              </button>
            )}
          </div>
          <div className="space-y-3">
            {top3Alerts.map((alert, i) => (
              <AlertCard
                key={alert.kpiName}
                rank={i + 1}
                label={alert.label}
                detail={alert.detail}
                kpiName={alert.kpiName}
                loss={alert.estimatedLoss}
                severity={alert.severity}
                valeurs={valeurs}
                onCreateAction={() => onNavigate("pap")}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── No alerts case ────────────────────────────────── */}
      {top3Alerts.length === 0 && score !== null && score >= 70 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl p-6 text-center"
          style={{ background: "#00d4aa08", border: "1px solid #00d4aa30" }}
        >
          <div className="text-[28px] mb-2">🎉</div>
          <div className="text-[14px] font-bold" style={{ color: "#00d4aa" }}>Aucune alerte critique</div>
          <div className="text-[12px] mt-1" style={{ color: "var(--textMuted)" }}>
            Vos indicateurs sont dans les normes réseau. Continuez sur cette lancée.
          </div>
        </motion.div>
      )}

      {/* ── GMROI (consultant only, discrete) ─────────────── */}
      {mode === "consultant" && (
        <GmroiWidget valeurs={valeurs} />
      )}

      {/* ── Stock insight (si problème stock détecté) ──────── */}
      {(() => {
        const stockAge = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("stock âg"));
        const gmroi    = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("gmroi"));
        const stockVal = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("valeur stock"))?.valeur;
        if (!stockAge || stockAge.status === "ok") return null;
        const vieuxEuro = stockVal ? Math.round((stockAge.valeur / 100) * stockVal) : null;
        const gmroiOk = gmroi && gmroi.valeur >= 3.84;
        return (
          <div
            className="rounded-2xl p-4 flex items-start gap-3"
            style={{ background: "#ff4d6a08", border: "1px solid #ff4d6a25" }}
          >
            <span className="text-[22px] shrink-0">🧊</span>
            <div className="flex-1">
              <div className="text-[12px] font-bold mb-0.5" style={{ color: "#ff4d6a" }}>
                Votre stock âgé ({stockAge.valeur}%) freine votre performance
              </div>
              <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>
                {vieuxEuro
                  ? `~${formatEuro(vieuxEuro)} immobilisés qui ne génèrent plus de marge. `
                  : "De la trésorerie dort au lieu de tourner. "}
                {gmroiOk ? "Votre GMROI reste bon — concentrez-vous sur la rotation." : "Chaque jour de retard aggrave votre GMROI."}
              </div>
            </div>
            <button
              onClick={() => onNavigate("kpis_gps")}
              className="rounded-xl px-3 py-1.5 text-[10px] font-bold shrink-0"
              style={{ background: "#ff4d6a18", color: "#ff4d6a", border: "1px solid #ff4d6a30", cursor: "pointer", fontFamily: "inherit" }}
            >
              Voir plan →
            </button>
          </div>
        );
      })()}

      {/* ── Bonnes pratiques réseau ───────────────────────── */}
      {mode === "consultant" && bonnesPratiques.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{ background: "var(--surface)", border: "1px solid #4da6ff30" }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "#4da6ff" }}>
            💡 BONNES PRATIQUES RÉSEAU
          </div>
          <div className="space-y-2">
            {bonnesPratiques.map((bp, i) => (
              <div key={i} className="flex items-start gap-2 text-[12px]">
                <span style={{ color: "#4da6ff" }}>→</span>
                <div>
                  <span style={{ color: "var(--text)" }}>{bp.action}</span>
                  <span className="ml-1.5 text-[10px]" style={{ color: "var(--textDim)" }}>
                    (KPI : {bp.kpi})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Consultant quick links ────────────────────────── */}
      {mode === "consultant" && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "KPIs complets", tab: "kpis_gps", icon: "📊" },
            { label: "Balance éco.", tab: "balance", icon: "⚖️" },
            { label: "Plan d'action", tab: "pap", icon: "🎯" },
          ].map(item => (
            <button
              key={item.tab}
              onClick={() => onNavigate(item.tab)}
              className="rounded-xl p-3 text-left transition-all"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div className="text-[18px] mb-1">{item.icon}</div>
              <div className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{item.label}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

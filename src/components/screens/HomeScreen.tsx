"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, ResponsiveContainer, Tooltip as RCTooltip,
  XAxis, YAxis
} from "recharts";
import { supabase } from "@/lib/supabase";
import { getStatus, computeScore, computeCategoryScores } from "@/lib/scoring";
import { generateNarrative } from "@/lib/narrative";
import { computeHiddenCosts, formatEuro } from "@/lib/hiddenCosts";
import type { ValeurAvecIndicateur, CategorieScore } from "@/types";

// ─── Cash Circle SVG ───────────────────────────────────────────
function CashCircle({ valeurs }: { valeurs: ValeurAvecIndicateur[] }) {
  const labels = ["Trésorerie", "Achats", "Stock", "Vitrine", "Vente"];
  const N = labels.length;
  const CX = 200; const CY = 140; const RN = 90; const rN = 28;

  const stockAge = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("stock âg"));
  const tlac = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("tlac") || v.indicateur_nom?.toLowerCase().includes("taux achat"));
  const achat = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("achat ext"));

  const nodeHealth: string[] = labels.map((l) => {
    if (l === "Achats") return achat?.status === "wn" ? "#ffb347" : achat?.status === "dg" ? "#ff4d6a" : "#00d4aa";
    if (l === "Stock") return stockAge?.status === "dg" ? "#ff4d6a" : stockAge?.status === "wn" ? "#ffb347" : "#00d4aa";
    if (l === "Vitrine") return stockAge?.status === "dg" ? "#ff4d6a" : "#00d4aa";
    if (l === "Vente") return tlac?.status === "wn" ? "#ffb347" : tlac?.status === "dg" ? "#ff4d6a" : "#00d4aa";
    return "#00d4aa";
  });

  const nodes = labels.map((_, i) => {
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
    return { x: CX + RN * Math.cos(angle), y: CY + RN * Math.sin(angle) };
  });

  return (
    <div className="rounded-2xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--textMuted)" }}>💰 Cercle du cash</span>
        <span className="text-[10px]" style={{ color: "var(--textDim)" }}>— La boucle se casse où le stock dort</span>
      </div>
      <svg width="100%" viewBox="0 0 400 280" style={{ maxHeight: 200 }}>
        <style>{`@keyframes flowArrow{from{stroke-dashoffset:24}to{stroke-dashoffset:0}}`}</style>
        {nodes.map((node, i) => {
          const next = nodes[(i + 1) % N];
          const color = nodeHealth[(i + 1) % N];
          const mx = (node.x + next.x) / 2; const my = (node.y + next.y) / 2;
          const dx = next.x - node.x; const dy = next.y - node.y;
          const len = Math.sqrt(dx*dx+dy*dy);
          const ux = dx/len; const uy = dy/len;
          const sx = node.x + ux*rN; const sy = node.y + uy*rN;
          const ex = next.x - ux*rN; const ey = next.y - uy*rN;
          return (
            <g key={i}>
              <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth="2.5"
                strokeDasharray="6 4" strokeLinecap="round"
                style={{ animation: "flowArrow 0.8s linear infinite" }} />
              <polygon
                points={`${ex},${ey} ${ex - ux*8 + uy*5},${ey - uy*8 - ux*5} ${ex - ux*8 - uy*5},${ey - uy*8 + ux*5}`}
                fill={color} />
              <text x={mx} y={my - 6} textAnchor="middle" fontSize="8" fill={color} opacity="0.7">
                {["→","→","→","→","→"][i]}
              </text>
            </g>
          );
        })}
        {nodes.map((node, i) => (
          <g key={`n${i}`}>
            <circle cx={node.x} cy={node.y} r={rN} fill="#1a1d27" stroke={nodeHealth[i]} strokeWidth="2.5" />
            <circle cx={node.x} cy={node.y} r={rN} fill={nodeHealth[i]} opacity="0.08" />
            <text x={node.x} y={node.y - 2} textAnchor="middle" dominantBaseline="middle" fontSize="9"
              fontWeight="600" fill={nodeHealth[i]} fontFamily="DM Sans, sans-serif">
              {labels[i].split(" ").map((w, wi) => (
                <tspan key={wi} x={node.x} dy={wi === 0 ? (labels[i].includes(" ") ? -5 : 0) : 11}>{w}</tspan>
              ))}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Color helpers ────────────────────────────────────────────
const scoreColor = (s: number | null) => {
  if (s === null) return "#555a6e";
  if (s >= 70) return "#00d4aa";
  if (s >= 45) return "#ffb347";
  return "#ff4d6a";
};
const scoreLabel = (s: number | null) => {
  if (s === null) return "—";
  if (s >= 80) return "Excellent";
  if (s >= 70) return "Bon";
  if (s >= 55) return "Moyen";
  if (s >= 40) return "Insuffisant";
  return "Critique";
};
const trendIcon = (delta: number) => delta > 3 ? "↑" : delta < -3 ? "↓" : "→";
const trendColor = (delta: number) => delta > 3 ? "#00d4aa" : delta < -3 ? "#ff4d6a" : "#ffb347";

const CAT_ICONS: Record<string, string> = {
  "Commercial": "📈",
  "Stock": "📦",
  "Gamme": "🛒",
  "Fidélité": "❤️",
  "Financier": "💰",
  "Qualité": "⭐",
  "RH": "👥",
  "Web / E-réputation": "🌐",
  "Non-négociables / Outils": "🔧",
  "Non-négociables / Promesse": "✅",
  "Non-négociables / Réseau": "🤝",
  "Politique commerciale": "🏷️",
};

// ─── Animated circular gauge ──────────────────────────────────
function CircleGauge({ score }: { score: number | null }) {
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (score === null) return;
    const start = Date.now();
    const duration = 1800;
    const from = 0;
    const to = score;

    const animate = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(from + (to - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [score]);

  const R = 108;
  const SIZE = 280;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const circ = 2 * Math.PI * R;
  const fill = (displayed / 100) * circ;
  const color = scoreColor(displayed);
  const label = scoreLabel(score);

  // Gradient id must be unique per render
  const gradId = "gaugeGrad";
  const glowId = "gaugeGlow";

  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.6" />
          </linearGradient>
          <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer glow ring */}
        <circle
          cx={CX} cy={CY} r={R + 10}
          fill="none"
          stroke={color}
          strokeWidth="1"
          opacity="0.12"
        />

        {/* Track */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke="#2a2e3a"
          strokeWidth="14"
        />

        {/* Filled arc */}
        <circle
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`}
          strokeDashoffset="0"
          filter={`url(#${glowId})`}
          style={{
            transform: `rotate(-90deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transition: "stroke 0.5s ease",
          }}
        />

        {/* Score number */}
        <text
          x={CX} y={CY - 8}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize="58"
          fontWeight="800"
          fontFamily="DM Sans, sans-serif"
          style={{ filter: `drop-shadow(0 0 12px ${color}88)` }}
        >
          {displayed}
        </text>

        {/* /100 */}
        <text
          x={CX} y={CY + 36}
          textAnchor="middle"
          fill="#8b8fa3"
          fontSize="13"
          fontFamily="DM Sans, sans-serif"
        >
          / 100
        </text>

        {/* Status label */}
        <text
          x={CX} y={CY + 58}
          textAnchor="middle"
          fill={color}
          fontSize="12"
          fontWeight="600"
          fontFamily="DM Sans, sans-serif"
          letterSpacing="2"
          style={{ textTransform: "uppercase" }}
        >
          {label}
        </text>
      </svg>

      {/* Pulse ring animation */}
      {score !== null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: `2px solid ${color}`,
            opacity: 0,
            animation: "pulse-ring 3s ease-out infinite",
          }}
        />
      )}
    </div>
  );
}

// ─── Mini sparkline ──────────────────────────────────────────
function Sparkline({ data }: { data: { date: string; score: number | null }[] }) {
  const pts = data.filter((d) => d.score !== null).slice(-8);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1].score!;
  const color = scoreColor(last);

  return (
    <ResponsiveContainer width="100%" height={72}>
      <LineChart data={pts} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" hide />
        <YAxis domain={[0, 100]} hide />
        <RCTooltip
          contentStyle={{ background: "#1a1d27", border: "1px solid #2a2e3a", borderRadius: 8, fontSize: 11 }}
          labelFormatter={(v) => new Date(v).toLocaleDateString("fr-FR")}
          formatter={(v: number) => [`${v}/100`, "Score"]}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke={`url(#sparkGrad)`}
          strokeWidth={2.5}
          dot={(props) => {
            const { cx, cy, index } = props;
            if (index !== pts.length - 1) return <circle key={`dot-${index}`} cx={cx} cy={cy} r={2} fill={color} opacity={0.4} />;
            return <circle key={`dot-last-${index}`} cx={cx} cy={cy} r={5} fill={color} stroke="#0f1117" strokeWidth={2} />;
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Category card ────────────────────────────────────────────
function CategoryCard({
  cat,
  previousScore,
  delay,
  onClick,
}: {
  cat: CategorieScore;
  previousScore: number | null;
  delay: number;
  onClick: () => void;
}) {
  const color = scoreColor(cat.score);
  const delta = previousScore !== null ? cat.score - previousScore : 0;
  const hasPrev = previousScore !== null;
  const total = cat.ok + cat.wn + cat.dg;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      onClick={onClick}
      className="cursor-pointer rounded-xl p-4 border hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: "var(--surface)",
        borderColor: `${color}40`,
        boxShadow: `0 0 18px ${color}18`,
        transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[18px]">{CAT_ICONS[cat.name] ?? "📊"}</span>
          <span className="text-[12px] font-semibold leading-tight" style={{ color: "var(--text)" }}>
            {cat.name.replace("Non-négociables / ", "")}
          </span>
        </div>
        {hasPrev && (
          <span className="text-[12px] font-bold ml-1" style={{ color: trendColor(delta) }}>
            {trendIcon(delta)}
          </span>
        )}
      </div>

      {/* Score */}
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-[26px] font-bold" style={{ color }}>
          {cat.score}
        </span>
        <span className="text-[11px]" style={{ color: "var(--textMuted)" }}>%</span>
        {cat.dg > 0 && (
          <span
            className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: "#ff4d6a22", color: "#ff4d6a" }}
          >
            {cat.dg} ⚠
          </span>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden gap-[1px]">
          {cat.ok > 0 && (
            <div style={{ width: `${(cat.ok / total) * 100}%`, background: "#00d4aa", borderRadius: "99px 0 0 99px" }} />
          )}
          {cat.wn > 0 && (
            <div style={{ width: `${(cat.wn / total) * 100}%`, background: "#ffb347" }} />
          )}
          {cat.dg > 0 && (
            <div style={{ width: `${(cat.dg / total) * 100}%`, background: "#ff4d6a", borderRadius: "0 99px 99px 0" }} />
          )}
        </div>
      )}

      {/* KPI counts */}
      <div className="flex gap-2 mt-2 text-[10px]" style={{ color: "var(--textDim)" }}>
        {cat.ok > 0 && <span style={{ color: "#00d4aa" }}>{cat.ok} OK</span>}
        {cat.wn > 0 && <span style={{ color: "#ffb347" }}>{cat.wn} vigil.</span>}
        {cat.dg > 0 && <span style={{ color: "#ff4d6a" }}>{cat.dg} action</span>}
      </div>
    </motion.div>
  );
}

// ─── Urgent action card ───────────────────────────────────────
function ActionCard({
  action,
  index,
}: {
  action: { id: string; priorite: string; action: string; kpi_cible: string | null; echeance: string | null; statut: string };
  index: number;
}) {
  const pColors: Record<string, string> = {
    P1: "#ff4d6a",
    P2: "#ffb347",
    P3: "#4da6ff",
  };
  const color = pColors[action.priorite] ?? "#8b8fa3";

  const daysLeft = action.echeance
    ? Math.ceil((new Date(action.echeance).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
      className="flex items-start gap-3 p-3 rounded-xl border"
      style={{ background: "var(--surfaceAlt)", borderColor: `${color}30` }}
    >
      <span
        className="text-[10px] font-bold px-2 py-1 rounded shrink-0 mt-0.5"
        style={{ background: `${color}22`, color }}
      >
        {action.priorite}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium leading-tight truncate" style={{ color: "var(--text)" }}>
          {action.action}
        </div>
        {action.kpi_cible && (
          <div className="text-[10px] mt-1" style={{ color: "var(--textMuted)" }}>
            {action.kpi_cible}
          </div>
        )}
      </div>
      {daysLeft !== null && (
        <div
          className="text-[10px] font-bold shrink-0 text-right"
          style={{ color: daysLeft <= 3 ? "#ff4d6a" : daysLeft <= 7 ? "#ffb347" : "#8b8fa3" }}
        >
          {daysLeft <= 0 ? "Échu" : `${daysLeft}j`}
        </div>
      )}
    </motion.div>
  );
}

// ─── Hidden cost badge ─────────────────────────────────────────
function HiddenCostRow({ label, detail, estimatedLoss, severity }: {
  label: string; detail: string; estimatedLoss: number | null; severity: "dg" | "wn";
}) {
  const color = severity === "dg" ? "#ff4d6a" : "#ffb347";
  return (
    <div className="flex items-center gap-3 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium" style={{ color: "var(--text)" }}>{label}</div>
        <div className="text-[10px]" style={{ color: "var(--textMuted)" }}>{detail}</div>
      </div>
      {estimatedLoss !== null && (
        <div className="text-[11px] font-bold shrink-0" style={{ color }}>
          ~{formatEuro(estimatedLoss)}/an
        </div>
      )}
    </div>
  );
}

// ─── Main Home Screen ─────────────────────────────────────────
interface HomeScreenProps {
  magasinId: string;
  onNavigate: (tab: string) => void;
}

export function HomeScreen({ magasinId, onNavigate }: HomeScreenProps) {
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [prevValeurs, setPrevValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [visiteHistory, setVisiteHistory] = useState<{ date: string; score: number | null }[]>([]);
  const [openActions, setOpenActions] = useState<{
    id: string; priorite: string; action: string; kpi_cible: string | null; echeance: string | null; statut: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [papActions, setPapActions] = useState<Array<{id:string;kpiImpacte:string;statut:string;action:string;impactFinancier?:number}>>([]);

  const loadData = useCallback(async () => {
    if (!magasinId) return;
    setLoading(true);

    const [{ data: vData }, { data: histData }, { data: actData }] = await Promise.all([
      supabase.from("v_dernieres_valeurs").select("*").eq("magasin_id", magasinId),
      supabase.from("visites").select("date_visite, score_global").eq("magasin_id", magasinId)
        .order("date_visite", { ascending: true }).limit(12),
      supabase.from("v_actions_ouvertes").select("id, priorite, action, kpi_cible, echeance, statut")
        .eq("magasin_id", magasinId).limit(5),
    ]);

    type VRow = {
      magasin_id: string; indicateur_id: string; valeur: number; date_saisie: string;
      indicateur_nom: string; unite: string | null; direction: "up" | "down";
      seuil_ok: number | null; seuil_vigilance: number | null; categorie: string;
      poids: number; action_defaut: string | null; magasin_nom: string;
    };

    const enriched: ValeurAvecIndicateur[] = ((vData ?? []) as VRow[]).map((r) => ({
      ...r,
      status: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
    }));

    setValeurs(enriched);
    setVisiteHistory(((histData ?? []) as { date_visite: string; score_global: number | null }[]).map((v) => ({
      date: v.date_visite,
      score: v.score_global,
    })));
    setOpenActions((actData ?? []) as typeof openActions);

    // Load previous visit values for trend comparison
    const hist = (histData ?? []) as { date_visite: string; score_global: number | null }[];
    if (hist.length >= 2) {
      const prevDate = hist[hist.length - 2].date_visite;
      const { data: prevData } = await supabase
        .from("valeurs")
        .select("indicateur_id, valeur")
        .eq("magasin_id", magasinId)
        .eq("date_saisie", prevDate);
      setPrevValeurs((prevData ?? []) as ValeurAvecIndicateur[]);
    }

    setLoading(false);
  }, [magasinId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!magasinId) return;
    try {
      const raw = localStorage.getItem(`pap_actions_${magasinId}`);
      if (raw) setPapActions(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [magasinId]);

  const score = computeScore(valeurs);
  const categories = computeCategoryScores(valeurs);
  const hiddenCosts = computeHiddenCosts(valeurs);

  // Previous score
  const hist = visiteHistory.filter((v) => v.score !== null);
  const previousScore = hist.length >= 2 ? hist[hist.length - 2].score : null;
  const lastVisitDate = hist.length >= 1 ? hist[hist.length - 1].date : null;
  const daysSinceLastVisit = lastVisitDate
    ? Math.floor((Date.now() - new Date(lastVisitDate).getTime()) / 86400000)
    : null;

  // Previous category scores (from prev valeurs)
  const prevCatScores: Record<string, number> = {};
  if (prevValeurs.length > 0) {
    const enrichedPrev = prevValeurs.map((pv) => {
      const ind = valeurs.find((v) => v.indicateur_id === (pv as any).indicateur_id);
      if (!ind) return null;
      return { ...ind, valeur: (pv as any).valeur, status: getStatus((pv as any).valeur, ind.direction, ind.seuil_ok, ind.seuil_vigilance) };
    }).filter(Boolean) as ValeurAvecIndicateur[];
    const prevCats = computeCategoryScores(enrichedPrev);
    prevCats.forEach((c) => { prevCatScores[c.name] = c.score; });
  }

  // Score prédictif PAP
  const activeActions = papActions.filter(a => (a.statut === "À lancer" || a.statut === "En cours") && a.kpiImpacte?.trim());
  const improveableKpis: string[] = [];
  const simulatedValeurs = valeurs.map(v => {
    const matched = activeActions.find(a => v.indicateur_nom?.toLowerCase().includes(a.kpiImpacte.toLowerCase()));
    if (matched && v.status === "dg" && v.seuil_vigilance !== null) {
      improveableKpis.push(v.indicateur_nom);
      const simVal = v.direction === "up" ? (v.seuil_vigilance ?? 0) + 0.01 : (v.seuil_vigilance ?? 0) - 0.01;
      return { ...v, valeur: simVal, status: getStatus(simVal, v.direction, v.seuil_ok, v.seuil_vigilance) };
    }
    return v;
  });
  const projectedScore = improveableKpis.length > 0 ? computeScore(simulatedValeurs) : null;
  const scoreGain = projectedScore !== null && score !== null ? projectedScore - score : 0;
  const papTotal = papActions.length;
  const papDone = papActions.filter(a => a.statut === "Terminé").length;
  const savingsAction = papActions.find(a => a.impactFinancier && a.impactFinancier > 0 && a.statut !== "Terminé");

  const narrative = generateNarrative({
    score,
    previousScore,
    daysSinceLastVisit,
    categories,
    openActionsTotal: openActions.length,
    openActionsDone: 0,
    openActionsLate: openActions.filter((a) => a.echeance && new Date(a.echeance) < new Date()).length,
    magasinNom: "",
  });

  const handleSeed = async () => {
    setSeeding(true);
    const { seedLyonEst } = await import("@/lib/seed");
    const res = await seedLyonEst();
    setSeedMsg(res.message);
    setSeeding(false);
    if (res.ok) setTimeout(() => { loadData(); setSeedMsg(null); }, 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex gap-2 items-center" style={{ color: "var(--textMuted)" }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)", animationDelay: "0.2s" }} />
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)", animationDelay: "0.4s" }} />
        </div>
      </div>
    );
  }

  // Empty state
  if (valeurs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[60vh] text-center"
      >
        <div className="text-[64px] mb-4">🚀</div>
        <div className="text-[22px] font-bold mb-2" style={{ color: "var(--text)" }}>
          Aucune donnée pour ce magasin
        </div>
        <div className="text-[14px] mb-8 max-w-md" style={{ color: "var(--textMuted)" }}>
          Saisissez les indicateurs via l&apos;onglet <strong>KPIs</strong>, ou chargez les données de démonstration.
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="px-5 py-2.5 rounded-xl font-semibold text-[13px] transition-all hover:opacity-90 active:scale-95"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            {seeding ? "Chargement…" : "🎯 Charger données Lyon Est"}
          </button>
          <button
            onClick={() => onNavigate("kpis")}
            className="px-5 py-2.5 rounded-xl font-semibold text-[13px] border transition-all hover:opacity-90"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Saisir manuellement
          </button>
        </div>
        {seedMsg && (
          <div className="mt-4 text-[12px] font-medium" style={{ color: "var(--accent)" }}>
            {seedMsg}
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Row 1: Gauge + Narrative + Actions ─────────────────── */}
      <div className="grid gap-5" style={{ gridTemplateColumns: "auto 1fr auto" }}>

        {/* Gauge card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="rounded-2xl p-6 border flex flex-col items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #1a1d27 0%, #1e2133 100%)",
            borderColor: `${scoreColor(score)}30`,
            boxShadow: `0 0 40px ${scoreColor(score)}18, inset 0 1px 0 rgba(255,255,255,0.05)`,
            minWidth: 300,
          }}
        >
          <CircleGauge score={score} />
          {/* N-1 delta */}
          {previousScore !== null && score !== null && (
            <div className="mt-1 text-[11px] font-semibold" style={{ color: trendColor(score - previousScore) }}>
              {score - previousScore > 0 ? "↑" : score - previousScore < 0 ? "↓" : "→"}
              {" "}{score - previousScore > 0 ? "+" : ""}{score - previousScore} pts vs visite précédente
            </div>
          )}
          {/* GMROI widget */}
          {(() => {
            const gmroi = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("gmroi"));
            if (!gmroi) return null;
            const gColor = gmroi.valeur >= 3.5 ? "#00d4aa" : gmroi.valeur >= 2.5 ? "#ffb347" : "#ff4d6a";
            return (
              <div className="mt-2 px-4 py-2 rounded-xl text-center" style={{ background: `${gColor}12`, border: `1px solid ${gColor}30` }}>
                <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "var(--textMuted)" }}>GMROI</div>
                <div className="text-[24px] font-bold" style={{ color: gColor }}>{gmroi.valeur.toFixed(2)}</div>
                <div className="text-[9px]" style={{ color: "var(--textDim)" }}>Réseau : 3.84</div>
              </div>
            );
          })()}
          {/* Stat badges */}
          <div className="flex gap-2 mt-3">
            {[
              { count: valeurs.filter((v) => v.status === "ok").length, label: "OK", color: "#00d4aa", bg: "#00d4aa18" },
              { count: valeurs.filter((v) => v.status === "wn").length, label: "Vigil.", color: "#ffb347", bg: "#ffb34718" },
              { count: valeurs.filter((v) => v.status === "dg").length, label: "Action", color: "#ff4d6a", bg: "#ff4d6a18" },
            ].map(({ count, label, color, bg }) => (
              <div key={label} className="flex flex-col items-center px-3 py-1.5 rounded-lg" style={{ background: bg }}>
                <span className="text-[16px] font-bold" style={{ color }}>{count}</span>
                <span className="text-[9px] uppercase tracking-wider" style={{ color }}>{label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Narrative + Categories */}
        <div className="flex flex-col gap-4">
          {/* Narrative */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="rounded-2xl p-5 border"
            style={{
              background: "linear-gradient(135deg, #1a1d2788 0%, #1e213388 100%)",
              backdropFilter: "blur(8px)",
              borderColor: "var(--border)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--textMuted)" }}>
                Analyse en temps réel
              </span>
            </div>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--text)" }}>
              {narrative}
            </p>
          </motion.div>

          {/* Cash Circle */}
          <CashCircle valeurs={valeurs} />

          {/* Category grid */}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}>
            {categories.map((cat, i) => (
              <CategoryCard
                key={cat.name}
                cat={cat}
                previousScore={prevCatScores[cat.name] ?? null}
                delay={0.1 + i * 0.05}
                onClick={() => onNavigate("diagnostic")}
              />
            ))}
          </div>

          {/* Score prédictif PAP */}
          {scoreGain > 0 && projectedScore !== null && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.6 }}
              className="rounded-2xl p-4 border"
              style={{ background: "linear-gradient(135deg, #00d4aa08 0%, #a78bfa08 100%)", borderColor: "#00d4aa30" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#00d4aa" }}>🎯 Projection si PAP appliqué</span>
              </div>
              <div className="flex items-center gap-4 mb-2">
                <div className="text-center">
                  <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>Actuel</div>
                  <div className="text-[22px] font-bold" style={{ color: scoreColor(score) }}>{score}</div>
                </div>
                <div className="text-[18px]" style={{ color: "#00d4aa" }}>→</div>
                <div className="text-center">
                  <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>Projeté</div>
                  <div className="text-[22px] font-bold" style={{ color: "#00d4aa" }}>{projectedScore}</div>
                </div>
                <div className="ml-auto px-3 py-1.5 rounded-xl text-[13px] font-bold" style={{ background: "#00d4aa22", color: "#00d4aa" }}>
                  +{scoreGain} pts
                </div>
              </div>
              {improveableKpis.slice(0, 3).length > 0 && (
                <div className="text-[10px] space-y-0.5" style={{ color: "var(--textMuted)" }}>
                  {improveableKpis.slice(0, 3).map(k => (
                    <div key={k}>↗ {k}</div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Right sidebar: Urgent actions */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="rounded-2xl p-4 border flex flex-col gap-3"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            minWidth: 240,
            maxWidth: 280,
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--textMuted)" }}>
              🎯 Actions urgentes
            </span>
            <button
              onClick={() => onNavigate("plan")}
              className="text-[10px] font-semibold hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              Tout voir →
            </button>
          </div>

          {openActions.length === 0 ? (
            <div className="text-center py-6" style={{ color: "var(--textDim)" }}>
              <div className="text-[28px] mb-1">✅</div>
              <div className="text-[11px]">Aucune action ouverte</div>
            </div>
          ) : (
            openActions.slice(0, 4).map((a, i) => (
              <ActionCard key={a.id} action={a} index={i} />
            ))
          )}

          {/* Hidden costs section */}
          {hiddenCosts.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--textMuted)" }}>
                💸 Coûts cachés estimés
              </div>
              {hiddenCosts.slice(0, 3).map((c, i) => (
                <HiddenCostRow key={i} {...c} />
              ))}
              {hiddenCosts.length > 0 && (
                <div className="text-right mt-2">
                  <span className="text-[11px] font-bold" style={{ color: "#ff4d6a" }}>
                    Total estimé :{" "}
                    {formatEuro(
                      hiddenCosts.reduce((sum, c) => sum + (c.estimatedLoss ?? 0), 0)
                    )}/an
                  </span>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Row 2: Score evolution sparkline ──────────────────── */}
      {visiteHistory.length >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="rounded-2xl p-5 border"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--textMuted)" }}>
                📈 Évolution du score
              </span>
              <span className="text-[10px] ml-2" style={{ color: "var(--textDim)" }}>
                {visiteHistory.filter((v) => v.score !== null).length} visites
              </span>
            </div>
            <button
              onClick={() => onNavigate("historique")}
              className="text-[10px] font-semibold hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              Historique →
            </button>
          </div>
          <Sparkline data={visiteHistory} />
        </motion.div>
      )}

      {/* ── Franchisé incitation strip ─────────────────────────── */}
      {(papTotal > 0 || daysSinceLastVisit !== null) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.7 }}
          className="rounded-2xl p-4 border"
          style={{ background: "linear-gradient(135deg, #1a1d27 0%, #1e2133 100%)", borderColor: "var(--border)" }}
        >
          <div className="flex flex-wrap items-center gap-4">
            {/* PAP progress */}
            {papTotal > 0 && (
              <div className="flex-1 min-w-[180px]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>🎯 Plan d&apos;action</span>
                  <span className="text-[11px] font-bold" style={{ color: papDone === papTotal ? "#00d4aa" : "var(--textMuted)" }}>
                    {papDone}/{papTotal}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface)" }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{
                    width: `${papTotal > 0 ? (papDone / papTotal) * 100 : 0}%`,
                    background: papDone === papTotal ? "#00d4aa" : "#ffb347",
                  }} />
                </div>
              </div>
            )}

            {/* Next visit */}
            {daysSinceLastVisit !== null && (
              <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>
                <span style={{ color: "var(--text)" }}>⏱</span> Dernière visite il y a <span className="font-semibold" style={{ color: "var(--text)" }}>{daysSinceLastVisit}j</span>
                {daysSinceLastVisit > 25 && <span style={{ color: "#ffb347" }}> — Bientôt la prochaine !</span>}
              </div>
            )}

            {/* Savings nudge */}
            {savingsAction && (
              <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>
                💡 Terminez <span className="font-semibold" style={{ color: "#00d4aa" }}>&quot;{savingsAction.action.slice(0, 40)}&quot;</span>
                {" "}→ économisez ~<span className="font-bold" style={{ color: "#00d4aa" }}>{formatEuro(savingsAction.impactFinancier!)}/an</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

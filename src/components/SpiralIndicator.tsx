"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

// ─── Helpers ──────────────────────────────────────────────────
interface WeekSnapshot {
  date: string;
  tresorerie?: number;
  stockAge?: number;
  marge?: number;
  ca?: number;
}

function loadWeeklySnapshots(magasinId: string): WeekSnapshot[] {
  try {
    const raw = localStorage.getItem(`kpi_history_${magasinId}`);
    if (raw) return JSON.parse(raw);
    // Fallback: try to extract from saisie history
    const snapshots: WeekSnapshot[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`saisie_${magasinId}_`)) {
        const date = key.replace(`saisie_${magasinId}_`, "");
        try {
          const data = JSON.parse(localStorage.getItem(key) ?? "{}");
          snapshots.push({ date, ...data });
        } catch { /* ignore */ }
      }
    }
    return snapshots.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  } catch { return []; }
}

function isDescending(values: (number | undefined)[]): boolean {
  const defined = values.filter((v): v is number => v !== undefined);
  if (defined.length < 2) return false;
  return defined[0] < defined[1] && (defined.length < 3 || defined[1] <= defined[2]);
}

function isAscending(values: (number | undefined)[]): boolean {
  const defined = values.filter((v): v is number => v !== undefined);
  if (defined.length < 2) return false;
  return defined[0] > defined[1] && (defined.length < 3 || defined[1] >= defined[2]);
}

function pctChange(latest?: number, prev?: number): string {
  if (latest == null || prev == null || prev === 0) return "";
  const p = ((latest - prev) / Math.abs(prev)) * 100;
  return (p > 0 ? "+" : "") + p.toFixed(1) + "%";
}

// ─── SpiralIndicator ──────────────────────────────────────────
interface SpiralIndicatorProps {
  magasinId: string;
  onOpenSimulateur?: () => void;
}

export function SpiralIndicator({ magasinId, onOpenSimulateur }: SpiralIndicatorProps) {
  const snapshots = useMemo(() => loadWeeklySnapshots(magasinId), [magasinId]);

  if (snapshots.length < 2) {
    return (
      <div
        className="rounded-xl px-4 py-3 text-[11px] flex items-center gap-2"
        style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)", color: "var(--textDim)" }}
      >
        <span>📊</span>
        <span>Continue de saisir tes KPIs chaque semaine pour activer le suivi de tendance.</span>
      </div>
    );
  }

  // Compute spiral score
  let score = 0;
  const alerts: string[] = [];

  const tresoValues = snapshots.slice(0, 3).map(s => s.tresorerie);
  const stockValues = snapshots.slice(0, 3).map(s => s.stockAge);
  const margeValues = snapshots.slice(0, 3).map(s => s.marge);
  const caValues    = snapshots.slice(0, 3).map(s => s.ca);

  if (isDescending(tresoValues)) {
    score += 30;
    const delta = pctChange(tresoValues[0], tresoValues[1]);
    alerts.push(`Trésorerie en baisse${delta ? " " + delta : ""} sur 2 semaines`);
  }
  if (isAscending(stockValues)) {
    score += 30;
    const delta = pctChange(stockValues[0], stockValues[1]);
    alerts.push(`Stock âgé en hausse${delta ? " +" + Math.abs(parseFloat(delta)).toFixed(1) + "pts" : ""} sur 2 semaines`);
  }
  if (isDescending(margeValues)) {
    score += 20;
    const delta = pctChange(margeValues[0], margeValues[1]);
    alerts.push(`Marge en baisse${delta ? " " + delta : ""} sur 2 semaines`);
  }
  if (isDescending(caValues)) {
    score += 20;
    const delta = pctChange(caValues[0], caValues[1]);
    alerts.push(`CA en baisse${delta ? " " + delta : ""} sur 2 semaines`);
  }

  // Trend arrow
  const prevScore = (() => {
    let s = 0;
    const t2 = snapshots.slice(1, 4).map(sn => sn.tresorerie);
    const st2 = snapshots.slice(1, 4).map(sn => sn.stockAge);
    if (isDescending(t2)) s += 30;
    if (isAscending(st2)) s += 30;
    return s;
  })();
  const trendArrow = score > prevScore + 10 ? "↘️" : score < prevScore - 10 ? "↗️" : "→";

  const config =
    score <= 20
      ? { color: "#00d4aa", bg: "#00d4aa0d", border: "#00d4aa25", icon: "📈", title: "Trajectoire positive", msg: "Vos indicateurs sont stables ou en progression." }
      : score <= 50
        ? { color: "#ffb347", bg: "#ffb3470d", border: "#ffb34725", icon: "⚠️", title: "Tendance à surveiller", msg: alerts[0] ?? "Un indicateur mérite attention." }
        : { color: "#ff4d6a", bg: "#ff4d6a0d", border: "#ff4d6a25", icon: "🚨", title: "Spirale détectée", msg: alerts.slice(0, 2).join(" · ") };

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl px-4 py-3 flex items-center gap-3"
      style={{ background: config.bg, border: `1px solid ${config.border}` }}
    >
      <span className="text-[18px] shrink-0">{config.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold" style={{ color: config.color }}>
            {config.title}
          </span>
          <span className="text-[12px]">{trendArrow}</span>
        </div>
        <div className="text-[11px] truncate" style={{ color: "var(--textMuted)" }}>{config.msg}</div>
      </div>
      {score > 20 && onOpenSimulateur && (
        <button
          onClick={onOpenSimulateur}
          className="shrink-0 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 transition-all"
          style={{
            background: `${config.color}18`,
            color: config.color,
            border: `1px solid ${config.color}30`,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          → Simuler
        </button>
      )}
    </motion.div>
  );
}

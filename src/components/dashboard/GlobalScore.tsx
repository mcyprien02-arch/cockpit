"use client";

import { scoreColor } from "@/lib/scoring";

interface GlobalScoreProps {
  score: number | null;
  totalIndicateurs: number;
  okCount: number;
  wnCount: number;
  dgCount: number;
}

function ScoreGauge({ score, color }: { score: number; color: string }) {
  const pct = Math.min(Math.max(score / 100, 0), 1);
  const circumference = 157; // arc length of the half circle
  return (
    <svg viewBox="0 0 120 70" width="160" height="93" className="block mx-auto">
      {/* Track */}
      <path
        d="M10 60A50 50 0 0 1 110 60"
        fill="none"
        stroke="var(--border)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Fill */}
      <path
        d="M10 60A50 50 0 0 1 110 60"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${pct * circumference} ${circumference}`}
      />
      {/* Value */}
      <text
        x="60"
        y="55"
        textAnchor="middle"
        fill={color}
        fontSize="22"
        fontWeight="700"
        fontFamily="DM Sans, sans-serif"
      >
        {score}
      </text>
    </svg>
  );
}

export function GlobalScore({
  score,
  totalIndicateurs,
  okCount,
  wnCount,
  dgCount,
}: GlobalScoreProps) {
  const color = scoreColor(score);

  return (
    <div
      className="rounded-xl p-5 border flex flex-col items-center"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow:
          score !== null
            ? score >= 70
              ? "0 0 24px var(--accentGlow)"
              : score >= 45
              ? "0 0 24px var(--warnGlow)"
              : "0 0 24px var(--dangerGlow)"
            : "none",
      }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--textMuted)" }}>
        Score santé global
      </div>

      {score !== null ? (
        <>
          <ScoreGauge score={score} color={color} />
          <div className="text-[11px] mt-1" style={{ color: "var(--textMuted)" }}>
            sur {totalIndicateurs} indicateurs saisis
          </div>

          <div className="flex gap-4 mt-4 w-full justify-center">
            <StatBadge count={okCount} label="OK" color="var(--accent)" dim="var(--accentDim)" />
            <StatBadge count={wnCount} label="Vigilance" color="var(--warn)" dim="var(--warnDim)" />
            <StatBadge count={dgCount} label="Action" color="var(--danger)" dim="var(--dangerDim)" />
          </div>
        </>
      ) : (
        <div className="py-8 text-center">
          <div className="text-[36px] font-bold mb-1" style={{ color: "var(--textDim)" }}>—</div>
          <div className="text-[12px]" style={{ color: "var(--textMuted)" }}>
            Aucune donnée saisie
          </div>
        </div>
      )}
    </div>
  );
}

function StatBadge({
  count,
  label,
  color,
  dim,
}: {
  count: number;
  label: string;
  color: string;
  dim: string;
}) {
  return (
    <div
      className="flex flex-col items-center px-3 py-2 rounded-lg"
      style={{ background: dim }}
    >
      <span className="text-[20px] font-bold" style={{ color }}>
        {count}
      </span>
      <span className="text-[10px] font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

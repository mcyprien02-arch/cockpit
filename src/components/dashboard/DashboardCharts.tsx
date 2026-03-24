"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { CategorieScore } from "@/types";
import { scoreColor } from "@/lib/scoring";

/* ─── Radar par catégorie ─────────────────────────────────── */
interface RadarProps {
  categories: CategorieScore[];
}

export function CategoryRadar({ categories }: RadarProps) {
  const data = categories.map((c) => ({ subject: c.name.split("/")[0].trim(), score: c.score }));

  return (
    <div
      className="rounded-xl p-4 border"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="text-[13px] font-semibold mb-4" style={{ color: "var(--text)" }}>
        Radar catégories
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: "var(--textMuted)", fontSize: 10 }}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="var(--accent)"
            fill="var(--accent)"
            fillOpacity={0.2}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Barres empilées OK / Vigilance / Action ─────────────── */
interface StackedBarsProps {
  categories: CategorieScore[];
}

export function StackedStatusBars({ categories }: StackedBarsProps) {
  const data = categories.map((c) => ({
    name: c.name.split("/")[0].trim(),
    OK: c.ok,
    Vigilance: c.wn,
    Action: c.dg,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-lg p-3 text-[12px] shadow-xl"
        style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}
      >
        <div className="font-semibold mb-1">{label}</div>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ background: p.fill }}
            />
            {p.name}: <strong>{p.value}</strong>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="rounded-xl p-4 border"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="text-[13px] font-semibold mb-4" style={{ color: "var(--text)" }}>
        Répartition OK / Vigilance / Action
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 0, right: 10, bottom: 40, left: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: "var(--textMuted)", fontSize: 10 }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fill: "var(--textMuted)", fontSize: 10 }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="OK" stackId="a" fill="var(--accent)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Vigilance" stackId="a" fill="var(--warn)" />
          <Bar dataKey="Action" stackId="a" fill="var(--danger)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 justify-center text-[11px]" style={{ color: "var(--textMuted)" }}>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: "var(--accent)" }} />OK</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: "var(--warn)" }} />Vigilance</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: "var(--danger)" }} />Action</span>
      </div>
    </div>
  );
}

/* ─── Évolution score dans le temps ──────────────────────── */
interface ScoreEvolutionProps {
  visites: { date: string; score: number | null }[];
}

export function ScoreEvolution({ visites }: ScoreEvolutionProps) {
  const data = visites
    .filter((v) => v.score !== null)
    .map((v) => ({
      date: new Date(v.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
      score: v.score,
    }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const val = payload[0].value as number;
    return (
      <div
        className="rounded-lg p-3 text-[12px] shadow-xl"
        style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}
      >
        <div style={{ color: "var(--textMuted)" }}>{label}</div>
        <div className="font-bold text-[16px]" style={{ color: scoreColor(val) }}>
          {val}%
        </div>
      </div>
    );
  };

  return (
    <div
      className="rounded-xl p-4 border"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="text-[13px] font-semibold mb-4" style={{ color: "var(--text)" }}>
        Évolution du score
      </div>

      {data.length === 0 ? (
        <div
          className="flex items-center justify-center h-[180px] text-[13px]"
          style={{ color: "var(--textDim)" }}
        >
          Aucune visite enregistrée
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fill: "var(--textMuted)", fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: "var(--textMuted)", fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="score"
              stroke="var(--accent)"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "var(--accent)", strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
            {/* Target lines */}
            <Line
              type="monotone"
              dataKey={() => 70}
              stroke="var(--accentGlow)"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              legendType="none"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ─── Barres KPIs valeur vs seuil ────────────────────────── */
interface KpiBarChartProps {
  items: {
    nom: string;
    valeur: number;
    seuil_ok: number | null;
    unite: string | null;
    status: "ok" | "wn" | "dg" | null;
  }[];
}

export function KpiBarChart({ items }: KpiBarChartProps) {
  const data = items.slice(0, 12).map((it) => ({
    name: it.nom.length > 18 ? it.nom.slice(0, 17) + "…" : it.nom,
    valeur: it.valeur,
    seuil: it.seuil_ok ?? 0,
    status: it.status,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-lg p-3 text-[12px] shadow-xl"
        style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}
      >
        <div className="font-semibold mb-1">{label}</div>
        {payload.map((p: any) => (
          <div key={p.name}>
            {p.name}: <strong>{p.value}</strong>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="rounded-xl p-4 border"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="text-[13px] font-semibold mb-4" style={{ color: "var(--text)" }}>
        Valeurs vs seuils (top alertes)
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 90 }}>
          <XAxis type="number" tick={{ fill: "var(--textMuted)", fontSize: 10 }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "var(--textMuted)", fontSize: 10 }}
            width={90}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="valeur" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={
                  entry.status === "ok"
                    ? "var(--accent)"
                    : entry.status === "wn"
                    ? "var(--warn)"
                    : "var(--danger)"
                }
              />
            ))}
          </Bar>
          <Bar dataKey="seuil" fill="rgba(255,255,255,0.05)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

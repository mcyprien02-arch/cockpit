'use client';

import { useState } from 'react';
import type { MagasinData } from '@/types';
import { KPI_DEFS, getCategoryScores, type KpiCategory } from '@/lib/kpis';

interface Props { data: MagasinData; }

const CAT_LABELS: Record<KpiCategory, string> = {
  rentabilite: 'Rentabilité',
  stock: 'Stock',
  commerce: 'Commerce',
  gamme: 'Gamme',
  rh: 'RH',
};
const CAT_COLOR: Record<string, string> = {
  rentabilite: '#10b981',
  stock: '#3b82f6',
  commerce: '#f59e0b',
  gamme: '#8b5cf6',
  rh: '#ef4444',
};

// SVG Radar chart — axes are evenly distributed around a circle
function RadarChart({ scores }: { scores: Record<string, number> }) {
  const cats = Object.keys(scores);
  const n = cats.length;
  const cx = 120; const cy = 120; const R = 90;
  const levels = [20, 40, 60, 80, 100];

  function pt(catIdx: number, val: number) {
    const angle = (catIdx / n) * 2 * Math.PI - Math.PI / 2;
    const r = (val / 100) * R;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  const polygon = cats.map((c, i) => pt(i, scores[c])).map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox="0 0 240 240" className="w-full max-w-xs mx-auto">
      {/* Grid levels */}
      {levels.map(lvl => (
        <polygon
          key={lvl}
          points={cats.map((_, i) => pt(i, lvl)).map(p => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#374151"
          strokeWidth="0.5"
        />
      ))}
      {/* Axis lines */}
      {cats.map((_, i) => {
        const end = pt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#4b5563" strokeWidth="0.5" />;
      })}
      {/* Data polygon */}
      <polygon points={polygon} fill="rgba(16,185,129,0.2)" stroke="#10b981" strokeWidth="1.5" />
      {/* Axis labels */}
      {cats.map((c, i) => {
        const p = pt(i, 115);
        return (
          <text key={c} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill="#9ca3af" fontSize="9" fontWeight="600">
            {CAT_LABELS[c as KpiCategory]}
          </text>
        );
      })}
      {/* Data dots */}
      {cats.map((c, i) => {
        const p = pt(i, scores[c]);
        return <circle key={c} cx={p.x} cy={p.y} r="3" fill={CAT_COLOR[c]} />;
      })}
    </svg>
  );
}

function statusColor(s: string) {
  return s === 'ok' ? 'text-green-400' : s === 'warn' ? 'text-yellow-400' : 'text-red-400';
}
function statusBg(s: string) {
  return s === 'ok' ? 'bg-green-900/40 border-green-700' : s === 'warn' ? 'bg-yellow-900/40 border-yellow-700' : 'bg-red-900/40 border-red-700';
}
function statusLabel(s: string) {
  return s === 'ok' ? 'OK' : s === 'warn' ? 'Vigilance' : 'Danger';
}

export default function Diagnostic({ data }: Props) {
  const scores = getCategoryScores(data);
  const allCats = ['rentabilite', 'stock', 'commerce', 'gamme', 'rh'] as KpiCategory[];
  const [openCat, setOpenCat] = useState<KpiCategory | null>(null);

  // Overall score
  const scoreVals = Object.values(scores);
  const overall = Math.round(scoreVals.reduce((s, v) => s + v, 0) / scoreVals.length);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Diagnostic {data.nom || 'Magasin'}</h2>
          <p className="text-sm text-gray-400">Score global : <span className="font-bold text-white">{overall}/100</span></p>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-black ${overall >= 65 ? 'text-green-400' : overall >= 35 ? 'text-yellow-400' : 'text-red-400'}`}>{overall}</div>
          <div className="text-xs text-gray-400">/ 100</div>
        </div>
      </div>

      {/* Radar + category bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 text-center">Vue globale</h3>
          <RadarChart scores={scores} />
        </div>
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Scores par catégorie</h3>
          {allCats.map(cat => {
            const s = Math.round(scores[cat as keyof typeof scores] ?? 50);
            const color = CAT_COLOR[cat];
            return (
              <div key={cat}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300">{CAT_LABELS[cat]}</span>
                  <span className="font-bold text-white">{s}</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${s}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* KPI detail by category */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Détail par indicateur</h3>
        {allCats.map(cat => {
          const kpis = KPI_DEFS.filter(k => k.category === cat);
          const isOpen = openCat === cat;
          return (
            <div key={cat} className="bg-gray-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenCat(isOpen ? null : cat)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-750 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: CAT_COLOR[cat] }} />
                  <span className="font-semibold text-sm">{CAT_LABELS[cat]}</span>
                  <span className="text-xs text-gray-400">{kpis.length} indicateurs</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{Math.round(scores[cat as keyof typeof scores] ?? 50)}/100</span>
                  <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-700 divide-y divide-gray-700">
                  {kpis.map(kpi => {
                    const value = data[kpi.key];
                    const numVal = typeof value === 'number' ? value : 0;
                    const status = numVal > 0 ? kpi.getStatus(numVal) : 'ok';
                    const hasData = numVal > 0;
                    return (
                      <div key={String(kpi.key)} className={`px-4 py-3 ${hasData ? statusBg(status) : 'border-l-2 border-gray-600'} border-l-2`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-200">{kpi.label}</span>
                              {hasData && (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${statusColor(status)}`}>
                                  {statusLabel(status)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              Cible : {kpi.seuilOk}
                              {kpi.seuilVigilance && ` · Vigilance : ${kpi.seuilVigilance}`}
                            </div>
                            {hasData && status !== 'ok' && (
                              <div className="text-xs mt-1.5 text-gray-300 bg-gray-900/50 rounded p-2">
                                {status === 'danger' ? kpi.actionDanger : kpi.actionWarn}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            {hasData ? (
                              <span className={`text-sm font-bold ${statusColor(status)}`}>
                                {numVal}{kpi.unit}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500">—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

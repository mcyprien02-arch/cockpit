'use client';

import { useState } from 'react';
import type { MagasinData, Phase } from '@/types';
import { KPI_DEFS, type KpiCategory, type KpiStatus } from '@/lib/kpis';

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

// ── Phase-aware overrides for 6 KPIs ──────────────────────────────────────
interface PhaseOverride {
  seuilOk: string;
  seuilVigilance: string;
  getStatus: (v: number) => KpiStatus;
  score: (v: number) => number;
}

function s3(v: number, okFn: (x: number) => boolean, warnFn: (x: number) => boolean): KpiStatus {
  return okFn(v) ? 'ok' : warnFn(v) ? 'warn' : 'danger';
}
function sc3(v: number, okFn: (x: number) => boolean, warnFn: (x: number) => boolean): number {
  return okFn(v) ? 100 : warnFn(v) ? 50 : 0;
}

const PHASE_OVERRIDES: Record<string, Record<Phase, PhaseOverride>> = {
  stockAge: {
    Lancement: {
      seuilOk: '<25%', seuilVigilance: '25-35%',
      getStatus: v => v > 0 ? s3(v, x => x < 25, x => x <= 35) : 'ok',
      score: v => v <= 0 ? 0 : sc3(v, x => x < 25, x => x <= 35),
    },
    Croissance: {
      seuilOk: '<22%', seuilVigilance: '22-32%',
      getStatus: v => v > 0 ? s3(v, x => x < 22, x => x <= 32) : 'ok',
      score: v => v <= 0 ? 0 : sc3(v, x => x < 22, x => x <= 32),
    },
    Maturité: {
      seuilOk: '<20%', seuilVigilance: '20-30%',
      getStatus: v => v > 0 ? s3(v, x => x < 20, x => x <= 30) : 'ok',
      score: v => v <= 0 ? 0 : sc3(v, x => x < 20, x => x <= 30),
    },
  },
  gmroi: {
    Lancement: {
      seuilOk: '>2', seuilVigilance: '1.5-2',
      getStatus: v => s3(v, x => x >= 2, x => x >= 1.5),
      score: v => sc3(v, x => x >= 2, x => x >= 1.5),
    },
    Croissance: {
      seuilOk: '>3', seuilVigilance: '2-3',
      getStatus: v => s3(v, x => x >= 3, x => x >= 2),
      score: v => sc3(v, x => x >= 3, x => x >= 2),
    },
    Maturité: {
      seuilOk: '>3.5', seuilVigilance: '2.5-3.5',
      getStatus: v => s3(v, x => x >= 3.5, x => x >= 2.5),
      score: v => sc3(v, x => x >= 3.5, x => x >= 2.5),
    },
  },
  masseSalarialePct: {
    Lancement: {
      seuilOk: '≤18%', seuilVigilance: '18-22%',
      getStatus: v => v > 0 ? s3(v, x => x <= 18, x => x <= 22) : 'ok',
      score: v => v <= 0 ? 0 : sc3(v, x => x <= 18, x => x <= 22),
    },
    Croissance: {
      seuilOk: '≤16%', seuilVigilance: '16-19%',
      getStatus: v => v > 0 ? s3(v, x => x <= 16, x => x <= 19) : 'ok',
      score: v => v <= 0 ? 0 : sc3(v, x => x <= 16, x => x <= 19),
    },
    Maturité: {
      seuilOk: '≤15%', seuilVigilance: '15-18%',
      getStatus: v => v > 0 ? s3(v, x => x <= 15, x => x <= 18) : 'ok',
      score: v => v <= 0 ? 0 : sc3(v, x => x <= 15, x => x <= 18),
    },
  },
  tauxMargeNette: {
    Lancement: {
      seuilOk: '≥35%', seuilVigilance: '30-35%',
      getStatus: v => s3(v, x => x >= 35, x => x >= 30),
      score: v => sc3(v, x => x >= 35, x => x >= 30),
    },
    Croissance: {
      seuilOk: '≥36%', seuilVigilance: '33-36%',
      getStatus: v => s3(v, x => x >= 36, x => x >= 33),
      score: v => sc3(v, x => x >= 36, x => x >= 33),
    },
    Maturité: {
      seuilOk: '≥38%', seuilVigilance: '35-38%',
      getStatus: v => s3(v, x => x >= 38, x => x >= 35),
      score: v => sc3(v, x => x >= 38, x => x >= 35),
    },
  },
  noteGoogle: {
    Lancement: {
      seuilOk: '>4.0', seuilVigilance: '3.5-4.0',
      getStatus: v => s3(v, x => x > 4.0, x => x >= 3.5),
      score: v => sc3(v, x => x > 4.0, x => x >= 3.5),
    },
    Croissance: {
      seuilOk: '>4.2', seuilVigilance: '3.8-4.2',
      getStatus: v => s3(v, x => x > 4.2, x => x >= 3.8),
      score: v => sc3(v, x => x > 4.2, x => x >= 3.8),
    },
    Maturité: {
      seuilOk: '>4.4', seuilVigilance: '4.0-4.4',
      getStatus: v => s3(v, x => x > 4.4, x => x >= 4.0),
      score: v => sc3(v, x => x > 4.4, x => x >= 4.0),
    },
  },
  tauxTurnover: {
    Lancement: {
      seuilOk: '<25%', seuilVigilance: '25-35%',
      getStatus: v => v > 0 ? s3(v, x => x < 25, x => x <= 35) : 'ok',
      score: v => v <= 0 ? 0 : sc3(v, x => x < 25, x => x <= 35),
    },
    Croissance: {
      seuilOk: '<20%', seuilVigilance: '20-30%',
      getStatus: v => v > 0 ? s3(v, x => x < 20, x => x <= 30) : 'ok',
      score: v => v <= 0 ? 0 : sc3(v, x => x < 20, x => x <= 30),
    },
    Maturité: {
      seuilOk: '<15%', seuilVigilance: '15-25%',
      getStatus: v => v > 0 ? s3(v, x => x < 15, x => x <= 25) : 'ok',
      score: v => v <= 0 ? 0 : sc3(v, x => x < 15, x => x <= 25),
    },
  },
};

function getOverride(key: string, phase: Phase): PhaseOverride | null {
  return PHASE_OVERRIDES[key]?.[phase] ?? null;
}

// Phase-aware category scores
function getCategoryScoresPhase(data: MagasinData, phase: Phase): Record<KpiCategory, number> {
  const cats: KpiCategory[] = ['rentabilite', 'stock', 'commerce', 'gamme', 'rh'];
  const result = {} as Record<KpiCategory, number>;

  for (const cat of cats) {
    const kpis = KPI_DEFS.filter(k => k.category === cat);
    const vals = kpis
      .map(k => {
        const v = data[k.key];
        if (typeof v !== 'number' || v === 0) return null;
        const ov = getOverride(String(k.key), phase);
        return ov ? ov.score(v) : k.score(v);
      })
      .filter((v): v is number => v !== null);
    result[cat] = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 50;
  }
  return result;
}

// SVG Radar
function RadarChart({ scores }: { scores: Record<string, number> }) {
  const cats = Object.keys(scores);
  const n = cats.length;
  const cx = 120; const cy = 120; const R = 90;
  const levels = [20, 40, 60, 80, 100];

  function pt(idx: number, val: number) {
    const angle = (idx / n) * 2 * Math.PI - Math.PI / 2;
    const r = (val / 100) * R;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  const polygon = cats.map((_, i) => pt(i, scores[cats[i]])).map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox="0 0 240 240" className="w-full max-w-xs mx-auto">
      {levels.map(lvl => (
        <polygon key={lvl}
          points={cats.map((_, i) => pt(i, lvl)).map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="#374151" strokeWidth="0.5" />
      ))}
      {cats.map((_, i) => {
        const end = pt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#4b5563" strokeWidth="0.5" />;
      })}
      <polygon points={polygon} fill="rgba(16,185,129,0.2)" stroke="#10b981" strokeWidth="1.5" />
      {cats.map((c, i) => {
        const p = pt(i, 115);
        return (
          <text key={c} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill="#9ca3af" fontSize="9" fontWeight="600">
            {CAT_LABELS[c as KpiCategory]}
          </text>
        );
      })}
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
  const phase = data.phase ?? 'Maturité';
  const scores = getCategoryScoresPhase(data, phase);
  const allCats: KpiCategory[] = ['rentabilite', 'stock', 'commerce', 'gamme', 'rh'];
  const [openCat, setOpenCat] = useState<KpiCategory | null>(null);

  const scoreVals = Object.values(scores);
  const overall = Math.round(scoreVals.reduce((s, v) => s + v, 0) / scoreVals.length);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold">Diagnostic {data.nom || 'Magasin'}</h2>
          <p className="text-sm text-gray-400">Score global : <span className="font-bold text-white">{overall}/100</span></p>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-black ${overall >= 65 ? 'text-green-400' : overall >= 35 ? 'text-yellow-400' : 'text-red-400'}`}>{overall}</div>
          <div className="text-xs text-gray-400">/ 100</div>
        </div>
      </div>

      {/* Phase banner */}
      <div className="bg-blue-900/30 border border-blue-700 rounded-xl px-4 py-2 text-xs text-blue-300">
        Seuils adaptés à votre phase : <strong className="text-white">{phase}</strong>
        {' '}— Les KPIs marqués ✦ ont des seuils ajustés par rapport aux valeurs réseau standard.
      </div>

      {/* Radar + bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 text-center">Vue globale</h3>
          <RadarChart scores={scores} />
        </div>
        <div className="bg-gray-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Scores par catégorie</h3>
          {allCats.map(cat => {
            const s = scores[cat] ?? 50;
            return (
              <div key={cat}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300">{CAT_LABELS[cat]}</span>
                  <span className="font-bold text-white">{s}</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${s}%`, background: CAT_COLOR[cat] }} />
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
                  <span className="text-sm font-bold">{scores[cat] ?? 50}/100</span>
                  <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-700 divide-y divide-gray-700">
                  {kpis.map(kpi => {
                    const value = data[kpi.key];
                    const numVal = typeof value === 'number' ? value : 0;
                    const hasData = numVal > 0;
                    const ov = getOverride(String(kpi.key), phase);
                    const isPhaseAdjusted = ov !== null;
                    const status = hasData ? (ov ? ov.getStatus(numVal) : kpi.getStatus(numVal)) : 'ok';
                    const seuilOk = ov ? ov.seuilOk : kpi.seuilOk;
                    const seuilVigilance = ov ? ov.seuilVigilance : kpi.seuilVigilance;
                    return (
                      <div key={String(kpi.key)} className={`px-4 py-3 border-l-2 ${hasData ? statusBg(status) : 'border-gray-600'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-200">{kpi.label}</span>
                              {isPhaseAdjusted && <span className="text-xs text-blue-400">✦</span>}
                              {hasData && (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${statusColor(status)}`}>
                                  {statusLabel(status)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              Cible : {seuilOk}
                              {seuilVigilance && ` · Vigilance : ${seuilVigilance}`}
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

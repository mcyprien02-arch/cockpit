'use client';

import { useState } from 'react';
import type { MagasinData, Phase } from '@/types';
import { KPI_DEFS, type KpiCategory, type KpiStatus } from '@/lib/kpis';
import { SEUIL_DEFAULTS } from '@/lib/seuils';

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

const KPI_DIRECTION: Record<string, 'higher' | 'lower'> = {
  tauxMargeNette: 'higher',
  tauxTransformation: 'higher', panierMoyen: 'higher', estalyParSemaine: 'higher',
  noteGoogle: 'higher', poidsDigital: 'higher', tauxPiceasoft: 'higher',
  tauxFormation: 'higher', gammeTel: 'higher', gammeJV: 'higher',
  tauxDemarque: 'lower', stockAge: 'lower',
  delaiTel: 'lower', delaiConsole: 'lower', delaiJV: 'lower', delaiTablette: 'lower', delaiPC: 'lower',
  tauxAnnulationWeb: 'lower', tauxSAV: 'lower', tauxAchatExterne: 'lower',
  masseSalarialePct: 'lower', tauxTurnover: 'lower',
};

function customSeuilStatus(key: string, value: number, seuil: number): KpiStatus {
  const dir = KPI_DIRECTION[key] ?? 'higher';
  if (dir === 'higher') return value >= seuil ? 'ok' : value >= seuil * 0.85 ? 'warn' : 'danger';
  return value <= seuil ? 'ok' : value <= seuil * 1.2 ? 'warn' : 'danger';
}

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

const EXCLUDED_KPIS = new Set(['chvacv', 'gmroi']);

const PHASE_OVERRIDES: Record<string, Record<Phase, PhaseOverride>> = {
  stockAge: {
    Lancement:  { seuilOk: '<25%',  seuilVigilance: '25-35%', getStatus: v => v > 0 ? s3(v, x => x < 25, x => x <= 35) : 'ok', score: v => v <= 0 ? 0 : sc3(v, x => x < 25, x => x <= 35) },
    Croissance: { seuilOk: '<22%',  seuilVigilance: '22-32%', getStatus: v => v > 0 ? s3(v, x => x < 22, x => x <= 32) : 'ok', score: v => v <= 0 ? 0 : sc3(v, x => x < 22, x => x <= 32) },
    Maturité:   { seuilOk: '<20%',  seuilVigilance: '20-30%', getStatus: v => v > 0 ? s3(v, x => x < 20, x => x <= 30) : 'ok', score: v => v <= 0 ? 0 : sc3(v, x => x < 20, x => x <= 30) },
  },
  masseSalarialePct: {
    Lancement:  { seuilOk: '≤18%', seuilVigilance: '18-22%', getStatus: v => v > 0 ? s3(v, x => x <= 18, x => x <= 22) : 'ok', score: v => v <= 0 ? 0 : sc3(v, x => x <= 18, x => x <= 22) },
    Croissance: { seuilOk: '≤16%', seuilVigilance: '16-19%', getStatus: v => v > 0 ? s3(v, x => x <= 16, x => x <= 19) : 'ok', score: v => v <= 0 ? 0 : sc3(v, x => x <= 16, x => x <= 19) },
    Maturité:   { seuilOk: '≤15%', seuilVigilance: '15-18%', getStatus: v => v > 0 ? s3(v, x => x <= 15, x => x <= 18) : 'ok', score: v => v <= 0 ? 0 : sc3(v, x => x <= 15, x => x <= 18) },
  },
  tauxMargeNette: {
    Lancement:  { seuilOk: '≥35%', seuilVigilance: '30-35%', getStatus: v => s3(v, x => x >= 35, x => x >= 30), score: v => sc3(v, x => x >= 35, x => x >= 30) },
    Croissance: { seuilOk: '≥36%', seuilVigilance: '33-36%', getStatus: v => s3(v, x => x >= 36, x => x >= 33), score: v => sc3(v, x => x >= 36, x => x >= 33) },
    Maturité:   { seuilOk: '≥38%', seuilVigilance: '35-38%', getStatus: v => s3(v, x => x >= 38, x => x >= 35), score: v => sc3(v, x => x >= 38, x => x >= 35) },
  },
  noteGoogle: {
    Lancement:  { seuilOk: '>4.0', seuilVigilance: '3.5-4.0', getStatus: v => s3(v, x => x > 4.0, x => x >= 3.5), score: v => sc3(v, x => x > 4.0, x => x >= 3.5) },
    Croissance: { seuilOk: '>4.2', seuilVigilance: '3.8-4.2', getStatus: v => s3(v, x => x > 4.2, x => x >= 3.8), score: v => sc3(v, x => x > 4.2, x => x >= 3.8) },
    Maturité:   { seuilOk: '>4.4', seuilVigilance: '4.0-4.4', getStatus: v => s3(v, x => x > 4.4, x => x >= 4.0), score: v => sc3(v, x => x > 4.4, x => x >= 4.0) },
  },
  tauxTurnover: {
    Lancement:  { seuilOk: '<25%', seuilVigilance: '25-35%', getStatus: v => v > 0 ? s3(v, x => x < 25, x => x <= 35) : 'ok', score: v => v <= 0 ? 0 : sc3(v, x => x < 25, x => x <= 35) },
    Croissance: { seuilOk: '<20%', seuilVigilance: '20-30%', getStatus: v => v > 0 ? s3(v, x => x < 20, x => x <= 30) : 'ok', score: v => v <= 0 ? 0 : sc3(v, x => x < 20, x => x <= 30) },
    Maturité:   { seuilOk: '<15%', seuilVigilance: '15-25%', getStatus: v => v > 0 ? s3(v, x => x < 15, x => x <= 25) : 'ok', score: v => v <= 0 ? 0 : sc3(v, x => x < 15, x => x <= 25) },
  },
};

function getOverride(key: string, phase: Phase): PhaseOverride | null {
  return PHASE_OVERRIDES[key]?.[phase] ?? null;
}

function getCategoryScoresPhase(data: MagasinData, phase: Phase): Record<KpiCategory, number> {
  const cats: KpiCategory[] = ['rentabilite', 'stock', 'commerce', 'gamme', 'rh'];
  const result = {} as Record<KpiCategory, number>;
  for (const cat of cats) {
    const kpis = KPI_DEFS.filter(k => k.category === cat && !EXCLUDED_KPIS.has(String(k.key)));
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
          fill="none" stroke="#E0E0E0" strokeWidth="0.5" />
      ))}
      {cats.map((_, i) => {
        const end = pt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#D1D5DB" strokeWidth="0.5" />;
      })}
      <polygon points={polygon} fill="rgba(16,185,129,0.15)" stroke="#10b981" strokeWidth="1.5" />
      {cats.map((c, i) => {
        const p = pt(i, 115);
        return (
          <text key={c} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill="#6B7280" fontSize="9" fontWeight="600">
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
  return s === 'ok' ? 'text-green-600' : s === 'warn' ? 'text-orange-500' : 'text-red-600';
}
function statusBg(s: string) {
  return s === 'ok' ? 'bg-green-50 border-green-300' : s === 'warn' ? 'bg-orange-50 border-orange-300' : 'bg-red-50 border-red-200';
}
function statusLabel(s: string) {
  return s === 'ok' ? 'OK' : s === 'warn' ? 'Vigilance' : 'Danger';
}

export default function Diagnostic({ data }: Props) {
  const phase = data.phase ?? 'Maturité';
  const scores = getCategoryScoresPhase(data, phase);
  const allCats: KpiCategory[] = ['rentabilite', 'stock', 'commerce', 'gamme', 'rh'];
  const [openCat, setOpenCat] = useState<KpiCategory | null>(null);
  const [customSeuils] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return { ...SEUIL_DEFAULTS };
    try { const s = localStorage.getItem(`seuils_${data.nom}`); return s ? JSON.parse(s) as Record<string, number> : { ...SEUIL_DEFAULTS }; }
    catch { return { ...SEUIL_DEFAULTS }; }
  });

  const scoreVals = Object.values(scores);
  const overall = Math.round(scoreVals.reduce((s, v) => s + v, 0) / scoreVals.length);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-[#1A1A1A]">Diagnostic {data.nom || 'Magasin'}</h2>
          <p className="text-sm text-[#6B7280]">Score global : <span className="font-bold text-[#1A1A1A]">{overall}/100</span></p>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-black ${overall >= 65 ? 'text-green-600' : overall >= 35 ? 'text-orange-500' : 'text-red-600'}`}>{overall}</div>
          <div className="text-xs text-[#6B7280]">/ 100</div>
        </div>
      </div>

      {/* Phase banner */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2 text-xs text-orange-700">
        Feux tricolores basés sur <strong className="text-orange-800">vos seuils personnalisés</strong> (Dashboard → Modifier mes données).
        {' '}Seuil vide = valeur brute affichée sans feu.
      </div>

      {/* Radar + bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4">
          <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3 text-center">Vue globale</h3>
          <RadarChart scores={scores} />
        </div>
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3">Scores par catégorie</h3>
          {allCats.map(cat => {
            const s = scores[cat] ?? 50;
            return (
              <div key={cat}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#6B7280]">{CAT_LABELS[cat]}</span>
                  <span className="font-bold text-[#1A1A1A]">{s}</span>
                </div>
                <div className="h-2 bg-[#E0E0E0] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${s}%`, background: CAT_COLOR[cat] }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* KPI detail by category */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-[#1A1A1A]">Détail par indicateur</h3>
        {allCats.map(cat => {
          const kpis = KPI_DEFS.filter(k => k.category === cat && !EXCLUDED_KPIS.has(String(k.key)));
          const isOpen = openCat === cat;
          return (
            <div key={cat} className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
              <button
                onClick={() => setOpenCat(isOpen ? null : cat)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F5F5F5] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: CAT_COLOR[cat] }} />
                  <span className="font-semibold text-sm text-[#1A1A1A]">{CAT_LABELS[cat]}</span>
                  <span className="text-xs text-[#6B7280]">{kpis.length} indicateurs</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#1A1A1A]">{scores[cat] ?? 50}/100</span>
                  <span className="text-[#6B7280] text-xs">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-[#E0E0E0] divide-y divide-[#E0E0E0]">
                  {kpis.map(kpi => {
                    const value = data[kpi.key];
                    const numVal = typeof value === 'number' ? value : 0;
                    const hasData = numVal > 0;
                    const rawSeuil = customSeuils[String(kpi.key)];
                    const hasSeuil = rawSeuil !== undefined && rawSeuil > 0;
                    const status = hasData && hasSeuil ? customSeuilStatus(String(kpi.key), numVal, rawSeuil) : 'ok';
                    const showBadge = hasData && hasSeuil;
                    return (
                      <div key={String(kpi.key)} className={`px-4 py-3 border-l-2 ${showBadge ? statusBg(status) : 'border-[#E0E0E0]'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-[#1A1A1A]">{kpi.label}</span>
                              {showBadge && (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${statusColor(status)}`}>
                                  {statusLabel(status)}
                                </span>
                              )}
                            </div>
                            {hasSeuil ? (
                              <div className="text-xs text-amber-600 mt-0.5">Mon seuil : {rawSeuil}{kpi.unit}</div>
                            ) : (
                              <div className="text-xs text-[#6B7280] mt-0.5 italic">Aucun seuil défini — saisissez-le dans le Dashboard</div>
                            )}
                            {showBadge && status !== 'ok' && (
                              <div className="text-xs mt-1.5 text-[#1A1A1A] bg-[#F5F5F5] rounded p-2">
                                {status === 'danger' ? kpi.actionDanger : kpi.actionWarn}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            {hasData ? (
                              <span className={`text-sm font-bold ${showBadge ? statusColor(status) : 'text-[#6B7280]'}`}>
                                {numVal}{kpi.unit}
                              </span>
                            ) : (
                              <span className="text-xs text-[#6B7280]">—</span>
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

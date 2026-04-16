'use client';

import { useState, useEffect } from 'react';
import type { MagasinData } from '@/types';
import { DEFAULT_DATA } from '@/types';
import { KPI_DEFS, getCategoryScores, type KpiCategory } from '@/lib/kpis';

interface Props { magasins: string[]; }

type CategoryScores = { rentabilite: number; stock: number; commerce: number; rh: number };

const CAT_LABELS: Record<string, string> = {
  rentabilite: 'Rentabilité',
  stock: 'Stock',
  commerce: 'Commerce',
  rh: 'RH',
};

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function loadData(nom: string): MagasinData {
  try {
    const s = typeof window !== 'undefined' ? localStorage.getItem(`ec_data_${nom}`) : null;
    return s ? { ...DEFAULT_DATA, ...JSON.parse(s) as Partial<MagasinData> } : DEFAULT_DATA;
  } catch { return DEFAULT_DATA; }
}

// Radar chart for multiple magasins overlay
function MultiRadar({ datasets }: { datasets: Array<{ nom: string; scores: CategoryScores; color: string }> }) {
  const cats = ['rentabilite', 'stock', 'commerce', 'rh'];
  const n = cats.length;
  const cx = 120; const cy = 120; const R = 90;
  const levels = [25, 50, 75, 100];

  function pt(catIdx: number, val: number) {
    const angle = (catIdx / n) * 2 * Math.PI - Math.PI / 2;
    const r = (val / 100) * R;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  return (
    <svg viewBox="0 0 240 240" className="w-full max-w-xs mx-auto">
      {levels.map(lvl => (
        <polygon key={lvl}
          points={cats.map((_, i) => pt(i, lvl)).map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="#374151" strokeWidth="0.5"
        />
      ))}
      {cats.map((_, i) => {
        const end = pt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#4b5563" strokeWidth="0.5" />;
      })}
      {datasets.map((ds) => {
        const polygon = cats.map((c, i) => pt(i, ds.scores[c as keyof CategoryScores] ?? 50)).map(p => `${p.x},${p.y}`).join(' ');
        return (
          <polygon key={ds.nom} points={polygon}
            fill={ds.color + '22'} stroke={ds.color} strokeWidth="1.5" />
        );
      })}
      {cats.map((c, i) => {
        const p = pt(i, 115);
        return (
          <text key={c} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill="#9ca3af" fontSize="9" fontWeight="600">
            {CAT_LABELS[c]}
          </text>
        );
      })}
    </svg>
  );
}

export default function Comparatif({ magasins }: Props) {
  const [datasets, setDatasets] = useState<Array<{ nom: string; data: MagasinData; scores: CategoryScores }>>([]);

  useEffect(() => {
    const ds = magasins.map(nom => {
      const data = loadData(nom);
      const scores = getCategoryScores(data);
      return { nom, data, scores };
    });
    setDatasets(ds);
  }, [magasins]);

  if (magasins.length === 0) {
    return (
      <div className="text-center text-gray-500 text-sm py-10">
        Aucun magasin enregistré. Commencez par saisir les données dans le Dashboard.
      </div>
    );
  }

  if (magasins.length < 2) {
    return (
      <div className="text-center text-gray-500 text-sm py-10">
        Comparatif disponible avec au moins 2 magasins.
        <br />Ajoutez un second magasin en changeant le nom dans le Dashboard.
      </div>
    );
  }

  const cats = ['rentabilite', 'stock', 'commerce', 'rh'] as const;

  // Which magasin leads each category
  function leader(cat: typeof cats[number]) {
    return datasets.reduce((best, ds) =>
      ds.scores[cat] > (best?.scores[cat] ?? -1) ? ds : best, datasets[0]);
  }

  // KPI comparison table — selected KPIs to display
  const compKpis = KPI_DEFS.filter(k =>
    ['tauxMargeNette', 'tauxDemarque', 'gmroi', 'stockAge', 'tauxTransformation', 'panierMoyen', 'noteGoogle', 'masseSalarialePct'].includes(String(k.key))
  );

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">Comparatif réseau ({magasins.length} magasins)</h2>

      {/* Radar overlay */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 text-center">Vue radar comparative</h3>
          <MultiRadar datasets={datasets.map((ds, i) => ({ nom: ds.nom, scores: ds.scores, color: COLORS[i % COLORS.length] }))} />
          {/* Legend */}
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {datasets.map((ds, i) => (
              <div key={ds.nom} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-xs text-gray-300">{ds.nom}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Category scores table */}
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Scores par catégorie</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 text-gray-400 font-medium">Catégorie</th>
                  {datasets.map((ds, i) => (
                    <th key={ds.nom} className="text-center py-2 font-medium" style={{ color: COLORS[i % COLORS.length] }}>{ds.nom}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {cats.map(cat => {
                  const lead = leader(cat);
                  return (
                    <tr key={cat}>
                      <td className="py-2 text-gray-300 font-medium">{CAT_LABELS[cat]}</td>
                      {datasets.map((ds, i) => (
                        <td key={ds.nom} className="py-2 text-center">
                          <span className={`font-bold ${ds.nom === lead.nom ? 'text-green-400' : 'text-white'}`}>
                            {Math.round(ds.scores[cat])}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr className="border-t border-gray-600">
                  <td className="py-2 text-white font-semibold">Global</td>
                  {datasets.map((ds, i) => {
                    const overall = Math.round(cats.reduce((s, c) => s + ds.scores[c], 0) / cats.length);
                    return (
                      <td key={ds.nom} className="py-2 text-center">
                        <span className={`font-black text-base ${overall >= 65 ? 'text-green-400' : overall >= 35 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {overall}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* KPI detail comparison */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h3 className="font-semibold text-sm">Indicateurs clés comparés</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-2 text-gray-400 font-medium">Indicateur</th>
                <th className="text-center px-3 py-2 text-gray-400 font-medium">Cible</th>
                {datasets.map((ds, i) => (
                  <th key={ds.nom} className="text-center px-3 py-2 font-medium min-w-[80px]" style={{ color: COLORS[i % COLORS.length] }}>{ds.nom}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {compKpis.map(kpi => {
                const values = datasets.map(ds => {
                  const v = ds.data[kpi.key];
                  return typeof v === 'number' ? v : 0;
                });
                return (
                  <tr key={String(kpi.key)} className="hover:bg-gray-750">
                    <td className="px-4 py-2 text-gray-300">{kpi.label}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{kpi.seuilOk}</td>
                    {values.map((v, i) => {
                      const status = v > 0 ? kpi.getStatus(v) : null;
                      const color = status === 'ok' ? 'text-green-400' : status === 'warn' ? 'text-yellow-400' : status === 'danger' ? 'text-red-400' : 'text-gray-500';
                      return (
                        <td key={i} className={`px-3 py-2 text-center font-semibold ${color}`}>
                          {v > 0 ? `${v}${kpi.unit}` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

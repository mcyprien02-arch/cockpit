'use client';

import { useState, useEffect } from 'react';

interface Props { magasinNom: string; }

interface Famille {
  id: string;
  famille: string;
  stockCible: number;
  couverture: number;
  poidsCA: number;
  tauxMarge: number;
  delaiVente: number;
}

const DEFAULT_FAMILLES: Array<Omit<Famille, 'id'>> = [
  { famille: 'JCON', stockCible: 16000, couverture: 0, poidsCA: 10.8, tauxMarge: 47, delaiVente: 30 },
  { famille: 'JCDR', stockCible: 12000, couverture: 0, poidsCA: 8.1,  tauxMarge: 47, delaiVente: 30 },
  { famille: 'TLCE', stockCible: 16000, couverture: 0, poidsCA: 37,   tauxMarge: 34, delaiVente: 30 },
  { famille: 'ITAB', stockCible: 6000,  couverture: 0, poidsCA: 5,    tauxMarge: 40, delaiVente: 30 },
  { famille: 'JPOR', stockCible: 4000,  couverture: 0, poidsCA: 3,    tauxMarge: 47, delaiVente: 45 },
];

function uid() { return Math.random().toString(36).slice(2); }
function defaultRows(): Famille[] {
  return DEFAULT_FAMILLES.map(f => ({ ...f, id: uid() }));
}

function score(f: Famille): number {
  if (!f.delaiVente || f.delaiVente <= 0) return 0;
  return (f.poidsCA * f.tauxMarge) / f.delaiVente;
}

export default function CouvertureGamme({ magasinNom }: Props) {
  const [familles, setFamilles] = useState<Famille[]>(defaultRows);

  useEffect(() => {
    try {
      const s = localStorage.getItem(`couverture_${magasinNom}`);
      if (s) setFamilles(JSON.parse(s) as Famille[]);
      else setFamilles(defaultRows());
    } catch {
      setFamilles(defaultRows());
    }
  }, [magasinNom]);

  function save(rows: Famille[]) {
    setFamilles(rows);
    localStorage.setItem(`couverture_${magasinNom}`, JSON.stringify(rows));
  }

  function update(id: string, field: keyof Famille, raw: string) {
    const value = field === 'famille' ? raw : (parseFloat(raw) || 0);
    save(familles.map(f => f.id === id ? { ...f, [field]: value } : f));
  }

  function add() {
    save([...familles, { id: uid(), famille: '', stockCible: 0, couverture: 0, poidsCA: 0, tauxMarge: 0, delaiVente: 0 }]);
  }

  function del(id: string) {
    save(familles.filter(f => f.id !== id));
  }

  // Derived per-row
  const rows = familles.map(f => {
    const manque = Math.max(0, Math.round(f.stockCible * (1 - f.couverture / 100)));
    const s = score(f);
    return { ...f, manque, score: s };
  });

  // Ranks: descending score (1 = highest)
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const rankMap = new Map<string, number>();
  sorted.forEach((r, i) => rankMap.set(r.id, i + 1));

  // Totals
  const totalCible   = rows.reduce((s, r) => s + (r.stockCible || 0), 0);
  const totalActuel  = rows.reduce((s, r) => s + Math.round(r.stockCible * (r.couverture / 100)), 0);
  const totalManque  = rows.reduce((s, r) => s + r.manque, 0);
  const totalPoidsCA = rows.reduce((s, r) => s + (r.poidsCA || 0), 0);
  const couvertureGlobale = totalCible > 0 ? Math.round((totalActuel / totalCible) * 100) : 0;

  // Top 5 by rank (only those with a score > 0 and a manque > 0)
  const top5 = sorted.filter(r => r.score > 0 && r.manque > 0).slice(0, 5);

  const banner = totalCible === 0 ? null
    : couvertureGlobale >= 95
      ? { cls: 'border-l-green-500 bg-green-50', text: `Couverture quasi complète. La priorité bascule du renforcement vers le renouvellement (rotation), pas vers l'élargissement.` }
      : couvertureGlobale >= 70
        ? { cls: 'border-l-blue-500 bg-blue-50',   text: `Votre couverture est correcte. Pour la finaliser efficacement, concentrez les achats sur les familles à fort score priorité. Investissement complémentaire : ${totalManque.toLocaleString('fr-FR')} €.` }
        : { cls: 'border-l-orange-400 bg-orange-50', text: `Votre couverture est faible. Priorisez l'investissement sur les familles à fort score (rang 1 à 3) avant d'élargir aux autres. Investissement théorique total : ${totalManque.toLocaleString('fr-FR')} €.` };

  const ic = 'bg-white border border-[#E0E0E0] rounded-md px-2 py-1.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#E30613]';

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-[#1A1A1A]">Couverture de gamme — {magasinNom || 'Magasin'}</h2>

      {/* Intro */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl px-4 py-3 text-sm text-[#6B7280]">
        Ce module identifie dans quelles familles renforcer votre stock en priorité, selon leur poids dans votre CA, leur rentabilité et leur vitesse d&apos;écoulement. L&apos;objectif n&apos;est pas seulement de combler la gamme, mais de la combler là où elle générera le plus d&apos;impact pour votre magasin.
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F5F5F5] border-b border-[#E0E0E0]">
                <th className="text-left px-3 py-2.5 font-semibold text-[#6B7280]">Famille</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Stock cible (€)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Couverture (%)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Manque (€)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Poids CA (%)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Taux marge (%)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Délai vente (j)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Score</th>
                <th className="text-center px-3 py-2.5 font-semibold text-[#6B7280]">Rang</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0E0]">
              {rows.map(f => {
                const rang = rankMap.get(f.id) ?? '—';
                const rangNum = rankMap.get(f.id);
                const rangColor = rangNum === 1 ? 'text-[#E30613] font-black'
                  : rangNum === 2 ? 'text-orange-500 font-bold'
                  : rangNum === 3 ? 'text-yellow-600 font-bold'
                  : 'text-[#6B7280]';
                return (
                  <tr key={f.id} className="hover:bg-[#FAFAFA]">
                    <td className="px-3 py-2">
                      <input value={f.famille} onChange={e => update(f.id, 'famille', e.target.value)} className={`${ic} w-20`} placeholder="Famille" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" value={f.stockCible || ''} onChange={e => update(f.id, 'stockCible', e.target.value)} className={`${ic} w-24 text-right`} placeholder="0" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="0" max="100" value={f.couverture || ''} onChange={e => update(f.id, 'couverture', e.target.value)} className={`${ic} w-16 text-right`} placeholder="0" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-semibold ${f.manque > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                        {f.stockCible > 0 ? (f.manque > 0 ? `${f.manque.toLocaleString('fr-FR')} €` : '✓') : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="0" max="100" value={f.poidsCA || ''} onChange={e => update(f.id, 'poidsCA', e.target.value)} className={`${ic} w-16 text-right`} placeholder="0" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="0" max="100" value={f.tauxMarge || ''} onChange={e => update(f.id, 'tauxMarge', e.target.value)} className={`${ic} w-16 text-right`} placeholder="0" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min="0" value={f.delaiVente || ''} onChange={e => update(f.id, 'delaiVente', e.target.value)} className={`${ic} w-16 text-right`} placeholder="0" />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-[#1A1A1A]">
                      {f.score > 0 ? f.score.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={rangColor}>{f.score > 0 ? `#${rang}` : '—'}</span>
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => del(f.id)} className="text-[#9CA3AF] hover:text-red-600 transition-colors">🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {totalCible > 0 && (
              <tfoot>
                <tr className="bg-[#F5F5F5] border-t-2 border-[#E0E0E0] font-semibold text-xs">
                  <td className="px-3 py-2.5 text-[#1A1A1A]">Total</td>
                  <td className="px-3 py-2.5 text-right text-[#1A1A1A]">{totalCible.toLocaleString('fr-FR')} €</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={couvertureGlobale >= 95 ? 'text-green-600 font-black' : couvertureGlobale >= 70 ? 'text-blue-600 font-black' : 'text-orange-500 font-black'}>
                      {couvertureGlobale}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={totalManque > 0 ? 'text-orange-500' : 'text-green-600'}>
                      {totalManque > 0 ? `${totalManque.toLocaleString('fr-FR')} €` : '✓'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#6B7280]">{totalPoidsCA.toFixed(1)}%</td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="px-3 py-2 border-t border-[#E0E0E0]">
          <button onClick={add} className="text-xs text-[#E30613] hover:text-[#B8050F] font-medium transition-colors">
            + Ajouter une famille
          </button>
        </div>
      </div>

      {/* Priority order */}
      {top5.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4 space-y-2">
          <h3 className="text-sm font-bold text-[#1A1A1A] mb-3">🎯 Ordre de priorité d&apos;investissement</h3>
          {top5.map((f, i) => {
            const rang = i + 1;
            const numColor = rang === 1 ? 'text-[#E30613]' : rang === 2 ? 'text-orange-500' : rang === 3 ? 'text-yellow-600' : 'text-[#6B7280]';
            return (
              <div key={f.id} className="flex items-start gap-2 text-sm">
                <span className={`font-black text-base w-6 flex-shrink-0 ${numColor}`}>#{rang}</span>
                <span className="text-[#1A1A1A]">
                  <strong>{f.famille || '—'}</strong> : combler le manque de{' '}
                  <strong>{f.manque.toLocaleString('fr-FR')} €</strong>
                  {' '}(poids CA {f.poidsCA}%, marge {f.tauxMarge}%, rotation {f.delaiVente}j)
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Dynamic banner */}
      {banner && (
        <div className={`${banner.cls} border-l-4 rounded-r-xl px-4 py-3 text-sm text-[#1A1A1A]`}>
          {banner.text}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-[#9CA3AF] italic">
        Score priorité = (Poids CA × Taux marge) / Délai de vente moyen. Une famille à fort poids, forte marge et rotation rapide est prioritaire. Estimation indicative basée sur les valeurs saisies — ne constitue pas un engagement financier.
      </p>
    </div>
  );
}

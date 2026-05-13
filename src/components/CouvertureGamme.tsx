'use client';

import { useState, useEffect } from 'react';

interface Props { magasinNom: string; }

interface Famille {
  id: string;
  famille: string;
  stockCible: number;
  couverture: number;
}

const DEFAULT_FAMILLES: Array<{ famille: string; stockCible: number }> = [
  { famille: 'JCON', stockCible: 16000 },
  { famille: 'JCDR', stockCible: 12000 },
  { famille: 'TLCE', stockCible: 16000 },
  { famille: 'ITAB', stockCible: 6000 },
  { famille: 'JPOR', stockCible: 4000 },
];

function uid() { return Math.random().toString(36).slice(2); }

function defaultRows(): Famille[] {
  return DEFAULT_FAMILLES.map(f => ({ id: uid(), famille: f.famille, stockCible: f.stockCible, couverture: 0 }));
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

  function update(id: string, field: keyof Famille, value: string | number) {
    save(familles.map(f => f.id === id ? { ...f, [field]: value } : f));
  }

  function add() {
    save([...familles, { id: uid(), famille: '', stockCible: 0, couverture: 0 }]);
  }

  function del(id: string) {
    save(familles.filter(f => f.id !== id));
  }

  function stockActuel(f: Famille) {
    return Math.round(f.stockCible * (f.couverture / 100));
  }

  function manque(f: Famille) {
    return Math.max(0, f.stockCible - stockActuel(f));
  }

  const totalCible = familles.reduce((s, f) => s + (f.stockCible || 0), 0);
  const totalActuel = familles.reduce((s, f) => s + stockActuel(f), 0);
  const totalManque = familles.reduce((s, f) => s + manque(f), 0);
  const couvertureGlobale = totalCible > 0 ? Math.round((totalActuel / totalCible) * 100) : 0;

  const banner = totalCible === 0 ? null
    : couvertureGlobale >= 95
      ? {
          border: 'border-l-green-500',
          bg: 'bg-green-50',
          text: `Couverture quasi complète (${couvertureGlobale}%). Concentrez vos achats sur le renouvellement plutôt que sur l'élargissement.`,
        }
      : couvertureGlobale >= 70
        ? {
            border: 'border-l-blue-500',
            bg: 'bg-blue-50',
            text: `Couverture estimée à ${couvertureGlobale}%. Investissement complémentaire théorique : ${totalManque.toLocaleString('fr-FR')} €.`,
          }
        : {
            border: 'border-l-orange-400',
            bg: 'bg-orange-50',
            text: `Couverture estimée à ${couvertureGlobale}%. Investissement théorique pour atteindre 100% : ${totalManque.toLocaleString('fr-FR')} €. À croiser avec votre trésorerie disponible avant de décider.`,
          };

  const ic = 'bg-white border border-[#E0E0E0] rounded-md px-2 py-1.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#E30613]';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">Couverture de gamme — {magasinNom || 'Magasin'}</h2>
      </div>

      {/* Description */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl px-4 py-3 text-sm text-[#6B7280]">
        Mesurez votre taux de couverture par famille et l'investissement théorique pour atteindre 100% de la gamme référence.
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F5F5F5] border-b border-[#E0E0E0]">
                <th className="text-left px-3 py-2.5 font-semibold text-[#6B7280]">Famille</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Stock cible 100% (€)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Couverture actuelle (%)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Stock actuel estimé (€)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Manque pour 100% (€)</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0E0]">
              {familles.map(f => {
                const actuel = stockActuel(f);
                const gap = manque(f);
                return (
                  <tr key={f.id} className="hover:bg-[#FAFAFA]">
                    <td className="px-3 py-2">
                      <input
                        value={f.famille}
                        onChange={e => update(f.id, 'famille', e.target.value)}
                        className={`${ic} w-24`}
                        placeholder="Famille"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={f.stockCible || ''}
                        onChange={e => update(f.id, 'stockCible', parseFloat(e.target.value) || 0)}
                        className={`${ic} w-28 text-right`}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={f.couverture || ''}
                        onChange={e => update(f.id, 'couverture', Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                        className={`${ic} w-20 text-right`}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-[#1A1A1A]">
                      {f.stockCible > 0 ? actuel.toLocaleString('fr-FR') + ' €' : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-semibold ${gap > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                        {f.stockCible > 0 ? (gap > 0 ? `${gap.toLocaleString('fr-FR')} €` : '✓ Complet') : '—'}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => del(f.id)} className="text-[#9CA3AF] hover:text-red-600 transition-colors">🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Recap row */}
            {familles.length > 0 && totalCible > 0 && (
              <tfoot>
                <tr className="bg-[#F5F5F5] border-t-2 border-[#E0E0E0] font-semibold">
                  <td className="px-3 py-2.5 text-[#1A1A1A]">Total</td>
                  <td className="px-3 py-2.5 text-right text-[#1A1A1A]">{totalCible.toLocaleString('fr-FR')} €</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`font-bold ${couvertureGlobale >= 95 ? 'text-green-600' : couvertureGlobale >= 70 ? 'text-blue-600' : 'text-orange-500'}`}>
                      {couvertureGlobale}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#1A1A1A]">{totalActuel.toLocaleString('fr-FR')} €</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`font-bold ${totalManque > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                      {totalManque > 0 ? `${totalManque.toLocaleString('fr-FR')} €` : '✓ Couvert'}
                    </span>
                  </td>
                  <td></td>
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

      {/* Dynamic banner */}
      {banner && (
        <div className={`${banner.bg} ${banner.border} border-l-4 rounded-r-xl px-4 py-3 text-sm text-[#1A1A1A]`}>
          {banner.text}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-[#9CA3AF] italic">
        Estimation indicative basée sur les valeurs cibles que vous avez saisies. Ne constitue pas un engagement financier.
      </p>
    </div>
  );
}

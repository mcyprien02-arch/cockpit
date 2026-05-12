'use client';

import { useState, useEffect } from 'react';

interface Props { magasinNom: string; }

interface ObjFamille {
  id: string;
  famille: string;
  margeCible: number;
  tauxMarge: number;
  margeRealisee: number;
}

interface ObjData {
  familles: ObjFamille[];
  promoRedist: number;
}

const DEFAULT_FAMILLES: Array<{ famille: string; tauxMarge: number }> = [
  { famille: 'Téléphonie',    tauxMarge: 34 },
  { famille: 'Jeux Vidéo',   tauxMarge: 47 },
  { famille: 'Informatique',  tauxMarge: 40 },
  { famille: 'Bijouterie',    tauxMarge: 39 },
  { famille: 'Libre-service', tauxMarge: 76 },
];

function uid() { return Math.random().toString(36).slice(2); }

function defaultRows(): ObjFamille[] {
  return DEFAULT_FAMILLES.map(f => ({ id: uid(), famille: f.famille, tauxMarge: f.tauxMarge, margeCible: 0, margeRealisee: 0 }));
}

export default function Objectifs({ magasinNom }: Props) {
  const today = new Date();
  const defaultMonth = today.toISOString().slice(0, 7);

  const [month, setMonth] = useState(defaultMonth);
  const [promoRedist, setPromoRedist] = useState(30);
  const [familles, setFamilles] = useState<ObjFamille[]>(defaultRows());

  useEffect(() => {
    try {
      const key = `objectifs_${magasinNom}_${month}`;
      const s = localStorage.getItem(key);
      if (s) {
        const parsed = JSON.parse(s) as ObjData;
        setFamilles(parsed.familles ?? defaultRows());
        setPromoRedist(parsed.promoRedist ?? 30);
      } else {
        setFamilles(defaultRows());
        setPromoRedist(30);
      }
    } catch {
      setFamilles(defaultRows());
    }
  }, [month, magasinNom]);

  function save(f: ObjFamille[], p: number) {
    const key = `objectifs_${magasinNom}_${month}`;
    localStorage.setItem(key, JSON.stringify({ familles: f, promoRedist: p } as ObjData));
  }

  function updateFamille(id: string, field: keyof ObjFamille, value: string | number) {
    const next = familles.map(f => f.id === id ? { ...f, [field]: value } : f);
    setFamilles(next);
    save(next, promoRedist);
  }

  function addFamille() {
    const next = [...familles, { id: uid(), famille: '', tauxMarge: 40, margeCible: 0, margeRealisee: 0 }];
    setFamilles(next);
    save(next, promoRedist);
  }

  function delFamille(id: string) {
    const next = familles.filter(f => f.id !== id);
    setFamilles(next);
    save(next, promoRedist);
  }

  function updatePromo(p: number) {
    setPromoRedist(p);
    save(familles, p);
  }

  function stockNecessaire(f: ObjFamille): number {
    if (f.tauxMarge <= 0 || f.margeCible <= 0) return 0;
    return Math.round(f.margeCible / (f.tauxMarge / 100));
  }

  function avancement(f: ObjFamille): number {
    if (f.margeCible <= 0) return 0;
    return Math.round((f.margeRealisee / f.margeCible) * 100);
  }

  function budgetPromo(f: ObjFamille): number {
    return Math.max(0, Math.round((f.margeRealisee - f.margeCible) * promoRedist / 100));
  }

  const totalCible = familles.reduce((s, f) => s + (f.margeCible || 0), 0);
  const totalRealisee = familles.reduce((s, f) => s + (f.margeRealisee || 0), 0);
  const totalAvancement = totalCible > 0 ? Math.round((totalRealisee / totalCible) * 100) : 0;
  const totalBudgetPromo = familles.reduce((s, f) => s + budgetPromo(f), 0);

  const statusMsg = totalCible === 0 ? null
    : totalAvancement >= 100
      ? { msg: 'Objectif atteint — budget promo disponible !', cls: 'bg-green-50 border-green-300 text-green-700', icon: '🎉' }
      : totalAvancement >= 50
        ? { msg: 'En bonne voie — continuez', cls: 'bg-blue-50 border-blue-200 text-blue-700', icon: '📈' }
        : { msg: 'En retard — relancez les ventes', cls: 'bg-orange-50 border-orange-200 text-orange-600', icon: '⚠' };

  const ic = 'bg-white border border-[#E0E0E0] rounded-md px-2 py-1.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#E30613]';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-bold text-[#1A1A1A]">🎯 Objectifs — {magasinNom || 'Magasin'}</h2>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#6B7280]">Mois</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className={ic}
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-[#6B7280]">Redistrib. promo</label>
            <input
              type="number"
              value={promoRedist || ''}
              onChange={e => updatePromo(parseFloat(e.target.value) || 0)}
              className={`${ic} w-16 text-center`}
              placeholder="30"
            />
            <span className="text-xs text-[#6B7280]">%</span>
          </div>
        </div>
      </div>

      {/* Status message */}
      {statusMsg && (
        <div className={`rounded-xl px-4 py-3 border font-semibold text-sm ${statusMsg.cls}`}>
          {statusMsg.icon} {statusMsg.msg}
          {totalAvancement > 0 && ` — ${totalAvancement}% réalisé`}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F5F5F5] border-b border-[#E0E0E0]">
                <th className="text-left px-3 py-2.5 font-semibold text-[#6B7280]">Famille</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Marge cible (€)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Taux marge (%)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Stock nécessaire</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Marge réalisée (€)</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Avancement</th>
                <th className="text-right px-3 py-2.5 font-semibold text-[#6B7280]">Budget promo (€)</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0E0]">
              {familles.map(f => {
                const stock = stockNecessaire(f);
                const avanc = avancement(f);
                const promo = budgetPromo(f);
                return (
                  <tr key={f.id} className="hover:bg-[#FAFAFA]">
                    <td className="px-3 py-2">
                      <input
                        value={f.famille}
                        onChange={e => updateFamille(f.id, 'famille', e.target.value)}
                        className={`${ic} w-32`}
                        placeholder="Famille"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={f.margeCible || ''}
                        onChange={e => updateFamille(f.id, 'margeCible', parseFloat(e.target.value) || 0)}
                        className={`${ic} w-24 text-right`}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={f.tauxMarge || ''}
                        onChange={e => updateFamille(f.id, 'tauxMarge', parseFloat(e.target.value) || 0)}
                        className={`${ic} w-16 text-right`}
                        placeholder="40"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-[#1A1A1A]">
                      {stock > 0 ? stock.toLocaleString('fr-FR') + ' €' : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={f.margeRealisee || ''}
                        onChange={e => updateFamille(f.id, 'margeRealisee', parseFloat(e.target.value) || 0)}
                        className={`${ic} w-24 text-right`}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-bold ${
                        avanc >= 100 ? 'text-green-600'
                        : avanc >= 50 ? 'text-blue-600'
                        : avanc > 0 ? 'text-orange-500'
                        : 'text-[#9CA3AF]'
                      }`}>
                        {f.margeCible > 0 ? `${avanc}%` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-semibold ${promo > 0 ? 'text-green-600' : 'text-[#9CA3AF]'}`}>
                        {promo > 0 ? `+${promo.toLocaleString('fr-FR')} €` : '—'}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => delFamille(f.id)} className="text-[#9CA3AF] hover:text-red-600 transition-colors">🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-[#E0E0E0]">
          <button onClick={addFamille} className="text-xs text-[#E30613] hover:text-[#B8050F] font-medium transition-colors">
            + Ajouter une famille
          </button>
        </div>
      </div>

      {/* Recap */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4">
        <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-4">Récapitulatif du mois</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-xl font-black text-[#1A1A1A]">{totalCible.toLocaleString('fr-FR')} €</div>
            <div className="text-xs text-[#6B7280] mt-0.5">Total marge cible</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-black text-[#1A1A1A]">{totalRealisee.toLocaleString('fr-FR')} €</div>
            <div className="text-xs text-[#6B7280] mt-0.5">Total marge réalisée</div>
          </div>
          <div className="text-center">
            <div className={`text-xl font-black ${
              totalAvancement >= 100 ? 'text-green-600'
              : totalAvancement >= 50 ? 'text-blue-600'
              : totalAvancement > 0 ? 'text-orange-500'
              : 'text-[#9CA3AF]'
            }`}>
              {totalCible > 0 ? `${totalAvancement}%` : '—'}
            </div>
            <div className="text-xs text-[#6B7280] mt-0.5">Avancement global</div>
          </div>
          <div className="text-center">
            <div className={`text-xl font-black ${totalBudgetPromo > 0 ? 'text-green-600' : 'text-[#9CA3AF]'}`}>
              {totalBudgetPromo > 0 ? `+${totalBudgetPromo.toLocaleString('fr-FR')} €` : '—'}
            </div>
            <div className="text-xs text-[#6B7280] mt-0.5">Budget promo libéré</div>
          </div>
        </div>
        {totalBudgetPromo > 0 && (
          <p className="text-xs text-[#6B7280] mt-3 border-t border-[#E0E0E0] pt-3">
            Budget promo = (Marge réalisée − Marge cible) × {promoRedist}% pour les familles en dépassement d&apos;objectif
          </p>
        )}
      </div>
    </div>
  );
}

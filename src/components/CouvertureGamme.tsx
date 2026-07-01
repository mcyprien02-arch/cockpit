'use client';

import React, { useState, useEffect } from 'react';
import type { PAPAction } from '@/types';
import ZonesModule from './ZonesModule';

interface Props { magasinNom: string; onAddAction?: (action: PAPAction) => void; }

interface Famille {
  id: string;
  famille: string;
  referenceValue: number;  // valeur de référence réseau — verrouillée pour les familles preset
  locked: boolean;
  qteParModele: number;    // 1-5
  tauxMarge: number;
  couverture: number;
  poidsMarge: number;
  delaiVente: number;
}

const DEFAULT_FAMILLES: Array<Omit<Famille, 'id'>> = [
  { famille: 'TLCE', referenceValue: 16000, locked: true,  qteParModele: 2, tauxMarge: 34, couverture: 0, poidsMarge: 0, delaiVente: 30 },
  { famille: 'JCON', referenceValue: 8000,  locked: true,  qteParModele: 1, tauxMarge: 47, couverture: 0, poidsMarge: 0, delaiVente: 30 },
  { famille: 'JCDR', referenceValue: 2500,  locked: true,  qteParModele: 1, tauxMarge: 47, couverture: 0, poidsMarge: 0, delaiVente: 30 },
  { famille: 'ITAB', referenceValue: 3000,  locked: true,  qteParModele: 1, tauxMarge: 41, couverture: 0, poidsMarge: 0, delaiVente: 30 },
  { famille: 'JPOR', referenceValue: 950,   locked: true,  qteParModele: 1, tauxMarge: 47, couverture: 0, poidsMarge: 0, delaiVente: 45 },
];

const BUSINESS_IMPACT: Record<string, { pct: number; type: string; label: string }> = {
  TLCE: { pct: 60, type: 'volume de ventes', label: 'en téléphonie' },
  JCON: { pct: 70, type: 'marge',            label: 'en jeux vidéo consoles' },
  JCDR: { pct: 30, type: 'marge',            label: 'en CD Rom / JV' },
  IPOR: { pct: 55, type: 'marge',            label: 'en informatique portables (100–500€)' },
};

function uid() { return Math.random().toString(36).slice(2); }
function defaultRows(): Famille[] {
  return DEFAULT_FAMILLES.map(f => ({ ...f, id: uid() }));
}

export default function CouvertureGamme({ magasinNom, onAddAction }: Props) {
  const [familles, setFamilles] = useState<Famille[]>(defaultRows);

  useEffect(() => {
    try {
      const s = localStorage.getItem(`couverture_${magasinNom}`);
      if (s) {
        const parsed = JSON.parse(s) as Famille[];
        // Migrate: if old format (has nbModeles or missing referenceValue), start fresh
        if (parsed.length > 0 && ('nbModeles' in parsed[0] || !('referenceValue' in parsed[0]))) {
          setFamilles(defaultRows());
        } else {
          setFamilles(parsed);
        }
      } else {
        setFamilles(defaultRows());
      }
    } catch {
      setFamilles(defaultRows());
    }
  }, [magasinNom]);

  function save(rows: Famille[]) {
    setFamilles(rows);
    localStorage.setItem(`couverture_${magasinNom}`, JSON.stringify(rows));
  }

  function update(id: string, field: keyof Famille, raw: string | number) {
    const value = field === 'famille'
      ? raw
      : (typeof raw === 'number' ? raw : (parseFloat(raw as string) || 0));
    save(familles.map(f => f.id === id ? { ...f, [field]: value } : f));
  }

  function add() {
    save([...familles, {
      id: uid(), famille: '', referenceValue: 0, locked: false,
      qteParModele: 1, tauxMarge: 0, couverture: 0, poidsMarge: 0, delaiVente: 30,
    }]);
  }

  function del(id: string) { save(familles.filter(f => f.id !== id)); }

  // Derived per-row
  const rows = familles.map(f => {
    const stockCible  = Math.round(f.referenceValue * f.qteParModele);
    const stockActuel = Math.round(stockCible * f.couverture / 100);
    const manque      = Math.max(0, stockCible - stockActuel);
    const score       = f.poidsMarge > 0 && f.tauxMarge > 0 && f.delaiVente > 0
      ? (f.poidsMarge * f.tauxMarge) / f.delaiVente : 0;
    return { ...f, stockCible, stockActuel, manque, score };
  });

  // Ranks — descending score
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const rankMap = new Map<string, number>();
  sorted.forEach((r, i) => { if (r.score > 0) rankMap.set(r.id, i + 1); });

  // Totals
  const totalStockCible   = rows.reduce((s, r) => s + r.stockCible, 0);
  const totalStockActuel  = rows.reduce((s, r) => s + r.stockActuel, 0);
  const totalManque       = rows.reduce((s, r) => s + r.manque, 0);
  const totalPoidsMarge   = rows.reduce((s, r) => s + r.poidsMarge, 0);

  // Couverture moyenne pondérée par poids marge ; fallback sur stock cible
  const couvertureGlobale = totalPoidsMarge > 0
    ? Math.round(rows.reduce((s, r) => s + r.couverture * r.poidsMarge, 0) / totalPoidsMarge)
    : totalStockCible > 0
      ? Math.round(totalStockActuel / totalStockCible * 100)
      : 0;

  const hasData = totalStockCible > 0;
  const top5    = sorted.filter(r => r.score > 0 && r.manque > 0).slice(0, 5);

  const banner = !hasData ? null
    : couvertureGlobale >= 95
      ? { cls: 'border-l-green-500 bg-green-50',    text: `Couverture quasi complète. La priorité bascule du renforcement vers le renouvellement (rotation), pas vers l'élargissement.` }
      : couvertureGlobale >= 70
        ? { cls: 'border-l-blue-500 bg-blue-50',    text: `Votre couverture est correcte. Concentrez les achats sur les familles à fort score. Investissement complémentaire : ${totalManque.toLocaleString('fr-FR')} € pour atteindre la couverture cible.` }
        : { cls: 'border-l-orange-400 bg-orange-50', text: `Votre couverture est faible. Priorisez l'investissement sur les familles à fort score (rang 1 à 3). Investissement total : ${totalManque.toLocaleString('fr-FR')} € pour atteindre le stock cible.` };

  // Styles
  const ic  = 'bg-white border border-[#E0E0E0] rounded-md px-1.5 py-1 text-[#1A1A1A] text-xs focus:outline-none focus:border-[#E30613]';
  const thI = 'text-right px-2 py-2.5 font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
  const thA = 'text-right px-2 py-2.5 font-semibold text-[#9CA3AF] bg-[#EBEBEB] whitespace-nowrap';
  const ac  = 'text-right px-2 py-2 text-xs font-medium bg-[#EBEBEB] text-[#1A1A1A]';

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-[#1A1A1A]">Couverture de gamme — {magasinNom || 'Magasin'}</h2>

      {/* Intro */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl px-4 py-3 text-sm text-[#6B7280]">
        Dimensionnez votre besoin de stock par famille à partir de la gamme référence réseau. Choisissez la quantité par modèle et renseignez votre couverture actuelle : le module calcule automatiquement votre stock cible, votre stock actuel et le manque à combler.
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-xs text-[#6B7280] flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-white border border-[#D1D5DB]" />
          <span>Champ à saisir</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[#EBEBEB] border border-[#D1D5DB]" />
          <span>Calculé automatiquement ▾</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>🔒</span>
          <span>Valeur réseau (verrouillée)</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ minWidth: '860px' }}>
            <thead>
              <tr className="border-b border-[#E0E0E0]">
                <th className="text-left px-3 py-2.5 font-semibold text-[#6B7280] bg-[#F5F5F5] sticky left-0 z-20 border-r border-[#E0E0E0] whitespace-nowrap">Famille</th>
                <th className={thI}>Qté/modèle</th>
                <th className={thI}>Référence (€)</th>
                <th className={thA}>Stock cible ▾</th>
                <th className={thI}>Marge (%)</th>
                <th className={thI}>Couverture (%)</th>
                <th className={thA}>Stock actuel ▾</th>
                <th className={thA}>Manque ▾</th>
                <th className={thI}>Poids marge (%)</th>
                <th className={thI}>Délai (j)</th>
                <th className={thA}>Score ▾</th>
                <th className="text-center px-2 py-2.5 font-semibold text-[#9CA3AF] bg-[#EBEBEB] whitespace-nowrap">Rang ▾</th>
                <th className="px-2 py-2.5 bg-[#F5F5F5]"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(f => {
                const rangNum = rankMap.get(f.id);
                const rang = rangNum ?? '—';
                const rangColor = rangNum === 1 ? 'text-[#E30613] font-black'
                  : rangNum === 2 ? 'text-orange-500 font-bold'
                  : rangNum === 3 ? 'text-yellow-600 font-bold'
                  : 'text-[#6B7280]';
                const rowBg = rangNum === 1 ? 'bg-[#FFF5F5]'
                  : (rangNum ?? 0) >= 4 ? 'bg-[#FAFAFA]'
                  : 'bg-white';
                const impact = BUSINESS_IMPACT[(f.famille ?? '').toUpperCase()];
                const missed = impact && f.couverture > 0 && f.couverture < 100
                  ? Math.round((100 - f.couverture) / 100 * impact.pct)
                  : 0;
                return (
                  <React.Fragment key={f.id}>
                    <tr className={`border-t border-[#E0E0E0] hover:brightness-[0.98] transition-all ${rowBg}`}>
                      {/* Sticky famille cell */}
                      <td className={`px-2 py-2 sticky left-0 z-10 border-r border-[#E0E0E0] ${rowBg}`}>
                        <input
                          value={f.famille}
                          onChange={e => update(f.id, 'famille', e.target.value)}
                          className={`${ic} w-14`}
                          placeholder="Famille"
                        />
                      </td>

                      {/* Qté/modèle — sélecteur 1-5 */}
                      <td className="px-2 py-2 text-right">
                        <div className="flex gap-0.5 justify-end">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              onClick={() => update(f.id, 'qteParModele', n)}
                              className={`w-6 h-6 rounded text-xs font-semibold transition-colors ${
                                f.qteParModele === n
                                  ? 'bg-[#E30613] text-white'
                                  : 'bg-[#F5F5F5] text-[#6B7280] hover:bg-[#E0E0E0]'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </td>

                      {/* Référence — verrouillée pour preset, libre pour custom */}
                      <td className="px-2 py-2 text-right">
                        {f.locked ? (
                          <span className="flex items-center justify-end gap-1 text-[#6B7280] font-medium">
                            <span className="text-[10px]">🔒</span>
                            {f.referenceValue.toLocaleString('fr-FR')} €
                          </span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            value={f.referenceValue || ''}
                            onChange={e => update(f.id, 'referenceValue', e.target.value)}
                            className={`${ic} w-20 text-right`}
                            placeholder="0"
                          />
                        )}
                      </td>

                      {/* Auto: Stock cible */}
                      <td className={ac}>
                        {f.stockCible > 0 ? `${f.stockCible.toLocaleString('fr-FR')} €` : '—'}
                      </td>

                      {/* Input: Marge */}
                      <td className="px-2 py-2 text-right">
                        <input type="number" min="0" max="100" value={f.tauxMarge || ''} onChange={e => update(f.id, 'tauxMarge', e.target.value)} className={`${ic} w-12 text-right`} placeholder="0" />
                      </td>

                      {/* Input: Couverture */}
                      <td className="px-2 py-2 text-right">
                        <input type="number" min="0" max="100" value={f.couverture || ''} onChange={e => update(f.id, 'couverture', e.target.value)} className={`${ic} w-12 text-right`} placeholder="0" />
                      </td>

                      {/* Auto: Stock actuel */}
                      <td className={ac}>
                        {f.stockActuel > 0 ? `${f.stockActuel.toLocaleString('fr-FR')} €` : '—'}
                      </td>

                      {/* Auto: Manque */}
                      <td className="text-right px-2 py-2 text-xs font-medium bg-[#EBEBEB]">
                        {f.stockCible > 0 ? (
                          f.manque > 0
                            ? <span className="text-orange-600 font-semibold">{f.manque.toLocaleString('fr-FR')} €</span>
                            : <span className="text-green-600">✓</span>
                        ) : '—'}
                      </td>

                      {/* Input: Poids marge */}
                      <td className="px-2 py-2 text-right">
                        <input type="number" min="0" max="100" value={f.poidsMarge || ''} onChange={e => update(f.id, 'poidsMarge', e.target.value)} className={`${ic} w-12 text-right`} placeholder="0" />
                      </td>

                      {/* Input: Délai */}
                      <td className="px-2 py-2 text-right">
                        <input type="number" min="0" value={f.delaiVente || ''} onChange={e => update(f.id, 'delaiVente', e.target.value)} className={`${ic} w-12 text-right`} placeholder="0" />
                      </td>

                      {/* Auto: Score */}
                      <td className="text-right px-2 py-2 text-xs text-[#6B7280] bg-[#EBEBEB]">
                        {f.score > 0 ? f.score.toFixed(1) : '—'}
                      </td>

                      {/* Auto: Rang */}
                      <td className="text-center px-2 py-2 bg-[#EBEBEB]">
                        <span className={rangColor}>{f.score > 0 ? `#${rang}` : '—'}</span>
                      </td>

                      {/* Delete */}
                      <td className="px-2 py-2">
                        <button onClick={() => del(f.id)} className="text-[#9CA3AF] hover:text-red-600 transition-colors">🗑</button>
                      </td>
                    </tr>

                    {/* Business impact hint row */}
                    {impact && (
                      <tr className="border-t border-[#F0F0F0] bg-[#FAFAFA]">
                        <td colSpan={13} className="px-5 py-1.5">
                          <span className={`text-[11px] italic ${f.couverture > 0 && f.couverture < 100 ? 'text-orange-500' : 'text-[#9CA3AF]'}`}>
                            {f.couverture > 0 && f.couverture < 100
                              ? `Vous êtes à ${f.couverture}% de couverture en ${f.famille}. Vous loupez environ ${missed}% de votre potentiel de ${impact.type} ${impact.label}.`
                              : `100% de couverture en ${f.famille} représente ${impact.pct}% du ${impact.type} ${impact.label}.`
                            }
                            {f.couverture > 0 && f.couverture < 100 && f.manque > 0 && (
                              <> Manque à combler : <strong>{f.manque.toLocaleString('fr-FR')} €</strong>.</>
                            )}
                          </span>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>

            {hasData && (
              <tfoot>
                <tr className="bg-[#F5F5F5] border-t-2 border-[#E0E0E0] font-semibold text-xs">
                  <td className="px-3 py-2.5 text-[#1A1A1A] sticky left-0 bg-[#F5F5F5] z-10 border-r border-[#E0E0E0]">Total</td>
                  <td></td>
                  <td></td>
                  <td className="text-right px-2 py-2.5 text-[#1A1A1A] bg-[#EBEBEB]">{totalStockCible.toLocaleString('fr-FR')} €</td>
                  <td></td>
                  <td className="text-right px-2 py-2.5">
                    <span className={couvertureGlobale >= 95 ? 'text-green-600 font-black' : couvertureGlobale >= 70 ? 'text-blue-600 font-black' : 'text-orange-500 font-black'}>
                      {couvertureGlobale}%
                    </span>
                  </td>
                  <td className="text-right px-2 py-2.5 bg-[#EBEBEB]">{totalStockActuel.toLocaleString('fr-FR')} €</td>
                  <td className="text-right px-2 py-2.5 bg-[#EBEBEB]">
                    <span className={totalManque > 0 ? 'text-orange-500' : 'text-green-600'}>
                      {totalManque > 0 ? `${totalManque.toLocaleString('fr-FR')} €` : '✓'}
                    </span>
                  </td>
                  <td className="text-right px-2 py-2.5 text-[#6B7280]">{totalPoidsMarge > 0 ? `${totalPoidsMarge.toFixed(1)}%` : '—'}</td>
                  <td colSpan={4}></td>
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

      {/* Recap cards */}
      {hasData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Stock cible total',  value: `${totalStockCible.toLocaleString('fr-FR')} €`,  cls: 'text-[#1A1A1A]' },
            { label: 'Stock actuel total', value: `${totalStockActuel.toLocaleString('fr-FR')} €`, cls: 'text-[#1A1A1A]' },
            { label: 'Manque à combler',   value: `${totalManque.toLocaleString('fr-FR')} €`,      cls: totalManque > 0 ? 'text-orange-600' : 'text-green-600' },
            { label: 'Couverture moy.',    value: `${couvertureGlobale}%`,                         cls: couvertureGlobale >= 95 ? 'text-green-600' : couvertureGlobale >= 70 ? 'text-blue-600' : 'text-orange-500' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
              <div className={`text-xl font-black ${c.cls}`}>{c.value}</div>
              <div className="text-xs text-[#6B7280] mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Priority order */}
      {top5.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4 space-y-2.5">
          <h3 className="text-sm font-bold text-[#1A1A1A] mb-3">🎯 Ordre de priorité d&apos;investissement</h3>
          {top5.map((f, i) => {
            const rang = i + 1;
            const numColor = rang === 1 ? 'text-[#E30613]' : rang === 2 ? 'text-orange-500' : rang === 3 ? 'text-yellow-600' : 'text-[#6B7280]';
            return (
              <div key={f.id} className="flex items-start justify-between gap-2 text-sm">
                <div className="flex items-start gap-2 flex-1">
                  <span className={`font-black text-base w-6 flex-shrink-0 ${numColor}`}>#{rang}</span>
                  <span className="text-[#1A1A1A] leading-snug">
                    <strong>{f.famille || '—'}</strong> : investir{' '}
                    <strong className="text-orange-600">{f.manque.toLocaleString('fr-FR')} €</strong>
                    {f.poidsMarge > 0 && (
                      <> (poids marge {f.poidsMarge}%, marge {f.tauxMarge}%, rotation {f.delaiVente}j)</>
                    )}
                  </span>
                </div>
                {onAddAction && (
                  <button onClick={() => {
                    const e = new Date(); e.setDate(e.getDate() + 14);
                    onAddAction({ id: String(Date.now()), titre: `Gamme — Investir en ${f.famille || '—'} (manque ${f.manque.toLocaleString('fr-FR')} €)`, axe: 'Stock', pilote: 'Franchisé', copilote: '', description: `Couverture de gamme insuffisante sur ${f.famille}. Investissement prioritaire #${rang} : ${f.manque.toLocaleString('fr-FR')} € (marge ${f.tauxMarge}%, rotation ${f.delaiVente}j).`, echeance: e.toISOString().slice(0, 10), priorite: rang <= 2 ? 1 : 2, gain: 0, statut: 'À faire' });
                  }} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0 transition-colors">+ PAP</button>
                )}
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
        Stock cible = Valeur de référence réseau × Qté par modèle. Stock actuel = Stock cible × Couverture. Score priorité = (Poids marge × Taux marge) / Délai vente. Estimations indicatives basées sur les valeurs saisies — ne constituent pas un engagement financier.
      </p>

      <ZonesModule moduleKey="gamme" />
    </div>
  );
}

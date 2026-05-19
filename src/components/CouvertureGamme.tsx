'use client';

import React, { useState, useEffect } from 'react';

interface Props { magasinNom: string; }

interface Famille {
  id: string;
  famille: string;
  nbModeles: number;
  qteParModele: number;
  pvMoyen: number;
  tauxMarge: number;
  couverture: number;
  poidsCA: number;
  delaiVente: number;
}

const DEFAULT_FAMILLES: Array<Omit<Famille, 'id'>> = [
  { famille: 'TLCE', nbModeles: 20, qteParModele: 2, pvMoyen: 250, tauxMarge: 34, couverture: 0, poidsCA: 0, delaiVente: 30 },
  { famille: 'JCON', nbModeles: 15, qteParModele: 2, pvMoyen: 200, tauxMarge: 47, couverture: 0, poidsCA: 0, delaiVente: 30 },
  { famille: 'JCDR', nbModeles: 30, qteParModele: 1, pvMoyen: 25,  tauxMarge: 47, couverture: 0, poidsCA: 0, delaiVente: 30 },
  { famille: 'ITAB', nbModeles: 12, qteParModele: 1, pvMoyen: 180, tauxMarge: 41, couverture: 0, poidsCA: 0, delaiVente: 30 },
  { famille: 'JPOR', nbModeles: 10, qteParModele: 1, pvMoyen: 250, tauxMarge: 47, couverture: 0, poidsCA: 0, delaiVente: 45 },
  { famille: 'IPOR', nbModeles: 12, qteParModele: 2, pvMoyen: 350, tauxMarge: 40, couverture: 0, poidsCA: 0, delaiVente: 30 },
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

export default function CouvertureGamme({ magasinNom }: Props) {
  const [familles, setFamilles] = useState<Famille[]>(defaultRows);

  useEffect(() => {
    try {
      const s = localStorage.getItem(`couverture_${magasinNom}`);
      if (s) {
        const parsed = JSON.parse(s) as Famille[];
        // Migrate: if old format (has stockCible, no nbModeles), start fresh
        if (parsed.length > 0 && !('nbModeles' in parsed[0])) {
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

  function update(id: string, field: keyof Famille, raw: string) {
    const value = field === 'famille' ? raw : (parseFloat(raw) || 0);
    save(familles.map(f => f.id === id ? { ...f, [field]: value } : f));
  }

  function add() {
    save([...familles, { id: uid(), famille: '', nbModeles: 0, qteParModele: 1, pvMoyen: 0, tauxMarge: 0, couverture: 0, poidsCA: 0, delaiVente: 30 }]);
  }

  function del(id: string) { save(familles.filter(f => f.id !== id)); }

  // Derived per-row
  const rows = familles.map(f => {
    const potentielCA  = Math.round(f.nbModeles * f.qteParModele * f.pvMoyen);
    const valeurAchat  = Math.round(potentielCA * (1 - f.tauxMarge / 100));
    const stockActuel  = Math.round(valeurAchat * f.couverture / 100);
    const manque       = Math.max(0, valeurAchat - stockActuel);
    const score        = f.poidsCA > 0 && f.tauxMarge > 0 && f.delaiVente > 0
      ? (f.poidsCA * f.tauxMarge) / f.delaiVente : 0;
    return { ...f, potentielCA, valeurAchat, stockActuel, manque, score };
  });

  // Ranks — descending score (only rows with a score)
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const rankMap = new Map<string, number>();
  sorted.forEach((r, i) => { if (r.score > 0) rankMap.set(r.id, i + 1); });

  // Totals
  const totalPotentielCA      = rows.reduce((s, r) => s + r.potentielCA, 0);
  const totalValeurAchat      = rows.reduce((s, r) => s + r.valeurAchat, 0);
  const totalStockActuel      = rows.reduce((s, r) => s + r.stockActuel, 0);
  const totalManque           = rows.reduce((s, r) => s + r.manque, 0);
  const totalPoidsCA          = rows.reduce((s, r) => s + r.poidsCA, 0);
  const totalCAPotManquant    = rows.reduce((s, r) => s + Math.round(r.potentielCA * (1 - r.couverture / 100)), 0);

  // Couverture moyenne pondérée par poids CA ; fallback sur pondération par valeur d'achat
  const couvertureGlobale = totalPoidsCA > 0
    ? Math.round(rows.reduce((s, r) => s + r.couverture * r.poidsCA, 0) / totalPoidsCA)
    : totalValeurAchat > 0
      ? Math.round(totalStockActuel / totalValeurAchat * 100)
      : 0;

  const hasData = totalValeurAchat > 0;
  const top5    = sorted.filter(r => r.score > 0 && r.manque > 0).slice(0, 5);

  const banner = !hasData ? null
    : couvertureGlobale >= 95
      ? { cls: 'border-l-green-500 bg-green-50',   text: `Couverture quasi complète. La priorité bascule du renforcement vers le renouvellement (rotation), pas vers l'élargissement.` }
      : couvertureGlobale >= 70
        ? { cls: 'border-l-blue-500 bg-blue-50',   text: `Votre couverture est correcte. Concentrez les achats sur les familles à fort score. Investissement complémentaire : ${totalManque.toLocaleString('fr-FR')} € pour débloquer un potentiel CA de ${totalCAPotManquant.toLocaleString('fr-FR')} €.` }
        : { cls: 'border-l-orange-400 bg-orange-50', text: `Votre couverture est faible. Priorisez l'investissement sur les familles à fort score (rang 1 à 3). Investissement total : ${totalManque.toLocaleString('fr-FR')} € pour générer un potentiel CA de ${totalCAPotManquant.toLocaleString('fr-FR')} €.` };

  // Styles
  const ic  = 'bg-white border border-[#E0E0E0] rounded-md px-1.5 py-1 text-[#1A1A1A] text-xs focus:outline-none focus:border-[#E30613]';
  const thI = 'text-right px-2 py-2.5 font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap'; // input column header
  const thA = 'text-right px-2 py-2.5 font-semibold text-[#9CA3AF] bg-[#EBEBEB] whitespace-nowrap'; // auto column header
  const ac  = 'text-right px-2 py-2 text-xs font-medium bg-[#F5F5F5] text-[#1A1A1A]';              // auto column cell

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-[#1A1A1A]">Couverture de gamme — {magasinNom || 'Magasin'}</h2>

      {/* Intro */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl px-4 py-3 text-sm text-[#6B7280]">
        Dimensionnez votre besoin de stock par famille à partir de la gamme référence réseau. Saisissez le nombre de modèles, la quantité par modèle et votre couverture actuelle : le module calcule automatiquement votre potentiel CA, votre valeur d&apos;achat cible et votre manque à combler.
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ minWidth: '1120px' }}>
            <thead>
              <tr className="border-b border-[#E0E0E0]">
                <th className="text-left px-3 py-2.5 font-semibold text-[#6B7280] bg-[#F5F5F5] sticky left-0 z-20 border-r border-[#E0E0E0] whitespace-nowrap">Famille</th>
                <th className={thI}>Nb modèles</th>
                <th className={thI}>Qté/modèle</th>
                <th className={thI}>PV moy (€)</th>
                <th className={thA}>Potentiel CA 100% ▾</th>
                <th className={thI}>Marge (%)</th>
                <th className={thA}>Val. achat 100% ▾</th>
                <th className={thI}>Couverture (%)</th>
                <th className={thA}>Stock actuel ▾</th>
                <th className={thA}>Manque ▾</th>
                <th className={thI}>Poids CA (%)</th>
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
                const caPotManquant = Math.round(f.potentielCA * (1 - f.couverture / 100));
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
                      {/* Input fields */}
                      <td className="px-2 py-2 text-right">
                        <input type="number" min="0" value={f.nbModeles || ''} onChange={e => update(f.id, 'nbModeles', e.target.value)} className={`${ic} w-14 text-right`} placeholder="0" />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input type="number" min="1" max="10" value={f.qteParModele || ''} onChange={e => update(f.id, 'qteParModele', e.target.value)} className={`${ic} w-10 text-right`} placeholder="1" />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input type="number" min="0" value={f.pvMoyen || ''} onChange={e => update(f.id, 'pvMoyen', e.target.value)} className={`${ic} w-16 text-right`} placeholder="0" />
                      </td>
                      {/* Auto: Potentiel CA */}
                      <td className={ac}>
                        {f.potentielCA > 0 ? `${f.potentielCA.toLocaleString('fr-FR')} €` : '—'}
                      </td>
                      {/* Input: Marge */}
                      <td className="px-2 py-2 text-right">
                        <input type="number" min="0" max="100" value={f.tauxMarge || ''} onChange={e => update(f.id, 'tauxMarge', e.target.value)} className={`${ic} w-12 text-right`} placeholder="0" />
                      </td>
                      {/* Auto: Valeur achat */}
                      <td className={ac}>
                        {f.valeurAchat > 0 ? `${f.valeurAchat.toLocaleString('fr-FR')} €` : '—'}
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
                      <td className="text-right px-2 py-2 text-xs font-medium bg-[#F5F5F5]">
                        {f.valeurAchat > 0 ? (
                          f.manque > 0
                            ? <span className="text-orange-600 font-semibold">{f.manque.toLocaleString('fr-FR')} €</span>
                            : <span className="text-green-600">✓</span>
                        ) : '—'}
                      </td>
                      {/* Input: Poids CA */}
                      <td className="px-2 py-2 text-right">
                        <input type="number" min="0" max="100" value={f.poidsCA || ''} onChange={e => update(f.id, 'poidsCA', e.target.value)} className={`${ic} w-12 text-right`} placeholder="0" />
                      </td>
                      {/* Input: Délai */}
                      <td className="px-2 py-2 text-right">
                        <input type="number" min="0" value={f.delaiVente || ''} onChange={e => update(f.id, 'delaiVente', e.target.value)} className={`${ic} w-12 text-right`} placeholder="0" />
                      </td>
                      {/* Auto: Score */}
                      <td className="text-right px-2 py-2 text-xs text-[#6B7280] bg-[#F5F5F5]">
                        {f.score > 0 ? f.score.toFixed(1) : '—'}
                      </td>
                      {/* Auto: Rang */}
                      <td className="text-center px-2 py-2 bg-[#F5F5F5]">
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
                        <td colSpan={15} className="px-5 py-1.5">
                          <span className={`text-[11px] italic ${f.couverture > 0 && f.couverture < 100 ? 'text-orange-500' : 'text-[#9CA3AF]'}`}>
                            {f.couverture > 0 && f.couverture < 100
                              ? `Vous êtes à ${f.couverture}% de couverture en ${f.famille}. Vous loupez environ ${missed}% de votre potentiel de ${impact.type} ${impact.label}.`
                              : `100% de couverture en ${f.famille} représente ${impact.pct}% du ${impact.type} ${impact.label}.`
                            }
                            {f.couverture > 0 && f.couverture < 100 && caPotManquant > 0 && (
                              <> Potentiel CA non couvert : <strong>{caPotManquant.toLocaleString('fr-FR')} €</strong>.</>
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
                  <td className="px-3 py-2.5 text-[#1A1A1A] sticky left-0 bg-[#F5F5F5] z-10 border-r border-[#E0E0E0]" colSpan={4}>Total</td>
                  <td className="text-right px-2 py-2.5 text-[#1A1A1A] bg-[#EBEBEB]">{totalPotentielCA.toLocaleString('fr-FR')} €</td>
                  <td></td>
                  <td className="text-right px-2 py-2.5 text-[#1A1A1A] bg-[#EBEBEB]">{totalValeurAchat.toLocaleString('fr-FR')} €</td>
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
                  <td className="text-right px-2 py-2.5 text-[#6B7280]">{totalPoidsCA > 0 ? `${totalPoidsCA.toFixed(1)}%` : '—'}</td>
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
            { label: 'Potentiel CA 100%',  value: `${totalPotentielCA.toLocaleString('fr-FR')} €`,  cls: 'text-[#1A1A1A]' },
            { label: 'Val. achat 100%',    value: `${totalValeurAchat.toLocaleString('fr-FR')} €`,  cls: 'text-[#1A1A1A]' },
            { label: 'Manque à combler',   value: `${totalManque.toLocaleString('fr-FR')} €`,       cls: totalManque > 0 ? 'text-orange-600' : 'text-green-600' },
            { label: 'Couverture moy.',    value: `${couvertureGlobale}%`,                          cls: couvertureGlobale >= 95 ? 'text-green-600' : couvertureGlobale >= 70 ? 'text-blue-600' : 'text-orange-500' },
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
            const caPotManquant = Math.round(f.potentielCA * (1 - f.couverture / 100));
            return (
              <div key={f.id} className="flex items-start gap-2 text-sm">
                <span className={`font-black text-base w-6 flex-shrink-0 ${numColor}`}>#{rang}</span>
                <span className="text-[#1A1A1A] leading-snug">
                  <strong>{f.famille || '—'}</strong> : investir{' '}
                  <strong className="text-orange-600">{f.manque.toLocaleString('fr-FR')} €</strong>
                  {caPotManquant > 0 && (
                    <> (potentiel CA généré : <strong>{caPotManquant.toLocaleString('fr-FR')} €</strong>
                    {f.poidsCA > 0 && `, poids CA ${f.poidsCA}%`}
                    , marge {f.tauxMarge}%, rotation {f.delaiVente}j)</>
                  )}
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
        Potentiel CA = Nb modèles × Qté/modèle × PV moyen. Valeur d&apos;achat = Potentiel CA × (1 − Taux marge). Score priorité = (Poids CA × Taux marge) / Délai vente. Estimations indicatives basées sur les valeurs saisies — ne constituent pas un engagement financier.
      </p>
    </div>
  );
}

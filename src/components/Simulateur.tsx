'use client';

import { useState } from 'react';

interface Props { magasinNom: string; isCriticalSpiral?: boolean; }

const GMROI_RESEAU: Array<{ code: string; label: string; gmroi: number; coutMin: number }> = [
  { code: 'JCON', label: 'Jeux Console',            gmroi: 2.12, coutMin: 8000  },
  { code: 'JCDR', label: 'Jeux CD / DVD',           gmroi: 2.07, coutMin: 2500  },
  { code: 'IPOR', label: 'Informatique portable',   gmroi: 1.19, coutMin: 4000  },
  { code: 'TLCE', label: 'Téléphonie',              gmroi: 1.03, coutMin: 16000 },
  { code: 'BMAR', label: 'Bijouterie / Montres',    gmroi: 0.93, coutMin: 0     },
  { code: 'BOR',  label: 'Objets reconditionnés',   gmroi: 0.42, coutMin: 0     },
];
const BUDGET_GAMME_MINIMALE = 31000;
const BUDGET_IDEAL = 92000;

interface EquipeRow {
  id: string;
  prenom: string;
  contrat: string;
  heures: number;
  salaireHoraire: number;
}

interface EquipeStore {
  rows: EquipeRow[];
  caAnnuel: number;
  tauxMarge: number;
}

function uid() { return Math.random().toString(36).slice(2); }

const CONTRATS = ['CDI 35H', 'CDI 39H', 'CDD', 'Apprenti', 'Stage'];

function caColor(v: number) {
  if (v >= 200000 && v <= 300000) return 'text-green-600';
  if ((v >= 150000 && v < 200000) || (v > 300000 && v <= 400000)) return 'text-orange-500';
  return 'text-red-600';
}

function margeColor(v: number) {
  if (v > 90000) return 'text-green-600';
  if (v >= 60000) return 'text-orange-500';
  return 'text-red-600';
}

export default function Simulateur({ magasinNom, isCriticalSpiral }: Props) {
  const equipeKey = `equipe_${magasinNom}`;

  const [equipeStore, setEquipeStore] = useState<EquipeStore>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(equipeKey) : null;
      if (s) {
        const p = JSON.parse(s) as unknown;
        if (Array.isArray(p)) return { rows: p as EquipeRow[], caAnnuel: 0, tauxMarge: 38 };
        const parsed = p as EquipeStore;
        return { ...parsed, tauxMarge: parsed.tauxMarge ?? 38 };
      }
      return { rows: [], caAnnuel: 0, tauxMarge: 38 };
    } catch { return { rows: [], caAnnuel: 0, tauxMarge: 38 }; }
  });

  const [showExplain, setShowExplain] = useState(false);
  const [budget, setBudget] = useState<number>(0);

  function saveEquipeStore(store: EquipeStore) {
    setEquipeStore(store);
    localStorage.setItem(equipeKey, JSON.stringify(store));
  }

  function addEquipe() {
    saveEquipeStore({ ...equipeStore, rows: [...equipeStore.rows, { id: uid(), prenom: '', contrat: 'CDI 35H', heures: 151.67, salaireHoraire: 12 }] });
  }

  function updateEquipe(id: string, field: keyof EquipeRow, value: string | number) {
    saveEquipeStore({ ...equipeStore, rows: equipeStore.rows.map(e => e.id === id ? { ...e, [field]: value } : e) });
  }

  function delEquipe(id: string) {
    saveEquipeStore({ ...equipeStore, rows: equipeStore.rows.filter(e => e.id !== id) });
  }

  const { rows: equipe, caAnnuel, tauxMarge } = equipeStore;
  const totalMasseSal = equipe.reduce((s, e) => s + (e.heures * e.salaireHoraire * 12 * 1.42), 0);
  const totalHeures = equipe.reduce((s, e) => s + e.heures, 0);
  const totalEtp = totalHeures / 151.67;
  const masseSalPct = caAnnuel > 0 ? (totalMasseSal / caAnnuel) * 100 : 0;
  const ratioCAEtp = totalEtp > 0 && caAnnuel > 0 ? caAnnuel / totalEtp : 0;
  const caParEtp = totalEtp > 0 && caAnnuel > 0 ? caAnnuel / totalEtp : 0;
  const margeParEtp = totalEtp > 0 && caAnnuel > 0 ? (caAnnuel * tauxMarge / 100) / totalEtp : 0;

  const inputCls = 'bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]';

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-[#1A1A1A]">Simulateur — {magasinNom || 'Magasin'}</h2>

      <div className="space-y-4">
        {/* CA + taux marge */}
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4 flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-[#6B7280] block mb-1">CA annuel du magasin (€)</label>
            <input
              type="number"
              value={caAnnuel || ''}
              onChange={e => saveEquipeStore({ ...equipeStore, caAnnuel: parseFloat(e.target.value) || 0 })}
              placeholder="Ex : 2000000"
              className={`${inputCls} w-52`}
            />
          </div>
          <div>
            <label className="text-xs text-[#6B7280] block mb-1">Taux de marge (%)</label>
            <input
              type="number"
              value={tauxMarge || ''}
              onChange={e => saveEquipeStore({ ...equipeStore, tauxMarge: parseFloat(e.target.value) || 38 })}
              placeholder="38"
              className={`${inputCls} w-28`}
            />
          </div>
        </div>

        {/* KPIs équipe — row 1 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
            <div className={`text-2xl font-black ${masseSalPct <= 15 ? 'text-green-600' : masseSalPct <= 18 ? 'text-orange-500' : 'text-red-600'}`}>
              {caAnnuel > 0 ? `${masseSalPct.toFixed(1)}%` : '—'}
            </div>
            <div className="text-xs text-[#6B7280]">Masse salariale</div>
            <div className="text-xs text-[#9CA3AF]">cible ≤15%</div>
          </div>
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
            <div className="text-2xl font-black text-[#1A1A1A]">{(totalMasseSal / 1000).toFixed(0)}k€</div>
            <div className="text-xs text-[#6B7280]">Coût annuel total</div>
          </div>
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
            <div className="text-2xl font-black text-[#1A1A1A]">{totalEtp.toFixed(1)}</div>
            <div className="text-xs text-[#6B7280]">ETP total</div>
          </div>
        </div>

        {/* KPIs équipe — row 2 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
            <div className={`text-2xl font-black ${caParEtp > 0 ? caColor(caParEtp) : 'text-[#6B7280]'}`}>
              {caParEtp > 0 ? `${(caParEtp / 1000).toFixed(0)}k€` : '—'}
            </div>
            <div className="text-xs text-[#6B7280]">CA par ETP</div>
            <div className="text-xs text-[#9CA3AF]">benchmark 250k€ · vert 200-300k</div>
          </div>
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
            <div className={`text-2xl font-black ${margeParEtp > 0 ? margeColor(margeParEtp) : 'text-[#6B7280]'}`}>
              {margeParEtp > 0 ? `${(margeParEtp / 1000).toFixed(0)}k€` : '—'}
            </div>
            <div className="text-xs text-[#6B7280]">Marge par ETP</div>
            <div className="text-xs text-[#9CA3AF]">vert &gt;90k · orange 60-90k · rouge &lt;60k</div>
          </div>
        </div>

        {/* Alerte dimensionnement */}
        {caAnnuel > 0 && totalEtp > 0 && (
          <div className={`rounded-xl px-4 py-3 text-sm border ${
            ratioCAEtp > 400000 ? 'bg-orange-50 border-orange-200' :
            ratioCAEtp < 180000 ? 'bg-orange-50 border-orange-200' :
            'bg-green-50 border-green-300'
          }`}>
            {ratioCAEtp > 400000 ? (
              <p className="text-orange-700">
                <span className="font-semibold">⚠ Équipe probablement sous-dimensionnée</span><br />
                Vous avez {totalEtp.toFixed(1)} ETP pour {caAnnuel.toLocaleString('fr-FR')} € de CA, soit 1 ETP pour {Math.round(ratioCAEtp).toLocaleString('fr-FR')} €.<br />
                Benchmark réseau : 1 ETP pour 250 000 €.<br />
                Pour votre CA, il faudrait environ <strong>{Math.round(caAnnuel / 250000)}</strong> ETP.
              </p>
            ) : ratioCAEtp < 180000 ? (
              <p className="text-orange-700">
                <span className="font-semibold">⚠ Équipe probablement sur-dimensionnée</span><br />
                Vous avez {totalEtp.toFixed(1)} ETP pour {caAnnuel.toLocaleString('fr-FR')} € de CA, soit 1 ETP pour {Math.round(ratioCAEtp).toLocaleString('fr-FR')} €.<br />
                Benchmark réseau : 1 ETP pour 250 000 €.<br />
                Pour votre CA, <strong>{Math.round(caAnnuel / 250000)}</strong> ETP suffiraient théoriquement.
              </p>
            ) : (
              <p className="text-green-700">✓ Dimensionnement équipe cohérent avec le CA</p>
            )}
            <p className="text-xs text-[#6B7280] mt-2">Note : ces seuils sont indicatifs. Un magasin centre-ville avec forte saisonnalité peut justifier plus d&apos;ETP qu&apos;un magasin périphérique.</p>
          </div>
        )}

        {/* Table équipe */}
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E0E0E0] bg-[#F5F5F5] text-[#6B7280]">
                  <th className="text-left px-3 py-2 font-semibold">Prénom</th>
                  <th className="text-left px-3 py-2 font-semibold">Contrat</th>
                  <th className="text-right px-3 py-2 font-semibold">H/mois</th>
                  <th className="text-right px-3 py-2 font-semibold">€/h brut</th>
                  <th className="text-right px-3 py-2 font-semibold">Coût annuel</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E0E0]">
                {equipe.map(e => {
                  const cout = e.heures * e.salaireHoraire * 12 * 1.42;
                  return (
                    <tr key={e.id}>
                      <td className="px-3 py-2">
                        <input
                          value={e.prenom}
                          onChange={ev => updateEquipe(e.id, 'prenom', ev.target.value)}
                          className="bg-transparent text-[#1A1A1A] w-24 border-b border-[#E0E0E0] focus:outline-none focus:border-[#E30613]"
                          placeholder="Prénom"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={e.contrat}
                          onChange={ev => updateEquipe(e.id, 'contrat', ev.target.value)}
                          className="bg-white text-[#1A1A1A] text-xs rounded border border-[#E0E0E0] px-1 py-0.5"
                        >
                          {CONTRATS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={e.heures || ''}
                          onChange={ev => updateEquipe(e.id, 'heures', parseFloat(ev.target.value) || 0)}
                          className="bg-transparent text-[#1A1A1A] w-16 text-right border-b border-[#E0E0E0] focus:outline-none focus:border-[#E30613]"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={e.salaireHoraire || ''}
                          onChange={ev => updateEquipe(e.id, 'salaireHoraire', parseFloat(ev.target.value) || 0)}
                          className="bg-transparent text-[#1A1A1A] w-12 text-right border-b border-[#E0E0E0] focus:outline-none focus:border-[#E30613]"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-[#1A1A1A] font-medium">{cout.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</td>
                      <td className="px-2 py-2">
                        <button onClick={() => delEquipe(e.id)} className="text-[#6B7280] hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-[#E0E0E0]">
            <button onClick={addEquipe} className="text-xs text-[#E30613] hover:text-[#B8050F] font-medium">+ Ajouter un collaborateur</button>
          </div>
        </div>
        <p className="text-xs text-[#6B7280]">Coût chargé = salaire brut × heures × 12 × 1.42 (charges patronales estimées France)</p>
      </div>

      {/* GMROI réseau */}
      {isCriticalSpiral ? (
        <div className="bg-[#E30613] rounded-xl px-4 py-4 text-white">
          <p className="font-bold text-sm">⚠ Simulateur d&apos;investissement masqué</p>
          <p className="text-xs text-white/80 mt-1">Spirale détectée : déstockez avant tout nouvel achat. Résolvez la situation avant d&apos;investir.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-1">Arbitrage budget — GMROI réseau 2026</h3>
            <p className="text-xs text-[#6B7280]">Ordre d&apos;investissement optimal par rendement décroissant</p>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-[#6B7280] block mb-1">Budget disponible (€)</label>
              <input
                type="number"
                value={budget || ''}
                onChange={e => setBudget(parseFloat(e.target.value) || 0)}
                placeholder="Ex : 50000"
                className={`${inputCls} w-44`}
              />
            </div>
            {budget > 0 && budget < BUDGET_GAMME_MINIMALE && (
              <div className="text-xs text-[#E30613] font-semibold">
                ⚠ Budget insuffisant — gamme incomplète. Prioriser JCON + JCDR ({(BUDGET_GAMME_MINIMALE).toLocaleString('fr-FR')} € min).
              </div>
            )}
            {budget >= BUDGET_IDEAL && (
              <div className="text-xs text-green-600 font-semibold">✓ Budget idéal atteint ({BUDGET_IDEAL.toLocaleString('fr-FR')} €)</div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E0E0E0] bg-[#F5F5F5] text-[#6B7280]">
                  <th className="text-left px-3 py-2 font-semibold">Famille</th>
                  <th className="text-right px-3 py-2 font-semibold">GMROI réseau</th>
                  <th className="text-right px-3 py-2 font-semibold">Investissement min</th>
                  {budget > 0 && <th className="text-right px-3 py-2 font-semibold">Gain estimé 30j</th>}
                  <th className="text-center px-3 py-2 font-semibold">Priorité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E0E0]">
                {GMROI_RESEAU.map((f, idx) => {
                  const montantAlloue = budget > 0 ? Math.min(budget, f.coutMin > 0 ? f.coutMin : budget / 3) : 0;
                  const gainEstime = montantAlloue > 0 ? Math.round(montantAlloue * f.gmroi * 0.25) : 0;
                  const isRecommended = budget > 0 && budget >= (f.coutMin || 0) && idx < 3;
                  return (
                    <tr key={f.code} className={isRecommended ? 'bg-green-50' : ''}>
                      <td className="px-3 py-2">
                        <span className="text-xs text-[#9CA3AF] font-mono mr-1.5">{f.code}</span>
                        <span className="text-[#1A1A1A]">{f.label}</span>
                      </td>
                      <td className={`px-3 py-2 text-right font-bold ${
                        f.gmroi >= 2 ? 'text-green-600' : f.gmroi >= 1 ? 'text-orange-500' : 'text-red-600'
                      }`}>
                        {f.gmroi.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right text-[#6B7280]">
                        {f.coutMin > 0 ? `${f.coutMin.toLocaleString('fr-FR')} €` : '—'}
                      </td>
                      {budget > 0 && (
                        <td className="px-3 py-2 text-right text-green-600 font-semibold">
                          {gainEstime > 0 ? `+${gainEstime.toLocaleString('fr-FR')} €` : '—'}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          idx === 0 ? 'bg-[#E30613] text-white' :
                          idx === 1 ? 'bg-orange-100 text-orange-700' :
                          idx === 2 ? 'bg-yellow-100 text-yellow-700' :
                          'text-[#9CA3AF]'
                        }`}>
                          {idx < 3 ? `#${idx + 1}` : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[#6B7280]">Gain estimé 30j = montant × GMROI réseau × 0.25 · Source : Réunion Régionale Easycash 2026</p>
        </div>
      )}

      {/* Explanations */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <button
          onClick={() => setShowExplain(!showExplain)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-[#6B7280] hover:text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
        >
          <span className="font-medium">Comment sont calculés les chiffres ?</span>
          <span className="text-xs">{showExplain ? '▲' : '▼'}</span>
        </button>
        {showExplain && (
          <div className="border-t border-[#E0E0E0] px-4 py-4 text-xs text-[#6B7280] space-y-2 leading-relaxed">
            <p><strong className="text-[#1A1A1A]">Masse salariale %</strong> = Coût salarial chargé annuel / CA annuel. Cible : ≤15% en maturité.</p>
            <p><strong className="text-[#1A1A1A]">Coût chargé</strong> = salaire brut × heures × 12 × 1.42 (charges patronales estimées France).</p>
            <p><strong className="text-[#1A1A1A]">CA par ETP</strong> = CA annuel / nb ETP. Benchmark réseau : 250 000 €. Vert : 200-300k, orange : 150-200k ou 300-400k, rouge sinon.</p>
            <p><strong className="text-[#1A1A1A]">Marge par ETP</strong> = (CA × taux marge) / nb ETP. Vert : &gt;90k€, orange : 60-90k€, rouge : &lt;60k€.</p>
            <p><strong className="text-[#1A1A1A]">Ratio CA/ETP</strong> = CA annuel / Nb ETP. Cible réseau : 250 000 € par ETP.</p>
            <p><strong className="text-[#1A1A1A]">Exemple :</strong> pour un CA de 3 M€, il faut environ 12 ETP (fourchette 11-14 selon profil magasin).</p>
          </div>
        )}
      </div>
    </div>
  );
}

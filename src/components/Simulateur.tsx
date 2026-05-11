'use client';

import { useState } from 'react';

interface Props { magasinNom: string; isCriticalSpiral?: boolean; }

// ── Données réseau GMROI réels (Réunion Régionale Easycash 2026) ───────────
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
  if (v >= 200000 && v <= 300000) return 'text-green-400';
  if ((v >= 150000 && v < 200000) || (v > 300000 && v <= 400000)) return 'text-yellow-400';
  return 'text-red-400';
}

function margeColor(v: number) {
  if (v > 90000) return 'text-green-400';
  if (v >= 60000) return 'text-yellow-400';
  return 'text-red-400';
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Simulateur — {magasinNom || 'Magasin'}</h2>
      </div>

      <div className="space-y-4">
        {/* CA + taux marge inputs */}
        <div className="bg-gray-800 rounded-xl p-4 flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">CA annuel du magasin (€)</label>
            <input
              type="number"
              value={caAnnuel || ''}
              onChange={e => saveEquipeStore({ ...equipeStore, caAnnuel: parseFloat(e.target.value) || 0 })}
              placeholder="Ex : 2000000"
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white w-52 focus:outline-none focus:border-green-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Taux de marge (%)</label>
            <input
              type="number"
              value={tauxMarge || ''}
              onChange={e => saveEquipeStore({ ...equipeStore, tauxMarge: parseFloat(e.target.value) || 38 })}
              placeholder="38"
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white w-28 focus:outline-none focus:border-green-500"
            />
          </div>
        </div>

        {/* KPIs équipe — row 1 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800 rounded-xl p-3 text-center">
            <div className={`text-2xl font-black ${masseSalPct <= 15 ? 'text-green-400' : masseSalPct <= 18 ? 'text-yellow-400' : 'text-red-400'}`}>
              {caAnnuel > 0 ? `${masseSalPct.toFixed(1)}%` : '—'}
            </div>
            <div className="text-xs text-gray-400">Masse salariale</div>
            <div className="text-xs text-gray-500">cible ≤15%</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-white">{(totalMasseSal / 1000).toFixed(0)}k€</div>
            <div className="text-xs text-gray-400">Coût annuel total</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-white">{totalEtp.toFixed(1)}</div>
            <div className="text-xs text-gray-400">ETP total</div>
          </div>
        </div>

        {/* KPIs équipe — row 2 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded-xl p-3 text-center">
            <div className={`text-2xl font-black ${caParEtp > 0 ? caColor(caParEtp) : 'text-gray-500'}`}>
              {caParEtp > 0 ? `${(caParEtp / 1000).toFixed(0)}k€` : '—'}
            </div>
            <div className="text-xs text-gray-400">CA par ETP</div>
            <div className="text-xs text-gray-500">benchmark 250k€ · vert 200-300k</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-3 text-center">
            <div className={`text-2xl font-black ${margeParEtp > 0 ? margeColor(margeParEtp) : 'text-gray-500'}`}>
              {margeParEtp > 0 ? `${(margeParEtp / 1000).toFixed(0)}k€` : '—'}
            </div>
            <div className="text-xs text-gray-400">Marge par ETP</div>
            <div className="text-xs text-gray-500">vert &gt;90k · orange 60-90k · rouge &lt;60k</div>
          </div>
        </div>

        {/* Alerte dimensionnement */}
        {caAnnuel > 0 && totalEtp > 0 && (
          <div className={`rounded-xl px-4 py-3 text-sm ${
            ratioCAEtp > 400000 ? 'bg-orange-900/30 border border-orange-700' :
            ratioCAEtp < 180000 ? 'bg-orange-900/30 border border-orange-700' :
            'bg-green-900/30 border border-green-700'
          }`}>
            {ratioCAEtp > 400000 ? (
              <p className="text-orange-300">
                <span className="font-semibold">⚠ Équipe probablement sous-dimensionnée</span><br />
                Vous avez {totalEtp.toFixed(1)} ETP pour {caAnnuel.toLocaleString('fr-FR')} € de CA, soit 1 ETP pour {Math.round(ratioCAEtp).toLocaleString('fr-FR')} €.<br />
                Benchmark réseau : 1 ETP pour 250 000 €.<br />
                Pour votre CA, il faudrait environ <strong>{Math.round(caAnnuel / 250000)}</strong> ETP.
              </p>
            ) : ratioCAEtp < 180000 ? (
              <p className="text-orange-300">
                <span className="font-semibold">⚠ Équipe probablement sur-dimensionnée</span><br />
                Vous avez {totalEtp.toFixed(1)} ETP pour {caAnnuel.toLocaleString('fr-FR')} € de CA, soit 1 ETP pour {Math.round(ratioCAEtp).toLocaleString('fr-FR')} €.<br />
                Benchmark réseau : 1 ETP pour 250 000 €.<br />
                Pour votre CA, <strong>{Math.round(caAnnuel / 250000)}</strong> ETP suffiraient théoriquement.
              </p>
            ) : (
              <p className="text-green-300">✓ Dimensionnement équipe cohérent avec le CA</p>
            )}
            <p className="text-xs text-gray-400 mt-2">Note : ces seuils sont indicatifs. Un magasin centre-ville avec forte saisonnalité peut justifier plus d&apos;ETP qu&apos;un magasin périphérique.</p>
          </div>
        )}

        {/* Table équipe */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-3 py-2 font-semibold">Prénom</th>
                  <th className="text-left px-3 py-2 font-semibold">Contrat</th>
                  <th className="text-right px-3 py-2 font-semibold">H/mois</th>
                  <th className="text-right px-3 py-2 font-semibold">€/h brut</th>
                  <th className="text-right px-3 py-2 font-semibold">Coût annuel</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {equipe.map(e => {
                  const cout = e.heures * e.salaireHoraire * 12 * 1.42;
                  return (
                    <tr key={e.id}>
                      <td className="px-3 py-2">
                        <input
                          value={e.prenom}
                          onChange={ev => updateEquipe(e.id, 'prenom', ev.target.value)}
                          className="bg-transparent text-white w-24 border-b border-gray-600 focus:outline-none focus:border-green-500"
                          placeholder="Prénom"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={e.contrat}
                          onChange={ev => updateEquipe(e.id, 'contrat', ev.target.value)}
                          className="bg-gray-700 text-white text-xs rounded px-1 py-0.5"
                        >
                          {CONTRATS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={e.heures || ''}
                          onChange={ev => updateEquipe(e.id, 'heures', parseFloat(ev.target.value) || 0)}
                          className="bg-transparent text-white w-16 text-right border-b border-gray-600 focus:outline-none focus:border-green-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={e.salaireHoraire || ''}
                          onChange={ev => updateEquipe(e.id, 'salaireHoraire', parseFloat(ev.target.value) || 0)}
                          className="bg-transparent text-white w-12 text-right border-b border-gray-600 focus:outline-none focus:border-green-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-white font-medium">{cout.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</td>
                      <td className="px-2 py-2">
                        <button onClick={() => delEquipe(e.id)} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-gray-700">
            <button onClick={addEquipe} className="text-xs text-green-400 hover:text-green-300">+ Ajouter un collaborateur</button>
          </div>
        </div>
        <p className="text-xs text-gray-500">Coût chargé = salaire brut × heures × 12 × 1.42 (charges patronales estimées France)</p>
      </div>

      {/* GMROI réseau — Arbitrage budget */}
      {isCriticalSpiral ? (
        <div className="bg-[#FF1F2E] rounded-xl px-4 py-4 text-white">
          <p className="font-bold text-sm">⚠ Simulateur d&apos;investissement masqué</p>
          <p className="text-xs text-white/80 mt-1">Spirale détectée : déstockez avant tout nouvel achat. Résolvez la situation avant d&apos;investir.</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-200 mb-1">Arbitrage budget — GMROI réseau 2026</h3>
            <p className="text-xs text-gray-400">Ordre d&apos;investissement optimal par rendement décroissant</p>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Budget disponible (€)</label>
              <input
                type="number"
                value={budget || ''}
                onChange={e => setBudget(parseFloat(e.target.value) || 0)}
                placeholder="Ex : 50000"
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white w-44 focus:outline-none focus:border-[#FF1F2E]"
              />
            </div>
            {budget > 0 && budget < BUDGET_GAMME_MINIMALE && (
              <div className="text-xs text-[#FF1F2E] font-semibold">
                ⚠ Budget insuffisant — gamme incomplète. Prioriser JCON + JCDR ({(BUDGET_GAMME_MINIMALE).toLocaleString('fr-FR')} € min).
              </div>
            )}
            {budget >= BUDGET_IDEAL && (
              <div className="text-xs text-green-400 font-semibold">✓ Budget idéal atteint ({BUDGET_IDEAL.toLocaleString('fr-FR')} €)</div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left px-3 py-2 font-semibold">Famille</th>
                  <th className="text-right px-3 py-2 font-semibold">GMROI réseau</th>
                  <th className="text-right px-3 py-2 font-semibold">Investissement min</th>
                  {budget > 0 && <th className="text-right px-3 py-2 font-semibold">Gain estimé 30j</th>}
                  <th className="text-center px-3 py-2 font-semibold">Priorité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {GMROI_RESEAU.map((f, idx) => {
                  const montantAlloue = budget > 0 ? Math.min(budget, f.coutMin > 0 ? f.coutMin : budget / 3) : 0;
                  const gainEstime = montantAlloue > 0 ? Math.round(montantAlloue * f.gmroi * 0.25) : 0;
                  const isRecommended = budget > 0 && budget >= (f.coutMin || 0) && idx < 3;
                  return (
                    <tr key={f.code} className={isRecommended ? 'bg-green-900/10' : ''}>
                      <td className="px-3 py-2">
                        <span className="text-xs text-gray-500 font-mono mr-1.5">{f.code}</span>
                        <span className="text-gray-200">{f.label}</span>
                      </td>
                      <td className={`px-3 py-2 text-right font-bold ${
                        f.gmroi >= 2 ? 'text-green-400' : f.gmroi >= 1 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {f.gmroi.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-300">
                        {f.coutMin > 0 ? `${f.coutMin.toLocaleString('fr-FR')} €` : '—'}
                      </td>
                      {budget > 0 && (
                        <td className="px-3 py-2 text-right text-green-400 font-semibold">
                          {gainEstime > 0 ? `+${gainEstime.toLocaleString('fr-FR')} €` : '—'}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          idx === 0 ? 'bg-[#FF1F2E] text-white' :
                          idx === 1 ? 'bg-orange-700 text-orange-100' :
                          idx === 2 ? 'bg-yellow-700 text-yellow-100' :
                          'text-gray-500'
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
          <p className="text-xs text-gray-500">Gain estimé 30j = montant × GMROI réseau × 0.25 · Source : Réunion Régionale Easycash 2026</p>
        </div>
      )}

      {/* Explanations collapsible */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowExplain(!showExplain)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <span className="font-medium">Comment sont calculés les chiffres ?</span>
          <span className="text-xs">{showExplain ? '▲' : '▼'}</span>
        </button>
        {showExplain && (
          <div className="border-t border-gray-700 px-4 py-4 text-xs text-gray-300 space-y-2 leading-relaxed">
            <p><strong className="text-white">Masse salariale %</strong> = Coût salarial chargé annuel / CA annuel. Cible : ≤15% en maturité.</p>
            <p><strong className="text-white">Coût chargé</strong> = salaire brut × heures × 12 × 1.42 (charges patronales estimées France).</p>
            <p><strong className="text-white">CA par ETP</strong> = CA annuel / nb ETP. Benchmark réseau : 250 000 €. Vert : 200-300k, orange : 150-200k ou 300-400k, rouge sinon.</p>
            <p><strong className="text-white">Marge par ETP</strong> = (CA × taux marge) / nb ETP. Vert : &gt;90k€, orange : 60-90k€, rouge : &lt;60k€.</p>
            <p><strong className="text-white">Ratio CA/ETP</strong> = CA annuel / Nb ETP. Cible réseau : 250 000 € par ETP.</p>
            <p><strong className="text-white">Exemple :</strong> pour un CA de 3 M€, il faut environ 12 ETP (fourchette 11-14 selon profil magasin).</p>
          </div>
        )}
      </div>
    </div>
  );
}

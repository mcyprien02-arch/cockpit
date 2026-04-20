'use client';

import { useState } from 'react';

interface Props { magasinNom: string; }

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

export default function Simulateur({ magasinNom }: Props) {
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

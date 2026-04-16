'use client';

import { useState } from 'react';

interface Props { magasinNom: string; }

interface FamilleRow {
  id: string;
  famille: string;
  stockValeur: number;
  margePct: number;
  ventesMensuelles: number;
}

interface EquipeRow {
  id: string;
  prenom: string;
  contrat: string;
  heures: number;
  salaireHoraire: number;
}

function uid() { return Math.random().toString(36).slice(2); }

const FAMILLES_DEFAUT: FamilleRow[] = [
  { id: uid(), famille: 'Téléphonie', stockValeur: 25000, margePct: 38, ventesMensuelles: 8500 },
  { id: uid(), famille: 'Consoles', stockValeur: 12000, margePct: 32, ventesMensuelles: 4000 },
  { id: uid(), famille: 'Jeux Vidéo', stockValeur: 5000, margePct: 42, ventesMensuelles: 3000 },
  { id: uid(), famille: 'PC portables', stockValeur: 15000, margePct: 28, ventesMensuelles: 5000 },
  { id: uid(), famille: 'Tablettes', stockValeur: 8000, margePct: 34, ventesMensuelles: 3500 },
];

const CONTRATS = ['CDI 35H', 'CDI 39H', 'CDD', 'Apprenti', 'Stage'];

export default function Simulateur({ magasinNom }: Props) {
  const storageKey = `sim_${magasinNom}`;
  const equipeKey = `equipe_${magasinNom}`;

  const [familles, setFamilles] = useState<FamilleRow[]>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
      return s ? JSON.parse(s) as FamilleRow[] : FAMILLES_DEFAUT;
    } catch { return FAMILLES_DEFAUT; }
  });

  const [equipe, setEquipe] = useState<EquipeRow[]>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(equipeKey) : null;
      return s ? JSON.parse(s) as EquipeRow[] : [];
    } catch { return []; }
  });

  const [tab, setTab] = useState<'gmroi' | 'equipe'>('gmroi');

  function saveFamilles(rows: FamilleRow[]) {
    setFamilles(rows);
    localStorage.setItem(storageKey, JSON.stringify(rows));
  }

  function saveEquipe(rows: EquipeRow[]) {
    setEquipe(rows);
    localStorage.setItem(equipeKey, JSON.stringify(rows));
  }

  function updateFamille(id: string, field: keyof FamilleRow, value: string | number) {
    saveFamilles(familles.map(f => f.id === id ? { ...f, [field]: value } : f));
  }

  function addFamille() {
    saveFamilles([...familles, { id: uid(), famille: 'Nouvelle famille', stockValeur: 0, margePct: 30, ventesMensuelles: 0 }]);
  }

  function delFamille(id: string) { saveFamilles(familles.filter(f => f.id !== id)); }

  function addEquipe() {
    saveEquipe([...equipe, { id: uid(), prenom: '', contrat: 'CDI 35H', heures: 151.67, salaireHoraire: 12 }]);
  }

  function updateEquipe(id: string, field: keyof EquipeRow, value: string | number) {
    saveEquipe(equipe.map(e => e.id === id ? { ...e, [field]: value } : e));
  }

  function delEquipe(id: string) { saveEquipe(equipe.filter(e => e.id !== id)); }

  // GMROI calculations
  const totalStock = familles.reduce((s, f) => s + f.stockValeur, 0);
  const totalMargeBrute = familles.reduce((s, f) => s + (f.ventesMensuelles * 12 * f.margePct / 100), 0);
  const gmroi = totalStock > 0 ? totalMargeBrute / totalStock : 0;

  const famillesWithMetrics = familles.map(f => {
    const margeAnnuelle = f.ventesMensuelles * 12 * f.margePct / 100;
    const gmroiF = f.stockValeur > 0 ? margeAnnuelle / f.stockValeur : 0;
    const delaiVente = f.ventesMensuelles > 0 ? (f.stockValeur / f.ventesMensuelles) * 30 : 0;
    const poidsPct = totalStock > 0 ? (f.stockValeur / totalStock) * 100 : 0;
    return { ...f, margeAnnuelle, gmroiF, delaiVente, poidsPct };
  });

  // Equipe calculations
  const totalMasseSal = equipe.reduce((s, e) => s + (e.heures * e.salaireHoraire * 12 * 1.42), 0);
  const totalHeures = equipe.reduce((s, e) => s + e.heures, 0);
  const caAnnuelSimule = familles.reduce((s, f) => s + f.ventesMensuelles * 12, 0);
  const masseSalPct = caAnnuelSimule > 0 ? (totalMasseSal / caAnnuelSimule) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Simulateur — {magasinNom || 'Magasin'}</h2>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-800 rounded-xl p-1 w-fit">
        {([['gmroi', 'GMROI & Stock'], ['equipe', 'Équipe & MS']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === id ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'gmroi' && (
        <div className="space-y-4">
          {/* Global KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className={`text-2xl font-black ${gmroi >= 3.5 ? 'text-green-400' : gmroi >= 2.5 ? 'text-yellow-400' : 'text-red-400'}`}>{gmroi.toFixed(2)}</div>
              <div className="text-xs text-gray-400">GMROI global</div>
              <div className="text-xs text-gray-500">cible &gt;3.5</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-black text-white">{(totalStock / 1000).toFixed(0)}k€</div>
              <div className="text-xs text-gray-400">Stock total</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-black text-white">{(totalMargeBrute / 1000).toFixed(0)}k€</div>
              <div className="text-xs text-gray-400">Marge annuelle</div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="text-left px-3 py-2 font-semibold">Famille</th>
                    <th className="text-right px-3 py-2 font-semibold">Stock (€)</th>
                    <th className="text-right px-3 py-2 font-semibold">Marge %</th>
                    <th className="text-right px-3 py-2 font-semibold">Ventes/mois</th>
                    <th className="text-right px-3 py-2 font-semibold">GMROI</th>
                    <th className="text-right px-3 py-2 font-semibold">Délai (j)</th>
                    <th className="text-right px-3 py-2 font-semibold">Poids</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {famillesWithMetrics.map(f => (
                    <tr key={f.id} className="hover:bg-gray-750">
                      <td className="px-3 py-2">
                        <input
                          value={f.famille}
                          onChange={e => updateFamille(f.id, 'famille', e.target.value)}
                          className="bg-transparent text-white w-28 border-b border-gray-600 focus:outline-none focus:border-green-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={f.stockValeur || ''}
                          onChange={e => updateFamille(f.id, 'stockValeur', parseFloat(e.target.value) || 0)}
                          className="bg-transparent text-white w-20 text-right border-b border-gray-600 focus:outline-none focus:border-green-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={f.margePct || ''}
                          onChange={e => updateFamille(f.id, 'margePct', parseFloat(e.target.value) || 0)}
                          className="bg-transparent text-white w-12 text-right border-b border-gray-600 focus:outline-none focus:border-green-500"
                        />
                        <span className="text-gray-500 ml-0.5">%</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={f.ventesMensuelles || ''}
                          onChange={e => updateFamille(f.id, 'ventesMensuelles', parseFloat(e.target.value) || 0)}
                          className="bg-transparent text-white w-20 text-right border-b border-gray-600 focus:outline-none focus:border-green-500"
                        />
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${f.gmroiF >= 3.5 ? 'text-green-400' : f.gmroiF >= 2.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {f.stockValeur > 0 ? f.gmroiF.toFixed(2) : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right ${f.delaiVente > 60 ? 'text-red-400' : f.delaiVente > 30 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {f.ventesMensuelles > 0 ? Math.round(f.delaiVente) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-400">{f.poidsPct.toFixed(1)}%</td>
                      <td className="px-2 py-2">
                        <button onClick={() => delFamille(f.id)} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2 border-t border-gray-700">
              <button onClick={addFamille} className="text-xs text-green-400 hover:text-green-300">+ Ajouter une famille</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'equipe' && (
        <div className="space-y-4">
          {/* KPIs équipe */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className={`text-2xl font-black ${masseSalPct <= 15 ? 'text-green-400' : masseSalPct <= 18 ? 'text-yellow-400' : 'text-red-400'}`}>
                {masseSalPct.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400">Masse salariale</div>
              <div className="text-xs text-gray-500">cible ≤15%</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-black text-white">{(totalMasseSal / 1000).toFixed(0)}k€</div>
              <div className="text-xs text-gray-400">Coût annuel total</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-black text-white">{(totalHeures / 151.67).toFixed(1)}</div>
              <div className="text-xs text-gray-400">ETP total</div>
            </div>
          </div>

          {caAnnuelSimule > 0 && (
            <div className="bg-gray-800 rounded-xl p-3 text-xs text-gray-400">
              CA annuel simulé (onglet GMROI) : <strong className="text-white">{caAnnuelSimule.toLocaleString('fr-FR')} €</strong> ·
              Ratio cible : 1 ETP / 250k€ CA = <strong className="text-white">{(caAnnuelSimule / 250000).toFixed(1)} ETP</strong>
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
          <p className="text-xs text-gray-500">Coût chargé = salaire brut × heures × 12 × 1.42 (charges patronales estimées)</p>
        </div>
      )}
    </div>
  );
}

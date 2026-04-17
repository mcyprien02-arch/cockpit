'use client';

import { useState } from 'react';

interface Props { magasinNom: string; }

interface FamilleRow {
  id: string;
  famille: string;
  stockValeur: number;
  margeAnnuelle: number;
  delaiVente: number;
  stockIdeal: number;
}

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
}

function uid() { return Math.random().toString(36).slice(2); }

const FAMILLES_DEFAUT: FamilleRow[] = [
  { id: uid(), famille: 'Téléphonie',  stockValeur: 25000, margeAnnuelle: 38760, delaiVente: 28, stockIdeal: 20000 },
  { id: uid(), famille: 'Consoles',    stockValeur: 12000, margeAnnuelle: 15360, delaiVente: 35, stockIdeal: 10000 },
  { id: uid(), famille: 'Jeux Vidéo',  stockValeur: 5000,  margeAnnuelle: 15120, delaiVente: 20, stockIdeal: 4000  },
  { id: uid(), famille: 'PC portables',stockValeur: 15000, margeAnnuelle: 16800, delaiVente: 45, stockIdeal: 12000 },
  { id: uid(), famille: 'Tablettes',   stockValeur: 8000,  margeAnnuelle: 14280, delaiVente: 38, stockIdeal: 6000  },
];

const CONTRATS = ['CDI 35H', 'CDI 39H', 'CDD', 'Apprenti', 'Stage'];

function verdict(gmroi: number, stock: number, ideal: number, rotation: number | null): string {
  if (stock <= 0 || gmroi === 0) return '—';
  if (rotation !== null && rotation > 0) {
    if (gmroi >= 2 && stock <= ideal)  return rotation >= 6 ? '🟢 Investir — rotation forte' : '🟢 Investir avec prudence';
    if (gmroi >= 2 && stock > ideal)   return rotation >= 6 ? '🟡 Maintenir — rotation justifie le stock' : '🟠 Alléger — stock trop haut';
    if (gmroi < 1.5 && stock > ideal)  return '🔴 Déstocker en priorité';
    if (gmroi < 1.5 && stock <= ideal) return rotation < 4 ? '🔴 Déstocker — stock ne tourne pas' : '🟠 Revoir les prix — marge faible';
    if (rotation >= 8) return '🟢 OK — rotation rapide compense';
    if (rotation >= 4) return '🟡 Surveiller';
    return '🔴 Déstocker — double peine';
  }
  if (gmroi >= 2 && stock <= ideal) return '🟢 Investir';
  if (gmroi >= 2 && stock > ideal)  return '🟡 Maintenir';
  if (gmroi < 1.5 && stock > ideal) return '🔴 Déstocker';
  if (gmroi < 1.5 && stock <= ideal) return '🟠 Revoir prix';
  return '🟡 Surveiller';
}

function migrateFamilles(raw: unknown[]): FamilleRow[] {
  return raw.map((f: unknown) => {
    const r = f as Record<string, unknown>;
    return {
      id: (r.id as string) || uid(),
      famille: (r.famille as string) || '',
      stockValeur: Number(r.stockValeur) || 0,
      // migrate old margePct+ventesMensuelles → margeAnnuelle
      margeAnnuelle: Number(r.margeAnnuelle) ||
        (Number(r.ventesMensuelles) * 12 * Number(r.margePct) / 100) || 0,
      delaiVente: Number(r.delaiVente) || 0,
      stockIdeal: Number(r.stockIdeal) || 0,
    };
  });
}

export default function Simulateur({ magasinNom }: Props) {
  const storageKey = `sim_${magasinNom}`;
  const equipeKey = `equipe_${magasinNom}`;

  const [familles, setFamilles] = useState<FamilleRow[]>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
      return s ? migrateFamilles(JSON.parse(s) as unknown[]) : FAMILLES_DEFAUT;
    } catch { return FAMILLES_DEFAUT; }
  });

  const [equipeStore, setEquipeStore] = useState<EquipeStore>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(equipeKey) : null;
      if (s) {
        const p = JSON.parse(s) as unknown;
        if (Array.isArray(p)) return { rows: p as EquipeRow[], caAnnuel: 0 };
        return p as EquipeStore;
      }
      return { rows: [], caAnnuel: 0 };
    } catch { return { rows: [], caAnnuel: 0 }; }
  });

  const [tab, setTab] = useState<'gmroi' | 'equipe'>('gmroi');
  const [showExplain, setShowExplain] = useState(false);

  function saveFamilles(rows: FamilleRow[]) {
    setFamilles(rows);
    localStorage.setItem(storageKey, JSON.stringify(rows));
  }

  function saveEquipeStore(store: EquipeStore) {
    setEquipeStore(store);
    localStorage.setItem(equipeKey, JSON.stringify(store));
  }

  function updateFamille(id: string, field: keyof FamilleRow, value: string | number) {
    saveFamilles(familles.map(f => f.id === id ? { ...f, [field]: value } : f));
  }

  function addFamille() {
    saveFamilles([...familles, { id: uid(), famille: 'Nouvelle famille', stockValeur: 0, margeAnnuelle: 0, delaiVente: 0, stockIdeal: 0 }]);
  }

  function delFamille(id: string) { saveFamilles(familles.filter(f => f.id !== id)); }

  function addEquipe() {
    saveEquipeStore({ ...equipeStore, rows: [...equipeStore.rows, { id: uid(), prenom: '', contrat: 'CDI 35H', heures: 151.67, salaireHoraire: 12 }] });
  }

  function updateEquipe(id: string, field: keyof EquipeRow, value: string | number) {
    saveEquipeStore({ ...equipeStore, rows: equipeStore.rows.map(e => e.id === id ? { ...e, [field]: value } : e) });
  }

  function delEquipe(id: string) {
    saveEquipeStore({ ...equipeStore, rows: equipeStore.rows.filter(e => e.id !== id) });
  }

  // GMROI calculations
  const totalStock = familles.reduce((s, f) => s + f.stockValeur, 0);
  const totalMarge = familles.reduce((s, f) => s + f.margeAnnuelle, 0);
  const gmroiGlobal = totalStock > 0 ? totalMarge / totalStock : 0;

  const famillesWithMetrics = familles.map(f => {
    const gmroi = f.stockValeur > 0 && f.margeAnnuelle > 0 ? f.margeAnnuelle / f.stockValeur : null;
    const rotation = f.delaiVente > 0 ? 365 / f.delaiVente : null;
    return {
      ...f,
      gmroi,
      rotation,
      verdict: f.stockValeur > 0 ? verdict(gmroi ?? 0, f.stockValeur, f.stockIdeal, rotation) : '—',
    };
  });

  // Equipe calculations
  const { rows: equipe, caAnnuel } = equipeStore;
  const totalMasseSal = equipe.reduce((s, e) => s + (e.heures * e.salaireHoraire * 12 * 1.42), 0);
  const totalHeures = equipe.reduce((s, e) => s + e.heures, 0);
  const totalEtp = totalHeures / 151.67;
  const masseSalPct = caAnnuel > 0 ? (totalMasseSal / caAnnuel) * 100 : 0;
  const ratioCAEtp = totalEtp > 0 && caAnnuel > 0 ? caAnnuel / totalEtp : 0;

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
              <div className={`text-2xl font-black ${gmroiGlobal >= 3.84 ? 'text-green-400' : gmroiGlobal >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                {totalStock > 0 ? gmroiGlobal.toFixed(2) : '—'}
              </div>
              <div className="text-xs text-gray-400">GMROI global</div>
              <div className="text-xs text-gray-500">cible réseau : 3.84</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-black text-white">{(totalStock / 1000).toFixed(0)}k€</div>
              <div className="text-xs text-gray-400">Stock total</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className="text-2xl font-black text-white">{(totalMarge / 1000).toFixed(0)}k€</div>
              <div className="text-xs text-gray-400">Marge totale</div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="text-left px-3 py-2 font-semibold min-w-[120px]">Nom</th>
                    <th className="text-right px-3 py-2 font-semibold">Stock (€)</th>
                    <th className="text-right px-3 py-2 font-semibold">Marge annuelle (€)</th>
                    <th className="text-right px-3 py-2 font-semibold">GMROI (auto)</th>
                    <th className="text-right px-3 py-2 font-semibold">Délai (j)</th>
                    <th className="text-right px-3 py-2 font-semibold">Rotation/an</th>
                    <th className="text-right px-3 py-2 font-semibold">Stock idéal (€)</th>
                    <th className="text-center px-3 py-2 font-semibold">Verdict</th>
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
                          value={f.margeAnnuelle || ''}
                          onChange={e => updateFamille(f.id, 'margeAnnuelle', parseFloat(e.target.value) || 0)}
                          className="bg-transparent text-white w-24 text-right border-b border-gray-600 focus:outline-none focus:border-green-500"
                        />
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${
                        f.gmroi === null ? 'text-gray-500' :
                        f.gmroi >= 3.84 ? 'text-green-400' : f.gmroi >= 2 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {f.gmroi !== null ? f.gmroi.toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={f.delaiVente || ''}
                          onChange={e => updateFamille(f.id, 'delaiVente', parseFloat(e.target.value) || 0)}
                          className={`bg-transparent w-14 text-right border-b border-gray-600 focus:outline-none focus:border-green-500 ${
                            f.delaiVente > 60 ? 'text-red-400' : f.delaiVente > 30 ? 'text-yellow-400' : 'text-green-400'
                          }`}
                        />
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold text-xs ${
                        f.rotation === null ? 'text-gray-500' :
                        f.rotation >= 8 ? 'text-green-400' : f.rotation >= 4 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {f.rotation !== null ? f.rotation.toFixed(1) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={f.stockIdeal || ''}
                          onChange={e => updateFamille(f.id, 'stockIdeal', parseFloat(e.target.value) || 0)}
                          className="bg-transparent text-white w-20 text-right border-b border-gray-600 focus:outline-none focus:border-green-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-center text-xs font-medium">{f.verdict}</td>
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

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
              <div className="text-gray-400">Stock total</div>
              <div className="font-bold text-white">{totalStock.toLocaleString('fr-FR')} €</div>
            </div>
            <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
              <div className="text-gray-400">Marge totale</div>
              <div className="font-bold text-white">{totalMarge.toLocaleString('fr-FR')} €</div>
            </div>
            <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
              <div className="text-gray-400">GMROI global</div>
              <div className={`font-bold ${gmroiGlobal >= 3.84 ? 'text-green-400' : gmroiGlobal >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                {totalStock > 0 ? gmroiGlobal.toFixed(2) : '—'}
              </div>
            </div>
          </div>

          {/* Légende verdicts */}
          <div className="bg-gray-800/60 rounded-lg px-4 py-3 text-xs text-gray-400 space-y-1">
            <p><span className="font-semibold text-gray-300">Verdicts avec délai : </span>
            🟢 Investir (GMROI≥2, rotation≥6) · 🟢 Investir avec prudence (GMROI≥2, rotation&lt;6) · 🟡 Maintenir (GMROI≥2, stock&gt;idéal, rotation≥6) · 🟠 Alléger (GMROI≥2, stock&gt;idéal, rotation&lt;6) · 🔴 Déstocker en priorité (GMROI&lt;1.5, stock&gt;idéal) · 🟠 Revoir prix (GMROI&lt;1.5, stock≤idéal, rotation≥4) · 🔴 Stock ne tourne pas (GMROI&lt;1.5, rotation&lt;4) · 🔴 Double peine (GMROI 1.5-2, rotation&lt;4)</p>
            <p><span className="font-semibold text-gray-300">Sans délai : </span>
            🟢 Investir (GMROI≥2 + stock≤idéal) · 🟡 Maintenir (GMROI≥2 + stock&gt;idéal) · 🔴 Déstocker (GMROI&lt;1.5 + stock&gt;idéal) · 🟠 Revoir prix · 🟡 Surveiller (GMROI 1.5-2)</p>
          </div>
        </div>
      )}

      {tab === 'equipe' && (
        <div className="space-y-4">
          {/* CA input */}
          <div className="bg-gray-800 rounded-xl p-4">
            <label className="text-xs text-gray-400 block mb-1">CA annuel du magasin (€)</label>
            <input
              type="number"
              value={caAnnuel || ''}
              onChange={e => saveEquipeStore({ ...equipeStore, caAnnuel: parseFloat(e.target.value) || 0 })}
              placeholder="Ex : 2000000"
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white w-full md:w-60 focus:outline-none focus:border-green-500"
            />
          </div>

          {/* KPIs équipe */}
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
            <p><strong className="text-white">GMROI</strong> = Marge annuelle / Stock. Un GMROI de 2 signifie que chaque € de stock génère 2 € de marge par an. Cible réseau : 3.84.</p>
            <p><strong className="text-white">Masse salariale %</strong> = Coût salarial chargé annuel / CA annuel. Cible : ≤15% en maturité.</p>
            <p><strong className="text-white">Coût chargé</strong> = salaire brut × heures × 12 × 1.42 (charges patronales estimées France).</p>
            <p><strong className="text-white">Ratio CA/ETP</strong> = CA annuel / Nb ETP. Cible réseau : 250 000 € par ETP.</p>
            <p><strong className="text-white">Exemple :</strong> pour un CA de 3 M€, il faut environ 12 ETP (fourchette 11-14 selon profil magasin).</p>
          </div>
        )}
      </div>
    </div>
  );
}

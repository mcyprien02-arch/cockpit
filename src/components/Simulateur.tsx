'use client';

import { useState, useEffect } from 'react';

interface SimRow {
  id: string;
  nom: string;
  stock: string;
  marge: string;
  stockIdeal: string;
}

interface EquipeData {
  nbEtp: string;
  caEstime: string;
  msTotal: string;
}

const EMPTY_ROW = (): SimRow => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  nom: '',
  stock: '',
  marge: '',
  stockIdeal: '',
});

function calcGmroi(stock: string, marge: string): number | null {
  const s = parseFloat(stock);
  const m = parseFloat(marge);
  if (!s || !m || s <= 0) return null;
  return m / s;
}

function getVerdict(gmroi: number | null, stock: string, stockIdeal: string): string {
  const s = parseFloat(stock);
  const si = parseFloat(stockIdeal);
  if (!gmroi || !s) return 'Saisissez vos données';
  const hasIdeal = !isNaN(si) && si > 0;

  if (gmroi >= 2) {
    if (hasIdeal && s > si) return '🟡 Bon rendement, stock élevé';
    return '🟢 Investir ici';
  }
  if (gmroi < 1.5) {
    if (hasIdeal && s > si) return '🔴 Déstocker en priorité';
    return '🟠 Revoir les prix';
  }
  return '🟡 Correct, à surveiller';
}

export default function Simulateur() {
  const [rows, setRows] = useState<SimRow[]>([]);
  const [equipe, setEquipe] = useState<EquipeData>({ nbEtp: '', caEstime: '', msTotal: '' });
  const [etpDelta, setEtpDelta] = useState(0);
  const [investir, setInvestir] = useState('');
  const [liberer, setLiberer] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const r = localStorage.getItem('ec_sim_rows');
      if (r) setRows(JSON.parse(r));
      const e = localStorage.getItem('ec_equipe');
      if (e) setEquipe(JSON.parse(e));
    } catch {}
    setMounted(true);
  }, []);

  function saveRows(r: SimRow[]) {
    setRows(r);
    localStorage.setItem('ec_sim_rows', JSON.stringify(r));
  }

  function saveEquipe(e: EquipeData) {
    setEquipe(e);
    localStorage.setItem('ec_equipe', JSON.stringify(e));
  }

  function addRow() {
    saveRows([...rows, EMPTY_ROW()]);
  }

  function updateRow(id: string, field: keyof SimRow, value: string) {
    saveRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function deleteRow(id: string) {
    saveRows(rows.filter((r) => r.id !== id));
  }

  // Investissement recommendation
  function getInvestRecos(): string {
    const budget = parseFloat(investir);
    if (!budget || budget <= 0) return '';
    const eligible = rows
      .filter((r) => {
        const s = parseFloat(r.stock);
        const si = parseFloat(r.stockIdeal);
        return !isNaN(s) && !isNaN(si) && si > 0 && s < si;
      })
      .map((r) => ({
        nom: r.nom || '(sans nom)',
        gmroi: calcGmroi(r.stock, r.marge),
        stock: parseFloat(r.stock),
        stockIdeal: parseFloat(r.stockIdeal),
      }))
      .filter((r) => r.gmroi !== null)
      .sort((a, b) => (b.gmroi ?? 0) - (a.gmroi ?? 0));

    if (eligible.length === 0) {
      return "Toutes vos familles sont au-dessus du stock idéal. Pas d'injection recommandée.";
    }
    return eligible
      .map((r, i) => {
        const cap = r.stockIdeal - r.stock;
        return `Priorité ${i + 1} : ${r.nom} (GMROI ${r.gmroi!.toFixed(2)}) — stock à ${Math.round(r.stock).toLocaleString('fr-FR')}€, idéal ${Math.round(r.stockIdeal).toLocaleString('fr-FR')}€, capacité d'injection +${Math.round(cap).toLocaleString('fr-FR')}€`;
      })
      .join('\n');
  }

  function getDestockRecos(): string {
    const target = parseFloat(liberer);
    if (!target || target <= 0) return '';
    const eligible = rows
      .filter((r) => {
        const s = parseFloat(r.stock);
        const si = parseFloat(r.stockIdeal);
        return !isNaN(s) && !isNaN(si) && si >= 0 && s > si;
      })
      .map((r) => ({
        nom: r.nom || '(sans nom)',
        gmroi: calcGmroi(r.stock, r.marge),
        stock: parseFloat(r.stock),
        stockIdeal: parseFloat(r.stockIdeal),
        excedent: parseFloat(r.stock) - parseFloat(r.stockIdeal),
      }))
      .filter((r) => r.gmroi !== null)
      .sort((a, b) => (a.gmroi ?? 0) - (b.gmroi ?? 0));

    if (eligible.length === 0) {
      return "Aucune famille n'est au-dessus du stock idéal. Pas de déstockage recommandé.";
    }

    let cumul = 0;
    const recos: string[] = [];
    for (let i = 0; i < eligible.length; i++) {
      const r = eligible[i];
      const needed = Math.min(r.excedent, target - cumul);
      cumul += needed;
      recos.push(`${i + 1}. Réduire ${r.nom} de ${Math.round(needed).toLocaleString('fr-FR')}€ (excédent vs idéal)`);
      if (cumul >= target) break;
    }
    recos.push(`Total libérable : ${Math.round(Math.min(cumul, target)).toLocaleString('fr-FR')}€`);
    return recos.join('\n');
  }

  // Equipe calculations
  const nbEtp = parseFloat(equipe.nbEtp);
  const caEstime = parseFloat(equipe.caEstime);
  const msTotal = parseFloat(equipe.msTotal);
  const hasEquipe = !isNaN(nbEtp) && nbEtp > 0 && !isNaN(caEstime) && caEstime > 0;

  const caPerEtp = hasEquipe ? caEstime / nbEtp : null;
  const msPct = hasEquipe && !isNaN(msTotal) ? (msTotal / caEstime) * 100 : null;
  const etpSim = hasEquipe ? nbEtp + etpDelta : null;
  const msSimTotal = !isNaN(msTotal) ? msTotal + etpDelta * 28000 : null;
  const msSimPct = hasEquipe && msSimTotal !== null ? (msSimTotal / caEstime) * 100 : null;
  const caPerEtpSim = etpSim ? caEstime / etpSim : null;

  if (!mounted) return null;

  const inputCls = 'bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500';

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Simulateur "Et si..."</h1>
        <button
          onClick={addRow}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-500 text-black hover:bg-green-400 transition-colors"
        >
          + Ajouter une ligne
        </button>
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left p-3 text-gray-400 font-semibold">Nom</th>
                <th className="text-left p-3 text-gray-400 font-semibold">Stock (€)</th>
                <th className="text-left p-3 text-gray-400 font-semibold">Marge annuelle (€)</th>
                <th className="text-left p-3 text-gray-400 font-semibold">
                  GMROI
                  <span className="block text-xs font-normal text-gray-500">= Marge / Stock</span>
                </th>
                <th className="text-left p-3 text-gray-400 font-semibold">Stock idéal (€)</th>
                <th className="text-left p-3 text-gray-400 font-semibold">Verdict</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    Ajoutez une ligne pour commencer à simuler.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const g = calcGmroi(row.stock, row.marge);
                const verdict = getVerdict(g, row.stock, row.stockIdeal);
                return (
                  <tr key={row.id} className="border-b border-gray-700/50">
                    <td className="p-2">
                      <input
                        className={`${inputCls} w-32`}
                        value={row.nom}
                        onChange={(e) => updateRow(row.id, 'nom', e.target.value)}
                        placeholder="ex: Bijouterie Or"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        className={`${inputCls} w-28`}
                        value={row.stock}
                        onChange={(e) => updateRow(row.id, 'stock', e.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        className={`${inputCls} w-28`}
                        value={row.marge}
                        onChange={(e) => updateRow(row.id, 'marge', e.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td className="p-2 font-mono font-bold text-center">
                      {g !== null ? (
                        <span style={{ color: g >= 2 ? '#22c55e' : g >= 1.5 ? '#f59e0b' : '#ef4444' }}>
                          {g.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        className={`${inputCls} w-28`}
                        value={row.stockIdeal}
                        onChange={(e) => updateRow(row.id, 'stockIdeal', e.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td className="p-2 text-sm">{verdict}</td>
                    <td className="p-2">
                      <button
                        onClick={() => deleteRow(row.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Business questions */}
      {rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-sm">💰 J'ai … à investir → où ?</h3>
            <div className="flex gap-2">
              <input
                type="number"
                className={`${inputCls} flex-1`}
                value={investir}
                onChange={(e) => setInvestir(e.target.value)}
                placeholder="Montant à investir (€)"
              />
            </div>
            {investir && (
              <pre className="text-xs text-gray-200 whitespace-pre-wrap bg-gray-900 rounded-lg p-3 leading-relaxed">
                {getInvestRecos()}
              </pre>
            )}
          </div>

          <div className="bg-gray-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-semibold text-sm">🔻 Je dois libérer … → où déstocker ?</h3>
            <div className="flex gap-2">
              <input
                type="number"
                className={`${inputCls} flex-1`}
                value={liberer}
                onChange={(e) => setLiberer(e.target.value)}
                placeholder="Montant à libérer (€)"
              />
            </div>
            {liberer && (
              <pre className="text-xs text-gray-200 whitespace-pre-wrap bg-gray-900 rounded-lg p-3 leading-relaxed">
                {getDestockRecos()}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Équipe */}
      <div className="bg-gray-800 rounded-2xl p-5 space-y-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">👥 Équipe</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nb ETP</label>
            <input
              type="number"
              className={`${inputCls} w-full`}
              value={equipe.nbEtp}
              onChange={(e) => saveEquipe({ ...equipe, nbEtp: e.target.value })}
              placeholder="ex: 4"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">CA estimé annuel (€)</label>
            <input
              type="number"
              className={`${inputCls} w-full`}
              value={equipe.caEstime}
              onChange={(e) => saveEquipe({ ...equipe, caEstime: e.target.value })}
              placeholder="ex: 1000000"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Masse salariale totale (€)</label>
            <input
              type="number"
              className={`${inputCls} w-full`}
              value={equipe.msTotal}
              onChange={(e) => saveEquipe({ ...equipe, msTotal: e.target.value })}
              placeholder="ex: 120000"
            />
          </div>
        </div>

        {hasEquipe ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-900 rounded-xl p-4">
                <p className="text-gray-400 mb-1">Ratio CA/ETP</p>
                <p className="text-2xl font-bold" style={{ color: caPerEtp! >= 250000 ? '#22c55e' : '#ef4444' }}>
                  {Math.round(caPerEtp!).toLocaleString('fr-FR')} €
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Formule : {equipe.caEstime} / {equipe.nbEtp} = {Math.round(caPerEtp!).toLocaleString('fr-FR')} €/ETP
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Benchmark : 250 000 €/ETP</p>
              </div>
              {msPct !== null && (
                <div className="bg-gray-900 rounded-xl p-4">
                  <p className="text-gray-400 mb-1">Masse salariale</p>
                  <p className="text-2xl font-bold" style={{ color: msPct <= 15 ? '#22c55e' : msPct <= 18 ? '#f59e0b' : '#ef4444' }}>
                    {msPct.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Formule : {equipe.msTotal} / {equipe.caEstime} × 100 = {msPct.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Seuil : ≤ 15%</p>
                </div>
              )}
            </div>

            {/* ETP slider */}
            <div className="bg-gray-900 rounded-xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Simulation ±1 ETP</span>
                <span className="font-bold">
                  {etpDelta > 0 ? '+' : ''}{etpDelta} ETP → {etpSim} ETP au total
                </span>
              </div>
              <input
                type="range"
                min={-3} max={3} step={1}
                value={etpDelta}
                onChange={(e) => setEtpDelta(Number(e.target.value))}
                className="w-full accent-green-400"
              />
              <div className="flex justify-center gap-1 text-xs text-gray-500">
                {[-3, -2, -1, 0, 1, 2, 3].map((v) => (
                  <span key={v} className={`w-6 text-center ${v === etpDelta ? 'text-green-400 font-bold' : ''}`}>
                    {v > 0 ? `+${v}` : v}
                  </span>
                ))}
              </div>
              {etpDelta !== 0 && msSimTotal !== null && msSimPct !== null && caPerEtpSim !== null && (
                <div className="text-sm text-gray-200 space-y-1 pt-2 border-t border-gray-700">
                  <p>
                    Avec {etpSim} ETP : nouvelle masse sal = {Math.round(msSimTotal).toLocaleString('fr-FR')} € →{' '}
                    <span style={{ color: msSimPct <= 15 ? '#22c55e' : msSimPct <= 18 ? '#f59e0b' : '#ef4444' }}>
                      {msSimPct.toFixed(1)}%
                    </span>{' '}
                    du CA
                  </p>
                  <p className="text-xs text-gray-500">
                    Formule : ({equipe.msTotal} + {etpDelta} × 28 000) / {equipe.caEstime} × 100
                  </p>
                  <p>
                    Nouveau ratio = {Math.round(caPerEtpSim).toLocaleString('fr-FR')} €/ETP
                  </p>
                  <p className="text-xs text-gray-500">
                    Formule : {equipe.caEstime} / {etpSim}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Saisissez vos données pour voir les calculs.</p>
        )}
      </div>
    </div>
  );
}

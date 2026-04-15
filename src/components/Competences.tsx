'use client';

import { useState, useEffect } from 'react';

type Level = '○' | '□' | '▧' | '■' | '—';
const LEVELS: Level[] = ['○', '□', '▧', '■', '—'];

const LEVEL_STYLES: Record<Level, { bg: string; text: string; label: string }> = {
  '○': { bg: 'bg-red-900/60',    text: 'text-red-300',    label: 'À former' },
  '□': { bg: 'bg-blue-900/60',   text: 'text-blue-300',   label: 'Théorique' },
  '▧': { bg: 'bg-yellow-900/60', text: 'text-yellow-300', label: 'Partiel' },
  '■': { bg: 'bg-green-900/60',  text: 'text-green-300',  label: 'Maîtrisé' },
  '—': { bg: 'bg-gray-800',      text: 'text-gray-500',   label: 'Aucun' },
};

interface Operation {
  id: string;
  name: string;
  section: 'GESTION' | 'SÉCURITÉ' | 'DÉVELOPPEMENT';
  custom?: boolean;
}

const DEFAULT_OPS: Operation[] = [
  { id: 'g1', section: 'GESTION',       name: 'Caisse / encaissement' },
  { id: 'g2', section: 'GESTION',       name: 'Mise en rayon / facing' },
  { id: 'g3', section: 'GESTION',       name: 'Réception et test produits' },
  { id: 'g4', section: 'GESTION',       name: 'Étiquetage / rattachement' },
  { id: 'g5', section: 'GESTION',       name: 'Accueil client / découverte besoins' },
  { id: 's1', section: 'SÉCURITÉ',      name: 'Inventaire tournant' },
  { id: 's2', section: 'SÉCURITÉ',      name: 'Gestion SAV' },
  { id: 's3', section: 'SÉCURITÉ',      name: 'Gestion coffre' },
  { id: 's4', section: 'SÉCURITÉ',      name: 'Ouverture / fermeture magasin' },
  { id: 's5', section: 'SÉCURITÉ',      name: 'Contrôle démarque' },
  { id: 'd1', section: 'DÉVELOPPEMENT', name: 'Vente Estaly' },
  { id: 'd2', section: 'DÉVELOPPEMENT', name: 'Achats VPD' },
  { id: 'd3', section: 'DÉVELOPPEMENT', name: 'Accélération stock (côtes)' },
  { id: 'd4', section: 'DÉVELOPPEMENT', name: 'Merchandising / théâtralisation' },
  { id: 'd5', section: 'DÉVELOPPEMENT', name: 'Web EC.fr / marketplace' },
  { id: 'd6', section: 'DÉVELOPPEMENT', name: 'Coaching vente équipe' },
];

const SECTION_ICONS: Record<string, string> = {
  GESTION: '📋',
  'SÉCURITÉ': '🔒',
  'DÉVELOPPEMENT': '📈',
};

export default function Competences() {
  const [collabs, setCollabs] = useState<string[]>([]);
  const [grid, setGrid] = useState<Record<string, Record<string, Level>>>({});
  const [customOps, setCustomOps] = useState<Operation[]>([]);
  const [newCollab, setNewCollab] = useState('');
  const [newOpName, setNewOpName] = useState('');
  const [newOpSection, setNewOpSection] = useState<Operation['section']>('GESTION');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const c = localStorage.getItem('ec_collabs');
      if (c) setCollabs(JSON.parse(c));
      const g = localStorage.getItem('ec_comp_grid');
      if (g) setGrid(JSON.parse(g));
      const o = localStorage.getItem('ec_comp_custom');
      if (o) setCustomOps(JSON.parse(o));
    } catch {}
    setMounted(true);
  }, []);

  function saveAll(c: string[], g: Record<string, Record<string, Level>>, o: Operation[]) {
    setCollabs(c);
    setGrid(g);
    setCustomOps(o);
    localStorage.setItem('ec_collabs', JSON.stringify(c));
    localStorage.setItem('ec_comp_grid', JSON.stringify(g));
    localStorage.setItem('ec_comp_custom', JSON.stringify(o));
  }

  function addCollab() {
    const name = newCollab.trim();
    if (!name || collabs.includes(name)) return;
    const nc = [...collabs, name];
    saveAll(nc, grid, customOps);
    setNewCollab('');
  }

  function removeCollab(name: string) {
    const nc = collabs.filter((c) => c !== name);
    const ng = { ...grid };
    Object.keys(ng).forEach((opId) => {
      delete ng[opId][name];
    });
    saveAll(nc, ng, customOps);
  }

  function addOp() {
    const name = newOpName.trim();
    if (!name) return;
    const op: Operation = {
      id: 'custom_' + Date.now(),
      name,
      section: newOpSection,
      custom: true,
    };
    saveAll(collabs, grid, [...customOps, op]);
    setNewOpName('');
  }

  function removeOp(id: string) {
    const no = customOps.filter((o) => o.id !== id);
    const ng = { ...grid };
    delete ng[id];
    saveAll(collabs, ng, no);
  }

  function toggleLevel(opId: string, collab: string) {
    const current: Level = (grid[opId]?.[collab]) ?? '—';
    const idx = LEVELS.indexOf(current);
    const next = LEVELS[(idx + 1) % LEVELS.length];
    const ng = {
      ...grid,
      [opId]: { ...(grid[opId] ?? {}), [collab]: next },
    };
    saveAll(collabs, ng, customOps);
  }

  function getLevel(opId: string, collab: string): Level {
    return (grid[opId]?.[collab]) ?? '—';
  }

  const allOps = [...DEFAULT_OPS, ...customOps];
  const sections: Array<Operation['section']> = ['GESTION', 'SÉCURITÉ', 'DÉVELOPPEMENT'];

  // Alerts
  const alerts: string[] = [];
  allOps.forEach((op) => {
    const mastered = collabs.filter((c) => getLevel(op.id, c) === '■');
    if (mastered.length === 1) {
      alerts.push(`⚠ "${op.name}" repose sur ${mastered[0]} seul — risque dépendance`);
    }
  });
  const devOps = allOps.filter((o) => o.section === 'DÉVELOPPEMENT');
  collabs.forEach((collab) => {
    const hasDev = devOps.some((op) => {
      const lv = getLevel(op.id, collab);
      return lv === '■' || lv === '▧';
    });
    if (!hasDev) {
      alerts.push(`⚠ ${collab} : aucune compétence développement — besoin formation`);
    }
  });

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Grille de Compétences</h1>

      {/* Légende */}
      <div className="flex flex-wrap gap-2 text-xs">
        {LEVELS.map((l) => {
          const s = LEVEL_STYLES[l];
          return (
            <span key={l} className={`px-2 py-1 rounded ${s.bg} ${s.text}`}>
              {l} = {s.label}
            </span>
          );
        })}
        <span className="text-gray-500 self-center ml-2">Cliquez sur une cellule pour changer le niveau</span>
      </div>

      {/* Add collab */}
      <div className="flex gap-2">
        <input
          className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 flex-1 max-w-xs"
          value={newCollab}
          onChange={(e) => setNewCollab(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCollab()}
          placeholder="Prénom du collaborateur"
        />
        <button
          onClick={addCollab}
          disabled={!newCollab.trim()}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-500 text-black disabled:opacity-40 hover:bg-green-400 transition-colors"
        >
          + Ajouter collaborateur
        </button>
      </div>

      {/* Grid */}
      {collabs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Ajoutez des collaborateurs pour commencer.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left p-3 text-gray-400 font-semibold min-w-[220px]">Opération</th>
                {collabs.map((c) => (
                  <th key={c} className="p-3 text-center min-w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-semibold text-white">{c}</span>
                      <button
                        onClick={() => removeCollab(c)}
                        className="text-gray-500 hover:text-red-400 text-xs"
                        title="Supprimer"
                      >
                        🗑
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => {
                const sectionOps = allOps.filter((o) => o.section === section);
                return (
                  <>
                    <tr key={`section-${section}`} className="bg-gray-800/80">
                      <td
                        colSpan={collabs.length + 1}
                        className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider"
                      >
                        {SECTION_ICONS[section]} {section}
                      </td>
                    </tr>
                    {sectionOps.map((op) => (
                      <tr key={op.id} className="border-b border-gray-700/30 hover:bg-gray-800/50">
                        <td className="p-3 text-gray-200">
                          <div className="flex items-center gap-2">
                            <span>{op.name}</span>
                            {op.custom && (
                              <button
                                onClick={() => removeOp(op.id)}
                                className="text-gray-500 hover:text-red-400 text-xs ml-auto"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                        {collabs.map((collab) => {
                          const lv = getLevel(op.id, collab);
                          const s = LEVEL_STYLES[lv];
                          return (
                            <td key={collab} className="p-2 text-center">
                              <button
                                onClick={() => toggleLevel(op.id, collab)}
                                className={`w-10 h-10 rounded-lg text-base font-bold ${s.bg} ${s.text} hover:opacity-80 transition-opacity`}
                                title={s.label}
                              >
                                {lv}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add operation */}
      <div className="bg-gray-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-400">+ Ajouter une opération</h3>
        <div className="flex gap-2 flex-wrap">
          <input
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 flex-1 min-w-[200px]"
            value={newOpName}
            onChange={(e) => setNewOpName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addOp()}
            placeholder="Nom de l'opération"
          />
          <select
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
            value={newOpSection}
            onChange={(e) => setNewOpSection(e.target.value as Operation['section'])}
          >
            <option value="GESTION">GESTION</option>
            <option value="SÉCURITÉ">SÉCURITÉ</option>
            <option value="DÉVELOPPEMENT">DÉVELOPPEMENT</option>
          </select>
          <button
            onClick={addOp}
            disabled={!newOpName.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-600 text-white disabled:opacity-40 hover:bg-gray-500 transition-colors"
          >
            Ajouter
          </button>
        </div>
      </div>

      {/* Summary & Alerts */}
      {collabs.length > 0 && (
        <div className="space-y-4">
          {/* Per-collab summary */}
          <div className="bg-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Résumé</h3>
            <div className="flex flex-wrap gap-4">
              {collabs.map((collab) => {
                const total = allOps.length;
                const mastered = allOps.filter((op) => getLevel(op.id, collab) === '■').length;
                return (
                  <div key={collab} className="text-sm">
                    <span className="font-semibold text-white">{collab}</span>
                    <span className="text-gray-400"> — </span>
                    <span className="text-green-400 font-semibold">{mastered}/{total}</span>
                    <span className="text-gray-400"> maîtrisées</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Alerts */}
          {alerts.length > 0 && (
            <div className="bg-red-950 border border-red-800 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider">Alertes</h3>
              {alerts.map((a, i) => (
                <p key={i} className="text-sm text-red-300">{a}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

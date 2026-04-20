'use client';

import { useState } from 'react';

interface Props { magasinNom: string; }

interface Collaborateur {
  id: string;
  prenom: string;
  poste: string;
  competences: Record<string, number>; // 0-3
}

const DOMAINES = [
  {
    titre: 'Achat / Estimation',
    competences: ['Téléphonie', 'Consoles & JV', 'PC & Tablettes', 'Piceasoft', 'Négociation achat'],
  },
  {
    titre: 'Vente & Commerce',
    competences: ['Accueil client', 'Méthode VPD', 'Ventes additionnelles', 'Estaly', 'Tenue caisse'],
  },
  {
    titre: 'Digital & Web',
    competences: ['Annonces EC.fr', 'Photos produit', 'Gestion commandes web', 'Avis Google', 'Réseaux sociaux'],
  },
  {
    titre: 'Gestion & Process',
    competences: ['Intranet EC', 'EasyTraining', 'Inventaire', 'Démarque', 'Ouverture/Fermeture'],
  },
];

const ALL_COMPETENCES = DOMAINES.flatMap(d => d.competences);
const TOTAL = ALL_COMPETENCES.length;

// Level 0: gray (none), 1: blue (knowledge), 2: yellow (occasional), 3: green (mastered)
const CELL_BG = ['bg-gray-700', 'bg-blue-400', 'bg-yellow-400', 'bg-green-500'];
const LEVEL_LABELS = ['Aucune', 'Connaissance', 'Pratique', 'Maîtrise'];
const AVG_COLOR = (avg: number) =>
  avg >= 2.5 ? 'text-green-400' : avg >= 1.5 ? 'text-yellow-400' : avg >= 0.5 ? 'text-blue-400' : 'text-gray-500';

function uid() { return Math.random().toString(36).slice(2); }

export default function Competences({ magasinNom }: Props) {
  const storageKey = `comp_${magasinNom}`;

  const [collab, setCollab] = useState<Collaborateur[]>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
      if (!s) return [];
      // Migrate old data: clamp values to 0-3
      const parsed = JSON.parse(s) as Collaborateur[];
      return parsed.map(c => ({
        ...c,
        competences: Object.fromEntries(
          Object.entries(c.competences).map(([k, v]) => [k, Math.min(v, 3)])
        ),
      }));
    } catch { return []; }
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [newPrenom, setNewPrenom] = useState('');
  const [newPoste, setNewPoste] = useState('');

  function save(rows: Collaborateur[]) {
    setCollab(rows);
    localStorage.setItem(storageKey, JSON.stringify(rows));
  }

  function addCollab() {
    if (!newPrenom.trim()) return;
    const empty: Record<string, number> = {};
    ALL_COMPETENCES.forEach(c => { empty[c] = 0; });
    save([...collab, { id: uid(), prenom: newPrenom.trim(), poste: newPoste.trim(), competences: empty }]);
    setNewPrenom(''); setNewPoste(''); setShowAddForm(false);
  }

  function delCollab(id: string) { save(collab.filter(c => c.id !== id)); }

  function cycleLevel(collabId: string, competence: string) {
    save(collab.map(c =>
      c.id === collabId
        ? { ...c, competences: { ...c.competences, [competence]: ((c.competences[competence] ?? 0) + 1) % 4 } }
        : c
    ));
  }

  // Average per competence
  const avgByComp: Record<string, number> = {};
  ALL_COMPETENCES.forEach(comp => {
    const vals = collab.map(c => c.competences[comp] ?? 0);
    avgByComp[comp] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  });

  // Analysis: dependency risk (exactly 1 person at level 3)
  const dependencyAlerts: Array<{ comp: string; prenom: string }> = [];
  ALL_COMPETENCES.forEach(comp => {
    const masters = collab.filter(c => (c.competences[comp] ?? 0) === 3);
    if (masters.length === 1) dependencyAlerts.push({ comp, prenom: masters[0].prenom });
  });

  // Analysis: no mastery alerts
  const noMasteryAlerts = collab.filter(c =>
    ALL_COMPETENCES.every(comp => (c.competences[comp] ?? 0) < 3)
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Compétences — {magasinNom || 'Magasin'}</h2>
          <p className="text-sm text-gray-400">{collab.length} collaborateur{collab.length > 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-green-600 hover:bg-green-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
        >
          + Collaborateur
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-gray-800 rounded-xl p-4 flex flex-wrap gap-3 items-end border border-gray-600">
          <div>
            <label className="text-xs text-gray-400">Prénom *</label>
            <input
              value={newPrenom}
              onChange={e => setNewPrenom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCollab()}
              className="block bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1 w-40"
              placeholder="Prénom"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Poste</label>
            <input
              value={newPoste}
              onChange={e => setNewPoste(e.target.value)}
              className="block bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1 w-40"
              placeholder="Vendeur, Resp..."
            />
          </div>
          <button onClick={addCollab} className="bg-green-600 hover:bg-green-500 text-white text-xs font-semibold px-3 py-2 rounded-lg">Ajouter</button>
          <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-white text-xs px-2 py-2">Annuler</button>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-400">
        {LEVEL_LABELS.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`w-4 h-4 rounded-sm ${CELL_BG[i]}`} />
            <span>{i} — {l}</span>
          </div>
        ))}
        <span className="text-gray-500 ml-2">Cliquer pour changer de niveau</span>
      </div>

      {collab.length === 0 ? (
        <div className="text-center text-gray-500 text-sm py-10">Ajoutez vos collaborateurs pour cartographier les compétences.</div>
      ) : (
        <div className="space-y-4">
          {/* Per-person summary */}
          <div className="flex flex-wrap gap-2">
            {collab.map(c => {
              const mastered = ALL_COMPETENCES.filter(comp => (c.competences[comp] ?? 0) === 3).length;
              return (
                <div key={c.id} className="bg-gray-800 rounded-lg px-3 py-2 text-xs">
                  <span className="text-gray-300 font-semibold">{c.prenom}</span>
                  {c.poste && <span className="text-gray-500 ml-1">({c.poste})</span>}
                  <span className={`ml-2 font-bold ${mastered >= TOTAL * 0.7 ? 'text-green-400' : mastered >= TOTAL * 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {mastered}/{TOTAL} maîtrisées
                  </span>
                </div>
              );
            })}
          </div>

          {/* Grids by domain */}
          {DOMAINES.map(domaine => (
            <div key={domaine.titre} className="bg-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700">
                <h3 className="font-semibold text-sm">{domaine.titre}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left px-3 py-2 text-gray-400 font-medium w-36">Compétence</th>
                      {collab.map(c => (
                        <th key={c.id} className="px-2 py-2 text-center font-medium text-gray-300 min-w-[70px]">
                          <div>{c.prenom}</div>
                          {c.poste && <div className="text-gray-500 font-normal">{c.poste}</div>}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-center text-gray-400 font-medium">Moy.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {domaine.competences.map(comp => (
                      <tr key={comp} className="hover:bg-gray-750">
                        <td className="px-3 py-2 text-gray-300">{comp}</td>
                        {collab.map(c => {
                          const lvl = c.competences[comp] ?? 0;
                          return (
                            <td key={c.id} className="px-2 py-2 text-center">
                              <button
                                onClick={() => cycleLevel(c.id, comp)}
                                title={`${LEVEL_LABELS[lvl]} — cliquer pour changer`}
                                className={`w-7 h-7 rounded-sm ${CELL_BG[lvl]} hover:opacity-80 transition-opacity mx-auto block`}
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-center">
                          <span className={`font-semibold ${AVG_COLOR(avgByComp[comp])}`}>
                            {avgByComp[comp] > 0 ? avgByComp[comp].toFixed(1) : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Analysis alerts */}
          {(dependencyAlerts.length > 0 || noMasteryAlerts.length > 0) && (
            <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-red-300 mb-2">Alertes équipe</p>
              {dependencyAlerts.map(a => (
                <p key={`dep-${a.comp}`} className="text-xs text-red-200">
                  ⚠ <strong>{a.comp}</strong> repose sur <strong>{a.prenom}</strong> seul — risque dépendance
                </p>
              ))}
              {noMasteryAlerts.map(c => (
                <p key={`nm-${c.id}`} className="text-xs text-red-200">
                  ⚠ <strong>{c.prenom}</strong> : aucune compétence maîtrisée — besoin formation
                </p>
              ))}
            </div>
          )}

          {/* Delete collaborateurs */}
          <div className="flex flex-wrap gap-2 pt-1">
            {collab.map(c => (
              <div key={c.id} className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2 py-1">
                <span className="text-xs text-gray-300">{c.prenom}</span>
                <button onClick={() => delCollab(c.id)} className="text-gray-500 hover:text-red-400 text-xs">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';

interface Props { magasinNom: string; }

interface Collaborateur {
  id: string;
  prenom: string;
  poste: string;
  competences: Record<string, number>; // 0-4
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

const LEVEL_LABELS = ['—', 'Débutant', 'En cours', 'Maîtrise', 'Expert'];
const LEVEL_COLORS = ['bg-gray-700', 'bg-red-900', 'bg-yellow-900', 'bg-blue-900', 'bg-green-900'];
const LEVEL_TEXT = ['text-gray-500', 'text-red-400', 'text-yellow-400', 'text-blue-400', 'text-green-400'];

function uid() { return Math.random().toString(36).slice(2); }

export default function Competences({ magasinNom }: Props) {
  const storageKey = `comp_${magasinNom}`;

  const [collab, setCollab] = useState<Collaborateur[]>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
      return s ? JSON.parse(s) as Collaborateur[] : [];
    } catch { return []; }
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [newPrenom, setNewPrenom] = useState('');
  const [newPoste, setNewPoste] = useState('');
  const [view, setView] = useState<'grid' | 'radar'>('grid');

  function save(rows: Collaborateur[]) {
    setCollab(rows);
    localStorage.setItem(storageKey, JSON.stringify(rows));
  }

  function addCollab() {
    if (!newPrenom.trim()) return;
    const empty: Record<string, number> = {};
    ALL_COMPETENCES.forEach(c => { empty[c] = 0; });
    save([...collab, { id: uid(), prenom: newPrenom.trim(), poste: newPoste.trim(), competences: empty }]);
    setNewPrenom('');
    setNewPoste('');
    setShowAddForm(false);
  }

  function delCollab(id: string) { save(collab.filter(c => c.id !== id)); }

  function setLevel(collabId: string, competence: string, level: number) {
    save(collab.map(c => c.id === collabId ? { ...c, competences: { ...c.competences, [competence]: level } } : c));
  }

  // Summary: average level per competence across all collabs
  const avgByComp: Record<string, number> = {};
  ALL_COMPETENCES.forEach(comp => {
    const vals = collab.map(c => c.competences[comp] ?? 0).filter(v => v > 0);
    avgByComp[comp] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  });

  // Gaps: competences below 2 for majority of collabs
  const gaps = ALL_COMPETENCES.filter(c => collab.length > 0 && avgByComp[c] < 2);

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

      {/* Gaps */}
      {gaps.length > 0 && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-red-300 mb-1">Points de fragilité équipe</p>
          <div className="flex flex-wrap gap-1.5">
            {gaps.map(g => (
              <span key={g} className="bg-red-900/50 text-red-300 text-xs px-2 py-0.5 rounded-full">{g}</span>
            ))}
          </div>
        </div>
      )}

      {collab.length === 0 ? (
        <div className="text-center text-gray-500 text-sm py-10">Ajoutez vos collaborateurs pour cartographier les compétences.</div>
      ) : (
        <div className="space-y-6">
          {DOMAINES.map(domaine => (
            <div key={domaine.titre} className="bg-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700 bg-gray-750">
                <h3 className="font-semibold text-sm">{domaine.titre}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left px-3 py-2 text-gray-400 font-medium w-32">Compétence</th>
                      {collab.map(c => (
                        <th key={c.id} className="px-2 py-2 text-center font-medium text-gray-300 min-w-[80px]">
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
                              <select
                                value={lvl}
                                onChange={e => setLevel(c.id, comp, parseInt(e.target.value))}
                                className={`text-xs rounded px-1 py-0.5 border-0 ${LEVEL_COLORS[lvl]} ${LEVEL_TEXT[lvl]} cursor-pointer`}
                              >
                                {LEVEL_LABELS.map((l, i) => <option key={i} value={i}>{i === 0 ? '—' : `${i} - ${l}`}</option>)}
                              </select>
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-center">
                          {collab.length > 0 && (
                            <span className={`text-xs font-semibold ${LEVEL_TEXT[Math.round(avgByComp[comp])]}`}>
                              {avgByComp[comp] > 0 ? avgByComp[comp].toFixed(1) : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Delete collaborateurs */}
          <div className="flex flex-wrap gap-2">
            {collab.map(c => (
              <div key={c.id} className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2 py-1">
                <span className="text-xs text-gray-300">{c.prenom}</span>
                <button onClick={() => delCollab(c.id)} className="text-gray-500 hover:text-red-400 text-xs">✕</button>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Niveaux : 0 = non évalué · 1 = Débutant · 2 = En cours · 3 = Maîtrise · 4 = Expert
          </p>
        </div>
      )}
    </div>
  );
}

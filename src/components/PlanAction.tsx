'use client';

import { useState } from 'react';
import type { PAPAction, MagasinData, ActionAxe, StoredStatut } from '@/types';
import { callAI, parseJSON } from '@/lib/ai';

interface Props {
  data: MagasinData;
  actions: PAPAction[];
  onSave: (a: PAPAction[]) => void;
}

const AXE_OPTIONS: ActionAxe[] = ['Stock', 'Commerce', 'Management', 'Web', 'Transverse'];
const STATUT_OPTIONS: StoredStatut[] = ['À faire', 'En cours', 'Fait'];

const EMPTY_FORM: Omit<PAPAction, 'id'> = {
  titre: '',
  axe: 'Stock',
  pilote: '',
  copilote: '',
  description: '',
  echeance: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().slice(0, 10),
  priorite: 2,
  gain: 0,
  statut: 'À faire',
};

type DisplayStatut = StoredStatut | 'Retard';

function getDisplayStatut(a: PAPAction): DisplayStatut {
  const today = new Date().toISOString().slice(0, 10);
  if (a.statut !== 'Fait' && a.echeance < today) return 'Retard';
  return a.statut;
}

const STATUT_COLORS: Record<DisplayStatut, { bg: string; text: string; border: string }> = {
  'Fait':    { bg: 'bg-green-900/60',  text: 'text-green-300',  border: 'border-green-700' },
  'En cours':{ bg: 'bg-blue-900/60',   text: 'text-blue-300',   border: 'border-blue-700' },
  'À faire': { bg: 'bg-orange-900/60', text: 'text-orange-300', border: 'border-orange-700' },
  'Retard':  { bg: 'bg-red-900/60',    text: 'text-red-300',    border: 'border-red-700' },
};

function getMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

interface AIGeneratedAction {
  titre: string;
  axe?: string;
  pilote?: string;
  description?: string;
  echeance?: string;
  priorite?: number;
  gain?: number;
}

export default function PlanAction({ data, actions, onSave }: Props) {
  const [form, setForm] = useState<Omit<PAPAction, 'id'>>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterAxe, setFilterAxe] = useState<ActionAxe | 'Tous'>('Tous');
  const [filterStatut, setFilterStatut] = useState<DisplayStatut | 'Tous'>('Tous');
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  function setF<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function save(list: PAPAction[]) {
    onSave(list);
  }

  function handleAdd() {
    if (!form.titre.trim()) return;
    if (editId) {
      save(actions.map((a) => (a.id === editId ? { ...form, id: editId } : a)));
      setEditId(null);
    } else {
      save([...actions, { ...form, id: Date.now().toString() }]);
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  function handleEdit(a: PAPAction) {
    setForm({
      titre: a.titre, axe: a.axe, pilote: a.pilote, copilote: a.copilote,
      description: a.description, echeance: a.echeance, priorite: a.priorite,
      gain: a.gain, statut: a.statut,
    });
    setEditId(a.id);
    setShowForm(true);
  }

  function handleDelete(id: string) {
    save(actions.filter((a) => a.id !== id));
    if (editId === id) { setEditId(null); setShowForm(false); }
  }

  function updateStatut(id: string, statut: StoredStatut) {
    save(actions.map((a) => (a.id === id ? { ...a, statut } : a)));
  }

  async function generateAI() {
    setAiLoading(true);
    setAiError('');
    try {
      const system = `Tu es consultant terrain EasyCash. Génère 3 à 5 actions prioritaires basées sur les KPIs. Retourne UNIQUEMENT ce JSON (sans markdown) :
{"actions":[{"titre":"","axe":"Stock","pilote":"Responsable","description":"","echeance":"2026-06-01","priorite":1,"gain":0}]}`;
      const message = `Magasin: ${data.magasin} (${data.phase})
KPIs: GMROI ${data.gmroi} | Stock âgé ${data.stockAge}% | Masse sal ${data.masseSalarialePct}% | Estaly ${data.estalyParSemaine}/sem | Note Google ${data.noteGoogle} | Top20 traité: ${data.top20Traite ? 'oui' : 'non'}
Actions existantes: ${actions.length}`;
      const raw = await callAI(system, message);
      const parsed = parseJSON<{ actions: AIGeneratedAction[] }>(raw);
      if (parsed?.actions) {
        const newActions: PAPAction[] = parsed.actions.map((a) => ({
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          titre: a.titre || 'Action IA',
          axe: (AXE_OPTIONS.includes(a.axe as ActionAxe) ? a.axe : 'Transverse') as ActionAxe,
          pilote: a.pilote || '',
          copilote: '',
          description: a.description || '',
          echeance: a.echeance || new Date(new Date().getFullYear(), new Date().getMonth() + 2, 1).toISOString().slice(0, 10),
          priorite: ([1, 2, 3].includes(Number(a.priorite)) ? Number(a.priorite) : 2) as 1 | 2 | 3,
          gain: Number(a.gain) || 0,
          statut: 'À faire',
        }));
        save([...actions, ...newActions]);
      } else {
        setAiError('Réponse IA invalide. Réessayez.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      setAiError(msg.includes('503') || msg.includes('configurée') ? '🔑 Clé API non configurée.' : msg);
    } finally {
      setAiLoading(false);
    }
  }

  // Filtered list
  const today = new Date().toISOString().slice(0, 10);
  const filtered = actions
    .filter((a) => filterAxe === 'Tous' || a.axe === filterAxe)
    .filter((a) => {
      if (filterStatut === 'Tous') return true;
      return getDisplayStatut(a) === filterStatut;
    })
    .sort((a, b) => a.priorite - b.priorite);

  const months = getMonths();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold">Plan d'Action</h1>
        <div className="flex gap-2">
          <button
            onClick={generateAI}
            disabled={aiLoading || !data.magasin}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ background: '#f59e0b', color: '#000' }}
            title={!data.magasin ? 'Configurez votre magasin d\'abord' : ''}
          >
            {aiLoading ? '⏳ Génération...' : '✨ Générer actions IA'}
          </button>
          <button
            onClick={() => { setForm(EMPTY_FORM); setEditId(null); setShowForm(!showForm); }}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-500 text-black hover:bg-green-400 transition-colors"
          >
            + Nouvelle action
          </button>
        </div>
      </div>

      {aiError && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-red-300 text-sm">{aiError}</div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400">{editId ? 'Modifier l\'action' : 'Nouvelle action'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Titre *</label>
              <input
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                value={form.titre}
                onChange={(e) => setF('titre', e.target.value)}
                placeholder="Titre de l'action"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Axe stratégique</label>
              <select
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                value={form.axe}
                onChange={(e) => setF('axe', e.target.value as ActionAxe)}
              >
                {AXE_OPTIONS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Pilote</label>
              <input
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                value={form.pilote}
                onChange={(e) => setF('pilote', e.target.value)}
                placeholder="Qui porte l'action"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Copilote</label>
              <input
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                value={form.copilote}
                onChange={(e) => setF('copilote', e.target.value)}
                placeholder="Qui aide"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Description (quoi faire concrètement)</label>
              <textarea
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 resize-none"
                rows={2}
                value={form.description}
                onChange={(e) => setF('description', e.target.value)}
                placeholder="Actions concrètes..."
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Échéance</label>
              <input
                type="date"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                value={form.echeance}
                onChange={(e) => setF('echeance', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Priorité</label>
                <select
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  value={form.priorite}
                  onChange={(e) => setF('priorite', Number(e.target.value) as 1 | 2 | 3)}
                >
                  <option value={1}>1 — Urgent</option>
                  <option value={2}>2 — Important</option>
                  <option value={3}>3 — À planifier</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Gain estimé (€)</label>
                <input
                  type="number"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  value={form.gain || ''}
                  onChange={(e) => setF('gain', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleAdd}
              disabled={!form.titre.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-500 text-black disabled:opacity-40"
            >
              {editId ? 'Mettre à jour' : 'Ajouter'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditId(null); }}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-700 text-gray-200 hover:bg-gray-600"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {actions.length > 0 && (
        <div className="bg-gray-800 rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Timeline 6 mois</h2>
          <div className="overflow-x-auto">
            <div className="flex gap-3 min-w-max pb-2">
              {months.map((m) => {
                const mActions = actions.filter((a) => a.echeance.startsWith(m));
                const label = new Date(m + '-02').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
                return (
                  <div key={m} className="w-40 flex-shrink-0">
                    <div className="text-xs font-semibold text-gray-400 mb-2 text-center">{label}</div>
                    <div className="space-y-1.5">
                      {mActions.map((a) => {
                        const ds = getDisplayStatut(a);
                        const sc = STATUT_COLORS[ds];
                        const borderStyle = a.priorite === 1
                          ? 'border-2'
                          : a.priorite === 3
                          ? 'border border-dashed'
                          : 'border';
                        return (
                          <button
                            key={a.id}
                            onClick={() => setSelectedAction(selectedAction === a.id ? null : a.id)}
                            className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium truncate ${sc.bg} ${sc.text} ${borderStyle} ${sc.border} hover:opacity-80 transition-opacity`}
                            title={a.titre}
                          >
                            {a.titre}
                          </button>
                        );
                      })}
                      {mActions.length === 0 && (
                        <div className="text-xs text-gray-700 text-center py-2">—</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Selected action detail */}
          {selectedAction && (() => {
            const a = actions.find((x) => x.id === selectedAction);
            if (!a) return null;
            const ds = getDisplayStatut(a);
            return (
              <div className="mt-4 pt-4 border-t border-gray-700 text-sm space-y-1">
                <p><strong className="text-gray-400">Titre :</strong> {a.titre}</p>
                <p><strong className="text-gray-400">Pilote :</strong> {a.pilote || '—'} | <strong className="text-gray-400">Copilote :</strong> {a.copilote || '—'}</p>
                {a.description && <p><strong className="text-gray-400">Description :</strong> {a.description}</p>}
                <p>
                  <strong className="text-gray-400">Statut :</strong>{' '}
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUT_COLORS[ds].bg} ${STATUT_COLORS[ds].text}`}>{ds}</span>{' '}
                  | <strong className="text-gray-400">Gain :</strong>{' '}
                  <span className="text-green-400">+{a.gain.toLocaleString('fr-FR')} €</span>
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          value={filterAxe}
          onChange={(e) => setFilterAxe(e.target.value as ActionAxe | 'Tous')}
        >
          <option value="Tous">Tous les axes</option>
          {AXE_OPTIONS.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value as DisplayStatut | 'Tous')}
        >
          <option value="Tous">Tous les statuts</option>
          {['À faire', 'En cours', 'Fait', 'Retard'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="text-gray-500 text-sm self-center">{filtered.length} action(s)</span>
      </div>

      {/* Action List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {actions.length === 0
            ? "Aucune action. Ajoutez-en une ou générez via l'IA."
            : 'Aucune action correspond aux filtres.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const ds = getDisplayStatut(a);
            const sc = STATUT_COLORS[ds];
            const isLate = ds === 'Retard';
            return (
              <div
                key={a.id}
                className={`bg-gray-800 border ${isLate ? 'border-red-800' : 'border-gray-700'} rounded-xl p-4`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{a.titre}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">{a.axe}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${sc.bg} ${sc.text}`}>{ds}</span>
                      <span className="text-xs text-gray-500">P{a.priorite}</span>
                    </div>
                    {a.description && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-1">{a.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {a.pilote && <span>👤 {a.pilote}{a.copilote ? ` / ${a.copilote}` : ''}</span>}
                      <span>📅 {a.echeance}</span>
                      {a.gain > 0 && <span className="text-green-400 font-semibold">+{a.gain.toLocaleString('fr-FR')} €</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={a.statut}
                      onChange={(e) => updateStatut(a.id, e.target.value as StoredStatut)}
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none"
                    >
                      {STATUT_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <button
                      onClick={() => handleEdit(a)}
                      className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-700"
                    >
                      ✏
                    </button>
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="text-gray-500 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-gray-700"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Total gain */}
      {actions.filter((a) => a.statut !== 'Fait').length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4 flex justify-between text-sm">
          <span className="text-gray-400">Gain total potentiel (actions non terminées)</span>
          <span className="text-green-400 font-bold">
            +{actions.filter((a) => a.statut !== 'Fait').reduce((s, a) => s + a.gain, 0).toLocaleString('fr-FR')} €/an
          </span>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useRef } from 'react';
import type { MagasinData, PAPAction, ActionAxe, StoredStatut } from '@/types';

interface Props {
  data: MagasinData;
  actions: PAPAction[];
  onSave: (a: PAPAction[]) => void;
}

const AXES: ActionAxe[] = ['Stock', 'Commerce', 'Management', 'Web', 'Transverse'];
const STATUTS: StoredStatut[] = ['À faire', 'En cours', 'Fait'];
const AXE_COLOR: Record<ActionAxe, string> = {
  Stock: 'bg-blue-900 text-blue-300',
  Commerce: 'bg-yellow-900 text-yellow-300',
  Management: 'bg-purple-900 text-purple-300',
  Web: 'bg-cyan-900 text-cyan-300',
  Transverse: 'bg-gray-700 text-gray-300',
};
const STATUT_COLOR: Record<StoredStatut, string> = {
  'À faire': 'bg-gray-700 text-gray-300',
  'En cours': 'bg-blue-900 text-blue-300',
  'Fait': 'bg-green-900 text-green-300',
};
const PRIORITY_COLOR: Record<number, string> = { 1: 'text-red-400', 2: 'text-yellow-400', 3: 'text-green-400' };

function uid() { return Math.random().toString(36).slice(2); }

const EMPTY_ACTION: Omit<PAPAction, 'id'> = {
  titre: '', axe: 'Stock', pilote: '', copilote: '',
  description: '', echeance: '', priorite: 1, gain: 0, statut: 'À faire',
};

function isRetard(a: PAPAction): boolean {
  if (!a.echeance || a.statut === 'Fait') return false;
  return new Date(a.echeance) < new Date();
}

// ── Gantt Chart ──────────────────────────────────────────────────────────────
const COL_W = 90;   // px per month
const NAME_W = 140; // px for name column
const ROW_H = 30;   // px per row
const N_MONTHS = 6;

function GanttChart({ actions, onScrollTo }: {
  actions: PAPAction[];
  onScrollTo: (id: string) => void;
}) {
  const now = new Date();
  const months = Array.from({ length: N_MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return { label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) };
  });

  const [tooltip, setTooltip] = useState<{ x: number; y: number; a: PAPAction } | null>(null);

  function monthOffset(dateStr: string): number {
    if (!dateStr) return -99;
    const d = new Date(dateStr);
    return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  }

  const withEcheance = actions.filter(a => a.echeance);

  if (withEcheance.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 text-center text-sm text-gray-500 py-6">
        Ajoutez des actions avec une échéance pour afficher la timeline Gantt.
      </div>
    );
  }

  const totalW = NAME_W + N_MONTHS * COL_W;

  return (
    <div className="bg-gray-800 rounded-xl p-4 overflow-x-auto">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Timeline Gantt — 6 mois glissants
      </h3>

      <div style={{ width: totalW }}>
        {/* Month headers */}
        <div className="flex border-b border-gray-700 pb-1.5 mb-1">
          <div style={{ width: NAME_W, flexShrink: 0 }} className="text-xs text-gray-500">Action</div>
          {months.map((m, i) => (
            <div key={i} style={{ width: COL_W, flexShrink: 0 }}
              className="text-xs text-center text-gray-400 border-l border-gray-700">
              {m.label}
            </div>
          ))}
        </div>

        {/* Action rows */}
        {withEcheance
          .sort((a, b) => a.priorite - b.priorite)
          .map(action => {
            const endOffset = monthOffset(action.echeance);
            const retard = isRetard(action);

            // Bar spans from left edge to end month
            const clampedEnd = Math.min(Math.max(endOffset + 1, 0.5), N_MONTHS);
            const barW = Math.max(clampedEnd * COL_W - 4, 10);

            const barColor = action.statut === 'Fait' ? '#22c55e'
              : retard ? '#ef4444'
              : action.statut === 'En cours' ? '#3b82f6'
              : '#f97316';

            const bStyle: React.CSSProperties = {
              position: 'absolute',
              left: 2,
              top: 4,
              height: ROW_H - 8,
              width: barW,
              backgroundColor: barColor,
              borderRadius: 4,
              borderStyle: action.priorite === 3 ? 'dashed' : 'solid',
              borderWidth: action.priorite === 1 ? 2.5 : 1,
              borderColor: 'rgba(255,255,255,0.35)',
              opacity: 0.88,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            };

            return (
              <div key={action.id} className="flex items-center" style={{ height: ROW_H }}>
                {/* Name */}
                <div style={{ width: NAME_W, flexShrink: 0 }}
                  className="text-xs text-gray-300 truncate pr-2" title={action.titre}>
                  <span className={`font-bold mr-1 ${PRIORITY_COLOR[action.priorite]}`}>P{action.priorite}</span>
                  {action.titre}
                </div>
                {/* Chart area */}
                <div style={{ width: N_MONTHS * COL_W, height: ROW_H, position: 'relative', flexShrink: 0 }}>
                  {/* Grid lines */}
                  {months.map((_, i) => (
                    <div key={i} style={{
                      position: 'absolute', left: i * COL_W, top: 0, bottom: 0,
                      borderLeft: '1px solid rgba(75,85,99,0.4)',
                    }} />
                  ))}
                  {/* Bar */}
                  <div
                    style={bStyle}
                    onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, a: action })}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => { setTooltip(null); onScrollTo(action.id); }}
                  />
                </div>
              </div>
            );
          })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
        {[
          { color: '#f97316', label: 'À faire' },
          { color: '#3b82f6', label: 'En cours' },
          { color: '#22c55e', label: 'Fait' },
          { color: '#ef4444', label: 'Retard' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1">
            <span style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 2, backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
        <span className="ml-2">P1=bordure épaisse · P3=pointillés · Clic=voir action</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="fixed z-50 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 shadow-xl pointer-events-none text-xs"
          style={{ left: tooltip.x + 14, top: tooltip.y - 56 }}>
          <div className="font-semibold text-white mb-0.5">{tooltip.a.titre}</div>
          {tooltip.a.pilote && <div className="text-gray-400">👤 {tooltip.a.pilote}{tooltip.a.copilote ? ` / ${tooltip.a.copilote}` : ''}</div>}
          {tooltip.a.echeance && <div className="text-gray-400">📅 {new Date(tooltip.a.echeance).toLocaleDateString('fr-FR')}</div>}
          {tooltip.a.gain > 0 && <div className="text-green-400">+{tooltip.a.gain.toLocaleString('fr-FR')} €</div>}
          <div className="text-gray-600 mt-0.5 text-[10px]">Cliquer pour voir l&apos;action</div>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function PlanAction({ data, actions, onSave }: Props) {
  const [form, setForm] = useState<Omit<PAPAction, 'id'>>(EMPTY_ACTION);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterAxe, setFilterAxe] = useState<ActionAxe | 'Tous'>('Tous');
  const [filterStatut, setFilterStatut] = useState<StoredStatut | 'Tous'>('Tous');
  const listRef = useRef<HTMLDivElement>(null);

  function save() {
    if (!form.titre.trim()) return;
    if (editId) {
      onSave(actions.map(a => a.id === editId ? { ...form, id: editId } : a));
    } else {
      onSave([...actions, { ...form, id: uid() }]);
    }
    setForm(EMPTY_ACTION);
    setEditId(null);
    setShowForm(false);
  }

  function del(id: string) { onSave(actions.filter(a => a.id !== id)); }

  function edit(a: PAPAction) {
    setForm({ titre: a.titre, axe: a.axe, pilote: a.pilote, copilote: a.copilote,
      description: a.description, echeance: a.echeance, priorite: a.priorite, gain: a.gain, statut: a.statut });
    setEditId(a.id);
    setShowForm(true);
  }

  function updateStatut(id: string, statut: StoredStatut) {
    onSave(actions.map(a => a.id === id ? { ...a, statut } : a));
  }

  function scrollToAction(id: string) {
    const el = document.getElementById(`action-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-green-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-green-400'), 1800);
    }
  }

  const filtered = actions.filter(a =>
    (filterAxe === 'Tous' || a.axe === filterAxe) &&
    (filterStatut === 'Tous' || a.statut === filterStatut)
  );

  const counts = { faire: 0, cours: 0, fait: 0, retard: 0 };
  actions.forEach(a => {
    if (a.statut === 'À faire') counts.faire++;
    else if (a.statut === 'En cours') counts.cours++;
    else if (a.statut === 'Fait') counts.fait++;
    if (isRetard(a)) counts.retard++;
  });

  const totalGain = actions.filter(a => a.statut !== 'Fait').reduce((s, a) => s + (a.gain || 0), 0);

  return (
    <div className="space-y-5">
      {/* Gantt timeline */}
      <GanttChart actions={actions} onScrollTo={scrollToAction} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'À faire', val: counts.faire, color: 'text-gray-300' },
          { label: 'En cours', val: counts.cours, color: 'text-blue-400' },
          { label: 'Terminées', val: counts.fait, color: 'text-green-400' },
          { label: 'En retard', val: counts.retard, color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-800 rounded-xl p-3 text-center">
            <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
            <div className="text-xs text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>

      {totalGain > 0 && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl px-4 py-3 text-sm text-green-300">
          Gain potentiel total des actions en cours / à faire : <strong>+{totalGain.toLocaleString('fr-FR')} €</strong>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterAxe}
            onChange={e => setFilterAxe(e.target.value as ActionAxe | 'Tous')}
            className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white"
          >
            <option value="Tous">Tous les axes</option>
            {AXES.map(ax => <option key={ax} value={ax}>{ax}</option>)}
          </select>
          <select
            value={filterStatut}
            onChange={e => setFilterStatut(e.target.value as StoredStatut | 'Tous')}
            className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white"
          >
            <option value="Tous">Tous les statuts</option>
            {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button
          onClick={() => { setForm(EMPTY_ACTION); setEditId(null); setShowForm(true); }}
          className="bg-green-600 hover:bg-green-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
        >
          + Nouvelle action
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-gray-800 rounded-xl p-4 space-y-4 border border-gray-600">
          <h3 className="font-semibold text-sm">{editId ? 'Modifier' : 'Nouvelle action'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-400">Titre *</label>
              <input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1"
                placeholder="Titre de l'action" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Axe</label>
              <select value={form.axe} onChange={e => setForm(f => ({ ...f, axe: e.target.value as ActionAxe }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1">
                {AXES.map(ax => <option key={ax} value={ax}>{ax}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Priorité</label>
              <select value={form.priorite} onChange={e => setForm(f => ({ ...f, priorite: Number(e.target.value) as 1|2|3 }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1">
                <option value={1}>P1 — Urgente</option>
                <option value={2}>P2 — Importante</option>
                <option value={3}>P3 — Standard</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Pilote</label>
              <input value={form.pilote} onChange={e => setForm(f => ({ ...f, pilote: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1"
                placeholder="Responsable" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Co-pilote</label>
              <input value={form.copilote} onChange={e => setForm(f => ({ ...f, copilote: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1"
                placeholder="Co-responsable" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Échéance</label>
              <input type="date" value={form.echeance} onChange={e => setForm(f => ({ ...f, echeance: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Gain estimé (€)</label>
              <input type="number" value={form.gain || ''} onChange={e => setForm(f => ({ ...f, gain: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1"
                placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Statut</label>
              <select value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value as StoredStatut }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1">
                {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-400">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1 resize-none"
                placeholder="Détails de l'action..." />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setEditId(null); }}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300">Annuler</button>
            <button onClick={save}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold">Enregistrer</button>
          </div>
        </div>
      )}

      {/* Action list */}
      <div ref={listRef}>
        {filtered.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-10">Aucune action. Créez la première !</div>
        ) : (
          <div className="space-y-2">
            {filtered
              .sort((a, b) => a.priorite - b.priorite)
              .map(action => {
                const retard = isRetard(action);
                return (
                  <div
                    id={`action-${action.id}`}
                    key={action.id}
                    className={`bg-gray-800 rounded-xl p-4 border-l-4 transition-all ${
                      retard ? 'border-red-500' : action.priorite === 1 ? 'border-red-400' : action.priorite === 2 ? 'border-yellow-400' : 'border-green-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`font-semibold text-sm ${PRIORITY_COLOR[action.priorite]}`}>P{action.priorite}</span>
                          <span className="font-medium text-sm text-white truncate">{action.titre}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${AXE_COLOR[action.axe]}`}>{action.axe}</span>
                          {retard && <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-red-900 text-red-300">Retard</span>}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                          {action.pilote && <span>👤 {action.pilote}{action.copilote ? ` / ${action.copilote}` : ''}</span>}
                          {action.echeance && <span>📅 {new Date(action.echeance).toLocaleDateString('fr-FR')}</span>}
                          {action.gain > 0 && <span className="text-green-400">+{action.gain.toLocaleString('fr-FR')} €</span>}
                        </div>
                        {action.description && <p className="text-xs text-gray-400 mt-1">{action.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <select
                          value={action.statut}
                          onChange={e => updateStatut(action.id, e.target.value as StoredStatut)}
                          className={`text-xs px-2 py-1 rounded-lg border-0 font-medium ${STATUT_COLOR[action.statut]}`}
                        >
                          {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={() => edit(action)} className="text-gray-400 hover:text-white text-xs">✏️</button>
                        <button onClick={() => del(action.id)} className="text-gray-500 hover:text-red-400 text-xs">🗑</button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

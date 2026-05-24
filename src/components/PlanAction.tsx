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
  Stock: 'bg-blue-100 text-blue-700',
  Commerce: 'bg-yellow-100 text-yellow-700',
  Management: 'bg-purple-100 text-purple-700',
  Web: 'bg-cyan-100 text-cyan-700',
  Transverse: 'bg-[#F5F5F5] text-[#6B7280] border border-[#E0E0E0]',
};
const STATUT_COLOR: Record<StoredStatut, string> = {
  'À faire': 'bg-[#F5F5F5] text-[#6B7280]',
  'En cours': 'bg-blue-100 text-blue-700',
  'Fait': 'bg-green-100 text-green-700',
};
const PRIORITY_COLOR: Record<number, string> = { 1: 'text-[#E30613]', 2: 'text-orange-500', 3: 'text-green-600' };

function uid() { return Math.random().toString(36).slice(2); }

const EMPTY_ACTION: Omit<PAPAction, 'id'> = {
  titre: '', axe: 'Stock', pilote: '', copilote: '',
  description: '', lienvision: '', echeance: '', priorite: 1, gain: 0, statut: 'À faire',
};

function isRetard(a: PAPAction): boolean {
  if (!a.echeance || a.statut === 'Fait') return false;
  return new Date(a.echeance) < new Date();
}

// ── Gantt Chart ──────────────────────────────────────────────────────────────
const COL_W = 90;
const NAME_W = 140;
const ROW_H = 30;
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
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4 text-center text-sm text-[#6B7280] py-6">
        Ajoutez des actions avec une échéance pour afficher la timeline Gantt.
      </div>
    );
  }

  const totalW = NAME_W + N_MONTHS * COL_W;

  return (
    <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4 overflow-x-auto">
      <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-3">
        Timeline Gantt — 6 mois glissants
      </h3>

      <div style={{ width: totalW }}>
        <div className="flex border-b border-[#E0E0E0] pb-1.5 mb-1">
          <div style={{ width: NAME_W, flexShrink: 0 }} className="text-xs text-[#6B7280]">Action</div>
          {months.map((m, i) => (
            <div key={i} style={{ width: COL_W, flexShrink: 0 }}
              className="text-xs text-center text-[#6B7280] border-l border-[#E0E0E0]">
              {m.label}
            </div>
          ))}
        </div>

        {withEcheance
          .sort((a, b) => a.priorite - b.priorite)
          .map(action => {
            const endOffset = monthOffset(action.echeance);
            const retard = isRetard(action);
            const clampedEnd = Math.min(Math.max(endOffset + 1, 0.5), N_MONTHS);
            const barW = Math.max(clampedEnd * COL_W - 4, 10);
            const barColor = action.statut === 'Fait' ? '#22c55e'
              : retard ? '#dc2626'
              : action.statut === 'En cours' ? '#3b82f6'
              : '#f97316';

            const bStyle: React.CSSProperties = {
              position: 'absolute', left: 2, top: 4,
              height: ROW_H - 8, width: barW,
              backgroundColor: barColor, borderRadius: 4,
              borderStyle: action.priorite === 3 ? 'dashed' : 'solid',
              borderWidth: action.priorite === 1 ? 2.5 : 1,
              borderColor: 'rgba(0,0,0,0.15)',
              opacity: 0.88, cursor: 'pointer', transition: 'opacity 0.15s',
            };

            return (
              <div key={action.id} className="flex items-center" style={{ height: ROW_H }}>
                <div style={{ width: NAME_W, flexShrink: 0 }}
                  className="text-xs text-[#1A1A1A] truncate pr-2" title={action.titre}>
                  <span className={`font-bold mr-1 ${PRIORITY_COLOR[action.priorite]}`}>P{action.priorite}</span>
                  {action.titre}
                </div>
                <div style={{ width: N_MONTHS * COL_W, height: ROW_H, position: 'relative', flexShrink: 0 }}>
                  {months.map((_, i) => (
                    <div key={i} style={{
                      position: 'absolute', left: i * COL_W, top: 0, bottom: 0,
                      borderLeft: '1px solid rgba(224,224,224,0.6)',
                    }} />
                  ))}
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

      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-[#E0E0E0] text-xs text-[#6B7280]">
        {[
          { color: '#f97316', label: 'À faire' },
          { color: '#3b82f6', label: 'En cours' },
          { color: '#22c55e', label: 'Fait' },
          { color: '#dc2626', label: 'Retard' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1">
            <span style={{ display: 'inline-block', width: 14, height: 8, borderRadius: 2, backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
        <span className="ml-2">P1=bordure épaisse · P3=pointillés · Clic=voir action</span>
      </div>

      {tooltip && (
        <div className="fixed z-50 bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 shadow-xl pointer-events-none text-xs"
          style={{ left: tooltip.x + 14, top: tooltip.y - 56 }}>
          <div className="font-semibold text-[#1A1A1A] mb-0.5">{tooltip.a.titre}</div>
          {tooltip.a.pilote && <div className="text-[#6B7280]">👤 {tooltip.a.pilote}{tooltip.a.copilote ? ` / ${tooltip.a.copilote}` : ''}</div>}
          {tooltip.a.echeance && <div className="text-[#6B7280]">📅 {new Date(tooltip.a.echeance).toLocaleDateString('fr-FR')}</div>}
          {tooltip.a.gain > 0 && <div className="text-green-600">+{tooltip.a.gain.toLocaleString('fr-FR')} €</div>}
          {tooltip.a.lienvision?.trim() && <div className="text-[#6B7280] italic mt-0.5 max-w-xs">🎯 {tooltip.a.lienvision}</div>}
          <div className="text-[#9CA3AF] mt-0.5 text-[10px]">Cliquer pour voir l&apos;action</div>
        </div>
      )}
    </div>
  );
}

// ── Word export ──────────────────────────────────────────────────────────────
async function exportPAP(data: { nom: string }, actions: PAPAction[]) {
  try {
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, ShadingType } = await import('docx');

    const dateStr = new Date().toLocaleDateString('fr-FR');
    const sorted = [...actions].sort((a, b) => {
      if (a.priorite !== b.priorite) return a.priorite - b.priorite;
      if (!a.echeance && !b.echeance) return 0;
      if (!a.echeance) return 1;
      if (!b.echeance) return -1;
      return a.echeance.localeCompare(b.echeance);
    });

    const COLS = ['Titre', 'Axe', 'Pilote', 'Copilote', 'Échéance', 'Priorité', 'Gain estimé', 'Statut', 'Lien vision'];
    const headerRow = new TableRow({
      children: COLS.map(text => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'D0D0D0' },
      })),
    });

    const dataRows = sorted.map(a => new TableRow({
      children: [
        a.titre, a.axe, a.pilote || '', a.copilote || '',
        a.echeance ? new Date(a.echeance).toLocaleDateString('fr-FR') : '',
        `P${a.priorite}`,
        a.gain > 0 ? `${a.gain.toLocaleString('fr-FR')} €` : '',
        a.statut,
        a.lienvision?.trim() || '',
      ].map(text => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: String(text) })] })],
      })),
    }));

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'EASYCASH', bold: true, size: 72, color: 'E30613' })],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [new TextRun({ text: `Plan d'Action — ${data.nom} — ${dateStr}`, bold: true, size: 28 })],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ children: [] }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }),
          new Paragraph({ children: [] }),
          new Paragraph({
            children: [new TextRun({ text: 'Document généré par Cockpit EasyCash', color: '888888', italics: true })],
            alignment: AlignmentType.CENTER,
          }),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PAP_${data.nom}_${new Date().toISOString().slice(0, 10)}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(e);
    alert(`Erreur export Word : ${msg}`);
  }
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
      description: a.description, lienvision: a.lienvision ?? '', echeance: a.echeance,
      priorite: a.priorite, gain: a.gain, statut: a.statut });
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
      el.classList.add('ring-2', 'ring-[#E30613]');
      setTimeout(() => el.classList.remove('ring-2', 'ring-[#E30613]'), 1800);
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

  const inputCls = 'w-full bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] mt-1 focus:outline-none focus:border-[#E30613]';

  return (
    <div className="space-y-5">
      <GanttChart actions={actions} onScrollTo={scrollToAction} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'À faire',    val: counts.faire,  color: 'text-[#6B7280]' },
          { label: 'En cours',   val: counts.cours,  color: 'text-blue-600' },
          { label: 'Terminées',  val: counts.fait,   color: 'text-green-600' },
          { label: 'En retard',  val: counts.retard, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
            <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
            <div className="text-xs text-[#6B7280]">{s.label}</div>
          </div>
        ))}
      </div>

      {totalGain > 0 && (
        <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-3 text-sm text-green-700">
          Gain potentiel total des actions en cours / à faire : <strong>+{totalGain.toLocaleString('fr-FR')} €</strong>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterAxe}
            onChange={e => setFilterAxe(e.target.value as ActionAxe | 'Tous')}
            className="bg-white border border-[#E0E0E0] rounded-lg px-2 py-1.5 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
          >
            <option value="Tous">Tous les axes</option>
            {AXES.map(ax => <option key={ax} value={ax}>{ax}</option>)}
          </select>
          <select
            value={filterStatut}
            onChange={e => setFilterStatut(e.target.value as StoredStatut | 'Tous')}
            className="bg-white border border-[#E0E0E0] rounded-lg px-2 py-1.5 text-xs text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
          >
            <option value="Tous">Tous les statuts</option>
            {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportPAP(data, actions)}
            className="bg-white border border-[#E0E0E0] hover:bg-[#F5F5F5] text-[#1A1A1A] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            📄 Exporter PAP en Word
          </button>
          <button
            onClick={() => { setForm(EMPTY_ACTION); setEditId(null); setShowForm(true); }}
            className="bg-[#E30613] hover:bg-[#B8050F] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            + Nouvelle action
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4 space-y-4">
          <h3 className="font-semibold text-sm text-[#1A1A1A]">{editId ? 'Modifier' : 'Nouvelle action'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-[#6B7280]">Titre *</label>
              <input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
                className={inputCls} placeholder="Titre de l'action" />
            </div>
            <div>
              <label className="text-xs text-[#6B7280]">Axe</label>
              <select value={form.axe} onChange={e => setForm(f => ({ ...f, axe: e.target.value as ActionAxe }))}
                className={inputCls}>
                {AXES.map(ax => <option key={ax} value={ax}>{ax}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#6B7280]">Priorité</label>
              <select value={form.priorite} onChange={e => setForm(f => ({ ...f, priorite: Number(e.target.value) as 1|2|3 }))}
                className={inputCls}>
                <option value={1}>P1 — Urgente</option>
                <option value={2}>P2 — Importante</option>
                <option value={3}>P3 — Standard</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#6B7280]">Pilote</label>
              <input value={form.pilote} onChange={e => setForm(f => ({ ...f, pilote: e.target.value }))}
                className={inputCls} placeholder="Responsable" />
            </div>
            <div>
              <label className="text-xs text-[#6B7280]">Co-pilote</label>
              <input value={form.copilote} onChange={e => setForm(f => ({ ...f, copilote: e.target.value }))}
                className={inputCls} placeholder="Co-responsable" />
            </div>
            <div>
              <label className="text-xs text-[#6B7280]">Échéance</label>
              <input type="date" value={form.echeance} onChange={e => setForm(f => ({ ...f, echeance: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-[#6B7280]">Gain estimé (€)</label>
              <input type="number" value={form.gain || ''} onChange={e => setForm(f => ({ ...f, gain: parseFloat(e.target.value) || 0 }))}
                className={inputCls} placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-[#6B7280]">Statut</label>
              <select value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value as StoredStatut }))}
                className={inputCls}>
                {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-[#6B7280]">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className={`${inputCls} resize-none`}
                placeholder="Détails de l'action..." />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-[#6B7280]">🎯 Lien avec ma vision <span className="text-[#E30613]">*</span></label>
              <textarea
                value={form.lienvision ?? ''}
                onChange={e => setForm(f => ({ ...f, lienvision: e.target.value.slice(0, 200) }))}
                rows={2}
                maxLength={200}
                className={`${inputCls} resize-none`}
                placeholder="En quoi cette action sert votre vision, vos valeurs ou votre cap commercial ?"
              />
              <div className="text-right text-xs text-[#9CA3AF] mt-0.5">{(form.lienvision ?? '').length}/200</div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setEditId(null); }}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-[#E0E0E0] hover:bg-[#F5F5F5] text-[#6B7280] transition-colors">Annuler</button>
            <button onClick={save}
              className="text-xs px-3 py-1.5 rounded-lg bg-[#E30613] hover:bg-[#B8050F] text-white font-semibold transition-colors">Enregistrer</button>
          </div>
        </div>
      )}

      {/* Action list */}
      <div ref={listRef}>
        {filtered.length === 0 ? (
          <div className="text-center text-[#6B7280] text-sm py-10">Aucune action. Créez la première !</div>
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
                    className={`bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4 border-l-4 transition-all ${
                      retard ? 'border-l-red-500' : action.priorite === 1 ? 'border-l-[#E30613]' : action.priorite === 2 ? 'border-l-orange-400' : 'border-l-green-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`font-semibold text-sm ${PRIORITY_COLOR[action.priorite]}`}>P{action.priorite}</span>
                          <span className="font-medium text-sm text-[#1A1A1A] truncate">{action.titre}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${AXE_COLOR[action.axe]}`}>{action.axe}</span>
                          {retard && <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-red-100 text-red-700">Retard</span>}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-[#6B7280]">
                          {action.pilote && <span>👤 {action.pilote}{action.copilote ? ` / ${action.copilote}` : ''}</span>}
                          {action.echeance && <span>📅 {new Date(action.echeance).toLocaleDateString('fr-FR')}</span>}
                          {action.gain > 0 && <span className="text-green-600">+{action.gain.toLocaleString('fr-FR')} €</span>}
                        </div>
                        {action.description && <p className="text-xs text-[#6B7280] mt-1">{action.description}</p>}
                        {action.lienvision?.trim() ? (
                          <p className="text-xs italic text-[#6B7280] mt-1">🎯 {action.lienvision}</p>
                        ) : (
                          <p className="text-xs italic text-[#E30613] mt-1">🎯 Lien avec votre vision à préciser</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <select
                          value={action.statut}
                          onChange={e => updateStatut(action.id, e.target.value as StoredStatut)}
                          className={`text-xs px-2 py-1 rounded-lg border-0 font-medium ${STATUT_COLOR[action.statut]}`}
                        >
                          {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={() => edit(action)} className="text-[#6B7280] hover:text-[#1A1A1A] text-xs">✏️</button>
                        <button onClick={() => del(action.id)} className="text-[#6B7280] hover:text-red-600 text-xs">🗑</button>
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

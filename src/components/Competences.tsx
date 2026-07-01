'use client';

import { useState } from 'react';
import type { PAPAction } from '@/types';
import CommentaireConsultant from './CommentaireConsultant';
import NotesReunion from './NotesReunion';
import PhraseExplicative from './PhraseExplicative';

interface Props { magasinNom: string; onAddAction?: (action: PAPAction) => void; }

interface Collaborateur {
  id: string;
  prenom: string;
  poste: string;
  competences: Record<string, number>; // 0-2
}

interface GridConfig {
  deletedComps: string[];
  customLabels: Record<string, string>;
  customComps: Array<{ id: string; domaineIdx: number; label: string }>;
}

const DEFAULT_GRID: GridConfig = { deletedComps: [], customLabels: {}, customComps: [] };

const DOMAINES = [
  {
    titre: '🤝 Achat au comptoir',
    competences: [
      'Application de la VPD (5 questions)',
      'Test produit technique (Piceasoft, contrôle visuel, accessoires)',
      "Évaluation et rachat de l'or (test, pesée, négociation)",
      'Évaluation bijouterie hors-or (estimation valeur)',
      'Évaluation produits techniques (téléphonie, console, informatique)',
      'Négociation au comptoir',
      "Édition d'un appel de stock",
    ],
  },
  {
    titre: '🛒 Vente en magasin',
    competences: [
      'Découverte client et qualification du besoin',
      'Argumentation produit avec réassurance (garantie, paiement, test)',
      'Vente d\'accessoires complémentaires (proposition systématique)',
      'Vente d\'assurance / extension de garantie Estaly',
      "Gestion d'objection client",
      'Encaissement et embasage',
    ],
  },
  {
    titre: '🌐 Web & Digital',
    competences: [
      'Mise en ligne produit via EasyBiz (photos, description)',
      'Gestion des commandes web (préparation, expédition)',
      'Réponse aux avis Google',
      'Suivi du Dashboard web (annulations, satisfaction)',
    ],
  },
  {
    titre: '📦 Stock & Pilotage',
    competences: [
      "Lecture des côtes d'accélération (anticipation, accélération, alerte)",
      'Mise à jour des prix via cote EasyPrice',
      'Réalisation d\'un inventaire tournant',
      'Traitement du TOP 20 vieux stock',
      'Gestion d\'un SAV client (process complet)',
    ],
  },
  {
    titre: '👥 Management',
    competences: [
      "Briefing matinal d'équipe",
      'Coaching individuel en vente',
      'Conduite d\'entretien individuel mensuel',
      'Utilisation de l\'Intranet réseau (stats, suivi)',
    ],
  },
];

// Level 0: red (none), 1: orange (occasional), 2: green (mastered)
const CELL_BG = ['bg-red-500', 'bg-orange-400', 'bg-green-500'];
const LEVEL_LABELS = ['Aucune', 'Occasionnelle', 'Maîtrisée'];
const AVG_COLOR = (avg: number) =>
  avg >= 1.5 ? 'text-green-600' : avg >= 0.5 ? 'text-orange-500' : 'text-red-600';

function uid() { return Math.random().toString(36).slice(2); }

const LEVEL_FILL = ['EF4444', 'FB923C', '22C55E'];

type CompItem = { key: string; label: string; isCustom: boolean };
type ExportDomaine = { titre: string; compItems: CompItem[] };

async function exportCompetences(magasinNom: string, collab: Collaborateur[], domaines: ExportDomaine[]) {
  try {
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, ShadingType } = await import('docx');

    const dateStr = new Date().toLocaleDateString('fr-FR');

    function makeCell(text: string, fill?: string) {
      return new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text })] })],
        ...(fill ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill } } : {}),
      });
    }

    const headerRow = new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Compétence', bold: true })] })], shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'D0D0D0' } }),
        ...collab.map(c => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c.prenom + (c.poste ? ` (${c.poste})` : ''), bold: true })] })], shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'D0D0D0' } })),
      ],
    });

    const compRows = domaines.flatMap(domaine => [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: domaine.titre, bold: true })] })],
            columnSpan: collab.length + 1,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E8E8E8' },
          }),
        ],
      }),
      ...domaine.compItems.map(ci => new TableRow({
        children: [
          makeCell(ci.label),
          ...collab.map(c => {
            const lvl = c.competences[ci.key] ?? 0;
            return makeCell(String(lvl), LEVEL_FILL[lvl]);
          }),
        ],
      })),
    ]);

    const allCompItems = domaines.flatMap(d => d.compItems);

    const dependencyAlerts: string[] = [];
    allCompItems.forEach(ci => {
      const masters = collab.filter(c => (c.competences[ci.key] ?? 0) === 2);
      if (masters.length === 1) dependencyAlerts.push(`⚠ ${ci.label} repose sur ${masters[0].prenom} seul (seul niveau 2) — risque dépendance`);
    });
    const noMasteryAlerts = collab
      .filter(c => allCompItems.every(ci => (c.competences[ci.key] ?? 0) < 2))
      .map(c => `⚠ ${c.prenom} : aucune compétence niveau 2 — besoin formation`);
    const allAlerts = [...dependencyAlerts, ...noMasteryAlerts];

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'EASYCASH', bold: true, size: 72, color: 'CC0000' })],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [new TextRun({ text: `Grille de Compétences — ${magasinNom} — ${dateStr}`, bold: true, size: 28 })],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ children: [] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...compRows],
          }),
          new Paragraph({ children: [] }),
          new Paragraph({ children: [new TextRun({ text: 'Légende : 0 = Aucune | 1 = Pratique occasionnelle | 2 = Maîtrisée', italics: true, color: '555555' })] }),
          ...(allAlerts.length > 0 ? [
            new Paragraph({ children: [] }),
            new Paragraph({ children: [new TextRun({ text: 'Alertes équipe', bold: true })] }),
            ...allAlerts.map(a => new Paragraph({ children: [new TextRun({ text: a, color: 'CC0000' })] })),
          ] : []),
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
    link.download = `Competences_${magasinNom}_${new Date().toISOString().slice(0, 10)}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(e);
    alert(`Erreur export Word : ${msg}`);
  }
}

export default function Competences({ magasinNom, onAddAction }: Props) {
  const storageKey = `comp_${magasinNom}`;
  const gridKey = `comp_grid_${magasinNom}`;

  const [collab, setCollab] = useState<Collaborateur[]>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
      if (!s) return [];
      const parsed = JSON.parse(s) as Collaborateur[];
      return parsed.map(c => ({
        ...c,
        competences: Object.fromEntries(
          Object.entries(c.competences).map(([k, v]) => [k, Math.min(v, 2)])
        ),
      }));
    } catch { return []; }
  });

  const [gridConfig, setGridConfig] = useState<GridConfig>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(gridKey) : null;
      return s ? JSON.parse(s) as GridConfig : DEFAULT_GRID;
    } catch { return DEFAULT_GRID; }
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [newPrenom, setNewPrenom] = useState('');
  const [newPoste, setNewPoste] = useState('');

  const [editingComp, setEditingComp] = useState<{ key: string; val: string } | null>(null);
  const [addingToDomaineIdx, setAddingToDomaineIdx] = useState<number | null>(null);
  const [newCompLabel, setNewCompLabel] = useState('');

  const [vah] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try { return parseFloat(localStorage.getItem(`vah_resultat_${magasinNom}`) ?? '0') || 0; }
    catch { return 0; }
  });

  // Effective domaines: filter deleted, apply renamed labels, append custom
  const effectiveDomaines: Array<{ titre: string; compItems: CompItem[] }> = DOMAINES.map((d, idx) => ({
    titre: d.titre,
    compItems: [
      ...d.competences
        .filter(c => !gridConfig.deletedComps.includes(c))
        .map(c => ({ key: c, label: gridConfig.customLabels[c] ?? c, isCustom: false })),
      ...gridConfig.customComps
        .filter(cc => cc.domaineIdx === idx)
        .map(cc => ({ key: cc.id, label: cc.label, isCustom: true })),
    ],
  }));

  const effectiveAllCompItems = effectiveDomaines.flatMap(d => d.compItems);
  const EFFECTIVE_TOTAL = effectiveAllCompItems.length;

  function save(rows: Collaborateur[]) {
    setCollab(rows);
    localStorage.setItem(storageKey, JSON.stringify(rows));
  }

  function saveGridConfig(cfg: GridConfig) {
    setGridConfig(cfg);
    localStorage.setItem(gridKey, JSON.stringify(cfg));
  }

  function addCollab() {
    if (!newPrenom.trim()) return;
    const empty: Record<string, number> = {};
    effectiveAllCompItems.forEach(ci => { empty[ci.key] = 0; });
    save([...collab, { id: uid(), prenom: newPrenom.trim(), poste: newPoste.trim(), competences: empty }]);
    setNewPrenom(''); setNewPoste(''); setShowAddForm(false);
  }

  function delCollab(id: string) { save(collab.filter(c => c.id !== id)); }

  function cycleLevel(collabId: string, compKey: string) {
    save(collab.map(c =>
      c.id === collabId
        ? { ...c, competences: { ...c.competences, [compKey]: ((c.competences[compKey] ?? 0) + 1) % 3 } }
        : c
    ));
  }

  function saveCompRename(key: string, newLabel: string, isCustom: boolean) {
    const trimmed = newLabel.trim();
    if (!trimmed) { setEditingComp(null); return; }
    if (isCustom) {
      saveGridConfig({
        ...gridConfig,
        customComps: gridConfig.customComps.map(cc => cc.id === key ? { ...cc, label: trimmed } : cc),
      });
    } else {
      saveGridConfig({ ...gridConfig, customLabels: { ...gridConfig.customLabels, [key]: trimmed } });
    }
    setEditingComp(null);
  }

  function deleteComp(key: string, isCustom: boolean) {
    if (isCustom) {
      saveGridConfig({ ...gridConfig, customComps: gridConfig.customComps.filter(cc => cc.id !== key) });
    } else {
      saveGridConfig({ ...gridConfig, deletedComps: [...gridConfig.deletedComps, key] });
    }
    const updated = collab.map(c => {
      const comps = { ...c.competences };
      delete comps[key];
      return { ...c, competences: comps };
    });
    setCollab(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  }

  function addCustomComp(domaineIdx: number) {
    const trimmed = newCompLabel.trim();
    if (!trimmed) return;
    const newId = uid();
    saveGridConfig({ ...gridConfig, customComps: [...gridConfig.customComps, { id: newId, domaineIdx, label: trimmed }] });
    const updated = collab.map(c => ({ ...c, competences: { ...c.competences, [newId]: 0 } }));
    setCollab(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    setNewCompLabel('');
    setAddingToDomaineIdx(null);
  }

  // Scoring
  const avgByComp: Record<string, number> = {};
  effectiveAllCompItems.forEach(({ key }) => {
    const vals = collab.map(c => c.competences[key] ?? 0);
    avgByComp[key] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  });

  const dependencyAlerts: Array<{ key: string; label: string; prenom: string }> = [];
  effectiveAllCompItems.forEach(({ key, label }) => {
    const masters = collab.filter(c => (c.competences[key] ?? 0) === 2);
    if (masters.length === 1) dependencyAlerts.push({ key, label, prenom: masters[0].prenom });
  });

  const noMasteryAlerts = collab.filter(c =>
    effectiveAllCompItems.every(({ key }) => (c.competences[key] ?? 0) < 2)
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#1A1A1A]">Compétences — {magasinNom || 'Magasin'}</h2>
          <p className="text-sm text-[#6B7280]">{collab.length} collaborateur{collab.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportCompetences(magasinNom, collab, effectiveDomaines)}
            className="bg-white border border-[#E0E0E0] hover:bg-[#F5F5F5] text-[#1A1A1A] text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            📄 Exporter grille en Word
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-[#E30613] hover:bg-[#B8050F] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            + Collaborateur
          </button>
        </div>
      </div>

      {/* Add collaborateur form */}
      {showAddForm && (
        <div className="bg-white rounded-xl p-4 flex flex-wrap gap-3 items-end border border-[#E0E0E0] shadow-sm">
          <div>
            <label className="text-xs text-[#6B7280]">Prénom *</label>
            <input
              value={newPrenom}
              onChange={e => setNewPrenom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCollab()}
              className="block bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] mt-1 w-40 focus:outline-none focus:border-[#E30613]"
              placeholder="Prénom"
            />
          </div>
          <div>
            <label className="text-xs text-[#6B7280]">Poste</label>
            <input
              value={newPoste}
              onChange={e => setNewPoste(e.target.value)}
              className="block bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] mt-1 w-40 focus:outline-none focus:border-[#E30613]"
              placeholder="Vendeur, Resp..."
            />
          </div>
          <button onClick={addCollab} className="bg-[#E30613] hover:bg-[#B8050F] text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">Ajouter</button>
          <button onClick={() => setShowAddForm(false)} className="text-[#6B7280] hover:text-[#1A1A1A] text-xs px-2 py-2">Annuler</button>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-[#6B7280]">
        {LEVEL_LABELS.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`w-4 h-4 rounded-sm ${CELL_BG[i]}`} />
            <span>{i === 0 ? '🟥' : i === 1 ? '🟧' : '🟩'} {l}</span>
          </div>
        ))}
        <span className="text-[#6B7280] ml-2">Cliquer sur une cellule pour changer de niveau · ✏ renommer · 🗑 supprimer</span>
      </div>

      {collab.length === 0 ? (
        <div className="text-center text-[#6B7280] text-sm py-10">Ajoutez vos collaborateurs pour cartographier les compétences.</div>
      ) : (
        <div className="space-y-4">
          {/* Per-person summary */}
          <div className="flex flex-wrap gap-2">
            {collab.map(c => {
              const mastered = effectiveAllCompItems.filter(({ key }) => (c.competences[key] ?? 0) === 2).length;
              return (
                <div key={c.id} className="bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-xs">
                  <span className="text-[#1A1A1A] font-semibold">{c.prenom}</span>
                  {c.poste && <span className="text-[#6B7280] ml-1">({c.poste})</span>}
                  <span className={`ml-2 font-bold ${mastered >= EFFECTIVE_TOTAL * 0.7 ? 'text-green-600' : mastered >= EFFECTIVE_TOTAL * 0.4 ? 'text-orange-500' : 'text-red-600'}`}>
                    {mastered}/{EFFECTIVE_TOTAL} maîtrisées (niveau 2)
                  </span>
                </div>
              );
            })}
          </div>

          {/* Coût caché des compétences */}
          {(dependencyAlerts.length > 0 || noMasteryAlerts.length > 0) && (
            <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-[#FFF5F5] border-b border-[#E0E0E0]">
                <h3 className="font-bold text-sm text-[#E30613]">🔍 Coût caché des compétences</h3>
              </div>
              <div className="p-4 space-y-3">
                {vah > 0 ? (
                  <>
                    {dependencyAlerts.map(a => {
                      const cost = Math.round(vah * 35);
                      return (
                        <div key={`cost-dep-${a.key}`} className="border-l-4 border-l-orange-400 bg-orange-50 rounded-r-lg px-4 py-3">
                          <p className="text-sm font-semibold text-[#1A1A1A] mb-1">
                            ⚠ <strong>{a.label}</strong> repose sur <strong>{a.prenom}</strong> seul.
                          </p>
                          <p className="text-xs text-[#6B7280] leading-relaxed">
                            Coût caché estimé : si <strong>{a.prenom}</strong> est absent ne serait-ce qu&apos;une semaine, votre magasin perd l&apos;équivalent de{' '}
                            <strong className="text-[#B91C1C]">{cost.toLocaleString('fr-FR')} €</strong> en performance non produite sur cette opération.
                          </p>
                        </div>
                      );
                    })}
                    {noMasteryAlerts.map(c => {
                      const cost = Math.round(vah * 0.3 * 1607);
                      return (
                        <div key={`cost-nm-${c.id}`} className="border-l-4 border-l-red-400 bg-red-50 rounded-r-lg px-4 py-3">
                          <p className="text-sm font-semibold text-[#1A1A1A] mb-1">
                            ⚠ <strong>{c.prenom}</strong> : aucune compétence maîtrisée (niveau 2).
                          </p>
                          <p className="text-xs text-[#6B7280] leading-relaxed">
                            Coût caché estimé : un collaborateur insuffisamment formé produit environ 30% de valeur en moins. Sur 1 an, c&apos;est environ{' '}
                            <strong className="text-[#B91C1C]">{cost.toLocaleString('fr-FR')} €</strong> de potentiel non exploité.
                          </p>
                        </div>
                      );
                    })}
                    <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-4">
                      <p className="text-sm font-bold text-[#1A1A1A] mb-1">
                        💡 Total coût caché annuel estimé des fragilités de compétences :{' '}
                        <span className="text-[#B91C1C]">
                          {Math.round(dependencyAlerts.length * vah * 35 + noMasteryAlerts.length * vah * 0.3 * 1607).toLocaleString('fr-FR')} €/an
                        </span>
                      </p>
                      <p className="text-xs text-[#6B7280] leading-relaxed">
                        Ce montant représente le risque chiffré lié aux dépendances et aux manques de formation détectés dans votre équipe. Il sert d&apos;aide à la décision pour prioriser les formations et la polyvalence.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3">
                    Saisissez votre VAH dans le Dashboard pour chiffrer le coût caché des fragilités de votre équipe.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Grids by domain */}
          {effectiveDomaines.map((domaine, domaineIdx) => (
            <div key={domaine.titre} className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E0E0E0] bg-[#F5F5F5] flex items-center justify-between">
                <h3 className="font-semibold text-sm text-[#1A1A1A]">{domaine.titre}</h3>
                <button
                  onClick={() => { setAddingToDomaineIdx(domaineIdx); setNewCompLabel(''); }}
                  className="text-[#9CA3AF] hover:text-[#E30613] text-xs font-semibold transition-colors"
                  title="Ajouter une compétence"
                >+ Ajouter</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#E0E0E0]">
                      <th className="text-left px-3 py-2 text-[#6B7280] font-medium w-36">Compétence</th>
                      {collab.map(c => (
                        <th key={c.id} className="px-2 py-2 text-center font-medium text-[#1A1A1A] min-w-[70px]">
                          <div>{c.prenom}</div>
                          {c.poste && <div className="text-[#6B7280] font-normal">{c.poste}</div>}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-center text-[#6B7280] font-medium">Moy.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E0E0]">
                    {domaine.compItems.map(ci => (
                      <tr key={ci.key} className="hover:bg-[#FAFAFA] group">
                        <td className="px-3 py-2 text-[#6B7280]">
                          {editingComp?.key === ci.key ? (
                            <input
                              autoFocus
                              value={editingComp.val}
                              onChange={e => setEditingComp({ key: ci.key, val: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveCompRename(ci.key, editingComp.val, ci.isCustom);
                                if (e.key === 'Escape') setEditingComp(null);
                              }}
                              onBlur={() => saveCompRename(ci.key, editingComp.val, ci.isCustom)}
                              className="bg-white border border-[#E30613] rounded px-1.5 py-0.5 text-xs text-[#1A1A1A] focus:outline-none w-full"
                            />
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="flex-1">{ci.label}</span>
                              <span className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity flex-shrink-0">
                                <button
                                  onClick={() => setEditingComp({ key: ci.key, val: ci.label })}
                                  className="text-[#9CA3AF] hover:text-[#1A1A1A] transition-colors leading-none"
                                  title="Renommer"
                                >✏</button>
                                <button
                                  onClick={() => deleteComp(ci.key, ci.isCustom)}
                                  className="text-[#9CA3AF] hover:text-red-600 transition-colors leading-none"
                                  title="Supprimer"
                                >🗑</button>
                              </span>
                            </div>
                          )}
                        </td>
                        {collab.map(c => {
                          const lvl = c.competences[ci.key] ?? 0;
                          return (
                            <td key={c.id} className="px-2 py-2 text-center">
                              <button
                                onClick={() => cycleLevel(c.id, ci.key)}
                                title={`${LEVEL_LABELS[lvl]} — cliquer pour changer`}
                                className={`w-7 h-7 rounded-sm ${CELL_BG[lvl]} hover:opacity-80 transition-opacity mx-auto block`}
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-center">
                          <span className={`font-semibold ${AVG_COLOR(avgByComp[ci.key])}`}>
                            {avgByComp[ci.key] > 0 ? avgByComp[ci.key].toFixed(1) : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {/* Inline add new competence */}
                    {addingToDomaineIdx === domaineIdx && (
                      <tr>
                        <td colSpan={collab.length + 2} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              value={newCompLabel}
                              onChange={e => setNewCompLabel(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') addCustomComp(domaineIdx);
                                if (e.key === 'Escape') setAddingToDomaineIdx(null);
                              }}
                              placeholder="Nom de la compétence..."
                              className="bg-white border border-[#E30613] rounded px-2 py-1 text-xs text-[#1A1A1A] focus:outline-none flex-1"
                            />
                            <button onClick={() => addCustomComp(domaineIdx)} className="bg-[#E30613] hover:bg-[#B8050F] text-white text-xs px-2 py-1 rounded transition-colors">Ajouter</button>
                            <button onClick={() => setAddingToDomaineIdx(null)} className="text-[#6B7280] hover:text-[#1A1A1A] text-xs">Annuler</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Analysis alerts */}
          {(dependencyAlerts.length > 0 || noMasteryAlerts.length > 0) && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-red-700 mb-2">Alertes équipe</p>
              {dependencyAlerts.map(a => (
                <div key={`dep-${a.key}`} className="flex items-center justify-between gap-2">
                  <p className="text-xs text-red-600">
                    ⚠ <strong>{a.label}</strong> repose sur <strong>{a.prenom}</strong> seul (seul niveau 2) — risque dépendance
                  </p>
                  {onAddAction && (
                    <button onClick={() => {
                      const e = new Date(); e.setDate(e.getDate() + 14);
                      onAddAction({ id: String(Date.now()), titre: `Compétences — Former un 2ème niveau sur ${a.label}`, axe: 'Management', pilote: 'Franchisé', copilote: '', description: `Dépendance critique : ${a.label} repose uniquement sur ${a.prenom}. Former un second collaborateur pour réduire le risque d'absence.`, echeance: e.toISOString().slice(0, 10), priorite: 1, gain: 0, statut: 'À faire' });
                    }} className="text-[10px] text-white bg-[#E30613] hover:bg-red-700 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0 transition-colors">+ PAP</button>
                  )}
                </div>
              ))}
              {noMasteryAlerts.map(c => (
                <div key={`nm-${c.id}`} className="flex items-center justify-between gap-2">
                  <p className="text-xs text-red-600">
                    ⚠ <strong>{c.prenom}</strong> : aucune compétence niveau 2 — besoin formation
                  </p>
                  {onAddAction && (
                    <button onClick={() => {
                      const e = new Date(); e.setDate(e.getDate() + 14);
                      onAddAction({ id: String(Date.now()), titre: `Compétences — Plan de formation pour ${c.prenom}`, axe: 'Management', pilote: 'Franchisé', copilote: '', description: `${c.prenom} n'a aucune compétence au niveau 2. Planifier un parcours de montée en compétence prioritaire.`, echeance: e.toISOString().slice(0, 10), priorite: 2, gain: 0, statut: 'À faire' });
                    }} className="text-[10px] text-white bg-[#E30613] hover:bg-red-700 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0 transition-colors">+ PAP</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Delete collaborateurs */}
          <div className="flex flex-wrap gap-2 pt-1">
            {collab.map(c => (
              <div key={c.id} className="flex items-center gap-1.5 bg-white border border-[#E0E0E0] rounded-lg px-2 py-1">
                <span className="text-xs text-[#1A1A1A]">{c.prenom}</span>
                <button onClick={() => delCollab(c.id)} className="text-[#9CA3AF] hover:text-red-600 text-xs transition-colors">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <PhraseExplicative moduleKey="competences" defaultText="Cartographie les 26 compétences clés de l'équipe et détecte les dépendances critiques." />
      <CommentaireConsultant moduleKey="competences" magasinNom={magasinNom} />
      <NotesReunion moduleKey="competences" />
    </div>
  );
}

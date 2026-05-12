'use client';

import { useState } from 'react';

interface Props { magasinNom: string; }

interface Collaborateur {
  id: string;
  prenom: string;
  poste: string;
  competences: Record<string, number>; // 0-2
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

// Level 0: red (none), 1: orange (occasional), 2: green (mastered)
const CELL_BG = ['bg-red-500', 'bg-orange-400', 'bg-green-500'];
const LEVEL_LABELS = ['Aucune', 'Occasionnelle', 'Maîtrisée'];
const AVG_COLOR = (avg: number) =>
  avg >= 1.5 ? 'text-green-600' : avg >= 0.5 ? 'text-orange-500' : 'text-red-600';

function uid() { return Math.random().toString(36).slice(2); }

// Word export colors: red, orange, green
const LEVEL_FILL = ['EF4444', 'FB923C', '22C55E'];

async function exportCompetences(magasinNom: string, collab: Collaborateur[]) {
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

    const compRows = DOMAINES.flatMap(domaine => [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: domaine.titre, bold: true })] })],
            columnSpan: collab.length + 1,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E8E8E8' },
          }),
        ],
      }),
      ...domaine.competences.map(comp => new TableRow({
        children: [
          makeCell(comp),
          ...collab.map(c => {
            const lvl = c.competences[comp] ?? 0;
            return makeCell(String(lvl), LEVEL_FILL[lvl]);
          }),
        ],
      })),
    ]);

    // Dependency alerts
    const dependencyAlerts: string[] = [];
    ALL_COMPETENCES.forEach(comp => {
      const masters = collab.filter(c => (c.competences[comp] ?? 0) === 2);
      if (masters.length === 1) dependencyAlerts.push(`⚠ ${comp} repose sur ${masters[0].prenom} seul (seul niveau 2) — risque dépendance`);
    });
    const noMasteryAlerts = collab
      .filter(c => ALL_COMPETENCES.every(comp => (c.competences[comp] ?? 0) < 2))
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

export default function Competences({ magasinNom }: Props) {
  const storageKey = `comp_${magasinNom}`;

  const [collab, setCollab] = useState<Collaborateur[]>(() => {
    try {
      const s = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
      if (!s) return [];
      // Migrate old data: clamp values to 0-2
      const parsed = JSON.parse(s) as Collaborateur[];
      return parsed.map(c => ({
        ...c,
        competences: Object.fromEntries(
          Object.entries(c.competences).map(([k, v]) => [k, Math.min(v, 2)])
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
        ? { ...c, competences: { ...c.competences, [competence]: ((c.competences[competence] ?? 0) + 1) % 3 } }
        : c
    ));
  }

  // Average per competence
  const avgByComp: Record<string, number> = {};
  ALL_COMPETENCES.forEach(comp => {
    const vals = collab.map(c => c.competences[comp] ?? 0);
    avgByComp[comp] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  });

  // Analysis: dependency risk (exactly 1 person at level 2)
  const dependencyAlerts: Array<{ comp: string; prenom: string }> = [];
  ALL_COMPETENCES.forEach(comp => {
    const masters = collab.filter(c => (c.competences[comp] ?? 0) === 2);
    if (masters.length === 1) dependencyAlerts.push({ comp, prenom: masters[0].prenom });
  });

  // Analysis: no mastery alerts (no level-2 competence)
  const noMasteryAlerts = collab.filter(c =>
    ALL_COMPETENCES.every(comp => (c.competences[comp] ?? 0) < 2)
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
            onClick={() => exportCompetences(magasinNom, collab)}
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

      {/* Add form */}
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
        <span className="text-[#6B7280] ml-2">Cliquer pour changer de niveau</span>
      </div>

      {collab.length === 0 ? (
        <div className="text-center text-[#6B7280] text-sm py-10">Ajoutez vos collaborateurs pour cartographier les compétences.</div>
      ) : (
        <div className="space-y-4">
          {/* Per-person summary */}
          <div className="flex flex-wrap gap-2">
            {collab.map(c => {
              const mastered = ALL_COMPETENCES.filter(comp => (c.competences[comp] ?? 0) === 2).length;
              return (
                <div key={c.id} className="bg-white border border-[#E0E0E0] rounded-lg px-3 py-2 text-xs">
                  <span className="text-[#1A1A1A] font-semibold">{c.prenom}</span>
                  {c.poste && <span className="text-[#6B7280] ml-1">({c.poste})</span>}
                  <span className={`ml-2 font-bold ${mastered >= TOTAL * 0.7 ? 'text-green-600' : mastered >= TOTAL * 0.4 ? 'text-orange-500' : 'text-red-600'}`}>
                    {mastered}/{TOTAL} maîtrisées (niveau 2)
                  </span>
                </div>
              );
            })}
          </div>

          {/* Grids by domain */}
          {DOMAINES.map(domaine => (
            <div key={domaine.titre} className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E0E0E0] bg-[#F5F5F5]">
                <h3 className="font-semibold text-sm text-[#1A1A1A]">{domaine.titre}</h3>
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
                    {domaine.competences.map(comp => (
                      <tr key={comp} className="hover:bg-[#FAFAFA]">
                        <td className="px-3 py-2 text-[#6B7280]">{comp}</td>
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
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-red-700 mb-2">Alertes équipe</p>
              {dependencyAlerts.map(a => (
                <p key={`dep-${a.comp}`} className="text-xs text-red-600">
                  ⚠ <strong>{a.comp}</strong> repose sur <strong>{a.prenom}</strong> seul (seul niveau 2) — risque dépendance
                </p>
              ))}
              {noMasteryAlerts.map(c => (
                <p key={`nm-${c.id}`} className="text-xs text-red-600">
                  ⚠ <strong>{c.prenom}</strong> : aucune compétence niveau 2 — besoin formation
                </p>
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
    </div>
  );
}

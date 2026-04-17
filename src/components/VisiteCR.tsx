'use client';

import { useState } from 'react';
import type { MagasinData, PAPAction } from '@/types';
import { KPI_DEFS, getAlerts } from '@/lib/kpis';

interface Props {
  data: MagasinData;
  actions: PAPAction[];
}

const SECTIONS_TEMPLATE = [
  { id: 'bilan',           label: 'Bilan de la période',    placeholder: 'CA, tendances, contexte marché local...' },
  { id: 'stock',           label: 'Points stock',           placeholder: 'GMROI, stock âgé, familles en retard...' },
  { id: 'commerce',        label: 'Commerce & digital',     placeholder: 'Transformation, panier moyen, web, Estaly...' },
  { id: 'rh',              label: 'Équipe & RH',            placeholder: 'Recrutement, formation, ambiance, planning...' },
  { id: 'points_positifs', label: 'Points positifs',        placeholder: 'Bonnes pratiques, réussites, progrès...' },
  { id: 'points_vigilance',label: 'Points de vigilance',    placeholder: "Risques, axes d'amélioration prioritaires..." },
  { id: 'engagements',     label: 'Engagements franchisé',  placeholder: 'Actions concrètes à mettre en place...' },
  { id: 'prochaine_visite',label: 'Prochaine visite',       placeholder: 'Date prévue, thèmes abordés, objectifs...' },
];

export default function VisiteCR({ data, actions }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const [dateVisite, setDateVisite] = useState(today);
  const [consultant, setConsultant] = useState('');
  const [sections, setSections] = useState<Record<string, string>>(
    Object.fromEntries(SECTIONS_TEMPLATE.map(s => [s.id, '']))
  );
  const [generated, setGenerated] = useState('');
  const [exporting, setExporting] = useState(false);

  function updateSection(id: string, val: string) {
    setSections(s => ({ ...s, [id]: val }));
  }

  function autoFill() {
    const alerts = getAlerts(data);
    const dangers = alerts.filter(a => a.status === 'danger');
    const warns = alerts.filter(a => a.status === 'warn');
    const activeActions = actions.filter(a => a.statut !== 'Fait');
    const doneActions = actions.filter(a => a.statut === 'Fait');

    const stockAlerts = alerts.filter(a => KPI_DEFS.find(k => k.key === a.key)?.category === 'stock');
    const commerceAlerts = alerts.filter(a => {
      const cat = KPI_DEFS.find(k => k.key === a.key)?.category;
      return cat === 'commerce' || cat === 'gamme';
    });
    const rhAlerts = alerts.filter(a => KPI_DEFS.find(k => k.key === a.key)?.category === 'rh');

    setSections({
      bilan: data.caAnnuel > 0
        ? `CA annuel : ${data.caAnnuel.toLocaleString('fr-FR')} € — Phase : ${data.phase}.`
        : `Magasin en phase ${data.phase}.`,
      stock: stockAlerts.length > 0
        ? stockAlerts.map(a => `⚠ ${a.label} : ${a.value}${a.unit} (cible : ${a.seuilOk})`).join('\n')
        : "Pas d'alerte stock identifiée.",
      commerce: commerceAlerts.length > 0
        ? commerceAlerts.map(a => `⚠ ${a.label} : ${a.value}${a.unit} (cible : ${a.seuilOk})`).join('\n')
        : "Pas d'alerte commerce identifiée.",
      rh: rhAlerts.length > 0
        ? rhAlerts.map(a => `⚠ ${a.label} : ${a.value}${a.unit} (cible : ${a.seuilOk})`).join('\n')
        : "Pas d'alerte RH identifiée.",
      points_positifs: doneActions.length > 0
        ? `Actions terminées : ${doneActions.map(a => a.titre).join(', ')}.`
        : '',
      points_vigilance: dangers.length > 0
        ? dangers.map(a => `🔴 ${a.label} : ${a.actionText}`).join('\n\n')
        : warns.length > 0
          ? warns.map(a => `🟡 ${a.label} : ${a.actionText}`).join('\n\n')
          : '',
      engagements: activeActions.slice(0, 5).map(a =>
        `• ${a.titre}${a.echeance ? ` (avant le ${new Date(a.echeance).toLocaleDateString('fr-FR')})` : ''} — Pilote : ${a.pilote || 'à définir'}`
      ).join('\n'),
      prochaine_visite: '',
    });
  }

  function generateCR() {
    const lines: string[] = [
      'COMPTE-RENDU DE VISITE',
      '='.repeat(50),
      `Magasin : ${data.nom || 'Non renseigné'}`,
      `Date : ${dateVisite ? new Date(dateVisite).toLocaleDateString('fr-FR') : 'Non renseignée'}`,
      `Consultant : ${consultant || 'Non renseigné'}`,
      '',
    ];
    SECTIONS_TEMPLATE.forEach(section => {
      const content = sections[section.id];
      if (content.trim()) {
        lines.push(section.label.toUpperCase());
        lines.push('-'.repeat(section.label.length));
        lines.push(content.trim());
        lines.push('');
      }
    });
    lines.push('='.repeat(50));
    lines.push(`Document généré le ${new Date().toLocaleDateString('fr-FR')} via EasyCash Cockpit`);
    setGenerated(lines.join('\n'));
  }

  async function exportWord() {
    setExporting(true);
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } = await import('docx');
      const { saveAs } = await import('file-saver');

      const nomMagasin = data.nom || 'magasin';
      const date = dateVisite || today;
      const nomConsultant = consultant || 'Non renseigné';

      // KPI alerts table rows
      const alerts = getAlerts(data);
      const alertRows = alerts.map(a =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: a.label, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${a.value}${a.unit}`, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: a.seuilOk, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: a.status === 'danger' ? '🔴' : '🟡', size: 18 })] })] }),
          ],
        })
      );

      // PAP actions table rows
      const activeActions = actions.filter(a => a.statut !== 'Fait');
      const actionRows = activeActions.map(a =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: a.titre, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `P${a.priorite}`, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: a.pilote || '—', size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: a.echeance ? new Date(a.echeance).toLocaleDateString('fr-FR') : '—', size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: a.statut, size: 18 })] })] }),
          ],
        })
      );

      const tableHeader = (labels: string[]) => new TableRow({
        children: labels.map(l => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: l, bold: true, size: 18 })] })],
        })),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const children: any[] = [
        new Paragraph({
          text: 'EasyCash — Compte-Rendu de Visite',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          text: `${nomMagasin} — ${new Date(date).toLocaleDateString('fr-FR')}`,
          heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph({ children: [new TextRun({ text: `Consultant : ${nomConsultant}` })] }),
        new Paragraph({ text: '' }),
      ];

      // Sections from template
      SECTIONS_TEMPLATE.forEach(section => {
        const content = sections[section.id];
        if (content.trim()) {
          children.push(new Paragraph({ text: section.label, heading: HeadingLevel.HEADING_2 }));
          content.split('\n').forEach(line => {
            children.push(new Paragraph({ children: [new TextRun({ text: line, size: 20 })] }));
          });
          children.push(new Paragraph({ text: '' }));
        }
      });

      // KPI alerts table
      if (alerts.length > 0) {
        children.push(new Paragraph({ text: 'Indicateurs en alerte', heading: HeadingLevel.HEADING_2 }));
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            tableHeader(['Indicateur', 'Valeur', 'Cible', 'Statut']),
            ...alertRows,
          ],
        }));
        children.push(new Paragraph({ text: '' }));
      }

      // PAP actions table
      if (activeActions.length > 0) {
        children.push(new Paragraph({ text: "Plan d'action", heading: HeadingLevel.HEADING_2 }));
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            tableHeader(['Action', 'Priorité', 'Pilote', 'Échéance', 'Statut']),
            ...actionRows,
          ],
        }));
        children.push(new Paragraph({ text: '' }));
      }

      children.push(new Paragraph({
        children: [new TextRun({
          text: 'Document généré par Cockpit EasyCash',
          italics: true,
          color: '888888',
          size: 18,
        })],
        alignment: AlignmentType.CENTER,
      }));

      const doc = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `CR_${nomMagasin.replace(/\s+/g, '_')}_${date}.docx`);
    } catch (e) {
      console.error('Export Word failed:', e);
      alert("Export Word échoué. Consultez la console pour les détails. Vous pouvez copier le texte manuellement.");
    } finally {
      setExporting(false);
    }
  }

  function copyText() {
    if (generated) navigator.clipboard.writeText(generated).catch(() => {});
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">Compte-Rendu de Visite — {data.nom || 'Magasin'}</h2>
        <button
          onClick={autoFill}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
        >
          Auto-remplir depuis les données
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400">Date de visite</label>
          <input
            type="date"
            value={dateVisite}
            onChange={e => setDateVisite(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Consultant</label>
          <input
            value={consultant}
            onChange={e => setConsultant(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white mt-1"
            placeholder="Votre nom"
          />
        </div>
      </div>

      <div className="space-y-3">
        {SECTIONS_TEMPLATE.map(section => (
          <div key={section.id} className="bg-gray-800 rounded-xl p-4">
            <label className="text-sm font-semibold text-gray-200 block mb-2">{section.label}</label>
            <textarea
              value={sections[section.id]}
              onChange={e => updateSection(section.id, e.target.value)}
              rows={3}
              placeholder={section.placeholder}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-green-500"
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={generateCR}
          className="bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          Générer le CR
        </button>
        <button
          onClick={exportWord}
          disabled={exporting}
          className="bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {exporting ? 'Export...' : 'Exporter Word (.docx)'}
        </button>
        {generated && (
          <button
            onClick={copyText}
            className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            Copier le texte
          </button>
        )}
      </div>

      {generated && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Aperçu du compte-rendu</h3>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
            {generated}
          </pre>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { MagasinData, PAPAction } from '@/types';
import { KPI_DEFS, getAlerts } from '@/lib/kpis';

interface Props {
  data: MagasinData;
  actions: PAPAction[];
}

const SECTIONS_TEMPLATE = [
  { id: 'bilan', label: 'Bilan de la période', placeholder: "CA, tendances, contexte marché local..." },
  { id: 'stock', label: 'Points stock', placeholder: "GMROI, stock âgé, familles en retard..." },
  { id: 'commerce', label: 'Commerce & digital', placeholder: "Transformation, panier moyen, web, Estaly..." },
  { id: 'rh', label: 'Équipe & RH', placeholder: "Recrutement, formation, ambiance, planning..." },
  { id: 'points_positifs', label: 'Points positifs', placeholder: "Bonnes pratiques, réussites, progrès..." },
  { id: 'points_vigilance', label: 'Points de vigilance', placeholder: "Risques, axes d'amélioration prioritaires..." },
  { id: 'engagements', label: 'Engagements franchisé', placeholder: "Actions concrètes à mettre en place..." },
  { id: 'prochaine_visite', label: 'Prochaine visite', placeholder: "Date prévue, thèmes abordés, objectifs..." },
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

  // Auto-fill sections from data
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

    const bilan = data.caAnnuel > 0
      ? `CA annuel : ${data.caAnnuel.toLocaleString('fr-FR')} € — Phase : ${data.phase}.`
      : `Magasin en phase ${data.phase}.`;

    setSections({
      bilan,
      stock: stockAlerts.length > 0
        ? stockAlerts.map(a => `⚠ ${a.label} : ${a.value}${a.unit} (cible : ${a.seuilOk})`).join('\n')
        : 'Pas d\'alerte stock identifiée.',
      commerce: commerceAlerts.length > 0
        ? commerceAlerts.map(a => `⚠ ${a.label} : ${a.value}${a.unit} (cible : ${a.seuilOk})`).join('\n')
        : 'Pas d\'alerte commerce identifiée.',
      rh: rhAlerts.length > 0
        ? rhAlerts.map(a => `⚠ ${a.label} : ${a.value}${a.unit} (cible : ${a.seuilOk})`).join('\n')
        : 'Pas d\'alerte RH identifiée.',
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
    const lines: string[] = [];
    lines.push(`COMPTE-RENDU DE VISITE`);
    lines.push(`${'='.repeat(50)}`);
    lines.push(`Magasin : ${data.nom || 'Non renseigné'}`);
    lines.push(`Date : ${dateVisite ? new Date(dateVisite).toLocaleDateString('fr-FR') : 'Non renseignée'}`);
    lines.push(`Consultant : ${consultant || 'Non renseigné'}`);
    lines.push('');

    SECTIONS_TEMPLATE.forEach(section => {
      const content = sections[section.id];
      if (content.trim()) {
        lines.push(`${section.label.toUpperCase()}`);
        lines.push('-'.repeat(section.label.length));
        lines.push(content.trim());
        lines.push('');
      }
    });

    lines.push(`${'='.repeat(50)}`);
    lines.push(`Document généré le ${new Date().toLocaleDateString('fr-FR')} via EasyCash Cockpit`);

    setGenerated(lines.join('\n'));
  }

  async function exportWord() {
    setExporting(true);
    try {
      const [{ Document, Paragraph, TextRun, HeadingLevel, AlignmentType }, { saveAs }] = await Promise.all([
        import('docx'),
        import('file-saver'),
      ]);

      const docChildren = [];

      // Title
      docChildren.push(new Paragraph({
        text: 'COMPTE-RENDU DE VISITE',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }));

      // Meta
      docChildren.push(new Paragraph({
        children: [
          new TextRun({ text: 'Magasin : ', bold: true }),
          new TextRun(data.nom || 'Non renseigné'),
        ],
      }));
      docChildren.push(new Paragraph({
        children: [
          new TextRun({ text: 'Date : ', bold: true }),
          new TextRun(dateVisite ? new Date(dateVisite).toLocaleDateString('fr-FR') : 'Non renseignée'),
        ],
      }));
      docChildren.push(new Paragraph({
        children: [
          new TextRun({ text: 'Consultant : ', bold: true }),
          new TextRun(consultant || 'Non renseigné'),
        ],
      }));
      docChildren.push(new Paragraph({ text: '' }));

      // Sections
      SECTIONS_TEMPLATE.forEach(section => {
        const content = sections[section.id];
        if (content.trim()) {
          docChildren.push(new Paragraph({
            text: section.label,
            heading: HeadingLevel.HEADING_2,
          }));
          content.split('\n').forEach(line => {
            docChildren.push(new Paragraph({ text: line }));
          });
          docChildren.push(new Paragraph({ text: '' }));
        }
      });

      // Footer
      docChildren.push(new Paragraph({
        children: [new TextRun({
          text: `Document généré le ${new Date().toLocaleDateString('fr-FR')} via EasyCash Cockpit`,
          italics: true,
          color: '888888',
        })],
      }));

      const doc = new Document({ sections: [{ children: docChildren }] });

      const { Packer } = await import('docx');
      const buffer = await Packer.toBlob(doc);
      const filename = `CR_visite_${data.nom || 'magasin'}_${dateVisite || today}.docx`;
      saveAs(buffer, filename);
    } catch (e) {
      console.error('Export Word failed:', e);
      alert('Export Word indisponible. Copiez le texte généré manuellement.');
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

      {/* Meta */}
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

      {/* Sections */}
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

      {/* Generate */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={generateCR}
          className="bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          Générer le CR
        </button>
        {generated && (
          <>
            <button
              onClick={exportWord}
              disabled={exporting}
              className="bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {exporting ? 'Export...' : 'Exporter Word (.docx)'}
            </button>
            <button
              onClick={copyText}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              Copier le texte
            </button>
          </>
        )}
      </div>

      {/* Preview */}
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

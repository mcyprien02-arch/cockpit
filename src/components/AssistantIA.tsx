'use client';

import { useState } from 'react';
import type { MagasinData, PAPAction } from '@/types';
import { getAlerts, getCategoryScores } from '@/lib/kpis';

interface Props {
  data: MagasinData;
  actions: PAPAction[];
}

const PROMPT_TEMPLATES = [
  {
    id: 'diagnostic',
    label: 'Diagnostic complet',
    icon: '🔍',
    build: (data: MagasinData, actions: PAPAction[]) => {
      const alerts = getAlerts(data);
      const scores = getCategoryScores(data);
      const cats = ['rentabilite', 'stock', 'commerce', 'rh'] as const;
      const scoreStr = cats.map(c => `${c}: ${Math.round(scores[c])}/100`).join(', ');
      const alertStr = alerts.map(a => `- ${a.label}: ${a.value}${a.unit} (cible: ${a.seuilOk}, statut: ${a.status})`).join('\n');
      const actionStr = actions.filter(a => a.statut !== 'Fait').slice(0, 5).map(a => `- [P${a.priorite}] ${a.titre} (${a.statut})`).join('\n');

      return `Tu es expert en franchise retail et gestion de magasin EasyCash.

MAGASIN: ${data.nom || 'Non renseigné'} — Phase: ${data.phase}

SCORES: ${scoreStr}

ALERTES KPI:
${alertStr || 'Aucune alerte'}

ACTIONS EN COURS:
${actionStr || 'Aucune action'}

Fais un diagnostic structuré avec:
1. Analyse des points forts
2. Problèmes prioritaires et leurs causes
3. Plan d'action concret (5 actions max, priorisées)
4. Indicateurs à surveiller chaque semaine`;
    },
  },
  {
    id: 'stock',
    label: 'Optimiser le stock',
    icon: '📦',
    build: (data: MagasinData) => {
      const stockKpis = [
        `Stock total: ${data.stockTotal ? data.stockTotal.toLocaleString('fr-FR') + ' €' : 'N/R'}`,
        `Stock âgé: ${data.stockAge ? data.stockAge + '%' : 'N/R'}`,
        `GMROI: ${data.gmroi || 'N/R'}`,
        `Délai vente téléphonie: ${data.delaiTel ? data.delaiTel + 'j' : 'N/R'}`,
        `Délai vente consoles: ${data.delaiConsole ? data.delaiConsole + 'j' : 'N/R'}`,
        `Délai vente PC: ${data.delaiPC ? data.delaiPC + 'j' : 'N/R'}`,
        `Gamme téléphonie: ${data.gammeTel ? data.gammeTel + '%' : 'N/R'}`,
        `Taux achat externe: ${data.tauxAchatExterne ? data.tauxAchatExterne + '%' : 'N/R'}`,
      ].join('\n');

      return `Expert EasyCash, aide-moi à optimiser mon stock.

MAGASIN: ${data.nom || 'Non renseigné'} (CA annuel: ${data.caAnnuel ? data.caAnnuel.toLocaleString('fr-FR') + ' €' : 'N/R'})

DONNÉES STOCK:
${stockKpis}

Donne-moi:
1. Les familles à déstocker en priorité
2. Les actions concrètes pour améliorer le GMROI
3. Une stratégie de pricing pour accélérer les ventes
4. Comment ajuster mes achats la semaine prochaine`;
    },
  },
  {
    id: 'commerce',
    label: 'Booster les ventes',
    icon: '💰',
    build: (data: MagasinData) => {
      const commerceKpis = [
        `Taux transformation: ${data.tauxTransformation ? data.tauxTransformation + '%' : 'N/R'}`,
        `Panier moyen: ${data.panierMoyen ? data.panierMoyen + ' €' : 'N/R'}`,
        `Ventes additionnelles: ${data.ventesAdditionnelles || 'N/R'}`,
        `Estaly/semaine: ${data.estalyParSemaine || 'N/R'}`,
        `Note Google: ${data.noteGoogle ? data.noteGoogle + '/5' : 'N/R'}`,
        `Poids digital: ${data.poidsDigital ? data.poidsDigital + '%' : 'N/R'}`,
        `Taux annulation web: ${data.tauxAnnulationWeb ? data.tauxAnnulationWeb + '%' : 'N/R'}`,
        `Taux SAV: ${data.tauxSAV ? data.tauxSAV + '%' : 'N/R'}`,
      ].join('\n');

      return `Expert vente retail EasyCash, aide-moi à booster mon commerce.

MAGASIN: ${data.nom || 'Non renseigné'} — CA annuel: ${data.caAnnuel ? data.caAnnuel.toLocaleString('fr-FR') + ' €' : 'N/R'}

DONNÉES COMMERCE:
${commerceKpis}

Donne-moi:
1. Les leviers prioritaires pour augmenter le CA
2. Script de vente additionnelle adapté à EasyCash
3. Plan d'animation semaine type
4. Actions spécifiques pour améliorer la note Google`;
    },
  },
  {
    id: 'rh',
    label: 'Management équipe',
    icon: '👥',
    build: (data: MagasinData) => {
      const rhKpis = [
        `Nb ETP: ${data.nbEtp || 'N/R'}`,
        `Masse salariale: ${data.masseSalarialePct ? data.masseSalarialePct + '%' : 'N/R'}`,
        `Taux turnover: ${data.tauxTurnover ? data.tauxTurnover + '%' : 'N/R'}`,
        `Formation: ${data.tauxFormation ? data.tauxFormation + '%' : 'N/R'}`,
        `CA annuel: ${data.caAnnuel ? data.caAnnuel.toLocaleString('fr-FR') + ' €' : 'N/R'}`,
      ].join('\n');

      return `Expert management franchise, aide-moi sur la gestion de mon équipe EasyCash.

MAGASIN: ${data.nom || 'Non renseigné'}

DONNÉES RH:
${rhKpis}

Donne-moi:
1. Analyse de mon ratio ETP/CA vs benchmark EasyCash
2. Actions pour réduire le turnover
3. Plan de montée en compétences
4. Outils de motivation et suivi au quotidien`;
    },
  },
  {
    id: 'custom',
    label: 'Question libre',
    icon: '✏️',
    build: (data: MagasinData) => {
      return `Contexte magasin EasyCash:\n- Nom: ${data.nom || 'Non renseigné'}\n- Phase: ${data.phase}\n- CA annuel: ${data.caAnnuel ? data.caAnnuel.toLocaleString('fr-FR') + ' €' : 'N/R'}\n\n`;
    },
  },
];

export default function AssistantIA({ data, actions }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  function selectTemplate(id: string) {
    const tpl = PROMPT_TEMPLATES.find(t => t.id === id);
    if (!tpl) return;
    setSelectedTemplate(id);
    setPrompt(tpl.build(data, actions));
    setCopied(false);
  }

  async function copyAndOpen() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch (e) {
      // Clipboard might fail in some contexts — still open Claude
    }
    window.open('https://claude.ai/new', '_blank');
    setTimeout(() => setCopied(false), 3000);
  }

  const alerts = getAlerts(data);
  const scores = getCategoryScores(data);
  const cats = ['rentabilite', 'stock', 'commerce', 'rh'] as const;
  const catLabels: Record<string, string> = { rentabilite: 'Rentabilité', stock: 'Stock', commerce: 'Commerce', rh: 'RH' };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">Assistant IA</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Génère un prompt enrichi de vos données, copiez-le et posez la question à Claude.
        </p>
      </div>

      {/* Context snapshot */}
      {data.nom && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Contexte chargé — {data.nom}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cats.map(c => (
              <div key={c} className="text-center">
                <div className={`text-xl font-black ${scores[c] >= 65 ? 'text-green-400' : scores[c] >= 35 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {Math.round(scores[c])}
                </div>
                <div className="text-xs text-gray-400">{catLabels[c]}</div>
              </div>
            ))}
          </div>
          {alerts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {alerts.slice(0, 6).map(a => (
                <span key={String(a.key)} className={`text-xs px-2 py-0.5 rounded-full ${a.status === 'danger' ? 'bg-red-900/50 text-red-300' : 'bg-yellow-900/50 text-yellow-300'}`}>
                  {a.label}
                </span>
              ))}
              {alerts.length > 6 && <span className="text-xs text-gray-500">+{alerts.length - 6} autres</span>}
            </div>
          )}
        </div>
      )}

      {/* Template selection */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Choisissez un type d&apos;analyse</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {PROMPT_TEMPLATES.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => selectTemplate(tpl.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                selectedTemplate === tpl.id
                  ? 'bg-green-700 text-white border-2 border-green-500'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border-2 border-transparent'
              }`}
            >
              <span className="text-lg flex-shrink-0">{tpl.icon}</span>
              <span>{tpl.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Prompt editor */}
      {prompt && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">Prompt généré</h3>
            <span className="text-xs text-gray-500">{prompt.length} caractères</span>
          </div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={12}
            className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-200 font-mono resize-none focus:outline-none focus:border-green-500"
          />
          <div className="flex gap-2">
            <button
              onClick={copyAndOpen}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              {copied ? '✓ Copié ! Claude s\'ouvre...' : 'Copier & ouvrir Claude'}
            </button>
            <button
              onClick={() => { navigator.clipboard.writeText(prompt).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-xl text-sm"
            >
              Copier
            </button>
          </div>
          <p className="text-xs text-gray-500 text-center">
            Le prompt sera copié dans votre presse-papier. Collez-le dans Claude sur claude.ai.
          </p>
        </div>
      )}

      {/* How it works */}
      {!prompt && (
        <div className="bg-gray-800 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-sm text-gray-300">Comment ça marche ?</h3>
          <ol className="space-y-2 text-sm text-gray-400">
            <li className="flex gap-2"><span className="text-green-400 font-bold">1.</span><span>Saisissez vos données dans le <strong className="text-gray-200">Dashboard</strong></span></li>
            <li className="flex gap-2"><span className="text-green-400 font-bold">2.</span><span>Choisissez le type d&apos;analyse ci-dessus</span></li>
            <li className="flex gap-2"><span className="text-green-400 font-bold">3.</span><span>Cliquez <strong className="text-gray-200">Copier &amp; ouvrir Claude</strong> — le prompt enrichi est copié</span></li>
            <li className="flex gap-2"><span className="text-green-400 font-bold">4.</span><span>Sur claude.ai, collez le prompt (Ctrl+V / Cmd+V) et envoyez</span></li>
          </ol>
        </div>
      )}
    </div>
  );
}

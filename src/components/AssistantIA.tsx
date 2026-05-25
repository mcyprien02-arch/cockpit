'use client';

import { useState } from 'react';
import type { MagasinData, PAPAction } from '@/types';
import { getAlerts, getCategoryScores } from '@/lib/kpis';
import { getJournalContext } from '@/components/JournalAchatVente';
import { getVisionContext } from '@/components/Objectifs';
import { getBenchmarkContext } from '@/components/BenchmarkFinancier';

interface Props {
  data: MagasinData;
  actions: PAPAction[];
  magasinNom?: string;
}

const SYSTEM_PROMPT = `Tu es un expert franchise EasyCash spécialiste de la seconde main en France. Tu connais :

INDICATEURS SUIVIS DANS L'OUTIL (4 catégories) :
- Rentabilité : CA annuel, Taux de marge nette, Taux de démarque
- Stock : Stock total, Stock âgé %, Top 20 vieux stock traité
- Commerce : Taux transformation, Estaly/mois, Taux SAV, Ventes additionnelles, Achat externe
- Web : Poids digital, Note Google, Taux d'annulation commande, Satisfaction client web

IMPACT BUSINESS PAR FAMILLE (couverture de gamme) :
- TLCE (téléphonie) : 100% couverture gamme modèle = 60% du volume de ventes en TLCE
- JCON (consoles) : 100% couverture gamme référence = 70% de la marge en JCON
- JCDR (CD Rom / JV) : 100% couverture gamme référence = 30% de la marge en JCDR
- IPOR (informatique portables 100–500€) : 100% couverture cœur de gamme = 55% de la marge en IPOR

COMPÉTENCES MÉTIER EASYCASH (26 compétences spécifiques) :
- Achat au comptoir (7) : Application VPD, Test produit Piceasoft/contrôle visuel, Rachat or (pesée/négociation), Bijouterie hors-or, Produits techniques (tél/console/info), Négociation au comptoir, Édition appel de stock
- Vente en magasin (6) : Découverte client et qualification, Argumentation avec réassurance, Vente d'accessoires, Vente Estaly/extension garantie, Gestion d'objection, Encaissement et embasage
- Web & Digital (4) : Mise en ligne EasyBiz (photos/description), Gestion commandes web, Réponse aux avis Google, Suivi Dashboard web (annulations/satisfaction)
- Stock & Pilotage (5) : Lecture côtes d'accélération, Mise à jour prix EasyPrice, Inventaire tournant, TOP 20 vieux stock, SAV client process complet
- Management (4, responsables) : Briefing matinal équipe, Coaching individuel vente, Entretien individuel mensuel, Utilisation Intranet réseau

ROUTINES HEBDOMADAIRES (7 blocs) :
- Gamme (quotidien) : Checker gamme référence Athéna, Éditer appel de stock, Vérifier prix EasyPrice
- Prix (3x/sem) : Mise à jour prix familles, Identifier vieux stock à ajuster, Lancer accélérations côtes alerte
- Animation (quotidien/hebdo) : Mettre en avant bonnes affaires, Rotation vitrine nouveautés, Vérifier arguments réassurance, Consulter Plateforme Marketing
- Équipe : Briefing matinal 5 min, Suivi EasyTraining
- Pilotage : Intranet quotidien (CA/marge/stock âgé), Top 20 vieux stock 1x/sem, Suivi rattachement EasyBiz
- Web & Digital : Checker avancement SAV (quotidien), Checker Gooday notation/avis (quotidien), Répondre aux avis Google (quotidien), Suivre annulations commandes (1x/sem)

MÉTHODOLOGIE GPA (structure de pilotage) :
- Gamme : inventaires tournants, ajustement assortiment, pilotage achat externe
- Prix : côtes d'accélération réseau, pricing concurrentiel, décotes accélératrices
- Animation : contrats Estaly, ventes additionnelles, animation vitrine, demandes d'avis Google

BENCHMARKS RÉSEAU EASYCASH :
- Taux de marge nette : ≥ 40% (Lancement), ≥ 42% (Croissance), ≥ 44% (Maturité)
- Stock âgé : ≤ 20% (Lancement), ≤ 15% (Croissance), ≤ 10% (Maturité)
- Note Google : ≥ 4,2/5 — Taux annulation web : ≤ 5%
- Taux transformation : ≥ 25% — Estaly : ≥ 3/mois (Lancement), ≥ 5 (Croissance), ≥ 8 (Maturité)

OUTILS ISEOR : VAH = (CA × Taux Marge) / Heures annuelles. Coût d'un dysfonctionnement = VAH × temps perdu × fréquence.

RÈGLES DE RÉPONSE : Réponds en 5 phrases maximum. Direct, chiffré, actionnable. Utilise les benchmarks réseau. Priorise les actions à impact financier immédiat. Termine par une action à faire dans les 48h.`;

const PROMPT_TEMPLATES = [
  {
    id: 'diagnostic',
    label: 'Diagnostic complet',
    icon: '🔍',
    build: (data: MagasinData, actions: PAPAction[]) => {
      const alerts = getAlerts(data);
      const scores = getCategoryScores(data);
      const scoreStr = [
        `Rentabilité: ${Math.round(scores.rentabilite)}/100`,
        `Stock: ${Math.round(scores.stock)}/100`,
        `Commerce: ${Math.round(scores.commerce)}/100`,
      ].join(', ');
      const webKpis = [
        data.poidsDigital ? `Poids digital: ${data.poidsDigital}%` : null,
        data.noteGoogle ? `Note Google: ${data.noteGoogle}/5` : null,
        data.tauxAnnulationWeb ? `Annulation web: ${data.tauxAnnulationWeb}%` : null,
        data.satisfactionWeb ? `Satisfaction web: ${data.satisfactionWeb}/5` : null,
      ].filter(Boolean).join(', ');
      const alertStr = alerts.map(a => `- ${a.label}: ${a.value}${a.unit} (cible: ${a.seuilOk}, statut: ${a.status})`).join('\n');
      const actionStr = actions.filter(a => a.statut !== 'Fait').slice(0, 5).map(a => `- [P${a.priorite}] ${a.titre} (${a.statut})`).join('\n');
      return `${SYSTEM_PROMPT}\n\nMAGASIN: ${data.nom || 'Non renseigné'} — Phase: ${data.phase}\n\nSCORES: ${scoreStr}\nWeb: ${webKpis || 'Non renseigné'}\n\nALERTES KPI:\n${alertStr || 'Aucune alerte'}\n\nACTIONS EN COURS:\n${actionStr || 'Aucune action'}\n\nFais un diagnostic structuré avec:\n1. Analyse des points forts (Rentabilité, Stock, Commerce, Web)\n2. Problèmes prioritaires et leurs causes probables\n3. Plan d'action concret (5 actions max, priorisées P1/P2/P3)\n4. Indicateurs à surveiller chaque semaine`;
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
        `Top 20 vieux stock traité: ${data.top20Traite ? 'Oui' : 'Non'}`,
        `Taux achat externe: ${data.tauxAchatExterne ? data.tauxAchatExterne + '%' : 'N/R'}`,
        `Taux Piceasoft: ${data.tauxPiceasoft ? data.tauxPiceasoft + '%' : 'N/R'}`,
        `Gamme téléphonie: ${data.gammeTel ? data.gammeTel + ' réfs' : 'N/R'}`,
        `Gamme jeux vidéo: ${data.gammeJV ? data.gammeJV + ' réfs' : 'N/R'}`,
        `Gamme consoles: ${data.gammeConsole ? data.gammeConsole + ' réfs' : 'N/R'}`,
      ].join('\n');
      return `${SYSTEM_PROMPT}\n\nMAGASIN: ${data.nom || 'Non renseigné'} (CA annuel: ${data.caAnnuel ? data.caAnnuel.toLocaleString('fr-FR') + ' €' : 'N/R'} — Phase: ${data.phase})\n\nDONNÉES STOCK:\n${stockKpis}\n\nDonne-moi:\n1. Les familles à déstocker en priorité avec côtes d'accélération réseau\n2. Les actions concrètes pour traiter le stock âgé cette semaine\n3. Une stratégie d'inventaire tournant (méthode GPA Gamme)\n4. Comment ajuster les achats externes la semaine prochaine`;
    },
  },
  {
    id: 'commerce',
    label: 'Booster les ventes',
    icon: '💰',
    build: (data: MagasinData) => {
      const commerceKpis = [
        `Taux transformation: ${data.tauxTransformation ? data.tauxTransformation + '%' : 'N/R'}`,
        `Ventes additionnelles: ${data.ventesAdditionnelles || 'N/R'}`,
        `Estaly/mois: ${data.estalyParSemaine ? (data.estalyParSemaine * 4).toFixed(0) + ' (soit ' + data.estalyParSemaine + '/sem)' : 'N/R'}`,
        `Taux SAV: ${data.tauxSAV ? data.tauxSAV + '%' : 'N/R'}`,
        `Achat externe: ${data.tauxAchatExterne ? data.tauxAchatExterne + '%' : 'N/R'}`,
        `CA annuel: ${data.caAnnuel ? data.caAnnuel.toLocaleString('fr-FR') + ' €' : 'N/R'}`,
      ].join('\n');
      return `${SYSTEM_PROMPT}\n\nMAGASIN: ${data.nom || 'Non renseigné'} — Phase: ${data.phase}\n\nDONNÉES COMMERCE:\n${commerceKpis}\n\nDonne-moi:\n1. Les leviers prioritaires pour augmenter le CA dès cette semaine\n2. Script de vente additionnelle adapté à EasyCash (Estaly + accessoires)\n3. Plan d'animation GPA pour la semaine type\n4. Actions pour améliorer le taux de transformation en caisse`;
    },
  },
  {
    id: 'web',
    label: 'Performance web',
    icon: '🌐',
    build: (data: MagasinData) => {
      const webKpis = [
        `Poids digital (CA web): ${data.poidsDigital ? data.poidsDigital + '%' : 'N/R'}`,
        `Note Google: ${data.noteGoogle ? data.noteGoogle + '/5' : 'N/R'}`,
        `Taux d'annulation commande: ${data.tauxAnnulationWeb ? data.tauxAnnulationWeb + '%' : 'N/R'}`,
        `Satisfaction client web: ${data.satisfactionWeb ? data.satisfactionWeb + '/5' : 'N/R'}`,
        `CA annuel: ${data.caAnnuel ? data.caAnnuel.toLocaleString('fr-FR') + ' €' : 'N/R'}`,
      ].join('\n');
      return `${SYSTEM_PROMPT}\n\nMAGASIN: ${data.nom || 'Non renseigné'} — Phase: ${data.phase}\n\nDONNÉES WEB:\n${webKpis}\n\nDonne-moi:\n1. Plan d'action pour améliorer la note Google (objectif ≥ 4,2/5)\n2. Actions pour réduire le taux d'annulation commande (≤ 5%)\n3. Leviers pour augmenter le poids digital (objectif ≥ 30%)\n4. Script de demande d'avis Google en magasin, à utiliser dès aujourd'hui`;
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
        `CA par ETP: ${data.caAnnuel && data.nbEtp ? Math.round(data.caAnnuel / data.nbEtp).toLocaleString('fr-FR') + ' €' : 'N/R'}`,
        `CA annuel: ${data.caAnnuel ? data.caAnnuel.toLocaleString('fr-FR') + ' €' : 'N/R'}`,
      ].join('\n');
      return `${SYSTEM_PROMPT}\n\nMAGASIN: ${data.nom || 'Non renseigné'} — Phase: ${data.phase}\n\nDONNÉES RH:\n${rhKpis}\n\nDonne-moi:\n1. Analyse de mon ratio CA/ETP vs benchmark EasyCash\n2. Actions concrètes pour réduire le turnover\n3. Plan de montée en compétences GPA pour l'équipe\n4. Rituels managériaux hebdomadaires pour ancrer les routines`;
    },
  },
  {
    id: 'custom',
    label: 'Question libre',
    icon: '✏️',
    build: (data: MagasinData) => {
      return `${SYSTEM_PROMPT}\n\nContexte magasin EasyCash:\n- Nom: ${data.nom || 'Non renseigné'}\n- Phase: ${data.phase}\n- CA annuel: ${data.caAnnuel ? data.caAnnuel.toLocaleString('fr-FR') + ' €' : 'N/R'}\n\n`;
    },
  },
];

export default function AssistantIA({ data, actions, magasinNom }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  function selectTemplate(id: string) {
    const tpl = PROMPT_TEMPLATES.find(t => t.id === id);
    if (!tpl) return;
    setSelectedTemplate(id);
    const base = tpl.build(data, actions);
    const journalCtx    = magasinNom ? getJournalContext(magasinNom) : '';
    const visionCtx     = magasinNom ? getVisionContext(magasinNom) : '';
    const benchmarkCtx  = magasinNom ? getBenchmarkContext(magasinNom) : '';
    let built = base;
    if (journalCtx)   built += `\n\nDONNÉES JOURNAL ACHAT-VENTE :${journalCtx}`;
    if (visionCtx)    built += `\n\nVISION & PLAN D'ACTION :${visionCtx}`;
    if (benchmarkCtx) built += `\n\nBENCHMARK FINANCIER :${benchmarkCtx}`;
    setPrompt(built);
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
        <h2 className="text-lg font-bold text-[#1A1A1A]">Assistant IA</h2>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Génère un prompt enrichi de vos données, copiez-le et posez la question à Claude.
        </p>
      </div>

      {/* Context snapshot */}
      {data.nom && (
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4">
          <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-3">Contexte chargé — {data.nom}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cats.map(c => (
              <div key={c} className="text-center">
                <div className={`text-xl font-black ${scores[c] >= 65 ? 'text-green-600' : scores[c] >= 35 ? 'text-orange-500' : 'text-red-600'}`}>
                  {Math.round(scores[c])}
                </div>
                <div className="text-xs text-[#6B7280]">{catLabels[c]}</div>
              </div>
            ))}
          </div>
          {alerts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {alerts.slice(0, 6).map(a => (
                <span key={String(a.key)} className={`text-xs px-2 py-0.5 rounded-full ${a.status === 'danger' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                  {a.label}
                </span>
              ))}
              {alerts.length > 6 && <span className="text-xs text-[#6B7280]">+{alerts.length - 6} autres</span>}
            </div>
          )}
        </div>
      )}

      {/* Template selection */}
      <div>
        <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3">Choisissez un type d&apos;analyse</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {PROMPT_TEMPLATES.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => selectTemplate(tpl.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                selectedTemplate === tpl.id
                  ? 'bg-[#E30613] text-white border-2 border-[#E30613]'
                  : 'bg-[#F5F5F5] text-[#1A1A1A] hover:bg-[#EBEBEB] border-2 border-transparent'
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
            <h3 className="text-sm font-semibold text-[#1A1A1A]">Prompt généré</h3>
            <span className="text-xs text-[#6B7280]">{prompt.length} caractères</span>
          </div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={12}
            className="w-full bg-white border border-[#E0E0E0] rounded-xl px-4 py-3 text-sm text-[#1A1A1A] font-mono resize-none focus:outline-none focus:border-[#E30613]"
          />
          <div className="flex gap-2">
            <button
              onClick={copyAndOpen}
              className="flex-1 bg-[#E30613] hover:bg-[#B8050F] text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              {copied ? '✓ Copié ! Claude s\'ouvre...' : 'Copier & ouvrir Claude'}
            </button>
            <button
              onClick={() => { navigator.clipboard.writeText(prompt).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="bg-white border border-[#E0E0E0] hover:bg-[#F5F5F5] text-[#1A1A1A] font-semibold py-3 px-4 rounded-xl text-sm transition-colors"
            >
              Copier
            </button>
          </div>
          <p className="text-xs text-[#6B7280] text-center">
            Le prompt sera copié dans votre presse-papier. Collez-le dans Claude sur claude.ai.
          </p>
        </div>
      )}

      {/* How it works */}
      {!prompt && (
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5 space-y-3">
          <h3 className="font-semibold text-sm text-[#1A1A1A]">Comment ça marche ?</h3>
          <ol className="space-y-2 text-sm text-[#6B7280]">
            <li className="flex gap-2"><span className="text-[#E30613] font-bold">1.</span><span>Saisissez vos données dans le <strong className="text-[#1A1A1A]">Dashboard</strong></span></li>
            <li className="flex gap-2"><span className="text-[#E30613] font-bold">2.</span><span>Choisissez le type d&apos;analyse ci-dessus</span></li>
            <li className="flex gap-2"><span className="text-[#E30613] font-bold">3.</span><span>Cliquez <strong className="text-[#1A1A1A]">Copier &amp; ouvrir Claude</strong> — le prompt enrichi est copié</span></li>
            <li className="flex gap-2"><span className="text-[#E30613] font-bold">4.</span><span>Sur claude.ai, collez le prompt (Ctrl+V / Cmd+V) et envoyez</span></li>
          </ol>
        </div>
      )}
    </div>
  );
}

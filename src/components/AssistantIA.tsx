'use client';

import { useState, useEffect, useRef } from 'react';
import type { MagasinData, PAPAction } from '@/types';
import { getJournalContext } from '@/components/JournalAchatVente';
import { getRoutinesContext } from '@/components/Routines';
import { getVisionContext } from '@/components/Objectifs';
import { getBenchmarkContext } from '@/components/BenchmarkFinancier';
import { getSimulateurContext } from '@/components/Simulateur';
import { getHistoireContext } from '@/components/Dashboard';

interface Props {
  data: MagasinData;
  actions: PAPAction[];
  magasinNom?: string;
}

const SYSTEM_PROMPT = `Tu es un expert franchise EasyCash spécialiste de la seconde main en France. Tu connais :

MODULES DE DONNÉES DISPONIBLES DANS CET OUTIL :
- Histoire du magasin : type de point de vente, ancienneté, effectif, spécificités locales, défis, description libre
- Simulateur RH : CA annuel, taux de marge brute, ETP, masse salariale % du CA, turnover
- Journal Achat-Vente : rotation par modèle/famille, délai moyen d'écoulement, sourcing (% comptoir vs fournisseurs), marge totale, écart PA/PV vs EP réseau, top coefficient d'écoulement, pépites locales manquantes en gamme
- Benchmark financier : santé globale vs DAF (% des postes de charges), top écarts défavorables vs réseau, potentiel d'optimisation en €
- Vision & Objectifs : objectifs personnels, cap commercial, objectifs mensuels par famille avec avancement %
- Routines : taux de complétion par domaine (Vente, Achat, Stock, Web, Management, GPA)
Toutes les données du contexte proviennent exclusivement de ces modules. Ne demande pas d'indicateurs non présents.

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

ROUTINES OPÉRATIONNELLES (6 domaines) :
- Vente (quotidien) : Brief équipe matin sur CA veille, proposition Estaly systématique, suivi taux de transformation, vente additionnelle TLAC
- Achat (quotidien) : Application VPD, test Piceasoft 100%, demande avis Google en transaction, brief acheteurs sur 3 modèles prioritaires
- Stock (hebdo) : Identification TOP 20 immobilisation cash, accélérations sur invendus >15j, FIFO en réserve, point cash hebdomadaire
- Web (quotidien) : Publication EC.fr, réponse cotations manuelles, sourcing marketplaces 15 min, réponse avis Google sous 24h
- Management (quotidien) : Tour magasin avant ouverture, zoning équipe selon flux, présence en surface aux heures de pointe
- GPA (quotidien/hebdo) : Vérification côte EasyPrice, MAJ prix Zebra sous 24h, couverture gamme Stock Max 0, appel de stock vitrine

MÉTHODOLOGIE GPA (structure de pilotage) :
- Gamme : inventaires tournants, ajustement assortiment, pilotage achat externe
- Prix : côtes d'accélération réseau, pricing concurrentiel, décotes accélératrices
- Animation : contrats Estaly, ventes additionnelles, animation vitrine, demandes d'avis Google

BENCHMARKS RÉSEAU EASYCASH 2024 (référence pour tes recommandations) :
- Taux de marge brute — Réseau réel : Moy. 35,6% | Méd. 35,6% — Cibles par phase : ≥ 40% (Lancement), ≥ 42% (Croissance), ≥ 44% (Maturité)
- Masse salariale — Réseau réel : Moy. 15,1% | Méd. 15,0% du CA HT — Cible DAF : ≤ 15%
- EBE — Réseau réel : Moy. 6,8% | Méd. 7,0% du CA HT
- CA par ETP : ≥ 250 000 € (référence réseau)
- Sourcing comptoir : > 60% des achats (pour préserver la marge)
- Turnover équipe : ≤ 15% par an (vigilance 15–30%, alerte > 30%)

OUTILS ISEOR : VAH = (CA × Taux de marge brute) / Heures annuelles. Coût d'un dysfonctionnement = VAH × temps perdu × fréquence.

ADAPTATION PAR PHASE DE VIE DU MAGASIN :
- Lancement (0–2 ans) : Priorité à l'installation de la gamme, l'acquisition clients et la formation équipe. Seuils plus souples, encourager l'expérimentation. Souligne les quick wins.
- Croissance (2–5 ans) : Focus sur l'optimisation de la rentabilité, la fidélisation et le digital. Objectifs intermédiaires entre lancement et maturité. Challenger sur les routines GPA.
- Maturité (5+ ans) : Maximisation de la marge, GPA avancé, management de la performance. Standards réseau stricts. Identifier les gisements de productivité et les zones de confort à briser.
Adapte impérativement le niveau d'exigence, les objectifs chiffrés et le ton de tes recommandations à la phase indiquée dans le contexte magasin. Ne cite pas la phase explicitement — intègre-la naturellement.

RÈGLES DE RÉPONSE : Réponds en 5 phrases maximum. Direct, chiffré, actionnable. Utilise les benchmarks réseau. Priorise les actions à impact financier immédiat. Termine par une action à faire dans les 48h.`;

const PROMPT_TEMPLATES = [
  {
    id: 'diagnostic',
    label: 'Diagnostic complet',
    icon: '🔍',
    build: (data: MagasinData, actions: PAPAction[]) => {
      const actionStr = actions.filter(a => a.statut !== 'Fait').slice(0, 5).map(a => `- [P${a.priorite}] ${a.titre} (${a.statut})`).join('\n');
      return `${SYSTEM_PROMPT}\n\nMAGASIN: ${data.nom || 'Non renseigné'} — Phase: ${data.phase}\n\nACTIONS EN COURS:\n${actionStr || 'Aucune action'}\n\nAnalyse l'ensemble des données disponibles dans le contexte ci-dessous (Histoire, Simulateur RH, Journal, Benchmark, Routines, Vision) et produis un diagnostic structuré :\n1. Points forts identifiés dans les données\n2. Problèmes prioritaires avec leur impact financier estimé\n3. Plan d'action concret (3 actions max, priorisées P1/P2/P3)\n4. Indicateur à surveiller chaque semaine`;
    },
  },
  {
    id: 'stock',
    label: 'Stock & Sourcing',
    icon: '📦',
    build: (data: MagasinData) => {
      return `${SYSTEM_PROMPT}\n\nMAGASIN: ${data.nom || 'Non renseigné'} — Phase: ${data.phase}\n\nAnalyse les données du Journal Achat-Vente présentes dans le contexte (rotation, délais, sourcing, écarts PA/PV vs EP réseau, pépites locales) et donne-moi :\n1. Les familles/modèles à traiter en priorité selon leur délai d'écoulement\n2. L'analyse du sourcing (équilibre comptoir vs fournisseurs, marge par canal)\n3. Les pépites locales absentes de ma gamme à sourcer en priorité\n4. Une action concrète sur les accélérations à lancer cette semaine`;
    },
  },
  {
    id: 'commerce',
    label: 'Marges & Performance',
    icon: '💰',
    build: (data: MagasinData) => {
      return `${SYSTEM_PROMPT}\n\nMAGASIN: ${data.nom || 'Non renseigné'} — Phase: ${data.phase}\n\nAnalyse les données de marge présentes dans le contexte (Journal : top coefficient d'écoulement, écart PA/PV vs EP ; Benchmark : charges vs réseau, potentiel d'optimisation) et donne-moi :\n1. Les produits/familles avec le meilleur coefficient marge×rotation à renforcer\n2. Les postes de charges surdimensionnés vs réseau à traiter en priorité\n3. Comment améliorer le prix d'achat au comptoir (VPD, négociation, Piceasoft)\n4. Une action immédiate pour gagner de la marge dès cette semaine`;
    },
  },
  {
    id: 'rh',
    label: 'Équipe & RH',
    icon: '👥',
    build: (data: MagasinData) => {
      return `${SYSTEM_PROMPT}\n\nMAGASIN: ${data.nom || 'Non renseigné'} — Phase: ${data.phase}\n\nAnalyse les données RH présentes dans le contexte (Simulateur : CA, ETP, masse salariale %, turnover) et donne-moi :\n1. Analyse du ratio CA/ETP et de la masse salariale vs benchmark 2024 (Moy. 15,1% | Méd. 15,0% CA HT)\n2. Si turnover élevé : actions concrètes pour le réduire\n3. Plan de montée en compétences GPA prioritaire pour l'équipe\n4. Rituel managérial à instaurer cette semaine`;
    },
  },
  {
    id: 'custom',
    label: 'Question libre',
    icon: '✏️',
    build: (data: MagasinData) => {
      return `${SYSTEM_PROMPT}\n\nContexte magasin EasyCash:\n- Nom: ${data.nom || 'Non renseigné'}\n- Phase: ${data.phase}\n\n`;
    },
  },
];

export default function AssistantIA({ data, actions, magasinNom }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const autoRan = useRef(false);

  function selectTemplate(id: string) {
    const tpl = PROMPT_TEMPLATES.find(t => t.id === id);
    if (!tpl) return;
    setSelectedTemplate(id);
    const base = tpl.build(data, actions);
    const histoireCtx   = magasinNom ? getHistoireContext(magasinNom) : '';
    const simuCtx       = magasinNom ? getSimulateurContext(magasinNom) : '';
    const journalCtx    = magasinNom ? getJournalContext(magasinNom) : '';
    const routinesCtx   = magasinNom ? getRoutinesContext(magasinNom) : '';
    const visionCtx     = magasinNom ? getVisionContext(magasinNom) : '';
    const benchmarkCtx  = magasinNom ? getBenchmarkContext(magasinNom) : '';
    let built = base;
    if (histoireCtx)  built += `\n\nHISTOIRE DU MAGASIN :${histoireCtx}`;
    if (simuCtx)      built += `\n\nÉQUIPE & RH :${simuCtx}`;
    if (journalCtx)   built += `\n\nDONNÉES JOURNAL ACHAT-VENTE :${journalCtx}`;
    if (routinesCtx)  built += `\n\nROUTINES HEBDOMADAIRES :${routinesCtx}`;
    if (visionCtx)    built += `\n\nVISION & PLAN D'ACTION :${visionCtx}`;
    if (benchmarkCtx) built += `\n\nBENCHMARK FINANCIER :${benchmarkCtx}`;
    setPrompt(built);
    setCopied(false);
  }

  useEffect(() => {
    if (!autoRan.current) {
      autoRan.current = true;
      selectTemplate('diagnostic');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyAndOpen() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      // Clipboard might fail in some contexts — still open Claude
    }
    window.open('https://claude.ai/new', '_blank');
    setTimeout(() => setCopied(false), 3000);
  }

  const histoireCtxPreview  = magasinNom ? getHistoireContext(magasinNom) : '';
  const simuCtxPreview      = magasinNom ? getSimulateurContext(magasinNom) : '';
  const journalCtxPreview   = magasinNom ? getJournalContext(magasinNom) : '';
  const routinesCtxPreview  = magasinNom ? getRoutinesContext(magasinNom) : '';
  const visionCtxPreview    = magasinNom ? getVisionContext(magasinNom) : '';
  const benchmarkCtxPreview = magasinNom ? getBenchmarkContext(magasinNom) : '';
  const activeModules = [
    histoireCtxPreview  && '📖 Histoire',
    simuCtxPreview      && '💰 Équipe/RH',
    journalCtxPreview   && '📊 Journal',
    routinesCtxPreview  && '🔁 Routines',
    visionCtxPreview    && '🎯 Vision',
    benchmarkCtxPreview && '📊 Benchmark',
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">Assistant IA</h2>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Génère un prompt enrichi de vos données, copiez-le et posez la question à Claude.
        </p>
      </div>

      {/* Modules actifs */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4 space-y-2">
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider">
          {data.nom ? `Contexte chargé — ${data.nom}` : 'Modules inclus dans le prompt'}
        </p>
        {activeModules.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {activeModules.map(m => (
              <span key={m} className="text-xs px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700">{m} ✓</span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#9CA3AF] italic">Aucun module renseigné — remplissez Journal, Simulateur, Benchmark ou Histoire pour enrichir le prompt.</p>
        )}
      </div>

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
            <li className="flex gap-2"><span className="text-[#E30613] font-bold">1.</span><span>Renseignez vos données dans <strong className="text-[#1A1A1A]">Journal</strong>, <strong className="text-[#1A1A1A]">Simulateur</strong>, <strong className="text-[#1A1A1A]">Benchmark</strong> ou <strong className="text-[#1A1A1A]">Routines</strong></span></li>
            <li className="flex gap-2"><span className="text-[#E30613] font-bold">2.</span><span>Choisissez le type d&apos;analyse ci-dessus</span></li>
            <li className="flex gap-2"><span className="text-[#E30613] font-bold">3.</span><span>Cliquez <strong className="text-[#1A1A1A]">Copier &amp; ouvrir Claude</strong> — le prompt enrichi est copié</span></li>
            <li className="flex gap-2"><span className="text-[#E30613] font-bold">4.</span><span>Sur claude.ai, collez le prompt (Ctrl+V / Cmd+V) et envoyez</span></li>
          </ol>
        </div>
      )}
    </div>
  );
}

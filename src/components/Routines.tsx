'use client';

import { useState, useMemo } from 'react';
import type { PAPAction } from '@/types';

interface Props { magasinNom: string; onAddAction?: (action: PAPAction) => void; }

type FreqKey = 'quotidien' | '4x' | '3x' | '2x' | '1x' | 'mensuel';
interface RoutineDef { id: string; label: string; freq: FreqKey; detail: string; monthly?: boolean; }
interface BlocDef { icon: string; title: string; subtitle: string; headerBg: string; routines: RoutineDef[]; }
interface CustomRoutine extends RoutineDef { blocTitle: string; isCustom: true; }
type WeekData = Record<string, boolean[]>;

const FREQ_DEFAULTS: Record<FreqKey, number> = { quotidien: 5, '4x': 4, '3x': 3, '2x': 2, '1x': 1, mensuel: 0 };
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

const BLOCS: BlocDef[] = [
  {
    icon: '💰', title: 'Vente',
    subtitle: 'Transformer les flux et encaisser la valeur chaque jour',
    headerBg: 'bg-green-50',
    routines: [
      { id: 'v1', label: 'Brief équipe matin sur les ventes de la veille', freq: 'quotidien',
        detail: "Chaque matin, 5 min debout avec l'équipe : CA de la veille, objectif du jour, focus Estaly + accessoires. Sans brief, la journée s'organise par défaut." },
      { id: 'v2', label: 'Estaly proposé systématiquement (high-tech, gaming, bijou, montres)', freq: 'quotidien',
        detail: 'Objectif : 100% des ventes éligibles avec proposition Estaly. Script : "Je vous propose aussi l\'extension garantie 3 ou 5 ans…" Levier direct sur marge nette. Cible : 2 à 3 contrats/jour.' },
      { id: 'v3', label: 'Suivi contrats Estaly du jour (cible 2-3/j)', freq: 'quotidien',
        detail: 'Tracker les contrats Estaly vendus chaque jour. Affichage visible en back-office. L\'équipe qui voit son score en temps réel fait 40% mieux que celle qui ne le voit pas.' },
      { id: 'v4', label: 'Mesure taux de transformation du jour (cible 8-12% CDV)', freq: 'quotidien',
        detail: 'Athéna → Tableau de bord → Taux de transformation. Objectif centre-ville : 8-12%. Zone commerciale : ajuster selon flux. Sous 5% → brief argumentation immédiat.' },
      { id: 'v5', label: 'Vente additionnelle TLAC : hydrogels, chargeurs rapides, films', freq: 'quotidien',
        detail: 'Sur chaque vente téléphonie : proposer protection écran hydrogel + chargeur rapide. "Votre téléphone est nu sans protection — voici ce qui se vend le mieux." La TLAC finance les salaires.' },
      { id: 'v6', label: 'Lecture discours réassurance (garantie 2 ans, SOR 30j, tests)', freq: '1x',
        detail: 'Hebdo avec l\'équipe : rappel des 4 arguments Easy Cash — garantie 2 ans, SOR 30 jours, produits testés, authentifiés. Ces arguments différencient Easy Cash du particulier. Maitrise = conversion.' },
      { id: 'v7', label: 'Revue objectifs commerciaux du mois avec l\'équipe', freq: 'mensuel', monthly: true,
        detail: 'Chaque 1er du mois : afficher objectifs CA, Estaly, transformation, NPS + état au J1 + primes si atteintes. L\'équipe engagée sur ses objectifs est plus performante.' },
    ],
  },
  {
    icon: '🛒', title: 'Achat',
    subtitle: 'Alimenter le stock en continu et optimiser le sourcing',
    headerBg: 'bg-[#FFF5F5]',
    routines: [
      { id: 'a1', label: 'Application VPD — 5 questions clés avant de fixer le prix', freq: 'quotidien',
        detail: 'Valorisation Partagée Différenciée : Famille majeure ? Nouveauté ? Top vente ? Forte rotation ? Concurrence sur le rachat ? Ces 5 questions structurent le prix. Sans elles, on laisse de la marge sur la table.' },
      { id: 'a2', label: 'Test Piceasoft 100% téléphones rachetés (batterie ≥ 80%)', freq: 'quotidien',
        detail: 'Aucun téléphone ne rentre en stock sans test Piceasoft complet. Batterie < 80% = renégociation du prix. Un téléphone non testé est un produit retourné en puissance.' },
      { id: 'a3', label: 'Demande avis Google en fin de transaction d\'achat', freq: 'quotidien',
        detail: 'Script achat : "Avez-vous 30 secondes pour nous laisser un avis Google ? Ça aide les autres clients à nous trouver." Les clients vendeurs laissent des avis sincères — souvent meilleurs que les acheteurs.' },
      { id: 'a4', label: 'Création / MAJ fiche client Athéna (mail + téléphone)', freq: 'quotidien',
        detail: 'Chaque transaction = fiche client complète dans Athéna avec mail et téléphone. La base CRM bien tenue est le premier actif immatériel du magasin. Elle conditionne aussi le taux de démarque.' },
      { id: 'a5', label: 'Brief acheteurs sur les 3 modèles à sourcer en priorité', freq: 'quotidien',
        detail: 'Chaque matin : identifier les 3 modèles les plus manquants en gamme et briefer l\'équipe achat. "Aujourd\'hui on cherche iPhone 15, PS5 et Samsung A55." Focus = efficacité sourcing.' },
      { id: 'a6', label: 'Lecture journal des achats avec l\'équipe', freq: '1x',
        detail: 'Hebdomadaire : passer en revue les achats de la semaine. Quel acheteur a le meilleur ratio ? Quels produits sur-payés ? Retour formatif pour chaque acheteur, sur données réelles.' },
      { id: 'a7', label: 'Audit acheteur : VPD, test Piceasoft, fidélisation client', freq: 'mensuel', monthly: true,
        detail: 'Chaque mois, auditer un acheteur sur 5 axes : Application VPD, test Piceasoft systématique, demande avis Google, saisie fiche client Athéna, brief modèles prioritaires. Support individuel de recadrage.' },
    ],
  },
  {
    icon: '📦', title: 'Stock',
    subtitle: 'Piloter la rotation et éliminer le vieux stock',
    headerBg: 'bg-orange-50',
    routines: [
      { id: 's1', label: 'Contrôle des entrées en stock du jour', freq: 'quotidien',
        detail: 'Chaque soir : valider que chaque produit racheté est bien saisi en stock et correctement rattaché à une famille et une côte. Un stock mal saisi = pilotage aveugle des KPIs.' },
      { id: 's2', label: 'Identification des 20 produits qui immobilisent le plus de cash', freq: '1x',
        detail: 'Athéna → Stock → Tri par valeur d\'immobilisation. Le TOP 20 valeur immobilise souvent 60% du cash stock. Chaque semaine, 1 action sur ce TOP 20 = 50 mouvements cash/an.' },
      { id: 's3', label: 'Mode Accélération Athéna sur produits qui ne tournent pas', freq: '1x',
        detail: 'Athéna → Mode Accélération → identifier les produits non vendus en 15 jours. Activer la démarque progressive. Ce n\'est pas une perte : c\'est du cash récupéré avant que ce soit pire.' },
      { id: 's4', label: 'Baisse progressive -10%/semaine sur invendus depuis 15 jours', freq: '1x',
        detail: 'Règle Easy Cash : -10% par semaine sur tout produit non vendu depuis 15 jours, plutôt qu\'attendre 6 mois et subir -30% d\'un coup. L\'anticipation préserve la marge nette globale.' },
      { id: 's5', label: 'FIFO strict en réserve (téléphonie & consoles)', freq: '1x',
        detail: 'FIFO = First In First Out. En réserve téléphonie et consoles : la date d\'achat la plus ancienne va en vitrine en premier. La rotation naturelle évite le stock âgé structurel.' },
      { id: 's6', label: 'Point cash hebdomadaire : encaissé / dépensé / variation', freq: '1x',
        detail: 'Chaque semaine : cash encaissé (ventes) vs cash dépensé (achats). Variation = pilote de trésorerie. Si variation négative 2 semaines de suite → déstockage prioritaire, frein aux achats.' },
      { id: 's7', label: 'Identification stock âgé +6 mois et +12 mois', freq: 'mensuel', monthly: true,
        detail: 'Chaque mois : éditer depuis Athéna la liste du stock âgé +6 mois et +12 mois. Définir un plan de sortie pour chacun : remise ciblée, revendeur réseau, ou perte acceptée et documentée.' },
    ],
  },
  {
    icon: '🌐', title: 'Web',
    subtitle: 'Alimenter le catalogue digital et la réputation en ligne',
    headerBg: 'bg-blue-50',
    routines: [
      { id: 'w1', label: 'Vérification publication EC.fr — rattachement systématique', freq: 'quotidien',
        detail: 'Chaque jour : vérifier que chaque produit racheté la veille est publié sur EC.fr avec photo et description conformes. 1 jour de délai = 1 jour sans visibilité web = vente manquée.' },
      { id: 'w2', label: 'Réponse aux cotations manuelles via Dashboard EC.fr', freq: 'quotidien',
        detail: 'Traiter les demandes de cotation en attente sur EC.fr. Réponse < 2h = taux de conversion 3× supérieur. Au-delà, le client a acheté ailleurs ou rachat à un concurrent.' },
      { id: 'w3', label: 'Sourcing marketplaces (EC.fr, LBC, Vinted, Momox) — 15 min max', freq: 'quotidien',
        detail: '15 minutes par jour de sourcing actif sur les marketplaces pour les modèles manquants en gamme. Délimitez le temps : au-delà de 15 min, la rentabilité s\'effondre.' },
      { id: 'w4', label: 'Réponse aux avis Google sous 24h', freq: 'quotidien',
        detail: 'Répondre à TOUS les avis sous 24h : remerciement personnalisé pour les positifs, résolution + contact pour les négatifs. Une réponse soignée à un avis 1★ convertit mieux qu\'une note parfaite.' },
      { id: 'w5', label: 'Publication bijoux sur EasyBiz (3×/semaine)', freq: '3x',
        detail: '3 publications bijouterie par semaine sur EasyBiz : photo fond blanc, titre avec matière et poids, prix compétitif. La bijouterie est la famille avec le meilleur ratio temps/marge en ligne.' },
      { id: 'w6', label: 'Publications FB/Instagram — rachat ciblé + bonnes affaires', freq: '4x',
        detail: 'Minimum 4 publications par semaine : opérations de rachat ciblé + bonnes affaires du moment. Les stories "on rachète" génèrent du trafic entrant. Format : photo produit + prix barré + CTA.' },
      { id: 'w7', label: 'Suivi indicateurs digitaux (conversion, panier moyen, annulations)', freq: 'mensuel', monthly: true,
        detail: 'Chaque mois : taux de conversion EC.fr, panier moyen en ligne, taux d\'annulation (cible ≤ 5%). Ces 3 KPIs suffisent pour piloter le digital. Tout le reste est bruit.' },
    ],
  },
  {
    icon: '👥', title: 'Management',
    subtitle: "Ritualiser l'équipe et développer les compétences",
    headerBg: 'bg-amber-50',
    routines: [
      { id: 'mg1', label: 'Tour magasin matin — regard client (abords, vitrines, propreté)', freq: 'quotidien',
        detail: 'Chaque matin avant ouverture : faire le tour avec les yeux d\'un client. Abords propres ? Vitrines attractives ? Signalétique conforme ? Ce que le client voit en premier conditionne la suite.' },
      { id: 'mg2', label: 'Zoning équipe selon flux client attendu', freq: 'quotidien',
        detail: 'Placer la bonne personne au bon poste selon le flux attendu. Pics : renforcer accueil et caisse. Creux : sourcing et web. Un mauvais zoning = file d\'attente + vente manquée.' },
      { id: 'mg3', label: 'Présence en surface de vente aux pics de fréquentation', freq: 'quotidien',
        detail: 'Vous = sur le terrain aux heures de pointe (12h-14h, 17h-19h). La présence managériale sur le terrain augmente le taux de transformation de 15% en moyenne. Le back-office peut attendre.' },
      { id: 'mg4', label: 'Lecture indicateurs satisfaction (Critizr, Google, NPS)', freq: '1x',
        detail: 'Chaque semaine : Critizr, note Google, NPS. Identifier les points de friction récurrents. 1 insatisfait silencieux = 10 clients potentiels perdus. Agir avant que ça se voit sur la note.' },
      { id: 'mg5', label: 'Point individuel mensuel (résultats, motivation, projet)', freq: 'mensuel', monthly: true,
        detail: '15-30 min en tête-à-tête par mois et par collaborateur : résultats, satisfaction, formation souhaitée. L\'entretien qui n\'a pas lieu laisse les signaux faibles devenir des démissions.' },
    ],
  },
  {
    icon: '🎯', title: 'GPA — Gamme · Prix · Animation',
    subtitle: 'Piloter les 3 leviers structurels de la performance',
    headerBg: 'bg-purple-50',
    routines: [
      { id: 'g1', label: 'Vérification côte EasyPrice sur produits entrés la veille', freq: 'quotidien',
        detail: 'Via Athéna : vérifier que le prix de vente affiché = côte EasyPrice réseau. Chaque écart non détecté = marge perdue ou vente bloquée. La côte est mise à jour par le réseau — suivez-la.' },
      { id: 'g2', label: 'MAJ prix via Zebra sur les écarts identifiés', freq: 'quotidien',
        detail: 'Après vérification côte : mettre à jour physiquement les étiquettes prix via la Zebra. Un prix obsolète en vitrine = frein de vente invisible. Délai max : 24h après tout changement de côte.' },
      { id: 'g3', label: 'Couverture de gamme — vérifier les Stock Max 0 (Intranet)', freq: '1x',
        detail: 'Intranet → Gestion magasin → Gamme référence → Stock Max 0. Ce sont vos trous de gamme. Chaque trou identifié = sourcing à déclencher cette semaine. TLCE : 100% couverture = 60% du volume.' },
      { id: 'g4', label: 'Appel de stock écrit en vitrine sur modèles déficitaires (PA Max)', freq: '1x',
        detail: 'Sur les 2-3 modèles les plus manquants : afficher en vitrine "On rachète : [modèle] — Prix annoncé : [PA Max]". Maximum 2 appels par vitrine pour éviter la dilution du message.' },
      { id: 'g5', label: 'Mise en avant Bonnes Affaires (prix barré, étiquette jaune)', freq: '1x',
        detail: 'Chaque semaine : 3 produits en tête de vitrine avec prix barré + étiquette jaune Easy Cash. Ce que l\'œil voit, la main prend. Rotation hebdomadaire = effet nouveauté permanent.' },
      { id: 'g6', label: 'Mise en avant Nouveautés et Coup de cœur (PLV)', freq: '1x',
        detail: 'Alterner Nouveautés (produits entrés < 7j) et Coups de cœur (sélection subjective de qualité). La théâtralisation vitrine différencie Easy Cash des braderies en ligne.' },
      { id: 'g7', label: 'Lecture conjointe journal achat-vente — performances famille', freq: '1x',
        detail: 'Chaque semaine avec l\'équipe : quelles familles ont bien tourné ? Lesquelles stagnent ? Cette lecture collective aligne tout le monde sur les priorités d\'achat et d\'animation.' },
    ],
  },
];

const ALL_ROUTINES = BLOCS.flatMap(b => b.routines);

// ── Inventaires tournants ─────────────────────────────────────────────────────
interface InvFamille { code: string; label: string; special?: string; }
interface InvGroupe {
  id: string; badge: string; badgeCls: string; subBg: string;
  freq: 'monthly' | 'bimonthly' | 'yearly'; familles: InvFamille[];
}

const INV_GROUPES: InvGroupe[] = [
  {
    id: 'a', badge: '🔴 1 fois par mois',
    badgeCls: 'bg-red-100 text-red-700 border-red-200', subBg: 'bg-red-50/40', freq: 'monthly',
    familles: [
      { code: 'BOR',   label: 'Bijouterie — Or' },
      { code: 'BOPI',  label: 'Bijouterie — Op. Immédiate' },
      { code: 'BARG',  label: 'Bijouterie — Argent' },
      { code: 'BMON',  label: 'Bijouterie — Montres' },
      { code: 'BSBL',  label: 'Bijouterie — SBL' },
      { code: 'JCDR',  label: 'JV — CD Rom' },
      { code: 'JCON',  label: 'JV — Consoles' },
      { code: 'IPOR',  label: 'Info — Portables' },
      { code: 'ITAB',  label: 'Info — Tablettes' },
      { code: 'IMIC',  label: 'Info — Micro' },
      { code: 'MANGA', label: 'Manga' },
      { code: 'TLCE',  label: 'Téléphonie — CE', special: '2×/mois' },
    ],
  },
  {
    id: 'b', badge: '🟠 6 fois par an',
    badgeCls: 'bg-orange-100 text-orange-700 border-orange-200', subBg: 'bg-orange-50/40', freq: 'bimonthly',
    familles: [
      { code: 'BPLA', label: 'Bijouterie — Plaqué' },
      { code: 'BMAR', label: 'Bijouterie — Marque' },
      { code: 'JPOR', label: 'JV — Portables' },
      { code: 'IPER', label: 'Info — Périphériques' },
      { code: 'IACC', label: 'Info — Accessoires' },
      { code: 'TLAC', label: 'Téléphonie — Accessoires' },
    ],
  },
  {
    id: 'c', badge: '🟢 1 fois par an',
    badgeCls: 'bg-green-100 text-green-700 border-green-200', subBg: 'bg-green-50/40', freq: 'yearly',
    familles: [
      { code: 'DVD',  label: 'LS — DVD' },
      { code: 'ABLU', label: 'LS — Blu-Ray' },
      { code: 'LLIV', label: 'Livres' },
      { code: 'BD',   label: 'BD' },
    ],
  },
];

function getInvRowStatus(checks: boolean[], freq: 'monthly' | 'bimonthly' | 'yearly', upToMonth: number): 'green' | 'orange' | 'gray' {
  const done = checks.slice(0, upToMonth + 1).filter(Boolean).length;
  if (freq === 'yearly') return done >= 1 ? 'green' : 'gray';
  const expected = freq === 'monthly' ? upToMonth + 1 : Math.ceil((upToMonth + 1) / 2);
  if (done === 0) return 'gray';
  return done >= expected ? 'green' : 'orange';
}

// ── Helpers semaine ───────────────────────────────────────────────────────────
function getWeekMonday(offset: number): Date {
  const now = new Date();
  const dow = now.getDay();
  const toMon = dow === 0 ? -6 : 1 - dow;
  const d = new Date(now);
  d.setDate(now.getDate() + toMon + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekKey(offset: number): string {
  const mon = getWeekMonday(offset);
  const thu = new Date(mon);
  thu.setDate(mon.getDate() + 3);
  const w1 = new Date(thu.getFullYear(), 0, 4);
  const wn = 1 + Math.round(((thu.getTime() - w1.getTime()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
  return `${thu.getFullYear()}-W${String(wn).padStart(2, '0')}`;
}

function formatWeekLabel(offset: number): string {
  const mon = getWeekMonday(offset);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date, year?: boolean) =>
    d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
  return `${fmt(mon)} — ${fmt(sun, true)}`;
}

function loadWeek(nom: string, off: number): WeekData {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`routines_${nom}_${getWeekKey(off)}`);
    return raw ? JSON.parse(raw) as WeekData : {};
  } catch { return {}; }
}

function computeScore(data: WeekData, cibles: Record<string, number>, allR: RoutineDef[] = ALL_ROUTINES): number {
  const scoreable = allR.filter(r => (cibles[r.id] ?? FREQ_DEFAULTS[r.freq]) > 0);
  if (scoreable.length === 0) return 0;
  const met = scoreable.filter(r => {
    const target = cibles[r.id] ?? FREQ_DEFAULTS[r.freq];
    return (data[r.id] ?? []).filter(Boolean).length >= target;
  }).length;
  return Math.round(met / scoreable.length * 100);
}

// ── Context export for AssistantIA ────────────────────────────────────────────
export function getRoutinesContext(magasinNom: string): string {
  try {
    const cibles: Record<string, number> = (() => {
      try { const s = localStorage.getItem(`cibles_routines_${magasinNom}`); return s ? JSON.parse(s) as Record<string, number> : {}; } catch { return {}; }
    })();
    const deletedIds: string[] = (() => {
      try { const s = localStorage.getItem(`routines_deleted_${magasinNom}`); return s ? JSON.parse(s) as string[] : []; } catch { return []; }
    })();
    const customRoutines: CustomRoutine[] = (() => {
      try { const s = localStorage.getItem(`routines_custom_${magasinNom}`); return s ? JSON.parse(s) as CustomRoutine[] : []; } catch { return []; }
    })();
    const weekData = loadWeek(magasinNom, 0);
    if (Object.keys(weekData).length === 0) return '';
    const lines: string[] = ['\nRoutines de la semaine en cours :'];
    for (const bloc of BLOCS) {
      const blocRoutines: RoutineDef[] = [
        ...bloc.routines.filter(r => !deletedIds.includes(r.id)),
        ...customRoutines.filter(c => c.blocTitle === bloc.title),
      ];
      const blocLines: string[] = [];
      for (const r of blocRoutines) {
        const target = cibles[r.id] ?? FREQ_DEFAULTS[r.freq];
        if (target === 0) continue;
        const done = (weekData[r.id] ?? []).filter(Boolean).length;
        const status = done >= target ? '✅' : done > 0 ? '🔶' : '❌';
        blocLines.push(`  ${status} ${r.label} : ${done}/${target}`);
      }
      if (blocLines.length > 0) {
        lines.push(`${bloc.icon} ${bloc.title} :`);
        lines.push(...blocLines);
      }
    }
    return lines.join('\n');
  } catch { return ''; }
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function Routines({ magasinNom, onAddAction }: Props) {
  const [offset, setOffset] = useState(0);
  const [weekData, setWeekData] = useState<WeekData>(() => loadWeek(magasinNom, 0));
  const [tooltipId, setTooltipId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'semaine' | 'mois' | 'trimestre'>('semaine');

  const [cibles, setCibles] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const s = localStorage.getItem(`cibles_routines_${magasinNom}`);
      return s ? JSON.parse(s) as Record<string, number> : {};
    } catch { return {}; }
  });

  const [deletedIds, setDeletedIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { const s = localStorage.getItem(`routines_deleted_${magasinNom}`); return s ? JSON.parse(s) as string[] : []; } catch { return []; }
  });

  const [customRoutines, setCustomRoutines] = useState<CustomRoutine[]>(() => {
    if (typeof window === 'undefined') return [];
    try { const s = localStorage.getItem(`routines_custom_${magasinNom}`); return s ? JSON.parse(s) as CustomRoutine[] : []; } catch { return []; }
  });

  const [addingToBlocTitle, setAddingToBlocTitle] = useState<string | null>(null);
  const [addLabel, setAddLabel] = useState('');
  const [addFreq, setAddFreq] = useState<FreqKey>('1x');

  const [customLabels, setCustomLabels] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const s = localStorage.getItem(`routines_labels_${magasinNom}`);
      return s ? JSON.parse(s) as Record<string, string> : {};
    } catch { return {}; }
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  function getBlocRoutines(bloc: BlocDef): RoutineDef[] {
    return [
      ...bloc.routines.filter(r => !deletedIds.includes(r.id)),
      ...customRoutines.filter(c => c.blocTitle === bloc.title),
    ];
  }

  function deleteRoutine(id: string, isCustom: boolean) {
    if (isCustom) {
      const next = customRoutines.filter(c => c.id !== id);
      setCustomRoutines(next);
      try { localStorage.setItem(`routines_custom_${magasinNom}`, JSON.stringify(next)); } catch {}
    } else {
      const next = [...deletedIds, id];
      setDeletedIds(next);
      try { localStorage.setItem(`routines_deleted_${magasinNom}`, JSON.stringify(next)); } catch {}
    }
  }

  function confirmAddRoutine(blocTitle: string) {
    const trimmed = addLabel.trim();
    if (!trimmed) return;
    const newR: CustomRoutine = { id: `custom_${Date.now()}`, label: trimmed, freq: addFreq, detail: '', blocTitle, isCustom: true };
    const next = [...customRoutines, newR];
    setCustomRoutines(next);
    try { localStorage.setItem(`routines_custom_${magasinNom}`, JSON.stringify(next)); } catch {}
    setAddLabel('');
    setAddFreq('1x');
    setAddingToBlocTitle(null);
  }

  function startEdit(id: string, currentLabel: string) {
    setEditingId(id);
    setEditValue(customLabels[id] ?? currentLabel);
  }
  function saveLabel(id: string) {
    const trimmed = editValue.trim();
    const next = { ...customLabels };
    if (trimmed) next[id] = trimmed; else delete next[id];
    setCustomLabels(next);
    try { localStorage.setItem(`routines_labels_${magasinNom}`, JSON.stringify(next)); } catch {}
    setEditingId(null);
  }
  function getLabel(r: RoutineDef) { return customLabels[r.id] ?? r.label; }

  // ── Inventaires state ───────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const [invYear, setInvYear] = useState(currentYear);
  const [invData, setInvData] = useState<Record<string, boolean[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(`inventaires_${magasinNom}_${currentYear}`);
      return raw ? JSON.parse(raw) as Record<string, boolean[]> : {};
    } catch { return {}; }
  });

  function changeInvYear(year: number) {
    setInvYear(year);
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`inventaires_${magasinNom}_${year}`);
        setInvData(raw ? JSON.parse(raw) as Record<string, boolean[]> : {});
      } catch { setInvData({}); }
    }
  }

  function toggleInv(code: string, monthIdx: number) {
    const prev = invData[code] ?? new Array<boolean>(12).fill(false);
    const next = [...prev] as boolean[];
    next[monthIdx] = !next[monthIdx];
    const newData = { ...invData, [code]: next };
    setInvData(newData);
    localStorage.setItem(`inventaires_${magasinNom}_${invYear}`, JSON.stringify(newData));
  }

  const invCurrentMonth = new Date().getMonth();
  const invIsCurrentYear = invYear === currentYear;
  const invUpToMonth = invIsCurrentYear ? invCurrentMonth : 11;

  let invFait = 0, invPreconise = 0;
  for (const groupe of INV_GROUPES) {
    for (const f of groupe.familles) {
      const checks = (invData[f.code] ?? []) as boolean[];
      invFait += checks.slice(0, invUpToMonth + 1).filter(Boolean).length;
      if (groupe.freq === 'monthly') invPreconise += invUpToMonth + 1;
      else if (groupe.freq === 'bimonthly') invPreconise += Math.ceil((invUpToMonth + 1) / 2);
      else invPreconise += 1;
    }
  }
  const invPct = invPreconise > 0 ? Math.round(invFait / invPreconise * 100) : 0;

  // ── Routines handlers ───────────────────────────────────────────────────────
  function goWeek(delta: number) {
    if (delta > 0 && offset >= 0) return;
    const next = offset + delta;
    setOffset(next);
    setWeekData(loadWeek(magasinNom, next));
  }

  function toggle(routineId: string, dayIdx: number) {
    const prev: boolean[] = weekData[routineId] ?? new Array<boolean>(7).fill(false);
    const next = [...prev] as boolean[];
    next[dayIdx] = !next[dayIdx];
    const newData = { ...weekData, [routineId]: next };
    setWeekData(newData);
    localStorage.setItem(`routines_${magasinNom}_${getWeekKey(offset)}`, JSON.stringify(newData));
  }

  function updateCible(routineId: string, value: number) {
    const next = { ...cibles, [routineId]: Math.min(7, Math.max(0, value)) };
    setCibles(next);
    localStorage.setItem(`cibles_routines_${magasinNom}`, JSON.stringify(next));
  }

  function getTarget(routine: RoutineDef): number {
    return cibles[routine.id] ?? FREQ_DEFAULTS[routine.freq];
  }

  function getStatus(routine: RoutineDef, days: boolean[]): 'done' | 'partial' | 'none' {
    const target = getTarget(routine);
    const checked = days.filter(Boolean).length;
    if (target === 0) return 'none';
    if (checked >= target) return 'done';
    if (checked * 2 >= target) return 'partial';
    return 'none';
  }

  const effectiveAllRoutines = useMemo(
    () => BLOCS.flatMap(b => getBlocRoutines(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deletedIds, customRoutines]
  );

  const scoreableRoutines = effectiveAllRoutines.filter(r => getTarget(r) > 0);
  const pct = computeScore(weekData, cibles, effectiveAllRoutines);
  const metCount = scoreableRoutines.filter(r => {
    const target = getTarget(r);
    return (weekData[r.id] ?? []).filter(Boolean).length >= target;
  }).length;

  const history = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const off = i - 11;
      const d = loadWeek(magasinNom, off);
      const hasData = Object.keys(d).length > 0;
      return { off, pct: computeScore(d, cibles, effectiveAllRoutines), hasData };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magasinNom, weekData, cibles, effectiveAllRoutines]);

  const withData = history.filter(h => h.hasData);
  let progressMsg = '';
  if (withData.length >= 2) {
    const diff = withData[withData.length - 1].pct - withData[0].pct;
    progressMsg = diff > 5
      ? `Vous avez progressé de ${diff} points en ${withData.length} semaines.`
      : 'Votre rythme se maintient.';
  }

  // 4-week average for +PAP check
  const last4Scores = history.slice(-4).map(h => h.pct);
  const avg4 = Math.round(last4Scores.reduce((a, b) => a + b, 0) / last4Scores.length);

  // Monthly/quarterly aggregated view data
  const aggData = useMemo(() => {
    const weeks = viewMode === 'mois' ? 4 : 13;
    const allWeeks = Array.from({ length: weeks }, (_, i) => loadWeek(magasinNom, i - (weeks - 1)));
    return effectiveAllRoutines.map(r => {
      const target = getTarget(r);
      if (target === 0) return { r, done: 0, expected: 0, pct: 0 };
      const done = allWeeks.reduce((s, w) => s + (w[r.id] ?? []).filter(Boolean).length, 0);
      const expected = target * weeks;
      return { r, done, expected, pct: Math.round(done / expected * 100) };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magasinNom, viewMode, weekData, cibles, effectiveAllRoutines]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1A1A1A]">
            🔁 Routines{magasinNom ? ` — ${magasinNom}` : ''}
          </h2>
          <p className="text-sm text-[#6B7280] mt-0.5">6 domaines · {effectiveAllRoutines.length} routines · Cochez chaque jour les actions accomplies pour ancrer vos automatismes.</p>
        </div>
        {/* View selector */}
        <div className="flex rounded-xl border border-[#E0E0E0] overflow-hidden bg-white shadow-sm flex-shrink-0">
          {(['semaine', 'mois', 'trimestre'] as const).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                viewMode === v ? 'bg-[#E30613] text-white' : 'text-[#6B7280] hover:text-[#1A1A1A]'
              }`}
            >
              {v === 'semaine' ? 'Semaine' : v === 'mois' ? 'Mois' : 'Trimestre'}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation semaine */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm px-4 py-3 flex items-center justify-between gap-3">
        <button
          onClick={() => goWeek(-1)}
          className="px-3 py-2 text-sm font-semibold text-[#1A1A1A] bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg hover:bg-[#EBEBEB] transition-colors flex-shrink-0"
        >
          ← Précédente
        </button>
        <div className="text-center flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#1A1A1A] truncate">{formatWeekLabel(offset)}</div>
          <div className={`text-xs font-bold mt-0.5 ${offset === 0 ? 'text-[#E30613]' : 'text-[#6B7280]'}`}>
            {offset === 0 ? 'Semaine en cours' : 'Historique'}
          </div>
        </div>
        <button
          onClick={() => goWeek(1)}
          disabled={offset >= 0}
          className={`px-3 py-2 text-sm font-semibold rounded-lg border flex-shrink-0 transition-colors ${
            offset >= 0
              ? 'text-[#D1D5DB] border-[#E0E0E0] cursor-not-allowed'
              : 'text-[#1A1A1A] bg-[#F5F5F5] border-[#E0E0E0] hover:bg-[#EBEBEB]'
          }`}
        >
          Suivante →
        </button>
      </div>

      {/* Monthly / quarterly aggregated view */}
      {viewMode !== 'semaine' && (
        <div className="space-y-4">
          <p className="text-xs text-[#6B7280]">
            {viewMode === 'mois' ? 'Synthèse des 4 dernières semaines' : 'Synthèse des 13 dernières semaines'} — lecture seule.
          </p>
          {BLOCS.map(bloc => {
            const blocEffective = getBlocRoutines(bloc);
            const blocAgg = aggData.filter(a => blocEffective.some(r => r.id === a.r.id));
            const blocPct = blocAgg.length ? Math.round(blocAgg.reduce((s, a) => s + a.pct, 0) / blocAgg.length) : 0;
            return (
              <div key={bloc.title} className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
                <div className={`px-4 py-2.5 ${bloc.headerBg} border-b border-[#E0E0E0] flex items-center justify-between`}>
                  <div>
                    <span className="font-bold text-sm text-[#1A1A1A]">{bloc.icon} {bloc.title}</span>
                  </div>
                  <span className={`text-sm font-black ${blocPct >= 80 ? 'text-green-600' : blocPct >= 50 ? 'text-orange-500' : 'text-red-600'}`}>{blocPct}%</span>
                </div>
                <div className="divide-y divide-[#F0F0F0]">
                  {blocAgg.map(({ r, done, expected, pct: rPct }) => (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex-1 text-xs text-[#1A1A1A]">{getLabel(r)}</span>
                      <span className="text-xs text-[#6B7280]">{done}/{expected}</span>
                      <span className={`text-xs font-bold w-10 text-right ${rPct >= 80 ? 'text-green-600' : rPct >= 50 ? 'text-orange-500' : expected > 0 ? 'text-red-600' : 'text-[#9CA3AF]'}`}>
                        {expected > 0 ? `${rPct}%` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Weekly view — 6 blocs routines */}
      {viewMode === 'semaine' && BLOCS.map(bloc => (
        <div key={bloc.title} className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-visible">
          <div className={`px-4 py-3 ${bloc.headerBg} border-b border-[#E0E0E0] rounded-t-xl flex items-start justify-between gap-3`}>
            <div>
              <h3 className="font-bold text-sm text-[#1A1A1A]">{bloc.icon} {bloc.title}</h3>
              <p className="text-xs text-[#6B7280] mt-0.5">{bloc.subtitle}</p>
            </div>
            <button
              onClick={() => setAddingToBlocTitle(addingToBlocTitle === bloc.title ? null : bloc.title)}
              className="text-xs text-[#E30613] border border-[#E30613] rounded-full px-2.5 py-0.5 hover:bg-red-50 transition-colors font-semibold flex-shrink-0 mt-0.5"
            >
              + Ajouter
            </button>
          </div>
          {addingToBlocTitle === bloc.title && (
            <div className="px-4 py-3 bg-[#FFFAF5] border-b border-[#E0E0E0] flex items-center gap-2 flex-wrap">
              <input
                autoFocus
                placeholder="Intitulé de la routine..."
                value={addLabel}
                onChange={e => setAddLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmAddRoutine(bloc.title); if (e.key === 'Escape') setAddingToBlocTitle(null); }}
                className="flex-1 text-xs border border-[#E0E0E0] rounded px-2.5 py-1.5 focus:outline-none focus:border-[#E30613] min-w-[140px]"
              />
              <select
                value={addFreq}
                onChange={e => setAddFreq(e.target.value as FreqKey)}
                className="text-xs border border-[#E0E0E0] rounded px-2 py-1.5 focus:outline-none bg-white"
              >
                <option value="quotidien">Quotidien</option>
                <option value="4x">4×/sem</option>
                <option value="3x">3×/sem</option>
                <option value="2x">2×/sem</option>
                <option value="1x">1×/sem</option>
                <option value="mensuel">Mensuel</option>
              </select>
              <button onClick={() => confirmAddRoutine(bloc.title)} className="text-xs text-white bg-[#E30613] rounded-full px-3 py-1 font-semibold hover:bg-red-700 transition-colors">Ajouter</button>
              <button onClick={() => setAddingToBlocTitle(null)} className="text-xs text-[#9CA3AF] hover:text-[#1A1A1A]">Annuler</button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ overflowX: 'visible' }}>
              <thead>
                <tr className="border-b border-[#E0E0E0] bg-[#FAFAFA]">
                  <th className="text-left px-4 py-2 text-[#6B7280] font-semibold min-w-[220px]">Routine</th>
                  {DAYS.map(d => (
                    <th key={d} className="text-center px-1 py-2 text-[#6B7280] font-semibold w-10">{d}</th>
                  ))}
                  <th className="text-center px-3 py-2 text-[#6B7280] font-semibold w-24 whitespace-nowrap">Cible/sem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {getBlocRoutines(bloc).map(routine => {
                  const days = Array.from({ length: 7 }, (_, i) => !!(weekData[routine.id]?.[i]));
                  const status = getStatus(routine, days);
                  const target = getTarget(routine);
                  const checked = days.filter(Boolean).length;
                  const isTooltipOpen = tooltipId === routine.id;
                  return (
                    <tr key={routine.id} className={status === 'done' ? 'bg-green-50/40' : ''}>
                      <td className="px-4 py-3">
                        <div className="relative">
                          {editingId === routine.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                autoFocus
                                className="flex-1 text-xs border border-[#E30613] rounded px-2 py-1 focus:outline-none bg-white"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => saveLabel(routine.id)}
                                onKeyDown={e => { if (e.key === 'Enter') saveLabel(routine.id); if (e.key === 'Escape') setEditingId(null); }}
                              />
                              <button onClick={() => saveLabel(routine.id)} className="text-[10px] text-green-600 font-bold px-1">✓</button>
                              <button onClick={() => setEditingId(null)} className="text-[10px] text-[#9CA3AF] px-1">✕</button>
                            </div>
                          ) : (
                            <div className="flex items-start gap-1.5 flex-wrap">
                              <span className={`text-xs leading-snug ${
                                status === 'done' ? 'text-green-700 font-medium' :
                                status === 'partial' ? 'text-orange-600' :
                                'text-[#6B7280]'
                              }`}>
                                {getLabel(routine)}
                                {customLabels[routine.id] && <span className="ml-1 text-[9px] text-[#E30613]">✎</span>}
                              </span>
                              {routine.monthly && (
                                <span className="text-[9px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded-full whitespace-nowrap leading-none self-center">
                                  mensuel
                                </span>
                              )}
                              <button
                                onClick={() => startEdit(routine.id, routine.label)}
                                className="text-[#D0D0D0] hover:text-[#E30613] transition-colors text-[11px] leading-none self-center flex-shrink-0"
                                title="Renommer cette routine"
                                aria-label="Renommer"
                              >
                                ✎
                              </button>
                              {routine.detail && (
                                <button
                                  onClick={() => setTooltipId(isTooltipOpen ? null : routine.id)}
                                  className="text-[#C0C0C0] hover:text-[#6B7280] transition-colors text-[11px] leading-none self-center flex-shrink-0"
                                  title={routine.detail}
                                  aria-label="Voir le détail"
                                >
                                  ℹ
                                </button>
                              )}
                              <button
                                onClick={() => deleteRoutine(routine.id, !!(routine as CustomRoutine).isCustom)}
                                className="text-[#D0D0D0] hover:text-red-500 transition-colors text-[12px] leading-none self-center flex-shrink-0"
                                title="Supprimer cette routine"
                                aria-label="Supprimer"
                              >
                                🗑
                              </button>
                            </div>
                          )}
                          {isTooltipOpen && editingId !== routine.id && (
                            <div className="mt-2 bg-[#1A1A1A] text-white text-[11px] p-3 rounded-xl shadow-xl leading-relaxed z-30 max-w-xs">
                              {routine.detail}
                            </div>
                          )}
                        </div>
                      </td>
                      {days.map((isChecked, i) => (
                        <td key={i} className="text-center px-0.5 py-2">
                          <button
                            onClick={() => toggle(routine.id, i)}
                            aria-label={`${routine.label} — ${DAYS[i]}`}
                            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center mx-auto transition-all touch-manipulation ${
                              isChecked
                                ? 'bg-[#E30613] border-[#E30613] text-white'
                                : 'bg-white border-[#D1D5DB] hover:border-[#E30613]/50 active:bg-[#F5F5F5]'
                            }`}
                          >
                            {isChecked && <span className="text-xs font-black leading-none">✓</span>}
                          </button>
                        </td>
                      ))}
                      <td className="text-center px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="7"
                            value={target}
                            onChange={e => updateCible(routine.id, parseInt(e.target.value) || 0)}
                            className={`w-10 text-center border rounded px-1 py-1 text-xs font-bold focus:outline-none focus:border-[#E30613] ${
                              status === 'done' ? 'border-green-300 bg-green-50 text-green-700' :
                              status === 'partial' ? 'border-orange-300 bg-orange-50 text-orange-600' :
                              routine.monthly ? 'border-purple-200 bg-purple-50 text-purple-600' :
                              'border-[#E0E0E0] bg-white text-[#6B7280]'
                            }`}
                          />
                          <span className="text-[10px] text-[#9CA3AF] leading-none">
                            {checked > 0 ? `${checked}/` : ''}{target > 0 ? `${target}j` : routine.monthly ? '—' : `${target}j`}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* ── Inventaires tournants ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-[#F5F5F5] border-b border-[#E0E0E0] flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-sm text-[#1A1A1A]">📋 Inventaires tournants</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeInvYear(invYear - 1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-[#E0E0E0] hover:bg-[#EBEBEB] text-sm font-bold text-[#1A1A1A] transition-colors"
            >‹</button>
            <span className="text-sm font-bold text-[#1A1A1A] min-w-[40px] text-center">{invYear}</span>
            <button
              onClick={() => changeInvYear(invYear + 1)}
              disabled={invYear >= currentYear}
              className={`w-7 h-7 flex items-center justify-center rounded-lg border text-sm font-bold transition-colors ${
                invYear >= currentYear
                  ? 'bg-[#F5F5F5] border-[#E0E0E0] text-[#D1D5DB] cursor-not-allowed'
                  : 'bg-white border-[#E0E0E0] hover:bg-[#EBEBEB] text-[#1A1A1A]'
              }`}
            >›</button>
          </div>
        </div>
        <p className="px-4 pt-3 pb-2 text-xs italic text-[#6B7280]">
          Les inventaires tournants sont la base d&apos;un pilotage stock fiable. Cochez quand vous les réalisez. Familles regroupées par fréquence préconisée.
        </p>
        {INV_GROUPES.map(groupe => (
          <div key={groupe.id} className="border-t border-[#E0E0E0]">
            <div className={`px-4 py-2 flex items-center gap-2 ${groupe.subBg}`}>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${groupe.badgeCls}`}>
                {groupe.badge}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#E0E0E0]">
                    <th className="text-left px-4 py-2 text-[#6B7280] font-semibold min-w-[150px] sticky left-0 bg-[#FAFAFA] z-10 border-r border-[#E0E0E0]">
                      Famille
                    </th>
                    {MONTHS.map((m, mi) => (
                      <th key={m} className={`text-center py-2 font-semibold w-9 ${
                        invIsCurrentYear && mi === invCurrentMonth ? 'text-[#E30613] font-black' :
                        invIsCurrentYear && mi > invCurrentMonth  ? 'text-[#C0C0C0]' : 'text-[#6B7280]'
                      }`}>{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F4F4]">
                  {groupe.familles.map(f => {
                    const checks = (invData[f.code] ?? new Array<boolean>(12).fill(false)) as boolean[];
                    const status = getInvRowStatus(checks, groupe.freq, invUpToMonth);
                    const rowBg = status === 'green' ? 'bg-green-50' : status === 'orange' ? 'bg-orange-50' : 'bg-white';
                    return (
                      <tr key={f.code} className={rowBg}>
                        <td className={`px-4 py-2 sticky left-0 z-10 border-r border-[#E0E0E0] ${rowBg}`}>
                          <div className="flex items-start gap-1.5 flex-wrap">
                            <span className={`font-mono text-[11px] font-bold ${
                              status === 'green' ? 'text-green-700' : status === 'orange' ? 'text-orange-600' : 'text-[#374151]'
                            }`}>{f.code}</span>
                            {f.special && (
                              <span className="text-[9px] font-semibold text-orange-600 bg-orange-100 border border-orange-200 px-1 py-0.5 rounded leading-none">
                                {f.special}
                              </span>
                            )}
                            <span className="text-[10px] text-[#9CA3AF] w-full leading-tight">{f.label}</span>
                          </div>
                        </td>
                        {MONTHS.map((_, mi) => {
                          const isFuture = invIsCurrentYear && mi > invCurrentMonth;
                          const isChecked = checks[mi] ?? false;
                          return (
                            <td key={mi} className="text-center py-1.5 px-0.5">
                              <button
                                onClick={() => toggleInv(f.code, mi)}
                                aria-label={`${f.code} — ${MONTHS[mi]} ${invYear}`}
                                className={`w-7 h-7 rounded-md border-2 flex items-center justify-center mx-auto transition-all touch-manipulation ${
                                  isChecked
                                    ? 'bg-[#E30613] border-[#E30613] text-white'
                                    : isFuture
                                      ? 'bg-[#F9F9F9] border-[#EBEBEB] text-[#D1D5DB]'
                                      : 'bg-white border-[#D1D5DB] hover:border-[#E30613]/60 active:bg-[#FFF5F5]'
                                }`}
                              >
                                {isChecked && <span className="text-[10px] font-black leading-none">✓</span>}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <div className="border-t border-[#E0E0E0] px-4 py-3 bg-[#FAFAFA]">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-[#F0F0F0] text-[#9CA3AF] border-[#E0E0E0]">
              ⚪ Non préconisé ou à définir
            </span>
          </div>
          <p className="text-xs text-[#9CA3AF] italic">
            Familles spécifiques à votre magasin. Définissez vos propres fréquences avec votre animateur réseau.
          </p>
        </div>
        <div className="border-t border-[#E0E0E0] px-4 py-4">
          <p className="text-sm text-[#1A1A1A]">
            Cette année, <strong>{invFait}</strong> inventaires faits sur{' '}
            <strong>{invPreconise}</strong> préconisés{' '}
            <strong className={invPct >= 80 ? 'text-green-600' : invPct >= 50 ? 'text-orange-600' : 'text-red-600'}>
              ({invPct}%)
            </strong>.
          </p>
          {invPreconise > 0 && (
            <>
              <div className="mt-2 h-2 bg-[#E0E0E0] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    invPct >= 80 ? 'bg-green-500' : invPct >= 50 ? 'bg-orange-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${invPct}%` }}
                />
              </div>
              <p className={`text-sm font-semibold mt-2 ${invPct < 50 ? 'text-red-600' : invPct <= 80 ? 'text-orange-600' : 'text-green-600'}`}>
                {invPct < 50
                  ? '🚨 Vos inventaires sont en retard. Le pilotage stock devient fragile.'
                  : invPct <= 80
                    ? '📊 Bon rythme. Maintenez la régularité.'
                    : "🏆 Pilotage stock maîtrisé. C'est ce qui sépare les top magasins du reste."}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Score de la semaine */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-[#1A1A1A]">Score de la semaine</h3>
          <span className={`text-2xl font-black ${pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-orange-500' : 'text-red-600'}`}>
            {pct}%
          </span>
        </div>
        <div className="h-2.5 bg-[#E0E0E0] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-orange-400' : 'bg-red-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-[#6B7280]">
          {metCount}/{scoreableRoutines.length} routines accomplies · Moy. 4 sem : <strong className={avg4 >= 80 ? 'text-green-600' : avg4 >= 50 ? 'text-orange-500' : 'text-red-600'}>{avg4}%</strong>
        </p>
        <p className="text-sm font-semibold text-[#1A1A1A]">
          {pct < 50
            ? '🔴 Score insuffisant — ancrez au moins 3 routines critiques dès cette semaine.'
            : pct < 80
              ? '🟠 Bon rythme — consolidez les automatismes pour dépasser 80%.'
              : '🟢 Routines installées — c\'est ce qui sépare les top magasins.'}
        </p>
        {onAddAction && avg4 < 50 && withData.length >= 2 && (
          <button onClick={() => {
            const e = new Date(); e.setDate(e.getDate() + 14);
            onAddAction({ id: String(Date.now()), titre: `Routines — Score moyen < 50% sur 4 semaines (${avg4}%)`, axe: 'Management', pilote: 'Franchisé', copilote: '', description: `Score moyen des routines sur les 4 dernières semaines : ${avg4}%. Identifier les 3 routines prioritaires à ancrer en priorité (Brief, Chiffres Athéna, Mise en ligne EasyBiz).`, echeance: e.toISOString().slice(0, 10), priorite: 1, gain: 0, statut: 'À faire' });
          }} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-3 py-1 whitespace-nowrap transition-colors">+ PAP</button>
        )}
      </div>

      {/* Progression 12 semaines */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5">
        <h3 className="font-bold text-sm text-[#1A1A1A] mb-4">📈 Ma progression sur 12 semaines</h3>
        <div className="flex items-end gap-1" style={{ height: 80 }}>
          {history.map((h, i) => {
            const isCurrent = h.off === 0;
            const barH = Math.max(Math.round((h.pct / 100) * 76), isCurrent ? 4 : h.hasData ? 2 : 0);
            return (
              <div
                key={i}
                title={`${h.pct}%`}
                className={`flex-1 rounded-t-sm transition-all ${
                  isCurrent ? 'bg-[#E30613]' :
                  h.pct >= 70 ? 'bg-green-400' :
                  h.pct >= 40 ? 'bg-orange-300' :
                  h.hasData ? 'bg-[#D1D5DB]' : 'bg-[#F0F0F0]'
                }`}
                style={{ height: barH }}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5 text-[9px] text-[#9CA3AF]">
          <span>il y a 11 sem.</span>
          <span>Cette semaine</span>
        </div>
        {progressMsg ? (
          <p className="text-xs text-[#6B7280] mt-3 italic">{progressMsg}</p>
        ) : withData.length === 0 ? (
          <p className="text-xs text-[#9CA3AF] mt-3 italic">Commencez à cocher des routines pour voir votre progression.</p>
        ) : null}
      </div>
    </div>
  );
}

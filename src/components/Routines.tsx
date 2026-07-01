'use client';

import { useState, useMemo } from 'react';
import type { PAPAction } from '@/types';

interface Props { magasinNom: string; onAddAction?: (action: PAPAction) => void; }

type FreqKey = 'quotidien' | '3x' | '2x' | '1x' | 'mensuel';
interface RoutineDef { id: string; label: string; freq: FreqKey; detail: string; monthly?: boolean; }
interface BlocDef { icon: string; title: string; subtitle: string; headerBg: string; routines: RoutineDef[]; }
type WeekData = Record<string, boolean[]>;

const FREQ_DEFAULTS: Record<FreqKey, number> = { quotidien: 5, '3x': 3, '2x': 2, '1x': 1, mensuel: 0 };
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

const BLOCS: BlocDef[] = [
  {
    icon: '💰', title: 'Vente',
    subtitle: 'Transformer les flux et encaisser la valeur chaque jour',
    headerBg: 'bg-green-50',
    routines: [
      { id: 'v1', label: 'Brief vente matin (objectifs + priorités du jour)', freq: 'quotidien',
        detail: "Chaque matin, 5 min debout avec l'équipe : CA de la veille, objectif du jour, 1 point technique (Estaly, argumentation, accessoires). Sans brief, la journée s'organise par défaut." },
      { id: 'v2', label: 'Estaly / extension garantie proposé à chaque vente', freq: 'quotidien',
        detail: 'Objectif : 100% des ventes éligibles avec proposition Estaly. Script : "Je vous propose aussi l\'extension garantie à 3 ou 5 ans..." Levier direct sur marge nette.' },
      { id: 'v3', label: 'Demande d\'avis Google en caisse', freq: 'quotidien',
        detail: "Script à l'encaissement : \"Avez-vous 30 secondes pour nous laisser un avis Google ? Ça nous aide vraiment.\". Objectif : 10 nouveaux avis/mois minimum." },
      { id: 'v4', label: 'Animation vitrine / mise en avant bonnes affaires', freq: '1x',
        detail: 'Chaque semaine : 3 produits en vedette avec prix barré visible, étiquettes de réassurance, tournez les têtes de gondole. Ce que l\'œil voit, la main prend.' },
    ],
  },
  {
    icon: '🛒', title: 'Achat',
    subtitle: 'Alimenter le stock en continu et optimiser le sourcing',
    headerBg: 'bg-[#FFF5F5]',
    routines: [
      { id: 'a1', label: 'Sourcing comptoir actif (rachat proactif)', freq: 'quotidien',
        detail: "Posture proactive : proposer l'achat au client qui entre. Former l'équipe à déclencher la discussion rachat systématiquement. L'offre d'achat ne se génère pas d'elle-même." },
      { id: 'a2', label: 'Édition appel de stock / gamme manquante', freq: '1x',
        detail: 'Intranet → Gestion magasin → Gamme référence. Identifier les trous dans la gamme et éditer les appels de stock. 1 référence manquante = CA perdu.' },
      { id: 'a3', label: 'Sourcing externe (Leboncoin, Vinted, Vinted Pro)', freq: '2x',
        detail: 'Chercher les produits manquants en gamme sur les plateformes. Négocier en dessous de la côte EasyPrice pour préserver la marge. 2× par semaine minimum.' },
      { id: 'a4', label: 'Visite concurrence (veille tarifs + gamme)', freq: 'mensuel', monthly: true,
        detail: 'Aller voir 1 à 2 concurrents par mois. Capter leurs prix, leur gamme, leurs arguments. Adapters votre positionnement. (Cash Express, indépendants locaux)' },
    ],
  },
  {
    icon: '📦', title: 'Stock',
    subtitle: 'Piloter la rotation et éliminer le vieux stock',
    headerBg: 'bg-orange-50',
    routines: [
      { id: 's1', label: 'Lecture chiffres Athéna (CA / marge / stock âgé)', freq: '1x',
        detail: 'Chaque semaine : CA réalisé vs objectif, taux de marge, % stock âgé. Ces 3 chiffres vous disent tout. Préparez le brief en y allant.' },
      { id: 's2', label: 'TOP 20 vieux stock — 1 action minimum', freq: '1x',
        detail: 'Athéna → Stock → Ventilation par ancienneté. Prendre le TOP 20 valeur et faire 1 action : démarque, placement vitrine, contact revendeur. 1 action/semaine = 50 mouvements/an.' },
      { id: 's3', label: 'Mise à jour prix EasyPrice (côtes réseau)', freq: '3x',
        detail: 'Récupérer les nouvelles côtes EasyPrice 3× par semaine et mettre à jour les prix en magasin. Ne jamais laisser un écart de plus de 72h entre la côte et votre étiquette.' },
      { id: 's4', label: 'Traitement SAV / retours (bac à vider)', freq: '1x',
        detail: "Vider le bac retours chaque semaine. Aucun produit en attente > 15 jours. L'immobilisation SAV est de la trésorerie morte. Process : tester → diagnostiquer → décider (revendre / retour réseau / démarque)." },
    ],
  },
  {
    icon: '🌐', title: 'Web',
    subtitle: 'Alimenter le catalogue digital et la réputation en ligne',
    headerBg: 'bg-blue-50',
    routines: [
      { id: 'w1', label: 'Mise en ligne produits EasyBiz (photos + description)', freq: 'quotidien',
        detail: "Chaque jour : mettre en ligne les produits rachetés la veille. 1 jour de délai = 1 jour sans visibilité web. Photo soignée + description précise = moins d'annulations." },
      { id: 'w2', label: 'Réponse aux avis Google', freq: 'quotidien',
        detail: "Répondre à TOUS les avis Google sous 24h : remerciement aux positifs, résolution aux négatifs. Les réponses soignées aux avis négatifs convertissent mieux que les notes parfaites." },
      { id: 'w3', label: 'Suivi annulations commandes web', freq: '1x',
        detail: "Analyser les annulations de la semaine : cause (rupture, délai, prix), action corrective. Taux cible : ≤ 5%. Au-delà, chaque annulation dégrade votre note Marketplace." },
      { id: 'w4', label: 'Publications réseaux sociaux (Instagram, TikTok, FB)', freq: '2x',
        detail: "Publier 2× par semaine minimum : bonnes affaires du moment, coulisses du magasin, témoignages clients. Construire une communauté locale de racheteurs et d'acheteurs." },
    ],
  },
  {
    icon: '👥', title: 'Management',
    subtitle: "Ritualiser l'équipe et développer les compétences",
    headerBg: 'bg-amber-50',
    routines: [
      { id: 'mg1', label: 'Brief hebdomadaire équipe (objectifs + chiffres)', freq: '1x',
        detail: "Lundi matin, 15 min max : CA semaine passée, objectif semaine, 1 action prioritaire par personne. Debout autour du comptoir. L'équipe qui sait où elle va performait 30% mieux." },
      { id: 'mg2', label: 'Tour de table responsables (GPA + sujet libre)', freq: '1x',
        detail: "Chaque responsable de rayon : 5 min sur sa GPA (gamme, prix, animation) + 1 sujet libre. Format structuré qui responsabilise et fait remonter les signaux faibles." },
      { id: 'mg3', label: 'Coaching individuel vente (observation + feedback)', freq: 'mensuel', monthly: true,
        detail: "1 fois par mois par personne : observer une vente, donner un feedback positif + 1 point d'amélioration. Méthode sandwich : positif → amélioration → encouragement." },
      { id: 'mg4', label: 'Entretien individuel mensuel (projet + motivation)', freq: 'mensuel', monthly: true,
        detail: "15 à 30 min en tête-à-tête : résultats du mois, satisfaction au poste, projets, besoins de formation. L'entretien qui n'a pas lieu laisse les signaux faibles s'amplifier." },
    ],
  },
  {
    icon: '🎯', title: 'GPA — Gamme · Prix · Animation',
    subtitle: 'Piloter les 3 leviers structurels de la performance',
    headerBg: 'bg-purple-50',
    routines: [
      { id: 'g1', label: 'Check gamme référence Athéna (taux de couverture)', freq: '1x',
        detail: 'Athéna → Gestion magasin → Gamme référence/modèle. Taux de couverture par famille. TLCE : 100% couverture = 60% du volume. JCON : 100% = 70% marge. Planifier les achats manquants.' },
      { id: 'g2', label: 'Mise à jour prix familles clés (côtes réseau)', freq: '3x',
        detail: "Mettre à jour les prix des 5 familles clés 3× par semaine. En dessous : vous perdez de la marge. Au-dessus : vous perdez des ventes. La côte réseau est votre benchmark." },
      { id: 'g3', label: 'Animation — 3 produits mis en valeur (vitrine + PLV)', freq: '1x',
        detail: "Chaque semaine : 3 produits en animation dans la vitrine avec prix barré + argument chiffré (\"économisez 40% vs neuf\"). Rotation hebdomadaire = nouveauté perçue = retour des clients." },
      { id: 'g4', label: 'Suivi inventaire tournant (planification + réalisation)', freq: '1x',
        detail: "Vérifier le planning des inventaires tournants de la semaine. Réaliser les familles prévues. TLCE : 2×/mois. BOR/JCON/IPOR : 1×/mois. Voir section Inventaires ci-dessous." },
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

function computeScore(data: WeekData, cibles: Record<string, number>): number {
  const scoreable = ALL_ROUTINES.filter(r => (cibles[r.id] ?? FREQ_DEFAULTS[r.freq]) > 0);
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
      try {
        const s = localStorage.getItem(`cibles_routines_${magasinNom}`);
        return s ? JSON.parse(s) as Record<string, number> : {};
      } catch { return {}; }
    })();
    const weekData = loadWeek(magasinNom, 0);
    if (Object.keys(weekData).length === 0) return '';
    const lines: string[] = ['\nRoutines de la semaine en cours :'];
    for (const bloc of BLOCS) {
      const blocLines: string[] = [];
      for (const r of bloc.routines) {
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

  const scoreableRoutines = ALL_ROUTINES.filter(r => getTarget(r) > 0);
  const pct = computeScore(weekData, cibles);
  const metCount = scoreableRoutines.filter(r => {
    const target = getTarget(r);
    return (weekData[r.id] ?? []).filter(Boolean).length >= target;
  }).length;

  const history = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const off = i - 11;
      const d = loadWeek(magasinNom, off);
      const hasData = Object.keys(d).length > 0;
      return { off, pct: computeScore(d, cibles), hasData };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magasinNom, weekData, cibles]);

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
    return ALL_ROUTINES.map(r => {
      const target = getTarget(r);
      if (target === 0) return { r, done: 0, expected: 0, pct: 0 };
      const done = allWeeks.reduce((s, w) => s + (w[r.id] ?? []).filter(Boolean).length, 0);
      const expected = target * weeks;
      return { r, done, expected, pct: Math.round(done / expected * 100) };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magasinNom, viewMode, weekData, cibles]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1A1A1A]">
            🔁 Routines{magasinNom ? ` — ${magasinNom}` : ''}
          </h2>
          <p className="text-sm text-[#6B7280] mt-0.5">6 domaines · 24 routines · Cochez chaque jour les actions accomplies pour ancrer vos automatismes.</p>
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
            const blocAgg = aggData.filter(a => bloc.routines.some(r => r.id === a.r.id));
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
                      <span className="flex-1 text-xs text-[#1A1A1A]">{r.label}</span>
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
          <div className={`px-4 py-3 ${bloc.headerBg} border-b border-[#E0E0E0] rounded-t-xl`}>
            <h3 className="font-bold text-sm text-[#1A1A1A]">{bloc.icon} {bloc.title}</h3>
            <p className="text-xs text-[#6B7280] mt-0.5">{bloc.subtitle}</p>
          </div>
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
                {bloc.routines.map(routine => {
                  const days = Array.from({ length: 7 }, (_, i) => !!(weekData[routine.id]?.[i]));
                  const status = getStatus(routine, days);
                  const target = getTarget(routine);
                  const checked = days.filter(Boolean).length;
                  const isTooltipOpen = tooltipId === routine.id;
                  return (
                    <tr key={routine.id} className={status === 'done' ? 'bg-green-50/40' : ''}>
                      <td className="px-4 py-3">
                        <div className="relative">
                          <div className="flex items-start gap-1.5 flex-wrap">
                            <span className={`text-xs leading-snug ${
                              status === 'done' ? 'text-green-700 font-medium' :
                              status === 'partial' ? 'text-orange-600' :
                              'text-[#6B7280]'
                            }`}>
                              {routine.label}
                            </span>
                            {routine.monthly && (
                              <span className="text-[9px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded-full whitespace-nowrap leading-none self-center">
                                mensuel
                              </span>
                            )}
                            <button
                              onClick={() => setTooltipId(isTooltipOpen ? null : routine.id)}
                              className="text-[#C0C0C0] hover:text-[#6B7280] transition-colors text-[11px] leading-none self-center flex-shrink-0"
                              title={routine.detail}
                              aria-label="Voir le détail"
                            >
                              ℹ
                            </button>
                          </div>
                          {isTooltipOpen && (
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

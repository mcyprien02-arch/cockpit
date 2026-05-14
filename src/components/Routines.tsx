'use client';

import { useState, useMemo } from 'react';

interface Props { magasinNom: string; }

type FreqKey = 'quotidien' | '3x' | '1x';
interface RoutineDef { id: string; label: string; freq: FreqKey; }
interface BlocDef { icon: string; title: string; routines: RoutineDef[]; }
type WeekData = Record<string, boolean[]>;

const FREQ_DEFAULTS: Record<FreqKey, number> = { quotidien: 5, '3x': 3, '1x': 1 };
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

// Blocs GPA (Gamme / Prix / Animation) — methodology kept in code, not displayed to franchisee
// Autodetermination theory (Deci & Ryan, 2000) — referenced internally only
const BLOCS: BlocDef[] = [
  { icon: '🛒', title: 'Gamme', routines: [
    { id: 'g1', label: 'Checker gamme référence et identifier manquants (Athéna)', freq: 'quotidien' },
    { id: 'g2', label: 'Éditer appel de stock pour les produits manquants', freq: 'quotidien' },
    { id: 'g3', label: 'Vérifier prix de reprise sur EasyPrice', freq: 'quotidien' },
  ]},
  { icon: '💰', title: 'Prix', routines: [
    { id: 'p1', label: 'Mise à jour prix par famille (Athéna → cote EasyPrice)', freq: '3x' },
    { id: 'p2', label: 'Identifier produits vieux stock et ajuster prix', freq: '3x' },
    { id: 'p3', label: "Lancer accélérations sur produits à risque (côtes d'alerte)", freq: '3x' },
  ]},
  { icon: '🎨', title: 'Animation', routines: [
    { id: 'a1', label: 'Mettre en avant les bonnes affaires (prix barrés, étiquettes jaunes)', freq: 'quotidien' },
    { id: 'a2', label: 'Faire la rotation des nouveautés en tête de vitrine', freq: '3x' },
    { id: 'a3', label: 'Vérifier les arguments de réassurance (garantie, paiement plusieurs fois)', freq: '1x' },
    { id: 'a4', label: "Consulter Plateforme Marketing pour idées d'animations", freq: '1x' },
  ]},
  { icon: '🤝', title: 'Prise en charge client', routines: [
    { id: 'cl1', label: "Prise en charge d'un SAV client", freq: '1x' },
  ]},
  { icon: '👥', title: 'Équipe', routines: [
    { id: 'e1', label: 'Briefing matinal 5 min avant ouverture', freq: 'quotidien' },
    { id: 'e3', label: 'Vérifier suivi EasyTraining de chaque collaborateur', freq: '1x' },
  ]},
  { icon: '📊', title: 'Pilotage', routines: [
    { id: 'pi1', label: 'Consulter Intranet (CA, marge, stock âgé)', freq: 'quotidien' },
    { id: 'pi3', label: 'Traiter Top 20 vieux stock une fois par semaine', freq: '1x' },
  ]},
  { icon: '🌐', title: 'Web & Digital', routines: [
    { id: 'w1', label: 'Avis Google récoltés', freq: 'quotidien' },
    { id: 'w2', label: 'Commandes web traitées en moins de 48h', freq: '1x' },
    { id: 'w3', label: 'Rattachement EasyBiz à jour', freq: '1x' },
  ]},
];

const ALL_ROUTINES = BLOCS.flatMap(b => b.routines);

// ── Inventaires tournants ─────────────────────────────────────────────────────
interface InvFamille { code: string; label: string; special?: string; }
interface InvGroupe {
  id: string;
  badge: string;
  badgeCls: string;
  subBg: string;
  freq: 'monthly' | 'bimonthly' | 'yearly';
  familles: InvFamille[];
}

const INV_GROUPES: InvGroupe[] = [
  {
    id: 'a',
    badge: '🔴 1 fois par mois',
    badgeCls: 'bg-red-100 text-red-700 border-red-200',
    subBg: 'bg-red-50/40',
    freq: 'monthly',
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
    id: 'b',
    badge: '🟠 6 fois par an',
    badgeCls: 'bg-orange-100 text-orange-700 border-orange-200',
    subBg: 'bg-orange-50/40',
    freq: 'bimonthly',
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
    id: 'c',
    badge: '🟢 1 fois par an',
    badgeCls: 'bg-green-100 text-green-700 border-green-200',
    subBg: 'bg-green-50/40',
    freq: 'yearly',
    familles: [
      { code: 'DVD',  label: 'LS — DVD' },
      { code: 'ABLU', label: 'LS — Blu-Ray' },
      { code: 'LLIV', label: 'Livres' },
      { code: 'BD',   label: 'BD' },
    ],
  },
];

function getInvRowStatus(
  checks: boolean[],
  freq: 'monthly' | 'bimonthly' | 'yearly',
  upToMonth: number
): 'green' | 'orange' | 'gray' {
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
  const met = ALL_ROUTINES.filter(r => {
    const target = cibles[r.id] ?? FREQ_DEFAULTS[r.freq];
    if (target === 0) return false;
    return (data[r.id] ?? []).filter(Boolean).length >= target;
  }).length;
  return Math.round(met / ALL_ROUTINES.length * 100);
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function Routines({ magasinNom }: Props) {
  const [offset, setOffset] = useState(0);
  const [weekData, setWeekData] = useState<WeekData>(() => loadWeek(magasinNom, 0));

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

  const pct = computeScore(weekData, cibles);
  const metCount = ALL_ROUTINES.filter(r => {
    const target = getTarget(r);
    return target > 0 && (weekData[r.id] ?? []).filter(Boolean).length >= target;
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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">
          🔁 Routines hebdomadaires{magasinNom ? ` — ${magasinNom}` : ''}
        </h2>
        <p className="text-sm text-[#6B7280] mt-0.5">Cochez chaque jour les actions accomplies pour ancrer vos automatismes.</p>
      </div>

      <div className="bg-[#FFF5F5] border border-[#E30613]/20 rounded-xl px-4 py-3 text-sm text-[#1A1A1A] leading-relaxed">
        Les outils ne suffisent pas. La performance vient de la régularité du suivi. Cochez chaque jour les routines accomplies et ajustez la cible hebdomadaire selon votre magasin.
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

      {/* Grille des routines — blocs 1 à 5 */}
      {BLOCS.map(bloc => (
        <div key={bloc.title} className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-[#F5F5F5] border-b border-[#E0E0E0]">
            <h3 className="font-bold text-sm text-[#1A1A1A]">{bloc.icon} {bloc.title}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E0E0E0] bg-[#FAFAFA]">
                  <th className="text-left px-4 py-2 text-[#6B7280] font-semibold min-w-[200px]">Routine</th>
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
                  return (
                    <tr key={routine.id} className={status === 'done' ? 'bg-green-50/40' : ''}>
                      <td className="px-4 py-3">
                        <span className={`text-xs leading-snug block ${
                          status === 'done' ? 'text-green-700 font-medium' :
                          status === 'partial' ? 'text-orange-600' :
                          'text-[#6B7280]'
                        }`}>
                          {routine.label}
                        </span>
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
                              'border-[#E0E0E0] bg-white text-[#6B7280]'
                            }`}
                          />
                          <span className="text-[10px] text-[#9CA3AF] leading-none">
                            {checked > 0 ? `${checked}/` : ''}{target}j
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

      {/* ── Bloc 6 — Inventaires tournants ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        {/* Header + sélecteur année */}
        <div className="px-4 py-2.5 bg-[#F5F5F5] border-b border-[#E0E0E0] flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-sm text-[#1A1A1A]">📋 Inventaires tournants</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeInvYear(invYear - 1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-[#E0E0E0] hover:bg-[#EBEBEB] text-sm font-bold text-[#1A1A1A] transition-colors"
            >
              ‹
            </button>
            <span className="text-sm font-bold text-[#1A1A1A] min-w-[40px] text-center">{invYear}</span>
            <button
              onClick={() => changeInvYear(invYear + 1)}
              disabled={invYear >= currentYear}
              className={`w-7 h-7 flex items-center justify-center rounded-lg border text-sm font-bold transition-colors ${
                invYear >= currentYear
                  ? 'bg-[#F5F5F5] border-[#E0E0E0] text-[#D1D5DB] cursor-not-allowed'
                  : 'bg-white border-[#E0E0E0] hover:bg-[#EBEBEB] text-[#1A1A1A]'
              }`}
            >
              ›
            </button>
          </div>
        </div>

        {/* Intro */}
        <p className="px-4 pt-3 pb-2 text-xs italic text-[#6B7280]">
          Les inventaires tournants sont la base d&apos;un pilotage stock fiable. Cochez quand vous les réalisez. Familles regroupées par fréquence préconisée.
        </p>

        {/* Sous-blocs par fréquence */}
        {INV_GROUPES.map(groupe => (
          <div key={groupe.id} className="border-t border-[#E0E0E0]">
            {/* Sous-header */}
            <div className={`px-4 py-2 flex items-center gap-2 ${groupe.subBg}`}>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${groupe.badgeCls}`}>
                {groupe.badge}
              </span>
            </div>
            {/* Tableau */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#E0E0E0]">
                    <th className="text-left px-4 py-2 text-[#6B7280] font-semibold min-w-[150px] sticky left-0 bg-[#FAFAFA] z-10 border-r border-[#E0E0E0]">
                      Famille
                    </th>
                    {MONTHS.map((m, mi) => (
                      <th
                        key={m}
                        className={`text-center py-2 font-semibold w-9 ${
                          invIsCurrentYear && mi === invCurrentMonth
                            ? 'text-[#E30613] font-black'
                            : invIsCurrentYear && mi > invCurrentMonth
                              ? 'text-[#C0C0C0]'
                              : 'text-[#6B7280]'
                        }`}
                      >
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F4F4]">
                  {groupe.familles.map(f => {
                    const checks = (invData[f.code] ?? new Array<boolean>(12).fill(false)) as boolean[];
                    const status = getInvRowStatus(checks, groupe.freq, invUpToMonth);
                    const rowBg =
                      status === 'green' ? 'bg-green-50' :
                      status === 'orange' ? 'bg-orange-50' :
                      'bg-white';
                    return (
                      <tr key={f.code} className={rowBg}>
                        <td className={`px-4 py-2 sticky left-0 z-10 border-r border-[#E0E0E0] ${rowBg}`}>
                          <div className="flex items-start gap-1.5 flex-wrap">
                            <span className={`font-mono text-[11px] font-bold ${
                              status === 'green' ? 'text-green-700' :
                              status === 'orange' ? 'text-orange-600' :
                              'text-[#374151]'
                            }`}>
                              {f.code}
                            </span>
                            {f.special && (
                              <span className="text-[9px] font-semibold text-orange-600 bg-orange-100 border border-orange-200 px-1 py-0.5 rounded leading-none">
                                {f.special}
                              </span>
                            )}
                            <span className="text-[10px] text-[#9CA3AF] w-full leading-tight">
                              {f.label}
                            </span>
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

        {/* 6D — Non préconisé */}
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

        {/* Récap annuel */}
        <div className="border-t border-[#E0E0E0] px-4 py-4">
          <p className="text-sm text-[#1A1A1A]">
            Cette année, <strong>{invFait}</strong> inventaires faits sur{' '}
            <strong>{invPreconise}</strong> préconisés{' '}
            <strong className={
              invPct >= 80 ? 'text-green-600' :
              invPct >= 50 ? 'text-orange-600' :
              'text-red-600'
            }>({invPct}%)</strong>.
          </p>
          {invPreconise > 0 && (
            <>
              <div className="mt-2 h-2 bg-[#E0E0E0] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    invPct >= 80 ? 'bg-green-500' :
                    invPct >= 50 ? 'bg-orange-400' :
                    'bg-red-400'
                  }`}
                  style={{ width: `${invPct}%` }}
                />
              </div>
              <p className={`text-sm font-semibold mt-2 ${
                invPct < 50 ? 'text-red-600' :
                invPct <= 80 ? 'text-orange-600' :
                'text-green-600'
              }`}>
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
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-[#1A1A1A]">Score de la semaine</h3>
          <span className={`text-2xl font-black ${pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-orange-500' : 'text-[#9CA3AF]'}`}>
            {pct}%
          </span>
        </div>
        <div className="h-2.5 bg-[#E0E0E0] rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-orange-400' : 'bg-[#D1D5DB]'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-[#6B7280] mb-2">
          {metCount}/{ALL_ROUTINES.length} routines accomplies cette semaine ({pct}%)
        </p>
        <p className="text-sm font-semibold text-[#1A1A1A]">
          {pct < 40
            ? '💪 Lancez-vous. Une routine régulière sur 3 mois change tout.'
            : pct <= 70
              ? '📈 Bon rythme. Continuez à consolider vos automatismes.'
              : "🏆 Routines installées. C'est le secret des magasins performants."}
        </p>
      </div>

      {/* Progression 12 semaines */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5">
        <h3 className="font-bold text-sm text-[#1A1A1A] mb-4">📈 Ma progression sur 12 semaines</h3>
        <div className="flex items-end gap-1" style={{ height: 80 }}>
          {history.map((h, i) => {
            const isCurrent = h.off === 0;
            const barH = Math.max(
              Math.round((h.pct / 100) * 76),
              isCurrent ? 4 : h.hasData ? 2 : 0
            );
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

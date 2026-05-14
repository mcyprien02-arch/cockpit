'use client';

import { useState, useMemo } from 'react';

interface Props { magasinNom: string; }

type FreqKey = 'quotidien' | '3x' | '1x';
interface RoutineDef { id: string; label: string; freq: FreqKey; }
interface BlocDef { icon: string; title: string; routines: RoutineDef[]; }
type WeekData = Record<string, boolean[]>;

const FREQ_TARGETS: Record<FreqKey, number> = { quotidien: 5, '3x': 3, '1x': 1 };
const FREQ_LABELS: Record<FreqKey, string> = { quotidien: 'Quotidien', '3x': '3×/sem', '1x': '1×/sem' };
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const BLOCS: BlocDef[] = [
  { icon: '🛒', title: 'Gamme — méthode GPA', routines: [
    { id: 'g1', label: 'Checker gamme référence et identifier manquants (Athéna)', freq: 'quotidien' },
    { id: 'g2', label: 'Éditer appel de stock pour les produits manquants', freq: 'quotidien' },
    { id: 'g3', label: 'Vérifier prix de reprise sur EasyPrice', freq: 'quotidien' },
  ]},
  { icon: '💰', title: 'Prix — méthode GPA', routines: [
    { id: 'p1', label: 'Mise à jour prix par famille (Athéna → cote EasyPrice)', freq: '3x' },
    { id: 'p2', label: 'Identifier produits vieux stock et ajuster prix', freq: '3x' },
    { id: 'p3', label: "Lancer accélérations sur produits à risque (côtes d'alerte)", freq: '3x' },
  ]},
  { icon: '🎨', title: 'Animation — méthode GPA', routines: [
    { id: 'a1', label: 'Mettre en avant les bonnes affaires (prix barrés, étiquettes jaunes)', freq: 'quotidien' },
    { id: 'a2', label: 'Faire la rotation des nouveautés en tête de vitrine', freq: '3x' },
    { id: 'a3', label: 'Vérifier les arguments de réassurance (garantie, paiement plusieurs fois)', freq: '1x' },
    { id: 'a4', label: "Consulter Plateforme Marketing pour idées d'animations", freq: '1x' },
  ]},
  { icon: '👥', title: 'Équipe', routines: [
    { id: 'e1', label: 'Briefing matinal 5 min avant ouverture', freq: 'quotidien' },
    { id: 'e2', label: "Coaching individuel d'un vendeur (15 min)", freq: '3x' },
    { id: 'e3', label: 'Vérifier suivi EasyTraining de chaque collaborateur', freq: '1x' },
  ]},
  { icon: '📊', title: 'Pilotage', routines: [
    { id: 'pi1', label: 'Consulter Intranet (CA, marge, stock âgé)', freq: 'quotidien' },
    { id: 'pi2', label: 'Vérifier Dashboard web (commandes, annulations)', freq: 'quotidien' },
    { id: 'pi3', label: 'Traiter Top 20 vieux stock une fois par semaine', freq: '1x' },
  ]},
];

const ALL_ROUTINES = BLOCS.flatMap(b => b.routines);

// ── Helpers semaine ─────────────────────────────────────────────────────────
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

function computeScore(data: WeekData): number {
  const met = ALL_ROUTINES.filter(r =>
    (data[r.id] ?? []).filter(Boolean).length >= FREQ_TARGETS[r.freq]
  ).length;
  return Math.round(met / ALL_ROUTINES.length * 100);
}

// ── Composant ────────────────────────────────────────────────────────────────
export default function Routines({ magasinNom }: Props) {
  const [offset, setOffset] = useState(0);
  const [weekData, setWeekData] = useState<WeekData>(() => loadWeek(magasinNom, 0));

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

  const pct = computeScore(weekData);
  const metCount = ALL_ROUTINES.filter(r =>
    (weekData[r.id] ?? []).filter(Boolean).length >= FREQ_TARGETS[r.freq]
  ).length;

  // Historique 12 semaines — weekData en dép. pour mettre à jour la barre courante en live
  const history = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const off = i - 11;
      const d = loadWeek(magasinNom, off);
      const hasData = Object.keys(d).length > 0;
      return { off, pct: computeScore(d), hasData };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magasinNom, weekData]);

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
      {/* En-tête */}
      <div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">
          🔁 Routines hebdomadaires{magasinNom ? ` — ${magasinNom}` : ''}
        </h2>
        <p className="text-sm text-[#6B7280] mt-0.5">Méthode GPA · Autodétermination (Deci &amp; Ryan, 2000)</p>
      </div>

      {/* Intro */}
      <div className="bg-[#FFF5F5] border border-[#E30613]/20 rounded-xl px-4 py-3 text-sm text-[#1A1A1A] leading-relaxed">
        Les outils ne suffisent pas. La performance vient de la régularité du suivi. Cochez chaque jour les routines accomplies pour installer des automatismes durables dans votre magasin.
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

      {/* Grille des routines */}
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
                  <th className="text-center px-3 py-2 text-[#6B7280] font-semibold w-20 whitespace-nowrap">Cible</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {bloc.routines.map(routine => {
                  const days = Array.from({ length: 7 }, (_, i) => !!(weekData[routine.id]?.[i]));
                  const checked = days.filter(Boolean).length;
                  const target = FREQ_TARGETS[routine.freq];
                  const status: 'done' | 'partial' | 'none' =
                    checked >= target ? 'done' : checked > 0 ? 'partial' : 'none';
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
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                          status === 'done' ? 'bg-green-100 text-green-700' :
                          status === 'partial' ? 'bg-orange-100 text-orange-600' :
                          'bg-[#F5F5F5] text-[#9CA3AF]'
                        }`}>
                          {FREQ_LABELS[routine.freq]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

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

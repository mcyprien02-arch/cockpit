'use client';

import { useState } from 'react';
import type { MagasinData, Phase } from '@/types';
import { SEUIL_DEFAULTS } from '@/lib/seuils';
import type { KpiStatus } from '@/lib/kpis';

interface Props { data: MagasinData; }

// ── Catégories ───────────────────────────────────────────────────────────────
type DiagCat = 'rentabilite' | 'stock' | 'commerce' | 'web';

const CAT_LABELS: Record<DiagCat, string> = {
  rentabilite: 'Rentabilité', stock: 'Stock', commerce: 'Commerce', web: 'Web',
};
const CAT_COLOR: Record<DiagCat, string> = {
  rentabilite: '#10b981', stock: '#3b82f6', commerce: '#f59e0b', web: '#8b5cf6',
};

// ── Pratiques (23 items, même structure que Dashboard) ──────────────────────
interface PratiquesState {
  decouverteBesoins: boolean; accessoires: boolean; avisGoogle: boolean; estalyPratique: boolean; caissePics: boolean;
  testProduit: boolean; vpdAppliquee: boolean; negociationRachat: boolean; piceasoft: boolean; deuxAcheteurs: boolean;
  briefingQuotidien: boolean; entretiensMenusuels: boolean; easyTraining: boolean; polyvalence: boolean; coachingVente: boolean;
  top20Hebdo: boolean; accelerationsAnticipees: boolean; inventairesTournants: boolean; rebutsDestock: boolean; rattachementF3: boolean;
  dashboardWeb: boolean; expeditions48h: boolean; moduleAcceleration: boolean;
}
const DEFAULT_PRATIQUES: PratiquesState = {
  decouverteBesoins: false, accessoires: false, avisGoogle: false, estalyPratique: false, caissePics: false,
  testProduit: false, vpdAppliquee: false, negociationRachat: false, piceasoft: false, deuxAcheteurs: false,
  briefingQuotidien: false, entretiensMenusuels: false, easyTraining: false, polyvalence: false, coachingVente: false,
  top20Hebdo: false, accelerationsAnticipees: false, inventairesTournants: false, rebutsDestock: false, rattachementF3: false,
  dashboardWeb: false, expeditions48h: false, moduleAcceleration: false,
};

// ── Coûts cachés ────────────────────────────────────────────────────────────
interface CoutCacheItem {
  key: keyof PratiquesState;
  label: string;
  calcul: (vah: number, nbEtp: number) => number;
  action: string;
}

const COUT_CACHE_ITEMS: CoutCacheItem[] = [
  // Bloc 1
  { key: 'decouverteBesoins', label: 'Découverte des besoins non systématique',
    calcul: (vah) => vah * 0.5 * 250,
    action: "Formez l'équipe au questionnement client. 1 min de qualification = panier plus juste." },
  { key: 'accessoires', label: "Pas de proposition d'accessoire",
    calcul: (vah) => vah * 0.25 * 250,
    action: "Briefez vos vendeurs : 1 accessoire proposé à chaque vente principale." },
  { key: 'avisGoogle', label: 'Pas de relance avis Google',
    calcul: (vah) => vah * 0.1 * 250,
    action: "Mettez en place une relance systématique en caisse. 5 avis positifs/semaine = note qui monte." },
  { key: 'estalyPratique', label: 'Pas de proposition Estaly systématique',
    calcul: (vah) => vah * 0.2 * 250,
    action: "Brief équipe sur les primes Estaly. 1 contrat/jour = +1 100 €/an pour le vendeur." },
  { key: 'caissePics', label: "Caisse mal organisée aux pics d'affluence",
    calcul: (vah) => vah * 0.5 * 100,
    action: "Anticipez les pics : doublez la caisse les samedis et veilles de fête." },
  // Bloc 2
  { key: 'testProduit', label: 'Test produit bâclé au rachat',
    calcul: (vah) => vah * 2 * 10 * 12,
    action: "Durcir les tests au rachat. Le SAV se joue à l'entrée du produit." },
  { key: 'vpdAppliquee', label: 'VPD non appliquée',
    calcul: (vah) => vah * 0.5 * 250,
    action: "Réafficher les 5 questions VPD au comptoir. La marge se fait à l'achat." },
  { key: 'negociationRachat', label: 'Pas de négociation systématique au rachat',
    calcul: (vah) => vah * 0.25 * 250,
    action: "Coachez vos acheteurs. Chaque euro négocié = marge directe." },
  { key: 'piceasoft', label: 'Piceasoft non utilisé sur les mobiles',
    calcul: (vah) => vah * 2 * 10 * 12,
    action: "Test systématique sur tous les mobiles rachetés. SAV divisé par 2." },
  { key: 'deuxAcheteurs', label: 'Acheteur seul au comptoir',
    calcul: (vah) => vah * 1 * 250,
    action: "Formez un 2e acheteur. La fluidité au comptoir = ventes en plus." },
  // Bloc 3
  { key: 'briefingQuotidien', label: 'Pas de briefing quotidien',
    calcul: (vah, nbEtp) => vah * 0.25 * nbEtp * 250,
    action: "5 min chaque matin avant ouverture. Routine simple, impact durable." },
  { key: 'entretiensMenusuels', label: "Pas d'entretien mensuel par collaborateur",
    calcul: (vah) => vah * 80,
    action: "1h par mois par collaborateur. Investissement humain garanti." },
  { key: 'easyTraining', label: 'Plan EasyTraining non suivi',
    calcul: (vah) => vah * 80,
    action: "Bloquez 1h/semaine pour les modules EasyTraining manquants." },
  { key: 'polyvalence', label: 'Vendeur unique sur rayon majeur',
    calcul: (vah) => vah * 200,
    action: "Formez un suppléant sur chaque rayon majeur." },
  { key: 'coachingVente', label: 'Pas de coaching vente en magasin',
    calcul: (vah, nbEtp) => vah * 0.5 * nbEtp * 50,
    action: "30 min de coaching individuel/semaine par collaborateur." },
  // Bloc 4
  { key: 'top20Hebdo', label: 'Top 20 vieux stock non traité chaque semaine',
    calcul: (vah) => vah * 2 * 52,
    action: "Extraire TOP 20 chaque lundi. Levier d'urgence cash immédiat." },
  { key: 'accelerationsAnticipees', label: 'Accélérations traitées tardivement',
    calcul: (vah) => vah * 1 * 52,
    action: "Anticipez : -10%/semaine plutôt que -30%/mois." },
  { key: 'inventairesTournants', label: 'Inventaires tournants non respectés',
    calcul: (vah) => vah * 100,
    action: "Planning IT respecté = vision stock réelle." },
  { key: 'rebutsDestock', label: 'Rebuts non destockés via module Démarque',
    calcul: (vah) => vah * 0.5 * 50,
    action: "Module Démarque hebdomadaire. Faux stock = faux pilotage." },
  { key: 'rattachementF3', label: 'Produits techniques non rattachés via F3',
    calcul: (vah) => vah * 0.5 * 100,
    action: "Scanner systématique produits techniques. Données = ventes." },
  // Bloc 5
  { key: 'dashboardWeb', label: 'Dashboard web non consulté quotidiennement',
    calcul: (vah) => vah * 0.5 * 250,
    action: "Dashboard ouvert en permanence. Le web = votre 2e magasin." },
  { key: 'expeditions48h', label: 'Délai expédition supérieur à 48h',
    calcul: (vah) => vah * 100,
    action: "Process expé quotidien. Service postal collecte chez vous." },
  { key: 'moduleAcceleration', label: 'Module Accélération web non utilisé',
    calcul: (vah) => vah * 50,
    action: "Accélérez sur le web AVANT que ça pourrisse." },
];

// ── KPIs du Diagnostic ──────────────────────────────────────────────────────
interface DiagKpi {
  key: keyof MagasinData;
  label: string;
  unit: string;
  cat: DiagCat;
  dir: 'higher' | 'lower';
  phaseAware?: boolean;
  actionText: string;
}

const DIAG_KPIS: DiagKpi[] = [
  {
    key: 'tauxMargeNette', label: 'Taux de marge nette', unit: '%',
    cat: 'rentabilite', dir: 'higher', phaseAware: true,
    actionText: "💡 Action prioritaire : analysez votre mix rayon. Téléphonie pèse-t-elle trop dans votre CA ? Une famille à faible marge tire toute votre rentabilité vers le bas.",
  },
  {
    key: 'tauxDemarque', label: 'Taux de démarque', unit: '%',
    cat: 'rentabilite', dir: 'lower',
    actionText: "💡 Action prioritaire : audit caisse + arrière-boutique cette semaine. Identifiez les rayons les plus touchés (souvent : bijouterie, téléphonie accessoires).",
  },
  {
    key: 'stockAge', label: 'Stock âgé', unit: '%',
    cat: 'stock', dir: 'lower', phaseAware: true,
    actionText: "💡 Action prioritaire : extrayez votre TOP 20 vieux stock en valeur (Intranet > Stats > Stocks > Ventilation) et lancez des accélérations cette semaine.",
  },
  {
    key: 'tauxTransformation', label: 'Taux de transformation', unit: '%',
    cat: 'commerce', dir: 'higher',
    actionText: "💡 Action prioritaire : observez votre équipe en magasin pendant 2h. Identifiez où les clients décrochent (accueil, négociation, encaissement).",
  },
  {
    key: 'estalyParSemaine', label: 'Estaly / mois', unit: '',
    cat: 'commerce', dir: 'higher',
    actionText: "💡 Action prioritaire : briefez votre équipe sur les primes vendeur. 1 contrat/jour = ~1 100 €/an net pour le vendeur — argument motivant.",
  },
  {
    key: 'noteGoogle', label: 'Note Google', unit: '/5',
    cat: 'web', dir: 'higher', phaseAware: true,
    actionText: "💡 Relance avis systématique en caisse. Objectif : 5 avis positifs par semaine.",
  },
  {
    key: 'tauxAnnulationWeb', label: "Taux d'annulation commande", unit: '%',
    cat: 'web', dir: 'lower',
    actionText: "💡 Audit du suivi de commandes. Vérifiez le délai d'expédition (<48h) et la qualité du référencement produit.",
  },
  {
    key: 'satisfactionWeb', label: 'Satisfaction client web', unit: '/5',
    cat: 'web', dir: 'higher',
    actionText: "💡 Analysez les retours négatifs. Améliorez la description produit et les photos pour réduire l'écart attente/réalité.",
  },
  {
    key: 'tauxSAV', label: 'Taux SAV', unit: '%',
    cat: 'commerce', dir: 'lower',
    actionText: "💡 Action prioritaire : durcissez les tests au rachat (Piceasoft sur mobiles, test approfondi sur informatique). Le SAV se joue à l'entrée du produit.",
  },
  {
    key: 'poidsDigital', label: 'Poids digital', unit: '%',
    cat: 'web', dir: 'higher',
    actionText: "💡 Action prioritaire : auditez votre référencement EC.fr. Combien de vos produits sont en ligne avec photos correctes et description complète ?",
  },
  {
    key: 'ventesAdditionnelles', label: 'Ventes additionnelles', unit: '€',
    cat: 'commerce', dir: 'higher',
    actionText: "💡 Action prioritaire : challengez vos vendeurs sur les accessoires. Objectif : 1 accessoire pour chaque produit principal vendu.",
  },
  {
    key: 'tauxAchatExterne', label: 'Achat externe', unit: '%',
    cat: 'commerce', dir: 'lower',
    actionText: "💡 Action prioritaire : analysez vos sources externes. Sont-elles justifiées par la marge ? Travaillez votre VPD pour récupérer plus d'achats clients.",
  },
];

const TOP20_ACTION = "🚨 Action critique : c'est LE levier n°1 pour libérer du cash immédiatement. À traiter aujourd'hui.";

// ── Statuts ────────────────────────────────────────────────────────────────
function phaseStatus(key: string, val: number, phase: Phase): KpiStatus | null {
  if (!val) return null;
  if (key === 'stockAge') {
    const [ok, warn] = phase === 'Lancement' ? [25, 35] : phase === 'Croissance' ? [22, 32] : [20, 30];
    return val < ok ? 'ok' : val <= warn ? 'warn' : 'danger';
  }
  if (key === 'tauxMargeNette') {
    const [ok, warn] = phase === 'Lancement' ? [35, 30] : phase === 'Croissance' ? [36, 33] : [38, 35];
    return val >= ok ? 'ok' : val >= warn ? 'warn' : 'danger';
  }
  if (key === 'noteGoogle') {
    const [ok, warn] = phase === 'Lancement' ? [4.0, 3.5] : phase === 'Croissance' ? [4.2, 3.8] : [4.4, 4.0];
    return val > ok ? 'ok' : val >= warn ? 'warn' : 'danger';
  }
  return null;
}

function phaseLabel(key: string, phase: Phase): string {
  const map: Record<string, Record<Phase, string>> = {
    stockAge:       { Lancement: '<25%', Croissance: '<22%', Maturité: '<20%' },
    tauxMargeNette: { Lancement: '≥35%', Croissance: '≥36%', Maturité: '≥38%' },
    noteGoogle:     { Lancement: '>4.0', Croissance: '>4.2', Maturité: '>4.4' },
  };
  return map[key]?.[phase] ?? '';
}

function customStatus(val: number, seuil: number, dir: 'higher' | 'lower'): KpiStatus {
  if (dir === 'higher') return val >= seuil ? 'ok' : val >= seuil * 0.85 ? 'warn' : 'danger';
  return val <= seuil ? 'ok' : val <= seuil * 1.2 ? 'warn' : 'danger';
}

function resolveStatus(kpi: DiagKpi, val: number, seuil: number | undefined, phase: Phase): KpiStatus | null {
  if (!val) return null;
  if (seuil && seuil > 0) return customStatus(val, seuil, kpi.dir);
  if (kpi.phaseAware) return phaseStatus(String(kpi.key), val, phase);
  return null;
}

function resolveSeuilLabel(kpi: DiagKpi, seuil: number | undefined, phase: Phase): string {
  if (seuil && seuil > 0) return `Mon seuil : ${seuil}${kpi.unit}`;
  if (kpi.phaseAware) return `Seuil ${phase} : ${phaseLabel(String(kpi.key), phase)}`;
  return 'Aucun seuil — définissez-le dans le Dashboard';
}

// ── Radar ──────────────────────────────────────────────────────────────────
function RadarChart({ scores }: { scores: Partial<Record<DiagCat, number>> }) {
  const cats = Object.keys(scores) as DiagCat[];
  const n = cats.length;
  if (n < 3) return null;
  const cx = 120; const cy = 120; const R = 90;

  function pt(idx: number, val: number) {
    const angle = (idx / n) * 2 * Math.PI - Math.PI / 2;
    const r = (val / 100) * R;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  const polygon = cats.map((c, i) => pt(i, scores[c] ?? 50)).map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox="0 0 240 240" className="w-full max-w-xs mx-auto">
      {[20, 40, 60, 80, 100].map(lvl => (
        <polygon key={lvl} points={cats.map((_, i) => pt(i, lvl)).map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="#E0E0E0" strokeWidth="0.5" />
      ))}
      {cats.map((_, i) => {
        const end = pt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#D1D5DB" strokeWidth="0.5" />;
      })}
      <polygon points={polygon} fill="rgba(16,185,129,0.15)" stroke="#10b981" strokeWidth="1.5" />
      {cats.map((c, i) => {
        const p = pt(i, 116);
        return (
          <text key={c} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill="#6B7280" fontSize="9" fontWeight="600">
            {CAT_LABELS[c]}
          </text>
        );
      })}
      {cats.map((c, i) => {
        const p = pt(i, scores[c] ?? 50);
        return <circle key={c} cx={p.x} cy={p.y} r="3" fill={CAT_COLOR[c]} />;
      })}
    </svg>
  );
}

// ── Composant principal ────────────────────────────────────────────────────
export default function Diagnostic({ data }: Props) {
  const phase = (data.phase ?? 'Maturité') as Phase;
  const [openCat, setOpenCat] = useState<string | null>(null);

  const [customSeuils] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return { ...SEUIL_DEFAULTS };
    try { const s = localStorage.getItem(`seuils_${data.nom}`); return s ? JSON.parse(s) as Record<string, number> : { ...SEUIL_DEFAULTS }; }
    catch { return { ...SEUIL_DEFAULTS }; }
  });

  const [pratiques] = useState<PratiquesState>(() => {
    if (typeof window === 'undefined') return DEFAULT_PRATIQUES;
    try {
      const p = localStorage.getItem(`pratiques_${data.nom}`);
      return p ? { ...DEFAULT_PRATIQUES, ...JSON.parse(p) as Partial<PratiquesState> } : DEFAULT_PRATIQUES;
    } catch { return DEFAULT_PRATIQUES; }
  });

  const [vah] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const stored = parseFloat(localStorage.getItem(`vah_resultat_${data.nom}`) ?? '0');
      if (stored > 0) return stored;
      const heures = parseFloat(localStorage.getItem(`vah_heures_${data.nom}`) ?? '0');
      if (!heures || !data.caAnnuel || !data.tauxMargeNette) return 0;
      return (data.caAnnuel * data.tauxMargeNette / 100) / heures;
    } catch { return 0; }
  });

  const [nbEtp] = useState<number>(() => {
    if (typeof window === 'undefined') return 3;
    try {
      const s = localStorage.getItem(`equipe_${data.nom}`);
      if (!s) return 3;
      const store = JSON.parse(s) as unknown;
      const rows: Array<{ heures: number }> = Array.isArray(store)
        ? store as Array<{ heures: number }>
        : ((store as { rows?: Array<{ heures: number }> }).rows ?? []);
      const total = rows.reduce((sum, r) => sum + (r.heures || 0), 0);
      return total > 0 ? Math.max(1, Math.round(total / 151.67)) : 3;
    } catch { return 3; }
  });

  // ── Scores par catégorie ──
  const allCats: DiagCat[] = ['rentabilite', 'stock', 'commerce', 'web'];

  function catScore(cat: DiagCat): number {
    const kpis = DIAG_KPIS.filter(k => k.cat === cat);
    const scored: number[] = [];
    for (const kpi of kpis) {
      const val = data[kpi.key] as number;
      const seuil = customSeuils[String(kpi.key)];
      const st = resolveStatus(kpi, val, seuil, phase);
      if (st) scored.push(st === 'ok' ? 100 : st === 'warn' ? 50 : 0);
    }
    if (cat === 'stock' && data.nom) {
      scored.push(data.top20Traite ? 100 : 0);
    }
    return scored.length ? Math.round(scored.reduce((s, v) => s + v, 0) / scored.length) : 50;
  }

  const scores: Partial<Record<DiagCat, number>> = {};
  for (const cat of allCats) scores[cat] = catScore(cat);
  const overall = Math.round(Object.values(scores).reduce((s, v) => s + v, 0) / allCats.length);

  // ── Alertes KPI (warn/danger) ──
  const alerts: Array<{ kpi: DiagKpi; val: number; status: KpiStatus; seuilLabel: string }> = [];
  for (const kpi of DIAG_KPIS) {
    const val = data[kpi.key] as number;
    const seuil = customSeuils[String(kpi.key)];
    const st = resolveStatus(kpi, val, seuil, phase);
    if (st && st !== 'ok') {
      alerts.push({ kpi, val, status: st, seuilLabel: resolveSeuilLabel(kpi, seuil, phase) });
    }
  }
  const top20Alert = data.nom && data.top20Traite === false;

  // ── Coûts cachés ──
  const coutCacheItems = COUT_CACHE_ITEMS.filter(item => !pratiques[item.key]);
  const totalCoutCache = coutCacheItems.reduce((sum, item) => sum + Math.round(item.calcul(vah, nbEtp)), 0);
  const nbCochees = Object.values(pratiques).filter(Boolean).length;
  const totalPratiques = Object.keys(DEFAULT_PRATIQUES).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-[#1A1A1A]">Diagnostic — {data.nom || 'Magasin'}</h2>
          <p className="text-sm text-[#6B7280] mt-0.5">Score global : <span className={`font-black text-base ${overall >= 65 ? 'text-green-600' : overall >= 35 ? 'text-orange-500' : 'text-red-600'}`}>{overall}/100</span></p>
        </div>
        {data.caAnnuel > 0 && (
          <div className="text-right">
            <div className="text-xs text-[#6B7280]">CA annuel</div>
            <div className="text-base font-bold text-[#1A1A1A]">{data.caAnnuel.toLocaleString('fr-FR')} €</div>
          </div>
        )}
      </div>

      {/* Phase banner */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2 text-xs text-orange-700">
        Feux basés sur <strong className="text-orange-800">vos seuils personnalisés</strong> (Dashboard → Modifier mes données).
        {' '}Les KPIs sans seuil affichent la valeur sans feu tricolore.
      </div>

      {/* Radar + bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4">
          <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3 text-center">Vue globale</h3>
          <RadarChart scores={scores} />
        </div>
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4">
          <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4">Scores par catégorie</h3>
          <div className="space-y-3">
            {allCats.map(cat => {
              const s = scores[cat] ?? 50;
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#6B7280]">{CAT_LABELS[cat]}</span>
                    <span className="font-bold text-[#1A1A1A]">{s}/100</span>
                  </div>
                  <div className="h-2 bg-[#E0E0E0] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${s}%`, background: CAT_COLOR[cat] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Alertes KPI */}
      {(alerts.length > 0 || top20Alert) && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#1A1A1A]">
            Points d&apos;attention ({alerts.length + (top20Alert ? 1 : 0)})
          </h3>

          {top20Alert && (
            <div className="bg-white border-l-4 border-l-red-500 rounded-lg shadow-sm p-4">
              <p className="font-bold text-sm text-[#1A1A1A] mb-1">Top 20 vieux stock non traité</p>
              <p className="text-xs text-[#6B7280] mb-2">Statut actuel : non traité</p>
              <p className="text-sm text-[#1A1A1A]">{TOP20_ACTION}</p>
            </div>
          )}

          {alerts.map(({ kpi, val, status, seuilLabel }) => (
            <div key={String(kpi.key)} className={`bg-white shadow-sm rounded-lg p-4 border-l-4 ${status === 'danger' ? 'border-l-red-500' : 'border-l-orange-400'}`}>
              <div className="flex items-start justify-between gap-3 mb-1">
                <p className="font-bold text-sm text-[#1A1A1A]">{kpi.label}</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${status === 'danger' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                  {status === 'danger' ? 'Danger' : 'Vigilance'}
                </span>
              </div>
              <p className="text-sm font-semibold text-[#1A1A1A] mb-1">{val}{kpi.unit}</p>
              <p className="text-xs text-amber-600 mb-3">{seuilLabel}</p>
              <p className="text-sm text-[#1A1A1A] leading-relaxed">{kpi.actionText}</p>
            </div>
          ))}
        </div>
      )}

      {alerts.length === 0 && !top20Alert && data.nom && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-center">
          <p className="text-green-700 font-semibold text-sm">✓ Aucun point d&apos;attention — tous vos indicateurs sont dans les seuils.</p>
        </div>
      )}

      {/* Coût caché des dysfonctionnements */}
      {data.nom && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#1A1A1A]">🔍 Coût caché des dysfonctionnements</h3>

          {vah > 0 ? (
            <>
              {coutCacheItems.length === 0 ? (
                <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-center">
                  <p className="text-green-700 font-semibold text-sm">✓ Toutes les pratiques sont appliquées — aucun coût caché détecté.</p>
                </div>
              ) : (
                <>
                  {coutCacheItems.map(item => {
                    const cost = Math.round(item.calcul(vah, nbEtp));
                    return (
                      <div key={item.key} className="bg-white border border-[#E0E0E0] border-l-4 border-l-orange-400 rounded-lg shadow-sm p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="font-semibold text-sm text-[#1A1A1A]">{item.label}</p>
                          <span className="text-sm font-black text-[#B91C1C] flex-shrink-0 whitespace-nowrap">
                            ~{cost.toLocaleString('fr-FR')} €/an
                          </span>
                        </div>
                        <p className="text-xs text-[#6B7280] italic leading-relaxed">{item.action}</p>
                      </div>
                    );
                  })}

                  <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-5">
                    <div className="text-xl font-black text-[#1A1A1A] mb-1">
                      📊 Total coût caché annuel estimé :{' '}
                      <span className="text-[#B91C1C]">{totalCoutCache.toLocaleString('fr-FR')} €/an</span>
                    </div>
                    <div className="text-sm text-[#6B7280]">
                      {nbCochees} pratique{nbCochees > 1 ? 's' : ''} sur {totalPratiques} sont actuellement appliquée{nbCochees > 1 ? 's' : ''} dans votre magasin.
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              Saisissez votre valeur ajoutée horaire dans le Dashboard (champ <strong>VAH €/h</strong>) pour chiffrer le coût caché de ces dysfonctionnements.
              {nbCochees < totalPratiques && (
                <span className="block mt-1 text-xs">
                  {totalPratiques - nbCochees} pratique{totalPratiques - nbCochees > 1 ? 's' : ''} non appliquée{totalPratiques - nbCochees > 1 ? 's' : ''} sur {totalPratiques}.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Détail par catégorie */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[#1A1A1A]">Détail par indicateur</h3>

        {allCats.map(cat => {
          const kpis = DIAG_KPIS.filter(k => k.cat === cat);
          const isOpen = openCat === cat;
          return (
            <div key={cat} className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
              <button
                onClick={() => setOpenCat(isOpen ? null : cat)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F5F5F5] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: CAT_COLOR[cat] }} />
                  <span className="font-semibold text-sm text-[#1A1A1A]">{CAT_LABELS[cat]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#1A1A1A]">{scores[cat] ?? 50}/100</span>
                  <span className="text-[#6B7280] text-xs">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-[#E0E0E0] divide-y divide-[#E0E0E0]">
                  {cat === 'stock' && data.nom && (
                    <div className={`px-4 py-3 flex items-center justify-between ${!data.top20Traite ? 'bg-red-50 border-l-4 border-l-red-500' : 'border-l-2 border-l-green-500'}`}>
                      <div>
                        <span className="text-sm font-medium text-[#1A1A1A]">Top 20 vieux stock traité</span>
                        {!data.top20Traite && <p className="text-xs text-[#6B7280] mt-0.5">Intranet › Stats › Stocks › Ventilation</p>}
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${data.top20Traite ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {data.top20Traite ? 'Fait ✓' : 'Non traité'}
                      </span>
                    </div>
                  )}

                  {kpis.map(kpi => {
                    const val = data[kpi.key] as number;
                    const seuil = customSeuils[String(kpi.key)];
                    const st = resolveStatus(kpi, val, seuil, phase);
                    const hasData = val > 0;
                    const seuilLabel = resolveSeuilLabel(kpi, seuil, phase);
                    const borderColor = !st ? 'border-l-[#E0E0E0]' : st === 'ok' ? 'border-l-green-500' : st === 'warn' ? 'border-l-orange-400' : 'border-l-red-500';
                    return (
                      <div key={String(kpi.key)} className={`px-4 py-3 border-l-2 ${borderColor}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-[#1A1A1A]">{kpi.label}</span>
                              {st && st !== 'ok' && (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${st === 'danger' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                  {st === 'danger' ? 'Danger' : 'Vigilance'}
                                </span>
                              )}
                              {st === 'ok' && <span className="text-xs text-green-600 font-bold">✓</span>}
                            </div>
                            <p className="text-xs text-amber-600 mt-0.5">{seuilLabel}</p>
                          </div>
                          <span className={`text-sm font-bold flex-shrink-0 ${!hasData ? 'text-[#9CA3AF]' : !st ? 'text-[#6B7280]' : st === 'ok' ? 'text-green-600' : st === 'warn' ? 'text-orange-500' : 'text-red-600'}`}>
                            {hasData ? `${val}${kpi.unit}` : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

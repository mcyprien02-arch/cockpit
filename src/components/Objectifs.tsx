'use client';

import { useState, useEffect } from 'react';
import type { PAPAction, ActionAxe, StoredStatut } from '@/types';
import { getDelaiMoyenParFamille, detectFamilyCode } from './JournalAchatVente';
import ZonesModule from './ZonesModule';

interface Props { magasinNom: string; onAddAction?: (action: PAPAction) => void; }

// ── Types ────────────────────────────────────────────────────────────────────

interface ObjFamille {
  id: string;
  famille: string;
  poidsMarge: number;      // % de la marge annuelle (source : intranet réseau)
  tauxMarge: number;       // % taux brut (pour calcul sourcing)
  stockInitial: number;
  delaiRotation: number;   // 0 = non renseigné
  margeRealisee: number;
  ecartReporte: number;    // déficit reporté du mois précédent
}

interface ObjData {
  familles: ObjFamille[];
  promoRedist: number;
  objectifMargeAnnuel: number;
}

interface HistoriqueMonth {
  month: string;
  totalCible: number;
  totalRealisee: number;
  familles: Array<{
    famille: string;
    margeCible: number;
    margeRealisee: number;
    tauxMarge: number;
    stockInitial: number;
    ecartReporte?: number;
  }>;
  clotureLe: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_FAMILLES: Array<{ famille: string; tauxMarge: number }> = [
  { famille: 'Téléphonie',    tauxMarge: 34 },
  { famille: 'Jeux Vidéo',   tauxMarge: 47 },
  { famille: 'Informatique',  tauxMarge: 40 },
  { famille: 'Bijouterie',    tauxMarge: 39 },
  { famille: 'Libre-service', tauxMarge: 76 },
];

function uid() { return Math.random().toString(36).slice(2); }

function defaultRows(): ObjFamille[] {
  return DEFAULT_FAMILLES.map(f => ({
    id: uid(), famille: f.famille, tauxMarge: f.tauxMarge,
    poidsMarge: 0, ecartReporte: 0, stockInitial: 0, delaiRotation: 0, margeRealisee: 0,
  }));
}

function fmtMonth(m: string): string {
  const [y, mo] = m.split('-');
  const names = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  return `${names[parseInt(mo, 10) - 1]} ${y}`;
}

function getNextMonthStr(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1); // mo as-is overflows Dec→Jan correctly
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Computed helpers ──────────────────────────────────────────────────────────

function margeAnnuelFamille(f: ObjFamille, annuel: number): number {
  if (annuel <= 0 || f.poidsMarge <= 0) return 0;
  return Math.round(annuel * f.poidsMarge / 100);
}

function margeMensuelleTheorique(f: ObjFamille, annuel: number): number {
  if (annuel <= 0 || f.poidsMarge <= 0) return 0;
  return Math.round(annuel * f.poidsMarge / 100 / 12);
}

function margeMensuelleEffective(f: ObjFamille, annuel: number): number {
  const theo = margeMensuelleTheorique(f, annuel);
  if (theo <= 0) return 0;
  return theo + Math.round(f.ecartReporte || 0);
}

function stockNecessaire(f: ObjFamille, annuel: number): number {
  const cible = margeMensuelleEffective(f, annuel);
  if (f.tauxMarge <= 0 || cible <= 0) return 0;
  return Math.round(cible / (f.tauxMarge / 100));
}

function sourcingRestant(f: ObjFamille, annuel: number): number {
  const cible = margeMensuelleEffective(f, annuel);
  if (cible <= 0 || f.tauxMarge <= 0) return 0;
  const t = f.tauxMarge / 100;
  const base = Math.round((cible - f.margeRealisee) / t);
  if (f.stockInitial > 0 && f.delaiRotation > 0) {
    const part = Math.min(1, 30 / f.delaiRotation);
    return Math.max(0, Math.round(base - f.stockInitial * part));
  }
  return Math.max(0, base);
}

function avancement(f: ObjFamille, annuel: number): number {
  const cible = margeMensuelleEffective(f, annuel);
  if (cible <= 0) return 0;
  return Math.round((f.margeRealisee / cible) * 100);
}

function budgetPromo(f: ObjFamille, annuel: number, promoRedist: number): number {
  const cible = margeMensuelleEffective(f, annuel);
  return Math.max(0, Math.round((f.margeRealisee - cible) * promoRedist / 100));
}

// ── AI context export ─────────────────────────────────────────────────────────

export function getVisionContext(magasinNom: string): string {
  if (typeof window === 'undefined' || !magasinNom) return '';
  try {
    const parts: string[] = [];

    const hs = localStorage.getItem(`histoire_${magasinNom}`);
    if (hs) {
      const h = JSON.parse(hs) as { objectifsPerso?: string; visionLongTerme?: string };
      if (h.objectifsPerso?.trim()) parts.push(`Objectifs personnels du franchisé : ${h.objectifsPerso}`);
      if (h.visionLongTerme?.trim()) parts.push(`Vision long terme (3 ans) : ${h.visionLongTerme}`);
    }

    const annuelRaw = localStorage.getItem(`objectif_marge_annuel_${magasinNom}`);
    const annuel = annuelRaw ? parseFloat(annuelRaw) || 0 : 0;
    if (annuel > 0) parts.push(`Objectif marge annuel : ${annuel.toLocaleString('fr-FR')} €`);

    const caRaw = localStorage.getItem(`ca_annuel_${magasinNom}`);
    if (caRaw) {
      const ca = parseFloat(caRaw);
      if (ca > 0) parts.push(`CA annuel cible : ${ca.toLocaleString('fr-FR')} €`);
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const os = localStorage.getItem(`objectifs_${magasinNom}_${currentMonth}`);
    if (os) {
      const obj = JSON.parse(os) as ObjData;
      const ann = obj.objectifMargeAnnuel || annuel;
      if (obj.familles?.length) {
        const delais = getDelaiMoyenParFamille(magasinNom);
        const calcSrc = (f: ObjFamille): number => sourcingRestant(f, ann);
        const lines = obj.familles
          .filter(f => f.famille && margeMensuelleEffective(f, ann) > 0)
          .map(f => {
            const cible = margeMensuelleEffective(f, ann);
            const avanc = cible > 0 ? Math.round(f.margeRealisee / cible * 100) : 0;
            const src = calcSrc(f);
            const sourcingStr = f.margeRealisee >= cible
              ? ' · sourcing: objectif atteint ✓'
              : src > 0 ? ` · sourcing restant: +${src.toLocaleString('fr-FR')}€` : '';
            const ecartStr = f.ecartReporte > 0 ? ` · écart reporté: +${Math.round(f.ecartReporte).toLocaleString('fr-FR')}€` : '';
            return `  - ${f.famille} : cible ${cible.toLocaleString('fr-FR')}€ · réalisé ${f.margeRealisee.toLocaleString('fr-FR')}€ (${avanc}%)${ecartStr}${sourcingStr}`;
          });
        void delais;
        if (lines.length) {
          const totalMarge = obj.familles.reduce((s, f) => s + margeMensuelleEffective(f, ann), 0);
          const totalCA = obj.familles.reduce((s, f) => f.tauxMarge > 0 ? s + margeMensuelleEffective(f, ann) / (f.tauxMarge / 100) : s, 0);
          const tauxPondere = totalCA > 0 ? Math.round((totalMarge / totalCA) * 1000) / 10 : 0;
          const sourcingTotal = obj.familles.reduce((s, f) => s + sourcingRestant(f, ann), 0);
          if (tauxPondere > 0) parts.push(`Taux de marge pondéré global : ${tauxPondere}%`);
          if (sourcingTotal > 0) parts.push(`Sourcing restant ce mois : ${sourcingTotal.toLocaleString('fr-FR')} €`);
          parts.push(`Objectifs mensuels (${currentMonth}) :\n${lines.join('\n')}`);
        }
      }
    }

    const as_ = localStorage.getItem(`ec_actions_${magasinNom}`);
    if (as_) {
      const acts = JSON.parse(as_) as PAPAction[];
      const active = acts.filter(a => a.statut === 'À faire' || a.statut === 'En cours');
      if (active.length > 0) {
        const lines = active.map(a => {
          const date = a.echeance ? ` (échéance : ${new Date(a.echeance).toLocaleDateString('fr-FR')})` : '';
          const lien = a.lienvision?.trim() ? ` — Vision : ${a.lienvision}` : '';
          return `  - ${a.titre}${date} [${a.statut}]${lien}`;
        }).join('\n');
        parts.push(`Actions PAP en cours :\n${lines}`);
      }
    }

    return parts.length ? '\n' + parts.join('\n') : '';
  } catch { return ''; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Objectifs({ magasinNom, onAddAction }: Props) {
  const today = new Date();
  const defaultMonth = today.toISOString().slice(0, 7);

  const [objectifMargeAnnuel, setObjectifMargeAnnuel] = useState<number>(0);
  const [caAnnuelCible, setCaAnnuelCible] = useState<number>(0);
  const [month, setMonth] = useState(defaultMonth);
  const [promoRedist, setPromoRedist] = useState(30);
  const [familles, setFamilles] = useState<ObjFamille[]>(defaultRows());
  const [historique, setHistorique] = useState<HistoriqueMonth[]>([]);
  const [showHistorique, setShowHistorique] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [confirmCloture, setConfirmCloture] = useState(false);
  const [delaisParFamille, setDelaisParFamille] = useState<Record<string, number | null>>({});

  useEffect(() => {
    if (magasinNom) setDelaisParFamille(getDelaiMoyenParFamille(magasinNom));
  }, [magasinNom]);

  useEffect(() => {
    if (!magasinNom) return;
    const annRaw = localStorage.getItem(`objectif_marge_annuel_${magasinNom}`);
    setObjectifMargeAnnuel(parseFloat(annRaw || '0') || 0);
    setCaAnnuelCible(parseFloat(localStorage.getItem(`ca_annuel_${magasinNom}`) || '0') || 0);
  }, [magasinNom]);

  useEffect(() => {
    if (!magasinNom) return;
    try {
      const h = localStorage.getItem(`objectifs_history_${magasinNom}`);
      setHistorique(h ? JSON.parse(h) as HistoriqueMonth[] : []);
    } catch { setHistorique([]); }
  }, [magasinNom]);

  useEffect(() => {
    try {
      const key = `objectifs_${magasinNom}_${month}`;
      const s = localStorage.getItem(key);
      if (s) {
        const parsed = JSON.parse(s) as ObjData;
        setFamilles((parsed.familles ?? defaultRows()).map(f => ({
          ...f,
          poidsMarge: f.poidsMarge ?? 0,
          ecartReporte: f.ecartReporte ?? 0,
          stockInitial: f.stockInitial ?? 0,
          delaiRotation: f.delaiRotation ?? 0,
        })));
        setPromoRedist(parsed.promoRedist ?? 30);
        if (parsed.objectifMargeAnnuel) {
          setObjectifMargeAnnuel(parsed.objectifMargeAnnuel);
        }
      } else {
        setFamilles(defaultRows());
        setPromoRedist(30);
      }
    } catch {
      setFamilles(defaultRows());
    }
  }, [month, magasinNom]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function saveObj(f: ObjFamille[], p: number, ann: number) {
    localStorage.setItem(`objectifs_${magasinNom}_${month}`, JSON.stringify({ familles: f, promoRedist: p, objectifMargeAnnuel: ann } as ObjData));
  }

  function updateObjectifMargeAnnuel(v: number) {
    setObjectifMargeAnnuel(v);
    localStorage.setItem(`objectif_marge_annuel_${magasinNom}`, String(v));
    saveObj(familles, promoRedist, v);
  }

  function updateCaAnnuelCible(v: number) {
    setCaAnnuelCible(v);
    localStorage.setItem(`ca_annuel_${magasinNom}`, String(v));
  }

  function updateFamille(id: string, field: keyof ObjFamille, value: string | number) {
    const next = familles.map(f => f.id === id ? { ...f, [field]: value } : f);
    setFamilles(next);
    saveObj(next, promoRedist, objectifMargeAnnuel);
  }

  function addFamille() {
    const next = [...familles, { id: uid(), famille: '', tauxMarge: 40, poidsMarge: 0, ecartReporte: 0, stockInitial: 0, delaiRotation: 0, margeRealisee: 0 }];
    setFamilles(next);
    saveObj(next, promoRedist, objectifMargeAnnuel);
  }

  function delFamille(id: string) {
    const next = familles.filter(f => f.id !== id);
    setFamilles(next);
    saveObj(next, promoRedist, objectifMargeAnnuel);
  }

  function updatePromo(p: number) {
    setPromoRedist(p);
    saveObj(familles, p, objectifMargeAnnuel);
  }

  function cloturerMois() {
    const totCible = familles.reduce((s, f) => s + margeMensuelleEffective(f, objectifMargeAnnuel), 0);
    const totRealisee = familles.reduce((s, f) => s + (f.margeRealisee || 0), 0);
    const record: HistoriqueMonth = {
      month, totalCible: totCible, totalRealisee: totRealisee,
      familles: familles.map(f => ({
        famille: f.famille,
        margeCible: margeMensuelleEffective(f, objectifMargeAnnuel),
        margeRealisee: f.margeRealisee,
        tauxMarge: f.tauxMarge,
        stockInitial: f.stockInitial,
        ecartReporte: f.ecartReporte,
      })),
      clotureLe: new Date().toISOString().slice(0, 10),
    };
    const nextHist = [record, ...historique.filter(h => h.month !== month)].slice(0, 36);
    setHistorique(nextHist);
    localStorage.setItem(`objectifs_history_${magasinNom}`, JSON.stringify(nextHist));

    // Forward ecarts to next month
    const nextMonth = getNextMonthStr(month);
    const nextKey = `objectifs_${magasinNom}_${nextMonth}`;
    let nextFamilles: ObjFamille[] = defaultRows();
    try {
      const existing = localStorage.getItem(nextKey);
      if (existing) {
        const parsed = JSON.parse(existing) as ObjData;
        nextFamilles = parsed.familles ?? defaultRows();
      }
    } catch { /* ignore */ }

    const nextFamillesWithEcart = nextFamilles.map(nf => {
      const curr = familles.find(cf => cf.famille === nf.famille);
      if (!curr) return nf;
      const effectif = margeMensuelleEffective(curr, objectifMargeAnnuel);
      const ecart = Math.max(0, effectif - (curr.margeRealisee || 0));
      return { ...nf, ecartReporte: ecart, poidsMarge: nf.poidsMarge || curr.poidsMarge };
    });

    const nextData: ObjData = { familles: nextFamillesWithEcart, promoRedist, objectifMargeAnnuel };
    localStorage.setItem(nextKey, JSON.stringify(nextData));

    setConfirmCloture(false);
    setShowHistorique(true);
  }

  function supprimerMoisHistorique(m: string) {
    const next = historique.filter(h => h.month !== m);
    setHistorique(next);
    localStorage.setItem(`objectifs_history_${magasinNom}`, JSON.stringify(next));
    if (expandedMonth === m) setExpandedMonth(null);
  }

  // ── Computed ────────────────────────────────────────────────────────────────

  const totalPoidsMarge = familles.reduce((s, f) => s + (f.poidsMarge || 0), 0);
  const poidsAlert = totalPoidsMarge > 0 && Math.abs(totalPoidsMarge - 100) > 0.5;

  const totalCible = familles.reduce((s, f) => s + margeMensuelleEffective(f, objectifMargeAnnuel), 0);
  const totalRealisee = familles.reduce((s, f) => s + (f.margeRealisee || 0), 0);
  const totalAvancement = totalCible > 0 ? Math.round((totalRealisee / totalCible) * 100) : 0;
  const totalSourcingRestant = familles.reduce((s, f) => s + sourcingRestant(f, objectifMargeAnnuel), 0);
  const totalBudgetPromo = familles.reduce((s, f) => s + budgetPromo(f, objectifMargeAnnuel, promoRedist), 0);
  const objetifAtteint = totalCible > 0 && totalRealisee >= totalCible;
  const totalEcartReporte = familles.reduce((s, f) => s + (f.ecartReporte || 0), 0);

  const totalCAcible = familles.reduce((s, f) => s + stockNecessaire(f, objectifMargeAnnuel), 0);
  const tauxMargePondere = totalCAcible > 0 ? Math.round((totalCible / totalCAcible) * 1000) / 10 : 0;
  const besoinSourcingAnnuel = Math.round(totalCAcible * 12);
  const margeAnnuelleProjetee = caAnnuelCible > 0 && tauxMargePondere > 0
    ? Math.round(caAnnuelCible * tauxMargePondere / 100) : 0;

  const statusMsg = totalCible === 0 ? null
    : objetifAtteint
      ? { msg: 'Objectif mensuel atteint — budget promo disponible !', cls: 'bg-green-50 border-green-300 text-green-700', icon: '🟢' }
      : totalAvancement >= 50
        ? { msg: 'En bonne voie — continuez l\'effort', cls: 'bg-orange-50 border-orange-200 text-orange-600', icon: '🟠' }
        : { msg: 'En retard — relancez les ventes et le sourcing', cls: 'bg-red-50 border-red-200 text-red-700', icon: '🔴' };

  const isMonthArchived = historique.some(h => h.month === month);
  const hasData = totalCible > 0 || familles.some(f => f.margeRealisee > 0);

  const ic = 'bg-white border border-[#E0E0E0] rounded-md px-2 py-1.5 text-[#1A1A1A] text-sm focus:outline-none focus:border-[#E30613]';

  return (
    <div className="space-y-6">

      {/* ── OBJECTIF ANNUEL GLOBAL ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5">
        <h2 className="text-lg font-bold text-[#1A1A1A] mb-1">🎯 Objectifs mensuels — {magasinNom || 'Magasin'}</h2>
        <p className="text-xs text-[#6B7280] mb-4">Saisir l&apos;objectif global annuel et les poids marge par famille (source : intranet réseau). Les objectifs mensuels sont calculés automatiquement.</p>

        <div className="flex flex-wrap gap-6 items-end">
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1">Objectif marge annuel global (€)</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={objectifMargeAnnuel || ''}
                onChange={e => updateObjectifMargeAnnuel(parseFloat(e.target.value) || 0)}
                className="border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:border-[#E30613]"
                placeholder="Ex : 600000"
              />
              <span className="text-sm text-[#6B7280] font-semibold">€</span>
            </div>
            {objectifMargeAnnuel > 0 && (
              <p className="text-xs text-[#6B7280] mt-1">
                → <span className="font-semibold text-[#1A1A1A]">{Math.round(objectifMargeAnnuel / 12).toLocaleString('fr-FR')} €</span>/mois (base théorique)
              </p>
            )}
          </div>

          {poidsAlert && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <span className="text-sm">⚠️</span>
              <p className="text-xs text-amber-800 font-semibold">
                Somme des poids marge : <strong>{totalPoidsMarge.toFixed(1)}%</strong> — doit être égale à 100 %.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── OBJECTIFS MENSUELS ────────────────────────────────────────────────── */}
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#1A1A1A]">📅 Mois en cours</h3>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#6B7280]">Mois</label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={ic} />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-[#6B7280]">Redistrib. promo</label>
              <input
                type="number"
                value={promoRedist || ''}
                onChange={e => updatePromo(parseFloat(e.target.value) || 0)}
                className={`${ic} w-16 text-center`}
                placeholder="30"
              />
              <span className="text-xs text-[#6B7280]">%</span>
            </div>
            {hasData && !isMonthArchived && (
              <button
                onClick={() => setConfirmCloture(true)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#E0E0E0] bg-white text-[#6B7280] hover:border-[#E30613] hover:text-[#E30613] transition-colors"
              >
                🔒 Clôturer le mois
              </button>
            )}
            {isMonthArchived && (
              <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                ✓ Mois clôturé
              </span>
            )}
          </div>
        </div>

        {/* Confirmation clôture */}
        {confirmCloture && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-orange-800">
              <strong>Clôturer {fmtMonth(month)} ?</strong> Les données seront archivées. Les déficits non atteints seront reportés au mois suivant.
            </p>
            <div className="flex gap-2 shrink-0">
              <button onClick={cloturerMois} className="text-xs font-semibold px-3 py-1.5 bg-[#E30613] text-white rounded-lg hover:bg-[#B8050F] transition-colors">Confirmer</button>
              <button onClick={() => setConfirmCloture(false)} className="text-xs px-3 py-1.5 border border-[#E0E0E0] rounded-lg text-[#6B7280] hover:bg-[#F5F5F5] transition-colors">Annuler</button>
            </div>
          </div>
        )}

        {/* Écart reporté banner */}
        {totalEcartReporte > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-800">
            📥 <strong>{totalEcartReporte.toLocaleString('fr-FR')} € de déficit reporté</strong> du mois précédent, réparti sur les familles concernées.
          </div>
        )}

        {/* Status */}
        {statusMsg && (
          <div className={`rounded-xl px-4 py-3 border font-semibold text-sm ${statusMsg.cls}`}>
            {statusMsg.icon} {statusMsg.msg}
            {totalAvancement > 0 && !objetifAtteint && ` — ${totalAvancement}% réalisé`}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: '1050px' }}>
              <thead>
                <tr className="bg-[#F5F5F5] border-b border-[#E0E0E0]">
                  <th className="text-left px-3 py-2.5 font-semibold text-[#6B7280]">Famille</th>
                  <th className="text-right px-2 py-2.5 font-semibold text-[#6B7280]">Poids<br/>marge %</th>
                  <th className="text-right px-2 py-2.5 font-semibold text-[#9CA3AF] bg-[#EBEBEB]">Obj. annuel €</th>
                  <th className="text-right px-2 py-2.5 font-semibold text-[#9CA3AF] bg-[#EBEBEB]">Obj. mens.<br/>théo. €</th>
                  <th className="text-right px-2 py-2.5 font-semibold text-blue-500 bg-blue-50">Écart<br/>reporté €</th>
                  <th className="text-right px-2 py-2.5 font-semibold text-[#1A1A1A] bg-[#EBEBEB]">Obj. mens.<br/>effectif €</th>
                  <th className="text-right px-2 py-2.5 font-semibold text-[#6B7280]">Taux<br/>marge %</th>
                  <th className="text-right px-2 py-2.5 font-semibold text-[#6B7280]">Stock<br/>initial €</th>
                  <th className="text-right px-2 py-2.5 font-semibold text-[#6B7280]">Délai<br/>rotation j</th>
                  <th className="text-right px-2 py-2.5 font-semibold text-[#6B7280]">Marge<br/>réalisée €</th>
                  <th className="text-right px-2 py-2.5 font-semibold text-[#6B7280]">Avan.</th>
                  <th className="text-right px-2 py-2.5 font-semibold text-[#6B7280] bg-orange-50">Sourcing<br/>restant ↓</th>
                  <th className="px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E0E0]">
                {familles.map(f => {
                  const theo = margeMensuelleTheorique(f, objectifMargeAnnuel);
                  const effectif = margeMensuelleEffective(f, objectifMargeAnnuel);
                  const annuelF = margeAnnuelFamille(f, objectifMargeAnnuel);
                  const src = sourcingRestant(f, objectifMargeAnnuel);
                  const avanc = avancement(f, objectifMargeAnnuel);
                  const atteint = effectif > 0 && f.margeRealisee >= effectif;
                  const autoDelai = (() => {
                    if (!f.famille) return null;
                    const fc = detectFamilyCode(f.famille);
                    if (fc === 'UNKNOWN') return null;
                    return delaisParFamille[fc] ?? null;
                  })();
                  return (
                    <tr key={f.id} className={`hover:bg-[#FAFAFA] ${atteint ? 'bg-green-50/30' : ''}`}>
                      {/* Famille */}
                      <td className="px-3 py-2">
                        <input value={f.famille} onChange={e => updateFamille(f.id, 'famille', e.target.value)} className={`${ic} w-28`} placeholder="Famille" />
                      </td>
                      {/* Poids marge % */}
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <input
                            type="number"
                            min="0" max="100"
                            value={f.poidsMarge || ''}
                            onChange={e => updateFamille(f.id, 'poidsMarge', parseFloat(e.target.value) || 0)}
                            className={`${ic} w-14 text-right`}
                            placeholder="0"
                          />
                          <span className="text-[#9CA3AF]">%</span>
                        </div>
                      </td>
                      {/* Obj annuel auto */}
                      <td className="px-2 py-2 text-right bg-[#F9FAFB] text-[#6B7280] font-medium">
                        {annuelF > 0 ? `${annuelF.toLocaleString('fr-FR')} €` : '—'}
                      </td>
                      {/* Obj mensuel théorique auto */}
                      <td className="px-2 py-2 text-right bg-[#F9FAFB] text-[#6B7280] font-medium">
                        {theo > 0 ? `${theo.toLocaleString('fr-FR')} €` : '—'}
                      </td>
                      {/* Écart reporté */}
                      <td className="px-2 py-2 text-right bg-blue-50">
                        <span className={`font-semibold ${f.ecartReporte > 0 ? 'text-blue-600' : 'text-[#9CA3AF]'}`}>
                          {f.ecartReporte > 0 ? `+${Math.round(f.ecartReporte).toLocaleString('fr-FR')} €` : '—'}
                        </span>
                      </td>
                      {/* Obj mensuel effectif auto */}
                      <td className="px-2 py-2 text-right bg-[#F9FAFB]">
                        <span className="font-bold text-[#1A1A1A]">
                          {effectif > 0 ? `${effectif.toLocaleString('fr-FR')} €` : '—'}
                        </span>
                      </td>
                      {/* Taux marge */}
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <input type="number" value={f.tauxMarge || ''} onChange={e => updateFamille(f.id, 'tauxMarge', parseFloat(e.target.value) || 0)} className={`${ic} w-14 text-right`} placeholder="40" />
                          <span className="text-[#9CA3AF]">%</span>
                        </div>
                      </td>
                      {/* Stock initial */}
                      <td className="px-2 py-2 text-right">
                        <input type="number" value={f.stockInitial || ''} onChange={e => updateFamille(f.id, 'stockInitial', parseFloat(e.target.value) || 0)} className={`${ic} w-20 text-right`} placeholder="0" />
                      </td>
                      {/* Délai rotation */}
                      <td className="px-2 py-2 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <input type="number" value={f.delaiRotation || ''} onChange={e => updateFamille(f.id, 'delaiRotation', parseFloat(e.target.value) || 0)} className={`${ic} w-14 text-right`} placeholder="—" min="1" />
                          {f.delaiRotation > 0 && f.stockInitial > 0 && (
                            <span className="text-[10px] text-blue-600 leading-tight font-medium">
                              → {Math.min(100, Math.round(30 / f.delaiRotation * 100))}% du stock
                            </span>
                          )}
                          {f.delaiRotation <= 0 && autoDelai !== null && f.stockInitial > 0 && (
                            <span className="text-[10px] text-[#9CA3AF] leading-tight italic">Journal : {autoDelai}j</span>
                          )}
                        </div>
                      </td>
                      {/* Marge réalisée */}
                      <td className="px-2 py-2 text-right">
                        <input type="number" value={f.margeRealisee || ''} onChange={e => updateFamille(f.id, 'margeRealisee', parseFloat(e.target.value) || 0)} className={`${ic} w-20 text-right`} placeholder="0" />
                      </td>
                      {/* Avancement */}
                      <td className="px-2 py-2 text-right">
                        <span className={`font-bold ${
                          atteint ? 'text-green-600'
                          : avanc >= 50 ? 'text-orange-500'
                          : avanc > 0 ? 'text-red-600'
                          : 'text-[#9CA3AF]'
                        }`}>
                          {effectif > 0 ? `${avanc}%` : '—'}
                        </span>
                      </td>
                      {/* Sourcing restant */}
                      <td className="px-2 py-2 text-right bg-orange-50/40">
                        <span className={`font-semibold ${
                          atteint ? 'text-green-600'
                          : src > 0 ? 'text-orange-600'
                          : 'text-[#9CA3AF]'
                        }`}>
                          {effectif <= 0 ? '—'
                            : atteint ? '✓ Atteint'
                            : src > 0 ? `+${src.toLocaleString('fr-FR')} €`
                            : '—'}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-2 py-2 flex items-center gap-1">
                        {effectif > 0 && avanc < 80 && onAddAction && (
                          <button onClick={() => {
                            const e = new Date(); e.setDate(e.getDate() + 14);
                            onAddAction({ id: String(Date.now()), titre: `Objectifs — Booster la famille ${f.famille} (${avanc}% objectif)`, axe: 'Commerce' as ActionAxe, pilote: 'Franchisé', copilote: '', description: `Avancement ${avanc}% sur la cible mensuelle ${effectif.toLocaleString('fr-FR')} €. Sourcing restant : ${src > 0 ? src.toLocaleString('fr-FR') + ' €' : '0 (atteint)'}.`, echeance: e.toISOString().slice(0, 10), priorite: avanc < 50 ? 1 : 2, gain: Math.round(effectif - f.margeRealisee), statut: 'À faire' as StoredStatut });
                          }} className="text-[10px] text-white bg-[#E30613] hover:bg-red-700 rounded-full px-2 py-0.5 whitespace-nowrap transition-colors">+ PAP</button>
                        )}
                        <button onClick={() => delFamille(f.id)} className="text-[#9CA3AF] hover:text-red-600 transition-colors">🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-[#E0E0E0]">
            <button onClick={addFamille} className="text-xs text-[#E30613] hover:text-[#B8050F] font-medium transition-colors">+ Ajouter une famille</button>
          </div>
        </div>

        {/* Récapitulatif du mois */}
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4">
          <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-4">Récapitulatif du mois</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-xl font-black text-[#1A1A1A]">{totalCible.toLocaleString('fr-FR')} €</div>
              <div className="text-xs text-[#6B7280] mt-0.5">Objectif mensuel effectif</div>
              {totalEcartReporte > 0 && <div className="text-[10px] text-blue-600 mt-0.5">dont +{totalEcartReporte.toLocaleString('fr-FR')} € reporté</div>}
            </div>
            <div className="text-center">
              <div className="text-xl font-black text-[#1A1A1A]">{totalRealisee.toLocaleString('fr-FR')} €</div>
              <div className="text-xs text-[#6B7280] mt-0.5">Marge réalisée</div>
            </div>
            <div className="text-center">
              <div className={`text-xl font-black ${objetifAtteint ? 'text-green-600' : totalAvancement >= 50 ? 'text-orange-500' : totalAvancement > 0 ? 'text-red-600' : 'text-[#9CA3AF]'}`}>
                {totalCible > 0 ? (objetifAtteint ? '✓ Atteint' : `${totalAvancement}%`) : '—'}
              </div>
              <div className="text-xs text-[#6B7280] mt-0.5">Avancement global</div>
            </div>
            <div className="text-center">
              <div className={`text-xl font-black ${objetifAtteint ? 'text-green-600' : totalSourcingRestant > 0 ? 'text-orange-600' : 'text-[#9CA3AF]'}`}>
                {totalCible <= 0 ? '—' : objetifAtteint ? '✓ 0 €' : totalSourcingRestant > 0 ? `+${totalSourcingRestant.toLocaleString('fr-FR')} €` : '—'}
              </div>
              <div className="text-xs text-[#6B7280] mt-0.5">Sourcing restant</div>
            </div>
          </div>
          {totalBudgetPromo > 0 && (
            <div className="mt-3 border-t border-[#E0E0E0] pt-3 flex items-center gap-2">
              <span className="text-sm font-semibold text-green-700">+{totalBudgetPromo.toLocaleString('fr-FR')} € budget promo libéré</span>
              <span className="text-xs text-[#6B7280]">= (marge réalisée − cible) × {promoRedist}% sur familles en dépassement</span>
            </div>
          )}
          <p className="text-[10px] text-[#9CA3AF] italic mt-2">
            Sourcing restant = (marge cible effectif − réalisée) ÷ taux de marge brute. Le déficit non atteint est reporté au mois suivant lors de la clôture.
          </p>
        </div>

        {/* Synthèse annuelle */}
        <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4">
          <h3 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-4">Synthèse annuelle</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className={`text-xl font-black ${tauxMargePondere > 0 ? 'text-[#1A1A1A]' : 'text-[#9CA3AF]'}`}>
                {tauxMargePondere > 0 ? `${tauxMargePondere}%` : '—'}
              </div>
              <div className="text-xs text-[#6B7280] mt-0.5">Taux marge pondéré</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <input
                  type="number"
                  value={caAnnuelCible || ''}
                  onChange={e => updateCaAnnuelCible(parseFloat(e.target.value) || 0)}
                  className="text-base font-black text-[#1A1A1A] w-28 text-center bg-[#F9FAFB] border border-[#E0E0E0] rounded px-2 py-0.5 focus:outline-none focus:border-[#E30613]"
                  placeholder="0"
                />
                <span className="text-sm text-[#6B7280] font-semibold">€</span>
              </div>
              <div className="text-xs text-[#6B7280] mt-0.5">CA annuel cible</div>
            </div>
            <div className="text-center">
              <div className={`text-xl font-black ${margeAnnuelleProjetee > 0 ? 'text-green-600' : 'text-[#9CA3AF]'}`}>
                {margeAnnuelleProjetee > 0 ? `${margeAnnuelleProjetee.toLocaleString('fr-FR')} €` : '—'}
              </div>
              <div className="text-xs text-[#6B7280] mt-0.5">Marge annuelle projetée</div>
            </div>
            <div className="text-center">
              <div className={`text-xl font-black ${besoinSourcingAnnuel > 0 ? 'text-orange-600' : 'text-[#9CA3AF]'}`}>
                {besoinSourcingAnnuel > 0 ? `${besoinSourcingAnnuel.toLocaleString('fr-FR')} €` : '—'}
              </div>
              <div className="text-xs text-[#6B7280] mt-0.5">Budget sourcing annualisé</div>
            </div>
          </div>
          <p className="text-[10px] text-[#9CA3AF] italic mt-3 border-t border-[#E0E0E0] pt-3">
            Taux pondéré = marge cible / CA cible (mix familles). Budget sourcing = stock mensuel cible × 12. Marge projetée = CA annuel × taux pondéré.
          </p>
        </div>
      </div>

      {/* ── HISTORIQUE DES MOIS CLOS ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
        <button
          onClick={() => setShowHistorique(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#F5F5F5] transition-colors"
        >
          <span className="text-sm font-semibold text-[#1A1A1A]">
            📋 Historique des mois clôturés
            {historique.length > 0 && (
              <span className="ml-2 text-xs font-normal text-[#6B7280]">{historique.length} mois archivé{historique.length > 1 ? 's' : ''}</span>
            )}
          </span>
          <span className="text-xs text-[#6B7280]">{showHistorique ? '▲' : '▼'}</span>
        </button>

        {showHistorique && (
          <div className="border-t border-[#E0E0E0] divide-y divide-[#F0F0F0]">
            {historique.length === 0 ? (
              <p className="px-4 py-4 text-sm text-[#6B7280] italic">Aucun mois clôturé. Utilisez le bouton &quot;Clôturer le mois&quot; pour archiver.</p>
            ) : (
              historique.map(h => {
                const pct = h.totalCible > 0 ? Math.round(h.totalRealisee / h.totalCible * 100) : 0;
                const atteint = h.totalRealisee >= h.totalCible;
                const isOpen = expandedMonth === h.month;
                return (
                  <div key={h.month}>
                    <div className="flex items-center hover:bg-[#FAFAFA] transition-colors">
                      <button
                        onClick={() => setExpandedMonth(isOpen ? null : h.month)}
                        className="flex-1 flex items-center gap-4 px-4 py-3 text-left"
                      >
                        <span className="text-sm font-semibold text-[#1A1A1A] w-20 shrink-0">{fmtMonth(h.month)}</span>
                        <span className="text-xs text-[#6B7280]">Cible : {h.totalCible.toLocaleString('fr-FR')} €</span>
                        <span className="text-xs text-[#6B7280]">Réalisé : {h.totalRealisee.toLocaleString('fr-FR')} €</span>
                        <span className={`text-xs font-bold ml-auto ${atteint ? 'text-green-600' : pct >= 50 ? 'text-orange-500' : 'text-red-600'}`}>
                          {atteint ? '✓ Atteint' : `${pct}%`}
                        </span>
                        <span className="text-xs text-[#9CA3AF] shrink-0">Clôturé le {new Date(h.clotureLe).toLocaleDateString('fr-FR')}</span>
                        <span className="text-[#9CA3AF] text-xs">{isOpen ? '▲' : '▼'}</span>
                      </button>
                      <button
                        onClick={() => supprimerMoisHistorique(h.month)}
                        className="px-3 py-3 text-[#9CA3AF] hover:text-red-500 transition-colors shrink-0"
                      >🗑</button>
                    </div>
                    {isOpen && (
                      <div className="bg-[#FAFAFA] border-t border-[#F0F0F0] px-4 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[#6B7280]">
                              <th className="text-left py-1 font-semibold">Famille</th>
                              <th className="text-right py-1 font-semibold">Cible (€)</th>
                              <th className="text-right py-1 font-semibold">Réalisé (€)</th>
                              <th className="text-right py-1 font-semibold">Avancement</th>
                              <th className="text-right py-1 font-semibold">Écart (€)</th>
                              <th className="text-right py-1 font-semibold text-blue-500">Reporté ↓</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F0F0F0]">
                            {h.familles.filter(f => f.margeCible > 0).map((f, i) => {
                              const fpct = f.margeCible > 0 ? Math.round(f.margeRealisee / f.margeCible * 100) : 0;
                              const ecart = f.margeRealisee - f.margeCible;
                              return (
                                <tr key={i}>
                                  <td className="py-1.5 text-[#1A1A1A]">{f.famille || '—'}</td>
                                  <td className="py-1.5 text-right">{f.margeCible.toLocaleString('fr-FR')} €</td>
                                  <td className="py-1.5 text-right">{f.margeRealisee.toLocaleString('fr-FR')} €</td>
                                  <td className={`py-1.5 text-right font-semibold ${fpct >= 100 ? 'text-green-600' : fpct >= 50 ? 'text-orange-500' : 'text-red-600'}`}>{fpct}%</td>
                                  <td className={`py-1.5 text-right font-semibold ${ecart >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {ecart >= 0 ? '+' : ''}{ecart.toLocaleString('fr-FR')} €
                                  </td>
                                  <td className="py-1.5 text-right text-blue-600 font-semibold">
                                    {f.ecartReporte && f.ecartReporte > 0 ? `+${Math.round(f.ecartReporte).toLocaleString('fr-FR')} €` : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <ZonesModule moduleKey="objectifs" />
    </div>
  );
}

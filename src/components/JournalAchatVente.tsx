'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import * as XLSX from 'xlsx';
import type { PAPAction } from '@/types';

interface Props {
  magasinNom: string;
  onAddAction?: (action: PAPAction) => void;
}
type Periode = 'all' | '3m' | '6m' | '12m';

// ── compact row stored in localStorage ───────────────────────────────────────
interface CRow {
  m:   string;         // modele
  f:   string;         // famille
  g:   string;         // grade (uppercased, D already excluded at import)
  d:   string | null;  // dateVente ISO
  pa:  number;         // prixAchat
  pv:  number;         // prixVente
  dv:  number | null;  // delaiVente
  ep:  number | null;  // easyprice prixVente grade B
  epa?: number | null; // easyprice prixAchat grade B
}

interface StoredImport {
  importedAt: string;
  rows: CRow[];
  dateMin: string | null;
  dateMax: string | null;
}

export interface ModelStats {
  modele:        string;
  famille:       string;
  qteVendue:     number;
  delaiMoyen:    number | null;
  margeUnitaire: number;
  margeTotal:    number;
  caTotal:       number;
  paMoyen:       number;
  pvMoyen:       number;
  tauxMarge:     number;
  epMoyen:       number | null;   // EP prix vente grade B
  epaMoyen:      number | null;   // EP prix achat grade B
  ecartEP:       number | null;   // % (pvMoyen vs epMoyen)
}

// ── column mapping ────────────────────────────────────────────────────────────
const COL_ALIASES: Record<string, string[]> = {
  typeTransaction:    ['typedetransaction', 'typetransaction', 'transaction'],
  famille:            ['famille', 'familleproduit'],
  sousFamille:        ['sousfamille'],
  modele:             ['fichetechlibelle', 'fichetech', 'modele', 'libellearticle', 'achatlibellearticle', 'libelle'],
  grade:              ['articlegrade', 'grade', 'gradearticle'],
  prixAchat:          ['achatprix', 'prixachat', 'prixdachat'],
  prixVente:          ['venteprixvendu', 'prixvente', 'prixvendu'],
  delaiVente:         ['ventedelai', 'delaivente', 'delaideVente'],
  dateAchat:          ['dateachat', 'datedachat'],
  dateVente:          ['ventedate', 'datevente'],
  easypricePrixVente: ['easypriceprixventegradeb', 'easypriceprixvente', 'coteep'],
  easypricePrixAchat: ['easypriceprixachatgradeb', 'easypriceprixachat'],
};

function norm(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\s_\-'"]/g, '');
}

function mapColumns(headers: string[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (const h of headers) {
    const n = norm(h);
    for (const [field, aliases] of Object.entries(COL_ALIASES)) {
      if (!r[field] && aliases.includes(n)) r[field] = h;
    }
  }
  return r;
}

function parseNum(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDateVal(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const s = v.trim();
    const m1 = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1]);
    const m2 = s.match(/^(\d{4})[/\-](\d{2})[/\-](\d{2})/);
    if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);
  }
  return null;
}

// ── filter + compute ──────────────────────────────────────────────────────────
function filterRows(rows: CRow[], periode: Periode, grade: string): CRow[] {
  let cutoff: Date | null = null;
  if (periode !== 'all') {
    cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - (periode === '3m' ? 3 : periode === '6m' ? 6 : 12));
  }
  return rows.filter(r => {
    if (grade !== 'all' && r.g !== grade) return false;
    if (cutoff && r.d && new Date(r.d) < cutoff) return false;
    return true;
  });
}

function computeStats(rows: CRow[]): ModelStats[] {
  const groups = new Map<string, {
    modele: string; famille: string;
    pas: number[]; pvs: number[]; dvs: number[]; eps: number[]; epas: number[];
  }>();
  for (const r of rows) {
    const key = r.m.toLowerCase();
    if (!groups.has(key)) groups.set(key, { modele: r.m, famille: r.f, pas: [], pvs: [], dvs: [], eps: [], epas: [] });
    const g = groups.get(key)!;
    g.pas.push(r.pa);
    g.pvs.push(r.pv);
    if (r.dv !== null && r.dv > 0) g.dvs.push(r.dv);
    if (r.ep != null  && r.ep  > 0) g.eps.push(r.ep);
    if (r.epa != null && r.epa > 0) g.epas.push(r.epa);
  }
  return Array.from(groups.values()).map(g => {
    const qte        = g.pvs.length;
    const margeTotal = Math.round(g.pvs.reduce((s, v, i) => s + v - g.pas[i], 0));
    const caTotal    = Math.round(g.pvs.reduce((s, v) => s + v, 0));
    const paMoyen    = qte > 0 ? Math.round(g.pas.reduce((s, v) => s + v, 0) / qte) : 0;
    const pvMoyen    = qte > 0 ? Math.round(caTotal / qte) : 0;
    const epMoyen    = g.eps.length  > 0 ? Math.round(g.eps.reduce((s,v) => s+v, 0)  / g.eps.length)  : null;
    const epaMoyen   = g.epas.length > 0 ? Math.round(g.epas.reduce((s,v) => s+v, 0) / g.epas.length) : null;
    const ecartEP    = epMoyen != null && pvMoyen > 0 ? Math.round((pvMoyen - epMoyen) / epMoyen * 100) : null;
    return {
      modele: g.modele, famille: g.famille, qteVendue: qte,
      delaiMoyen: g.dvs.length > 0 ? Math.round(g.dvs.reduce((s,v)=>s+v,0) / g.dvs.length) : null,
      margeUnitaire: qte > 0 ? Math.round(margeTotal / qte) : 0,
      margeTotal, caTotal, paMoyen, pvMoyen,
      tauxMarge: caTotal > 0 ? Math.round(margeTotal / caTotal * 100) : 0,
      epMoyen, epaMoyen, ecartEP,
    };
  });
}

// ── exported helper for AssistantIA ──────────────────────────────────────────
export function getJournalContext(magasinNom: string): string {
  try {
    const s = localStorage.getItem(`journal_analyse_${magasinNom}`);
    if (!s) return '';
    const stored = JSON.parse(s) as StoredImport;
    if (!Array.isArray(stored.rows) || stored.rows.length === 0) return '';
    const stats = computeStats(stored.rows);
    const fmtD  = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-FR') : '?';
    const period = stored.dateMin && stored.dateMax ? `du ${fmtD(stored.dateMin)} au ${fmtD(stored.dateMax)}` : 'période inconnue';

    const rotSet   = new Set(stats.filter(s => s.delaiMoyen !== null && s.delaiMoyen < 30).map(s => s.modele.toLowerCase()));
    const topRot   = stats.filter(s => s.delaiMoyen !== null && s.delaiMoyen < 30).sort((a, b) => (a.delaiMoyen ?? 999) - (b.delaiMoyen ?? 999)).slice(0, 5).map(r => `${r.modele} (${r.delaiMoyen}j)`).join(', ');
    const topMarge = [...stats].sort((a, b) => b.margeTotal - a.margeTotal).slice(0, 5).map(m => `${m.modele} (${m.margeTotal.toLocaleString('fr-FR')}€)`).join(', ');
    const pepites  = [...stats].sort((a, b) => b.margeTotal - a.margeTotal).filter(s => rotSet.has(s.modele.toLowerCase())).slice(0, 3).map(p => p.modele).join(', ');
    const tueurs   = stats.filter(s => s.margeTotal < 0 || s.margeUnitaire < 0.20 * s.paMoyen).sort((a, b) => a.margeTotal - b.margeTotal).slice(0, 3).map(t => t.modele).join(', ');
    const ecarts   = stats.filter(s => s.ecartEP !== null && Math.abs(s.ecartEP) > 10).sort((a, b) => Math.abs(b.ecartEP!) - Math.abs(a.ecartEP!)).slice(0, 3).map(e => `${e.modele} (${e.ecartEP! > 0 ? '+' : ''}${e.ecartEP}%)`).join(', ');

    // Global EP vente
    const epMs = stats.filter(s => s.epMoyen != null && s.epMoyen > 0);
    const epVenteGlobal = epMs.length > 0 ? (() => {
      const tq = epMs.reduce((s, m) => s + m.qteVendue, 0);
      return tq > 0 ? Math.round(epMs.reduce((s, m) => s + ((m.pvMoyen - m.epMoyen!) / m.epMoyen! * 100) * m.qteVendue, 0) / tq * 10) / 10 : null;
    })() : null;

    // Global EP achat
    const epaMs = stats.filter(s => s.epaMoyen != null && s.epaMoyen > 0);
    const epAchatGlobal = epaMs.length > 0 ? (() => {
      const tq = epaMs.reduce((s, m) => s + m.qteVendue, 0);
      return tq > 0 ? Math.round(epaMs.reduce((s, m) => s + ((m.paMoyen - m.epaMoyen!) / m.epaMoyen! * 100) * m.qteVendue, 0) / tq * 10) / 10 : null;
    })() : null;

    // Top 3 brands
    const brands = new Map<string, number>();
    for (const r of stored.rows) { const b = (r.m.trim().split(/\s+/)[0] || '—').toUpperCase(); brands.set(b, (brands.get(b) ?? 0) + 1); }
    const total = stored.rows.length;
    const topBrands = Array.from(brands.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b, c]) => `${b} ${Math.round(c/total*100)}%`).join(', ');

    return [
      `\nAnalyse journal ${magasinNom} · ${stored.rows.length.toLocaleString('fr-FR')} ventes · ${period}.`,
      `Top rotations (<30j) : ${topRot || 'aucun'}.`,
      `Top marges : ${topMarge || 'aucun'}.`,
      `Pépites locales : ${pepites || 'aucune'}.`,
      `Tueurs de marge : ${tueurs || 'aucun'}.`,
      epVenteGlobal != null ? `Écart prix global vs cote EP : ${epVenteGlobal > 0 ? '+' : ''}${epVenteGlobal}%.` : '',
      epAchatGlobal != null ? `Politique d'achat magasin : ${epAchatGlobal > 5 ? 'Généreuse' : epAchatGlobal < -5 ? 'Opportuniste' : 'Alignée'} (${epAchatGlobal > 0 ? '+' : ''}${epAchatGlobal}%).` : '',
      topBrands ? `Marques dominantes : ${topBrands}.` : '',
      ecarts ? `Écarts prix vs cote EP >10% : ${ecarts}.` : '',
    ].filter(Boolean).join('\n');
  } catch { return ''; }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function Badge({ qty }: { qty: number }) {
  if (qty >= 10) return <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 ml-1.5 whitespace-nowrap font-medium">✅ Très fiable</span>;
  if (qty >= 5)  return <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-green-50  text-green-600 ml-1.5 whitespace-nowrap font-medium">🟢 Fiable</span>;
  if (qty >= 3)  return <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 ml-1.5 whitespace-nowrap font-medium">🟡 Tendance</span>;
  return           <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 ml-1.5 whitespace-nowrap font-medium">🔴 À confirmer</span>;
}

const TH  = 'px-3 py-2.5 text-left  text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const THR = 'px-3 py-2.5 text-right text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const TD  = 'px-3 py-2 text-xs text-[#1A1A1A] border-t border-[#F0F0F0]';
const TDR = 'px-3 py-2 text-xs text-right text-[#1A1A1A] border-t border-[#F0F0F0]';

interface ColDef { label: string; right?: boolean; render: (s: ModelStats) => ReactNode; }

function SectionTable({ title, cnt, alert, rows, cols, emptyMsg }: {
  title: string; cnt?: string; alert?: string;
  rows: ModelStats[]; cols: ColDef[]; emptyMsg?: string;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-[#1A1A1A]">{title}</h3>
        {cnt && <span className="text-xs text-[#9CA3AF]">{cnt}</span>}
      </div>
      {alert && <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">{alert}</div>}
      {rows.length === 0 ? (
        <p className="text-xs text-[#9CA3AF] italic px-1">{emptyMsg ?? 'Aucun résultat.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
          <table className="text-xs w-full border-collapse">
            <thead><tr>{cols.map((c, i) => <th key={i} className={c.right ? THR : TH}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                  {cols.map((c, j) => <td key={j} className={c.right ? TDR : TD}>{c.render(s)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function JournalAchatVente({ magasinNom, onAddAction }: Props) {
  const [stored,   setStored]   = useState<StoredImport | null>(null);
  const [periode,  setPeriode]  = useState<Periode>('all');
  const [grade,    setGrade]    = useState('all');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [toast,    setToast]    = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(`journal_analyse_${magasinNom}`);
      if (!s) { setStored(null); return; }
      const p = JSON.parse(s) as StoredImport;
      if (!Array.isArray(p.rows)) { localStorage.removeItem(`journal_analyse_${magasinNom}`); setStored(null); return; }
      setStored(p);
    } catch { setStored(null); }
  }, [magasinNom]);

  const processFile = useCallback(async (file: File) => {
    setLoading(true); setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
      if (rawRows.length === 0) throw new Error('Le fichier semble vide.');

      const colMap = mapColumns(Object.keys(rawRows[0]));
      if (!colMap.modele && !colMap.prixVente) throw new Error("Colonnes non reconnues. Vérifiez que c'est bien un export Athéna.");

      const compactRows: CRow[] = [];
      let dateMin: Date | null = null;
      let dateMax: Date | null = null;

      for (const row of rawRows) {
        if (colMap.typeTransaction) {
          if (!norm(String(row[colMap.typeTransaction] ?? '')).includes('vente')) continue;
        }
        const pv = colMap.prixVente ? parseNum(row[colMap.prixVente]) : 0;
        if (pv <= 0) continue; // retours SAV ou données invalides

        const modele = colMap.modele ? String(row[colMap.modele] ?? '').trim() : '';
        if (!modele) continue;

        const g = colMap.grade ? String(row[colMap.grade] ?? '').trim().toUpperCase() : '';
        if (g === 'D') continue; // PARTIE A: exclure grade D systématiquement

        const pa        = colMap.prixAchat ? parseNum(row[colMap.prixAchat]) : 0;
        const dvRaw     = colMap.delaiVente ? row[colMap.delaiVente] : null;
        const dvNum     = dvRaw !== '' && dvRaw != null ? parseNum(dvRaw) : 0;
        const dv        = dvNum > 0 ? dvNum : null;
        const dateVente = colMap.dateVente ? parseDateVal(row[colMap.dateVente]) : null;
        const famille   = colMap.famille ? String(row[colMap.famille] ?? '').trim() : '';
        const epRaw     = colMap.easypricePrixVente  ? row[colMap.easypricePrixVente]  : null;
        const epaRaw    = colMap.easypricePrixAchat  ? row[colMap.easypricePrixAchat]  : null;
        const ep        = epRaw  !== '' && epRaw  != null ? (parseNum(epRaw)  || null) : null;
        const epa       = epaRaw !== '' && epaRaw != null ? (parseNum(epaRaw) || null) : null;

        if (dateVente) {
          if (!dateMin || dateVente < dateMin) dateMin = dateVente;
          if (!dateMax || dateVente > dateMax) dateMax = dateVente;
        }
        compactRows.push({ m: modele, f: famille, g, d: dateVente?.toISOString() ?? null, pa, pv, dv, ep, epa });
      }

      if (compactRows.length === 0) throw new Error('Aucune vente valide (A/B/C) trouvée. Vérifiez la colonne "Type de transaction" et les données.');

      const result: StoredImport = { importedAt: new Date().toISOString(), rows: compactRows, dateMin: dateMin?.toISOString() ?? null, dateMax: dateMax?.toISOString() ?? null };
      setStored(result);
      try { localStorage.setItem(`journal_analyse_${magasinNom}`, JSON.stringify(result)); } catch { /* quota */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally { setLoading(false); }
  }, [magasinNom]);

  function handleFile(f: File | null | undefined) {
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv', 'xlsx', 'xls'].includes(ext)) { setError('Format non supporté. Utilisez .csv, .xlsx ou .xls.'); return; }
    processFile(f);
  }

  // ── computed ──────────────────────────────────────────────────────────────
  const filteredRows  = useMemo(() => stored ? filterRows(stored.rows, periode, grade) : [], [stored, periode, grade]);
  const stats         = useMemo(() => computeStats(filteredRows), [filteredRows]);

  const hasEPVente    = useMemo(() => stats.some(s => s.epMoyen   != null), [stats]);
  const hasEPAchat    = useMemo(() => stats.some(s => s.epaMoyen  != null), [stats]);

  const topRotations  = useMemo(() => stats.filter(s => s.delaiMoyen !== null && s.delaiMoyen < 30).sort((a, b) => (a.delaiMoyen ?? 999) - (b.delaiMoyen ?? 999)), [stats]);
  const topMarge      = useMemo(() => [...stats].sort((a, b) => b.margeTotal  - a.margeTotal ).slice(0, 20), [stats]);
  const topVolume     = useMemo(() => [...stats].sort((a, b) => b.qteVendue   - a.qteVendue  ).slice(0, 15), [stats]);
  const tueursMarge   = useMemo(() => stats.filter(s => s.qteVendue >= 3 && (s.margeTotal < 0 || s.margeUnitaire < 0.20 * s.paMoyen)).sort((a, b) => a.margeTotal - b.margeTotal), [stats]);

  // PARTIE B: EP coherence — only |écart| > 10%, simplified status
  const coherenceEP   = useMemo(() => stats.filter(s => s.ecartEP !== null && Math.abs(s.ecartEP) > 10).sort((a, b) => Math.abs(b.ecartEP!) - Math.abs(a.ecartEP!)), [stats]);

  const pepites = useMemo(() => {
    const rotSet = new Set(topRotations.filter(r => r.qteVendue >= 5).map(r => r.modele.toLowerCase()));
    return topMarge.filter(m => rotSet.has(m.modele.toLowerCase())).slice(0, 5);
  }, [topRotations, topMarge]);

  // PARTIE C — Global indicators
  const globalEPVente = useMemo((): number | null => {
    const ms = stats.filter(s => s.epMoyen != null && s.epMoyen > 0);
    if (!ms.length) return null;
    const tq = ms.reduce((s, m) => s + m.qteVendue, 0);
    return tq > 0 ? Math.round(ms.reduce((s, m) => s + ((m.pvMoyen - m.epMoyen!) / m.epMoyen! * 100) * m.qteVendue, 0) / tq * 10) / 10 : null;
  }, [stats]);

  const globalEPAchat = useMemo((): number | null => {
    const ms = stats.filter(s => s.epaMoyen != null && s.epaMoyen > 0);
    if (!ms.length) return null;
    const tq = ms.reduce((s, m) => s + m.qteVendue, 0);
    return tq > 0 ? Math.round(ms.reduce((s, m) => s + ((m.paMoyen - m.epaMoyen!) / m.epaMoyen! * 100) * m.qteVendue, 0) / tq * 10) / 10 : null;
  }, [stats]);

  const topBrands = useMemo(() => {
    const brands = new Map<string, number>();
    for (const r of filteredRows) {
      const b = (r.m.trim().split(/\s+/)[0] || '—').toUpperCase();
      brands.set(b, (brands.get(b) ?? 0) + 1);
    }
    const total = filteredRows.length;
    if (!total) return [];
    return Array.from(brands.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([brand, count]) => ({ brand, count, pct: Math.round(count / total * 100) }));
  }, [filteredRows]);

  // PARTIE D — investissement total top rotations
  const investTotal = useMemo(() => topRotations.reduce((s, r) => s + r.paMoyen, 0), [topRotations]);

  // PARTIE E — add to PAP
  function addToPAP() {
    if (!onAddAction) return;
    const reliableRots = topRotations.filter(r => r.qteVendue >= 5).slice(0, 5);
    const pepiteExtra  = pepites.filter(p => !reliableRots.some(r => r.modele === p.modele)).slice(0, 3);
    const refList = [...reliableRots, ...pepiteExtra].map(r => r.modele).join(', ') || '(voir module Journal achat-vente)';
    const echeance = new Date(); echeance.setDate(echeance.getDate() + 7);
    onAddAction({
      id:          Math.random().toString(36).slice(2),
      titre:       'Commander les références prioritaires',
      axe:         'Stock',
      pilote:      'Acheteur principal',
      copilote:    '',
      description: `Commander cette semaine les références suivantes (issues de l'analyse Journal) : ${refList}`,
      echeance:    echeance.toISOString().slice(0, 10),
      priorite:    1,
      gain:        0,
      statut:      'À faire',
    });
    setToast("✓ Action ajoutée au Plan d'Action. Échéance : dans 7 jours.");
    setTimeout(() => setToast(null), 4000);
  }

  const fmtD = (s: string | null) => s ? new Date(s).toLocaleDateString('fr-FR') : '?';
  const fmtEcart = (v: number) => `${v > 0 ? '+' : ''}${v}%`;

  const modeleCol = (s: ModelStats) => (
    <span className="flex items-center flex-wrap max-w-[220px]">
      <span className="truncate font-medium">{s.modele}</span>
      <Badge qty={s.qteVendue} />
    </span>
  );

  const showGlobalBanner = stored && stats.length > 0 && (hasEPVente || hasEPAchat || topBrands.length > 0);

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] bg-green-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}

      <h2 className="text-lg font-bold text-[#1A1A1A]">Journal achat-vente · {magasinNom || 'Magasin'}</h2>

      {/* Intro */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl px-4 py-3 space-y-1.5">
        <p className="text-sm text-[#6B7280]">
          Importez votre export Athéna du journal achat-vente (CSV ou Excel) pour identifier les modèles qui tournent vite, qui génèrent de la marge, et les écarts éventuels avec la cote réseau. La période couverte dépend de l&apos;export fourni (3 mois, 6 mois, 1 an, plus).
        </p>
        <p className="text-xs text-[#9CA3AF] italic">
          Les quantités peuvent légèrement différer du journal brut. L&apos;outil exclut systématiquement le grade D, les retours SAV (prix négatifs) et les données incomplètes pour produire une lecture business fiable.
        </p>
      </div>

      {/* PARTIE C — Global indicators banner */}
      {showGlobalBanner && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 space-y-4">
          <h3 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">📈 Lecture globale magasin</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* EP vente */}
            {hasEPVente && globalEPVente != null && (
              <div className={`rounded-lg p-3 border ${globalEPVente < -5 ? 'bg-red-50 border-red-200' : globalEPVente > 5 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">💰 Écart prix vs cote EP</p>
                <p className={`text-lg font-black ${globalEPVente < -5 ? 'text-red-600' : globalEPVente > 5 ? 'text-orange-500' : 'text-green-600'}`}>
                  {fmtEcart(globalEPVente)}
                </p>
                <p className={`text-xs mt-0.5 ${globalEPVente < -5 ? 'text-red-600' : globalEPVente > 5 ? 'text-orange-600' : 'text-green-700'}`}>
                  {globalEPVente < -5
                    ? `Vous vendez en moyenne ${Math.abs(globalEPVente)}% sous la cote réseau. Marge potentielle laissée sur la table.`
                    : globalEPVente > 5
                      ? `Vous vendez en moyenne ${globalEPVente}% au-dessus de la cote réseau. Vigilance sur la rotation.`
                      : 'Pratique tarifaire alignée avec la cote réseau.'}
                </p>
              </div>
            )}

            {/* EP achat */}
            {hasEPAchat && globalEPAchat != null && (
              <div className={`rounded-lg p-3 border ${globalEPAchat > 5 ? 'bg-orange-50 border-orange-200' : globalEPAchat < -5 ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
                <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-1">🛒 Politique d&apos;achat</p>
                <p className={`text-lg font-black ${globalEPAchat > 5 ? 'text-orange-500' : globalEPAchat < -5 ? 'text-blue-600' : 'text-green-600'}`}>
                  {fmtEcart(globalEPAchat)}
                </p>
                <p className={`text-xs mt-0.5 ${globalEPAchat > 5 ? 'text-orange-600' : globalEPAchat < -5 ? 'text-blue-600' : 'text-green-700'}`}>
                  {globalEPAchat > 5
                    ? `Politique généreuse — vous achetez en moyenne ${globalEPAchat}% au-dessus de la cote réseau.`
                    : globalEPAchat < -5
                      ? `Politique opportuniste — vous achetez en moyenne ${Math.abs(globalEPAchat)}% sous la cote réseau.`
                      : 'Politique alignée — vos achats sont au niveau de la cote réseau.'}
                </p>
              </div>
            )}

            {/* Brands */}
            {topBrands.length > 0 && (
              <div className="rounded-lg p-3 border border-[#E0E0E0]">
                <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider mb-2">🏷️ Répartition marques (top 5)</p>
                <div className="space-y-1.5">
                  {topBrands.map(b => (
                    <div key={b.brand} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[#1A1A1A] w-16 truncate">{b.brand}</span>
                      <div className="flex-1 bg-[#F5F5F5] rounded-full h-1.5">
                        <div className="bg-[#E30613] h-1.5 rounded-full" style={{ width: `${b.pct}%` }} />
                      </div>
                      <span className="text-xs text-[#6B7280] w-8 text-right">{b.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-5">
        <div>
          <p className="text-xs text-[#6B7280] mb-1.5 font-medium">Période d&apos;analyse</p>
          <div className="flex gap-1.5 flex-wrap">
            {([['all', 'Toute la période'], ['3m', '3 derniers mois'], ['6m', '6 derniers mois'], ['12m', '12 derniers mois']] as [Periode, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setPeriode(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${periode === v ? 'bg-[#E30613] text-white' : 'bg-white border border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613] hover:text-[#E30613]'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {/* PARTIE A: grade filter excludes D */}
        <div>
          <p className="text-xs text-[#6B7280] mb-1.5 font-medium">Grade</p>
          <div className="flex gap-1.5">
            {[['all', 'Tous (A, B, C)'], ['A', 'A'], ['B', 'B'], ['C', 'C']].map(([g, l]) => (
              <button key={g} onClick={() => setGrade(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${grade === g ? 'bg-[#E30613] text-white' : 'bg-white border border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613] hover:text-[#E30613]'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-xl px-6 py-8 text-center transition-all ${dragOver ? 'border-[#E30613] bg-[#FFF5F5]' : 'border-[#E0E0E0] bg-white hover:border-[#E30613] hover:bg-[#FFF5F5]'}`}
      >
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
        {loading ? (
          <div className="space-y-2"><div className="text-2xl animate-pulse">⏳</div><p className="text-sm text-[#6B7280]">Analyse en cours…</p></div>
        ) : (
          <div className="space-y-2">
            <div className="text-3xl">📂</div>
            <p className="text-sm font-semibold text-[#1A1A1A]">Glissez votre fichier ici ou cliquez pour importer</p>
            <p className="text-xs text-[#9CA3AF]">Formats acceptés : .csv · .xlsx · .xls — Export Athéna journal achat-vente</p>
            {stored && <p className="text-xs text-[#6B7280] mt-1">Dernier import : {new Date(stored.importedAt).toLocaleDateString('fr-FR')} · {stored.rows.length.toLocaleString('fr-FR')} ventes (grades A/B/C)</p>}
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2"><span>⚠️</span><span>{error}</span></div>}

      {!stored && !loading && !error && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm font-semibold text-[#1A1A1A]">Aucune analyse encore</p>
          <p className="text-xs text-[#6B7280] mt-1">Importez votre journal Athéna pour démarrer.</p>
        </div>
      )}

      {stored && !loading && stats.length === 0 && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-8 text-center">
          <p className="text-sm font-semibold text-[#1A1A1A]">Aucune donnée pour ces filtres</p>
          <p className="text-xs text-[#6B7280] mt-1">Essayez une autre période ou un autre grade.</p>
        </div>
      )}

      {/* ── Results ── */}
      {stored && !loading && stats.length > 0 && (
        <div className="space-y-7">

          {/* Analysis header */}
          <div className="bg-[#F5F5F5] rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center justify-between text-xs">
            <span className="text-[#6B7280]">
              Analyse basée sur{' '}
              <strong className="text-[#1A1A1A]">{filteredRows.length.toLocaleString('fr-FR')} ventes</strong>
              {stored.dateMin && stored.dateMax && <> du <strong className="text-[#1A1A1A]">{fmtD(stored.dateMin)}</strong> au <strong className="text-[#1A1A1A]">{fmtD(stored.dateMax)}</strong></>}
              {grade !== 'all' && <> · Grade <strong className="text-[#1A1A1A]">{grade}</strong></>}
            </span>
            <button onClick={() => { localStorage.removeItem(`journal_analyse_${magasinNom}`); setStored(null); }} className="text-[#9CA3AF] hover:text-red-500 transition-colors">
              🗑 Effacer l&apos;analyse
            </button>
          </div>

          {/* Reliability legend */}
          <p className="text-xs text-[#9CA3AF] italic">
            La fiabilité dépend du volume de ventes. En dessous de 5 ventes, traitez la donnée comme indicative.
          </p>

          {/* ── Section 1 — Top Rotations ── */}
          <div className="space-y-3">
            <SectionTable
              title="⚡ TOP ROTATIONS (délai moyen < 30 jours)"
              cnt={`${topRotations.length} modèle${topRotations.length > 1 ? 's' : ''}`}
              rows={topRotations}
              cols={[
                { label: 'Modèle',             render: modeleCol },
                { label: 'Famille',             render: s => s.famille || '—' },
                { label: 'Qté',    right: true, render: s => s.qteVendue },
                { label: 'Délai',  right: true, render: s => s.delaiMoyen !== null ? `${s.delaiMoyen} j` : '—' },
                { label: 'Marge unit.', right: true, render: s => `${s.margeUnitaire.toLocaleString('fr-FR')} €` },
                { label: 'Marge totale', right: true, render: s => `${s.margeTotal.toLocaleString('fr-FR')} €` },
                // PARTIE D — Investissement type
                { label: 'Investissement type', right: true, render: s => s.paMoyen > 0 ? <span className="text-[#E30613] font-semibold">{s.paMoyen.toLocaleString('fr-FR')} € / unité</span> : '—' },
              ]}
              emptyMsg="Aucun modèle avec délai moyen < 30 jours sur cette période."
            />
            {/* PARTIE D — Recap block */}
            {topRotations.length > 0 && investTotal > 0 && (
              <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg px-4 py-3 text-sm">
                <span className="font-semibold text-[#E30613]">💡 Investissement total pour 1 unité de chaque top rotation :</span>
                <span className="font-black text-[#1A1A1A] ml-2">{investTotal.toLocaleString('fr-FR')} €</span>
                <span className="text-xs text-[#6B7280] ml-2">Investissement type pour mettre chacune en stock permanent.</span>
              </div>
            )}
          </div>

          {/* ── Section 2 — Top Marge ── */}
          <SectionTable
            title="💰 TOP VENTES EN MARGE"
            cnt={`Top ${topMarge.length}`}
            rows={topMarge}
            cols={[
              { label: 'Modèle',        render: modeleCol },
              { label: 'Famille',       render: s => s.famille || '—' },
              { label: 'Qté', right: true, render: s => s.qteVendue },
              { label: 'Marge totale',  right: true, render: s => `${s.margeTotal.toLocaleString('fr-FR')} €` },
              { label: 'Marge unit.',   right: true, render: s => `${s.margeUnitaire.toLocaleString('fr-FR')} €` },
              { label: 'Délai moyen',   right: true, render: s => s.delaiMoyen !== null ? `${s.delaiMoyen} j` : '—' },
            ]}
          />

          {/* ── Section 3 — Top Volume ── */}
          <SectionTable
            title="📦 TOP VENTES EN VOLUME"
            cnt={`Top ${topVolume.length}`}
            rows={topVolume}
            cols={[
              { label: 'Modèle',        render: modeleCol },
              { label: 'Famille',       render: s => s.famille || '—' },
              { label: 'Qté', right: true, render: s => s.qteVendue },
              { label: 'Délai moyen',   right: true, render: s => s.delaiMoyen !== null ? `${s.delaiMoyen} j` : '—' },
              { label: 'Marge totale',  right: true, render: s => `${s.margeTotal.toLocaleString('fr-FR')} €` },
              { label: 'Marge unit.',   right: true, render: s => `${s.margeUnitaire.toLocaleString('fr-FR')} €` },
            ]}
          />

          {/* ── Section 4 — Tueurs de marge ── */}
          <SectionTable
            title="⚠️ Tueurs de marge"
            cnt={tueursMarge.length > 0 ? `${tueursMarge.length} modèle${tueursMarge.length > 1 ? 's' : ''}` : undefined}
            alert="Ces modèles tournent dans votre magasin mais ne génèrent pas (ou peu) de marge. À questionner : prix de vente trop bas ? Prix d'achat trop élevé ? Grade incorrect ?"
            rows={tueursMarge}
            cols={[
              { label: 'Modèle',              render: modeleCol },
              { label: 'Qté',   right: true,  render: s => s.qteVendue },
              { label: 'PA moy.', right: true, render: s => `${s.paMoyen.toLocaleString('fr-FR')} €` },
              { label: 'PV moy.', right: true, render: s => `${s.pvMoyen.toLocaleString('fr-FR')} €` },
              { label: 'Marge unit.', right: true, render: s => <span className={s.margeUnitaire < 0 ? 'text-red-600 font-semibold' : 'text-orange-500'}>{s.margeUnitaire.toLocaleString('fr-FR')} €</span> },
              { label: 'Taux marge', right: true, render: s => <span className={s.tauxMarge < 0 ? 'text-red-600 font-semibold' : 'text-orange-500'}>{s.tauxMarge} %</span> },
            ]}
            emptyMsg="✓ Aucun tueur de marge identifié sur cette période."
          />

          {/* ── Section 5 — Cohérence EP (PARTIE B: seuil 10%, status simplifié) ── */}
          {hasEPVente && (
            <SectionTable
              title="💡 Cohérence prix EasyPrice"
              cnt={coherenceEP.length > 0 ? `${coherenceEP.length} modèle${coherenceEP.length > 1 ? 's' : ''} avec écart > 10%` : undefined}
              alert="Seuls les modèles avec un écart > 10% (en plus ou en moins) sont affichés. Les modèles sous-évalués indiquent une perte de marge potentielle ; les sur-évalués peuvent ralentir la rotation."
              rows={coherenceEP}
              cols={[
                { label: 'Modèle',      render: modeleCol },
                { label: 'Qté', right: true, render: s => s.qteVendue },
                { label: 'PV moyen',    right: true, render: s => `${s.pvMoyen.toLocaleString('fr-FR')} €` },
                { label: 'Cote EP (B)', right: true, render: s => s.epMoyen != null ? `${s.epMoyen.toLocaleString('fr-FR')} €` : '—' },
                { label: 'Écart %',     right: true, render: s => {
                  if (s.ecartEP === null) return '—';
                  return <span className={s.ecartEP < 0 ? 'text-red-600 font-semibold' : 'text-orange-500 font-semibold'}>{fmtEcart(s.ecartEP)}</span>;
                }},
                { label: 'Statut', render: s => {
                  if (s.ecartEP === null) return '—';
                  return s.ecartEP < 0
                    ? <span className="text-red-600 font-semibold">🔴 Sous-évalué</span>
                    : <span className="text-orange-500 font-semibold">🟠 Sur-évalué</span>;
                }},
              ]}
              emptyMsg="✓ Aucun écart significatif (> 10%) vs cote EasyPrice sur cette période."
            />
          )}

          {/* ── Synthesis ── */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#1A1A1A]">🎯 Recommandations stratégiques</h3>
            <p className="text-xs text-[#6B7280]">D&apos;après votre journal :</p>
            <ul className="space-y-2.5 text-sm">
              <li>
                <span className="font-semibold text-[#1A1A1A]">⚡ Rotation rapide (&lt; 30j, fiabilité 🟢 ou ✅) :</span>{' '}
                <span className="text-[#6B7280]">{topRotations.filter(r => r.qteVendue >= 5).slice(0, 5).map(r => `${r.modele} (${r.delaiMoyen}j)`).join(', ') || 'Aucun modèle fiable sur cette période.'}</span>
              </li>
              <li>
                <span className="font-semibold text-[#1A1A1A]">💰 Plus forte marge cumulée :</span>{' '}
                <span className="text-[#6B7280]">{topMarge.slice(0, 5).map(m => `${m.modele} (${m.margeTotal.toLocaleString('fr-FR')} €)`).join(', ') || 'Aucune donnée.'}</span>
              </li>
              <li>
                <span className="font-semibold text-[#E30613]">💎 Pépites locales (rotation rapide + forte marge) :</span>{' '}
                <span className="text-[#6B7280]">{pepites.length > 0 ? pepites.map(p => p.modele).join(', ') : 'Aucune pépite détectée — élargissez la période ou affinez les filtres.'}</span>
              </li>
              {tueursMarge.length > 0 && (
                <li>
                  <span className="font-semibold text-orange-600">⚠️ Tueurs de marge à investiguer :</span>{' '}
                  <span className="text-[#6B7280]">{tueursMarge.slice(0, 3).map(t => t.modele).join(', ')}</span>
                </li>
              )}
              {coherenceEP.length > 0 && (
                <li>
                  <span className="font-semibold text-[#1A1A1A]">💡 Écarts prix vs cote EP (&gt; 10%) :</span>{' '}
                  <span className="text-[#6B7280]">{coherenceEP.slice(0, 3).map(e => `${e.modele} (${fmtEcart(e.ecartEP!)})`).join(', ')}</span>
                </li>
              )}
            </ul>
            <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg px-4 py-3 text-xs text-[#1A1A1A]">
              <strong>Action prioritaire :</strong> intégrer les pépites locales fiables dans votre gamme prioritaire. Croisez avec le module <strong>Couverture de gamme</strong>.
            </div>
            {/* PARTIE E — PAP button */}
            {onAddAction && (
              <button
                onClick={addToPAP}
                className="w-full mt-1 bg-[#E30613] hover:bg-[#B8050F] text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors"
              >
                📋 Ajouter au Plan d&apos;Action
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

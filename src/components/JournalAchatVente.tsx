'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import * as XLSX from 'xlsx';

interface Props { magasinNom: string; }
type Periode = 'all' | '3m' | '6m' | '12m';

// ── compact row stored in localStorage (short keys to save space) ─────────────
interface CRow {
  m:  string;        // modele
  f:  string;        // famille
  g:  string;        // grade (uppercased)
  d:  string | null; // dateVente ISO
  pa: number;        // prixAchat
  pv: number;        // prixVente
  dv: number | null; // delaiVente (null if missing/zero)
  ep: number | null; // easyprice prixVente grade B
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
  epMoyen:       number | null;
  ecartEP:       number | null; // %
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

// ── pure filter + compute ─────────────────────────────────────────────────────
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
  const groups = new Map<string, { modele: string; famille: string; pas: number[]; pvs: number[]; dvs: number[]; eps: number[] }>();
  for (const r of rows) {
    const key = r.m.toLowerCase();
    if (!groups.has(key)) groups.set(key, { modele: r.m, famille: r.f, pas: [], pvs: [], dvs: [], eps: [] });
    const g = groups.get(key)!;
    g.pas.push(r.pa);
    g.pvs.push(r.pv);
    if (r.dv !== null && r.dv > 0) g.dvs.push(r.dv);
    if (r.ep !== null && r.ep > 0) g.eps.push(r.ep);
  }
  return Array.from(groups.values()).map(g => {
    const qte        = g.pvs.length;
    const margeTotal = Math.round(g.pvs.reduce((s, v, i) => s + v - g.pas[i], 0));
    const caTotal    = Math.round(g.pvs.reduce((s, v) => s + v, 0));
    const paMoyen    = qte > 0 ? Math.round(g.pas.reduce((s, v) => s + v, 0) / qte) : 0;
    const pvMoyen    = qte > 0 ? Math.round(caTotal / qte) : 0;
    const epMoyen    = g.eps.length > 0 ? Math.round(g.eps.reduce((s, v) => s + v, 0) / g.eps.length) : null;
    const ecartEP    = epMoyen && pvMoyen > 0 ? Math.round((pvMoyen - epMoyen) / epMoyen * 100) : null;
    return {
      modele: g.modele,
      famille: g.famille,
      qteVendue: qte,
      delaiMoyen: g.dvs.length > 0 ? Math.round(g.dvs.reduce((s, v) => s + v, 0) / g.dvs.length) : null,
      margeUnitaire: qte > 0 ? Math.round(margeTotal / qte) : 0,
      margeTotal,
      caTotal,
      paMoyen,
      pvMoyen,
      tauxMarge: caTotal > 0 ? Math.round(margeTotal / caTotal * 100) : 0,
      epMoyen,
      ecartEP,
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
    const ecarts   = stats.filter(s => s.ecartEP !== null).sort((a, b) => Math.abs(b.ecartEP!) - Math.abs(a.ecartEP!)).slice(0, 3).map(e => `${e.modele} (${e.ecartEP! > 0 ? '+' : ''}${e.ecartEP}%)`).join(', ');

    return `\nAnalyse journal ${magasinNom} · ${stored.rows.length.toLocaleString('fr-FR')} ventes · ${period}.\nTop rotations (<30j) : ${topRot || 'aucun'}.\nTop marges : ${topMarge || 'aucun'}.\nPépites locales : ${pepites || 'aucune'}.\nTueurs de marge : ${tueurs || 'aucun'}.\nÉcarts EP : ${ecarts || 'aucun'}.`;
  } catch { return ''; }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function Badge({ qty }: { qty: number }) {
  if (qty >= 10) return <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 ml-1.5 whitespace-nowrap font-medium">✅ Très fiable</span>;
  if (qty >= 5)  return <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 ml-1.5 whitespace-nowrap font-medium">🟢 Fiable</span>;
  if (qty >= 3)  return <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 ml-1.5 whitespace-nowrap font-medium">🟡 Tendance</span>;
  return           <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 ml-1.5 whitespace-nowrap font-medium">🔴 À confirmer</span>;
}

function epStatut(ecart: number): { label: string; cls: string } {
  if (ecart < -10) return { label: 'Sous-évalué',     cls: 'text-red-600 font-semibold' };
  if (ecart < -3)  return { label: 'Légèrement sous', cls: 'text-yellow-600' };
  if (ecart <= 5)  return { label: 'Aligné',           cls: 'text-green-600' };
  if (ecart <= 15) return { label: 'Au-dessus',        cls: 'text-orange-500' };
  return             { label: 'Sur-évalué',             cls: 'text-red-600 font-semibold' };
}

const TH  = 'px-3 py-2.5 text-left  text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const THR = 'px-3 py-2.5 text-right text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const TD  = 'px-3 py-2 text-xs text-[#1A1A1A] border-t border-[#F0F0F0]';
const TDR = 'px-3 py-2 text-xs text-right text-[#1A1A1A] border-t border-[#F0F0F0]';

interface ColDef { label: string; right?: boolean; render: (s: ModelStats) => ReactNode; }

function SectionTable({ title, cnt, alert, rows, cols, limit, emptyMsg }: {
  title: string; cnt?: string; alert?: string;
  rows: ModelStats[]; cols: ColDef[]; limit?: number; emptyMsg?: string;
}) {
  const display = limit ? rows.slice(0, limit) : rows;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-[#1A1A1A]">{title}</h3>
        {cnt && <span className="text-xs text-[#9CA3AF]">{cnt}</span>}
      </div>
      {alert && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">{alert}</div>
      )}
      {display.length === 0 ? (
        <p className="text-xs text-[#9CA3AF] italic px-1">{emptyMsg ?? 'Aucun résultat.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr>{cols.map((c, i) => <th key={i} className={c.right ? THR : TH}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {display.map((s, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                  {cols.map((c, j) => (
                    <td key={j} className={c.right ? TDR : TD}>{c.render(s)}</td>
                  ))}
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
export default function JournalAchatVente({ magasinNom }: Props) {
  const [stored,   setStored]   = useState<StoredImport | null>(null);
  const [periode,  setPeriode]  = useState<Periode>('all');
  const [grade,    setGrade]    = useState('all');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(`journal_analyse_${magasinNom}`);
      if (!s) { setStored(null); return; }
      const p = JSON.parse(s) as StoredImport;
      if (!Array.isArray(p.rows)) {
        // Old format without compact rows — reset
        localStorage.removeItem(`journal_analyse_${magasinNom}`);
        setStored(null);
      } else {
        setStored(p);
      }
    } catch { setStored(null); }
  }, [magasinNom]);

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
      if (rawRows.length === 0) throw new Error('Le fichier semble vide.');

      const colMap = mapColumns(Object.keys(rawRows[0]));
      if (!colMap.modele && !colMap.prixVente) {
        throw new Error("Colonnes non reconnues. Vérifiez que c'est bien un export Athéna (journal achat-vente).");
      }

      const compactRows: CRow[] = [];
      let dateMin: Date | null = null;
      let dateMax: Date | null = null;

      for (const row of rawRows) {
        if (colMap.typeTransaction) {
          const t = norm(String(row[colMap.typeTransaction] ?? ''));
          if (!t.includes('vente')) continue;
        }
        const pv = colMap.prixVente ? parseNum(row[colMap.prixVente]) : 0;
        if (pv <= 0) continue;

        const modele = colMap.modele ? String(row[colMap.modele] ?? '').trim() : '';
        if (!modele) continue;

        const pa         = colMap.prixAchat ? parseNum(row[colMap.prixAchat]) : 0;
        const dvRaw      = colMap.delaiVente ? row[colMap.delaiVente] : null;
        const dvNum      = dvRaw !== '' && dvRaw != null ? parseNum(dvRaw) : 0;
        const dv         = dvNum > 0 ? dvNum : null;
        const dateVente  = colMap.dateVente ? parseDateVal(row[colMap.dateVente]) : null;
        const famille    = colMap.famille ? String(row[colMap.famille] ?? '').trim() : '';
        const g          = colMap.grade ? String(row[colMap.grade] ?? '').trim().toUpperCase() : '';
        const epRaw      = colMap.easypricePrixVente ? row[colMap.easypricePrixVente] : null;
        const epNum      = epRaw !== '' && epRaw != null ? parseNum(epRaw) : 0;
        const ep         = epNum > 0 ? epNum : null;

        if (dateVente) {
          if (!dateMin || dateVente < dateMin) dateMin = dateVente;
          if (!dateMax || dateVente > dateMax) dateMax = dateVente;
        }

        compactRows.push({ m: modele, f: famille, g, d: dateVente?.toISOString() ?? null, pa, pv, dv, ep });
      }

      if (compactRows.length === 0) {
        throw new Error('Aucune vente valide trouvée. Vérifiez la colonne "Type de transaction" et les données de prix.');
      }

      const result: StoredImport = {
        importedAt: new Date().toISOString(),
        rows: compactRows,
        dateMin: dateMin?.toISOString() ?? null,
        dateMax: dateMax?.toISOString() ?? null,
      };
      setStored(result);
      try {
        localStorage.setItem(`journal_analyse_${magasinNom}`, JSON.stringify(result));
      } catch {
        // Ignore quota errors — data is in state even if not persisted
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue lors du parsing.');
    } finally {
      setLoading(false);
    }
  }, [magasinNom]);

  function handleFile(f: File | null | undefined) {
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv', 'xlsx', 'xls'].includes(ext)) { setError('Format non supporté. Utilisez .csv, .xlsx ou .xls.'); return; }
    processFile(f);
  }

  // ── computed ──
  const filteredRows = useMemo(() => stored ? filterRows(stored.rows, periode, grade) : [], [stored, periode, grade]);
  const stats        = useMemo(() => computeStats(filteredRows), [filteredRows]);
  const hasEPData    = useMemo(() => stored?.rows.some(r => r.ep !== null) ?? false, [stored]);

  const topRotations = useMemo(() =>
    stats.filter(s => s.delaiMoyen !== null && s.delaiMoyen < 30)
         .sort((a, b) => (a.delaiMoyen ?? 999) - (b.delaiMoyen ?? 999)),
    [stats]);

  const topMarge  = useMemo(() => [...stats].sort((a, b) => b.margeTotal - a.margeTotal).slice(0, 20), [stats]);
  const topVolume = useMemo(() => [...stats].sort((a, b) => b.qteVendue - a.qteVendue).slice(0, 15), [stats]);

  const tueursMarge = useMemo(() =>
    stats.filter(s => s.qteVendue >= 3 && (s.margeTotal < 0 || s.margeUnitaire < 0.20 * s.paMoyen))
         .sort((a, b) => a.margeTotal - b.margeTotal),
    [stats]);

  const coherenceEP = useMemo(() =>
    stats.filter(s => s.ecartEP !== null)
         .sort((a, b) => Math.abs(b.ecartEP!) - Math.abs(a.ecartEP!)),
    [stats]);

  const pepites = useMemo(() => {
    const rotSet = new Set(topRotations.filter(r => r.qteVendue >= 5).map(r => r.modele.toLowerCase()));
    return topMarge.filter(m => rotSet.has(m.modele.toLowerCase())).slice(0, 5);
  }, [topRotations, topMarge]);

  const fmtD = (s: string | null) => s ? new Date(s).toLocaleDateString('fr-FR') : '?';

  // ── column defs ──
  const modeleCol = (s: ModelStats) => (
    <span className="flex items-center flex-wrap max-w-[220px]">
      <span className="truncate font-medium">{s.modele}</span>
      <Badge qty={s.qteVendue} />
    </span>
  );

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-[#1A1A1A]">Journal achat-vente · {magasinNom || 'Magasin'}</h2>

      {/* Intro */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl px-4 py-3 space-y-1.5">
        <p className="text-sm text-[#6B7280]">
          Importez votre export Athéna du journal achat-vente (CSV ou Excel) pour identifier les modèles qui tournent vite, qui génèrent de la marge, et les écarts éventuels avec la cote réseau. La période d&apos;analyse couverte par votre fichier dépend de l&apos;export que vous fournissez (3 mois, 6 mois, 1 an, plus).
        </p>
        <p className="text-xs text-[#9CA3AF] italic">
          Les quantités calculées peuvent légèrement différer de votre journal brut. L&apos;outil filtre les lignes avec retours SAV, prix négatifs et données incomplètes pour produire une lecture business fiable.
        </p>
      </div>

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
        <div>
          <p className="text-xs text-[#6B7280] mb-1.5 font-medium">Grade</p>
          <div className="flex gap-1.5">
            {['all', 'A', 'B', 'C', 'D'].map(g => (
              <button key={g} onClick={() => setGrade(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${grade === g ? 'bg-[#E30613] text-white' : 'bg-white border border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613] hover:text-[#E30613]'}`}>
                {g === 'all' ? 'Tous' : g}
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
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={e => handleFile(e.target.files?.[0])} />
        {loading ? (
          <div className="space-y-2">
            <div className="text-2xl animate-pulse">⏳</div>
            <p className="text-sm text-[#6B7280]">Analyse en cours…</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-3xl">📂</div>
            <p className="text-sm font-semibold text-[#1A1A1A]">Glissez votre fichier ici ou cliquez pour importer</p>
            <p className="text-xs text-[#9CA3AF]">Formats acceptés : .csv · .xlsx · .xls — Export Athéna journal achat-vente</p>
            {stored && (
              <p className="text-xs text-[#6B7280] mt-1">
                Dernier import : {new Date(stored.importedAt).toLocaleDateString('fr-FR')} · {stored.rows.length.toLocaleString('fr-FR')} ventes brutes
              </p>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <span>⚠️</span><span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!stored && !loading && !error && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm font-semibold text-[#1A1A1A]">Aucune analyse encore</p>
          <p className="text-xs text-[#6B7280] mt-1">Importez votre journal Athéna pour démarrer.</p>
        </div>
      )}

      {/* No results after filter */}
      {stored && !loading && stats.length === 0 && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-8 text-center">
          <p className="text-sm font-semibold text-[#1A1A1A]">Aucune donnée pour ces filtres</p>
          <p className="text-xs text-[#6B7280] mt-1">Essayez une autre période ou un autre grade.</p>
        </div>
      )}

      {/* Results */}
      {stored && !loading && stats.length > 0 && (
        <div className="space-y-7">

          {/* Analysis header */}
          <div className="bg-[#F5F5F5] rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center justify-between text-xs">
            <span className="text-[#6B7280]">
              Analyse basée sur{' '}
              <strong className="text-[#1A1A1A]">{filteredRows.length.toLocaleString('fr-FR')} ventes</strong>
              {stored.dateMin && stored.dateMax && (
                <> du <strong className="text-[#1A1A1A]">{fmtD(stored.dateMin)}</strong> au <strong className="text-[#1A1A1A]">{fmtD(stored.dateMax)}</strong></>
              )}
              {grade !== 'all' && <> · Grade <strong className="text-[#1A1A1A]">{grade}</strong></>}
            </span>
            <button
              onClick={() => { localStorage.removeItem(`journal_analyse_${magasinNom}`); setStored(null); }}
              className="text-[#9CA3AF] hover:text-red-500 transition-colors"
            >
              🗑 Effacer l&apos;analyse
            </button>
          </div>

          {/* Reliability legend */}
          <div className="flex flex-wrap gap-3 text-xs text-[#9CA3AF] italic items-center">
            <span>La fiabilité dépend du volume de ventes. En dessous de 5 ventes, traitez la donnée comme indicative.</span>
            <div className="flex gap-2 flex-wrap not-italic">
              {[{ q: 1, l: 'À confirmer' }, { q: 3, l: 'Tendance' }, { q: 5, l: 'Fiable' }, { q: 10, l: 'Très fiable' }].map(b => (
                <span key={b.l} className="flex items-center gap-1"><Badge qty={b.q} /></span>
              ))}
            </div>
          </div>

          {/* ── Section 1 — Top Rotations ── */}
          <SectionTable
            title="⚡ TOP ROTATIONS (délai moyen < 30 jours)"
            cnt={`${topRotations.length} modèle${topRotations.length > 1 ? 's' : ''}`}
            rows={topRotations}
            cols={[
              { label: 'Modèle',       render: modeleCol },
              { label: 'Famille',      render: s => s.famille || '—' },
              { label: 'Qté',          right: true, render: s => s.qteVendue },
              { label: 'Délai moyen',  right: true, render: s => s.delaiMoyen !== null ? `${s.delaiMoyen} j` : '—' },
              { label: 'Marge unit.',  right: true, render: s => `${s.margeUnitaire.toLocaleString('fr-FR')} €` },
              { label: 'Marge totale', right: true, render: s => `${s.margeTotal.toLocaleString('fr-FR')} €` },
            ]}
            emptyMsg="Aucun modèle avec délai moyen < 30 jours sur cette période."
          />

          {/* ── Section 2 — Top Marge ── */}
          <SectionTable
            title="💰 TOP VENTES EN MARGE"
            cnt={`Top ${topMarge.length}`}
            rows={topMarge}
            cols={[
              { label: 'Modèle',       render: modeleCol },
              { label: 'Famille',      render: s => s.famille || '—' },
              { label: 'Qté',          right: true, render: s => s.qteVendue },
              { label: 'Marge totale', right: true, render: s => `${s.margeTotal.toLocaleString('fr-FR')} €` },
              { label: 'Marge unit.',  right: true, render: s => `${s.margeUnitaire.toLocaleString('fr-FR')} €` },
              { label: 'Délai moyen',  right: true, render: s => s.delaiMoyen !== null ? `${s.delaiMoyen} j` : '—' },
            ]}
          />

          {/* ── Section 3 — Top Volume ── */}
          <SectionTable
            title="📦 TOP VENTES EN VOLUME"
            cnt={`Top ${topVolume.length}`}
            rows={topVolume}
            cols={[
              { label: 'Modèle',       render: modeleCol },
              { label: 'Famille',      render: s => s.famille || '—' },
              { label: 'Qté',          right: true, render: s => s.qteVendue },
              { label: 'Délai moyen',  right: true, render: s => s.delaiMoyen !== null ? `${s.delaiMoyen} j` : '—' },
              { label: 'Marge totale', right: true, render: s => `${s.margeTotal.toLocaleString('fr-FR')} €` },
              { label: 'Marge unit.',  right: true, render: s => `${s.margeUnitaire.toLocaleString('fr-FR')} €` },
            ]}
          />

          {/* ── Section 4 — Tueurs de marge ── */}
          <SectionTable
            title="⚠️ Tueurs de marge"
            cnt={tueursMarge.length > 0 ? `${tueursMarge.length} modèle${tueursMarge.length > 1 ? 's' : ''}` : undefined}
            alert="Ces modèles tournent dans votre magasin mais ne génèrent pas (ou peu) de marge. À questionner : prix de vente trop bas ? Prix d'achat trop élevé ? Catégorisation grade incorrecte ?"
            rows={tueursMarge}
            cols={[
              { label: 'Modèle',          render: modeleCol },
              { label: 'Qté',             right: true, render: s => s.qteVendue },
              { label: 'Prix achat moy.', right: true, render: s => `${s.paMoyen.toLocaleString('fr-FR')} €` },
              { label: 'Prix vente moy.', right: true, render: s => `${s.pvMoyen.toLocaleString('fr-FR')} €` },
              { label: 'Marge unit.',     right: true, render: s => <span className={s.margeUnitaire < 0 ? 'text-red-600 font-semibold' : 'text-orange-500'}>{s.margeUnitaire.toLocaleString('fr-FR')} €</span> },
              { label: 'Taux marge',      right: true, render: s => <span className={s.tauxMarge < 0 ? 'text-red-600 font-semibold' : 'text-orange-500'}>{s.tauxMarge} %</span> },
            ]}
            emptyMsg="✓ Aucun tueur de marge identifié sur cette période."
          />

          {/* ── Section 5 — Cohérence EP (only if EP data in file) ── */}
          {hasEPData && (
            <SectionTable
              title="💡 Cohérence prix EasyPrice"
              cnt={coherenceEP.length > 0 ? `${coherenceEP.length} modèle${coherenceEP.length > 1 ? 's' : ''} avec cote EP` : undefined}
              alert="Les modèles sous-évalués indiquent une perte de marge potentielle. Les modèles sur-évalués peuvent ralentir la rotation. Cette analyse compare votre pratique tarifaire à la cote réseau EasyPrice."
              rows={coherenceEP}
              cols={[
                { label: 'Modèle',      render: modeleCol },
                { label: 'Qté',         right: true, render: s => s.qteVendue },
                { label: 'PV moyen',    right: true, render: s => `${s.pvMoyen.toLocaleString('fr-FR')} €` },
                { label: 'Cote EP (B)', right: true, render: s => s.epMoyen !== null ? `${s.epMoyen.toLocaleString('fr-FR')} €` : '—' },
                { label: 'Écart %',     right: true, render: s => {
                  if (s.ecartEP === null) return '—';
                  const { cls } = epStatut(s.ecartEP);
                  return <span className={cls}>{s.ecartEP > 0 ? '+' : ''}{s.ecartEP}%</span>;
                }},
                { label: 'Statut', render: s => {
                  if (s.ecartEP === null) return '—';
                  const { label, cls } = epStatut(s.ecartEP);
                  return <span className={cls}>{label}</span>;
                }},
              ]}
              emptyMsg="Aucune cote EasyPrice présente dans ce fichier."
            />
          )}

          {/* ── Synthesis ── */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#1A1A1A]">🎯 Recommandations stratégiques</h3>
            <p className="text-xs text-[#6B7280]">D&apos;après votre journal :</p>
            <ul className="space-y-2.5 text-sm">
              <li>
                <span className="font-semibold text-[#1A1A1A]">⚡ Rotation rapide (&lt; 30j, fiabilité 🟢 ou ✅) :</span>{' '}
                <span className="text-[#6B7280]">
                  {topRotations.filter(r => r.qteVendue >= 5).slice(0, 5).map(r => `${r.modele} (${r.delaiMoyen}j)`).join(', ') || 'Aucun modèle fiable avec délai < 30j sur cette période.'}
                </span>
              </li>
              <li>
                <span className="font-semibold text-[#1A1A1A]">💰 Plus forte marge cumulée :</span>{' '}
                <span className="text-[#6B7280]">
                  {topMarge.slice(0, 5).map(m => `${m.modele} (${m.margeTotal.toLocaleString('fr-FR')} €)`).join(', ') || 'Aucune donnée.'}
                </span>
              </li>
              <li>
                <span className="font-semibold text-[#E30613]">💎 Pépites locales (rotation rapide + forte marge) :</span>{' '}
                <span className="text-[#6B7280]">
                  {pepites.length > 0 ? pepites.map(p => p.modele).join(', ') : 'Aucune pépite détectée — croisez les filtres ou élargissez la période.'}
                </span>
              </li>
              {tueursMarge.length > 0 && (
                <li>
                  <span className="font-semibold text-orange-600">⚠️ Tueurs de marge à investiguer :</span>{' '}
                  <span className="text-[#6B7280]">{tueursMarge.slice(0, 3).map(t => t.modele).join(', ')}</span>
                </li>
              )}
              {coherenceEP.length > 0 && (
                <li>
                  <span className="font-semibold text-[#1A1A1A]">💡 Écarts prix vs cote EP :</span>{' '}
                  <span className="text-[#6B7280]">
                    {coherenceEP.slice(0, 3).map(e => `${e.modele} (${e.ecartEP! > 0 ? '+' : ''}${e.ecartEP}%)`).join(', ')}
                  </span>
                </li>
              )}
            </ul>
            <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg px-4 py-3 text-xs text-[#1A1A1A]">
              <strong>Action prioritaire :</strong> intégrer les pépites locales fiables dans votre gamme prioritaire. Croisez avec le module <strong>Couverture de gamme</strong>.
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

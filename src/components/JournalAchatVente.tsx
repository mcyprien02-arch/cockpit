'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

interface Props { magasinNom: string; }

type Periode = '3m' | '6m' | '12m' | 'all';

export interface ModelStats {
  modele: string;
  famille: string;
  qteVendue: number;
  delaiMoyen: number | null;
  margeUnitaire: number;
  margeTotal: number;
  caTotal: number;
  tauxMarge: number;
}

export interface AnalyseResult {
  createdAt: string;
  periode: Periode;
  nbLignes: number;
  topRotations: ModelStats[];
  topMarge: ModelStats[];
  topVolume: ModelStats[];
}

// Column name aliases → normalized internal field name
const COL_ALIASES: Record<string, string[]> = {
  famille:         ['famille', 'familleproduit'],
  sousFamille:     ['sousfamille'],
  modele:          ['fichetechlibelle', 'fichetech', 'modele', 'libellearticle', 'achatlibellearticle', 'libelle'],
  grade:           ['articlegrade', 'grade', 'gradearticle'],
  prixAchat:       ['achatprix', 'prixachat', 'prixdachat'],
  prixVente:       ['venteprixvendu', 'prixvente', 'prixvendu'],
  delaiVente:      ['ventedelai', 'delaivente', 'delaideVente'],
  dateAchat:       ['dateachat', 'datedachat'],
  dateVente:       ['ventedate', 'datevente'],
  typeTransaction: ['typedetransaction', 'typetransaction', 'type'],
};

function norm(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\s_\-'"]/g, '');
}

function mapColumns(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of headers) {
    const n = norm(header);
    for (const [field, aliases] of Object.entries(COL_ALIASES)) {
      if (!result[field] && aliases.includes(n)) {
        result[field] = header;
      }
    }
  }
  return result;
}

function parseNum(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDate(v: unknown): Date | null {
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

function cutoffDate(periode: Periode): Date | null {
  if (periode === 'all') return null;
  const d = new Date();
  d.setMonth(d.getMonth() - (periode === '3m' ? 3 : periode === '6m' ? 6 : 12));
  return d;
}

function buildAnalyse(
  rawRows: Record<string, unknown>[],
  colMap: Record<string, string>,
  periode: Periode,
): { topRotations: ModelStats[]; topMarge: ModelStats[]; topVolume: ModelStats[]; nbLignes: number } {
  const cutoff = cutoffDate(periode);

  const filtered = rawRows.filter(row => {
    if (colMap.typeTransaction) {
      const t = norm(String(row[colMap.typeTransaction] ?? ''));
      if (!t.includes('vente')) return false;
    }
    if (colMap.prixVente && parseNum(row[colMap.prixVente]) <= 0) return false;
    if (cutoff && colMap.dateVente) {
      const d = parseDate(row[colMap.dateVente]);
      if (!d || d < cutoff) return false;
    }
    return true;
  });

  const groups = new Map<string, {
    modele: string; famille: string;
    delais: number[]; marges: number[]; pvs: number[];
  }>();

  for (const row of filtered) {
    const modele = colMap.modele
      ? String(row[colMap.modele] ?? '').trim()
      : '(sans modèle)';
    if (!modele) continue;
    const famille = colMap.famille ? String(row[colMap.famille] ?? '').trim() : '';
    const pv = colMap.prixVente ? parseNum(row[colMap.prixVente]) : 0;
    const pa = colMap.prixAchat ? parseNum(row[colMap.prixAchat]) : 0;
    const delaiRaw = colMap.delaiVente ? row[colMap.delaiVente] : undefined;
    const delai = (delaiRaw !== '' && delaiRaw != null) ? parseNum(delaiRaw) : NaN;

    const key = modele.toLowerCase();
    if (!groups.has(key)) groups.set(key, { modele, famille, delais: [], marges: [], pvs: [] });
    const g = groups.get(key)!;
    if (!isNaN(delai) && delai > 0) g.delais.push(delai);
    g.marges.push(pv - pa);
    g.pvs.push(pv);
  }

  const stats: ModelStats[] = Array.from(groups.values()).map(g => {
    const margeTotal = Math.round(g.marges.reduce((s, v) => s + v, 0));
    const caTotal    = Math.round(g.pvs.reduce((s, v) => s + v, 0));
    const qte        = g.pvs.length;
    return {
      modele: g.modele,
      famille: g.famille,
      qteVendue: qte,
      delaiMoyen: g.delais.length > 0 ? Math.round(g.delais.reduce((s, v) => s + v, 0) / g.delais.length) : null,
      margeUnitaire: qte > 0 ? Math.round(margeTotal / qte) : 0,
      margeTotal,
      caTotal,
      tauxMarge: caTotal > 0 ? Math.round(margeTotal / caTotal * 100) : 0,
    };
  });

  const topRotations = stats
    .filter(s => s.delaiMoyen !== null && s.delaiMoyen < 30 && s.qteVendue >= 2)
    .sort((a, b) => (a.delaiMoyen ?? 999) - (b.delaiMoyen ?? 999));

  const topMarge  = [...stats].sort((a, b) => b.margeTotal - a.margeTotal).slice(0, 20);
  const topVolume = [...stats].sort((a, b) => b.qteVendue - a.qteVendue).slice(0, 15);

  return { topRotations, topMarge, topVolume, nbLignes: filtered.length };
}

// ── exported helper for AssistantIA ──────────────────────────────────────────
export function getJournalContext(magasinNom: string): string {
  try {
    const s = localStorage.getItem(`journal_analyse_${magasinNom}`);
    if (!s) return '';
    const a = JSON.parse(s) as AnalyseResult;
    const rots  = a.topRotations.slice(0, 5).map(r => `${r.modele} (${r.delaiMoyen}j)`).join(', ');
    const marges = a.topMarge.slice(0, 5).map(m => `${m.modele} (${m.margeTotal.toLocaleString('fr-FR')}€ marge)`).join(', ');
    return `\nTop rotations magasin (délai < 30j) : ${rots || 'aucun'}\nTop ventes en marge : ${marges || 'aucun'}`;
  } catch { return ''; }
}

// ── shared table styles ───────────────────────────────────────────────────────
const th = 'px-3 py-2.5 text-left text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const thr = 'px-3 py-2.5 text-right text-xs font-semibold text-[#6B7280] bg-[#F5F5F5] whitespace-nowrap';
const td = 'px-3 py-2 text-xs text-[#1A1A1A] border-t border-[#F0F0F0]';
const tdr = 'px-3 py-2 text-xs text-right text-[#1A1A1A] border-t border-[#F0F0F0]';

function StatsTable({ rows, columns }: {
  rows: ModelStats[];
  columns: { key: keyof ModelStats | 'delaiDisplay' | 'margeUnitDisplay' | 'margeTotalDisplay'; label: string; right?: boolean }[];
}) {
  if (rows.length === 0) return (
    <p className="text-xs text-[#9CA3AF] italic px-1">Aucun résultat pour ce critère.</p>
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E0E0E0]">
      <table className="text-xs w-full border-collapse">
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} className={c.right ? thr : th}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
              {columns.map(c => {
                let val: string;
                if (c.key === 'delaiDisplay') val = r.delaiMoyen !== null ? `${r.delaiMoyen} j` : '—';
                else if (c.key === 'margeUnitDisplay') val = `${r.margeUnitaire.toLocaleString('fr-FR')} €`;
                else if (c.key === 'margeTotalDisplay') val = `${r.margeTotal.toLocaleString('fr-FR')} €`;
                else val = String(r[c.key as keyof ModelStats] ?? '—');
                return (
                  <td key={c.key} className={c.right ? tdr : td} title={val}>
                    {c.key === 'modele' ? (
                      <span className="block max-w-[200px] truncate font-medium">{val}</span>
                    ) : val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function JournalAchatVente({ magasinNom }: Props) {
  const [analyse, setAnalyse]     = useState<AnalyseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [periode, setPeriode]     = useState<Periode>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(`journal_analyse_${magasinNom}`);
      if (s) setAnalyse(JSON.parse(s) as AnalyseResult);
      else setAnalyse(null);
    } catch { setAnalyse(null); }
  }, [magasinNom]);

  const processFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
      if (rawRows.length === 0) throw new Error('Le fichier semble vide ou non reconnu.');

      const colMap = mapColumns(Object.keys(rawRows[0]));
      if (!colMap.modele && !colMap.prixVente) {
        throw new Error('Colonnes non reconnues. Vérifiez que votre fichier est bien un export Athéna (journal achat-vente).');
      }

      const { topRotations, topMarge, topVolume, nbLignes } = buildAnalyse(rawRows, colMap, periode);
      if (nbLignes === 0) throw new Error('Aucune ligne "vente" avec prix positif trouvée. Vérifiez la période sélectionnée ou la colonne "Type de transaction".');

      const result: AnalyseResult = {
        createdAt: new Date().toISOString(),
        periode,
        nbLignes,
        topRotations,
        topMarge,
        topVolume,
      };
      setAnalyse(result);
      localStorage.setItem(`journal_analyse_${magasinNom}`, JSON.stringify(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue lors du parsing.');
    } finally {
      setIsLoading(false);
    }
  }, [magasinNom, periode]);

  function handleFile(file: File | undefined | null) {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setError('Format non supporté. Utilisez .csv, .xlsx ou .xls.');
      return;
    }
    processFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }

  // ── derived ──
  const pepites = analyse
    ? analyse.topRotations.filter(r =>
        analyse.topMarge.slice(0, 10).some(m => norm(m.modele) === norm(r.modele))
      ).slice(0, 5)
    : [];

  const periodeLabel: Record<Periode, string> = { '3m': '3 derniers mois', '6m': '6 derniers mois', '12m': '12 derniers mois', all: 'Tout' };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-[#1A1A1A]">Journal achat-vente — Analyse rotations · {magasinNom || 'Magasin'}</h2>

      {/* Intro */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl px-4 py-3 text-sm text-[#6B7280]">
        Importez votre export Athéna du journal achat-vente (CSV ou Excel) pour identifier automatiquement les modèles qui tournent le plus vite et qui génèrent le plus de marge dans votre magasin. Ces données alimentent les recommandations de gamme.
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Période */}
        <div>
          <p className="text-xs text-[#6B7280] mb-1.5 font-medium">Période d&apos;analyse</p>
          <div className="flex gap-1.5">
            {(['3m', '6m', '12m', 'all'] as Periode[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriode(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  periode === p
                    ? 'bg-[#E30613] text-white'
                    : 'bg-white border border-[#E0E0E0] text-[#6B7280] hover:border-[#E30613] hover:text-[#E30613]'
                }`}
              >
                {periodeLabel[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-xl px-6 py-8 text-center transition-all ${
          isDragOver
            ? 'border-[#E30613] bg-[#FFF5F5]'
            : 'border-[#E0E0E0] bg-white hover:border-[#E30613] hover:bg-[#FFF5F5]'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={e => handleFile(e.target.files?.[0])}
        />
        {isLoading ? (
          <div className="space-y-2">
            <div className="text-2xl animate-spin inline-block">⏳</div>
            <p className="text-sm text-[#6B7280]">Analyse en cours…</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-3xl">📂</div>
            <p className="text-sm font-semibold text-[#1A1A1A]">Glissez votre fichier ici ou cliquez pour importer</p>
            <p className="text-xs text-[#9CA3AF]">Formats acceptés : .csv, .xlsx, .xls — Export Athéna journal achat-vente</p>
            {analyse && (
              <p className="text-xs text-[#6B7280] mt-1">
                Dernière analyse : {new Date(analyse.createdAt).toLocaleDateString('fr-FR')} · {analyse.nbLignes} ventes · {periodeLabel[analyse.periode]}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!analyse && !isLoading && !error && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm font-semibold text-[#1A1A1A]">Aucune analyse encore</p>
          <p className="text-xs text-[#6B7280] mt-1">Importez votre journal pour démarrer.</p>
        </div>
      )}

      {/* Results */}
      {analyse && !isLoading && (
        <div className="space-y-6">

          {/* Section 1 — Top rotations */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#1A1A1A]">⚡ TOP ROTATIONS (délai &lt; 30 jours)</h3>
              <span className="text-xs text-[#9CA3AF]">{analyse.topRotations.length} modèle{analyse.topRotations.length > 1 ? 's' : ''}</span>
            </div>
            <p className="text-xs text-[#6B7280]">Modèles vendus en moins de 30 jours en moyenne, avec au moins 2 ventes. Triés par délai croissant.</p>
            <StatsTable
              rows={analyse.topRotations}
              columns={[
                { key: 'modele',          label: 'Modèle' },
                { key: 'famille',         label: 'Famille' },
                { key: 'qteVendue',       label: 'Qté vendue',     right: true },
                { key: 'delaiDisplay',    label: 'Délai moyen',    right: true },
                { key: 'margeUnitDisplay', label: 'Marge unit.',   right: true },
                { key: 'margeTotalDisplay', label: 'Marge totale', right: true },
              ]}
            />
          </div>

          {/* Section 2 — Top marge */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#1A1A1A]">💰 TOP VENTES EN MARGE</h3>
              <span className="text-xs text-[#9CA3AF]">Top {analyse.topMarge.length}</span>
            </div>
            <p className="text-xs text-[#6B7280]">Modèles générant le plus de marge brute cumulée. Triés par marge totale décroissante.</p>
            <StatsTable
              rows={analyse.topMarge}
              columns={[
                { key: 'modele',           label: 'Modèle' },
                { key: 'famille',          label: 'Famille' },
                { key: 'qteVendue',        label: 'Qté vendue',    right: true },
                { key: 'margeTotalDisplay', label: 'Marge totale', right: true },
                { key: 'margeUnitDisplay', label: 'Marge unit.',   right: true },
                { key: 'delaiDisplay',     label: 'Délai moyen',   right: true },
              ]}
            />
          </div>

          {/* Section 3 — Top volume */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#1A1A1A]">📦 TOP VENTES EN VOLUME</h3>
              <span className="text-xs text-[#9CA3AF]">Top {analyse.topVolume.length}</span>
            </div>
            <p className="text-xs text-[#6B7280]">Modèles les plus vendus en nombre d&apos;unités. Triés par quantité décroissante.</p>
            <StatsTable
              rows={analyse.topVolume}
              columns={[
                { key: 'modele',           label: 'Modèle' },
                { key: 'famille',          label: 'Famille' },
                { key: 'qteVendue',        label: 'Qté vendue',    right: true },
                { key: 'delaiDisplay',     label: 'Délai moyen',   right: true },
                { key: 'margeTotalDisplay', label: 'Marge totale', right: true },
                { key: 'margeUnitDisplay', label: 'Marge unit.',   right: true },
              ]}
            />
          </div>

          {/* Synthesis */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#1A1A1A]">🎯 Recommandations stratégiques</h3>
            <p className="text-xs text-[#6B7280]">D&apos;après votre journal :</p>
            <ul className="space-y-2.5 text-sm">
              <li>
                <span className="font-semibold text-[#1A1A1A]">⚡ Modèles qui tournent en &lt; 30 jours :</span>
                <span className="text-[#6B7280] ml-1">
                  {analyse.topRotations.length > 0
                    ? analyse.topRotations.slice(0, 5).map(r => `${r.modele} (${r.delaiMoyen}j)`).join(', ')
                    : 'Aucun modèle sous 30 jours avec au moins 2 ventes.'}
                </span>
              </li>
              <li>
                <span className="font-semibold text-[#1A1A1A]">💰 Modèles qui génèrent le plus de marge cumulée :</span>
                <span className="text-[#6B7280] ml-1">
                  {analyse.topMarge.slice(0, 5).map(m => `${m.modele} (${m.margeTotal.toLocaleString('fr-FR')} €)`).join(', ')}
                </span>
              </li>
              <li>
                <span className="font-semibold text-[#E30613]">💎 Pépites locales (rapides ET rentables) :</span>
                <span className="text-[#6B7280] ml-1">
                  {pepites.length > 0
                    ? pepites.map(p => p.modele).join(', ')
                    : 'Aucun modèle ne cumule rotation rapide et top marge. Ajustez la période ou enrichissez vos données.'}
                </span>
              </li>
            </ul>
            <div className="bg-[#FFF5F5] border border-[#FECACA] rounded-lg px-4 py-3 text-xs text-[#1A1A1A]">
              <strong>Action :</strong> ces références doivent être prioritaires dans votre gamme. Croisez-les avec votre module{' '}
              <strong>Couverture de gamme</strong> pour vérifier qu&apos;elles sont bien couvertes à 100%.
            </div>
          </div>

          {/* Reset */}
          <div className="text-right">
            <button
              onClick={() => {
                localStorage.removeItem(`journal_analyse_${magasinNom}`);
                setAnalyse(null);
              }}
              className="text-xs text-[#9CA3AF] hover:text-red-500 transition-colors"
            >
              🗑 Effacer l&apos;analyse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

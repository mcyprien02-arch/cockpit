'use client';

import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import type { PAPAction } from '@/types';
import { lbcUrl, vintedUrl } from '@/lib/sourcingUrls';

interface Props { magasinNom: string; onAddAction?: (action: PAPAction) => void; }

interface GammeModele {
  id: string;
  produit: string;
  marque: string;
  volumePct: number;    // % Volume réseau
  easyPrice: number;    // EasyPrice €
  stockVendable: number; // Stock vendable réseau
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseNum(s: string | number | undefined | null): number {
  if (s === null || s === undefined || s === '') return 0;
  if (typeof s === 'number') return isNaN(s) ? 0 : s;
  const cleaned = String(s).replace(/\s/g, '').replace(/%$/, '').replace(/€$/, '');
  const hasComma = cleaned.includes(',');
  const hasDot   = cleaned.includes('.');
  if (hasComma && hasDot) {
    return cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
      : parseFloat(cleaned.replace(/,/g, ''));
  }
  if (hasComma) return parseFloat(cleaned.replace(',', '.'));
  return parseFloat(cleaned) || 0;
}

function normaliseHeader(h: string): string {
  return String(h).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]/g, '');
}

function buildId(produit: string, marque: string): string {
  return `${produit.toLowerCase().trim()}_${marque.toLowerCase().trim()}`.replace(/\s+/g, '_');
}

function rowsToModeles(rawRows: Array<Record<string, unknown>>): GammeModele[] {
  if (rawRows.length === 0) return [];
  // Detect columns from first row's keys
  const keys = Object.keys(rawRows[0]);
  const normKeys = keys.map(normaliseHeader);

  const iP = normKeys.findIndex(h => h.includes('produit') || h.includes('modele') || h.includes('model') || h.includes('article'));
  const iM = normKeys.findIndex(h => h.includes('marque') || h.includes('brand') || h.includes('fabricant'));
  const iV = normKeys.findIndex(h => h.includes('volume') || (h.includes('%') && !h.includes('price') && !h.includes('marge') && !h.includes('stock')));
  const iE = normKeys.findIndex(h => h.includes('easyprice') || h.includes('easy'));
  const iS = normKeys.findIndex(h => h.includes('stockvendable') || h.includes('stock'));

  // Fallbacks: if EasyPrice not found, try generic price/prix
  const iE2 = iE >= 0 ? iE : normKeys.findIndex(h => h.includes('price') || h.includes('prix'));

  const colP = keys[iP >= 0 ? iP : 0];
  const colM = keys[iM >= 0 ? iM : 1];
  const colV = keys[iV >= 0 ? iV : 2];
  const colE = keys[iE2 >= 0 ? iE2 : 3];
  const colS = iS >= 0 ? keys[iS] : null;

  const models: GammeModele[] = [];
  const seenIds = new Set<string>();

  rawRows.forEach((r, i) => {
    const produit = String(r[colP] ?? '').trim();
    if (!produit) return;
    const marque        = String(r[colM] ?? '').trim();
    const volumePct     = parseNum(r[colV] as string | number | null | undefined);
    const easyPrice     = parseNum(r[colE] as string | number | null | undefined);
    const stockVendable = colS ? parseNum(r[colS] as string | number | null | undefined) : 0;
    const id = buildId(produit, marque);
    const uniqueId = seenIds.has(id) ? `${id}_${i}` : id;
    seenIds.add(uniqueId);
    models.push({ id: uniqueId, produit, marque, volumePct, easyPrice, stockVendable });
  });
  return models;
}

function parseCSVToRows(text: string): Array<Record<string, unknown>> {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  // Auto-detect separator: check tabs first (common in TSV exports), then ; vs ,
  const firstLine = lines[0];
  const sep = firstLine.includes('\t') ? '\t'
    : (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ';' : ',';

  function splitLine(line: string): string[] {
    const cells: string[] = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === sep && !inQ) { cells.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  const headers = splitLine(lines[0]);
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    if (cells.every(c => !c)) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => { row[h] = cells[j] ?? ''; });
    rows.push(row);
  }
  return rows;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CouvertureGamme({ magasinNom, onAddAction }: Props) {
  const [gamme, setGamme]         = useState<GammeModele[]>([]);
  const [stock, setStock]         = useState<Record<string, boolean>>({});
  const [importDate, setImportDate] = useState<string | null>(null);
  const [filter, setFilter]       = useState<'all' | 'manquant' | 'enstock'>('all');
  const [search, setSearch]       = useState('');
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const gammeKey  = `gamme_reseau_${magasinNom}`;
  const stockKey  = `gamme_stock_${magasinNom}`;
  const dateKey   = `gamme_date_${magasinNom}`;

  useEffect(() => {
    try {
      const g = localStorage.getItem(gammeKey);
      if (g) setGamme(JSON.parse(g) as GammeModele[]);
    } catch { /* ignore */ }
    try {
      const s = localStorage.getItem(stockKey);
      if (s) setStock(JSON.parse(s) as Record<string, boolean>);
    } catch { /* ignore */ }
    try {
      const d = localStorage.getItem(dateKey);
      if (d) setImportDate(d);
    } catch { /* ignore */ }
  }, [magasinNom, gammeKey, stockKey, dateKey]);

  function saveGamme(g: GammeModele[], s: Record<string, boolean>) {
    const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    setGamme(g);
    setStock(s);
    setImportDate(now);
    localStorage.setItem(gammeKey, JSON.stringify(g));
    localStorage.setItem(stockKey, JSON.stringify(s));
    localStorage.setItem(dateKey, now);
  }

  function toggleStock(id: string) {
    const next = { ...stock, [id]: !stock[id] };
    setStock(next);
    localStorage.setItem(stockKey, JSON.stringify(next));
  }

  function applyParsed(parsed: GammeModele[]) {
    if (parsed.length === 0) {
      setImportError('Aucun modèle détecté. Vérifiez le format du fichier (colonnes : Produit, Marque, % Volume réseau, EasyPrice).');
      return;
    }
    // Merge: keep existing toggles by model id (stable key = produit+marque)
    const nextStock: Record<string, boolean> = {};
    parsed.forEach(m => { nextStock[m.id] = stock[m.id] ?? false; });
    saveGamme(parsed, nextStock);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = ev.target?.result as ArrayBuffer;
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
          applyParsed(rowsToModeles(rawRows));
        } catch {
          setImportError('Erreur de lecture XLSX. Vérifiez que le fichier n\'est pas protégé.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV / TSV / TXT
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const text = ev.target?.result as string;
          const rows = parseCSVToRows(text);
          applyParsed(rowsToModeles(rows));
        } catch {
          setImportError('Erreur de lecture du fichier. Utilisez un fichier CSV ou XLSX.');
        }
      };
      reader.readAsText(file, 'UTF-8');
    }
    e.target.value = '';
  }

  function clearGamme() {
    setGamme([]);
    setStock({});
    setImportDate(null);
    localStorage.removeItem(gammeKey);
    localStorage.removeItem(stockKey);
    localStorage.removeItem(dateKey);
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const totalModeles    = gamme.length;
  const enStockCount    = gamme.filter(m => stock[m.id]).length;
  const manquantCount   = totalModeles - enStockCount;
  const totalVolume     = gamme.reduce((s, m) => s + m.volumePct, 0);
  const volumeEnStock   = gamme.filter(m => stock[m.id]).reduce((s, m) => s + m.volumePct, 0);
  const couverturePct   = totalVolume > 0 ? (volumeEnStock / totalVolume) * 100 : 0;
  const investissement  = gamme.filter(m => !stock[m.id]).reduce((s, m) => s + m.easyPrice, 0);
  const volumeManquant  = totalModeles > 0 ? 100 - couverturePct : 0;

  // Sorted missing models (by volume % desc for priority)
  const manquants = gamme
    .filter(m => !stock[m.id])
    .sort((a, b) => b.volumePct - a.volumePct);

  // Display list (filtered + searched)
  const displayed = gamme
    .filter(m => {
      if (filter === 'manquant' && stock[m.id]) return false;
      if (filter === 'enstock' && !stock[m.id]) return false;
      if (search) {
        const q = search.toLowerCase();
        return m.produit.toLowerCase().includes(q) || m.marque.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => b.volumePct - a.volumePct);

  const top5 = manquants.slice(0, 5);

  const couvertureColor = couverturePct >= 80 ? 'text-green-600' : couverturePct >= 50 ? 'text-orange-500' : 'text-red-600';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">🗂 Couverture de gamme</h2>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Importez la gamme réseau par modèle et indiquez vos modèles en stock — le module calcule votre couverture pondérée par volume réseau.
        </p>
      </div>

      {/* Import zone */}
      <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-[#1A1A1A]">📥 Importer la gamme réseau</h3>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Fichier <strong>.xlsx</strong> ou <strong>.csv</strong> — colonnes attendues : <strong>Produit</strong>, <strong>Marque</strong>, <strong>% Volume réseau</strong>, <strong>EasyPrice (€)</strong>, <strong>Stock vendable</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm font-semibold bg-[#E30613] text-white hover:bg-[#B8050F] rounded-lg px-4 py-2 transition-colors"
          >
            {gamme.length > 0 ? '↺ Mettre à jour la gamme' : '📂 Importer la gamme réseau (.xlsx ou .csv)'}
          </button>
          {gamme.length > 0 && (
            <button
              onClick={clearGamme}
              className="text-xs text-[#9CA3AF] hover:text-red-600 transition-colors"
            >
              Effacer tout
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            onChange={handleFile}
            className="hidden"
          />
          {gamme.length > 0 && (
            <span className="text-xs text-[#6B7280]">
              {totalModeles} modèle{totalModeles > 1 ? 's' : ''} chargé{totalModeles > 1 ? 's' : ''}
              {importDate && <> · importé le {importDate}</>}
            </span>
          )}
        </div>
        {importError && (
          <p className="text-xs text-red-600 font-medium">{importError}</p>
        )}
      </div>

      {gamme.length === 0 ? (
        <div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-12 text-center">
          <div className="text-4xl mb-3">🗂</div>
          <p className="text-sm font-semibold text-[#1A1A1A]">Aucune gamme importée</p>
          <p className="text-xs text-[#6B7280] mt-2">
            Importez le fichier XLSX ou CSV de la gamme réseau (Produit, Marque, % Volume réseau, EasyPrice, Stock vendable) pour commencer.
          </p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
              <div className={`text-2xl font-black ${couvertureColor}`}>{couverturePct.toFixed(1)}%</div>
              <div className="text-xs text-[#6B7280] mt-0.5">Couverture pondérée</div>
              <div className="text-[10px] text-[#9CA3AF]">par % volume réseau</div>
            </div>
            <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
              <div className="text-2xl font-black text-[#1A1A1A]">{enStockCount} / {totalModeles}</div>
              <div className="text-xs text-[#6B7280] mt-0.5">Modèles en stock</div>
            </div>
            <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
              <div className={`text-2xl font-black ${manquantCount > 0 ? 'text-orange-500' : 'text-green-600'}`}>{manquantCount}</div>
              <div className="text-xs text-[#6B7280] mt-0.5">Modèles manquants</div>
              {totalVolume > 0 && <div className="text-[10px] text-[#9CA3AF]">{volumeManquant.toFixed(1)}% volume potentiel</div>}
            </div>
            <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-3 text-center">
              <div className={`text-2xl font-black ${investissement > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                {investissement > 0 ? `${Math.round(investissement).toLocaleString('fr-FR')} €` : '✓'}
              </div>
              <div className="text-xs text-[#6B7280] mt-0.5">Investissement min.</div>
              <div className="text-[10px] text-[#9CA3AF]">1 unité par modèle manquant</div>
            </div>
          </div>

          {/* Priority section — top 5 missing */}
          {top5.length > 0 && (
            <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-5 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-[#1A1A1A]">🎯 Ordre de priorité d&apos;investissement</h3>
                <p className="text-xs text-[#6B7280] mt-0.5">Modèles manquants triés par % volume réseau décroissant</p>
              </div>
              <div className="space-y-3">
                {top5.map((m, i) => {
                  const rang = i + 1;
                  const numColor = rang === 1 ? 'text-[#E30613]' : rang === 2 ? 'text-orange-500' : rang === 3 ? 'text-yellow-600' : 'text-[#6B7280]';
                  return (
                    <div key={m.id} className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1">
                          <span className={`font-black text-base w-6 flex-shrink-0 ${numColor}`}>#{rang}</span>
                          <div>
                            <span className="text-sm text-[#1A1A1A] font-semibold">{m.produit}</span>
                            {m.marque && <span className="text-xs text-[#6B7280] ml-1.5">{m.marque}</span>}
                            <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-[#6B7280]">
                              {m.volumePct > 0 && <span className="font-medium text-[#374151]">{m.volumePct.toFixed(2)}% volume réseau</span>}
                              {m.easyPrice > 0 && <span>EasyPrice : <strong className="text-orange-600">{m.easyPrice.toLocaleString('fr-FR')} €</strong></span>}
                            </div>
                          </div>
                        </div>
                        {onAddAction && (
                          <button onClick={() => {
                            const e = new Date(); e.setDate(e.getDate() + 14);
                            onAddAction({ id: String(Date.now()), titre: `Gamme — Sourcer ${m.produit}${m.marque ? ' ' + m.marque : ''} (${m.volumePct.toFixed(2)}% vol. réseau)`, axe: 'Stock', pilote: 'Franchisé', copilote: '', description: `Modèle manquant priorité #${rang} : ${m.produit}${m.marque ? ' ' + m.marque : ''}. % Volume réseau : ${m.volumePct.toFixed(2)}%. EasyPrice : ${m.easyPrice.toLocaleString('fr-FR')} €. À sourcer en priorité pour renforcer la couverture de gamme.`, echeance: e.toISOString().slice(0, 10), priorite: rang <= 2 ? 1 : 2, gain: 0, statut: 'À faire' });
                          }} className="text-xs text-white bg-[#E30613] hover:bg-red-700 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0 transition-colors">+ PAP</button>
                        )}
                      </div>
                      <div className="flex gap-1.5 pl-8">
                        <a
                          href={lbcUrl(m.produit, m.easyPrice || null)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-[#E0E0E0] bg-white hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 text-[#374151] transition-colors whitespace-nowrap"
                        >
                          🔍 Leboncoin
                        </a>
                        <a
                          href={vintedUrl(m.produit, m.easyPrice || null)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-[#E0E0E0] bg-white hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 text-[#374151] transition-colors whitespace-nowrap"
                        >
                          🔍 Vinted
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full model table */}
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
            {/* Filters */}
            <div className="px-4 py-3 border-b border-[#E0E0E0] flex flex-wrap items-center gap-3">
              <div className="flex gap-1.5">
                {(['all', 'manquant', 'enstock'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${filter === f ? 'bg-[#E30613] text-white' : 'bg-[#F5F5F5] text-[#6B7280] hover:bg-[#E0E0E0]'}`}
                  >
                    {f === 'all' ? `Tous (${totalModeles})` : f === 'manquant' ? `Manquants (${manquantCount})` : `En stock (${enStockCount})`}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un modèle…"
                className="text-xs border border-[#E0E0E0] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#9CA3AF] w-48"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E0E0E0] bg-[#F5F5F5] text-[#6B7280]">
                    <th className="text-left px-3 py-2 font-semibold">Modèle</th>
                    <th className="text-left px-3 py-2 font-semibold">Marque</th>
                    <th className="text-right px-3 py-2 font-semibold">% Volume réseau</th>
                    <th className="text-right px-3 py-2 font-semibold">EasyPrice (€)</th>
                    <th className="text-right px-3 py-2 font-semibold">Stock réseau</th>
                    <th className="text-center px-3 py-2 font-semibold">Statut</th>
                    <th className="px-3 py-2 font-semibold">Sourcing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0]">
                  {displayed.map(m => {
                    const inStock = !!stock[m.id];
                    return (
                      <tr key={m.id} className={`hover:brightness-[0.98] ${inStock ? 'bg-white' : 'bg-[#FFF9F9]'}`}>
                        <td className="px-3 py-2.5 font-medium text-[#1A1A1A]">{m.produit}</td>
                        <td className="px-3 py-2.5 text-[#6B7280]">{m.marque || '—'}</td>
                        <td className="px-3 py-2.5 text-right">
                          {m.volumePct > 0 ? (
                            <span className={m.volumePct >= 3 ? 'font-semibold text-[#374151]' : 'text-[#6B7280]'}>
                              {m.volumePct.toFixed(2)}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#374151]">
                          {m.easyPrice > 0 ? `${m.easyPrice.toLocaleString('fr-FR')} €` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#6B7280]">
                          {m.stockVendable > 0 ? m.stockVendable.toLocaleString('fr-FR') : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => toggleStock(m.id)}
                            className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
                              inStock
                                ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                                : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                            }`}
                          >
                            {inStock ? '✓ En stock' : '✗ Manquant'}
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          {!inStock && (
                            <div className="flex gap-1">
                              <a
                                href={lbcUrl(m.produit, m.easyPrice || null)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] px-2 py-0.5 rounded border border-[#E0E0E0] bg-white hover:bg-orange-50 hover:text-orange-700 text-[#6B7280] transition-colors whitespace-nowrap"
                              >
                                🔍 LBC
                              </a>
                              <a
                                href={vintedUrl(m.produit, m.easyPrice || null)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] px-2 py-0.5 rounded border border-[#E0E0E0] bg-white hover:bg-teal-50 hover:text-teal-700 text-[#6B7280] transition-colors whitespace-nowrap"
                              >
                                🔍 Vinted
                              </a>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {displayed.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-[#9CA3AF]">Aucun modèle pour ce filtre.</div>
            )}
          </div>

          <p className="text-[10px] text-[#9CA3AF] italic">
            Couverture pondérée = Σ(% Volume réseau des modèles En stock) / Σ(% Volume réseau total). Investissement min. = Σ(EasyPrice des modèles Manquants) × 1 unité.
          </p>
        </>
      )}
    </div>
  );
}

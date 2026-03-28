"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

interface ParsedRow {
  indicateur: string;
  valeur: number | null;
  matched: string | null; // matched indicateur nom in DB
  skip: boolean;
}

interface Indicateur {
  id: string;
  nom: string;
  unite: string | null;
  categorie: string;
}

interface Magasin {
  id: string;
  nom: string;
}

interface ImportScreenProps {
  magasinId: string;
  magasin: Magasin | null;
}

// Known column aliases for auto-mapping
const COLUMN_ALIASES: Record<string, string> = {
  "turnover": "Turnover",
  "taux turnover": "Turnover",
  "nb etp": "Nb ETP",
  "effectif": "Nb ETP",
  "etp": "Nb ETP",
  "polyvalence": "Polyvalence",
  "taux polyvalence": "Polyvalence",
  "picea": "Batterie / Picea",
  "batterie picea": "Batterie / Picea",
  "batterie / picea": "Batterie / Picea",
  "stock age": "Stock âgé",
  "stock âgé": "Stock âgé",
  "taux stock age": "Stock âgé",
  "valeur stock": "Valeur stock",
  "demarque": "Taux de démarque",
  "taux demarque": "Taux de démarque",
  "taux de démarque": "Taux de démarque",
  "delai vente": "Délai de vente moyen",
  "délai de vente": "Délai de vente moyen",
  "délai de vente moyen": "Délai de vente moyen",
  "taux achat": "Taux d'achat ext. global",
  "taux achat ext": "Taux d'achat ext. global",
  "taux d'achat ext. global": "Taux d'achat ext. global",
  "ventes complementaires": "Ventes complémentaires",
  "ventes complémentaires": "Ventes complémentaires",
  "rattachement": "Rattachement",
  "note google": "Note Google",
  "gamme": "Gamme Téléphonie",
  "gamme telephonie": "Gamme Téléphonie",
  "gamme téléphonie": "Gamme Téléphonie",
  "marketplace": "Tuile Marketplace",
  "tuile marketplace": "Tuile Marketplace",
  "ecart cote": "Écart cote EP achat",
  "écart cote ep achat": "Écart cote EP achat",
  "tuile reparation": "Tuile réparation",
  "tuile réparation": "Tuile réparation",
  "module etiquette": "Module étiquette",
  "module étiquette": "Module étiquette",
  "module demarque": "Module démarque",
  "module démarque": "Module démarque",
  "droit erreur": "Droit erreur / SOR30",
  "droit erreur sor30": "Droit erreur / SOR30",
  "garantie": "Garantie 2 ans",
  "garantie 2 ans": "Garantie 2 ans",
  "envoi bilan": "Envoi du bilan",
  "envoi du bilan": "Envoi du bilan",
  "participation reseau": "Participation vie réseau",
  "participation vie réseau": "Participation vie réseau",
  "produits certifies": "Produits certifiés authentiques",
  "produits certifiés authentiques": "Produits certifiés authentiques",
};

function normalize(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function autoMatch(label: string, indicateurs: Indicateur[]): string | null {
  const norm = normalize(label);
  // Direct alias lookup
  if (COLUMN_ALIASES[norm]) return COLUMN_ALIASES[norm];
  // Fuzzy: check if any indicateur nom is contained
  const found = indicateurs.find((ind) => {
    const indNorm = normalize(ind.nom);
    return norm.includes(indNorm) || indNorm.includes(norm);
  });
  return found?.nom ?? null;
}

export function ImportScreen({ magasinId, magasin }: ImportScreenProps) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [indicateurs, setIndicateurs] = useState<Indicateur[]>([]);
  const [dateImport, setDateImport] = useState(new Date().toISOString().split("T")[0]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [wordText, setWordText] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadIndicateurs = useCallback(async () => {
    if (indicateurs.length > 0) return indicateurs;
    const { data } = await supabase.from("indicateurs").select("id, nom, unite, categorie").order("nom");
    const inds = (data ?? []) as Indicateur[];
    setIndicateurs(inds);
    return inds;
  }, [indicateurs]);

  const parseExcel = useCallback(async (file: File) => {
    const inds = await loadIndicateurs();
    const xlsx = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = xlsx.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

    if (raw.length === 0) return;

    // Detect format: either two-column (Indicateur | Valeur) or wide (header = indicator names)
    const firstRow = raw[0];
    const keys = Object.keys(firstRow);

    let parsed: ParsedRow[] = [];

    // Wide format: first column = store/date, remaining = KPI names
    const isWide = keys.length > 3;

    if (isWide) {
      // Use the first row as the only data row (or the row matching magasin)
      const dataRow = raw[0];
      for (const key of keys) {
        const val = dataRow[key];
        if (typeof val === "number" || (typeof val === "string" && !isNaN(Number(val)))) {
          const numeric = typeof val === "number" ? val : Number(val);
          const matched = autoMatch(key, inds);
          parsed.push({ indicateur: key, valeur: numeric, matched, skip: matched === null });
        }
      }
    } else {
      // Vertical format: col0 = label, col1 = value
      const labelCol = keys[0];
      const valueCol = keys[1] ?? keys[0];
      for (const row of raw) {
        const label = String(row[labelCol] ?? "").trim();
        const rawVal = row[valueCol];
        if (!label) continue;
        const numeric = rawVal !== null && rawVal !== undefined && !isNaN(Number(rawVal)) ? Number(rawVal) : null;
        const matched = autoMatch(label, inds);
        parsed.push({ indicateur: label, valeur: numeric, matched, skip: matched === null || numeric === null });
      }
    }

    setRows(parsed);
    setStep("map");
  }, [loadIndicateurs]);

  const parseWord = useCallback(async (file: File) => {
    await loadIndicateurs();
    const mammoth = await import("mammoth");
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    setWordText(result.value);
    setStep("map");
  }, [loadIndicateurs]);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setImportResult(null);
    setWordText(null);
    setRows([]);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      await parseExcel(file);
    } else if (ext === "docx") {
      await parseWord(file);
    } else {
      setImportResult({ ok: false, message: `Format non supporté : .${ext}. Utilisez .xlsx, .xls, .csv ou .docx` });
    }
  }, [parseExcel, parseWord]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = async () => {
    const toImport = rows.filter((r) => !r.skip && r.matched && r.valeur !== null);
    if (toImport.length === 0) {
      setImportResult({ ok: false, message: "Aucune ligne à importer." });
      return;
    }

    setImporting(true);
    try {
      const inds = await loadIndicateurs();
      const upsertData = toImport
        .map((r) => {
          const ind = inds.find((i) => i.nom === r.matched);
          if (!ind) return null;
          return {
            magasin_id: magasinId,
            indicateur_id: ind.id,
            valeur: r.valeur!,
            date_saisie: dateImport,
          };
        })
        .filter(Boolean);

      const { error } = await (supabase as any).from("valeurs").upsert(upsertData, {
        onConflict: "magasin_id,indicateur_id,date_saisie",
      });

      if (error) {
        setImportResult({ ok: false, message: error.message });
      } else {
        setImportResult({ ok: true, message: `${upsertData.length} indicateur(s) importé(s) avec succès pour le ${dateImport}.` });
        setStep("done");
      }
    } catch (err: unknown) {
      setImportResult({ ok: false, message: err instanceof Error ? err.message : "Erreur inconnue" });
    }
    setImporting(false);
  };

  const reset = () => {
    setRows([]);
    setWordText(null);
    setStep("upload");
    setImportResult(null);
    setFileName("");
  };

  const validRows = rows.filter((r) => !r.skip && r.matched && r.valeur !== null);
  const unmatchedRows = rows.filter((r) => r.matched === null);

  return (
    <div className="space-y-5 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>
            📥 Import de données
          </div>
          {step !== "upload" && (
            <button
              onClick={reset}
              className="text-[11px] px-3 py-1.5 rounded-lg border"
              style={{ borderColor: "var(--border)", color: "var(--textMuted)" }}
            >
              ← Nouveau fichier
            </button>
          )}
        </div>
        <div className="text-[12px]" style={{ color: "var(--textMuted)" }}>
          Magasin : <strong style={{ color: "var(--text)" }}>{magasin?.nom ?? magasinId}</strong>
          {fileName && <span className="ml-3 text-[11px]" style={{ color: "var(--textDim)" }}>• {fileName}</span>}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Step 1: Upload ─────────────────────────────────── */}
        {step === "upload" && (
          <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className="rounded-2xl border-2 border-dashed p-14 text-center cursor-pointer transition-all"
              style={{
                borderColor: dragOver ? "var(--accent)" : "var(--border)",
                background: dragOver ? "#00d4aa0a" : "var(--surface)",
              }}
            >
              <div className="text-[40px] mb-3">📂</div>
              <div className="text-[15px] font-semibold mb-2" style={{ color: "var(--text)" }}>
                Glissez votre fichier ici
              </div>
              <div className="text-[12px] mb-4" style={{ color: "var(--textMuted)" }}>
                ou cliquez pour parcourir
              </div>
              <div className="flex gap-2 justify-center">
                {[".xlsx", ".xls", ".csv", ".docx"].map((ext) => (
                  <span key={ext} className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold"
                    style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)", border: "1px solid var(--border)" }}>
                    {ext}
                  </span>
                ))}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.docx"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

            {/* Format guide */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="rounded-2xl p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textMuted)" }}>
                  Format Excel vertical
                </div>
                <div className="rounded-lg overflow-hidden border text-[11px]" style={{ borderColor: "var(--border)" }}>
                  {[["Indicateur", "Valeur"], ["Turnover", "12"], ["Délai de vente moyen", "46"], ["Nb ETP", "4"]].map((row, i) => (
                    <div key={i} className="flex border-b last:border-b-0" style={{ borderColor: "var(--border)", background: i === 0 ? "#00d4aa14" : i % 2 === 0 ? "var(--surfaceAlt)" : "var(--surface)" }}>
                      {row.map((cell, j) => (
                        <div key={j} className="flex-1 px-3 py-1.5 font-mono" style={{ color: i === 0 ? "var(--accent)" : "var(--text)" }}>{cell}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textMuted)" }}>
                  Format Excel horizontal
                </div>
                <div className="rounded-lg overflow-hidden border text-[11px]" style={{ borderColor: "var(--border)" }}>
                  {[["Turnover", "Polyvalence", "Note Google"], ["12", "65", "4.2"]].map((row, i) => (
                    <div key={i} className="flex border-b last:border-b-0" style={{ borderColor: "var(--border)", background: i === 0 ? "#00d4aa14" : "var(--surface)" }}>
                      {row.map((cell, j) => (
                        <div key={j} className="flex-1 px-3 py-1.5 font-mono truncate" style={{ color: i === 0 ? "var(--accent)" : "var(--text)" }}>{cell}</div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="text-[10px] mt-2" style={{ color: "var(--textDim)" }}>
                  Noms de colonnes = noms d&apos;indicateurs (ligne 1 = en-têtes, ligne 2 = valeurs)
                </div>
              </div>
            </div>

            {importResult && !importResult.ok && (
              <div className="mt-4 rounded-xl p-3 text-[12px]" style={{ background: "#ff4d6a12", color: "var(--danger)", border: "1px solid #ff4d6a30" }}>
                {importResult.message}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Step 2: Map & Preview ──────────────────────────── */}
        {step === "map" && (
          <motion.div key="map" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* Word text preview */}
            {wordText !== null && (
              <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textMuted)" }}>
                  Contenu extrait du document Word
                </div>
                <pre className="text-[11px] whitespace-pre-wrap max-h-[300px] overflow-y-auto leading-relaxed" style={{ color: "var(--text)", fontFamily: "inherit" }}>
                  {wordText}
                </pre>
                <div className="mt-3 p-3 rounded-xl text-[11px]" style={{ background: "#4da6ff12", color: "#4da6ff", border: "1px solid #4da6ff30" }}>
                  💡 Le document Word a été extrait. Copiez les valeurs ci-dessus dans l&apos;onglet <strong>Saisie KPIs</strong> pour les saisir manuellement, ou utilisez un fichier Excel pour l&apos;import automatique.
                </div>
              </div>
            )}

            {/* Excel mapping table */}
            {rows.length > 0 && (
              <>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Lignes détectées", value: rows.length, color: "var(--text)" },
                    { label: "Correspondances auto", value: rows.filter(r => r.matched).length, color: "#00d4aa" },
                    { label: "Non reconnus", value: unmatchedRows.length, color: unmatchedRows.length > 0 ? "var(--danger)" : "var(--textMuted)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-xl p-3 border text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                      <div className="text-[22px] font-bold" style={{ color }}>{value}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--textMuted)" }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Date picker */}
                <div className="rounded-2xl p-4 border flex items-center gap-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>Date des données</div>
                  <input
                    type="date"
                    value={dateImport}
                    onChange={(e) => setDateImport(e.target.value)}
                    className="rounded-lg px-3 py-1.5 text-[12px] border"
                    style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>

                {/* Mapping table */}
                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-widest" style={{ background: "var(--surface)", color: "var(--textMuted)", borderBottom: "1px solid var(--border)" }}>
                    Correspondances détectées
                  </div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                        {["Colonne source", "Valeur", "Indicateur cible", "Action"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold" style={{ color: "var(--textMuted)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className="border-b" style={{ background: i % 2 === 0 ? "var(--surfaceAlt)" : "var(--surface)", borderColor: "var(--border)", opacity: row.skip ? 0.45 : 1 }}>
                          <td className="px-4 py-2.5 font-mono" style={{ color: "var(--text)" }}>{row.indicateur}</td>
                          <td className="px-4 py-2.5 font-bold" style={{ color: row.valeur !== null ? "#00d4aa" : "var(--danger)" }}>
                            {row.valeur !== null ? row.valeur : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={row.matched ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setRows((prev) => prev.map((r, j) => j === i ? { ...r, matched: v || null, skip: !v } : r));
                              }}
                              className="rounded-lg px-2 py-1 text-[11px] border w-full max-w-[220px]"
                              style={{ background: "var(--surfaceAlt)", borderColor: row.matched ? "var(--border)" : "#ff4d6a60", color: row.matched ? "var(--text)" : "var(--danger)" }}
                            >
                              <option value="">— Non mappé —</option>
                              {indicateurs.map((ind) => (
                                <option key={ind.id} value={ind.nom} style={{ background: "var(--surface)" }}>
                                  {ind.nom}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => setRows((prev) => prev.map((r, j) => j === i ? { ...r, skip: !r.skip } : r))}
                              className="px-2.5 py-1 rounded-lg text-[10px] border"
                              style={{
                                borderColor: row.skip ? "#00d4aa60" : "#ff4d6a60",
                                color: row.skip ? "#00d4aa" : "var(--danger)",
                                background: row.skip ? "#00d4aa0a" : "#ff4d6a0a",
                              }}
                            >
                              {row.skip ? "Inclure" : "Ignorer"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Import button */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleImport}
                    disabled={importing || validRows.length === 0}
                    className="px-6 py-2.5 rounded-xl text-[13px] font-bold hover:opacity-90 disabled:opacity-40"
                    style={{ background: "var(--accent)", color: "#000" }}
                  >
                    {importing ? "Import en cours…" : `✓ Importer ${validRows.length} indicateur${validRows.length !== 1 ? "s" : ""}`}
                  </button>
                  {importResult && (
                    <div className="text-[12px]" style={{ color: importResult.ok ? "#00d4aa" : "var(--danger)" }}>
                      {importResult.message}
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* ── Step 3: Done ───────────────────────────────────── */}
        {step === "done" && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl p-12 border text-center" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <div className="text-[48px] mb-4">✅</div>
            <div className="text-[16px] font-bold mb-2" style={{ color: "var(--text)" }}>Import réussi !</div>
            <div className="text-[13px] mb-6" style={{ color: "var(--textMuted)" }}>{importResult?.message}</div>
            <div className="flex gap-3 justify-center">
              <button onClick={reset} className="px-5 py-2.5 rounded-xl text-[12px] font-semibold border" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                Importer un autre fichier
              </button>
              <a href="#kpis" className="px-5 py-2.5 rounded-xl text-[12px] font-semibold" style={{ background: "var(--accent)", color: "#000" }}>
                Voir les KPIs →
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

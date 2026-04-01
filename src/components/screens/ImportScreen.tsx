"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────
interface Indicateur {
  id: string;
  nom: string;
  unite: string | null;
  categorie: string;
}

interface ParsedRow {
  sourceLabel: string;
  valeur: number;
  indicateurId: string | null;
  indicateurNom: string;
  skip: boolean;
}

interface DerniereValeur {
  indicateur_id: string;
  indicateur_nom: string;
  valeur: number;
  date_saisie: string;
  unite: string | null;
  status?: string;
}

interface ImportScreenProps {
  magasinId: string;
  magasin: { id: string; nom: string } | null;
  onNavigate?: (tab: string) => void;
}

// ─── Alias map ────────────────────────────────────────────────
const ALIASES: Record<string, string> = {
  "turnover":                   "Turnover",
  "tx turnover":                "Turnover",
  "taux turnover":              "Turnover",
  "polyvalence":                "Polyvalence",
  "picea":                      "Batterie / Picea",
  "batterie picea":             "Batterie / Picea",
  "stock age":                  "Stock âgé",
  "stk age":                    "Stock âgé",
  "stock vieux":                "Stock âgé",
  "valeur stock":               "Valeur stock",
  "demarque":                   "Taux de démarque",
  "tx demarque":                "Taux de démarque",
  "taux demarque":              "Taux de démarque",
  "delai vente":                "Délai de vente moyen",
  "delai de vente":             "Délai de vente moyen",
  "taux achat":                 "Taux d'achat ext. global",
  "taux achat ext":             "Taux d'achat ext. global",
  "ventes complementaires":     "Ventes complémentaires",
  "rattachement":               "Rattachement",
  "note google":                "Note Google",
  "gamme telephonie":           "Gamme Téléphonie",
  "gamme":                      "Gamme Téléphonie",
  "marketplace":                "Tuile Marketplace",
  "tuile marketplace":          "Tuile Marketplace",
  "ecart cote":                 "Écart cote EP achat",
  "tuile reparation":           "Tuile réparation",
  "module etiquette":           "Module étiquette",
  "module demarque":            "Module démarque",
  "droit erreur":               "Droit erreur / SOR30",
  "garantie":                   "Garantie 2 ans",
  "envoi bilan":                "Envoi du bilan",
  "participation reseau":       "Participation vie réseau",
  "produits certifies":         "Produits certifiés authentiques",
  "nb etp":                     "Nb ETP",
  "etp":                        "Nb ETP",
  "effectif":                   "Nb ETP",
  "ca enc":                     "Taux CA encarté",
  "taux ca enc":                "Taux CA encarté",
  "taux ca encarte":            "Taux CA encarté",
  "panier moyen":               "Panier moyen",
  "pm":                         "Panier moyen",
  "marge brute":                "Taux marge brute",
  "tx marge":                   "Taux marge brute",
  "taux marge":                 "Taux marge brute",
};

// ─── Normalize ────────────────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function autoMatch(label: string, indicateurs: Indicateur[]): Indicateur | null {
  const normLabel = normalize(label);
  // Check aliases first
  const aliasMatch = ALIASES[normLabel];
  if (aliasMatch) {
    const found = indicateurs.find(i => i.nom === aliasMatch);
    if (found) return found;
  }
  // Contains match
  for (const ind of indicateurs) {
    const normInd = normalize(ind.nom);
    if (normLabel.includes(normInd) || normInd.includes(normLabel)) {
      return ind;
    }
  }
  return null;
}

// ─── Parse text ───────────────────────────────────────────────
function parseText(text: string, indicateurs: Indicateur[]): ParsedRow[] {
  const lines = text.split(/\n|\r/).filter(l => l.trim());
  const rows: ParsedRow[] = [];

  for (const line of lines) {
    const numMatch = line.match(/[\d,]+\.?\d*/);
    if (!numMatch) continue;
    const valeur = parseFloat(numMatch[0].replace(",", "."));
    if (isNaN(valeur)) continue;
    const label = line.replace(numMatch[0], "").trim().replace(/[:=\-|]+/g, "").trim();
    if (!label) continue;
    const matched = autoMatch(label, indicateurs);
    rows.push({
      sourceLabel: label,
      valeur,
      indicateurId: matched?.id ?? null,
      indicateurNom: matched?.nom ?? "",
      skip: false,
    });
  }
  return rows;
}

// ─── Tab: Copier-coller ───────────────────────────────────────
function TabPaste({
  magasinId,
  indicateurs,
}: {
  magasinId: string;
  indicateurs: Indicateur[];
}) {
  const [text, setText]         = useState("");
  const [rows, setRows]         = useState<ParsedRow[]>([]);
  const [date, setDate]         = useState(() => new Date().toISOString().split("T")[0]);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(0);
  const [analysed, setAnalysed] = useState(false);

  const analyse = () => {
    const parsed = parseText(text, indicateurs);
    setRows(parsed);
    setAnalysed(true);
  };

  const updateRow = (idx: number, patch: Partial<ParsedRow>) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const handleImport = async () => {
    setSaving(true);
    const toImport = rows.filter(r => !r.skip && r.indicateurId);
    const upserts = toImport.map(r => ({
      magasin_id:     magasinId,
      indicateur_id:  r.indicateurId,
      valeur:         r.valeur,
      date_saisie:    date,
    }));
    if (upserts.length > 0) {
      await (supabase as any).from("valeurs").upsert(upserts, { onConflict: "magasin_id,indicateur_id,date_saisie" });
    }
    setSaved(upserts.length);
    setSaving(false);
  };

  const detected     = rows.length;
  const matched      = rows.filter(r => r.indicateurId).length;
  const unrecognized = rows.filter(r => !r.indicateurId).length;

  return (
    <div className="space-y-5">
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setAnalysed(false); setRows([]); setSaved(0); }}
        placeholder="Collez ici le texte de l'intranet EasyCash (Ctrl+A, Ctrl+C sur la page de stats)..."
        className="w-full rounded-xl px-4 py-3 text-[13px] border resize-none focus:outline-none"
        style={{
          background: "var(--surfaceAlt)", borderColor: "var(--border)",
          color: "var(--text)", fontFamily: "inherit", height: 192,
        }}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={analyse}
          disabled={!text.trim()}
          className="rounded-xl px-5 py-2.5 text-[13px] font-semibold transition-opacity"
          style={{
            background: "var(--accent)", color: "#000",
            border: "none", cursor: text.trim() ? "pointer" : "not-allowed",
            fontFamily: "inherit", opacity: text.trim() ? 1 : 0.5,
          }}
        >
          🔍 Analyser
        </button>
        {analysed && (
          <div className="flex gap-3 text-[12px]">
            <span style={{ color: "#4da6ff" }}>{detected} détectés</span>
            <span style={{ color: "#00d4aa" }}>{matched} correspondances</span>
            {unrecognized > 0 && <span style={{ color: "#ffb347" }}>{unrecognized} non reconnus</span>}
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: "var(--surfaceAlt)", borderBottom: "1px solid var(--border)" }}>
                  {["Source", "Valeur", "Indicateur cible", "Ignorer"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold"
                      style={{ color: "var(--textMuted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      background: row.skip ? "var(--bg)" : i % 2 === 0 ? "var(--surface)" : "var(--surfaceAlt)",
                      borderBottom: "1px solid var(--border)",
                      opacity: row.skip ? 0.4 : 1,
                    }}
                  >
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--textMuted)" }}>{row.sourceLabel}</td>
                    <td className="px-4 py-2 text-[13px] font-semibold" style={{ color: "var(--text)" }}>{row.valeur}</td>
                    <td className="px-4 py-2">
                      <select
                        value={row.indicateurId ?? ""}
                        onChange={e => {
                          const id = e.target.value;
                          const ind = indicateurs.find(x => x.id === id);
                          updateRow(i, { indicateurId: id || null, indicateurNom: ind?.nom ?? "" });
                        }}
                        className="rounded-lg px-2 py-1 text-[12px] border"
                        style={{
                          background: "var(--bg)", borderColor: row.indicateurId ? "#00d4aa40" : "var(--border)",
                          color: row.indicateurId ? "#00d4aa" : "var(--textMuted)",
                          fontFamily: "inherit", cursor: "pointer",
                        }}
                      >
                        <option value="">— Non reconnu</option>
                        {indicateurs.map(ind => (
                          <option key={ind.id} value={ind.id}>{ind.nom}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => updateRow(i, { skip: !row.skip })}
                        className="w-5 h-5 rounded border flex items-center justify-center text-[10px]"
                        style={{
                          background: row.skip ? "#ff4d6a30" : "var(--surface)",
                          borderColor: row.skip ? "#ff4d6a60" : "var(--border)",
                          color: row.skip ? "#ff4d6a" : "var(--textDim)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {row.skip ? "✕" : ""}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 mt-4">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="rounded-xl px-3 py-2 text-[12px] border"
              style={{
                background: "var(--surfaceAlt)", borderColor: "var(--border)",
                color: "var(--text)", fontFamily: "inherit",
              }}
            />
            <button
              onClick={handleImport}
              disabled={saving || matched === 0}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold transition-opacity"
              style={{
                background: "#00d4aa", color: "#000",
                border: "none", cursor: saving || matched === 0 ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: saving || matched === 0 ? 0.5 : 1,
              }}
            >
              {saving ? "Import…" : `📥 Importer ${rows.filter(r => !r.skip && r.indicateurId).length} indicateur(s)`}
            </button>
            {saved > 0 && (
              <span className="text-[13px] font-semibold" style={{ color: "#00d4aa" }}>
                ✓ {saved} importé(s)
              </span>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Tab: Fichier Excel ───────────────────────────────────────
function TabExcel({
  magasinId,
  indicateurs,
}: {
  magasinId: string;
  indicateurs: Indicateur[];
}) {
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState("");
  const [rows, setRows]         = useState<ParsedRow[]>([]);
  const [date, setDate]         = useState(() => new Date().toISOString().split("T")[0]);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(0);
  const inputRef                = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setFilename(file.name);
    setRows([]);
    setSaved(0);

    const ext = file.name.split(".").pop()?.toLowerCase();
    let text = "";

    if (ext === "docx") {
      const mammoth = await import("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      text = result.value;
    } else {
      const XLSX = await import("xlsx");
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      text = XLSX.utils.sheet_to_csv(ws);
    }
    setRows(parseText(text, indicateurs));
  };

  const updateRow = (idx: number, patch: Partial<ParsedRow>) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const handleImport = async () => {
    setSaving(true);
    const toImport = rows.filter(r => !r.skip && r.indicateurId);
    const upserts = toImport.map(r => ({
      magasin_id:    magasinId,
      indicateur_id: r.indicateurId,
      valeur:        r.valeur,
      date_saisie:   date,
    }));
    if (upserts.length > 0) {
      await (supabase as any).from("valeurs").upsert(upserts, { onConflict: "magasin_id,indicateur_id,date_saisie" });
    }
    setSaved(upserts.length);
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={e => e.preventDefault()}
        onDrop={async e => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) await processFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors"
        style={{
          borderColor: dragging ? "var(--accent)" : "var(--border)",
          background: dragging ? "#00d4aa08" : "var(--surfaceAlt)",
          minHeight: 160,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.docx"
          className="hidden"
          onChange={async e => {
            const file = e.target.files?.[0];
            if (file) await processFile(file);
          }}
        />
        <div className="text-[32px]">{filename ? "📄" : "📂"}</div>
        <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
          {filename ? filename : "Glissez un fichier ici ou cliquez pour parcourir"}
        </div>
        <div className="text-[11px]" style={{ color: "var(--textDim)" }}>
          .xlsx · .xls · .csv · .docx
        </div>
      </div>

      {/* Preview table (same as paste tab) */}
      {rows.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex gap-3 text-[12px] mb-3">
            <span style={{ color: "#4da6ff" }}>{rows.length} détectés</span>
            <span style={{ color: "#00d4aa" }}>{rows.filter(r => r.indicateurId).length} correspondances</span>
            {rows.filter(r => !r.indicateurId).length > 0 && (
              <span style={{ color: "#ffb347" }}>{rows.filter(r => !r.indicateurId).length} non reconnus</span>
            )}
          </div>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ background: "var(--surfaceAlt)", borderBottom: "1px solid var(--border)" }}>
                  {["Source", "Valeur", "Indicateur cible", "Ignorer"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold" style={{ color: "var(--textMuted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      background: row.skip ? "var(--bg)" : i % 2 === 0 ? "var(--surface)" : "var(--surfaceAlt)",
                      borderBottom: "1px solid var(--border)",
                      opacity: row.skip ? 0.4 : 1,
                    }}
                  >
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--textMuted)" }}>{row.sourceLabel}</td>
                    <td className="px-4 py-2 text-[13px] font-semibold" style={{ color: "var(--text)" }}>{row.valeur}</td>
                    <td className="px-4 py-2">
                      <select
                        value={row.indicateurId ?? ""}
                        onChange={e => {
                          const id = e.target.value;
                          const ind = indicateurs.find(x => x.id === id);
                          updateRow(i, { indicateurId: id || null, indicateurNom: ind?.nom ?? "" });
                        }}
                        className="rounded-lg px-2 py-1 text-[12px] border"
                        style={{
                          background: "var(--bg)", borderColor: row.indicateurId ? "#00d4aa40" : "var(--border)",
                          color: row.indicateurId ? "#00d4aa" : "var(--textMuted)",
                          fontFamily: "inherit", cursor: "pointer",
                        }}
                      >
                        <option value="">— Non reconnu</option>
                        {indicateurs.map(ind => (
                          <option key={ind.id} value={ind.id}>{ind.nom}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => updateRow(i, { skip: !row.skip })}
                        className="w-5 h-5 rounded border flex items-center justify-center text-[10px]"
                        style={{
                          background: row.skip ? "#ff4d6a30" : "var(--surface)",
                          borderColor: row.skip ? "#ff4d6a60" : "var(--border)",
                          color: row.skip ? "#ff4d6a" : "var(--textDim)",
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        {row.skip ? "✕" : ""}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="rounded-xl px-3 py-2 text-[12px] border"
              style={{
                background: "var(--surfaceAlt)", borderColor: "var(--border)",
                color: "var(--text)", fontFamily: "inherit",
              }}
            />
            <button
              onClick={handleImport}
              disabled={saving}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold"
              style={{
                background: "#00d4aa", color: "#000",
                border: "none", cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? "Import…" : `📥 Importer ${rows.filter(r => !r.skip && r.indicateurId).length} indicateur(s)`}
            </button>
            {saved > 0 && (
              <span className="text-[13px] font-semibold" style={{ color: "#00d4aa" }}>✓ {saved} importé(s)</span>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Tab: Visite rapide ───────────────────────────────────────
const NON_NEGOCIABLES = [
  "Batterie / Picea",
  "Note Google",
  "Tuile Marketplace",
  "Produits certifiés authentiques",
  "Taux de démarque",
];

function TabVisite({
  magasinId,
  indicateurs,
  onNavigate,
}: {
  magasinId: string;
  indicateurs: Indicateur[];
  onNavigate?: (tab: string) => void;
}) {
  const [dernieres, setDernieres]   = useState<DerniereValeur[]>([]);
  const [inputs, setInputs]         = useState<Record<string, string>>({});
  const [savedToday, setSavedToday] = useState<Set<string>>(new Set());
  const [loading, setLoading]       = useState(true);
  const today                       = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!magasinId) return;
    setLoading(true);
    Promise.all([
      (supabase as any).from("v_dernieres_valeurs").select("*").eq("magasin_id", magasinId),
    ]).then(([{ data }]) => {
      setDernieres((data ?? []) as DerniereValeur[]);
      setLoading(false);
    });
  }, [magasinId]);

  const save = async (indicateurId: string, valStr: string) => {
    const val = parseFloat(valStr);
    if (isNaN(val)) return;
    await (supabase as any).from("valeurs").upsert(
      [{ magasin_id: magasinId, indicateur_id: indicateurId, valeur: val, date_saisie: today }],
      { onConflict: "magasin_id,indicateur_id,date_saisie" }
    );
    setSavedToday(prev => { const next = new Set(Array.from(prev)); next.add(indicateurId); return next; });
    setDernieres(prev => {
      const existing = prev.find(d => d.indicateur_id === indicateurId);
      if (existing) {
        return prev.map(d => d.indicateur_id === indicateurId ? { ...d, valeur: val, date_saisie: today } : d);
      }
      const ind = indicateurs.find(i => i.id === indicateurId);
      return [...prev, {
        indicateur_id: indicateurId,
        indicateur_nom: ind?.nom ?? "",
        valeur: val,
        date_saisie: today,
        unite: ind?.unite ?? null,
      }];
    });
  };

  const alertes        = dernieres.filter(d => d.status === "dg");
  const nonNegIds      = indicateurs.filter(i => NON_NEGOCIABLES.includes(i.nom));
  const jamaisRens     = indicateurs.filter(i => !dernieres.find(d => d.indicateur_id === i.id));
  const totalKpis      = indicateurs.length;
  const renseignesAuj  = dernieres.filter(d => d.date_saisie === today).length + savedToday.size;

  const KpiCard = ({ indicateur, valeurActuelle, unite }: {
    indicateur: Indicateur;
    valeurActuelle?: number;
    unite?: string | null;
  }) => {
    const isSaved  = savedToday.has(indicateur.id);
    const inputVal = inputs[indicateur.id] ?? "";
    return (
      <div
        className="rounded-2xl border p-4"
        style={{
          background: isSaved ? "#00d4aa08" : "var(--surface)",
          borderColor: isSaved ? "#00d4aa40" : "var(--border)",
        }}
      >
        <div className="text-[13px] font-semibold mb-1" style={{ color: "var(--text)" }}>{indicateur.nom}</div>
        {valeurActuelle !== undefined && (
          <div className="text-[11px] mb-3" style={{ color: "var(--textDim)" }}>
            Dernière valeur : {valeurActuelle}{unite ? ` ${unite}` : ""}
          </div>
        )}
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={inputVal}
            onChange={e => setInputs(prev => ({ ...prev, [indicateur.id]: e.target.value }))}
            onBlur={() => save(indicateur.id, inputVal)}
            onKeyDown={e => { if (e.key === "Enter") save(indicateur.id, inputVal); }}
            placeholder="Valeur…"
            className="rounded-xl px-4 py-4 text-2xl font-bold border flex-1 focus:outline-none"
            style={{
              background: "var(--surfaceAlt)", borderColor: "var(--border)",
              color: "var(--text)", fontFamily: "inherit",
            }}
          />
          {isSaved && (
            <span
              className="rounded-full px-3 py-1.5 text-[11px] font-semibold"
              style={{ background: "#00d4aa20", color: "#00d4aa" }}
            >
              ✓ Sauvé
            </span>
          )}
        </div>
      </div>
    );
  };

  const pctRenseigne = totalKpis > 0 ? Math.round((renseignesAuj / totalKpis) * 100) : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl h-28 animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div
        className="rounded-2xl border p-4 flex items-center justify-between"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div>
          <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            KPIs renseignés aujourd&apos;hui
          </div>
          <div className="text-[11px]" style={{ color: "var(--textDim)" }}>
            {renseignesAuj}/{totalKpis} · {pctRenseigne}%
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 h-2 rounded-full" style={{ background: "var(--surfaceAlt)" }}>
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${pctRenseigne}%`, background: "var(--accent)" }}
            />
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate("kpis")}
              className="rounded-xl px-3 py-1.5 text-[11px] font-semibold"
              style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            >
              Voir tous les KPIs →
            </button>
          )}
        </div>
      </div>

      {/* En alerte */}
      {alertes.length > 0 && (
        <section>
          <h3 className="text-[13px] font-bold mb-3" style={{ color: "#ff4d6a" }}>🚨 En alerte</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {alertes.map(d => {
              const ind = indicateurs.find(i => i.id === d.indicateur_id);
              if (!ind) return null;
              return <KpiCard key={ind.id} indicateur={ind} valeurActuelle={d.valeur} unite={d.unite} />;
            })}
          </div>
        </section>
      )}

      {/* Non-négociables */}
      <section>
        <h3 className="text-[13px] font-bold mb-3" style={{ color: "#ffb347" }}>📌 Non-négociables</h3>
        <div className="grid md:grid-cols-2 gap-3">
          {nonNegIds.map(ind => {
            const d = dernieres.find(x => x.indicateur_id === ind.id);
            return <KpiCard key={ind.id} indicateur={ind} valeurActuelle={d?.valeur} unite={ind.unite} />;
          })}
        </div>
      </section>

      {/* Jamais renseignés */}
      {jamaisRens.length > 0 && (
        <section>
          <h3 className="text-[13px] font-bold mb-3" style={{ color: "var(--textMuted)" }}>📭 Jamais renseignés</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {jamaisRens.map(ind => (
              <KpiCard key={ind.id} indicateur={ind} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export function ImportScreen({ magasinId, magasin, onNavigate }: ImportScreenProps) {
  const [activeTab, setActiveTab]     = useState<0 | 1 | 2>(0);
  const [indicateurs, setIndicateurs] = useState<Indicateur[]>([]);
  const [loadingInd, setLoadingInd]   = useState(true);

  useEffect(() => {
    (supabase as any).from("indicateurs").select("id,nom,unite,categorie").order("ordre")
      .then(({ data }: { data: Indicateur[] | null }) => {
        setIndicateurs(data ?? []);
        setLoadingInd(false);
      });
  }, []);

  const tabs = [
    { label: "📋 Copier-coller", id: 0 as const },
    { label: "📂 Fichier Excel",  id: 1 as const },
    { label: "⚡ Visite rapide",  id: 2 as const },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold" style={{ color: "var(--text)" }}>
          Import de données{magasin ? ` — ${magasin.nom}` : ""}
        </h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--textMuted)" }}>
          Importez vos indicateurs depuis l&apos;intranet EasyCash ou un fichier
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl p-1 border" style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)" }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="flex-1 rounded-lg px-4 py-2 text-[12px] font-semibold transition-all"
            style={{
              background: activeTab === t.id ? "var(--surface)" : "transparent",
              color: activeTab === t.id ? "var(--text)" : "var(--textMuted)",
              border: "none", cursor: "pointer", fontFamily: "inherit",
              boxShadow: activeTab === t.id ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loadingInd ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl h-12 animate-pulse" style={{ background: "var(--surfaceAlt)" }} />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === 0 && <TabPaste magasinId={magasinId} indicateurs={indicateurs} />}
            {activeTab === 1 && <TabExcel magasinId={magasinId} indicateurs={indicateurs} />}
            {activeTab === 2 && <TabVisite magasinId={magasinId} indicateurs={indicateurs} onNavigate={onNavigate} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

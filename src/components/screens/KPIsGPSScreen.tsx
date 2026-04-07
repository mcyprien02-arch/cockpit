"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { getStatus } from "@/lib/scoring";
import { formatEuro } from "@/lib/hiddenCosts";
import type { ValeurAvecIndicateur } from "@/types";

// ─── Phase detection ──────────────────────────────────────────
type Phase = "lancement" | "croissance" | "maturite";
function detectPhase(caMensuel: number | null): Phase {
  if (!caMensuel) return "croissance";
  if (caMensuel < 50000) return "lancement";
  if (caMensuel < 120000) return "croissance";
  return "maturite";
}

const PHASE_CONFIG: Record<Phase, { label: string; color: string; focus: string[] }> = {
  lancement:  { label: "Lancement",  color: "#ff4d6a", focus: ["stock", "achat", "marge"] },
  croissance: { label: "Croissance", color: "#ffb347", focus: ["gamme", "ca", "tlac"] },
  maturite:   { label: "Maturité",   color: "#00d4aa", focus: ["ebe", "gmroi", "masse salar"] },
};

// ─── KPI priority scoring ─────────────────────────────────────
// Score = (Impact€ * 0.5) + (Urgence * 0.3) + (Contexte * 0.2)
// All 0–100
const MAX_IMPACT = 50000;

function kpiPriorityScore(
  impactEuro: number,
  status: "ok" | "wn" | "dg" | null,
  inPhocusFocus: boolean
): number {
  const impactNorm = Math.min(100, (impactEuro / MAX_IMPACT) * 100);
  const urgence = status === "dg" ? 100 : status === "wn" ? 50 : 0;
  const contexte = inPhocusFocus ? 100 : 50;
  return Math.round(impactNorm * 0.5 + urgence * 0.3 + contexte * 0.2);
}

// ─── Impact € estimator ───────────────────────────────────────
function estimateImpactEuro(
  nom: string,
  valeur: number | null,
  seuilOk: number | null,
  allValeurs: ValeurAvecIndicateur[]
): number {
  if (!valeur || !seuilOk) return 0;
  const n = nom.toLowerCase();

  const ca = allValeurs.find(v => {
    const vn = v.indicateur_nom?.toLowerCase() ?? "";
    return (vn.includes("ca mensuel") || vn.includes("chiffre d")) && !vn.includes("ca /") && !vn.includes("ca par");
  })?.valeur ?? 100000;
  const caAn = ca * 12;

  const stockVal = allValeurs.find(v => v.indicateur_nom?.toLowerCase().includes("valeur stock"))?.valeur ?? 150000;

  if (n.includes("marge")) {
    const gap = seuilOk - valeur;
    return gap > 0 ? Math.round(caAn * gap / 100) : 0;
  }
  if (n.includes("masse salar")) {
    const gap = valeur - seuilOk;
    return gap > 0 ? Math.round(caAn * gap / 100) : 0;
  }
  if (n.includes("gmroi")) {
    const gap = seuilOk - valeur;
    return gap > 0 ? Math.round(gap * stockVal * 0.38) : 0;
  }
  if (n.includes("stock âg")) {
    const gap = valeur - seuilOk;
    return gap > 0 ? Math.round((gap / 100) * stockVal * 0.38) : 0;
  }
  if (n.includes("tlac") || n.includes("taux lachat") || n.includes("ventes comp")) {
    const gap = seuilOk - valeur;
    return gap > 0 ? Math.round(caAn * gap / 100) : 0;
  }
  if (n.includes("ebe")) {
    const gap = seuilOk - valeur;
    return gap > 0 ? Math.round(caAn * gap / 100) : 0;
  }
  if (n.includes("note google") || n.includes("nps")) {
    return valeur < seuilOk ? Math.round((seuilOk - valeur) * 3000) : 0;
  }
  if (n.includes("turnover")) {
    const nbEtp = allValeurs.find(v => v.indicateur_nom?.toLowerCase().includes("nb etp"))?.valeur ?? 6;
    const excess = Math.max(0, valeur - seuilOk);
    return Math.round((excess / 100) * nbEtp * 4500);
  }
  if (n.includes("délai de vente")) {
    const excess = Math.max(0, valeur - seuilOk);
    return Math.round(excess * 120);
  }
  return 0;
}

// ─── GPS KPI row ──────────────────────────────────────────────
interface KPIGPSRowProps {
  v: ValeurAvecIndicateur & { impactEuro: number; priorityScore: number };
  rank: number;
}
function KPIGPSRow({ v, rank }: KPIGPSRowProps) {
  const statusColors = {
    ok: { color: "#00d4aa", bg: "#00d4aa18", label: "OK" },
    wn: { color: "#ffb347", bg: "#ffb34718", label: "Vigilance" },
    dg: { color: "#ff4d6a", bg: "#ff4d6a18", label: "Action" },
  };
  const sc = v.status ? statusColors[v.status] : { color: "#555a6e", bg: "transparent", label: "—" };

  const priorityColor = v.priorityScore >= 70 ? "#ff4d6a" : v.priorityScore >= 40 ? "#ffb347" : "#00d4aa";

  return (
    <div
      className="flex items-center gap-3 py-3 border-b"
      style={{ borderColor: "var(--border)" }}
    >
      {/* Rank */}
      <div
        className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black shrink-0"
        style={{ background: v.status === "dg" ? "#ff4d6a20" : "var(--surfaceAlt)", color: v.status === "dg" ? "#ff4d6a" : "var(--textDim)" }}
      >
        {rank}
      </div>

      {/* Status dot */}
      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sc.color }} />

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold truncate" style={{ color: "var(--text)" }}>
          {v.indicateur_nom}
        </div>
        {v.categorie && (
          <div className="text-[10px]" style={{ color: "var(--textDim)" }}>{v.categorie}</div>
        )}
      </div>

      {/* Value vs seuil */}
      <div className="text-right shrink-0">
        <div className="text-[13px] font-bold" style={{ color: sc.color }}>
          {v.valeur?.toFixed?.(1) ?? "—"}{v.unite ? ` ${v.unite}` : ""}
        </div>
        {v.seuil_ok !== null && (
          <div className="text-[9px]" style={{ color: "var(--textDim)" }}>
            cible {v.seuil_ok}{v.unite ? ` ${v.unite}` : ""}
          </div>
        )}
      </div>

      {/* Impact € */}
      <div className="text-right shrink-0 w-24 hidden sm:block">
        {v.impactEuro > 0 ? (
          <div className="text-[11px] font-bold" style={{ color: "#ff4d6a" }}>
            ~{formatEuro(v.impactEuro)}/an
          </div>
        ) : (
          <div className="text-[10px]" style={{ color: "var(--textDim)" }}>
            {v.status === "ok" ? "✓" : "impact inconnu"}
          </div>
        )}
      </div>

      {/* Priority score */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 hidden md:flex"
        style={{ background: `${priorityColor}18`, color: priorityColor }}
        title={`Score priorité : ${v.priorityScore}`}
      >
        {v.priorityScore}
      </div>
    </div>
  );
}

// ─── 3 Cas types reference ────────────────────────────────────
const CAS_TYPES = [
  {
    label: "Top",
    color: "#00d4aa",
    emoji: "🏆",
    kpis: [
      { nom: "Marge brute", val: "42%" },
      { nom: "GMROI", val: "4.2" },
      { nom: "Stock âgé", val: "18%" },
      { nom: "CA/ETP", val: "22k€" },
    ],
    pratiques: "Animation prix serrée, rotations hebdo stock, formation TLAC systématique",
  },
  {
    label: "Moyen",
    color: "#ffb347",
    emoji: "📊",
    kpis: [
      { nom: "Marge brute", val: "37%" },
      { nom: "GMROI", val: "3.4" },
      { nom: "Stock âgé", val: "32%" },
      { nom: "CA/ETP", val: "18k€" },
    ],
    pratiques: "Déstockages ponctuels, TLAC variable, peu de suivi KPIs hebdo",
  },
  {
    label: "En difficulté",
    color: "#ff4d6a",
    emoji: "⚠️",
    kpis: [
      { nom: "Marge brute", val: "31%" },
      { nom: "GMROI", val: "2.5" },
      { nom: "Stock âgé", val: "47%" },
      { nom: "CA/ETP", val: "13k€" },
    ],
    pratiques: "Stock dormant, prix non révisés, faible proposition commerciale",
  },
];

// ─── GMROI Stock Pedagogy Panel ───────────────────────────────
function GmroiStockPanel({ valeurs }: { valeurs: ValeurAvecIndicateur[] }) {
  const [open, setOpen] = useState(true);

  const gmroi = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("gmroi"));
  const stockVal = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("valeur stock"))?.valeur ?? null;
  const stockAge = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("stock âg"))?.valeur ?? null;
  const marge = valeurs.find(v => v.indicateur_nom?.toLowerCase().includes("marge") && !v.indicateur_nom?.toLowerCase().includes("nette"))?.valeur ?? null;

  const currentGmroi = gmroi?.valeur ?? null;
  const BENCHMARK = 3.84;

  // 3 profils de stock
  const PROFILS = [
    { label: "Stock 120k€", stock: 120000, gmroiBas: 2.5, gmroiCible: 3.84, color: "#ff4d6a" },
    { label: "Stock 200k€", stock: 200000, gmroiBas: 2.5, gmroiCible: 3.84, color: "#ffb347" },
    { label: "Stock 300k€", stock: 300000, gmroiBas: 2.5, gmroiCible: 3.84, color: "#00d4aa" },
  ];

  // Annual margin generated at current vs benchmark GMROI
  const margeBas   = stockVal && currentGmroi ? Math.round(stockVal * currentGmroi)   : null;
  const margeCible = stockVal ? Math.round(stockVal * BENCHMARK) : null;
  const gainPotentiel = margeBas !== null && margeCible !== null ? margeCible - margeBas : null;

  // Vieux stock cost
  const vieuxStockEuro = stockVal && stockAge ? Math.round((stockAge / 100) * stockVal) : null;
  const vieuxStockCout = vieuxStockEuro ? Math.round(vieuxStockEuro * 0.15) : null; // ~15%/an immobilisation

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid #00d4aa30" }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4"
        style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[16px]" style={{ background: "#00d4aa18" }}>
            💡
          </div>
          <div className="text-left">
            <div className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
              Pour 1€ investi en stock, combien vous générez ?
            </div>
            <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>
              GMROI · Rendement du stock · Profils réseau
            </div>
          </div>
        </div>
        <span className="text-[12px]" style={{ color: "var(--textDim)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t" style={{ borderColor: "var(--border)" }}>

          {/* Message clé */}
          <div
            className="rounded-xl p-4 text-[13px] font-medium leading-relaxed mt-4"
            style={{ background: "#00d4aa0a", border: "1px solid #00d4aa25", color: "var(--text)" }}
          >
            <span style={{ color: "#00d4aa", fontWeight: 700 }}>Règle d'or :</span>{" "}
            Votre stock, c'est votre argent. S'il dort, il vous coûte. S'il tourne, il vous enrichit.
            <br />
            <span className="text-[11px] mt-1 block" style={{ color: "var(--textMuted)" }}>
              On ne double pas la marge en doublant le stock — l'efficacité de chaque euro prime sur le volume.
            </span>
          </div>

          {/* GMROI actuel vs cible */}
          {currentGmroi !== null && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--textDim)" }}>
                VOTRE GMROI ACTUEL
              </div>
              <div className="flex items-end gap-6 flex-wrap">
                <div>
                  <div
                    className="text-[40px] font-black"
                    style={{ color: currentGmroi >= BENCHMARK ? "#00d4aa" : currentGmroi >= 2.5 ? "#ffb347" : "#ff4d6a" }}
                  >
                    {currentGmroi.toFixed(2)}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>
                    Pour 1€ investi → {currentGmroi.toFixed(2)}€ de marge générée/an
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[13px]">
                  <div>
                    <div className="text-[11px] mb-0.5" style={{ color: "var(--textDim)" }}>Réseau cible</div>
                    <div className="font-black" style={{ color: "#00d4aa" }}>{BENCHMARK}</div>
                  </div>
                  {gainPotentiel !== null && gainPotentiel > 0 && (
                    <div
                      className="rounded-xl px-4 py-2"
                      style={{ background: "#ff4d6a12", border: "1px solid #ff4d6a30" }}
                    >
                      <div className="text-[10px]" style={{ color: "var(--textDim)" }}>Gain potentiel</div>
                      <div className="text-[15px] font-black" style={{ color: "#ff4d6a" }}>
                        +{formatEuro(gainPotentiel)}/an
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "#ffffff10" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, (currentGmroi / Math.max(BENCHMARK, currentGmroi)) * 100)}%`,
                    background: currentGmroi >= BENCHMARK ? "#00d4aa" : currentGmroi >= 2.5 ? "#ffb347" : "#ff4d6a",
                  }}
                />
              </div>
              <div className="flex justify-between text-[9px] mt-1" style={{ color: "var(--textDim)" }}>
                <span>0</span>
                <span>Cible 3.84</span>
                <span>5+</span>
              </div>
            </div>
          )}

          {/* Vieux stock coût */}
          {vieuxStockEuro !== null && vieuxStockEuro > 0 && (
            <div
              className="rounded-xl p-4 flex items-start gap-3"
              style={{ background: "#ff4d6a08", border: "1px solid #ff4d6a25" }}
            >
              <span className="text-[20px] shrink-0">🧊</span>
              <div>
                <div className="text-[12px] font-bold" style={{ color: "#ff4d6a" }}>
                  Votre vieux stock immobilise ~{formatEuro(vieuxStockEuro)}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--textMuted)" }}>
                  Coût d'opportunité estimé : ~{vieuxStockCout ? formatEuro(vieuxStockCout) : "?"}/an
                  {" "}— c'est de la trésorerie qui dort au lieu de générer de la marge.
                </div>
                <div className="text-[11px] mt-1 font-semibold" style={{ color: "#ffb347" }}>
                  Action : déstockage accéléré (remise progressive) + Ventilation des immos
                </div>
              </div>
            </div>
          )}

          {/* 3 profils de stock */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: "var(--textDim)" }}>
              GMROI EN € — 3 PROFILS RÉSEAU
            </div>
            <div className="grid grid-cols-3 gap-3">
              {PROFILS.map(p => {
                const margeAvec = Math.round(p.stock * p.gmroiCible);
                const margeSans = Math.round(p.stock * p.gmroiBas);
                const ecart = margeAvec - margeSans;
                const isCurrent = stockVal !== null && Math.abs(stockVal - p.stock) < p.stock * 0.4;
                return (
                  <div
                    key={p.label}
                    className="rounded-xl p-3"
                    style={{
                      background: isCurrent ? `${p.color}12` : "var(--surfaceAlt)",
                      border: isCurrent ? `1px solid ${p.color}40` : "1px solid transparent",
                    }}
                  >
                    <div className="text-[10px] font-bold mb-2" style={{ color: p.color }}>
                      {p.label}{isCurrent ? " ← vous" : ""}
                    </div>
                    <div className="space-y-1 text-[10px]">
                      <div className="flex justify-between">
                        <span style={{ color: "var(--textDim)" }}>GMROI 2.5</span>
                        <span style={{ color: "#ff4d6a" }}>{formatEuro(margeSans)}/an</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: "var(--textDim)" }}>GMROI 3.84</span>
                        <span style={{ color: "#00d4aa" }}>{formatEuro(margeAvec)}/an</span>
                      </div>
                      <div
                        className="flex justify-between pt-1 mt-1 font-bold border-t"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <span style={{ color: "var(--textMuted)" }}>Gain possible</span>
                        <span style={{ color: p.color }}>+{formatEuro(ecart)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] mt-2 italic" style={{ color: "var(--textDim)" }}>
              On ne pilote pas un stock de 120k€ comme un stock de 300k€ — mais la logique de rendement s'applique à tous.
            </div>
          </div>

          {/* Méthodes d'action */}
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div className="rounded-xl p-3" style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}>
              <div className="font-bold mb-1.5" style={{ color: "var(--text)" }}>🔄 Déstockage</div>
              <ul className="space-y-1" style={{ color: "var(--textMuted)" }}>
                <li>• Remises progressives sur immos &gt;90j</li>
                <li>• Lots promotionnels semaine</li>
                <li>• Ventilation (transfer inter-magasin)</li>
                <li>• Don association si stock non vendable</li>
              </ul>
            </div>
            <div className="rounded-xl p-3" style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}>
              <div className="font-bold mb-1.5" style={{ color: "var(--text)" }}>📊 KPIs à suivre</div>
              <ul className="space-y-1" style={{ color: "var(--textMuted)" }}>
                <li>• GMROI (cible ≥ 3.84)</li>
                <li>• Stock âgé (cible ≤ 30%)</li>
                <li>• Délai de vente moyen (≤ 30j)</li>
                <li>• Stock fin M → marge M+1</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
interface KPIsGPSScreenProps {
  magasinId: string;
  onNavigate: (tab: string) => void;
  phaseVie?: "lancement" | "croissance" | "maturite" | null;
}

export function KPIsGPSScreen({ magasinId, onNavigate, phaseVie }: KPIsGPSScreenProps) {
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCasTypes, setShowCasTypes] = useState(false);

  const loadData = useCallback(async () => {
    if (!magasinId) return;
    setLoading(true);
    const { data: vData } = await supabase
      .from("v_dernieres_valeurs")
      .select("*")
      .eq("magasin_id", magasinId);

    type VRow = {
      magasin_id: string; indicateur_id: string; valeur: number; date_saisie: string;
      indicateur_nom: string; unite: string | null; direction: "up" | "down";
      seuil_ok: number | null; seuil_vigilance: number | null; categorie: string;
      poids: number; action_defaut: string | null; magasin_nom: string;
    };

    const enriched: ValeurAvecIndicateur[] = ((vData ?? []) as VRow[]).map(r => ({
      ...r,
      status: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
    }));
    setValeurs(enriched);
    setLoading(false);
  }, [magasinId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Phase: DB value takes priority, fallback to CA-based auto-detection
  const caMensuel = valeurs.find(v => {
    const n = v.indicateur_nom?.toLowerCase() ?? "";
    return n.includes("ca mensuel") && !n.includes("/");
  })?.valeur ?? null;

  const phase: Phase = phaseVie ?? detectPhase(caMensuel);
  const phaseConf = PHASE_CONFIG[phase];

  // Compute priority for each KPI
  type KPIWithPriority = ValeurAvecIndicateur & { impactEuro: number; priorityScore: number };

  const prioritized: KPIWithPriority[] = valeurs.map(v => {
    const impact = estimateImpactEuro(v.indicateur_nom ?? "", v.valeur, v.seuil_ok, valeurs);
    const inFocus = phaseConf.focus.some(f => v.indicateur_nom?.toLowerCase().includes(f));
    const ps = kpiPriorityScore(impact, v.status ?? null, inFocus);
    return { ...v, impactEuro: impact, priorityScore: ps };
  });

  // Sort by priority desc, take top 15, then separate by block
  const sorted = [...prioritized].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 15);

  // Group into 3 blocks for display
  const ARGENT_CATS = ["Commercial", "Financier", "Politique commerciale"];
  const STOCK_CATS = ["Stock", "Gamme"];
  const CLIENT_CATS = ["Fidélité", "Qualité", "RH", "Web / E-réputation"];

  const blockArgent = sorted.filter(v => ARGENT_CATS.some(c => v.categorie?.includes(c)));
  const blockStock = sorted.filter(v => STOCK_CATS.some(c => v.categorie?.includes(c)));
  const blockClient = sorted.filter(v => CLIENT_CATS.some(c => v.categorie?.includes(c)) || (!ARGENT_CATS.some(c => v.categorie?.includes(c)) && !STOCK_CATS.some(c => v.categorie?.includes(c))));

  const blocks = [
    { label: "ARGENT", icon: "💰", weight: "40%", items: blockArgent, color: "#00d4aa" },
    { label: "STOCK", icon: "📦", weight: "35%", items: blockStock, color: "#4da6ff" },
    { label: "CLIENT & ÉQUIPE", icon: "👥", weight: "25%", items: blockClient, color: "#a78bfa" },
  ];

  const totalImpact = sorted.filter(v => v.status !== "ok").reduce((s, v) => s + v.impactEuro, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />)}
      </div>
    );
  }

  if (valeurs.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-[40px] mb-3">📊</div>
        <div className="text-[14px] font-semibold mb-2" style={{ color: "var(--text)" }}>Pas encore de KPIs</div>
        <button
          onClick={() => onNavigate("saisie")}
          className="rounded-xl px-5 py-2 text-[13px] font-bold mt-2"
          style={{ background: "var(--accent)", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          Saisir mes KPIs →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[1000px]">

      {/* Phase + impact header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="rounded-full px-3.5 py-1.5 text-[11px] font-bold"
            style={{ background: `${phaseConf.color}18`, color: phaseConf.color }}
          >
            Phase {phaseConf.label}
          </div>
          <div className="text-[12px]" style={{ color: "var(--textMuted)" }}>
            Focus : {phaseConf.focus.join(" · ")}
          </div>
        </div>

        {totalImpact > 0 && (
          <div
            className="rounded-full px-3.5 py-1.5 text-[11px] font-bold"
            style={{ background: "#ff4d6a18", color: "#ff4d6a" }}
          >
            ~{formatEuro(totalImpact)}/an bloqués
          </div>
        )}
      </div>

      {/* Score formula explainer */}
      <div
        className="rounded-xl px-4 py-3 text-[11px] flex flex-wrap items-center gap-3"
        style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)" }}
      >
        <span className="font-bold" style={{ color: "var(--text)" }}>Score priorité =</span>
        <span>(Impact € × 0.5)</span>
        <span>+</span>
        <span>(Urgence × 0.3)</span>
        <span>+</span>
        <span>(Contexte phase × 0.2)</span>
        <button
          onClick={() => onNavigate("saisie")}
          className="ml-auto rounded-xl px-3 py-1 text-[10px] font-bold"
          style={{ background: "var(--accent)", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          + Saisir des valeurs
        </button>
      </div>

      {/* KPI blocks */}
      {blocks.map(block => {
        if (block.items.length === 0) return null;
        const globalRankOffset = blocks.slice(0, blocks.indexOf(block)).reduce((s, b) => s + b.items.length, 0);
        return (
          <div
            key={block.label}
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            {/* Block header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <span>{block.icon}</span>
                <span className="text-[12px] font-bold" style={{ color: block.color }}>{block.label}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                  style={{ background: `${block.color}18`, color: block.color }}
                >
                  Poids {block.weight}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span style={{ color: "#00d4aa" }}>✓ {block.items.filter(v => v.status === "ok").length}</span>
                <span style={{ color: "#ffb347" }}>⚠ {block.items.filter(v => v.status === "wn").length}</span>
                <span style={{ color: "#ff4d6a" }}>✗ {block.items.filter(v => v.status === "dg").length}</span>
              </div>
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-3 px-4 py-1.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--textDim)", borderBottom: "1px solid var(--border)" }}>
              <div className="w-5" />
              <div className="w-2.5" />
              <div className="flex-1">Indicateur</div>
              <div className="w-16 text-right">Valeur</div>
              <div className="w-24 text-right hidden sm:block">Impact €/an</div>
              <div className="w-8 text-center hidden md:block">Score</div>
            </div>

            {/* KPI rows */}
            <div className="px-4">
              {block.items.map((v, i) => (
                <motion.div
                  key={v.indicateur_id ?? v.indicateur_nom}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (globalRankOffset + i) * 0.04 }}
                >
                  <KPIGPSRow v={v} rank={globalRankOffset + i + 1} />
                </motion.div>
              ))}
            </div>
          </div>
        );
      })}

      {/* GMROI Stock pedagogy */}
      <GmroiStockPanel valeurs={valeurs} />

      {/* 3 Cas types (collapsible) */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <button
          onClick={() => setShowCasTypes(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          <div className="text-[11px] font-bold tracking-wider" style={{ color: "var(--textDim)" }}>
            📊 CAS TYPES RÉSEAU (RÉFÉRENTIEL)
          </div>
          <span className="text-[12px]" style={{ color: "var(--textDim)" }}>
            {showCasTypes ? "▲" : "▼"}
          </span>
        </button>

        {showCasTypes && (
          <div className="px-4 pb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {CAS_TYPES.map(ct => (
              <div
                key={ct.label}
                className="rounded-xl p-3"
                style={{ background: "var(--surfaceAlt)", border: `1px solid ${ct.color}30` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span>{ct.emoji}</span>
                  <span className="text-[12px] font-bold" style={{ color: ct.color }}>{ct.label}</span>
                </div>
                <div className="space-y-1 mb-2">
                  {ct.kpis.map(k => (
                    <div key={k.nom} className="flex justify-between text-[11px]">
                      <span style={{ color: "var(--textMuted)" }}>{k.nom}</span>
                      <span className="font-bold" style={{ color: ct.color }}>{k.val}</span>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] italic" style={{ color: "var(--textDim)" }}>{ct.pratiques}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { getStatus } from "@/lib/scoring";
import { formatEuro } from "@/lib/hiddenCosts";
import type { ValeurAvecIndicateur } from "@/types";

// ─── Constants ────────────────────────────────────────────────
const STOCK_FAMILIES = [
  { key: "tlce",        label: "TLCE (LS)",      ref: 30000,  margePct: 76, delay: "15j → 30j → 60j" },
  { key: "jv",          label: "Jeux Vidéo",     ref: 22000,  margePct: 47, delay: "15j → 30j → 60j" },
  { key: "bijouterie",  label: "Bijouterie",      ref: 40500,  margePct: 65, delay: "90j → 120j → 150j" },
  { key: "informatique",label: "Informatique",    ref: 8000,   margePct: 28, delay: "15j → 30j → 60j" },
  { key: "livres",      label: "Livres",          ref: 5000,   margePct: 35, delay: "30j → 60j → 90j" },
  { key: "telephonie",  label: "Téléphonie",      ref: 15000,  margePct: 34, delay: "15j → 30j → 60j" },
  { key: "autres",      label: "Autres",          ref: 15000,  margePct: 35, delay: "30j → 60j → 90j" },
];
const STOCK_REF_TOTAL = 135500;

const MIX_FAMILIES = [
  { key: "telephonie", label: "Téléphonie",   margePct: 34, color: "#4da6ff" },
  { key: "jv",         label: "Jeux Vidéo",   margePct: 47, color: "#a78bfa" },
  { key: "ls",         label: "LS",           margePct: 76, color: "#00d4aa" },
  { key: "bijouterie", label: "Bijouterie",   margePct: 65, color: "#ffb347" },
  { key: "informatique",label: "Informatique",margePct: 28, color: "#ff4d6a" },
  { key: "autre",      label: "Autre",        margePct: 35, color: "#8b8fa3" },
];
const DEFAULT_MIX = { telephonie: 35, jv: 20, ls: 15, bijouterie: 10, informatique: 12, autre: 8 };

const SALAIRE_MOYEN = 28000;

// ─── Helpers ──────────────────────────────────────────────────
function pctBar(value: number, max: number, color: string, height = 6) {
  const pct = Math.min((value / Math.max(max, 1)) * 100, 100);
  return (
    <div className="rounded-full overflow-hidden" style={{ background: "var(--surfaceAlt)", height }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4 }}
        style={{ height: "100%", background: color, borderRadius: 999 }}
      />
    </div>
  );
}

function SectionTitle({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-lg">{icon}</span>
      <span className="text-[13px] font-bold uppercase tracking-widest" style={{ color: "var(--text)" }}>{label}</span>
    </div>
  );
}

function Slider({
  label, value, min, max, step, unit, onChange, color = "var(--accent)", sublabel,
}: {
  label: string; value: number; min: number; max: number; step: number;
  unit: string; onChange: (v: number) => void; color?: string; sublabel?: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[12px] font-medium" style={{ color: "var(--text)" }}>{label}</span>
        <span className="text-[13px] font-bold" style={{ color }}>
          {unit === "€" ? formatEuro(value) : `${value}${unit}`}
        </span>
      </div>
      {sublabel && <div className="text-[10px] mb-1" style={{ color: "var(--textDim)" }}>{sublabel}</div>}
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: color }}
      />
      <div className="flex justify-between text-[10px]" style={{ color: "var(--textDim)" }}>
        <span>{unit === "€" ? formatEuro(min) : `${min}${unit}`}</span>
        <span>{unit === "€" ? formatEuro(max) : `${max}${unit}`}</span>
      </div>
    </div>
  );
}

function ImpactBadge({ value, suffix = "€/an" }: { value: number; suffix?: string }) {
  const positive = value >= 0;
  return (
    <span
      className="text-[12px] font-bold rounded-full px-2.5 py-0.5"
      style={{
        background: positive ? "#00d4aa18" : "#ff4d6a18",
        color: positive ? "#00d4aa" : "#ff4d6a",
      }}
    >
      {positive ? "+" : ""}{formatEuro(Math.abs(value))} {suffix}
    </span>
  );
}

// ─── Main component ────────────────────────────────────────────
export function SimulateurScreen({ magasinId }: { magasinId: string }) {
  // Context from Supabase
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [loadingCtx, setLoadingCtx] = useState(true);

  // Context derived values
  const [ctx, setCtx] = useState({
    caAnnuel: 500000,
    stockTotal: STOCK_REF_TOTAL,
    nbEtp: 4,
    tauxMarge: 38,
  });

  // Section 1 — Stock
  const [stocks, setStocks] = useState<Record<string, number>>(
    Object.fromEntries(STOCK_FAMILIES.map((f) => [f.key, f.ref]))
  );

  // Section 2 — Équipe
  const [nbEtp, setNbEtp] = useState(4);

  // Section 3 — Vente additionnelle
  const [tauxEstaly, setTauxEstaly] = useState(20);
  const [panierAcces, setPanierAcces] = useState(15);

  // Section 4 — Mix rayon (must sum to 100)
  const [mix, setMix] = useState<Record<string, number>>(DEFAULT_MIX);

  const load = useCallback(async () => {
    if (!magasinId) return;
    setLoadingCtx(true);
    const { data } = await supabase.from("v_dernieres_valeurs").select("*").eq("magasin_id", magasinId);

    type VRow = {
      indicateur_nom: string; valeur: number; unite: string | null;
      direction: "up" | "down"; seuil_ok: number | null; seuil_vigilance: number | null;
      categorie: string; poids: number; action_defaut: string | null;
      magasin_id: string; indicateur_id: string; date_saisie: string; magasin_nom: string;
    };

    const rows = ((data ?? []) as VRow[]).map((r) => ({
      ...r,
      status: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
    }));
    setValeurs(rows);

    const get = (partial: string) =>
      rows.find((r) => r.indicateur_nom.toLowerCase().includes(partial.toLowerCase()));

    const ca = get("chiffre")?.valeur ?? get(" ca ")?.valeur ?? get("CA ")?.valeur;
    const stock = get("valeur stock")?.valeur ?? get("stock total")?.valeur;
    const etp = get("nb etp")?.valeur ?? get("ETP")?.valeur;
    const marge = get("marge nette")?.valeur ?? get("taux de marge")?.valeur;

    const newCtx = {
      caAnnuel: ca ? ca * 12 : 500000,
      stockTotal: stock ?? STOCK_REF_TOTAL,
      nbEtp: etp ?? 4,
      tauxMarge: marge ?? 38,
    };
    setCtx(newCtx);
    setNbEtp(newCtx.nbEtp);

    // Scale stock families proportionally to actual total
    if (stock && stock !== STOCK_REF_TOTAL) {
      const ratio = stock / STOCK_REF_TOTAL;
      setStocks(Object.fromEntries(STOCK_FAMILIES.map((f) => [f.key, Math.round(f.ref * ratio)])));
    }

    setLoadingCtx(false);
  }, [magasinId]);

  useEffect(() => { load(); }, [load]);

  // ─── Section 1 calculations ───────────────────────────────
  const stockSimule = Object.values(stocks).reduce((a, b) => a + b, 0);
  const tresLibere = ctx.stockTotal - stockSimule;
  const margeAnnuelle = ctx.caAnnuel * (ctx.tauxMarge / 100);
  const gmroiActuel = ctx.stockTotal > 0 ? margeAnnuelle / ctx.stockTotal : 0;
  const gmroiSimule = stockSimule > 0 ? margeAnnuelle / stockSimule : 0;

  // ─── Section 2 calculations ───────────────────────────────
  const masseSalActuelle = ((ctx.nbEtp * SALAIRE_MOYEN) / ctx.caAnnuel) * 100;
  const masseSalSimulee = ((nbEtp * SALAIRE_MOYEN) / ctx.caAnnuel) * 100;
  const caParEtpSimule = ctx.caAnnuel / nbEtp;
  const ebeActuel = ctx.caAnnuel * (ctx.tauxMarge / 100) - ctx.caAnnuel * 0.13 - ctx.nbEtp * SALAIRE_MOYEN;
  const ebeSimule = ctx.caAnnuel * (ctx.tauxMarge / 100) - ctx.caAnnuel * 0.13 - nbEtp * SALAIRE_MOYEN;

  // ─── Section 3 calculations ───────────────────────────────
  const nbVentesAnnuelles = ctx.caAnnuel / 110;
  const nbEstalyContrats = Math.round(nbVentesAnnuelles * (tauxEstaly / 100));
  const margeEstaly = nbEstalyContrats * 80;
  const primeVendeurs = margeEstaly * 0.1;
  const accessoireCA = nbVentesAnnuelles * panierAcces;
  const margeAccessoire = accessoireCA * 0.4;
  const gainVenteAdd = margeEstaly + margeAccessoire;
  const impactMargeNette = ((gainVenteAdd) / ctx.caAnnuel) * 100;

  // ─── Section 4 calculations ───────────────────────────────
  const mixTotal = Object.values(mix).reduce((a, b) => a + b, 0);
  const margeSimuleeMix =
    MIX_FAMILIES.reduce((acc, f) => acc + (mix[f.key] / 100) * f.margePct, 0);
  const margeActuelleMix =
    MIX_FAMILIES.reduce((acc, f) => acc + (DEFAULT_MIX[f.key as keyof typeof DEFAULT_MIX] / 100) * f.margePct, 0);
  const impactMixAnnuel = ((margeSimuleeMix - margeActuelleMix) / 100) * ctx.caAnnuel;

  const handleMixChange = (key: string, newVal: number) => {
    const others = MIX_FAMILIES.filter((f) => f.key !== key);
    const oldVal = mix[key];
    const delta = newVal - oldVal;
    const totalOther = others.reduce((s, f) => s + mix[f.key], 0);
    const newMix = { ...mix, [key]: newVal };
    if (totalOther > 0) {
      others.forEach((f) => {
        newMix[f.key] = Math.max(0, Math.round(mix[f.key] - delta * (mix[f.key] / totalOther)));
      });
    }
    // Normalize to exactly 100
    const total = Object.values(newMix).reduce((a, b) => a + b, 0);
    if (total !== 100) {
      const diff = 100 - total;
      const lastKey = others[others.length - 1]?.key;
      if (lastKey) newMix[lastKey] = Math.max(0, newMix[lastKey] + diff);
    }
    setMix(newMix);
  };

  // ─── Summary ──────────────────────────────────────────────
  const summaryRows = [
    { label: "GMROI", actuel: gmroiActuel.toFixed(2), simule: gmroiSimule.toFixed(2), ecart: `${gmroiSimule >= gmroiActuel ? "+" : ""}${(gmroiSimule - gmroiActuel).toFixed(2)}`, impact: Math.round((gmroiSimule - gmroiActuel) * ctx.stockTotal * 0.1), unit: "" },
    { label: "Stock total", actuel: formatEuro(ctx.stockTotal), simule: formatEuro(stockSimule), ecart: formatEuro(tresLibere), impact: tresLibere, unit: "€ libérés" },
    { label: "Masse sal. %", actuel: `${masseSalActuelle.toFixed(1)}%`, simule: `${masseSalSimulee.toFixed(1)}%`, ecart: `${(masseSalSimulee - masseSalActuelle).toFixed(1)}pp`, impact: Math.round((masseSalActuelle - masseSalSimulee) / 100 * ctx.caAnnuel), unit: "" },
    { label: "EBE", actuel: formatEuro(ebeActuel), simule: formatEuro(ebeSimule), ecart: formatEuro(ebeSimule - ebeActuel), impact: Math.round(ebeSimule - ebeActuel), unit: "" },
    { label: "Ventes additionnelles", actuel: "—", simule: formatEuro(gainVenteAdd), ecart: `+${impactMargeNette.toFixed(1)} pts marge`, impact: Math.round(gainVenteAdd), unit: "" },
    { label: "Marge nette (mix)", actuel: `${margeActuelleMix.toFixed(1)}%`, simule: `${margeSimuleeMix.toFixed(1)}%`, ecart: `${impactMixAnnuel >= 0 ? "+" : ""}${(margeSimuleeMix - margeActuelleMix).toFixed(1)} pts`, impact: Math.round(impactMixAnnuel), unit: "" },
  ];

  if (loadingCtx) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-[13px]" style={{ color: "var(--textMuted)" }}>Chargement des données…</div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[15px] font-bold" style={{ color: "var(--text)" }}>Simulateur "Et si…"</div>
            <div className="text-[12px]" style={{ color: "var(--textMuted)" }}>
              Ajustez les curseurs — tous les calculs sont instantanés, sans appel réseau
            </div>
          </div>
          <div className="text-right text-[11px]" style={{ color: "var(--textDim)" }}>
            <div>CA annuel estimé : <strong style={{ color: "var(--text)" }}>{formatEuro(ctx.caAnnuel)}</strong></div>
            <div>Marge actuelle : <strong style={{ color: "var(--text)" }}>{ctx.tauxMarge}%</strong></div>
          </div>
        </div>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* ── SECTION 1 : STOCK ─────────────────────────── */}
        <div className="rounded-2xl p-5 border space-y-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <SectionTitle icon="📦" label="Stock par famille" />
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl text-center" style={{ background: "var(--surfaceAlt)" }}>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--textMuted)" }}>GMROI actuel</div>
              <div className="text-[20px] font-bold" style={{ color: gmroiActuel >= 3.84 ? "#00d4aa" : "#ff4d6a" }}>
                {gmroiActuel.toFixed(2)}
              </div>
              <div className="text-[10px]" style={{ color: "var(--textDim)" }}>réseau : 3.84</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--textMuted)" }}>GMROI simulé</div>
              <div className="text-[20px] font-bold" style={{ color: gmroiSimule >= 3.84 ? "#00d4aa" : "#ff4d6a" }}>
                {gmroiSimule.toFixed(2)}
              </div>
              <ImpactBadge value={Math.round((gmroiSimule - gmroiActuel) * ctx.stockTotal * 0.1)} />
            </div>
          </div>

          {STOCK_FAMILIES.map((f) => (
            <div key={f.key}>
              <div className="flex justify-between items-center mb-1">
                <div>
                  <span className="text-[12px] font-medium" style={{ color: "var(--text)" }}>{f.label}</span>
                  <span className="ml-2 text-[10px] rounded px-1.5 py-0.5" style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)" }}>
                    {f.delay}
                  </span>
                </div>
                <span className="text-[12px] font-bold" style={{ color: "var(--accent)" }}>
                  {formatEuro(stocks[f.key])}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.round(f.ref * 2)}
                step={500}
                value={stocks[f.key]}
                onChange={(e) => setStocks((s) => ({ ...s, [f.key]: Number(e.target.value) }))}
                style={{ width: "100%", accentColor: "var(--accent)" }}
              />
              <div className="flex justify-between text-[10px]" style={{ color: "var(--textDim)" }}>
                <span>0€ (réf: {formatEuro(f.ref)})</span>
                <span>Marge famille : {f.margePct}%</span>
              </div>
            </div>
          ))}

          <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <span className="text-[12px] font-bold" style={{ color: "var(--text)" }}>Stock total simulé</span>
            <div className="text-right">
              <div className="text-[14px] font-bold" style={{ color: "var(--accent)" }}>{formatEuro(stockSimule)}</div>
              <div className="text-[10px]" style={{ color: tresLibere >= 0 ? "#00d4aa" : "#ff4d6a" }}>
                {tresLibere >= 0 ? "+" : ""}{formatEuro(tresLibere)} vs actuel
              </div>
            </div>
          </div>
          <div className="text-[10px] p-2 rounded-lg" style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)" }}>
            Stock idéal réseau : {formatEuro(STOCK_REF_TOTAL)} — Bijouterie 40.5k€ · TLCE 30k€ · JV 22k€ · Informatique 8k€
          </div>
        </div>

        {/* ── SECTION 2 : ÉQUIPE ────────────────────────── */}
        <div className="rounded-2xl p-5 border space-y-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <SectionTitle icon="👥" label="Équipe" />

          <Slider
            label="Nombre d'ETP"
            value={nbEtp}
            min={1}
            max={ctx.nbEtp + 3}
            step={0.5}
            unit=" ETP"
            onChange={setNbEtp}
            color="#4da6ff"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ background: "var(--surfaceAlt)" }}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--textMuted)" }}>CA / ETP simulé</div>
              <div className="text-[16px] font-bold" style={{ color: caParEtpSimule >= 250000 ? "#00d4aa" : "#ff4d6a" }}>
                {formatEuro(Math.round(caParEtpSimule))}
              </div>
              <div className="text-[10px]" style={{ color: "var(--textDim)" }}>benchmark : 250k€/ETP</div>
              {pctBar(caParEtpSimule, 400000, caParEtpSimule >= 250000 ? "#00d4aa" : "#ff4d6a")}
            </div>
            <div className="rounded-xl p-3" style={{ background: "var(--surfaceAlt)" }}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--textMuted)" }}>Masse sal. simulée</div>
              <div className="text-[16px] font-bold" style={{ color: masseSalSimulee <= 15 ? "#00d4aa" : "#ff4d6a" }}>
                {masseSalSimulee.toFixed(1)}%
              </div>
              <div className="text-[10px]" style={{ color: "var(--textDim)" }}>cible : ≤15%</div>
              {pctBar(masseSalSimulee, 30, masseSalSimulee <= 15 ? "#00d4aa" : "#ff4d6a")}
            </div>
          </div>

          <div className="rounded-xl p-3" style={{ background: "var(--surfaceAlt)" }}>
            <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--textMuted)" }}>Impact EBE</div>
            <div className="flex justify-between">
              <div>
                <div className="text-[11px]" style={{ color: "var(--textDim)" }}>Actuel</div>
                <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>{formatEuro(ebeActuel)}</div>
                <div className="text-[10px]" style={{ color: "var(--textDim)" }}>({((ebeActuel / ctx.caAnnuel) * 100).toFixed(1)}%)</div>
              </div>
              <div className="text-[20px] flex items-center" style={{ color: "var(--textDim)" }}>→</div>
              <div>
                <div className="text-[11px]" style={{ color: "var(--textDim)" }}>Simulé</div>
                <div className="text-[14px] font-bold" style={{ color: ebeSimule >= 0 ? "#00d4aa" : "#ff4d6a" }}>{formatEuro(ebeSimule)}</div>
                <div className="text-[10px]" style={{ color: "var(--textDim)" }}>({((ebeSimule / ctx.caAnnuel) * 100).toFixed(1)}%)</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 3 : VENTE ADDITIONNELLE ──────────── */}
        <div className="rounded-2xl p-5 border space-y-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <SectionTitle icon="💳" label="Vente additionnelle" />

          <Slider
            label="Taux Estaly (% des ventes)"
            value={tauxEstaly}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={setTauxEstaly}
            sublabel={`≈ ${nbEstalyContrats} contrats/an · ${formatEuro(margeEstaly)} de marge`}
            color="#ffb347"
          />

          <Slider
            label="Panier moyen accessoire"
            value={panierAcces}
            min={0}
            max={50}
            step={1}
            unit="€"
            onChange={setPanierAcces}
            sublabel={`${formatEuro(margeAccessoire)} marge accessoires/an`}
            color="#a78bfa"
          />

          <div className="grid grid-cols-3 gap-2 pt-2">
            {[
              { label: "Marge Estaly", value: margeEstaly, color: "#ffb347" },
              { label: "Prime vendeurs", value: primeVendeurs, color: "#a78bfa" },
              { label: "Impact marge nette", value: gainVenteAdd, color: "#00d4aa" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl p-3 text-center" style={{ background: "var(--surfaceAlt)" }}>
                <div className="text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>{item.label}</div>
                <div className="text-[13px] font-bold" style={{ color: item.color }}>{formatEuro(item.value)}</div>
                <div className="text-[9px]" style={{ color: "var(--textDim)" }}>/an</div>
              </div>
            ))}
          </div>
          <div className="text-[11px] p-2 rounded-lg" style={{ background: "#ffb34718", color: "#ffb347" }}>
            +{impactMargeNette.toFixed(2)} pts de marge nette avec cette configuration
          </div>
        </div>

        {/* ── SECTION 4 : MIX RAYON ─────────────────────── */}
        <div className="rounded-2xl p-5 border space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <SectionTitle icon="🏪" label="Mix rayon" />
          <div className="text-[11px] mb-2" style={{ color: mixTotal === 100 ? "#00d4aa" : "#ff4d6a" }}>
            Total : {mixTotal}% {mixTotal !== 100 && "⚠ doit être 100%"}
          </div>

          {MIX_FAMILIES.map((f) => (
            <div key={f.key}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[12px] font-medium" style={{ color: "var(--text)" }}>
                  {f.label} <span className="text-[10px]" style={{ color: "var(--textDim)" }}>(marge {f.margePct}%)</span>
                </span>
                <span className="text-[13px] font-bold" style={{ color: f.color }}>{mix[f.key]}%</span>
              </div>
              <input
                type="range" min={0} max={80} step={1}
                value={mix[f.key]}
                onChange={(e) => handleMixChange(f.key, Number(e.target.value))}
                style={{ width: "100%", accentColor: f.color }}
              />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-xl p-3 text-center" style={{ background: "var(--surfaceAlt)" }}>
              <div className="text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Marge nette actuelle (mix)</div>
              <div className="text-[16px] font-bold" style={{ color: "var(--text)" }}>{margeActuelleMix.toFixed(1)}%</div>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: "var(--surfaceAlt)" }}>
              <div className="text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Marge nette simulée (mix)</div>
              <div className="text-[16px] font-bold" style={{ color: margeSimuleeMix >= margeActuelleMix ? "#00d4aa" : "#ff4d6a" }}>
                {margeSimuleeMix.toFixed(1)}%
              </div>
            </div>
          </div>
          <div className="text-center">
            <ImpactBadge value={Math.round(impactMixAnnuel)} />
          </div>
        </div>
      </div>

      {/* ── SUMMARY TABLE ─────────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <div className="px-5 py-3" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          <span className="text-[13px] font-bold" style={{ color: "var(--text)" }}>Récapitulatif de simulation</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surfaceAlt)" }}>
                {["Indicateur", "Actuel", "Simulé", "Écart", "Impact €/an"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--textMuted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row, i) => (
                <tr
                  key={row.label}
                  style={{ background: i % 2 === 0 ? "var(--surface)" : "var(--surfaceAlt)", borderTop: "1px solid var(--border)" }}
                >
                  <td className="px-4 py-2.5 text-[12px] font-medium" style={{ color: "var(--text)" }}>{row.label}</td>
                  <td className="px-4 py-2.5 text-[12px]" style={{ color: "var(--textMuted)" }}>{row.actuel}</td>
                  <td className="px-4 py-2.5 text-[12px] font-medium" style={{ color: "var(--text)" }}>{row.simule}</td>
                  <td className="px-4 py-2.5 text-[12px]" style={{ color: "var(--textMuted)" }}>{row.ecart}</td>
                  <td className="px-4 py-2.5">
                    <ImpactBadge value={row.impact} suffix={row.unit || "€/an"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { formatEuro } from "@/lib/hiddenCosts";

// ─── Types ─────────────────────────────────────────────────────
interface SimParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  default: number;
}

interface SimScenario {
  id: string;
  icon: string;
  title: string;
  description: string;
  params: SimParam[];
  compute: (params: Record<string, number>, context: SimContext) => SimResult;
}

interface SimContext {
  chvacv: number;
  caMensuel: number;
  nbEtp: number;
  valeurStock: number;
  tauxMarge: number;
}

interface SimResult {
  verdict: "rentable" | "non_rentable" | "conditionnel";
  headline: string;
  details: { label: string; value: string; positive?: boolean }[];
  conditions?: string[];
}

// ─── Scenarios ────────────────────────────────────────────────
const SCENARIOS: SimScenario[] = [
  {
    id: "embauche",
    icon: "👤",
    title: "Et si j'embauchais un salarié ?",
    description: "Calculez l'impact d'un nouveau collaborateur sur votre rentabilité.",
    params: [
      { key: "salaire_brut", label: "Salaire brut mensuel", min: 1500, max: 4000, step: 50, unit: "€", default: 2200 },
      { key: "heures_sem", label: "Heures / semaine", min: 20, max: 39, step: 1, unit: "h", default: 35 },
      { key: "gain_ca_pct", label: "Gain CA attendu", min: 0, max: 30, step: 1, unit: "%", default: 8 },
    ],
    compute(params, ctx) {
      const coutTotal = params.salaire_brut * 1.45; // charges patronales
      const caAdditionnel = ctx.caMensuel * (params.gain_ca_pct / 100);
      const margeAdditionnelle = caAdditionnel * (ctx.tauxMarge / 100);
      const gainNet = margeAdditionnelle - coutTotal;
      const roiMois = gainNet > 0 ? Math.ceil(coutTotal / (margeAdditionnelle - coutTotal + 0.01)) : null;
      return {
        verdict: gainNet > 0 ? "rentable" : gainNet > -500 ? "conditionnel" : "non_rentable",
        headline: gainNet > 0
          ? `+${formatEuro(gainNet)}/mois de marge nette`
          : `Déficit de ${formatEuro(Math.abs(gainNet))}/mois`,
        details: [
          { label: "Coût total employeur", value: `${formatEuro(coutTotal)}/mois`, positive: false },
          { label: "CA additionnel estimé", value: `${formatEuro(caAdditionnel)}/mois`, positive: true },
          { label: "Marge générée", value: `${formatEuro(margeAdditionnelle)}/mois`, positive: margeAdditionnelle > coutTotal },
          { label: "Gain net", value: `${gainNet >= 0 ? "+" : ""}${formatEuro(gainNet)}/mois`, positive: gainNet > 0 },
        ],
        conditions: gainNet <= 0 ? [
          `Besoin de +${formatEuro(coutTotal / (ctx.tauxMarge / 100))}/mois de CA pour rentabiliser`,
          `Soit +${Math.ceil(coutTotal / (ctx.tauxMarge / 100) / (ctx.caMensuel / 30))}€/jour supplémentaires`,
          roiMois ? `ROI en ${roiMois} mois si objectif CA atteint` : undefined,
        ].filter(Boolean) as string[] : undefined,
      };
    },
  },
  {
    id: "stock",
    icon: "📦",
    title: "Et si je réduisais mon stock ?",
    description: "Simulez la libération de trésorerie via la réduction du stock.",
    params: [
      { key: "reduction_pct", label: "Réduction du stock", min: 5, max: 50, step: 5, unit: "%", default: 20 },
      { key: "gmroi_actuel", label: "GMROI actuel", min: 1, max: 8, step: 0.1, unit: "", default: 2.5 },
    ],
    compute(params, ctx) {
      const cashLibere = ctx.valeurStock * (params.reduction_pct / 100);
      const newStock = ctx.valeurStock * (1 - params.reduction_pct / 100);
      const margeAnnuelle = ctx.caMensuel * 12 * (ctx.tauxMarge / 100);
      const newGmroi = newStock > 0 ? margeAnnuelle / newStock : 0;
      const gainGmroi = newGmroi - params.gmroi_actuel;
      const rendementCash = ctx.chvacv > 0 ? cashLibere / ctx.chvacv : null;
      return {
        verdict: cashLibere > 10000 && newGmroi > 3 ? "rentable" : "conditionnel",
        headline: `${formatEuro(cashLibere)} de trésorerie libérée`,
        details: [
          { label: "Cash libéré", value: formatEuro(cashLibere), positive: true },
          { label: "Nouveau stock moyen", value: formatEuro(newStock), positive: false },
          { label: "GMROI actuel → projeté", value: `${params.gmroi_actuel.toFixed(2)} → ${newGmroi.toFixed(2)}`, positive: gainGmroi > 0 },
          ...(rendementCash ? [{ label: "Équivaut à", value: `${rendementCash.toFixed(1)} heures CHVACV`, positive: true }] : []),
        ],
        conditions: newGmroi < 3 ? ["Vérifiez l'impact sur la gamme disponible", "Priorisez l'élimination du stock âgé > 90j"] : undefined,
      };
    },
  },
  {
    id: "tlac",
    icon: "📱",
    title: "Et si je passais le TLAC à 1.5 ?",
    description: "Impact d'une meilleure performance sur les ventes additionnelles (Trade-In).",
    params: [
      { key: "tlac_actuel", label: "TLAC actuel", min: 0.5, max: 2.5, step: 0.1, unit: "", default: 0.78 },
      { key: "tlac_cible", label: "TLAC cible", min: 0.8, max: 3, step: 0.1, unit: "", default: 1.5 },
      { key: "marge_tlac", label: "Marge par article additionnel", min: 10, max: 80, step: 5, unit: "€", default: 35 },
    ],
    compute(params, ctx) {
      const nbVentesEstim = ctx.caMensuel / 97.5; // panier moyen réseau
      const tlacGain = (params.tlac_cible - params.tlac_actuel) * nbVentesEstim;
      const margeAdditionnelle = tlacGain * params.marge_tlac;
      const tempsFormation = Math.round(tlacGain * 0.5); // 30min de coaching par vente à gagner
      const roiSemaines = margeAdditionnelle > 0 ? Math.ceil((tempsFormation * (ctx.chvacv / 60)) / (margeAdditionnelle / 4)) : 0;
      return {
        verdict: margeAdditionnelle > 0 ? "rentable" : "conditionnel",
        headline: `+${formatEuro(margeAdditionnelle)}/mois de marge additionnelle`,
        details: [
          { label: "Articles TLAC gagnés/mois", value: `+${Math.round(tlacGain)}`, positive: true },
          { label: "Marge additionnelle", value: `${formatEuro(margeAdditionnelle)}/mois`, positive: true },
          { label: "Formation estimée", value: `${tempsFormation}h de coaching`, positive: false },
          { label: "ROI formation", value: roiSemaines > 0 ? `${roiSemaines} semaines` : "Immédiat", positive: roiSemaines < 4 },
        ],
      };
    },
  },
  {
    id: "picea",
    icon: "🔋",
    title: "Et si je montais Picea à 100% ?",
    description: "Impact du diagnostic systématique sur les retours et la note Google.",
    params: [
      { key: "picea_actuel", label: "Taux Picea actuel", min: 0, max: 90, step: 5, unit: "%", default: 40 },
      { key: "nb_retours", label: "Retours / mois actuels", min: 0, max: 50, step: 1, unit: "", default: 12 },
      { key: "cout_retour", label: "Coût moyen par retour", min: 20, max: 200, step: 10, unit: "€", default: 60 },
    ],
    compute(params, ctx) {
      const gainPicea = (100 - params.picea_actuel) / 100;
      const retoursEvites = Math.round(params.nb_retours * gainPicea * 0.7); // 70% des retours liés à la batterie
      const economieMensuelle = retoursEvites * params.cout_retour;
      const noteImpact = retoursEvites > 5 ? "+0.2 à +0.4" : "+0.1";
      const heuresToimplementation = Math.round((100 - params.picea_actuel) / 10);
      void ctx;
      return {
        verdict: economieMensuelle > 200 ? "rentable" : "conditionnel",
        headline: `${formatEuro(economieMensuelle)}/mois économisé en retours`,
        details: [
          { label: "Retours évités / mois", value: `${retoursEvites}`, positive: true },
          { label: "Économie mensuelle", value: formatEuro(economieMensuelle), positive: true },
          { label: "Économie annuelle", value: formatEuro(economieMensuelle * 12), positive: true },
          { label: "Impact note Google estimé", value: noteImpact, positive: true },
          { label: "Mise en place", value: `${heuresToimplementation}h de formation`, positive: false },
        ],
      };
    },
  },
];

// ─── Slider component ─────────────────────────────────────────
function Slider({ param, value, onChange }: {
  param: SimParam;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - param.min) / (param.max - param.min)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[12px] font-medium" style={{ color: "var(--text)" }}>{param.label}</label>
        <span className="text-[13px] font-bold" style={{ color: "var(--accent)" }}>
          {param.step < 1 ? value.toFixed(1) : value}{param.unit}
        </span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute inset-x-0 h-1.5 rounded-full" style={{ background: "var(--surface)" }} />
        <div className="absolute h-1.5 rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
        <input
          type="range"
          min={param.min}
          max={param.max}
          step={param.step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-5"
          style={{ zIndex: 1 }}
        />
        <div
          className="absolute w-4 h-4 rounded-full border-2 shadow-md"
          style={{
            left: `calc(${pct}% - 8px)`,
            background: "var(--accent)",
            borderColor: "#fff",
            pointerEvents: "none",
          }}
        />
      </div>
      <div className="flex justify-between text-[9px] mt-0.5" style={{ color: "var(--textDim)" }}>
        <span>{param.min}{param.unit}</span>
        <span>{param.max}{param.unit}</span>
      </div>
    </div>
  );
}

// ─── Main Screen ───────────────────────────────────────────────
interface SimulateurScreenProps {
  magasinId: string;
}

export function SimulateurScreen({ magasinId }: SimulateurScreenProps) {
  const [activeScenario, setActiveScenario] = useState<string>("embauche");
  const [params, setParams] = useState<Record<string, Record<string, number>>>({});
  const [context, setContext] = useState<SimContext>({
    chvacv: 45,
    caMensuel: 200000,
    nbEtp: 5,
    valeurStock: 150000,
    tauxMarge: 38,
  });
  const [editingCtx, setEditingCtx] = useState(false);

  // Load context from localStorage
  useEffect(() => {
    if (!magasinId) return;
    try {
      const chvacvRaw = localStorage.getItem(`chvacv_${magasinId}`);
      if (chvacvRaw) {
        const d = JSON.parse(chvacvRaw);
        if (d.ca_annuel && d.nb_etp && d.heures_semaine && d.semaines_an) {
          const chvacv = ((d.ca_annuel - (d.cv_annuelles ?? 0)) / (d.nb_etp * d.heures_semaine * d.semaines_an));
          setContext(prev => ({
            ...prev,
            chvacv: Math.round(chvacv * 100) / 100,
            caMensuel: Math.round(d.ca_annuel / 12),
            nbEtp: d.nb_etp,
          }));
        }
      }
    } catch { /* ignore */ }
  }, [magasinId]);

  // Init params for each scenario
  useEffect(() => {
    const initial: Record<string, Record<string, number>> = {};
    SCENARIOS.forEach(s => {
      initial[s.id] = Object.fromEntries(s.params.map(p => [p.key, p.default]));
    });
    setParams(initial);
  }, []);

  const scenario = SCENARIOS.find(s => s.id === activeScenario);
  const scenarioParams = params[activeScenario] ?? {};
  const result = scenario && Object.keys(scenarioParams).length > 0
    ? scenario.compute(scenarioParams, context)
    : null;

  const verdictColors = {
    rentable: { color: "#00d4aa", bg: "#00d4aa18", border: "#00d4aa30", icon: "✅" },
    non_rentable: { color: "#ff4d6a", bg: "#ff4d6a18", border: "#ff4d6a30", icon: "❌" },
    conditionnel: { color: "#ffb347", bg: "#ffb34718", border: "#ffb34730", icon: "⚠️" },
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[18px] font-bold" style={{ color: "var(--text)" }}>Simulateur &ldquo;Et si...&rdquo;</div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--textMuted)" }}>
            Flight simulator — jouez avec les curseurs, voyez l&apos;impact en temps réel
          </div>
        </div>
        <button
          onClick={() => setEditingCtx(v => !v)}
          className="px-3 py-1.5 rounded-xl text-[11px] font-semibold border hover:opacity-90"
          style={{ borderColor: "var(--border)", color: "var(--textMuted)", background: "var(--surface)" }}
        >
          ⚙ Contexte magasin
        </button>
      </div>

      {/* Context editor */}
      {editingCtx && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 border grid grid-cols-2 gap-4 md:grid-cols-5"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          {([
            { key: "caMensuel", label: "CA mensuel", unit: "€" },
            { key: "nbEtp", label: "Nb ETP", unit: "" },
            { key: "valeurStock", label: "Valeur stock", unit: "€" },
            { key: "tauxMarge", label: "Taux marge", unit: "%" },
            { key: "chvacv", label: "CHVACV", unit: "€/h" },
          ] as const).map(f => (
            <div key={f.key}>
              <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>{f.label}</label>
              <input
                type="number"
                value={(context as unknown as Record<string, number>)[f.key]}
                onChange={e => setContext(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                className="w-full rounded-lg px-3 py-2 text-[13px] font-semibold border"
                style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
              />
              <span className="text-[10px]" style={{ color: "var(--textDim)" }}>{f.unit}</span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Scenario selector */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        {SCENARIOS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveScenario(s.id)}
            className="text-left rounded-2xl p-4 border transition-all hover:scale-[1.01]"
            style={{
              background: activeScenario === s.id ? "var(--accent)" : "var(--surface)",
              borderColor: activeScenario === s.id ? "var(--accent)" : "var(--border)",
              color: activeScenario === s.id ? "#000" : "var(--text)",
            }}
          >
            <div className="text-[20px] mb-1">{s.icon}</div>
            <div className="text-[12px] font-semibold leading-tight">{s.title}</div>
          </button>
        ))}
      </div>

      {/* Active scenario */}
      {scenario && (
        <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {/* Left: sliders */}
          <motion.div
            key={scenario.id}
            initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl p-6 border space-y-5"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div>
              <div className="text-[15px] font-bold mb-0.5" style={{ color: "var(--text)" }}>
                {scenario.icon} {scenario.title}
              </div>
              <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>{scenario.description}</div>
            </div>
            {scenario.params.map(param => (
              <Slider
                key={param.key}
                param={param}
                value={scenarioParams[param.key] ?? param.default}
                onChange={v => setParams(prev => ({
                  ...prev,
                  [scenario.id]: { ...prev[scenario.id], [param.key]: v },
                }))}
              />
            ))}
          </motion.div>

          {/* Right: results */}
          {result && (() => {
            const vc = verdictColors[result.verdict];
            return (
              <motion.div
                key={`${scenario.id}-result`}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                className="rounded-2xl p-6 border space-y-4"
                style={{ background: vc.bg, borderColor: vc.border }}
              >
                <div className="text-center">
                  <div className="text-[28px] mb-1">{vc.icon}</div>
                  <div className="text-[18px] font-bold" style={{ color: vc.color }}>{result.headline}</div>
                  <div className="text-[11px] mt-0.5 capitalize" style={{ color: "var(--textMuted)" }}>
                    {result.verdict.replace("_", " ")}
                  </div>
                </div>

                <div className="space-y-2">
                  {result.details.map((d, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--border)" }}>
                      <span className="text-[11px]" style={{ color: "var(--textMuted)" }}>{d.label}</span>
                      <span className="text-[12px] font-bold" style={{ color: d.positive ? "#00d4aa" : d.positive === false ? "#ff4d6a" : vc.color }}>
                        {d.value}
                      </span>
                    </div>
                  ))}
                </div>

                {result.conditions && result.conditions.length > 0 && (
                  <div className="rounded-xl p-3 space-y-1" style={{ background: "var(--surfaceAlt)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--textMuted)" }}>
                      Conditions / Risques
                    </div>
                    {result.conditions.map((c, i) => (
                      <div key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: "var(--text)" }}>
                        <span style={{ color: vc.color }}>→</span> {c}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

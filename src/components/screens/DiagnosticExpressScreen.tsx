"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { computeScore, getStatus } from "@/lib/scoring";
import { formatEuro } from "@/lib/hiddenCosts";

// ─── Types ─────────────────────────────────────────────────────
interface DiagResult {
  scoreEstime: number;
  gmroiEstime: number;
  chvacvEstimee: number;
  actionsPrioritaires: { action: string; impact: string; urgence: "haute" | "moyenne" | "faible" }[];
  pointsForts: string[];
  pointsFaibles: string[];
  coutsCaches: number;
}

function estimateDiag(answers: Record<string, number | string>): DiagResult {
  const ca = (answers.ca_mensuel as number) ?? 150000;
  const etp = (answers.nb_salaries as number) ?? 5;
  const stock = (answers.valeur_stock as number) ?? 120000;
  const stockAge = (answers.pct_stock_age as number) ?? 20;
  const marge = (answers.taux_marge as number) ?? 38;
  const noteGoogle = (answers.note_google as number) ?? 4.2;
  const tlac = answers.tlac_systematique as string;
  const picea = answers.picea_utilise as string;
  const probleme = answers.probleme_principal as string;
  const retours = (answers.nb_retours_mois as number) ?? 8;

  // GMROI estimate
  const margeAnnuelle = ca * 12 * (marge / 100);
  const gmroiEstime = stock > 0 ? Math.round((margeAnnuelle / stock) * 100) / 100 : 0;

  // CHVACV estimate (charges ~45% du CA)
  const chargesEstim = ca * 12 * 0.45;
  const chvacvEstimee = etp > 0 ? Math.round(((ca * 12 - chargesEstim) / (etp * 35 * 46)) * 10) / 10 : 0;

  // Score estimé (simplified)
  const kpiScores = [
    getStatus(marge, "up", 35, 30),
    getStatus(stockAge, "down", 30, 40),
    getStatus(gmroiEstime, "up", 3.5, 2.5),
    getStatus(noteGoogle, "up", 4.5, 4),
    getStatus(ca / etp / 1000, "up", 20, 15), // CA/ETP en k€
    tlac === "oui" ? "ok" : tlac === "un_peu" ? "wn" : "dg",
    picea === "oui" ? "ok" : picea === "partiellement" ? "wn" : "dg",
    getStatus(retours, "down", 10, 20),
  ] as ("ok" | "wn" | "dg")[];

  const okCount = kpiScores.filter(s => s === "ok").length;
  const scoreEstime = Math.round((okCount / kpiScores.length) * 85 + 5);
  void computeScore; // available if needed

  // Coûts cachés
  const stockAgeCout = stock * (stockAge / 100) * 0.15; // 15% de perte sur stock âgé
  const retoursCout = retours * 60 * 12;
  const tlacCout = tlac !== "oui" ? (ca * 12 * 0.05) : 0;
  const coutsCaches = Math.round(stockAgeCout + retoursCout + tlacCout);

  // Points forts
  const pointsForts: string[] = [];
  if (marge >= 35) pointsForts.push(`Taux de marge solide (${marge}%)`);
  if (noteGoogle >= 4.5) pointsForts.push(`Excellente note Google (${noteGoogle}/5)`);
  if (stockAge <= 20) pointsForts.push(`Stock âgé maîtrisé (${stockAge}%)`);
  if (gmroiEstime >= 3.5) pointsForts.push(`GMROI performant (${gmroiEstime})`);
  if (tlac === "oui") pointsForts.push("TLAC systématique — bonne pratique");
  if (picea === "oui") pointsForts.push("Picea 100% — zéro retour batterie");

  // Points faibles
  const pointsFaibles: string[] = [];
  if (marge < 35) pointsFaibles.push(`Marge insuffisante (${marge}% vs 38-39% réseau)`);
  if (stockAge > 30) pointsFaibles.push(`Stock âgé critique (${stockAge}% vs ≤30% réseau)`);
  if (gmroiEstime < 2.5) pointsFaibles.push(`GMROI alarmant (${gmroiEstime} vs 3.84 réseau)`);
  if (noteGoogle < 4.5) pointsFaibles.push(`Note Google à améliorer (${noteGoogle}/5)`);
  if (tlac !== "oui") pointsFaibles.push("TLAC non systématique — manque à gagner");
  if (picea !== "oui") pointsFaibles.push("Picea incomplet — risque retours");

  // Actions prioritaires
  const actions: DiagResult["actionsPrioritaires"] = [];
  if (stockAge > 30) actions.push({
    action: "Lancer un déstockage accéléré sur stock > 60j",
    impact: `Libérer ~${formatEuro(stock * (stockAge / 100) * 0.5)} de trésorerie`,
    urgence: "haute",
  });
  if (tlac !== "oui") actions.push({
    action: "Formation TLAC systématique pour tous les vendeurs",
    impact: `+${formatEuro(ca * 0.05)}/mois de marge estimée`,
    urgence: stockAge > 30 ? "moyenne" : "haute",
  });
  if (picea !== "oui") actions.push({
    action: "Déployer Picea sur 100% des téléphones achetés",
    impact: `Éviter ~${retours * 7} retours/an, économie ~${formatEuro(retours * 7 * 60)}`,
    urgence: "haute",
  });
  if (marge < 35) actions.push({
    action: "Audit des prix d'achat vs cote EasyPrice",
    impact: `+${(38 - marge).toFixed(1)}% de marge = +${formatEuro(ca * (38 - marge) / 100)}/mois`,
    urgence: "haute",
  });
  if (probleme === "tréso") actions.push({
    action: "Accélérer la rotation : promotions sur slow-movers",
    impact: "Libérer du cash immédiatement",
    urgence: "haute",
  });

  return {
    scoreEstime,
    gmroiEstime,
    chvacvEstimee,
    actionsPrioritaires: actions.slice(0, 3),
    pointsForts: pointsForts.slice(0, 3),
    pointsFaibles: pointsFaibles.slice(0, 3),
    coutsCaches,
  };
}

// ─── Slider ───────────────────────────────────────────────────
function QuickSlider({ label, min, max, step, value, unit, onChange }: {
  label: string; min: number; max: number; step: number; value: number; unit: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{label}</span>
        <span className="text-[14px] font-bold" style={{ color: "var(--accent)" }}>{value}{unit}</span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute inset-x-0 h-2 rounded-full" style={{ background: "var(--surface)" }} />
        <div className="absolute h-2 rounded-full" style={{ width: `${pct}%`, background: "var(--accent)" }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-6" style={{ zIndex: 1 }} />
        <div className="absolute w-5 h-5 rounded-full border-2 shadow"
          style={{ left: `calc(${pct}% - 10px)`, background: "var(--accent)", borderColor: "#fff", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

// ─── Pill choice ──────────────────────────────────────────────
function PillChoice({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button key={opt.value} onClick={() => onChange(opt.value)}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold border transition-all"
            style={{
              background: value === opt.value ? "var(--accent)" : "var(--surface)",
              borderColor: value === opt.value ? "var(--accent)" : "var(--border)",
              color: value === opt.value ? "#000" : "var(--textMuted)",
            }}>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────
export function DiagnosticExpressScreen() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | string>>({
    ca_mensuel: 150000,
    nb_salaries: 5,
    valeur_stock: 120000,
    pct_stock_age: 20,
    taux_marge: 38,
    note_google: 4.2,
    probleme_principal: "rien",
    nb_retours_mois: 8,
    tlac_systematique: "un_peu",
    picea_utilise: "partiellement",
  });
  const [result, setResult] = useState<DiagResult | null>(null);

  const STEPS = [
    {
      q: "CA mensuel moyen",
      key: "ca_mensuel",
      type: "slider",
      min: 50000, max: 500000, step: 10000, unit: "€",
    },
    {
      q: "Nombre de salariés (ETP)",
      key: "nb_salaries",
      type: "slider",
      min: 1, max: 20, step: 1, unit: "",
    },
    {
      q: "Valeur du stock actuel",
      key: "valeur_stock",
      type: "slider",
      min: 20000, max: 400000, step: 5000, unit: "€",
    },
    {
      q: "% de stock âgé (> 60j, estimation)",
      key: "pct_stock_age",
      type: "slider",
      min: 0, max: 60, step: 5, unit: "%",
    },
    {
      q: "Taux de marge brute",
      key: "taux_marge",
      type: "slider",
      min: 20, max: 55, step: 1, unit: "%",
    },
    {
      q: "Note Google",
      key: "note_google",
      type: "slider",
      min: 1, max: 5, step: 0.1, unit: "/5",
    },
    {
      q: "Votre plus gros problème en ce moment ?",
      key: "probleme_principal",
      type: "choice",
      options: [
        { value: "tréso", label: "💸 Trésorerie" },
        { value: "ventes", label: "📉 Ventes" },
        { value: "stock", label: "📦 Stock" },
        { value: "equipe", label: "👥 Équipe" },
        { value: "rien", label: "✅ Aucun" },
      ],
    },
    {
      q: "Retours clients estimés par mois",
      key: "nb_retours_mois",
      type: "slider",
      min: 0, max: 50, step: 1, unit: "",
    },
    {
      q: "Les vendeurs font-ils du TLAC systématiquement ?",
      key: "tlac_systematique",
      type: "choice",
      options: [
        { value: "oui", label: "✅ Oui, toujours" },
        { value: "un_peu", label: "⚠️ Parfois" },
        { value: "non", label: "❌ Rarement" },
      ],
    },
    {
      q: "Utilisez-vous Picea sur tous les téléphones achetés ?",
      key: "picea_utilise",
      type: "choice",
      options: [
        { value: "oui", label: "✅ 100%" },
        { value: "partiellement", label: "⚠️ Partiellement" },
        { value: "non", label: "❌ Non" },
      ],
    },
  ];

  const currentStep = STEPS[step];
  const progress = result ? 100 : ((step) / STEPS.length) * 100;
  const scoreColor = (s: number) => s >= 70 ? "#00d4aa" : s >= 45 ? "#ffb347" : "#ff4d6a";

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      setResult(estimateDiag(answers));
    }
  };

  const handleReset = () => { setStep(0); setResult(null); };

  if (result) {
    const sc = scoreColor(result.scoreEstime);
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="text-[18px] font-bold" style={{ color: "var(--text)" }}>🔬 Diagnostic Express — Résultats</div>
          <button onClick={handleReset} className="px-4 py-2 rounded-xl text-[12px] border hover:opacity-80"
            style={{ borderColor: "var(--border)", color: "var(--textMuted)", background: "var(--surface)" }}>
            ↺ Nouveau diagnostic
          </button>
        </div>

        {/* Score + KPIs clés */}
        <div className="grid gap-4" style={{ gridTemplateColumns: "auto 1fr" }}>
          <div className="rounded-2xl p-6 flex flex-col items-center justify-center border"
            style={{ background: "var(--surface)", borderColor: `${sc}30`, minWidth: 160 }}>
            <div className="text-[48px] font-black" style={{ color: sc }}>{result.scoreEstime}</div>
            <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--textMuted)" }}>Score estimé</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-[18px] font-bold" style={{ color: result.gmroiEstime >= 3.5 ? "#00d4aa" : result.gmroiEstime >= 2.5 ? "#ffb347" : "#ff4d6a" }}>
                  {result.gmroiEstime.toFixed(2)}
                </div>
                <div className="text-[9px]" style={{ color: "var(--textMuted)" }}>GMROI estimé</div>
                <div className="text-[9px]" style={{ color: "var(--textDim)" }}>Réseau: 3.84</div>
              </div>
              <div>
                <div className="text-[18px] font-bold" style={{ color: "var(--accent)" }}>{result.chvacvEstimee}€/h</div>
                <div className="text-[9px]" style={{ color: "var(--textMuted)" }}>CHVACV estimée</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 content-start" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {/* Coûts cachés */}
            <div className="rounded-2xl p-4 border" style={{ background: "#ff4d6a10", borderColor: "#ff4d6a30" }}>
              <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: "#ff4d6a" }}>
                💸 Coûts cachés estimés
              </div>
              <div className="text-[22px] font-black" style={{ color: "#ff4d6a" }}>
                {formatEuro(result.coutsCaches)}/an
              </div>
              <div className="text-[10px] mt-1" style={{ color: "var(--textMuted)" }}>
                À recycler via le PAP
              </div>
            </div>

            {/* Points forts */}
            <div className="rounded-2xl p-4 border" style={{ background: "#00d4aa08", borderColor: "#00d4aa30" }}>
              <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "#00d4aa" }}>
                ✅ Points forts
              </div>
              {result.pointsForts.length > 0
                ? result.pointsForts.map((p, i) => (
                    <div key={i} className="text-[11px] mb-1" style={{ color: "var(--text)" }}>• {p}</div>
                  ))
                : <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>À identifier</div>
              }
            </div>

            {/* Points faibles */}
            <div className="rounded-2xl p-4 border col-span-2" style={{ background: "#ff4d6a08", borderColor: "#ff4d6a20" }}>
              <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "#ff4d6a" }}>
                ⚠️ Points à améliorer
              </div>
              <div className="grid gap-1" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {result.pointsFaibles.map((p, i) => (
                  <div key={i} className="text-[11px]" style={{ color: "var(--text)" }}>• {p}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Actions prioritaires */}
        <div className="space-y-3">
          <div className="text-[13px] font-bold" style={{ color: "var(--text)" }}>🎯 3 Actions prioritaires</div>
          {result.actionsPrioritaires.map((a, i) => {
            const urgColor = a.urgence === "haute" ? "#ff4d6a" : a.urgence === "moyenne" ? "#ffb347" : "#8b8fa3";
            return (
              <motion.div key={i}
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                className="flex items-start gap-4 p-4 rounded-2xl border"
                style={{ background: "var(--surface)", borderColor: `${urgColor}30` }}>
                <div className="text-[18px] font-black shrink-0" style={{ color: urgColor }}>P{i + 1}</div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold mb-0.5" style={{ color: "var(--text)" }}>{a.action}</div>
                  <div className="text-[11px]" style={{ color: urgColor }}>→ {a.impact}</div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="rounded-xl p-4 text-center text-[12px]" style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)" }}>
          💡 Ce diagnostic est une estimation basée sur vos 10 réponses. Complétez les KPIs pour un score précis.
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="text-[18px] font-bold mb-1" style={{ color: "var(--text)" }}>🔬 Diagnostic Express</div>
        <div className="text-[12px]" style={{ color: "var(--textMuted)" }}>
          10 questions • 3 minutes • Diagnostic complet estimé
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex justify-between text-[11px] mb-1.5" style={{ color: "var(--textMuted)" }}>
          <span>Question {step + 1} / {STEPS.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface)" }}>
          <motion.div className="h-full rounded-full" style={{ background: "var(--accent)" }}
            animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
        </div>
      </div>

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className="rounded-2xl p-8 border space-y-6"
          style={{ background: "var(--surface)", borderColor: "var(--border)", minHeight: 200 }}
        >
          <div className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>
            {currentStep.q}
          </div>

          {currentStep.type === "slider" && (
            <QuickSlider
              label=""
              min={currentStep.min!}
              max={currentStep.max!}
              step={currentStep.step!}
              unit={currentStep.unit!}
              value={answers[currentStep.key] as number}
              onChange={v => setAnswers(prev => ({ ...prev, [currentStep.key]: v }))}
            />
          )}

          {currentStep.type === "choice" && (
            <PillChoice
              label=""
              options={currentStep.options!}
              value={answers[currentStep.key] as string}
              onChange={v => setAnswers(prev => ({ ...prev, [currentStep.key]: v }))}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
          className="px-5 py-2.5 rounded-xl text-[13px] font-semibold border disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--textMuted)", background: "var(--surface)" }}
        >
          ← Précédent
        </button>
        <button
          onClick={handleNext}
          className="px-6 py-2.5 rounded-xl text-[13px] font-semibold transition-all hover:opacity-90 active:scale-95"
          style={{ background: "var(--accent)", color: "#000" }}
        >
          {step < STEPS.length - 1 ? "Suivant →" : "🔍 Générer le diagnostic"}
        </button>
      </div>
    </div>
  );
}

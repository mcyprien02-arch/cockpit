"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── KPI Context from localStorage ───────────────────────────
interface KPIContext {
  stockAge: number;
  valeurStock: number;
  tresorerie: number;
  marge: number;
  ca: number;
  seuilTresorerie: number;
}

function loadKPIContext(magasinId: string): KPIContext | null {
  try {
    const chvRaw = localStorage.getItem(`chvacv_${magasinId}`);
    const chv = chvRaw ? JSON.parse(chvRaw) : {};
    const kpiRaw = localStorage.getItem(`kpi_snapshot_${magasinId}`);
    const kpi = kpiRaw ? JSON.parse(kpiRaw) : {};
    const m = { ...chv, ...kpi };
    if (!m.valeurStock && !m.ca && !m.ca_annuel) return null;
    return {
      stockAge:        m.tauxStockAge ?? m.stockAge ?? 25,
      valeurStock:     m.valeurStock ?? m.stock_value ?? 150000,
      tresorerie:      m.tresoActuelle ?? m.tresorerie ?? 20000,
      marge:           m.tauxMarge ?? m.marge ?? 37,
      ca:              m.ca_mensuel ?? (m.ca_annuel ? m.ca_annuel / 12 : null) ?? 80000,
      seuilTresorerie: m.seuilTension ?? 8000,
    };
  } catch { return null; }
}

// ─── Stock thresholds réseau (GRILLE_STOCK_2024) ─────────────
const STOCK_SEUILS = [
  { famille: "BIJOUTERIE",  mini: 25500,  ideal: 38000,  maxi: 62500  },
  { famille: "JEUX VIDEO",  mini: 18000,  ideal: 24000,  maxi: 33000  },
  { famille: "TELEPHONIE",  mini: 37000,  ideal: 42500,  maxi: 58000  },
  { famille: "INFORMATIQUE",mini: 14000,  ideal: 21000,  maxi: 26500  },
  { famille: "LS",          mini: 3300,   ideal: 4250,   maxi: 5000   },
  { famille: "LIVRES",      mini: 2200,   ideal: 3000,   maxi: 5200   },
  { famille: "PHOTO",       mini: 2000,   ideal: 2500,   maxi: 4500   },
  { famille: "HIFI SALON",  mini: 2500,   ideal: 3500,   maxi: 4500   },
  { famille: "TV",          mini: 2000,   ideal: 2500,   maxi: 4000   },
  { famille: "EPET",        mini: 1500,   ideal: 2500,   maxi: 4000   },
];
const TOTAL_SEUILS = { mini: 108000, ideal: 143750, maxi: 207200 };

// ─── Types ────────────────────────────────────────────────────
type ScenarioId = "destockage" | "achats" | "promo";
type Gamme = "Téléphonie" | "Jeux vidéo" | "Bijouterie" | "Multimédia" | "Autre";
type TypePromo = "Semaine -20%" | "Weekend flash" | "Lot 3 pour 2";
type Verdict = "recommande" | "attendre" | "risque";

interface ResultatScenario {
  verdict: Verdict;
  lignes: { label: string; valeur: string; color?: string }[];
  conseil: string;
}

// ─── Calculations ─────────────────────────────────────────────
function calcDestockage(ctx: KPIContext, remise: number, nbProduits: number): ResultatScenario {
  const vieuxStock = (ctx.stockAge / 100) * ctx.valeurStock;
  const tresoRecuperee = Math.round(vieuxStock * (remise / 100) * 0.7);
  const margeSacrifiee = Math.round(vieuxStock * (remise / 100) * 0.3);
  const delaiEstime = Math.round(30 * (1 - (remise / 100) * 0.6));

  let verdict: Verdict;
  let conseil: string;
  if (ctx.stockAge < 15) {
    verdict = "attendre";
    conseil = "Stock âgé déjà sain (< 15%). Un déstockage agressif n'est pas nécessaire maintenant.";
  } else if (ctx.tresorerie < ctx.seuilTresorerie) {
    verdict = "recommande";
    conseil = "Trésorerie sous le seuil critique → déstockage recommandé pour libérer du cash rapidement.";
  } else {
    verdict = "recommande";
    conseil = "Stock âgé significatif → rotation accélérée améliorera votre GMROI.";
  }

  return {
    verdict, conseil,
    lignes: [
      { label: "Trésorerie récupérée estimée", valeur: `+${tresoRecuperee.toLocaleString("fr-FR")}€`, color: "#00d4aa" },
      { label: "Marge sacrifiée",              valeur: `-${margeSacrifiee.toLocaleString("fr-FR")}€`,  color: "#ff4d6a" },
      { label: "Délai de rotation estimé",     valeur: `~${delaiEstime} jours`,                        color: "#ffb347" },
      { label: "Produits concernés",           valeur: `~${nbProduits}`,                               color: undefined },
    ],
  };
}

const MARGE_PAR_GAMME: Record<Gamme, number> = {
  "Téléphonie": 32, "Jeux vidéo": 38, "Bijouterie": 48, "Multimédia": 30, "Autre": 35,
};

function calcAchats(ctx: KPIContext, budget: number, gamme: Gamme): ResultatScenario {
  const txMarge = MARGE_PAR_GAMME[gamme] / 100;
  const margeAttendue = Math.round(budget * txMarge * 3.5);
  const rotationJ30 = Math.round((budget / (ctx.ca / 30)) * 15);
  const risqueTreso = budget / ctx.tresorerie;
  let verdict: Verdict;
  let conseil: string;
  if (risqueTreso > 0.4) {
    verdict = "risque";
    conseil = "Budget > 40% de la trésorerie — risque de tension cash élevé. Échelonnez.";
  } else if (risqueTreso > 0.2) {
    verdict = "attendre";
    conseil = "Budget significatif. Envisagez d'étaler les achats sur 2 semaines.";
  } else {
    verdict = "recommande";
    conseil = `Gamme ${gamme} à ${MARGE_PAR_GAMME[gamme]}% de marge — bon rapport risque/rendement.`;
  }
  const risqueLabel = risqueTreso > 0.4 ? "Élevé" : risqueTreso > 0.2 ? "Modéré" : "Faible";
  const risqueColor = risqueTreso > 0.4 ? "#ff4d6a" : risqueTreso > 0.2 ? "#ffb347" : "#00d4aa";
  return {
    verdict, conseil,
    lignes: [
      { label: "Marge attendue (12 mois)",  valeur: `+${margeAttendue.toLocaleString("fr-FR")}€`, color: "#00d4aa" },
      { label: "Délai de vente estimé",     valeur: `~${rotationJ30} jours`,                      color: "#ffb347" },
      { label: "Risque trésorerie",          valeur: risqueLabel,                                  color: risqueColor },
      { label: "Taux de marge gamme",        valeur: `${MARGE_PAR_GAMME[gamme]}%`,                color: undefined },
    ],
  };
}

function calcPromo(ctx: KPIContext, type: TypePromo, rayons: string[]): ResultatScenario {
  const BOOST: Record<TypePromo, { ca: number; marge: number; conseil: string }> = {
    "Semaine -20%":  { ca: 0.25, marge: -0.08, conseil: "Idéal pour les gammes à fort stock âgé." },
    "Weekend flash": { ca: 0.40, marge: -0.05, conseil: "Impact max sur 2 jours — préparez la comm 48h avant." },
    "Lot 3 pour 2":  { ca: 0.30, marge: -0.10, conseil: "Efficace sur les accessoires et petits prix." },
  };
  const b = BOOST[type];
  const caSupp = Math.round(ctx.ca * b.ca * (rayons.length > 0 ? Math.min(1, rayons.length / 3) : 0.5));
  const impactMarge = Math.round(caSupp * (ctx.marge / 100 + b.marge));
  const momentOptimal = ctx.stockAge > 35 ? "Maintenant — stock âgé élevé, liquidez" : ctx.stockAge > 20 ? "Semaine prochaine" : "Attendez — stock sain";
  return {
    verdict: ctx.stockAge > 25 ? "recommande" : "attendre",
    conseil: b.conseil,
    lignes: [
      { label: "CA supplémentaire estimé", valeur: `+${caSupp.toLocaleString("fr-FR")}€`,         color: "#00d4aa" },
      { label: "Impact marge",             valeur: `${impactMarge >= 0 ? "+" : ""}${impactMarge.toLocaleString("fr-FR")}€`, color: impactMarge >= 0 ? "#00d4aa" : "#ff4d6a" },
      { label: "Moment optimal",           valeur: momentOptimal,                                   color: "#ffb347" },
      { label: "Rayons sélectionnés",      valeur: rayons.length > 0 ? rayons.join(", ") : "Tout le magasin", color: undefined },
    ],
  };
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const cfg = {
    recommande: { color: "#00d4aa", bg: "#00d4aa15", label: "✓ Action recommandée" },
    attendre:   { color: "#ffb347", bg: "#ffb34715", label: "⚠ À peser — attendre" },
    risque:     { color: "#ff4d6a", bg: "#ff4d6a15", label: "✗ Risqué — prudence" },
  }[verdict];
  return (
    <div className="rounded-xl px-4 py-2.5 text-[13px] font-bold"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
      {cfg.label}
    </div>
  );
}

const RAYONS = ["Téléphonie", "Jeux vidéo", "Bijouterie", "Multimédia", "Électroménager", "Autre"];

type Section = "stock" | "equipe" | "vente" | "mix";

interface SimulateurScreenProps { magasinId: string }

export function SimulateurScreen({ magasinId }: SimulateurScreenProps) {
  const [ctx, setCtx] = useState<KPIContext | null>(null);
  const [scenario, setScenario] = useState<ScenarioId | null>(null);
  const [resultat, setResultat] = useState<ResultatScenario | null>(null);
  const [planValidated, setPlanValidated] = useState(false);
  const [profilNiveau, setProfilNiveau] = useState(1);
  const [remise, setRemise] = useState(20);
  const [nbProduits, setNbProduits] = useState(30);
  const [budgetAchats, setBudgetAchats] = useState(5000);
  const [gamme, setGamme] = useState<Gamme>("Téléphonie");
  const [typePromo, setTypePromo] = useState<TypePromo>("Semaine -20%");
  const [rayonsSelected, setRayonsSelected] = useState<string[]>([]);
  // Section visibility
  const [sections, setSections] = useState<Record<Section, boolean>>({ stock: true, equipe: true, vente: true, mix: false });
  // Équipe simulation
  const [nbEtp, setNbEtp] = useState(3);
  const [salaireMoyenK, setSalaireMoyenK] = useState(28);
  // Vente additionnelle
  const [contratsEstaly, setContratsEstaly] = useState(1);
  const [margeMoyEstaly, setMargeMoyEstaly] = useState(8);
  const [accessPctCA, setAccessPctCA] = useState(8);

  useEffect(() => {
    setCtx(loadKPIContext(magasinId));
    try {
      const p = localStorage.getItem("profilMaturite");
      if (p) {
        const pd = JSON.parse(p);
        const n = pd.anciennete > 5 && pd.aise === "expert" ? 3 : pd.anciennete >= 2 && pd.aise !== "debutant" ? 2 : 1;
        setProfilNiveau(n);
      }
    } catch { /* ignore */ }
  }, [magasinId]);

  const compute = useCallback(() => {
    if (!ctx || !scenario) return;
    if (scenario === "destockage") setResultat(calcDestockage(ctx, remise, nbProduits));
    if (scenario === "achats")     setResultat(calcAchats(ctx, budgetAchats, gamme));
    if (scenario === "promo")      setResultat(calcPromo(ctx, typePromo, rayonsSelected));
  }, [ctx, scenario, remise, nbProduits, budgetAchats, gamme, typePromo, rayonsSelected]);

  useEffect(() => { if (scenario && ctx) compute(); }, [scenario, remise, nbProduits, budgetAchats, gamme, typePromo, rayonsSelected, compute]);

  const validatePlan = () => {
    if (!resultat || !scenario) return;
    try {
      const existing = JSON.parse(localStorage.getItem(`sim_actions_${magasinId}`) ?? "[]");
      localStorage.setItem(`sim_actions_${magasinId}`, JSON.stringify([
        { id: `sim_${Date.now()}`, scenario, verdict: resultat.verdict, conseil: resultat.conseil, createdAt: new Date().toISOString() },
        ...existing,
      ]));
    } catch { /* ignore */ }
    setPlanValidated(true);
    setTimeout(() => setPlanValidated(false), 2500);
  };

  const toggleRayon = (r: string) =>
    setRayonsSelected(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);

  if (!ctx) {
    return (
      <div className="rounded-2xl p-10 text-center" style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}>
        <div className="text-[36px] mb-3">📊</div>
        <div className="text-[15px] font-semibold mb-2" style={{ color: "var(--text)" }}>Simulateur non disponible</div>
        <div className="text-[12px]" style={{ color: "var(--textMuted)" }}>
          Saisis d'abord tes KPIs dans Verdict pour activer le simulateur.
        </div>
      </div>
    );
  }

  const SCENARIOS = [
    { id: "destockage" as ScenarioId, icon: "🧊", title: "Déstockage express",       desc: "Impact d'une remise sur le vieux stock" },
    { id: "achats"     as ScenarioId, icon: "🛒", title: "Réorientation des achats",  desc: "Choisir une gamme et un budget" },
    { id: "promo"      as ScenarioId, icon: "🎯", title: "Opération promotionnelle",  desc: "Estimer l'impact d'une action commerciale" },
  ];

  // ── Équipe calc ───────────────────────────────────────────────
  const masseSal = ctx ? Math.round((nbEtp * salaireMoyenK * 1000) / (ctx.ca * 12) * 100) : 0;
  const masseSalBefore = ctx ? Math.round((nbEtp * salaireMoyenK * 1000) / (ctx.ca * 12) * 100) : 0;

  // ── Estaly calc ───────────────────────────────────────────────
  const estalayAn = Math.round(contratsEstaly * 250 * margeMoyEstaly);
  const accessAn  = ctx ? Math.round(ctx.ca * 12 * (accessPctCA / 100) * (ctx.marge / 100)) : 0;

  // ── Recap table ───────────────────────────────────────────────
  const recapRows: { ind: string; avant: string; apres: string; ecart: string; formule: string }[] = [];
  if (ctx && resultat) {
    if (scenario === "destockage") {
      const vieuxStock = Math.round((ctx.stockAge / 100) * ctx.valeurStock);
      const newStock   = ctx.valeurStock - vieuxStock;
      recapRows.push(
        { ind: "Valeur stock", avant: `${ctx.valeurStock.toLocaleString("fr-FR")}€`, apres: `${newStock.toLocaleString("fr-FR")}€`, ecart: `-${vieuxStock.toLocaleString("fr-FR")}€`, formule: `Stock âgé (${ctx.stockAge}%) × Stock total` },
        { ind: "GMROI",  avant: ctx.valeurStock > 0 ? ((ctx.ca * 12 * ctx.marge / 100) / ctx.valeurStock).toFixed(2) : "—", apres: newStock > 0 ? ((ctx.ca * 12 * ctx.marge / 100) / newStock).toFixed(2) : "—", ecart: "↑", formule: "Marge annuelle ÷ Stock" },
      );
    }
    if (scenario === "achats") {
      recapRows.push({ ind: "Budget engagé", avant: "0€", apres: `${budgetAchats.toLocaleString("fr-FR")}€`, ecart: `+${budgetAchats.toLocaleString("fr-FR")}€`, formule: "Budget rachat direct" });
    }
  }
  if (ctx && sections.equipe) {
    recapRows.push({ ind: "Masse salariale", avant: `${masseSalBefore}%`, apres: `${masseSal}%`, ecart: `${masseSal - masseSalBefore >= 0 ? "+" : ""}${masseSal - masseSalBefore}pts`, formule: `${nbEtp} ETP × ${salaireMoyenK}k€ ÷ CA mensuel × 12` });
  }
  if (sections.vente) {
    recapRows.push({ ind: "Marge Estaly", avant: "0€", apres: `+${estalayAn.toLocaleString("fr-FR")}€/an`, ecart: `+${estalayAn.toLocaleString("fr-FR")}€`, formule: `${contratsEstaly} contrat/j × 250j × ${margeMoyEstaly}€ marge` });
  }

  const SECTION_LABELS: Record<Section, string> = {
    stock: "📦 Stock (déstockage / achats)",
    equipe: "👥 Équipe (ETP)",
    vente: "💳 Vente additionnelle (Estaly + accessoires)",
    mix: "🎯 Mix rayon / promo",
  };

  return (
    <div className="space-y-5 max-w-[900px]">
      <div>
        <h2 className="text-[18px] font-bold" style={{ color: "var(--text)" }}>🔮 Simulateur — Et si ?</h2>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--textMuted)" }}>Testez l'impact d'une décision avant d'agir. Calculs 100% locaux.</p>
      </div>

      {/* Section checkboxes */}
      <div className="rounded-2xl p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textDim)" }}>SECTIONS AFFICHÉES</div>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(SECTION_LABELS) as Section[]).map(s => (
            <label key={s} className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={sections[s]} onChange={() => setSections(p => ({ ...p, [s]: !p[s] }))}
                className="accent-[#00d4aa] w-4 h-4" />
              <span className="text-[12px] font-medium" style={{ color: "var(--text)" }}>{SECTION_LABELS[s]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Context recap */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Stock âgé",  val: `${ctx.stockAge}%`,                   color: ctx.stockAge > 30 ? "#ff4d6a" : ctx.stockAge > 20 ? "#ffb347" : "#00d4aa" },
          { label: "Trésorerie", val: `${(ctx.tresorerie / 1000).toFixed(0)}k€`, color: ctx.tresorerie < ctx.seuilTresorerie ? "#ff4d6a" : "#00d4aa" },
          { label: "Marge",      val: `${ctx.marge}%`,                       color: ctx.marge < 30 ? "#ff4d6a" : ctx.marge < 35 ? "#ffb347" : "#00d4aa" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}>
            <div className="text-[16px] font-black" style={{ color: s.color }}>{s.val}</div>
            <div className="text-[10px]" style={{ color: "var(--textDim)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Stock thresholds table */}
      {sections.stock && (
        <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          <div className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ background: "var(--surfaceAlt)", color: "var(--textDim)" }}>
            SEUILS STOCK RÉSEAU — GRILLE_STOCK_2024
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ background: "var(--surfaceAlt)" }}>
                  {["Famille", "Mini", "Idéal", "Maxi"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: "var(--textMuted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STOCK_SEUILS.map(r => (
                  <tr key={r.famille} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3 py-1.5 font-semibold" style={{ color: "var(--text)" }}>{r.famille}</td>
                    <td className="px-3 py-1.5" style={{ color: "#ffb347" }}>{r.mini.toLocaleString("fr-FR")} €</td>
                    <td className="px-3 py-1.5 font-bold" style={{ color: "#00d4aa" }}>{r.ideal.toLocaleString("fr-FR")} €</td>
                    <td className="px-3 py-1.5" style={{ color: "#ff4d6a" }}>{r.maxi.toLocaleString("fr-FR")} €</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surfaceAlt)" }}>
                  <td className="px-3 py-2 font-bold" style={{ color: "var(--text)" }}>TOTAL</td>
                  <td className="px-3 py-2 font-bold" style={{ color: "#ffb347" }}>{TOTAL_SEUILS.mini.toLocaleString("fr-FR")} €</td>
                  <td className="px-3 py-2 font-bold" style={{ color: "#00d4aa" }}>{TOTAL_SEUILS.ideal.toLocaleString("fr-FR")} €</td>
                  <td className="px-3 py-2 font-bold" style={{ color: "#ff4d6a" }}>{TOTAL_SEUILS.maxi.toLocaleString("fr-FR")} €</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scenario selector — Section Stock */}
      {sections.stock && <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--textDim)" }}>📦 STOCK</div>}
      {sections.stock && <div className="grid grid-cols-3 gap-3">
        {SCENARIOS.filter(s => s.id !== "promo").map(s => (
          <motion.button key={s.id} whileTap={{ scale: 0.97 }}
            onClick={() => { setScenario(s.id); setResultat(null); }}
            className="rounded-2xl p-4 text-left transition-all"
            style={{
              background: scenario === s.id ? "#00d4aa10" : "var(--surface)",
              border: scenario === s.id ? "1px solid #00d4aa40" : "1px solid var(--border)",
              cursor: "pointer", fontFamily: "inherit",
            }}>
            <div className="text-[22px] mb-1.5">{s.icon}</div>
            <div className="text-[12px] font-bold" style={{ color: scenario === s.id ? "#00d4aa" : "var(--text)" }}>{s.title}</div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--textDim)" }}>{s.desc}</div>
          </motion.button>
        ))}
      </div>}

      {/* Params + results — Stock section */}
      {sections.stock && <AnimatePresence mode="wait">
        {scenario && (
          <motion.div key={scenario} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl p-5 space-y-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>

            {scenario === "destockage" && (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: "var(--textDim)" }}>Remise appliquée — {remise}%</label>
                  <input type="range" min={5} max={50} step={5} value={remise} onChange={e => setRemise(+e.target.value)} className="w-full" style={{ accentColor: "var(--accent)" }} />
                  <div className="flex justify-between text-[9px] mt-1" style={{ color: "var(--textDim)" }}><span>5%</span><span>25%</span><span>50%</span></div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: "var(--textDim)" }}>Nombre de produits — {nbProduits}</label>
                  <input type="range" min={5} max={200} step={5} value={nbProduits} onChange={e => setNbProduits(+e.target.value)} className="w-full" style={{ accentColor: "var(--accent)" }} />
                </div>
              </div>
            )}

            {scenario === "achats" && (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: "var(--textDim)" }}>Budget rachat — {budgetAchats.toLocaleString("fr-FR")}€</label>
                  <input type="range" min={500} max={20000} step={500} value={budgetAchats} onChange={e => setBudgetAchats(+e.target.value)} className="w-full" style={{ accentColor: "var(--accent)" }} />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: "var(--textDim)" }}>Gamme prioritaire</label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(MARGE_PAR_GAMME) as Gamme[]).map(g => (
                      <button key={g} onClick={() => setGamme(g)} className="rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
                        style={{ background: gamme === g ? "var(--accent)" : "var(--surfaceAlt)", color: gamme === g ? "#000" : "var(--textMuted)", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        {g} ({MARGE_PAR_GAMME[g]}%)
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {scenario === "promo" && (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: "var(--textDim)" }}>Type d'opération</label>
                  <div className="flex flex-wrap gap-2">
                    {(["Semaine -20%", "Weekend flash", "Lot 3 pour 2"] as TypePromo[]).map(t => (
                      <button key={t} onClick={() => setTypePromo(t)} className="rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
                        style={{ background: typePromo === t ? "var(--accent)" : "var(--surfaceAlt)", color: typePromo === t ? "#000" : "var(--textMuted)", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: "var(--textDim)" }}>Rayons concernés</label>
                  <div className="flex flex-wrap gap-2">
                    {RAYONS.map(r => (
                      <button key={r} onClick={() => toggleRayon(r)} className="rounded-full px-3 py-1 text-[11px] font-semibold transition-all"
                        style={{ background: rayonsSelected.includes(r) ? "#00d4aa" : "var(--surfaceAlt)", color: rayonsSelected.includes(r) ? "#000" : "var(--textMuted)", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {resultat && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                <VerdictBadge verdict={resultat.verdict} />
                <div className="space-y-2">
                  {resultat.lignes.map((l, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: "var(--border)" }}>
                      <span className="text-[12px]" style={{ color: "var(--textMuted)" }}>{l.label}</span>
                      <span className="text-[13px] font-bold" style={{ color: l.color ?? "var(--text)" }}>{l.valeur}</span>
                    </div>
                  ))}
                </div>
                {/* Formules */}
                <div className="rounded-xl p-3 text-[11px] font-mono" style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)" }}>
                  {scenario === "destockage" && `Stock âgé = ${ctx.stockAge}% × ${ctx.valeurStock.toLocaleString("fr-FR")}€ = ${Math.round((ctx.stockAge/100)*ctx.valeurStock).toLocaleString("fr-FR")}€ · Remise ${remise}% · Tréso récupérée ≈ ${Math.round(Math.round((ctx.stockAge/100)*ctx.valeurStock)*(remise/100)*0.7).toLocaleString("fr-FR")}€`}
                  {scenario === "achats" && `Budget ${budgetAchats.toLocaleString("fr-FR")}€ · Marge ${MARGE_PAR_GAMME[gamme]}% · Marge attendue ≈ ${Math.round(budgetAchats * MARGE_PAR_GAMME[gamme]/100 * 3.5).toLocaleString("fr-FR")}€/an · Risque tréso = ${Math.round(budgetAchats/ctx.tresorerie*100)}% de la tréso`}
                  {scenario === "promo" && `CA supp estimé × marge ${ctx.marge}% × impact ${typePromo}`}
                </div>
                <div className="rounded-xl p-3 text-[12px]" style={{ background: "var(--surfaceAlt)", color: "var(--textMuted)" }}>
                  💡 {resultat.conseil}
                </div>
                <button onClick={validatePlan} className="w-full rounded-xl py-2.5 text-[12px] font-bold transition-all"
                  style={{ background: planValidated ? "#00d4aa" : "var(--accent)", color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  {planValidated ? "✓ Plan sauvegardé !" : "✓ Valider ce plan →"}
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>}

      {/* Section Équipe */}
      {sections.equipe && (
        <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--textDim)" }}>👥 ÉQUIPE (ETP)</div>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>Nombre d'ETP — {nbEtp}</label>
                <span className="text-[12px] font-bold" style={{ color: "#4da6ff" }}>{nbEtp} ETP × {salaireMoyenK}k€ = {(nbEtp*salaireMoyenK).toLocaleString("fr-FR")}k€/an</span>
              </div>
              <input type="range" min={1} max={10} step={1} value={nbEtp} onChange={e => setNbEtp(+e.target.value)} className="w-full" style={{ accentColor: "var(--accent)" }} />
              <div className="text-[10px] mt-1 font-mono px-1" style={{ color: "var(--textDim)" }}>
                Masse sal = {nbEtp} ETP × {salaireMoyenK}k€ ÷ CA {ctx ? (ctx.ca/1000).toFixed(0) : "?"}k€/mois × 12 = <strong style={{ color: masseSal > 15 ? "#ff4d6a" : "#00d4aa" }}>{masseSal}%</strong> {masseSal > 15 ? "⚠ > seuil 15%" : "✓"}
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>Salaire moyen — {salaireMoyenK}k€</label>
              </div>
              <input type="range" min={20} max={45} step={1} value={salaireMoyenK} onChange={e => setSalaireMoyenK(+e.target.value)} className="w-full" style={{ accentColor: "var(--accent)" }} />
            </div>
          </div>
        </div>
      )}

      {/* Section Vente additionnelle */}
      {sections.vente && (
        <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--textDim)" }}>💳 VENTE ADDITIONNELLE</div>
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-3">
              <div className="text-[12px] font-bold" style={{ color: "#a78bfa" }}>Contrats Estaly</div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--textDim)" }}>Contrats/jour — {contratsEstaly}</label>
                <input type="range" min={0} max={5} step={0.5} value={contratsEstaly} onChange={e => setContratsEstaly(+e.target.value)} className="w-full" style={{ accentColor: "var(--accent)" }} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--textDim)" }}>Marge moy/contrat — {margeMoyEstaly}€</label>
                <input type="range" min={3} max={20} step={1} value={margeMoyEstaly} onChange={e => setMargeMoyEstaly(+e.target.value)} className="w-full" style={{ accentColor: "var(--accent)" }} />
              </div>
              <div className="rounded-xl p-3 text-[11px] font-mono" style={{ background: "var(--surfaceAlt)", color: "var(--textDim)" }}>
                {contratsEstaly} contrat/j × 250j × {margeMoyEstaly}€ = <strong style={{ color: "#00d4aa" }}>+{estalayAn.toLocaleString("fr-FR")}€/an</strong>
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-[12px] font-bold" style={{ color: "#ffb347" }}>Accessoires (% CA)</div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--textDim)" }}>Accessoires — {accessPctCA}% CA</label>
                <input type="range" min={2} max={20} step={1} value={accessPctCA} onChange={e => setAccessPctCA(+e.target.value)} className="w-full" style={{ accentColor: "var(--accent)" }} />
              </div>
              <div className="rounded-xl p-3 text-[11px] font-mono" style={{ background: "var(--surfaceAlt)", color: "var(--textDim)" }}>
                {ctx ? `CA ${(ctx.ca/1000).toFixed(0)}k€/mois × 12 × ${accessPctCA}% × marge ${ctx.marge}% = ` : ""}<strong style={{ color: "#ffb347" }}>+{accessAn.toLocaleString("fr-FR")}€/an</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recap table */}
      {recapRows.length > 0 && (
        <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          <div className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ background: "var(--surfaceAlt)", color: "var(--textDim)" }}>
            TABLEAU RÉCAPITULATIF
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ background: "var(--surfaceAlt)", borderTop: "1px solid var(--border)" }}>
                {["Indicateur", "Avant", "Après", "Écart", "Formule"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: "var(--textMuted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recapRows.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-3 py-2 font-semibold" style={{ color: "var(--text)" }}>{r.ind}</td>
                  <td className="px-3 py-2" style={{ color: "var(--textMuted)" }}>{r.avant}</td>
                  <td className="px-3 py-2 font-bold" style={{ color: "#00d4aa" }}>{r.apres}</td>
                  <td className="px-3 py-2 font-bold" style={{ color: r.ecart.startsWith("-") ? "#ff4d6a" : "#00d4aa" }}>{r.ecart}</td>
                  <td className="px-3 py-2 text-[10px] font-mono" style={{ color: "var(--textDim)" }}>{r.formule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

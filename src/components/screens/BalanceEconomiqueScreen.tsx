"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, Tooltip as RCTooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { formatEuro } from "@/lib/hiddenCosts";

// ─── Projection Trésorerie ─────────────────────────────────────
interface TresoParams {
  tresoActuelle: number;
  caMoyenJour: number;
  achatsMoyenJour: number;
  chargesFixesMois: number;
  chargesVarPct: number;
  seuilTension: number;
  papGainMensuel: number; // gain estimé si PAP appliqué
}

function computeProjection(params: TresoParams, days: number): { jour: number; tendanciel: number; optimiste: number; pessimiste: number }[] {
  const pts = [];
  let t = params.tresoActuelle;
  let o = params.tresoActuelle;
  let p = params.tresoActuelle;
  for (let d = 0; d <= days; d += 10) {
    const dFrac = d / 30;
    const entrees = params.caMoyenJour * d * 0.95;
    const sorties = params.achatsMoyenJour * d + params.chargesFixesMois * dFrac + params.caMoyenJour * d * params.chargesVarPct;
    t = params.tresoActuelle + entrees - sorties;
    o = params.tresoActuelle + entrees - sorties * 0.88 + params.papGainMensuel * dFrac;
    p = params.tresoActuelle + entrees * 0.9 - sorties * 1.05;
    pts.push({ jour: d, tendanciel: Math.round(t), optimiste: Math.round(o), pessimiste: Math.round(p) });
  }
  return pts;
}

function TresorerieProjection({ magasinId }: { magasinId: string }) {
  const [params, setParams] = useState<TresoParams>({
    tresoActuelle: 25000,
    caMoyenJour: 6000,
    achatsMoyenJour: 2000,
    chargesFixesMois: 12000,
    chargesVarPct: 0.08,
    seuilTension: 8000,
    papGainMensuel: 0,
  });
  const [open, setOpen] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`treso_params_${magasinId}`);
      if (raw) setParams(JSON.parse(raw));
      // Try to pick up CHVACV data for CA estimate
      const chvacvRaw = localStorage.getItem(`chvacv_${magasinId}`);
      if (chvacvRaw) {
        const d = JSON.parse(chvacvRaw);
        if (d.ca_annuel) setParams(prev => ({ ...prev, caMoyenJour: Math.round(d.ca_annuel / 365) }));
      }
    } catch { /* ignore */ }
  }, [magasinId]);

  const save = (p: TresoParams) => {
    setParams(p);
    try { localStorage.setItem(`treso_params_${magasinId}`, JSON.stringify(p)); } catch { /* ignore */ }
  };

  const data = computeProjection(params, 90);
  const alert90 = data[data.length - 1];
  const crossTension = data.find(d => d.tendanciel < params.seuilTension && d.jour > 0);

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4"
        style={{ background: "var(--surface)" }}
      >
        <div className="text-left">
          <div className="text-[13px] font-bold" style={{ color: "var(--text)" }}>📈 Projection trésorerie — 90 jours</div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--textMuted)" }}>
            {crossTension
              ? <span style={{ color: "#ff4d6a" }}>⚠ Tension estimée dans ~{crossTension.jour} jours si rien ne change</span>
              : <span style={{ color: "#00d4aa" }}>✓ Trésorerie stable sur 90j (scénario tendanciel)</span>
            }
          </div>
        </div>
        <span style={{ color: "var(--textDim)" }}>{open ? "▲" : "▼"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="border-t" style={{ borderColor: "var(--border)" }}
          >
            {/* Params form */}
            <div className="p-4 grid grid-cols-3 gap-3 border-b" style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)" }}>
              {([
                { key: "tresoActuelle", label: "Tréso actuelle", unit: "€" },
                { key: "caMoyenJour", label: "CA / jour", unit: "€" },
                { key: "achatsMoyenJour", label: "Achats / jour", unit: "€" },
                { key: "chargesFixesMois", label: "Charges fixes/mois", unit: "€" },
                { key: "seuilTension", label: "Seuil tension", unit: "€" },
                { key: "papGainMensuel", label: "Gain PAP/mois", unit: "€" },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="text-[9px] uppercase tracking-wider block mb-0.5" style={{ color: "var(--textMuted)" }}>{f.label}</label>
                  <input type="number"
                    value={(params as unknown as Record<string, number>)[f.key]}
                    onChange={e => save({ ...params, [f.key]: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg px-2 py-1.5 text-[12px] font-semibold border"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="p-4 space-y-3">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                  <XAxis dataKey="jour" tickFormatter={v => `J+${v}`} tick={{ fontSize: 10, fill: "#8b8fa3" }} />
                  <YAxis tickFormatter={v => `${Math.round(v / 1000)}k€`} tick={{ fontSize: 10, fill: "#8b8fa3" }} />
                  <RCTooltip
                    contentStyle={{ background: "#1a1d27", border: "1px solid #2a2e3a", borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, name: string) => [formatEuro(v), name === "tendanciel" ? "Tendanciel" : name === "optimiste" ? "Optimiste (PAP)" : "Pessimiste"]}
                    labelFormatter={v => `Jour +${v}`}
                  />
                  <ReferenceLine y={params.seuilTension} stroke="#ff4d6a" strokeDasharray="4 4" label={{ value: "Seuil tension", fill: "#ff4d6a", fontSize: 10 }} />
                  <Line type="monotone" dataKey="optimiste" stroke="#00d4aa" strokeWidth={2} dot={false} name="optimiste" />
                  <Line type="monotone" dataKey="tendanciel" stroke="#ffb347" strokeWidth={2} strokeDasharray="5 3" dot={false} name="tendanciel" />
                  <Line type="monotone" dataKey="pessimiste" stroke="#ff4d6a" strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="pessimiste" />
                </LineChart>
              </ResponsiveContainer>

              {/* Legend + summary */}
              <div className="flex flex-wrap gap-4 text-[11px]">
                {[
                  { color: "#00d4aa", label: "Optimiste (PAP appliqué)", value: alert90.optimiste },
                  { color: "#ffb347", label: "Tendanciel", value: alert90.tendanciel },
                  { color: "#ff4d6a", label: "Pessimiste", value: alert90.pessimiste },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <div className="w-3 h-1 rounded-full" style={{ background: s.color }} />
                    <span style={{ color: "var(--textMuted)" }}>{s.label}</span>
                    <span className="font-bold" style={{ color: s.color }}>{formatEuro(s.value)}</span>
                  </div>
                ))}
              </div>

              {crossTension && (
                <div className="rounded-xl p-3 text-[12px]" style={{ background: "#ff4d6a10", border: "1px solid #ff4d6a30", color: "#ff4d6a" }}>
                  ⚠ Scénario tendanciel : tension trésorerie dans environ {crossTension.jour} jours.
                  En appliquant le PAP, la courbe verte reste au-dessus du seuil.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}



interface BalanceLine {
  id: string;
  solution: string;
  dysfonctionnement: string;
  typeCout: "temps" | "ventes" | "depenses";
  // Champs pour calcul guidé
  tempsHeures: number;
  frequenceAn: number;
  nbPersonnes: number;
  chvacvUtilisee: number;
  // Coût total dysfonctionnement (calculé ou saisi)
  coutDysfonctionnement: number;
  // Investissement
  investissement: number;
  detailInvestissement: string;
  // Recyclage
  tauxRecyclage: number;
  // Dérivés
  recyclage: number;
  gainNet: number;
  // UI
  expanded: boolean;
}

interface BalanceEconomiqueScreenProps {
  magasinId: string;
  magasin: { nom: string } | null;
}

const EXAMPLES: Omit<BalanceLine, "id" | "expanded" | "recyclage" | "gainNet">[] = [
  {
    solution: "Déployer Picea à 100%",
    dysfonctionnement: "Picea non utilisé — retours évitables et temps de diagnostic manuel",
    typeCout: "ventes",
    tempsHeures: 0.5, frequenceAn: 150, nbPersonnes: 2, chvacvUtilisee: 40,
    coutDysfonctionnement: 6000,
    investissement: 800,
    detailInvestissement: "Formation équipe (1j) + suivi 1 mois",
    tauxRecyclage: 0.3,
  },
  {
    solution: "Améliorer le TLAC de 0.78 → 1.5",
    dysfonctionnement: "Ventes additionnelles insuffisantes — accessoires non proposés",
    typeCout: "ventes",
    tempsHeures: 0, frequenceAn: 490, nbPersonnes: 1, chvacvUtilisee: 40,
    coutDysfonctionnement: 5616,
    investissement: 400,
    detailInvestissement: "Brief équipe + objectif hebdo + suivi",
    tauxRecyclage: 0.3,
  },
  {
    solution: "Réduire le turnover de 18% à 10%",
    dysfonctionnement: "Turnover élevé — coût de remplacement + intégration",
    typeCout: "depenses",
    tempsHeures: 0, frequenceAn: 1, nbPersonnes: 1, chvacvUtilisee: 40,
    coutDysfonctionnement: 16200,
    investissement: 3000,
    detailInvestissement: "Plan de fidélisation + entretiens réguliers + primes",
    tauxRecyclage: 0.3,
  },
];

function mkLine(partial: Omit<BalanceLine, "id" | "expanded" | "recyclage" | "gainNet">): BalanceLine {
  const recyclage = Math.round(partial.coutDysfonctionnement * partial.tauxRecyclage);
  const gainNet = recyclage - partial.investissement;
  return { ...partial, id: Math.random().toString(36).slice(2), expanded: false, recyclage, gainNet };
}

function computeLine(l: BalanceLine): BalanceLine {
  const recyclage = Math.round(l.coutDysfonctionnement * l.tauxRecyclage);
  const gainNet = recyclage - l.investissement;
  return { ...l, recyclage, gainNet };
}

// Animated number
function AnimatedNumber({ value, color }: { value: number; color: string }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    const start = display;
    const end = value;
    const dur = 800;
    const t0 = performance.now();
    const animate = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (end - start) * ease));
      if (p < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span style={{ color }}>{formatEuro(display)}</span>;
}

export function BalanceEconomiqueScreen({ magasinId, magasin }: BalanceEconomiqueScreenProps) {
  const storageKey = `balance_lines_${magasinId}`;
  const chvacvKey = `chvacv_${magasinId}`;
  const [lines, setLines] = useState<BalanceLine[]>([]);
  const [chvacv, setChvacv] = useState(40);
  const [adding, setAdding] = useState(false);
  const [newLine, setNewLine] = useState<Omit<BalanceLine, "id" | "expanded" | "recyclage" | "gainNet">>({
    solution: "", dysfonctionnement: "", typeCout: "temps",
    tempsHeures: 1, frequenceAn: 100, nbPersonnes: 1, chvacvUtilisee: chvacv,
    coutDysfonctionnement: 0, investissement: 0, detailInvestissement: "", tauxRecyclage: 0.3,
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setLines(JSON.parse(saved));
      } else {
        const defaults = EXAMPLES.map(mkLine);
        setLines(defaults);
        localStorage.setItem(storageKey, JSON.stringify(defaults));
      }
      const savedHyp = localStorage.getItem(chvacvKey);
      if (savedHyp) {
        const parsed = JSON.parse(savedHyp);
        if (parsed.ca_annuel && parsed.cv_annuelles && parsed.nb_etp && parsed.heures_semaine && parsed.semaines_an) {
          const va = parsed.ca_annuel - parsed.cv_annuelles;
          const h = parsed.nb_etp * parsed.heures_semaine * parsed.semaines_an;
          if (h > 0) setChvacv(Math.round(va / h * 100) / 100);
        }
      }
    } catch { /* noop */ }
  }, [storageKey, chvacvKey]);

  const save = (next: BalanceLine[]) => {
    setLines(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const updateLine = (id: string, patch: Partial<BalanceLine>) => {
    save(lines.map((l) => l.id === id ? computeLine({ ...l, ...patch }) : l));
  };

  const totalCouts = lines.reduce((s, l) => s + l.coutDysfonctionnement, 0);
  const totalInvest = lines.reduce((s, l) => s + l.investissement, 0);
  const totalRecyclage = lines.reduce((s, l) => s + l.recyclage, 0);
  const totalGain = totalRecyclage - totalInvest;

  // Computed suggestion for temps-type lines
  const computeTemps = (l: typeof newLine): number => {
    if (l.typeCout !== "temps") return l.coutDysfonctionnement;
    return Math.round(l.tempsHeures * l.frequenceAn * l.nbPersonnes * (l.chvacvUtilisee || chvacv));
  };

  const balanceTilt = totalCouts > 0 ? Math.min(20, (totalGain / totalCouts) * 40) : 0;

  return (
    <div className="space-y-5">
      {/* ── CHVACV contextuel ──────────────────────────────── */}
      <div className="rounded-xl px-5 py-3 border flex items-center gap-4"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>CHVACV utilisée dans les calculs :</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={chvacv}
            onChange={(e) => setChvacv(Number(e.target.value) || 40)}
            className="w-20 rounded-lg px-3 py-1.5 text-[13px] font-bold border text-center"
            style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "#00d4aa" }}
          />
          <span className="text-[12px] font-semibold" style={{ color: "#00d4aa" }}>€/h</span>
        </div>
        <div className="text-[11px]" style={{ color: "var(--textDim)" }}>
          Calculée dans l&apos;onglet CHVACV · Modifiable ici pour simulation
        </div>
      </div>

      {/* ── Balance SVG animée ────────────────────────────── */}
      <div className="rounded-2xl p-6 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="text-[11px] font-bold uppercase tracking-widest mb-6 text-center" style={{ color: "var(--textMuted)" }}>
          Balance Économique ISEOR
        </div>

        <div className="flex items-center justify-center mb-6">
          <svg viewBox="0 0 500 220" className="w-full max-w-[560px]" style={{ overflow: "visible" }}>
            {/* Socle */}
            <rect x="245" y="180" width="10" height="35" fill="#4a5568" rx="3" />
            <rect x="210" y="212" width="80" height="8" fill="#4a5568" rx="3" />

            {/* Barre centrale */}
            <g transform={`rotate(${-balanceTilt}, 250, 110)`}>
              <rect x="50" y="108" width="400" height="5" fill="#6b7280" rx="2" />
              {/* Plateau gauche — coûts */}
              <line x1="90" y1="110" x2="90" y2="145" stroke="#6b7280" strokeWidth="2" strokeDasharray="4 2" />
              <ellipse cx="90" cy="155" rx="55" ry="18" fill="#ff4d6a22" stroke="#ff4d6a" strokeWidth="1.5" />
              <text x="90" y="152" textAnchor="middle" fill="#ff4d6a" fontSize="10" fontWeight="700">COÛTS</text>
              <text x="90" y="164" textAnchor="middle" fill="#ff4d6a" fontSize="9">{formatEuro(totalCouts)}/an</text>

              {/* Plateau droit — recyclage */}
              <line x1="410" y1="110" x2="410" y2="145" stroke="#6b7280" strokeWidth="2" strokeDasharray="4 2" />
              <ellipse cx="410" cy="155" rx="55" ry="18" fill="#00d4aa22" stroke="#00d4aa" strokeWidth="1.5" />
              <text x="410" y="152" textAnchor="middle" fill="#00d4aa" fontSize="10" fontWeight="700">RECYCLAGE</text>
              <text x="410" y="164" textAnchor="middle" fill="#00d4aa" fontSize="9">{formatEuro(totalRecyclage)}/an</text>

              {/* Centre */}
              <circle cx="250" cy="110" r="8" fill="#6b7280" />
            </g>

            {/* Pivot */}
            <circle cx="250" cy="110" r="5" fill="#9ca3af" />

            {/* Labels flottants */}
            <text x="90" y="35" textAnchor="middle" fill="#ff4d6a" fontSize="11" fontWeight="700">Dysfonctionnements</text>
            <text x="90" y="50" textAnchor="middle" fill="#8b8fa3" fontSize="9">{lines.length} éléments</text>
            <text x="410" y="35" textAnchor="middle" fill="#00d4aa" fontSize="11" fontWeight="700">Gains potentiels</text>
            <text x="410" y="50" textAnchor="middle" fill="#8b8fa3" fontSize="9">
              {formatEuro(totalGain)} gain net
            </text>

            {/* Flèche gain net */}
            {totalGain > 0 && (
              <>
                <text x="250" y="75" textAnchor="middle" fill="#00d4aa" fontSize="12" fontWeight="900">
                  +{formatEuro(totalGain)}/an
                </text>
                <text x="250" y="90" textAnchor="middle" fill="#8b8fa3" fontSize="9">gain net estimé</text>
              </>
            )}
            {totalGain < 0 && (
              <text x="250" y="80" textAnchor="middle" fill="#ff4d6a" fontSize="11" fontWeight="700">
                Investissement trop élevé
              </text>
            )}
          </svg>
        </div>

        {/* Totaux */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Coûts dysfonctionnements", value: totalCouts, color: "var(--danger)", bg: "#ff4d6a12" },
            { label: "Investissement total", value: totalInvest, color: "#4da6ff", bg: "#4da6ff12" },
            { label: "Recyclage estimé (30%)", value: totalRecyclage, color: "#ffb347", bg: "#ffb34712" },
            { label: "Gain net", value: totalGain, color: totalGain > 0 ? "#00d4aa" : "var(--danger)", bg: totalGain > 0 ? "#00d4aa12" : "#ff4d6a12" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className="rounded-xl p-4 border text-center" style={{ background: bg, borderColor: "transparent" }}>
              <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--textMuted)" }}>{label}</div>
              <div className="text-[20px] font-black">
                <AnimatedNumber value={value} color={color} />
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "var(--textDim)" }}>/an</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tableau des dysfonctionnements ───────────────── */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--textMuted)" }}>
            Dysfonctionnements & Solutions
          </div>
          <button
            onClick={() => setAdding(true)}
            className="px-4 py-1.5 rounded-xl text-[11px] font-bold"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            + Ajouter
          </button>
        </div>

        {/* Add form */}
        <AnimatePresence>
          {adding && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-5 border-b space-y-4" style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)" }}>
                <div className="text-[11px] font-bold" style={{ color: "var(--text)" }}>Nouveau dysfonctionnement</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Solution proposée</label>
                    <input value={newLine.solution} onChange={(e) => setNewLine((p) => ({ ...p, solution: e.target.value }))}
                      placeholder="ex: Déployer Picea"
                      className="w-full rounded-lg px-3 py-2 text-[12px] border"
                      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }} />
                  </div>
                  <div>
                    <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Dysfonctionnement</label>
                    <input value={newLine.dysfonctionnement} onChange={(e) => setNewLine((p) => ({ ...p, dysfonctionnement: e.target.value }))}
                      placeholder="ex: Retours évitables"
                      className="w-full rounded-lg px-3 py-2 text-[12px] border"
                      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Type de coût</label>
                    <select value={newLine.typeCout} onChange={(e) => setNewLine((p) => ({ ...p, typeCout: e.target.value as "temps" | "ventes" | "depenses" }))}
                      className="w-full rounded-lg px-3 py-2 text-[12px] border"
                      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                      <option value="temps">⏱ Perte de temps</option>
                      <option value="ventes">📉 Ventes perdues</option>
                      <option value="depenses">💸 Dépenses directes</option>
                    </select>
                  </div>
                  {newLine.typeCout === "temps" && (
                    <>
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Heures perdues / occurrence</label>
                        <input type="number" min={0} step={0.25} value={newLine.tempsHeures}
                          onChange={(e) => {
                            const v = { ...newLine, tempsHeures: Number(e.target.value) || 0 };
                            setNewLine({ ...v, coutDysfonctionnement: computeTemps(v) });
                          }}
                          className="w-full rounded-lg px-3 py-2 text-[12px] border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }} />
                      </div>
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Fréquence/an</label>
                        <input type="number" min={1} value={newLine.frequenceAn}
                          onChange={(e) => {
                            const v = { ...newLine, frequenceAn: Number(e.target.value) || 0 };
                            setNewLine({ ...v, coutDysfonctionnement: computeTemps(v) });
                          }}
                          className="w-full rounded-lg px-3 py-2 text-[12px] border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }} />
                      </div>
                      <div>
                        <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Nb personnes</label>
                        <input type="number" min={1} value={newLine.nbPersonnes}
                          onChange={(e) => {
                            const v = { ...newLine, nbPersonnes: Number(e.target.value) || 1 };
                            setNewLine({ ...v, coutDysfonctionnement: computeTemps(v) });
                          }}
                          className="w-full rounded-lg px-3 py-2 text-[12px] border"
                          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }} />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Coût dysfonctionnement (€/an)</label>
                    <input type="number" min={0} value={newLine.coutDysfonctionnement}
                      onChange={(e) => setNewLine((p) => ({ ...p, coutDysfonctionnement: Number(e.target.value) || 0 }))}
                      className="w-full rounded-lg px-3 py-2 text-[12px] border font-bold"
                      style={{ background: "var(--surface)", borderColor: "#ff4d6a60", color: "var(--danger)" }} />
                  </div>
                  <div>
                    <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Investissement (€/an)</label>
                    <input type="number" min={0} value={newLine.investissement}
                      onChange={(e) => setNewLine((p) => ({ ...p, investissement: Number(e.target.value) || 0 }))}
                      className="w-full rounded-lg px-3 py-2 text-[12px] border font-bold"
                      style={{ background: "var(--surface)", borderColor: "#4da6ff60", color: "#4da6ff" }} />
                  </div>
                  <div>
                    <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Taux recyclage</label>
                    <select value={newLine.tauxRecyclage} onChange={(e) => setNewLine((p) => ({ ...p, tauxRecyclage: Number(e.target.value) }))}
                      className="w-full rounded-lg px-3 py-2 text-[12px] border"
                      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
                      <option value={0.2}>20% (pessimiste)</option>
                      <option value={0.3}>30% (ISEOR moyen)</option>
                      <option value={0.5}>50% (optimiste)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Détail investissement</label>
                  <input value={newLine.detailInvestissement} onChange={(e) => setNewLine((p) => ({ ...p, detailInvestissement: e.target.value }))}
                    placeholder="ex: Formation 1j + suivi mensuel"
                    className="w-full rounded-lg px-3 py-2 text-[12px] border"
                    style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }} />
                </div>

                {/* Preview */}
                {newLine.coutDysfonctionnement > 0 && (
                  <div className="rounded-xl p-3 text-[11px]" style={{ background: "#0f1117", border: "1px solid var(--border)", color: "var(--textMuted)" }}>
                    Coût dysf. {formatEuro(newLine.coutDysfonctionnement)} × {Math.round(newLine.tauxRecyclage * 100)}% recyclage = <strong style={{ color: "#00d4aa" }}>{formatEuro(Math.round(newLine.coutDysfonctionnement * newLine.tauxRecyclage))}</strong> récupéré
                    {" — "} Investissement {formatEuro(newLine.investissement)}
                    {" → "} <strong style={{ color: (newLine.coutDysfonctionnement * newLine.tauxRecyclage - newLine.investissement) > 0 ? "#00d4aa" : "var(--danger)" }}>
                      Gain net {formatEuro(Math.round(newLine.coutDysfonctionnement * newLine.tauxRecyclage - newLine.investissement))}/an
                    </strong>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { save([...lines, mkLine({ ...newLine, chvacvUtilisee: chvacv })]); setAdding(false); }}
                    disabled={!newLine.solution}
                    className="px-5 py-2 rounded-xl text-[12px] font-bold disabled:opacity-40"
                    style={{ background: "var(--accent)", color: "#000" }}
                  >
                    Ajouter
                  </button>
                  <button onClick={() => setAdding(false)} className="px-5 py-2 rounded-xl text-[12px] border"
                    style={{ borderColor: "var(--border)", color: "var(--textMuted)" }}>
                    Annuler
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lines */}
        {lines.map((line, idx) => (
          <motion.div
            key={line.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="border-b last:border-b-0"
            style={{ background: idx % 2 === 0 ? "var(--surfaceAlt)" : "var(--surface)", borderColor: "var(--border)" }}
          >
            {/* Row summary */}
            <div className="flex items-center gap-4 px-5 py-3">
              <button
                onClick={() => updateLine(line.id, { expanded: !line.expanded })}
                className="text-[10px] w-5 shrink-0" style={{ color: "var(--textDim)" }}
              >
                {line.expanded ? "▼" : "▶"}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold truncate" style={{ color: "var(--text)" }}>{line.solution}</div>
                <div className="text-[10px] truncate" style={{ color: "var(--textMuted)" }}>{line.dysfonctionnement}</div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-center">
                  <div className="text-[11px] font-bold" style={{ color: "var(--danger)" }}>{formatEuro(line.coutDysfonctionnement)}</div>
                  <div className="text-[9px]" style={{ color: "var(--textDim)" }}>coût dysf.</div>
                </div>
                <div className="text-center">
                  <div className="text-[11px] font-bold" style={{ color: "#4da6ff" }}>{formatEuro(line.investissement)}</div>
                  <div className="text-[9px]" style={{ color: "var(--textDim)" }}>invest.</div>
                </div>
                <div className="text-center">
                  <div className="text-[11px] font-bold" style={{ color: "#00d4aa" }}>{formatEuro(line.recyclage)}</div>
                  <div className="text-[9px]" style={{ color: "var(--textDim)" }}>recyclage</div>
                </div>
                <div className="text-center min-w-[70px]">
                  <div className="text-[13px] font-black" style={{ color: line.gainNet > 0 ? "#00d4aa" : "var(--danger)" }}>
                    {line.gainNet > 0 ? "+" : ""}{formatEuro(line.gainNet)}
                  </div>
                  <div className="text-[9px]" style={{ color: "var(--textDim)" }}>gain net</div>
                </div>
                <button onClick={() => save(lines.filter((l) => l.id !== line.id))}
                  className="text-[11px] px-2 py-1 rounded" style={{ color: "var(--textDim)" }}>✕</button>
              </div>
            </div>

            {/* Expanded detail */}
            <AnimatePresence>
              {line.expanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="px-10 pb-4 grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Coût dysfonctionnement</label>
                      <div className="flex items-center gap-1">
                        <input type="number" value={line.coutDysfonctionnement}
                          onChange={(e) => updateLine(line.id, { coutDysfonctionnement: Number(e.target.value) || 0 })}
                          className="w-full rounded-lg px-2 py-1.5 text-[11px] border"
                          style={{ background: "var(--surfaceAlt)", borderColor: "#ff4d6a40", color: "var(--danger)" }} />
                        <span className="text-[10px]" style={{ color: "var(--textDim)" }}>€</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Investissement</label>
                      <div className="flex items-center gap-1">
                        <input type="number" value={line.investissement}
                          onChange={(e) => updateLine(line.id, { investissement: Number(e.target.value) || 0 })}
                          className="w-full rounded-lg px-2 py-1.5 text-[11px] border"
                          style={{ background: "var(--surfaceAlt)", borderColor: "#4da6ff40", color: "#4da6ff" }} />
                        <span className="text-[10px]" style={{ color: "var(--textDim)" }}>€</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] mb-1" style={{ color: "var(--textMuted)" }}>Taux recyclage</label>
                      <select value={line.tauxRecyclage} onChange={(e) => updateLine(line.id, { tauxRecyclage: Number(e.target.value) })}
                        className="w-full rounded-lg px-2 py-1.5 text-[11px] border"
                        style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}>
                        <option value={0.2}>20% — pessimiste</option>
                        <option value={0.3}>30% — ISEOR moyen</option>
                        <option value={0.5}>50% — optimiste</option>
                      </select>
                    </div>
                    <div className="rounded-lg p-2 text-center" style={{ background: "#0f1117" }}>
                      <div className="text-[9px] mb-1" style={{ color: "var(--textDim)" }}>Formule</div>
                      <div className="text-[10px] font-mono" style={{ color: "var(--textMuted)" }}>
                        {formatEuro(line.coutDysfonctionnement)} × {Math.round(line.tauxRecyclage * 100)}% − {formatEuro(line.investissement)}
                      </div>
                      <div className="text-[12px] font-bold mt-1" style={{ color: line.gainNet > 0 ? "#00d4aa" : "var(--danger)" }}>
                        = {formatEuro(line.gainNet)}/an
                      </div>
                    </div>
                    {line.detailInvestissement && (
                      <div className="col-span-4 text-[11px]" style={{ color: "var(--textMuted)" }}>
                        📝 {line.detailInvestissement}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* ── Note ISEOR ─────────────────────────────────────── */}
      <div className="rounded-2xl p-4 border text-[11px]" style={{ background: "var(--surface)", borderColor: "#4da6ff30", borderLeft: "3px solid #4da6ff", color: "var(--textMuted)" }}>
        <strong style={{ color: "#4da6ff" }}>Balance Économique — Règle de recyclage ISEOR : 30% en moyenne.</strong>
        {" "}Si Recyclage = Investissement → solution parfaitement rentable.
        Si Recyclage &gt; Investissement → gain net positif.
        Si Recyclage &lt; Investissement → remettre en question la solution.
      </div>

      {/* ── Projection Trésorerie ──────────────────────────────── */}
      <TresorerieProjection magasinId={magasinId} />
    </div>
  );
}

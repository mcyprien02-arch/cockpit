"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getStatus, computeScore } from "@/lib/scoring";
import { computeHiddenCosts, formatEuro } from "@/lib/hiddenCosts";
import { buildMagasinContext } from "@/lib/buildContext";
import { runRedacteurSynthese } from "@/lib/agents";
import type { ValeurAvecIndicateur } from "@/types";

interface ExportCRScreenProps {
  magasinId: string;
  magasinNom?: string;
}

export function ExportCRScreen({ magasinId, magasinNom }: ExportCRScreenProps) {
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [papActions, setPapActions] = useState<{ action: string; echeance?: string; priorite?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [iaSynthese, setIaSynthese] = useState<string | null>(null);
  const [iaLoading, setIaLoading] = useState(false);
  const crRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    if (!magasinId) return;
    setLoading(true);

    const { data: vData } = await supabase
      .from("v_dernieres_valeurs")
      .select("*")
      .eq("magasin_id", magasinId);

    type VRow = {
      indicateur_id: string; valeur: number; date_saisie: string;
      indicateur_nom: string; unite: string | null; direction: "up" | "down";
      seuil_ok: number | null; seuil_vigilance: number | null; categorie: string;
      poids: number; action_defaut: string | null; magasin_nom: string; magasin_id: string;
    };

    const enriched: ValeurAvecIndicateur[] = ((vData ?? []) as VRow[]).map(r => ({
      ...r,
      status: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
    }));
    setValeurs(enriched);

    try {
      const { data: papData } = await (supabase as any)
        .from("plans_action")
        .select("action, echeance, priorite")
        .eq("magasin_id", magasinId)
        .neq("statut", "done")
        .order("priorite", { ascending: false })
        .limit(5);
      setPapActions((papData ?? []) as typeof papActions);
    } catch {
      try {
        const raw = localStorage.getItem(`pap_actions_${magasinId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          setPapActions(parsed.slice(0, 5));
        }
      } catch { /* ignore */ }
    }

    setLoading(false);
  }, [magasinId]);

  useEffect(() => { loadData(); }, [loadData]);

  const runSynthese = async () => {
    setIaLoading(true);
    try {
      const ctx = await buildMagasinContext(magasinId);
      const text = await runRedacteurSynthese(ctx);
      setIaSynthese(text);
    } catch (e: any) {
      setIaSynthese("Erreur : " + (e.message ?? "IA indisponible"));
    } finally {
      setIaLoading(false);
    }
  };

  const score = computeScore(valeurs);
  const hiddenCosts = computeHiddenCosts(valeurs)
    .filter(c => (c.estimatedLoss ?? 0) > 0)
    .sort((a, b) => (b.estimatedLoss ?? 0) - (a.estimatedLoss ?? 0))
    .slice(0, 3);

  const totalLoss = hiddenCosts.reduce((s, c) => s + (c.estimatedLoss ?? 0), 0);
  const scoreColor = score === null ? "#555a6e" : score >= 70 ? "#00d4aa" : score >= 45 ? "#ffb347" : "#ff4d6a";
  const scoreLabel = score === null ? "—" : score >= 70 ? "Bon" : score >= 45 ? "Vigilance" : "Critique";
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const buildTextCR = () => {
    const lines: string[] = [];
    lines.push(`COMPTE-RENDU DE VISITE — ${(magasinNom ?? "Magasin").toUpperCase()}`);
    lines.push(`Date : ${today}`);
    lines.push("");
    lines.push("─────────────────────────────────────");
    lines.push("VERDICT");
    lines.push("─────────────────────────────────────");
    lines.push(`Score global : ${score ?? "—"}/100 (${scoreLabel})`);
    if (totalLoss > 0) lines.push(`Potentiel de récupération : ~${formatEuro(totalLoss)}/an`);
    lines.push("");
    lines.push("─────────────────────────────────────");
    lines.push("TOP 3 ALERTES");
    lines.push("─────────────────────────────────────");
    if (hiddenCosts.length === 0) {
      lines.push("Aucune alerte critique détectée.");
    } else {
      hiddenCosts.forEach((c, i) => {
        lines.push(`${i + 1}. ${c.label}`);
        lines.push(`   ${c.detail}`);
        if (c.estimatedLoss) lines.push(`   Impact estimé : ~${formatEuro(c.estimatedLoss)}/an`);
        lines.push("");
      });
    }
    lines.push("─────────────────────────────────────");
    lines.push("PLAN D'ACTION PRIORITAIRE");
    lines.push("─────────────────────────────────────");
    if (papActions.length === 0) {
      lines.push("Aucune action en cours.");
    } else {
      papActions.forEach((a, i) => {
        const date = a.echeance ? ` — échéance ${new Date(a.echeance).toLocaleDateString("fr-FR")}` : "";
        lines.push(`${i + 1}. [${(a.priorite ?? "P3").toUpperCase()}] ${a.action}${date}`);
      });
    }
    lines.push("");
    lines.push("─────────────────────────────────────");
    lines.push(`Généré par EasyCash Cockpit — ${today}`);
    return lines.join("\n");
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(buildTextCR());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback: show the text */ }
  };

  const printCR = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--surfaceAlt)" }} />)}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[800px]">
      {/* Actions bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[18px] font-bold" style={{ color: "var(--text)" }}>
            📄 Compte-rendu de visite
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--textMuted)" }}>
            Généré automatiquement depuis vos données — {today}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={runSynthese}
            disabled={iaLoading}
            className="rounded-xl px-4 py-2.5 text-[12px] font-bold transition-all"
            style={{
              background: iaLoading ? "var(--surfaceAlt)" : "linear-gradient(135deg,#7c3aed,#a855f7)",
              color: "#fff",
              border: "none",
              cursor: iaLoading ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {iaLoading ? "Génération…" : "🧠 Synthèse IA"}
          </button>
          <button
            onClick={copyToClipboard}
            className="rounded-xl px-4 py-2.5 text-[12px] font-bold transition-all"
            style={{
              background: copied ? "#00d4aa" : "var(--surfaceAlt)",
              color: copied ? "#000" : "var(--textMuted)",
              border: "1px solid var(--border)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {copied ? "✓ Copié !" : "📋 Copier texte"}
          </button>
          <button
            onClick={printCR}
            className="rounded-xl px-4 py-2.5 text-[12px] font-bold"
            style={{
              background: "var(--accent)",
              color: "#000",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            🖨 Imprimer
          </button>
        </div>
      </div>

      {/* IA Synthèse */}
      {iaSynthese && (
        <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "#7c3aed40" }}>
          <div className="text-[11px] font-bold mb-3 tracking-wider" style={{ color: "#a855f7" }}>
            🧠 SYNTHÈSE IA
          </div>
          <div className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>
            {iaSynthese}
          </div>
        </div>
      )}

      {/* CR preview */}
      <div
        ref={crRef}
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {/* CR Header */}
        <div
          className="px-6 py-4 border-b"
          style={{
            background: "linear-gradient(135deg, #1a1d27, #0f1117)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div
                className="text-[11px] font-bold uppercase tracking-widest mb-1"
                style={{ color: "var(--textDim)" }}
              >
                COMPTE-RENDU DE VISITE
              </div>
              <div className="text-[18px] font-black" style={{ color: "var(--text)" }}>
                {magasinNom ?? "Magasin"}
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: "var(--textMuted)" }}>{today}</div>
            </div>
            {/* Score badge */}
            <div
              className="rounded-2xl px-5 py-3 text-center"
              style={{ background: `${scoreColor}15`, border: `1px solid ${scoreColor}30` }}
            >
              <div className="text-[32px] font-black" style={{ color: scoreColor }}>{score ?? "—"}</div>
              <div className="text-[10px] font-bold" style={{ color: scoreColor }}>{scoreLabel}</div>
              <div className="text-[9px]" style={{ color: "var(--textDim)" }}>score /100</div>
            </div>
          </div>
        </div>

        {/* Section 1: Alertes */}
        <div className="px-6 py-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div
            className="text-[10px] font-bold uppercase tracking-widest mb-3"
            style={{ color: "var(--textDim)" }}
          >
            TOP 3 ALERTES
          </div>

          {hiddenCosts.length === 0 ? (
            <div className="text-[13px]" style={{ color: "#00d4aa" }}>
              ✓ Aucune alerte critique détectée
            </div>
          ) : (
            <div className="space-y-3">
              {hiddenCosts.map((c, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5"
                    style={{
                      background: c.severity === "dg" ? "#ff4d6a20" : "#ffb34720",
                      color: c.severity === "dg" ? "#ff4d6a" : "#ffb347",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{c.label}</div>
                    <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>{c.detail}</div>
                  </div>
                  {c.estimatedLoss && (
                    <div className="ml-auto text-[12px] font-bold shrink-0" style={{ color: "#ff4d6a" }}>
                      ~{formatEuro(c.estimatedLoss)}/an
                    </div>
                  )}
                </div>
              ))}
              {totalLoss > 0 && (
                <div
                  className="rounded-xl p-3 flex items-center justify-between mt-2"
                  style={{ background: "#ff4d6a08", border: "1px solid #ff4d6a20" }}
                >
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
                    Total potentiel récupérable
                  </span>
                  <span className="text-[14px] font-black" style={{ color: "#ff4d6a" }}>
                    ~{formatEuro(totalLoss)}/an
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 2: Balance résumé */}
        <div className="px-6 py-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textDim)" }}>
            BALANCE ÉCONOMIQUE
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-3 text-center" style={{ background: "#00d4aa08", border: "1px solid #00d4aa20" }}>
              <div className="text-[20px] font-black" style={{ color: "#00d4aa" }}>
                {valeurs.filter(v => v.status === "ok").length}
              </div>
              <div className="text-[10px]" style={{ color: "#00d4aa" }}>KPIs OK</div>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: "#ffb34708", border: "1px solid #ffb34720" }}>
              <div className="text-[20px] font-black" style={{ color: "#ffb347" }}>
                {valeurs.filter(v => v.status === "wn").length}
              </div>
              <div className="text-[10px]" style={{ color: "#ffb347" }}>Vigilance</div>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: "#ff4d6a08", border: "1px solid #ff4d6a20" }}>
              <div className="text-[20px] font-black" style={{ color: "#ff4d6a" }}>
                {valeurs.filter(v => v.status === "dg").length}
              </div>
              <div className="text-[10px]" style={{ color: "#ff4d6a" }}>Action requise</div>
            </div>
          </div>
        </div>

        {/* Section 3: PAP */}
        <div className="px-6 py-5">
          <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textDim)" }}>
            PLAN D'ACTION PRIORITAIRE
          </div>
          {papActions.length === 0 ? (
            <div className="text-[13px]" style={{ color: "var(--textMuted)" }}>
              Aucune action en cours. Créez votre PAP →
            </div>
          ) : (
            <div className="space-y-2">
              {papActions.map((a, i) => {
                const isLate = a.echeance && new Date(a.echeance) < new Date();
                return (
                  <div key={i} className="flex items-start gap-3">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0 mt-0.5"
                      style={{
                        background: a.priorite === "P1" ? "#ff4d6a20" : a.priorite === "P2" ? "#ffb34720" : "#4da6ff20",
                        color: a.priorite === "P1" ? "#ff4d6a" : a.priorite === "P2" ? "#ffb347" : "#4da6ff",
                      }}
                    >
                      {a.priorite ?? "P3"}
                    </span>
                    <div className="flex-1 text-[12px]" style={{ color: "var(--text)" }}>{a.action}</div>
                    {a.echeance && (
                      <div
                        className="text-[10px] font-semibold shrink-0"
                        style={{ color: isLate ? "#ff4d6a" : "var(--textDim)" }}
                      >
                        {new Date(a.echeance).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        {isLate && " ⚠"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 text-[10px] text-center border-t"
          style={{ borderColor: "var(--border)", color: "var(--textDim)", background: "var(--surfaceAlt)" }}
        >
          Généré par EasyCash Cockpit — {today}
        </div>
      </div>
    </div>
  );
}

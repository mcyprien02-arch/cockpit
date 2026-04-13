"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { getStatus } from "@/lib/scoring";
import { callAssistant } from "@/lib/agents/redacteur";
import type { ValeurAvecIndicateur } from "@/types";

const SUGGESTIONS = [
  "Comment réduire mon stock âgé rapidement ?",
  "Mon EBE est sous les 8%, que faire ?",
  "Quelle action prioritaire cette semaine ?",
  "Comment augmenter ma marge nette ?",
  "Mon stock âgé dépasse 30%, par où commencer ?",
];

export function AssistantScreen({ magasinId }: { magasinId: string }) {
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [actions, setActions] = useState<{ priorite: string; action: string; statut: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [reponse, setReponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCtx, setLoadingCtx] = useState(true);

  const load = useCallback(async () => {
    if (!magasinId) return;
    setLoadingCtx(true);
    const [{ data: vData }, { data: aData }] = await Promise.all([
      supabase.from("v_dernieres_valeurs").select("*").eq("magasin_id", magasinId),
      supabase.from("plans_action").select("priorite, action, statut").eq("magasin_id", magasinId).neq("statut", "Fait").limit(10),
    ]);

    type VRow = {
      magasin_id: string; indicateur_id: string; valeur: number; date_saisie: string;
      indicateur_nom: string; unite: string | null; direction: "up" | "down";
      seuil_ok: number | null; seuil_vigilance: number | null; categorie: string;
      poids: number; action_defaut: string | null; magasin_nom: string;
    };

    const enriched: ValeurAvecIndicateur[] = ((vData ?? []) as VRow[]).map((r) => ({
      ...r,
      status: getStatus(r.valeur, r.direction, r.seuil_ok, r.seuil_vigilance),
    }));

    setValeurs(enriched);
    setActions((aData ?? []) as typeof actions);
    setLoadingCtx(false);
  }, [magasinId]);

  useEffect(() => { load(); }, [load]);

  const handleSend = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || loading) return;
    setQuestion(q ? "" : question);
    setReponse(null);
    setLoading(true);
    try {
      const alertes = valeurs
        .filter((v) => v.status !== "ok" && v.status !== null)
        .map((v) => ({ nom: v.indicateur_nom, valeur: v.valeur, statut: v.status, seuil: v.seuil_ok }));

      const kpis = valeurs.map((v) => ({
        nom: v.indicateur_nom,
        valeur: v.valeur,
        unite: v.unite ?? "",
        statut: v.status,
      }));

      const answer = await callAssistant({
        question: text,
        kpis,
        alertes,
        pap: actions,
      });
      setReponse(answer);
    } catch (err) {
      setReponse(`Erreur : ${err instanceof Error ? err.message : "réessayez"}`);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🤖</span>
          <div>
            <div className="text-[15px] font-bold" style={{ color: "var(--text)" }}>Assistant EasyCash</div>
            <div className="text-[11px]" style={{ color: "var(--textMuted)" }}>
              {loadingCtx
                ? "Chargement des données…"
                : `${valeurs.length} KPIs · ${valeurs.filter((v) => v.status === "dg").length} alertes`}
            </div>
          </div>
        </div>
      </div>

      {/* Suggestions */}
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => { setQuestion(s); }}
            className="rounded-full px-3 py-1.5 text-[11px] font-medium transition-all"
            style={{
              background: question === s ? "var(--accent)" : "var(--surfaceAlt)",
              color: question === s ? "#000" : "var(--textMuted)",
              border: "1px solid var(--border)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-3">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          placeholder="Posez votre question sur votre magasin…"
          disabled={loadingCtx}
          className="flex-1 rounded-xl px-4 py-3 text-[13px] outline-none"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={() => handleSend()}
          disabled={loading || !question.trim() || loadingCtx}
          className="rounded-xl px-5 py-3 text-[13px] font-bold transition-all"
          style={{
            background: loading || !question.trim() ? "var(--surfaceAlt)" : "var(--accent)",
            color: loading || !question.trim() ? "var(--textMuted)" : "#000",
            border: "none",
            cursor: loading || !question.trim() ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {loading ? "…" : "Envoyer →"}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-2xl p-5 border flex items-center gap-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ background: "var(--accent)" }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, delay: i * 0.3, repeat: Infinity }}
              />
            ))}
          </div>
          <span className="text-[12px]" style={{ color: "var(--textMuted)" }}>Analyse en cours…</span>
        </div>
      )}

      {/* Response */}
      {reponse && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 border"
          style={{ background: "var(--surface)", borderColor: "var(--accent)", borderLeftWidth: 4 }}
        >
          <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            Recommandation
          </div>
          <div className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>
            {reponse}
          </div>
          <button
            onClick={() => { setReponse(null); setQuestion(""); }}
            className="mt-4 text-[11px] underline"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--textMuted)", fontFamily: "inherit" }}
          >
            Nouvelle question
          </button>
        </motion.div>
      )}

      {/* Context preview */}
      {!loadingCtx && valeurs.filter((v) => v.status === "dg").length > 0 && !reponse && (
        <div className="rounded-xl p-4 border" style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)" }}>
          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--textMuted)" }}>
            KPIs en alerte dans ce magasin
          </div>
          <div className="flex flex-wrap gap-2">
            {valeurs
              .filter((v) => v.status === "dg")
              .slice(0, 8)
              .map((v, i) => (
                <span
                  key={i}
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{ background: "#ff4d6a18", color: "#ff4d6a", border: "1px solid #ff4d6a30" }}
                >
                  {v.indicateur_nom}: {v.valeur}{v.unite ?? ""}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { getStatus, computeScore, computeCategoryScores } from "@/lib/scoring";
import { generateNarrative } from "@/lib/narrative";
import type { Magasin, ValeurAvecIndicateur } from "@/types";
import { callRedacteurCR } from "@/lib/agents/redacteur";

interface Visite {
  id: string;
  date_visite: string;
  consultant: string;
  franchise: string | null;
  constats: string | null;
  notes_prochain: string | null;
  score_global: number | null;
}

interface VisiteScreenProps {
  magasin: Magasin | null;
  magasinId: string;
}

export function VisiteScreen({ magasin, magasinId }: VisiteScreenProps) {
  const [valeurs, setValeurs] = useState<ValeurAvecIndicateur[]>([]);
  const [actions, setActions] = useState<{ priorite: string; action: string; responsable: string | null; echeance: string | null; statut: string }[]>([]);
  const [visites, setVisites] = useState<Visite[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [aiNarrative, setAiNarrative] = useState("");
  const [generatingNarrative, setGeneratingNarrative] = useState(false);
  const [form, setForm] = useState({
    date_visite: new Date().toISOString().split("T")[0],
    consultant: "",
    franchise: magasin?.franchise ?? "",
    constats: "",
    notes_prochain: "",
  });

  const load = useCallback(async () => {
    if (!magasinId) return;
    setLoading(true);

    const [{ data: vData }, { data: aData }, { data: visData }] = await Promise.all([
      supabase.from("v_dernieres_valeurs").select("*").eq("magasin_id", magasinId),
      supabase.from("v_actions_ouvertes").select("*").eq("magasin_id", magasinId),
      supabase.from("visites").select("*").eq("magasin_id", magasinId).order("date_visite", { ascending: false }).limit(10),
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
    setVisites((visData ?? []) as Visite[]);
    setForm((prev) => ({ ...prev, franchise: magasin?.franchise ?? prev.franchise }));
    setLoading(false);
  }, [magasinId, magasin]);

  useEffect(() => { load(); }, [load]);

  const score = computeScore(valeurs);
  const categories = computeCategoryScores(valeurs);

  const narrative = generateNarrative({
    score,
    previousScore: visites[1]?.score_global ?? null,
    daysSinceLastVisit: visites.length >= 2
      ? Math.floor((Date.now() - new Date(visites[1].date_visite).getTime()) / 86400000)
      : null,
    categories,
    openActionsTotal: actions.length,
    openActionsDone: 0,
    openActionsLate: actions.filter((a) => a.echeance && new Date(a.echeance) < new Date()).length,
    magasinNom: magasin?.nom ?? "",
  });

  const handleGenerateAiNarrative = async () => {
    setGeneratingNarrative(true);
    try {
      const kpisAlertes = valeurs
        .filter((v) => v.status === "dg" || v.status === "wn")
        .map((v) => ({ nom: v.indicateur_nom, valeur: v.valeur, statut: v.status, seuil: v.seuil_ok }));

      const actionsPap = actions
        .filter((a) => a.priorite === "P1")
        .map((a) => ({ action: a.action, responsable: a.responsable, echeance: a.echeance }));

      const cr = await callRedacteurCR({
        magasin: magasin?.nom ?? "",
        date: form.date_visite,
        consultant: form.consultant,
        constats: form.constats,
        kpis_alertes: kpisAlertes,
        actions_pap: actionsPap,
      });
      setAiNarrative(cr);
    } catch (err) {
      console.error("Erreur génération CR IA:", err);
      setAiNarrative("Erreur lors de la génération — réessayez.");
    }
    setGeneratingNarrative(false);
  };

  const handleSave = async () => {
    if (!form.consultant || !form.date_visite) return;
    await (supabase as any).from("visites").upsert({
      magasin_id: magasinId,
      date_visite: form.date_visite,
      consultant: form.consultant,
      franchise: form.franchise,
      constats: form.constats,
      notes_prochain: form.notes_prochain,
      score_global: score,
    }, { onConflict: "magasin_id,date_visite" });
    load();
  };

  const handleExportWord = async () => {
    setGenerating(true);
    try {
      const {
        Document, Packer, Paragraph, Table, TableRow, TableCell,
        TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
        ShadingType,
      } = await import("docx");

      const statusLabel = (s: "ok" | "wn" | "dg" | null) =>
        s === "ok" ? "✓ OK" : s === "wn" ? "⚠ Vigilance" : s === "dg" ? "✗ Action" : "—";

      const rows = [
        new TableRow({
          children: [
            ...(["Indicateur", "Valeur", "Seuil OK", "Statut", "Action"].map((h) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF" })] })],
                shading: { type: ShadingType.SOLID, color: "C0392B" },
              })
            )),
          ],
        }),
        ...valeurs.map((v) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(v.indicateur_nom)] }),
              new TableCell({ children: [new Paragraph(`${v.valeur}${v.unite ?? ""}`)] }),
              new TableCell({ children: [new Paragraph(v.seuil_ok !== null ? `${v.seuil_ok}${v.unite ?? ""}` : "—")] }),
              new TableCell({ children: [new Paragraph(statusLabel(v.status ?? null))] }),
              new TableCell({ children: [new Paragraph(v.status !== "ok" ? (v.action_defaut ?? "") : "")] }),
            ],
          })
        ),
      ];

      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({
              text: "COMPTE RENDU DE VISITE",
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              children: [
                new TextRun({ text: `Magasin : ${magasin?.nom ?? ""}  |  Date : ${form.date_visite}  |  Consultant : ${form.consultant}`, bold: true }),
              ],
            }),
            new Paragraph({ text: "" }),
            new Paragraph({
              text: `Score global : ${score ?? "—"} / 100`,
              heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({ text: narrative }),
            ...(aiNarrative ? [
              new Paragraph({ text: "" }),
              new Paragraph({ text: "Synthèse IA", heading: HeadingLevel.HEADING_2 }),
              new Paragraph({ text: aiNarrative }),
            ] : []),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "Indicateurs détaillés", heading: HeadingLevel.HEADING_2 }),
            new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "Constats & observations", heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: form.constats || "—" }),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "Actions à mener", heading: HeadingLevel.HEADING_2 }),
            ...actions.map((a) =>
              new Paragraph({
                children: [
                  new TextRun({ text: `[${a.priorite}] `, bold: true }),
                  new TextRun(`${a.action} — Resp. : ${a.responsable ?? "—"} — Échéance : ${a.echeance ?? "—"}`),
                ],
              })
            ),
            new Paragraph({ text: "" }),
            new Paragraph({ text: "Points à traiter lors de la prochaine visite", heading: HeadingLevel.HEADING_2 }),
            new Paragraph({ text: form.notes_prochain || "—" }),
            new Paragraph({ text: "" }),
            new Paragraph({
              children: [
                new TextRun({ text: "Signature Consultant : ____________________    Signature Franchisé : ____________________", italics: true }),
              ],
            }),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CR_${(magasin?.nom ?? "magasin").replace(/ /g, "_")}_${form.date_visite}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erreur export Word:", err);
    }
    setGenerating(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[13px]" style={{ color: "var(--textMuted)" }}>Chargement…</div>
    </div>
  );

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 320px" }}>
      {/* Main form */}
      <div className="space-y-4">
        {/* Form */}
        <div className="rounded-2xl p-6 border space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>📋 Compte Rendu de Visite</div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "date_visite", label: "Date de visite", type: "date" },
              { key: "consultant", label: "Consultant", type: "text" },
              { key: "franchise", label: "Franchisé", type: "text" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>{label}</label>
                <input
                  type={type}
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-[12px] border"
                  style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>
              Constats & observations
            </label>
            <textarea
              value={form.constats}
              onChange={(e) => setForm((p) => ({ ...p, constats: e.target.value }))}
              rows={4}
              className="w-full rounded-lg px-3 py-2 text-[12px] border resize-none"
              style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
              placeholder="Décrire les observations faites pendant la visite…"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>
              Points pour la prochaine visite
            </label>
            <textarea
              value={form.notes_prochain}
              onChange={(e) => setForm((p) => ({ ...p, notes_prochain: e.target.value }))}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-[12px] border resize-none"
              style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          {/* Synthèse IA */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--surfaceAlt)" }}>
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--textMuted)" }}>Synthèse IA</div>
              <button
                onClick={handleGenerateAiNarrative}
                disabled={generatingNarrative}
                className="px-4 py-1.5 rounded-xl text-[11px] font-semibold border hover:opacity-90 disabled:opacity-50"
                style={{ borderColor: "#9b59b6", color: "#9b59b6", background: "#9b59b612" }}
              >
                {generatingNarrative ? "Génération…" : "✨ Générer la synthèse IA"}
              </button>
            </div>
            {aiNarrative && (
              <>
                <textarea
                  value={aiNarrative}
                  onChange={(e) => setAiNarrative(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg px-3 py-2 text-[12px] border resize-none"
                  style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                />
                <div className="text-[10px]" style={{ color: "var(--textDim)" }}>Généré par Claude IA · Modifiable avant export</div>
              </>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={handleSave} className="px-5 py-2.5 rounded-xl text-[12px] font-semibold hover:opacity-90" style={{ background: "var(--accent)", color: "#000" }}>
              💾 Enregistrer la visite
            </button>
            <button onClick={handleExportWord} disabled={generating} className="px-5 py-2.5 rounded-xl text-[12px] font-semibold border hover:opacity-90" style={{ borderColor: "#4da6ff", color: "#4da6ff", background: "#4da6ff12" }}>
              {generating ? "Génération…" : "📄 Générer CR Word"}
            </button>
          </div>
        </div>

        {/* Narrative preview */}
        <div className="rounded-2xl p-5 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--textMuted)" }}>
            Narratif auto-généré
          </div>
          <p className="text-[13px] leading-relaxed italic" style={{ color: "var(--textMuted)" }}>{narrative}</p>
        </div>

        {/* KPI summary table */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-widest" style={{ background: "var(--surface)", color: "var(--textMuted)", borderBottom: "1px solid var(--border)" }}>
            Récap indicateurs
          </div>
          <table className="w-full text-[11px]">
            <tbody>
              {valeurs.filter((v) => v.status === "dg" || v.status === "wn").slice(0, 12).map((v, i) => {
                const colors = { ok: "#00d4aa", wn: "#ffb347", dg: "#ff4d6a" };
                const c = v.status ? colors[v.status] : "#8b8fa3";
                return (
                  <tr key={v.indicateur_id} className="border-b" style={{ background: i % 2 === 0 ? "var(--surfaceAlt)" : "var(--surface)", borderColor: "var(--border)" }}>
                    <td className="px-4 py-2" style={{ color: "var(--text)" }}>{v.indicateur_nom}</td>
                    <td className="px-4 py-2 font-bold text-right" style={{ color: c }}>{v.valeur}{v.unite}</td>
                    <td className="px-4 py-2 text-[10px]" style={{ color: "var(--textMuted)" }}>cible: {v.seuil_ok}{v.unite}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sidebar: Visit history */}
      <div className="space-y-3">
        <div className="rounded-2xl p-4 border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--textMuted)" }}>
            Historique des visites
          </div>
          {visites.length === 0 ? (
            <div className="text-[12px] text-center py-6" style={{ color: "var(--textDim)" }}>Aucune visite enregistrée</div>
          ) : (
            <div className="space-y-2">
              {visites.map((v, i) => (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="p-3 rounded-xl border"
                  style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                      {new Date(v.date_visite).toLocaleDateString("fr-FR")}
                    </span>
                    {v.score_global !== null && (
                      <span className="text-[13px] font-bold" style={{ color: v.score_global >= 70 ? "#00d4aa" : v.score_global >= 45 ? "#ffb347" : "#ff4d6a" }}>
                        {v.score_global}/100
                      </span>
                    )}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--textMuted)" }}>{v.consultant}</div>
                  {v.constats && (
                    <div className="text-[10px] mt-1 line-clamp-2" style={{ color: "var(--textDim)" }}>{v.constats}</div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

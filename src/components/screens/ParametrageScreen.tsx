"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import type { Indicateur, Magasin } from "@/types";

type Tab = "indicateurs" | "magasins";

export function ParametrageScreen() {
  const [tab, setTab] = useState<Tab>("indicateurs");
  const [indicateurs, setIndicateurs] = useState<Indicateur[]>([]);
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingInd, setEditingInd] = useState<Partial<Indicateur> | null>(null);
  const [editingMag, setEditingMag] = useState<Partial<Magasin> | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: iData }, { data: mData }] = await Promise.all([
      supabase.from("indicateurs").select("*").order("categorie").order("ordre"),
      supabase.from("magasins").select("*").order("nom"),
    ]);
    setIndicateurs((iData ?? []) as Indicateur[]);
    setMagasins((mData ?? []) as Magasin[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // ── Indicateur CRUD ────────────────────────────────────────
  const saveIndicateur = async () => {
    if (!editingInd) return;
    if (editingInd.id) {
      await db.from("indicateurs").update(editingInd).eq("id", editingInd.id);
    } else {
      await db.from("indicateurs").insert(editingInd);
    }
    setEditingInd(null);
    load();
  };

  const deleteIndicateur = async (id: string) => {
    if (!confirm("Supprimer cet indicateur ? Les données associées seront perdues.")) return;
    await db.from("indicateurs").delete().eq("id", id);
    load();
  };

  // ── Magasin CRUD ───────────────────────────────────────────
  const saveMagasin = async () => {
    if (!editingMag) return;
    if (editingMag.id) {
      await db.from("magasins").update(editingMag).eq("id", editingMag.id);
    } else {
      await db.from("magasins").insert(editingMag);
    }
    setEditingMag(null);
    load();
  };

  const deleteMagasin = async (id: string) => {
    if (!confirm("Supprimer ce magasin ? TOUTES les données associées seront perdues.")) return;
    await db.from("magasins").delete().eq("id", id);
    load();
  };

  const filtered = indicateurs.filter((i) =>
    !filter || i.nom.toLowerCase().includes(filter.toLowerCase()) || i.categorie.toLowerCase().includes(filter.toLowerCase())
  );

  const cats = Array.from(new Set(indicateurs.map((i) => i.categorie)));

  if (loading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-[13px]" style={{ color: "var(--textMuted)" }}>Chargement…</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Tab selector */}
      <div className="flex gap-2">
        {(["indicateurs", "magasins"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold border transition-all capitalize"
            style={{
              background: tab === t ? "var(--accent)" : "var(--surface)",
              borderColor: tab === t ? "var(--accent)" : "var(--border)",
              color: tab === t ? "#000" : "var(--textMuted)",
            }}
          >
            {t === "indicateurs" ? "⚙️ Indicateurs" : "🏪 Magasins"}
          </button>
        ))}
      </div>

      {/* ── INDICATEURS TAB ─────────────────────────────────── */}
      {tab === "indicateurs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Rechercher un indicateur…"
              className="rounded-xl px-4 py-2 text-[12px] border flex-1 max-w-sm"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            <button
              onClick={() => setEditingInd({ direction: "up", poids: 1, categorie: cats[0] ?? "", ordre: 0 })}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              + Nouvel indicateur
            </button>
          </div>

          {/* Edit form */}
          <AnimatePresence>
            {editingInd && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-2xl p-6 border"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="text-[13px] font-bold mb-4" style={{ color: "var(--text)" }}>
                  {editingInd.id ? "Modifier l'indicateur" : "Nouvel indicateur"}
                </div>
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  {[
                    { key: "nom", label: "Nom *", type: "text" },
                    { key: "unite", label: "Unité", type: "text" },
                    { key: "seuil_ok", label: "Seuil OK", type: "number" },
                    { key: "seuil_vigilance", label: "Seuil Vigilance", type: "number" },
                    { key: "poids", label: "Poids (1-5)", type: "number" },
                    { key: "ordre", label: "Ordre", type: "number" },
                  ].map(({ key, label, type }) => (
                    <div key={key}>
                      <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>{label}</label>
                      <input
                        type={type}
                        value={(editingInd as Record<string, string | number | null | undefined>)[key] ?? ""}
                        onChange={(e) => setEditingInd((p) => ({ ...p!, [key]: type === "number" ? parseFloat(e.target.value) || 0 : e.target.value }))}
                        className="w-full rounded-lg px-3 py-2 text-[12px] border"
                        style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                      />
                    </div>
                  ))}
                  <div>
                    <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>Direction</label>
                    <select
                      value={editingInd.direction ?? "up"}
                      onChange={(e) => setEditingInd((p) => ({ ...p!, direction: e.target.value as "up" | "down" }))}
                      className="w-full rounded-lg px-3 py-2 text-[12px] border"
                      style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                    >
                      <option value="up">↑ Plus = mieux</option>
                      <option value="down">↓ Moins = mieux</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>Catégorie</label>
                    <select
                      value={editingInd.categorie ?? ""}
                      onChange={(e) => setEditingInd((p) => ({ ...p!, categorie: e.target.value }))}
                      className="w-full rounded-lg px-3 py-2 text-[12px] border"
                      style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                    >
                      {cats.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>Action par défaut</label>
                    <input
                      type="text"
                      value={editingInd.action_defaut ?? ""}
                      onChange={(e) => setEditingInd((p) => ({ ...p!, action_defaut: e.target.value }))}
                      className="w-full rounded-lg px-3 py-2 text-[12px] border"
                      style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={saveIndicateur} className="px-5 py-2 rounded-xl text-[12px] font-semibold" style={{ background: "var(--accent)", color: "#000" }}>
                    {editingInd.id ? "Mettre à jour" : "Créer"}
                  </button>
                  <button onClick={() => setEditingInd(null)} className="px-5 py-2 rounded-xl text-[12px] border" style={{ borderColor: "var(--border)", color: "var(--textMuted)" }}>
                    Annuler
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Indicators table */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                  {["Nom", "Catégorie", "Direction", "OK", "Vigilance", "Poids", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--textMuted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((ind, i) => (
                  <tr
                    key={ind.id}
                    className="border-b"
                    style={{ background: i % 2 === 0 ? "var(--surfaceAlt)" : "var(--surface)", borderColor: "var(--border)" }}
                  >
                    <td className="px-4 py-2.5 font-medium" style={{ color: "var(--text)" }}>{ind.nom}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--textMuted)" }}>{ind.categorie}</td>
                    <td className="px-4 py-2.5" style={{ color: ind.direction === "up" ? "#00d4aa" : "#ffb347" }}>
                      {ind.direction === "up" ? "↑" : "↓"} {ind.unite}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "#00d4aa" }}>{ind.seuil_ok ?? "—"}</td>
                    <td className="px-4 py-2.5" style={{ color: "#ffb347" }}>{ind.seuil_vigilance ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#4da6ff18", color: "#4da6ff" }}>
                        ×{ind.poids}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => setEditingInd({ ...ind })} className="hover:opacity-70 text-[11px]" style={{ color: "var(--textMuted)" }}>✏️</button>
                        <button onClick={() => deleteIndicateur(ind.id)} className="hover:opacity-70 text-[11px]" style={{ color: "#ff4d6a" }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px]" style={{ color: "var(--textDim)" }}>
            {filtered.length} indicateur{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* ── MAGASINS TAB ─────────────────────────────────────── */}
      {tab === "magasins" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setEditingMag({ nom: "", ville: "", franchise: "" })}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold"
              style={{ background: "var(--accent)", color: "#000" }}
            >
              + Nouveau magasin
            </button>
          </div>

          <AnimatePresence>
            {editingMag && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-2xl p-6 border"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="text-[13px] font-bold mb-4" style={{ color: "var(--text)" }}>
                  {editingMag.id ? "Modifier le magasin" : "Nouveau magasin"}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: "nom", label: "Nom *" },
                    { key: "ville", label: "Ville" },
                    { key: "franchise", label: "Franchisé" },
                    { key: "adresse", label: "Adresse" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>{label}</label>
                      <input
                        type="text"
                        value={(editingMag as Record<string, string>)[key] ?? ""}
                        onChange={(e) => setEditingMag((p) => ({ ...p!, [key]: e.target.value }))}
                        className="w-full rounded-lg px-3 py-2 text-[12px] border"
                        style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-4">
                  <button onClick={saveMagasin} className="px-5 py-2 rounded-xl text-[12px] font-semibold" style={{ background: "var(--accent)", color: "#000" }}>
                    {editingMag.id ? "Mettre à jour" : "Créer"}
                  </button>
                  <button onClick={() => setEditingMag(null)} className="px-5 py-2 rounded-xl text-[12px] border" style={{ borderColor: "var(--border)", color: "var(--textMuted)" }}>
                    Annuler
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {magasins.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl p-4 border"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="font-semibold text-[13px] mb-1" style={{ color: "var(--text)" }}>{m.nom}</div>
                <div className="text-[11px] mb-0.5" style={{ color: "var(--textMuted)" }}>{m.ville}</div>
                <div className="text-[11px] mb-3" style={{ color: "var(--textDim)" }}>{m.franchise}</div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingMag({ ...m })} className="text-[11px] px-3 py-1 rounded-lg border hover:opacity-80" style={{ borderColor: "var(--border)", color: "var(--textMuted)" }}>
                    ✏️ Modifier
                  </button>
                  <button onClick={() => deleteMagasin(m.id)} className="text-[11px] px-3 py-1 rounded-lg border hover:opacity-80" style={{ borderColor: "#ff4d6a30", color: "#ff4d6a" }}>
                    🗑 Supprimer
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

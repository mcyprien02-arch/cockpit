"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import type { Indicateur, Magasin } from "@/types";

type Tab = "indicateurs" | "magasins" | "rse";

interface ImportMapping {
  id: string;
  mot_cle: string;
  indicateur_id: string | null;
  indicateur_nom?: string;
}

const CREATE_TABLE_SQL = `create table if not exists import_mappings (
  id uuid default gen_random_uuid() primary key,
  mot_cle text not null,
  indicateur_id uuid references indicateurs(id) on delete cascade,
  created_at timestamptz default now(),
  unique(mot_cle)
);
alter table import_mappings enable row level security;
create policy "Accès complet" on import_mappings for all using (true);`;

export function ParametrageScreen() {
  const [tab, setTab] = useState<Tab>("indicateurs");
  const [indicateurs, setIndicateurs] = useState<Indicateur[]>([]);
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingInd, setEditingInd] = useState<Partial<Indicateur> | null>(null);
  const [editingMag, setEditingMag] = useState<Partial<Magasin> | null>(null);
  const [filter, setFilter] = useState("");
  const [mappings, setMappings] = useState<ImportMapping[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [mappingsError, setMappingsError] = useState(false);
  const [newMotCle, setNewMotCle] = useState("");
  const [newIndicateurId, setNewIndicateurId] = useState("");
  const [rseChecks, setRseChecks] = useState<Record<string, boolean>>({});
  const [showSql, setShowSql] = useState(false);

  const RSE_ITEMS = [
    { key: "tri_dechets", label: "Tri des déchets en place (carton, D3E, piles)" },
    { key: "trackdechets", label: "Suivi Trackdéchets actif" },
    { key: "eclairage_led", label: "Éclairage LED / écrans éteints 1 sur 3" },
    { key: "espace_don", label: "Espace don en magasin (livres, CD, DVD)" },
    { key: "partenariat_asso", label: "Partenariat association locale active" },
    { key: "formation_equipe", label: "Formation équipe proposée ce semestre" },
    { key: "avantages_salariaux", label: "Avantages salariaux en place (primes, CE, tickets resto)" },
    { key: "reprise_1pour1", label: "Reprise 1 pour 1 équipements clients" },
    { key: "sourcing_local", label: "Sourcing local privilégié vs neuf" },
    { key: "rapport_rse", label: "Rapport RSE communiqué (magasin, Google Business)" },
  ];

  const rseScore = RSE_ITEMS.filter(item => rseChecks[item.key]).length;

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

  useEffect(() => {
    const saved = localStorage.getItem("rse_checks");
    if (saved) setRseChecks(JSON.parse(saved));
  }, []);

  const toggleRse = (key: string) => {
    setRseChecks(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("rse_checks", JSON.stringify(next));
      return next;
    });
  };

  const loadMappings = useCallback(async () => {
    setLoadingMappings(true);
    setMappingsError(false);
    const { data, error } = await (supabase as any).from("import_mappings").select("id, mot_cle, indicateur_id, indicateurs(nom)");
    if (error) {
      setMappingsError(true);
      setLoadingMappings(false);
      return;
    }
    setMappings(((data ?? []) as Array<{ id: string; mot_cle: string; indicateur_id: string | null; indicateurs: { nom: string } | null }>).map((r) => ({
      id: r.id,
      mot_cle: r.mot_cle,
      indicateur_id: r.indicateur_id,
      indicateur_nom: r.indicateurs?.nom ?? "",
    })));
    setLoadingMappings(false);
  }, []);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  const addMapping = async () => {
    if (!newMotCle.trim() || !newIndicateurId) return;
    await (supabase as any).from("import_mappings").upsert({ mot_cle: newMotCle.trim(), indicateur_id: newIndicateurId }, { onConflict: "mot_cle" });
    setNewMotCle("");
    setNewIndicateurId("");
    loadMappings();
  };

  const deleteMapping = async (id: string) => {
    await (supabase as any).from("import_mappings").delete().eq("id", id);
    loadMappings();
  };

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
        {(["indicateurs", "magasins", "rse"] as const).map((t) => (
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
            {t === "indicateurs" ? "⚙️ Indicateurs" : t === "magasins" ? "🏪 Magasins" : "♻️ RSE"}
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

          {/* SQL tables info box */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={() => setShowSql(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              style={{ background: "var(--surface)" }}
            >
              <span className="text-[12px] font-semibold" style={{ color: "var(--textMuted)" }}>🛠 Voir SQL tables avancées</span>
              <span className="text-[11px]" style={{ color: "var(--textDim)" }}>{showSql ? "▲" : "▼"}</span>
            </button>
            {showSql && (
              <pre className="p-4 text-[11px] overflow-x-auto leading-relaxed" style={{ background: "#0d1117", color: "#c9d1d9", borderTop: "1px solid var(--border)" }}>
{`-- Table diagnostic GPA
create table if not exists diagnostic_gpa (
  id uuid default gen_random_uuid() primary key,
  magasin_id uuid references magasins(id) on delete cascade,
  date date not null,
  score numeric,
  commentaire text,
  created_at timestamptz default now()
);
alter table diagnostic_gpa enable row level security;
create policy "Accès complet" on diagnostic_gpa for all using (true);

-- Table checklist RSE
create table if not exists rse_checklist (
  id uuid default gen_random_uuid() primary key,
  magasin_id uuid references magasins(id) on delete cascade,
  periode text not null,
  checks jsonb default '{}',
  score integer default 0,
  created_at timestamptz default now(),
  unique(magasin_id, periode)
);
alter table rse_checklist enable row level security;
create policy "Accès complet" on rse_checklist for all using (true);`}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* ── IMPORT MAPPINGS SECTION ─────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        <div className="px-5 py-4 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="text-[13px] font-bold" style={{ color: "var(--text)" }}>🗂 Mots-clés d&apos;import personnalisés</div>
          <div className="text-[11px] mt-1" style={{ color: "var(--textMuted)" }}>Ces associations sont utilisées lors du copier-coller intranet</div>
        </div>
        <div className="p-5 space-y-4" style={{ background: "var(--surfaceAlt)" }}>
          {mappingsError ? (
            <div className="space-y-3">
              <div className="text-[12px]" style={{ color: "#ff4d6a" }}>
                Table <code>import_mappings</code> non créée. SQL disponible dans la doc.
              </div>
              <pre className="rounded-xl p-4 text-[11px] overflow-x-auto" style={{ background: "var(--bg)", color: "var(--textMuted)", border: "1px solid var(--border)" }}>
                {CREATE_TABLE_SQL}
              </pre>
            </div>
          ) : loadingMappings ? (
            <div className="text-[12px]" style={{ color: "var(--textMuted)" }}>Chargement…</div>
          ) : (
            <>
              {/* Add form */}
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>Mot-clé</label>
                  <input
                    value={newMotCle}
                    onChange={(e) => setNewMotCle(e.target.value)}
                    placeholder="ex: taux_rachat"
                    className="w-full rounded-lg px-3 py-2 text-[12px] border"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--textMuted)" }}>Indicateur cible</label>
                  <select
                    value={newIndicateurId}
                    onChange={(e) => setNewIndicateurId(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-[12px] border"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                  >
                    <option value="">— Sélectionner —</option>
                    {indicateurs.map((ind) => (
                      <option key={ind.id} value={ind.id}>{ind.nom}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={addMapping}
                  disabled={!newMotCle.trim() || !newIndicateurId}
                  className="px-4 py-2 rounded-xl text-[12px] font-semibold disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "#000" }}
                >
                  Ajouter
                </button>
              </div>

              {/* Table */}
              {mappings.length === 0 ? (
                <div className="text-[12px] text-center py-4" style={{ color: "var(--textDim)" }}>Aucun mot-clé configuré</div>
              ) : (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                        {["Mot-clé", "Indicateur cible", ""].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--textMuted)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mappings.map((m, i) => (
                        <tr key={m.id} className="border-b" style={{ background: i % 2 === 0 ? "var(--surfaceAlt)" : "var(--surface)", borderColor: "var(--border)" }}>
                          <td className="px-4 py-2.5 font-mono" style={{ color: "var(--text)" }}>{m.mot_cle}</td>
                          <td className="px-4 py-2.5" style={{ color: "var(--textMuted)" }}>{m.indicateur_nom ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <button onClick={() => deleteMapping(m.id)} className="hover:opacity-70 text-[11px]" style={{ color: "#ff4d6a" }}>🗑</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── RSE TAB ──────────────────────────────────────────── */}
      {tab === "rse" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Checklist RSE</div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--textMuted)" }}>Responsabilité sociétale et environnementale</div>
            </div>
            <span className="text-[15px] font-bold px-4 py-1.5 rounded-xl" style={{
              background: rseScore >= 7 ? "#00d4aa22" : rseScore >= 4 ? "#ffb34722" : "#ff4d6a22",
              color: rseScore >= 7 ? "#00d4aa" : rseScore >= 4 ? "#ffb347" : "#ff4d6a",
            }}>
              {rseScore}/10
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface)" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{
              width: `${rseScore * 10}%`,
              background: rseScore >= 7 ? "#00d4aa" : rseScore >= 4 ? "#ffb347" : "#ff4d6a",
            }} />
          </div>
          <div className="space-y-2">
            {RSE_ITEMS.map((item) => (
              <div
                key={item.key}
                onClick={() => toggleRse(item.key)}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:opacity-90 transition-all"
                style={{ background: "var(--surfaceAlt)", border: "1px solid var(--border)" }}
              >
                <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{
                  background: rseChecks[item.key] ? "#00d4aa" : "var(--surface)",
                  border: "2px solid",
                  borderColor: rseChecks[item.key] ? "#00d4aa" : "var(--border)",
                }}>
                  {rseChecks[item.key] && <span className="text-[11px] text-black font-bold">✓</span>}
                </div>
                <span className="text-[13px]" style={{ color: "var(--text)" }}>{item.label}</span>
              </div>
            ))}
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

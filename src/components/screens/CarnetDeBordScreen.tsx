"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

interface Note {
  id: string;
  date_note: string;
  contenu: string;
  tags: string[];
  auteur: string;
}

const ALL_TAGS = ["stock", "equipe", "client", "prix", "action", "autre"];
const TAG_COLORS: Record<string, string> = {
  stock: "#6b8fa3", equipe: "#a78bfa", client: "#00d4aa",
  prix: "#ffb347", action: "#ff4d6a", autre: "#8b8fa3",
};

// Fallback localStorage
function localKey(magasinId: string) { return `carnet_notes_${magasinId}`; }
function loadLocal(magasinId: string): Note[] {
  try { const d = localStorage.getItem(localKey(magasinId)); return d ? JSON.parse(d) : []; } catch { return []; }
}
function saveLocal(magasinId: string, notes: Note[]) {
  try { localStorage.setItem(localKey(magasinId), JSON.stringify(notes)); } catch { /**/ }
}

export function CarnetDeBordScreen({ magasinId }: { magasinId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContenu, setNewContenu] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [newAuteur, setNewAuteur] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [useDb, setUseDb] = useState(true);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("carnet")
      .select("id, date_note, contenu, tags, auteur")
      .eq("magasin_id", magasinId)
      .order("date_note", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      setUseDb(false);
      setNotes(loadLocal(magasinId));
    } else {
      setNotes((data ?? []) as Note[]);
    }
    setLoading(false);
  }, [magasinId]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const addNote = async () => {
    if (!newContenu.trim()) return;
    const note: Note = {
      id: crypto.randomUUID(),
      date_note: new Date().toISOString().split("T")[0],
      contenu: newContenu.trim(),
      tags: newTags,
      auteur: newAuteur.trim() || "Consultant",
    };

    if (useDb) {
      await (supabase as any).from("carnet").insert({
        magasin_id: magasinId,
        date_note: note.date_note,
        contenu: note.contenu,
        tags: note.tags,
        auteur: note.auteur,
      });
      loadNotes();
    } else {
      const updated = [note, ...notes];
      setNotes(updated);
      saveLocal(magasinId, updated);
    }
    setNewContenu("");
    setNewTags([]);
  };

  const deleteNote = async (id: string) => {
    if (useDb) {
      await (supabase as any).from("carnet").delete().eq("id", id);
      loadNotes();
    } else {
      const updated = notes.filter(n => n.id !== id);
      setNotes(updated);
      saveLocal(magasinId, updated);
    }
  };

  const toggleTag = (tag: string) =>
    setNewTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const filtered = filterTag ? notes.filter(n => n.tags?.includes(filterTag)) : notes;

  // Group by month
  const grouped: Record<string, Note[]> = {};
  filtered.forEach(n => {
    const month = n.date_note ? n.date_note.slice(0, 7) : "?";
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(n);
  });

  const formatMonth = (ym: string) => {
    if (ym === "?") return "Date inconnue";
    const [y, m] = ym.split("-");
    const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    return `${months[parseInt(m) - 1]} ${y}`;
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[18px] font-bold" style={{ color: "var(--text)" }}>📓 Carnet de bord</div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--textMuted)" }}>
            Mémoire du magasin — notes libres, chronologiques
          </div>
        </div>
        {!useDb && (
          <div className="text-[10px] px-2 py-1 rounded" style={{ background: "#ffb34722", color: "#ffb347" }}>
            Mode local (table carnet manquante)
          </div>
        )}
      </div>

      {/* New note form */}
      <div className="rounded-2xl p-5 border space-y-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <textarea
          value={newContenu}
          onChange={e => setNewContenu(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote(); }}
          placeholder="Une observation, une idée, un événement... (Ctrl+Entrée pour valider)"
          rows={3}
          className="w-full rounded-xl px-4 py-3 text-[13px] border resize-none focus:outline-none focus:ring-1"
          style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-wrap gap-2">
            {ALL_TAGS.map(tag => (
              <button key={tag} onClick={() => toggleTag(tag)}
                className="px-3 py-1 rounded-full text-[11px] font-semibold border transition-all"
                style={{
                  background: newTags.includes(tag) ? `${TAG_COLORS[tag]}22` : "var(--surface)",
                  borderColor: newTags.includes(tag) ? TAG_COLORS[tag] : "var(--border)",
                  color: newTags.includes(tag) ? TAG_COLORS[tag] : "var(--textMuted)",
                }}>
                #{tag}
              </button>
            ))}
            <input
              value={newAuteur}
              onChange={e => setNewAuteur(e.target.value)}
              placeholder="Auteur (optionnel)"
              className="rounded-lg px-3 py-1 text-[11px] border"
              style={{ background: "var(--surfaceAlt)", borderColor: "var(--border)", color: "var(--text)", width: 130 }}
            />
          </div>
          <button
            onClick={addNote}
            disabled={!newContenu.trim()}
            className="px-5 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-50 hover:opacity-90"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            + Ajouter
          </button>
        </div>
      </div>

      {/* Tag filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilterTag(null)}
          className="px-3 py-1 rounded-full text-[11px] font-semibold border"
          style={{
            background: filterTag === null ? "var(--accent)" : "var(--surface)",
            borderColor: filterTag === null ? "var(--accent)" : "var(--border)",
            color: filterTag === null ? "#000" : "var(--textMuted)",
          }}>
          Toutes ({notes.length})
        </button>
        {ALL_TAGS.filter(t => notes.some(n => n.tags?.includes(t))).map(tag => (
          <button key={tag} onClick={() => setFilterTag(tag === filterTag ? null : tag)}
            className="px-3 py-1 rounded-full text-[11px] font-semibold border"
            style={{
              background: filterTag === tag ? `${TAG_COLORS[tag]}22` : "var(--surface)",
              borderColor: filterTag === tag ? TAG_COLORS[tag] : "var(--border)",
              color: filterTag === tag ? TAG_COLORS[tag] : "var(--textMuted)",
            }}>
            #{tag} ({notes.filter(n => n.tags?.includes(tag)).length})
          </button>
        ))}
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="text-center py-8" style={{ color: "var(--textMuted)" }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--textMuted)" }}>
          <div className="text-[32px] mb-2">📝</div>
          <div className="text-[13px]">Aucune note pour l&apos;instant</div>
          <div className="text-[11px] mt-1" style={{ color: "var(--textDim)" }}>
            Commencez par noter une observation ou un événement
          </div>
        </div>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([month, monthNotes]) => (
            <div key={month}>
              <div className="text-[11px] font-bold uppercase tracking-widest mb-3 px-1" style={{ color: "var(--textMuted)" }}>
                {formatMonth(month)}
              </div>
              <div className="space-y-2">
                <AnimatePresence>
                  {monthNotes.map((note, i) => (
                    <motion.div
                      key={note.id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }} transition={{ delay: i * 0.03 }}
                      className="rounded-xl p-4 border group"
                      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text)" }}>
                            {note.contenu}
                          </p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {note.tags?.map(tag => (
                              <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: `${TAG_COLORS[tag] ?? "#8b8fa3"}18`, color: TAG_COLORS[tag] ?? "#8b8fa3" }}>
                                #{tag}
                              </span>
                            ))}
                            <span className="text-[10px]" style={{ color: "var(--textDim)" }}>
                              {note.date_note ? new Date(note.date_note).toLocaleDateString("fr-FR") : ""}
                              {note.auteur ? ` · ${note.auteur}` : ""}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] hover:opacity-70 shrink-0"
                          style={{ color: "#ff4d6a" }}
                        >
                          🗑
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))
      )}
    </div>
  );
}

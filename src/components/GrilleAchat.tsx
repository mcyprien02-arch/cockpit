'use client';

import { useState, useEffect, useMemo } from 'react';
import type { PAPAction } from '@/types';

interface Props {
  magasinNom: string;
  onAddAction: (action: PAPAction) => void;
}

type NiveauCritere = 4 | 2 | 0 | null;

interface SessionGrille {
  id: string;
  acheteur: string;
  date: string;
  contexte: string;
  criteres: Record<string, NiveauCritere>;
  scoreTotal: number;
  scoresSection: Record<string, number>;
}

const SECTIONS = [
  {
    id: 'A',
    label: 'Accueil Client',
    criteres: [
      { id: 'A1', label: 'Bonjour / sourire à l\'entrée' },
      { id: 'A2', label: 'Question d\'ouverture dès la 1ère visite' },
      { id: 'A3', label: 'Présentation de l\'enseigne (nouveaux clients)' },
      { id: 'A4', label: 'MAJ des coordonnées (clients connus)' },
      { id: 'A5', label: 'Présentation des conditions de vente' },
    ],
  },
  {
    id: 'B',
    label: 'Découverte et Valorisation Produit',
    criteres: [
      { id: 'B1', label: 'Questions ouvertes pour cerner les besoins' },
      { id: 'B2', label: 'Valorisation positive du produit' },
      { id: 'B3', label: 'Pas de valorisation « à plat » ou dépréciative' },
      { id: 'B4', label: 'Vérification des accessoires et de l\'état' },
      { id: 'B5', label: 'Démonstration de connaissance produit' },
    ],
  },
  {
    id: 'C',
    label: 'Application de la VPD',
    criteres: [
      { id: 'C1', label: '5 questions VPD posées avant annonce du prix' },
      { id: 'C2', label: 'Justification du prix (pédagogie côte)' },
      { id: 'C3', label: 'Proposition bon d\'achat si demande supérieure' },
      { id: 'C4', label: 'Maintien de la proposition 15 j si refus' },
      { id: 'C5', label: 'Prise en compte des attentes sans céder les fondamentaux' },
    ],
  },
  {
    id: 'D',
    label: 'Test et Validation',
    criteres: [
      { id: 'D1', label: 'Test Piceasoft / fonctionnel effectué' },
      { id: 'D2', label: 'Renégociation si test partiel' },
      { id: 'D3', label: 'Dédramatisation si produit non fonctionnel' },
      { id: 'D4', label: 'Signature acte d\'achat (2 ex. métaux précieux)' },
      { id: 'D5', label: 'Saisie via F3 ou fiche manuelle conforme' },
    ],
  },
  {
    id: 'E',
    label: 'Appel de Stock et Fidélisation',
    criteres: [
      { id: 'E1', label: 'Appel de stock oral ciblé' },
      { id: 'E2', label: 'Demande d\'avis Google' },
      { id: 'E3', label: 'Présentation du programme fidélité' },
      { id: 'E4', label: 'Prise de congé sincère et personnalisée' },
      { id: 'E5', label: 'Renseignement fiche client Athéna' },
    ],
  },
];

const NIVEAUX: { value: NiveauCritere; label: string; bg: string; text: string }[] = [
  { value: 4,    label: '✅ Acquis',      bg: 'bg-green-100',  text: 'text-green-700'  },
  { value: 2,    label: '🟡 Partiel',     bg: 'bg-yellow-100', text: 'text-yellow-700' },
  { value: 0,    label: '❌ Non acquis',  bg: 'bg-red-100',    text: 'text-red-700'    },
  { value: null, label: '— N/A',          bg: 'bg-gray-100',   text: 'text-gray-400'   },
];

function scoreColor(score: number): string {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  if (score >= 50) return 'text-orange-500';
  return 'text-red-600';
}

function scoreBadge(score: number): string {
  if (score >= 90) return '🟢';
  if (score >= 70) return '🟡';
  if (score >= 50) return '🟠';
  return '🔴';
}

function computeScores(criteres: Record<string, NiveauCritere>) {
  const scoresSection: Record<string, number> = {};
  let totalPts = 0, totalMax = 0;
  SECTIONS.forEach(sec => {
    let pts = 0, max = 0;
    sec.criteres.forEach(c => {
      const v = criteres[c.id];
      if (v !== null && v !== undefined) { pts += v; max += 4; }
    });
    scoresSection[sec.id] = max > 0 ? Math.round((pts / max) * 100) : -1;
    totalPts += pts;
    totalMax += max;
  });
  const scoreTotal = totalMax > 0 ? Math.round((totalPts / totalMax) * 100) : 0;
  return { scoresSection, scoreTotal };
}

function storageKey(nom: string) { return `grille_achat_${nom}`; }

function loadSessions(nom: string): SessionGrille[] {
  try {
    const s = localStorage.getItem(storageKey(nom));
    return s ? (JSON.parse(s) as SessionGrille[]) : [];
  } catch { return []; }
}

function saveSessions(nom: string, sessions: SessionGrille[]) {
  localStorage.setItem(storageKey(nom), JSON.stringify(sessions));
}

export function getGrilleAchatContext(nom: string): string {
  try {
    const sessions = loadSessions(nom);
    if (!sessions.length) return '';
    const recent = sessions.slice(-6);
    const byBuyer: Record<string, number[]> = {};
    recent.forEach(s => {
      if (!byBuyer[s.acheteur]) byBuyer[s.acheteur] = [];
      byBuyer[s.acheteur].push(s.scoreTotal);
    });
    const parts = Object.entries(byBuyer).map(([buyer, scores]) => {
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      return `${buyer} (moy. ${avg}/100)`;
    });
    return `Grille Achat — ${sessions.length} audit(s) : ${parts.join(', ')}`;
  } catch { return ''; }
}

export default function GrilleAchat({ magasinNom, onAddAction }: Props) {
  const [sessions, setSessions] = useState<SessionGrille[]>([]);
  const [activeTab, setActiveTab] = useState<'saisie' | 'historique'>('saisie');

  // Form state
  const [acheteur, setAcheteur] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [contexte, setContexte] = useState('');
  const [criteres, setCriteres] = useState<Record<string, NiveauCritere>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    setSessions(loadSessions(magasinNom));
  }, [magasinNom]);

  const { scoresSection, scoreTotal } = useMemo(() => computeScores(criteres), [criteres]);

  const allFilled = useMemo(() =>
    SECTIONS.every(sec => sec.criteres.every(c => criteres[c.id] !== undefined)),
    [criteres]
  );

  const acheteurs = useMemo(() => {
    const set = new Set(sessions.map(s => s.acheteur).filter(Boolean));
    return Array.from(set);
  }, [sessions]);

  function setCritere(id: string, val: NiveauCritere) {
    setCriteres(prev => ({ ...prev, [id]: val }));
  }

  function handleSave() {
    if (!acheteur.trim() || !allFilled) return;
    const { scoresSection: ss, scoreTotal: st } = computeScores(criteres);
    const session: SessionGrille = {
      id: String(Date.now()),
      acheteur: acheteur.trim(),
      date,
      contexte,
      criteres: { ...criteres },
      scoreTotal: st,
      scoresSection: ss,
    };
    const updated = [...sessions, session];
    setSessions(updated);
    saveSessions(magasinNom, updated);
    setSavedId(session.id);

    // +PAP per section < 50%
    const d = new Date(); d.setDate(d.getDate() + 14);
    SECTIONS.forEach(sec => {
      if ((ss[sec.id] ?? 100) < 50) {
        onAddAction({
          id: String(Date.now() + Math.random()),
          titre: `Grille Achat — ${acheteur.trim()} : section ${sec.id} (${sec.label}) en alerte`,
          axe: 'Commerce',
          pilote: 'Franchisé',
          copilote: acheteur.trim(),
          description: `Score section ${sec.id} — ${sec.label} : ${ss[sec.id]}%. Objectif : ≥ 50%. Retravailler les critères non acquis.`,
          echeance: d.toISOString().slice(0, 10),
          priorite: 2,
          gain: 0,
          statut: 'À faire',
        });
      }
    });
    if (st < 50) {
      onAddAction({
        id: String(Date.now() + 1),
        titre: `Grille Achat — ${acheteur.trim()} : score global critique (${st}/100)`,
        axe: 'Commerce',
        pilote: 'Franchisé',
        copilote: acheteur.trim(),
        description: `Score global Grille Achat : ${st}/100 (seuil ≥ 50%). Plan de formation individuel requis.`,
        echeance: d.toISOString().slice(0, 10),
        priorite: 1,
        gain: 0,
        statut: 'À faire',
      });
    }

    // Reset
    setCriteres({});
    setContexte('');
    setActiveTab('historique');
  }

  function handleDelete(id: string) {
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    saveSessions(magasinNom, updated);
  }

  // Per-buyer last-6 evolution
  const buyerEvolution = useMemo(() => {
    const map: Record<string, SessionGrille[]> = {};
    sessions.forEach(s => {
      if (!map[s.acheteur]) map[s.acheteur] = [];
      map[s.acheteur].push(s);
    });
    return map;
  }, [sessions]);

  // Mini sparkline
  function Sparkline({ scores }: { scores: number[] }) {
    if (scores.length < 2) return null;
    const h = 32, w = 80;
    const max = 100, min = 0;
    const pts = scores.slice(-6).map((s, i, arr) => {
      const x = (i / (arr.length - 1)) * w;
      const y = h - ((s - min) / (max - min)) * h;
      return `${x},${y}`;
    }).join(' ');
    return (
      <svg width={w} height={h} className="inline-block">
        <polyline points={pts} fill="none" stroke="#E30613" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  const completionPct = useMemo(() => {
    const total = SECTIONS.reduce((acc, sec) => acc + sec.criteres.length, 0);
    const filled = Object.keys(criteres).filter(k => criteres[k] !== undefined).length;
    return Math.round((filled / total) * 100);
  }, [criteres]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A]">📋 Grille Achat</h1>
          <p className="text-xs text-[#6B7280] mt-0.5">Audit des pratiques acheteur — 25 critères · 5 sections</p>
        </div>
        <div className="flex gap-2">
          {(['saisie', 'historique'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setActiveTab(t); setSavedId(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === t ? 'bg-[#E30613] text-white' : 'bg-white border border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#F5F5F5]'
              }`}
            >
              {t === 'saisie' ? '+ Nouvel audit' : `Historique (${sessions.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── SAISIE ────────────────────────────────────────────────────────── */}
      {activeTab === 'saisie' && (
        <div className="space-y-4">
          {savedId && (
            <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-3 text-green-700 text-sm font-semibold">
              ✓ Audit enregistré. Consultez l&apos;historique pour voir l&apos;évolution.
            </div>
          )}

          {/* Header session */}
          <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4">
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3">Informations de la session</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-[#6B7280] block mb-1">Acheteur *</label>
                <input
                  list="acheteurs-list"
                  className="w-full bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
                  value={acheteur}
                  onChange={e => setAcheteur(e.target.value)}
                  placeholder="Prénom Nom"
                />
                <datalist id="acheteurs-list">
                  {acheteurs.map(a => <option key={a} value={a} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-[#6B7280] block mb-1">Date</label>
                <input
                  type="date"
                  className="w-full bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-[#6B7280] block mb-1">Contexte</label>
                <input
                  className="w-full bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613]"
                  value={contexte}
                  onChange={e => setContexte(e.target.value)}
                  placeholder="ex: GSM, Bijoux, Jeux vidéo…"
                />
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-[#E0E0E0] rounded-full overflow-hidden">
              <div className="h-full bg-[#E30613] rounded-full transition-all" style={{ width: `${completionPct}%` }} />
            </div>
            <span className="text-xs text-[#6B7280] w-10 text-right">{completionPct}%</span>
          </div>

          {/* Sections */}
          {SECTIONS.map(sec => {
            const sc = scoresSection[sec.id];
            const hasScore = sc >= 0;
            return (
              <div key={sec.id} className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
                <div className={`flex items-center justify-between px-4 py-3 border-b border-[#E0E0E0] ${
                  hasScore ? (sc < 50 ? 'bg-red-50' : sc < 70 ? 'bg-orange-50' : 'bg-green-50') : ''
                }`}>
                  <span className="text-sm font-bold text-[#1A1A1A]">{sec.id} — {sec.label}</span>
                  {hasScore && (
                    <span className={`text-sm font-black ${scoreColor(sc)}`}>{scoreBadge(sc)} {sc}/100</span>
                  )}
                </div>
                <div className="divide-y divide-[#F0F0F0]">
                  {sec.criteres.map(c => {
                    const val = criteres[c.id];
                    return (
                      <div key={c.id} className="px-4 py-3">
                        <p className="text-sm text-[#1A1A1A] mb-2">{c.id}. {c.label}</p>
                        <div className="flex flex-wrap gap-2">
                          {NIVEAUX.map(n => (
                            <button
                              key={String(n.value)}
                              onClick={() => setCritere(c.id, n.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                                val === n.value
                                  ? `${n.bg} ${n.text} border-current`
                                  : 'bg-white text-[#6B7280] border-[#E0E0E0] hover:bg-[#F5F5F5]'
                              }`}
                            >
                              {n.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Score total preview */}
          {completionPct > 0 && (
            <div className={`rounded-xl p-4 text-center border-2 ${
              scoreTotal >= 90 ? 'bg-green-50 border-green-300' :
              scoreTotal >= 70 ? 'bg-yellow-50 border-yellow-300' :
              scoreTotal >= 50 ? 'bg-orange-50 border-orange-300' :
              'bg-red-50 border-red-300'
            }`}>
              <div className={`text-4xl font-black ${scoreColor(scoreTotal)}`}>{scoreBadge(scoreTotal)} {scoreTotal}/100</div>
              <p className="text-sm text-[#6B7280] mt-1">
                {scoreTotal >= 90 ? 'Excellent — pratiques maîtrisées' :
                 scoreTotal >= 70 ? 'Bon niveau — quelques points à consolider' :
                 scoreTotal >= 50 ? 'En progression — plan de développement recommandé' :
                 'Insuffisant — formation prioritaire requise'}
              </p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!acheteur.trim() || !allFilled}
            className="w-full py-3 rounded-xl font-bold text-sm bg-[#E30613] text-white disabled:opacity-40 hover:bg-[#B8050F] transition-colors"
          >
            💾 Enregistrer l&apos;audit
            {!allFilled && <span className="font-normal ml-2 text-white/70">(remplir tous les critères)</span>}
          </button>
        </div>
      )}

      {/* ── HISTORIQUE ────────────────────────────────────────────────────── */}
      {activeTab === 'historique' && (
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-[#6B7280] text-sm">Aucun audit enregistré.</p>
              <button onClick={() => setActiveTab('saisie')} className="mt-3 px-4 py-2 bg-[#E30613] text-white rounded-lg text-sm font-semibold hover:bg-[#B8050F]">
                Démarrer un audit
              </button>
            </div>
          ) : (
            <>
              {/* Évolution par acheteur */}
              {Object.entries(buyerEvolution).length > 0 && (
                <div className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3">Évolution par acheteur (6 derniers audits)</h3>
                  <div className="space-y-3">
                    {Object.entries(buyerEvolution).map(([buyer, buyerSessions]) => {
                      const scores = buyerSessions.map(s => s.scoreTotal);
                      const last = scores[scores.length - 1];
                      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
                      const isAlert = last < 50;
                      return (
                        <div key={buyer} className={`flex items-center gap-3 p-2 rounded-lg ${isAlert ? 'bg-red-50' : ''}`}>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-[#1A1A1A]">{buyer}</p>
                            <p className="text-xs text-[#6B7280]">{buyerSessions.length} audit(s) · moy. {avg}/100</p>
                          </div>
                          <Sparkline scores={scores} />
                          <span className={`text-xl font-black w-12 text-right ${scoreColor(last)}`}>{last}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Liste des sessions */}
              <div className="space-y-3">
                {[...sessions].reverse().map(session => (
                  <div key={session.id} className="bg-white rounded-xl border border-[#E0E0E0] shadow-sm overflow-hidden">
                    <div className={`flex items-center justify-between px-4 py-3 border-b border-[#E0E0E0] ${
                      session.scoreTotal >= 90 ? 'bg-green-50' :
                      session.scoreTotal >= 70 ? 'bg-yellow-50' :
                      session.scoreTotal >= 50 ? 'bg-orange-50' : 'bg-red-50'
                    }`}>
                      <div>
                        <p className="text-sm font-bold text-[#1A1A1A]">{session.acheteur}</p>
                        <p className="text-xs text-[#6B7280]">{session.date}{session.contexte ? ` · ${session.contexte}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-2xl font-black ${scoreColor(session.scoreTotal)}`}>
                          {scoreBadge(session.scoreTotal)} {session.scoreTotal}/100
                        </span>
                        <button onClick={() => handleDelete(session.id)} className="text-[#9CA3AF] hover:text-red-600 text-lg leading-none" title="Supprimer">✕</button>
                      </div>
                    </div>
                    <div className="px-4 py-3 grid grid-cols-5 gap-2">
                      {SECTIONS.map(sec => {
                        const sc = session.scoresSection[sec.id] ?? -1;
                        return (
                          <div key={sec.id} className="text-center">
                            <div className={`text-sm font-black ${sc < 0 ? 'text-[#9CA3AF]' : scoreColor(sc)}`}>
                              {sc < 0 ? '—' : `${sc}`}
                            </div>
                            <div className="text-[10px] text-[#6B7280] leading-tight">{sec.id}<br />{sec.label.split(' ')[0]}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

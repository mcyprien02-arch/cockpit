'use client';

import { useState, useEffect } from 'react';
import { getJournalSourcingData, type SourcingModele } from './JournalAchatVente';
import ZonesModule from './ZonesModule';
import { lbcUrl, vintedUrl } from '@/lib/sourcingUrls';

interface Props { magasinNom: string; }

function SourcingRow({ m }: { m: SourcingModele }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-[#F9FAFB] rounded-lg border border-[#F0F0F0]">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#1A1A1A] truncate" title={m.modele}>{m.modele}</p>
        <p className="text-[10px] text-[#9CA3AF] mt-0.5">
          {m.qteVendue} vente{m.qteVendue > 1 ? 's' : ''}
          {m.delaiMoyen != null && ` · ${m.delaiMoyen}j éc.`}
          {m.epaMoyen != null
            ? <> · <span className="text-[#374151] font-medium">Cote EP achat : {m.epaMoyen} €</span> → filtre prix max</>
            : ' · pas de cote EP (pas de filtre prix)'}
        </p>
      </div>
      <div className="flex gap-1.5 shrink-0 flex-wrap">
        <a
          href={lbcUrl(m.modele, m.epaMoyen)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-[#E0E0E0] bg-white hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 text-[#374151] transition-colors whitespace-nowrap"
        >
          🔍 Leboncoin
        </a>
        <a
          href={vintedUrl(m.modele, m.epaMoyen)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-[#E0E0E0] bg-white hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 text-[#374151] transition-colors whitespace-nowrap"
        >
          🔍 Vinted
        </a>
      </div>
    </div>
  );
}

function SourcingSection({ title, subtitle, modeles }: { title: string; subtitle: string; modeles: SourcingModele[] }) {
  return (
    <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-[#1A1A1A]">{title}</h3>
        <p className="text-xs text-[#9CA3AF] mt-0.5">{subtitle}</p>
      </div>
      <div className="space-y-2">
        {modeles.map((m, i) => <SourcingRow key={i} m={m} />)}
      </div>
    </div>
  );
}

export default function SourcingWeb({ magasinNom }: Props) {
  const [modeles, setModeles] = useState<SourcingModele[]>([]);

  useEffect(() => {
    setModeles(getJournalSourcingData(magasinNom));
  }, [magasinNom]);

  const rotations = modeles.filter(m => m.type === 'rotation');
  const pepites   = modeles.filter(m => m.type === 'pepite');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#1A1A1A]">🌐 Sourcing Web</h2>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Recherchez vos modèles en rotation sur les plateformes de seconde main externes.
        </p>
      </div>

      {modeles.length === 0 ? (
        <div className="bg-white border border-[#E0E0E0] rounded-xl px-6 py-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm font-semibold text-[#1A1A1A]">Aucune donnée Journal disponible</p>
          <p className="text-xs text-[#6B7280] mt-2">
            Importez un journal Athéna dans le module <strong>Journal</strong> — les Top Rotations
            et Pépites locales apparaîtront ici automatiquement avec les liens de recherche.
          </p>
        </div>
      ) : (
        <>
          {rotations.length > 0 && (
            <SourcingSection
              title="⚡ Top Rotations"
              subtitle={`${rotations.length} modèle${rotations.length > 1 ? 's' : ''} à rotation rapide — tri par délai croissant`}
              modeles={rotations}
            />
          )}
          {pepites.length > 0 && (
            <SourcingSection
              title="🌍 Pépites locales"
              subtitle={`${pepites.length} modèle${pepites.length > 1 ? 's' : ''} absents de la gamme réseau, performants localement`}
              modeles={pepites}
            />
          )}
        </>
      )}

      <div className="bg-[#F9FAFB] border border-[#E0E0E0] rounded-xl px-4 py-3">
        <p className="text-[10px] text-[#9CA3AF] italic">
          Ces liens ouvrent une recherche sur les sites externes — Cockpit F ne collecte ni n&apos;analyse aucune donnée de ces plateformes.
        </p>
      </div>

      <ZonesModule moduleKey="sourcing" />
    </div>
  );
}

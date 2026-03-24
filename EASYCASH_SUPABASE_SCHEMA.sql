-- ============================================================
-- EASYCASH COCKPIT — Schéma Supabase
-- Copiez-collez dans Supabase > SQL Editor > Run
-- ============================================================

-- 1. MAGASINS
create table magasins (
  id uuid default gen_random_uuid() primary key,
  nom text not null,
  ville text,
  franchise text,
  adresse text,
  created_at timestamptz default now()
);

-- 2. INDICATEURS (définition des KPIs)
create table indicateurs (
  id uuid default gen_random_uuid() primary key,
  nom text not null,
  unite text default '%',
  direction text check (direction in ('up', 'down')) default 'up',
  seuil_ok numeric,
  seuil_vigilance numeric,
  poids integer default 1,
  action_defaut text,
  categorie text not null,
  ordre integer default 0,
  created_at timestamptz default now()
);

-- 3. VALEURS (données saisies par magasin + date)
create table valeurs (
  id uuid default gen_random_uuid() primary key,
  magasin_id uuid references magasins(id) on delete cascade,
  indicateur_id uuid references indicateurs(id) on delete cascade,
  valeur numeric not null,
  date_saisie date default current_date,
  source text default 'manuel',
  created_at timestamptz default now(),
  unique(magasin_id, indicateur_id, date_saisie)
);

-- 4. VISITES
create table visites (
  id uuid default gen_random_uuid() primary key,
  magasin_id uuid references magasins(id) on delete cascade,
  date_visite date not null,
  consultant text not null,
  franchise text,
  constats text,
  notes_prochain text,
  signature_franchise text,
  score_global integer,
  created_at timestamptz default now()
);

-- 5. PLANS D'ACTION
create table plans_action (
  id uuid default gen_random_uuid() primary key,
  visite_id uuid references visites(id) on delete cascade,
  magasin_id uuid references magasins(id) on delete cascade,
  priorite text check (priorite in ('P1', 'P2', 'P3')) default 'P1',
  constat text not null,
  action text not null,
  responsable text,
  echeance date,
  statut text check (statut in ('À faire', 'En cours', 'Fait', 'Abandonné')) default 'À faire',
  kpi_cible text,
  commentaire text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 6. CHECKLIST QUOTIDIENNE
create table checklist (
  id uuid default gen_random_uuid() primary key,
  magasin_id uuid references magasins(id) on delete cascade,
  date_check date default current_date,
  tache text not null,
  categorie text,
  fait boolean default false,
  unique(magasin_id, date_check, tache)
);

-- 7. GRILLE TEMPS
create table grille_temps (
  id uuid default gen_random_uuid() primary key,
  visite_id uuid references visites(id) on delete cascade,
  categorie text,
  activite text not null,
  nature text check (nature in ('GC', 'RD', 'GF', 'PS', 'PD')),
  passages integer default 0,
  temps_minutes integer default 0
);

-- INDEX
create index idx_valeurs_magasin on valeurs(magasin_id);
create index idx_valeurs_date on valeurs(date_saisie);
create index idx_plans_magasin on plans_action(magasin_id);
create index idx_plans_statut on plans_action(statut);
create index idx_visites_magasin on visites(magasin_id);

-- VUES
create view v_derniere_visite as
select distinct on (magasin_id)
  magasin_id, date_visite, consultant, score_global, constats
from visites order by magasin_id, date_visite desc;

create view v_actions_ouvertes as
select pa.*, m.nom as magasin_nom
from plans_action pa join magasins m on m.id = pa.magasin_id
where pa.statut in ('À faire', 'En cours')
order by pa.priorite, pa.echeance;

create view v_dernieres_valeurs as
select distinct on (v.magasin_id, v.indicateur_id)
  v.magasin_id, v.indicateur_id, v.valeur, v.date_saisie,
  i.nom as indicateur_nom, i.unite, i.direction, i.seuil_ok, i.seuil_vigilance,
  i.categorie, i.poids, i.action_defaut, m.nom as magasin_nom
from valeurs v
join indicateurs i on i.id = v.indicateur_id
join magasins m on m.id = v.magasin_id
order by v.magasin_id, v.indicateur_id, v.date_saisie desc;

-- 57 INDICATEURS EASYCASH PRÉ-CHARGÉS
insert into indicateurs (nom, unite, direction, seuil_ok, seuil_vigilance, poids, action_defaut, categorie, ordre) values
('Taux marge brute','%','up',42,35,3,'Vérifier mix rayon + prix achat/vente vs EasyPrice','Commercial',1),
('Taux marge nette','%','up',39,35,3,'Travailler démarque + réparations + commissions MP','Commercial',2),
('Panier moyen','€','up',110,85,1,'Travailler ventes complémentaires','Commercial',3),
('Nombre d''actes','','up',5000,3500,2,'Renforcer trafic et conversion','Commercial',4),
('Ventes complémentaires','%','up',15,10,1,'Mise en avant caisse + suivi vente additionnelle','Commercial',5),
('Taux de transformation','%','up',25,18,2,'Coaching méthode de vente','Commercial',6),
('Stock âgé','%','down',30,40,3,'Accélérer progressivement (-10%/sem)','Stock',7),
('Stock sain','%','up',70,55,1,'Réajuster répartition stock','Stock',8),
('Taux d''achat ext. global','%','up',20,10,2,'Former équipe sourcing','Stock',9),
('Valeur stock','€','down',250000,300000,1,'Peu de magasins ont besoin de +250k€','Stock',10),
('Gamme Téléphonie','%','up',70,55,2,'Réinjecter stock téléphonie','Gamme',11),
('Gamme Console','%','up',70,55,1,'Sourcer consoles manquantes','Gamme',12),
('Gamme Console portable','%','up',70,55,1,'Compléter gamme portables','Gamme',13),
('Gamme Jeux vidéo','%','up',65,50,1,'Revoir assortiment best sellers','Gamme',14),
('Gamme ACC jeux vidéo','%','up',60,40,1,'Compléter accessoires gaming','Gamme',15),
('Gamme Tablette','%','up',65,50,1,'Sourcer tablettes manquantes','Gamme',16),
('Taux CA encarté','%','up',90,80,2,'Plan fidélisation','Fidélité',17),
('Taux transactions encartées','%','up',70,60,1,'Formation encaissement','Fidélité',18),
('Rattachement','%','up',65,50,2,'Améliorer rattachement clients','Fidélité',19),
('Embasage','%','up',50,30,1,'Cocher consentements SMS/MAIL','Fidélité',20),
('Taux de démarque','%','down',3,5,2,'Inventaires + module démarque','Financier',21),
('Charges externes / CA','%','down',13,15,2,'Négocier loyer','Financier',22),
('Masse salariale / CA','%','down',15,18,3,'1 salarié par 250k€ CA','Financier',23),
('EBE','%','up',8,5,2,'Travailler marge + optimiser charges','Financier',24),
('Résultat courant','%','up',5,3,2,'Revoir structure de coûts','Financier',25),
('Commissions marketplace','%','down',8,12,1,'Analyser rentabilité par MP','Financier',26),
('Taux produits neufs','%','down',5,8,1,'Rééquilibrer mix occasion/neuf','Financier',27),
('Note QSP','/20','up',15,12,2,'Plan qualité service prix','Qualité',28),
('Poids digital','%','up',10,5,1,'Développer présence digitale','Qualité',29),
('Prix (écart cote réseau)','%','down',5,10,1,'Se référer à EasyPrice','Qualité',30),
('SAV / stock','%','down',5,10,1,'Trier produits techniques au rachat','Qualité',31),
('CA / ETP','k€','up',250,200,1,'Évaluer nb ETP vs CA','RH',32),
('Nb ETP','','down',8,10,1,'Évaluer nécessité chaque poste','RH',33),
('Turnover','%','down',10,15,1,'Fidélisation / primes','RH',34),
('Polyvalence','%','up',70,50,1,'Plan formation rotation interne','RH',35),
('Formation','%','up',80,60,1,'Plan de formation prioritaire','RH',36),
('Satisfaction équipe','/5','up',4,3.5,1,'Actions RH / coaching','RH',37),
('Note Google','/5','up',4.5,4,2,'Répondre à tous les avis','Web / E-réputation',38),
('Nb avis Google','','up',200,100,1,'PLV Google + solliciter avis','Web / E-réputation',39),
('NPS','','up',70,60,2,'Recontacter détracteurs','Web / E-réputation',40),
('Satisfaction client','/5','up',4.5,4,2,'Analyser insatisfactions','Web / E-réputation',41),
('Note Relation Client','/5','up',4,3.5,1,'Répondre 100% en <24h','Web / E-réputation',42),
('Taux réponse avis','%','up',100,80,1,'Répondre systématiquement','Web / E-réputation',43),
('Alertes insatisfaction','','down',5,15,1,'Traiter chaque alerte','Web / E-réputation',44),
('Module étiquette','O/N','up',1,0.5,2,'100% produits balisés','Non-négociables / Outils',45),
('Module démarque','O/N','up',1,0.5,2,'Inventaires + démarque connue','Non-négociables / Outils',46),
('Tuile Marketplace','O/N','up',1,0.5,2,'Saisir TOUTES ventes & achats MP','Non-négociables / Outils',47),
('Tuile réparation','O/N','up',1,0.5,1,'Créer toutes réparations','Non-négociables / Outils',48),
('Droit erreur / SOR30','O/N','up',1,0.5,2,'PLV + CGV + motif retour DTAE','Non-négociables / Promesse',49),
('Produits certifiés authentiques','O/N','up',1,0.5,2,'Compte Authentifier.com','Non-négociables / Promesse',50),
('Batterie / Picea','O/N','up',1,0.5,2,'100% smartphones testés Picea','Non-négociables / Promesse',51),
('Garantie 2 ans','O/N','up',1,0.5,2,'PLV + balisage dédié','Non-négociables / Promesse',52),
('Envoi du bilan','O/N','up',1,0.5,1,'Envoyer bilan au siège','Non-négociables / Réseau',53),
('Participation vie réseau','O/N','up',1,0.5,1,'Présence aux RN + RR','Non-négociables / Réseau',54),
('Délai de vente moyen','j','down',30,45,2,'Accélérer rotation / revoir pricing','Politique commerciale',55),
('Écart cote EP achat','%','down',5,10,2,'Se rapprocher de la cote EasyPrice','Politique commerciale',56),
('Écart cote EP vente','%','down',5,10,2,'Ajuster prix de vente vs cote','Politique commerciale',57);

-- MAGASINS DE DÉMO
insert into magasins (nom, ville, franchise) values
('EasyCash Lyon Est', 'Lyon', 'Eric PRINET'),
('EasyCash Givors', 'Givors', 'Eric PRINET'),
('EasyCash Soissons', 'Soissons', 'Frédéric FURACAS'),
('EasyCash Laon', 'Laon', 'Frédéric FURACAS');

-- RLS
alter table magasins enable row level security;
alter table valeurs enable row level security;
alter table visites enable row level security;
alter table plans_action enable row level security;
create policy "Accès complet" on magasins for all using (true);
create policy "Accès complet" on valeurs for all using (true);
create policy "Accès complet" on visites for all using (true);
create policy "Accès complet" on plans_action for all using (true);

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      magasins: {
        Row: {
          id: string;
          nom: string;
          ville: string | null;
          franchise: string | null;
          adresse: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["magasins"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["magasins"]["Insert"]>;
      };
      indicateurs: {
        Row: {
          id: string;
          nom: string;
          unite: string | null;
          direction: "up" | "down";
          seuil_ok: number | null;
          seuil_vigilance: number | null;
          poids: number;
          action_defaut: string | null;
          categorie: string;
          ordre: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["indicateurs"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["indicateurs"]["Insert"]>;
      };
      valeurs: {
        Row: {
          id: string;
          magasin_id: string;
          indicateur_id: string;
          valeur: number;
          date_saisie: string;
          source: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["valeurs"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["valeurs"]["Insert"]>;
      };
      visites: {
        Row: {
          id: string;
          magasin_id: string;
          date_visite: string;
          consultant: string;
          franchise: string | null;
          constats: string | null;
          notes_prochain: string | null;
          signature_franchise: string | null;
          score_global: number | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["visites"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["visites"]["Insert"]>;
      };
      plans_action: {
        Row: {
          id: string;
          visite_id: string | null;
          magasin_id: string;
          priorite: "P1" | "P2" | "P3";
          constat: string;
          action: string;
          responsable: string | null;
          echeance: string | null;
          statut: "À faire" | "En cours" | "Fait" | "Abandonné";
          kpi_cible: string | null;
          commentaire: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["plans_action"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["plans_action"]["Insert"]>;
      };
      checklist: {
        Row: {
          id: string;
          magasin_id: string;
          date_check: string;
          tache: string;
          categorie: string | null;
          fait: boolean;
        };
        Insert: Omit<Database["public"]["Tables"]["checklist"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["checklist"]["Insert"]>;
      };
      grille_temps: {
        Row: {
          id: string;
          visite_id: string;
          categorie: string | null;
          activite: string;
          nature: "GC" | "RD" | "GF" | "PS" | "PD" | null;
          passages: number;
          temps_minutes: number;
        };
        Insert: Omit<Database["public"]["Tables"]["grille_temps"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["grille_temps"]["Insert"]>;
      };
    };
    Views: {
      v_dernieres_valeurs: {
        Row: {
          magasin_id: string;
          indicateur_id: string;
          valeur: number;
          date_saisie: string;
          indicateur_nom: string;
          unite: string | null;
          direction: "up" | "down";
          seuil_ok: number | null;
          seuil_vigilance: number | null;
          categorie: string;
          poids: number;
          action_defaut: string | null;
          magasin_nom: string;
        };
      };
      v_actions_ouvertes: {
        Row: Database["public"]["Tables"]["plans_action"]["Row"] & {
          magasin_nom: string;
        };
      };
      v_derniere_visite: {
        Row: {
          magasin_id: string;
          date_visite: string;
          consultant: string;
          score_global: number | null;
          constats: string | null;
        };
      };
    };
  };
}

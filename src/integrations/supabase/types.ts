export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      consumo_creditos: {
        Row: {
          created_at: string | null
          creditos_utilizados: number
          data_consumo: string | null
          equipe_id: string
          id: string
          metadata: Json | null
          periodo: string
        }
        Insert: {
          created_at?: string | null
          creditos_utilizados: number
          data_consumo?: string | null
          equipe_id: string
          id?: string
          metadata?: Json | null
          periodo: string
        }
        Update: {
          created_at?: string | null
          creditos_utilizados?: number
          data_consumo?: string | null
          equipe_id?: string
          id?: string
          metadata?: Json | null
          periodo?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumo_creditos_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipes: {
        Row: {
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          created_at: string
          creditos_avulsos: number
          crm_link: string
          gpt_maker_agent_id: string | null
          home_explanation: string | null
          id: string
          jestor_api_token: string | null
          limite_creditos: number | null
          nome_cliente: string
          plano_id: number | null
          subscription_status: string | null
          suporte_link: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          created_at?: string
          creditos_avulsos?: number
          crm_link: string
          gpt_maker_agent_id?: string | null
          home_explanation?: string | null
          id?: string
          jestor_api_token?: string | null
          limite_creditos?: number | null
          nome_cliente: string
          plano_id?: number | null
          subscription_status?: string | null
          suporte_link: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          created_at?: string
          creditos_avulsos?: number
          crm_link?: string
          gpt_maker_agent_id?: string | null
          home_explanation?: string | null
          id?: string
          jestor_api_token?: string | null
          limite_creditos?: number | null
          nome_cliente?: string
          plano_id?: number | null
          subscription_status?: string | null
          suporte_link?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_equipes_plano"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      kpis_dashboard: {
        Row: {
          created_at: string | null
          equipe_id: string
          id: string
          leads_atendidos: number | null
          negocios_fechados: number | null
          periodo: string
          reunioes_agendadas: number | null
          updated_at: string | null
          valor_total_negocios: number | null
        }
        Insert: {
          created_at?: string | null
          equipe_id: string
          id?: string
          leads_atendidos?: number | null
          negocios_fechados?: number | null
          periodo: string
          reunioes_agendadas?: number | null
          updated_at?: string | null
          valor_total_negocios?: number | null
        }
        Update: {
          created_at?: string | null
          equipe_id?: string
          id?: string
          leads_atendidos?: number | null
          negocios_fechados?: number | null
          periodo?: string
          reunioes_agendadas?: number | null
          updated_at?: string | null
          valor_total_negocios?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kpis_dashboard_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          created_at: string | null
          funcionalidades: string[] | null
          id: number
          limite_creditos: number
          limite_usuarios: number | null
          nome: string
          preco_mensal: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          funcionalidades?: string[] | null
          id: number
          limite_creditos: number
          limite_usuarios?: number | null
          nome: string
          preco_mensal: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          funcionalidades?: string[] | null
          id?: number
          limite_creditos?: number
          limite_usuarios?: number | null
          nome?: string
          preco_mensal?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          chat_link_base: string
          cpf: string | null
          created_at: string
          email: string
          equipe_id: string
          id: string
          nome_completo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_link_base: string
          cpf?: string | null
          created_at?: string
          email: string
          equipe_id: string
          id?: string
          nome_completo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_link_base?: string
          cpf?: string | null
          created_at?: string
          email?: string
          equipe_id?: string
          id?: string
          nome_completo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const

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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          archived: boolean | null
          created_at: string
          description: string | null
          id: string
          provider_id: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          archived?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          provider_id?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          archived?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          provider_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_config: {
        Row: {
          enabled: boolean
          feature_name: string
          id: string
          settings: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          feature_name: string
          id?: string
          settings?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          feature_name?: string
          id?: string
          settings?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_logs: {
        Row: {
          created_at: string
          feature_name: string
          flagged: boolean
          id: string
          input_summary: string | null
          output_summary: string | null
          provider_id: string | null
          rating: number | null
          response_time_ms: number | null
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          feature_name: string
          flagged?: boolean
          id?: string
          input_summary?: string | null
          output_summary?: string | null
          provider_id?: string | null
          rating?: number | null
          response_time_ms?: number | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          feature_name?: string
          flagged?: boolean
          id?: string
          input_summary?: string | null
          output_summary?: string | null
          provider_id?: string | null
          rating?: number | null
          response_time_ms?: number | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_logs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          details: Json | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          details?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          details?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          job_type: string
          processed_items: number | null
          progress: number | null
          result: Json | null
          started_at: string | null
          started_by: string | null
          status: string
          total_items: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_type: string
          processed_items?: number | null
          progress?: number | null
          result?: Json | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          total_items?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_type?: string
          processed_items?: number | null
          progress?: number | null
          result?: Json | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          total_items?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "background_jobs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_alerts: {
        Row: {
          acknowledged_by: string | null
          alert_type: string
          created_at: string | null
          id: string
          message: string
          provider_id: string
          resolved_at: string | null
          status: string
          subscription_id: string | null
        }
        Insert: {
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string | null
          id?: string
          message: string
          provider_id: string
          resolved_at?: string | null
          status?: string
          subscription_id?: string | null
        }
        Update: {
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string | null
          id?: string
          message?: string
          provider_id?: string
          resolved_at?: string | null
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_alerts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_alerts_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "provider_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_credits: {
        Row: {
          amount: number
          applied_to_invoice_id: string | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          provider_id: string
          reason: string
          status: string
        }
        Insert: {
          amount: number
          applied_to_invoice_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          provider_id: string
          reason: string
          status?: string
        }
        Update: {
          amount?: number
          applied_to_invoice_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          provider_id?: string
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_credits_applied_to_invoice_id_fkey"
            columns: ["applied_to_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_credits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_credits_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean | null
          attendee_ids: string[] | null
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string
          event_type: string
          host_id: string
          id: string
          lead_id: string | null
          location: string | null
          meeting_link: string | null
          notes: string | null
          outcome: string | null
          provider_id: string | null
          recurrence: string | null
          reminder_sent: boolean | null
          start_time: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          all_day?: boolean | null
          attendee_ids?: string[] | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time: string
          event_type: string
          host_id: string
          id?: string
          lead_id?: string | null
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          outcome?: string | null
          provider_id?: string | null
          recurrence?: string | null
          reminder_sent?: boolean | null
          start_time: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          all_day?: boolean | null
          attendee_ids?: string[] | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string
          event_type?: string
          host_id?: string
          id?: string
          lead_id?: string | null
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          outcome?: string | null
          provider_id?: string | null
          recurrence?: string | null
          reminder_sent?: boolean | null
          start_time?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "scraped_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_reminders: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          remind_at: string
          reminder_type: string | null
          sent: boolean | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          remind_at: string
          reminder_type?: string | null
          sent?: boolean | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          remind_at?: string
          reminder_type?: string | null
          sent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["campaign_activity_type"]
          campaign_lead_id: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          outcome: string | null
          performed_by: string | null
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["campaign_activity_type"]
          campaign_lead_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          outcome?: string | null
          performed_by?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["campaign_activity_type"]
          campaign_lead_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          outcome?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activities_campaign_lead_id_fkey"
            columns: ["campaign_lead_id"]
            isOneToOne: false
            referencedRelation: "campaign_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_activities_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_leads: {
        Row: {
          assigned_to: string | null
          call_attempts: number
          call_disposition: string | null
          campaign_id: string
          contracts_sent_at: string | null
          converted_provider_id: string | null
          created_at: string
          dead_at_stage: string | null
          dead_reason: string | null
          deal_type_interest: string | null
          follow_up_reason: string | null
          id: string
          interest_level: string | null
          last_attempt_at: string | null
          lead_id: string
          next_follow_up: string | null
          notes: string | null
          objection_notes: string | null
          outcome: string | null
          qualification_category: string | null
          qualification_locations: number | null
          selected_package_id: string | null
          selected_tier_id: string | null
          status: Database["public"]["Enums"]["campaign_lead_status"]
          term_sheet_sent_at: string | null
          term_sheet_viewed_at: string | null
          updated_at: string
          workflow_stage: string
        }
        Insert: {
          assigned_to?: string | null
          call_attempts?: number
          call_disposition?: string | null
          campaign_id: string
          contracts_sent_at?: string | null
          converted_provider_id?: string | null
          created_at?: string
          dead_at_stage?: string | null
          dead_reason?: string | null
          deal_type_interest?: string | null
          follow_up_reason?: string | null
          id?: string
          interest_level?: string | null
          last_attempt_at?: string | null
          lead_id: string
          next_follow_up?: string | null
          notes?: string | null
          objection_notes?: string | null
          outcome?: string | null
          qualification_category?: string | null
          qualification_locations?: number | null
          selected_package_id?: string | null
          selected_tier_id?: string | null
          status?: Database["public"]["Enums"]["campaign_lead_status"]
          term_sheet_sent_at?: string | null
          term_sheet_viewed_at?: string | null
          updated_at?: string
          workflow_stage?: string
        }
        Update: {
          assigned_to?: string | null
          call_attempts?: number
          call_disposition?: string | null
          campaign_id?: string
          contracts_sent_at?: string | null
          converted_provider_id?: string | null
          created_at?: string
          dead_at_stage?: string | null
          dead_reason?: string | null
          deal_type_interest?: string | null
          follow_up_reason?: string | null
          id?: string
          interest_level?: string | null
          last_attempt_at?: string | null
          lead_id?: string
          next_follow_up?: string | null
          notes?: string | null
          objection_notes?: string | null
          outcome?: string | null
          qualification_category?: string | null
          qualification_locations?: number | null
          selected_package_id?: string | null
          selected_tier_id?: string | null
          status?: Database["public"]["Enums"]["campaign_lead_status"]
          term_sheet_sent_at?: string | null
          term_sheet_viewed_at?: string | null
          updated_at?: string
          workflow_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_converted_provider_id_fkey"
            columns: ["converted_provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "scraped_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_selected_package_id_fkey"
            columns: ["selected_package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_leads_selected_tier_id_fkey"
            columns: ["selected_tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          assigned_reps: string[] | null
          campaign_type: Database["public"]["Enums"]["campaign_type"]
          contacted_count: number
          converted_count: number
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          participant_type: string
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          target_category: string | null
          target_state: string | null
          total_leads: number
          updated_at: string
        }
        Insert: {
          assigned_reps?: string[] | null
          campaign_type?: Database["public"]["Enums"]["campaign_type"]
          contacted_count?: number
          converted_count?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          participant_type?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          target_category?: string | null
          target_state?: string | null
          total_leads?: number
          updated_at?: string
        }
        Update: {
          assigned_reps?: string[] | null
          campaign_type?: Database["public"]["Enums"]["campaign_type"]
          contacted_count?: number
          converted_count?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          participant_type?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          target_category?: string | null
          target_state?: string | null
          total_leads?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      churn_predictions: {
        Row: {
          assigned_to: string | null
          churn_probability: number
          created_at: string
          id: string
          predicted_churn_timeframe: string | null
          provider_id: string
          resolved_at: string | null
          retention_strategy: string | null
          risk_factors: Json | null
          status: string
        }
        Insert: {
          assigned_to?: string | null
          churn_probability?: number
          created_at?: string
          id?: string
          predicted_churn_timeframe?: string | null
          provider_id: string
          resolved_at?: string | null
          retention_strategy?: string | null
          risk_factors?: Json | null
          status?: string
        }
        Update: {
          assigned_to?: string | null
          churn_probability?: number
          created_at?: string
          id?: string
          predicted_churn_timeframe?: string | null
          provider_id?: string
          resolved_at?: string | null
          retention_strategy?: string | null
          risk_factors?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "churn_predictions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "churn_predictions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          ai_enabled: boolean
          ai_tone: string
          brand_color: string | null
          company_address: string | null
          company_name: string
          favicon_url: string | null
          id: string
          login_bg_color: string | null
          login_bg_url: string | null
          logo_url: string | null
          secondary_color: string | null
          support_email: string | null
          support_phone: string | null
          updated_at: string
        }
        Insert: {
          ai_enabled?: boolean
          ai_tone?: string
          brand_color?: string | null
          company_address?: string | null
          company_name?: string
          favicon_url?: string | null
          id?: string
          login_bg_color?: string | null
          login_bg_url?: string | null
          logo_url?: string | null
          secondary_color?: string | null
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Update: {
          ai_enabled?: boolean
          ai_tone?: string
          brand_color?: string | null
          company_address?: string | null
          company_name?: string
          favicon_url?: string | null
          id?: string
          login_bg_color?: string | null
          login_bg_url?: string | null
          logo_url?: string | null
          secondary_color?: string | null
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contract_review_messages: {
        Row: {
          created_at: string
          flag_severity:
            | Database["public"]["Enums"]["review_flag_severity"]
            | null
          flag_type: Database["public"]["Enums"]["review_flag_type"] | null
          flagged: boolean
          id: string
          message: string
          role: Database["public"]["Enums"]["review_message_role"]
          session_id: string
        }
        Insert: {
          created_at?: string
          flag_severity?:
            | Database["public"]["Enums"]["review_flag_severity"]
            | null
          flag_type?: Database["public"]["Enums"]["review_flag_type"] | null
          flagged?: boolean
          id?: string
          message: string
          role: Database["public"]["Enums"]["review_message_role"]
          session_id: string
        }
        Update: {
          created_at?: string
          flag_severity?:
            | Database["public"]["Enums"]["review_flag_severity"]
            | null
          flag_type?: Database["public"]["Enums"]["review_flag_type"] | null
          flagged?: boolean
          id?: string
          message?: string
          role?: Database["public"]["Enums"]["review_message_role"]
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_review_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "contract_review_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_review_sessions: {
        Row: {
          contract_id: string
          created_at: string
          ended_at: string | null
          flag_reason: string | null
          flagged: boolean
          id: string
          messages_count: number
          provider_id: string
          reviewed_at: string | null
          reviewed_by_admin: boolean
          started_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          ended_at?: string | null
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          messages_count?: number
          provider_id: string
          reviewed_at?: string | null
          reviewed_by_admin?: boolean
          started_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          ended_at?: string | null
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          messages_count?: number
          provider_id?: string
          reviewed_at?: string | null
          reviewed_by_admin?: boolean
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_review_sessions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_review_sessions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          auto_renew: boolean
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          created_by: string | null
          deal_value: number | null
          document_url: string | null
          end_date: string | null
          id: string
          provider_id: string
          renewal_date: string | null
          renewal_notice_days: number
          renewal_status: string
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          terms_summary: string | null
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string | null
          deal_value?: number | null
          document_url?: string | null
          end_date?: string | null
          id?: string
          provider_id: string
          renewal_date?: string | null
          renewal_notice_days?: number
          renewal_status?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          terms_summary?: string | null
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string | null
          deal_value?: number | null
          document_url?: string | null
          end_date?: string | null
          id?: string
          provider_id?: string
          renewal_date?: string | null
          renewal_notice_days?: number
          renewal_status?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          terms_summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_types: {
        Row: {
          color: string | null
          commission_rate: number | null
          default_terms: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          commission_rate?: number | null
          default_terms?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          commission_rate?: number | null
          default_terms?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          document_type: string
          extracted_text: string | null
          file_type: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          name: string
          participant_type: string
          requires_notary: boolean | null
          requires_witness: boolean | null
          short_code: string
          signing_instructions: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          document_type: string
          extracted_text?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          participant_type?: string
          requires_notary?: boolean | null
          requires_witness?: boolean | null
          short_code: string
          signing_instructions?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          document_type?: string
          extracted_text?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          participant_type?: string
          requires_notary?: boolean | null
          requires_witness?: boolean | null
          short_code?: string
          signing_instructions?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          id: string
          provider_id: string
          sent_at: string
          status: string
          subject: string
          template_name: string
        }
        Insert: {
          id?: string
          provider_id: string
          sent_at?: string
          status?: string
          subject: string
          template_name: string
        }
        Update: {
          id?: string
          provider_id?: string
          sent_at?: string
          status?: string
          subject?: string
          template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_rates: {
        Row: {
          category_id: string
          created_at: string | null
          effective_date: string
          id: string
          is_active: boolean | null
          min_locations: number | null
          monthly_rate: number
          tier_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          effective_date?: string
          id?: string
          is_active?: boolean | null
          min_locations?: number | null
          monthly_rate: number
          tier_id: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          effective_date?: string
          id?: string
          is_active?: boolean | null
          min_locations?: number | null
          monthly_rate?: number
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_rates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "specialty_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_rates_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      geographic_markets: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number
          example_cities: string | null
          id: string
          is_active: boolean | null
          name: string
          rate_multiplier: number
          short_code: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order: number
          example_cities?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          rate_multiplier: number
          short_code: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number
          example_cities?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          rate_multiplier?: number
          short_code?: string
        }
        Relationships: []
      }
      invoice_line_items: {
        Row: {
          created_at: string | null
          description: string
          discount_percentage: number | null
          id: string
          invoice_id: string
          line_total: number
          location_id: string | null
          quantity: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description: string
          discount_percentage?: number | null
          id?: string
          invoice_id: string
          line_total: number
          location_id?: string | null
          quantity?: number | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          description?: string
          discount_percentage?: number | null
          id?: string
          invoice_id?: string
          line_total?: number
          location_id?: string | null
          quantity?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "provider_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          billing_period_end: string
          billing_period_start: string
          created_at: string | null
          discount_amount: number | null
          discount_reason: string | null
          due_date: string
          id: string
          invoice_number: string
          notes: string | null
          paid_amount: number | null
          paid_date: string | null
          provider_id: string
          sent_at: string | null
          status: string
          subscription_id: string
          subtotal: number
          tax_amount: number | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          billing_period_end: string
          billing_period_start: string
          created_at?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
          due_date: string
          id?: string
          invoice_number: string
          notes?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          provider_id: string
          sent_at?: string | null
          status?: string
          subscription_id: string
          subtotal: number
          tax_amount?: number | null
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          notes?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          provider_id?: string
          sent_at?: string | null
          status?: string
          subscription_id?: string
          subtotal?: number
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "provider_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      law_firm_activities: {
        Row: {
          activity_type: string
          created_at: string
          description: string | null
          id: string
          law_firm_id: string
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          description?: string | null
          id?: string
          law_firm_id: string
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          law_firm_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "law_firm_activities_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "law_firm_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      law_firm_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_primary: boolean | null
          is_signer: boolean | null
          law_firm_id: string
          name: string
          phone: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean | null
          is_signer?: boolean | null
          law_firm_id: string
          name: string
          phone?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean | null
          is_signer?: boolean | null
          law_firm_id?: string
          name?: string
          phone?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "law_firm_contacts_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      law_firm_documents: {
        Row: {
          created_at: string
          file_url: string | null
          id: string
          is_current_version: boolean
          law_firm_id: string
          notes: string | null
          sent_at: string | null
          signature_request_id: string | null
          signed_at: string | null
          signing_order: number | null
          status: string
          template_id: string | null
          template_version: number | null
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          id?: string
          is_current_version?: boolean
          law_firm_id: string
          notes?: string | null
          sent_at?: string | null
          signature_request_id?: string | null
          signed_at?: string | null
          signing_order?: number | null
          status?: string
          template_id?: string | null
          template_version?: number | null
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          file_url?: string | null
          id?: string
          is_current_version?: boolean
          law_firm_id?: string
          notes?: string | null
          sent_at?: string | null
          signature_request_id?: string | null
          signed_at?: string | null
          signing_order?: number | null
          status?: string
          template_id?: string | null
          template_version?: number | null
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "law_firm_documents_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "law_firm_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      law_firm_invoices: {
        Row: {
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string
          law_firm_id: string
          paid_amount: number | null
          paid_date: string | null
          status: string
          subscription_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          law_firm_id: string
          paid_amount?: number | null
          paid_date?: string | null
          status?: string
          subscription_id?: string | null
          total_amount: number
          updated_at?: string
        }
        Update: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          law_firm_id?: string
          paid_amount?: number | null
          paid_date?: string | null
          status?: string
          subscription_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "law_firm_invoices_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "law_firm_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "law_firm_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      law_firm_pipeline: {
        Row: {
          created_at: string
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          law_firm_id: string
          notes: string | null
          probability: number | null
          sales_rep_id: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          law_firm_id: string
          notes?: string | null
          probability?: number | null
          sales_rep_id?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          law_firm_id?: string
          notes?: string | null
          probability?: number | null
          sales_rep_id?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "law_firm_pipeline_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "law_firm_pipeline_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      law_firm_profiles: {
        Row: {
          created_at: string | null
          id: string
          law_firm_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          law_firm_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          law_firm_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "law_firm_profiles_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
        ]
      }
      law_firm_subscriptions: {
        Row: {
          billing_day: number | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          id: string
          law_firm_id: string
          monthly_amount: number
          next_billing_date: string | null
          started_at: string | null
          status: string
          tier_id: string | null
          updated_at: string
        }
        Insert: {
          billing_day?: number | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          law_firm_id: string
          monthly_amount: number
          next_billing_date?: string | null
          started_at?: string | null
          status?: string
          tier_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_day?: number | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          law_firm_id?: string
          monthly_amount?: number
          next_billing_date?: string | null
          started_at?: string | null
          status?: string
          tier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "law_firm_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "law_firm_subscriptions_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "law_firm_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      law_firms: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          assigned_sales_rep: string | null
          bar_numbers: Json | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          dba_name: string | null
          firm_name: string
          firm_size: string | null
          health_score: number | null
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          practice_areas: string[] | null
          service_package_id: string | null
          source: string | null
          state: string | null
          states_licensed: string[] | null
          status: string
          updated_at: string
          website: string | null
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          assigned_sales_rep?: string | null
          bar_numbers?: Json | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          dba_name?: string | null
          firm_name: string
          firm_size?: string | null
          health_score?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          practice_areas?: string[] | null
          service_package_id?: string | null
          source?: string | null
          state?: string | null
          states_licensed?: string[] | null
          status?: string
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          assigned_sales_rep?: string | null
          bar_numbers?: Json | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          dba_name?: string | null
          firm_name?: string
          firm_size?: string | null
          health_score?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          practice_areas?: string[] | null
          service_package_id?: string | null
          source?: string | null
          state?: string | null
          states_licensed?: string[] | null
          status?: string
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "law_firms_assigned_sales_rep_fkey"
            columns: ["assigned_sales_rep"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "law_firms_service_package_id_fkey"
            columns: ["service_package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_tiers: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number
          features: Json | null
          id: string
          is_active: boolean | null
          name: string
          short_code: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          short_code: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          short_code?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          archived: boolean | null
          category: string
          created_at: string
          id: string
          link: string | null
          message: string
          priority: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          archived?: boolean | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          message: string
          priority?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          archived?: boolean | null
          category?: string
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          priority?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_checklists: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          id: string
          provider_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          provider_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          provider_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_checklists_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_checklists_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          notification_type: Database["public"]["Enums"]["onboarding_notification_type"]
          recipient_id: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["onboarding_notification_status"]
          step_id: string | null
          subject: string
          workflow_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          notification_type?: Database["public"]["Enums"]["onboarding_notification_type"]
          recipient_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_notification_status"]
          step_id?: string | null
          subject: string
          workflow_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          notification_type?: Database["public"]["Enums"]["onboarding_notification_type"]
          recipient_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_notification_status"]
          step_id?: string | null
          subject?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_notifications_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_notifications_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "onboarding_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_steps: {
        Row: {
          assigned_to: string | null
          checklist_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          notes: string | null
          step_name: string
          step_order: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          checklist_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          notes?: string | null
          step_name: string
          step_order: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          checklist_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          notes?: string | null
          step_name?: string
          step_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_steps_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_steps_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "onboarding_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_steps_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_templates: {
        Row: {
          created_at: string
          created_by: string | null
          deal_type_id: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          steps_json: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deal_type_id?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          steps_json?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deal_type_id?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          steps_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_templates_deal_type_id_fkey"
            columns: ["deal_type_id"]
            isOneToOne: false
            referencedRelation: "deal_types"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_workflows: {
        Row: {
          call_checklist: Json
          call_event_id: string | null
          call_notes: string | null
          completed_at: string | null
          created_at: string
          current_step: number
          go_live_date: string | null
          id: string
          initiated_by: string | null
          law_firm_id: string | null
          onboarding_stage: string
          participant_type: string
          portal_checklist: Json
          provider_id: string | null
          service_package_id: string | null
          specialist_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["workflow_status"]
          total_steps: number
          updated_at: string
        }
        Insert: {
          call_checklist?: Json
          call_event_id?: string | null
          call_notes?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: number
          go_live_date?: string | null
          id?: string
          initiated_by?: string | null
          law_firm_id?: string | null
          onboarding_stage?: string
          participant_type?: string
          portal_checklist?: Json
          provider_id?: string | null
          service_package_id?: string | null
          specialist_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_status"]
          total_steps?: number
          updated_at?: string
        }
        Update: {
          call_checklist?: Json
          call_event_id?: string | null
          call_notes?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: number
          go_live_date?: string | null
          id?: string
          initiated_by?: string | null
          law_firm_id?: string | null
          onboarding_stage?: string
          participant_type?: string
          portal_checklist?: Json
          provider_id?: string | null
          service_package_id?: string | null
          specialist_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["workflow_status"]
          total_steps?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_workflows_call_event_id_fkey"
            columns: ["call_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_workflows_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_workflows_law_firm_id_fkey"
            columns: ["law_firm_id"]
            isOneToOne: false
            referencedRelation: "law_firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_workflows_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_workflows_service_package_id_fkey"
            columns: ["service_package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_workflows_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      package_documents: {
        Row: {
          condition_description: string | null
          created_at: string | null
          id: string
          is_required: boolean | null
          package_id: string
          signing_order: number
          template_id: string
        }
        Insert: {
          condition_description?: string | null
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          package_id: string
          signing_order: number
          template_id: string
        }
        Update: {
          condition_description?: string | null
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          package_id?: string
          signing_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_documents_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          invoice_id: string
          notes: string | null
          payment_method: string
          payment_reference: string | null
          processed_at: string | null
          provider_id: string
          recorded_by: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          payment_method: string
          payment_reference?: string | null
          processed_at?: string | null
          provider_id: string
          recorded_by?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_method?: string
          payment_reference?: string | null
          processed_at?: string | null
          provider_id?: string
          recorded_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_documents: {
        Row: {
          created_at: string | null
          file_url: string | null
          id: string
          is_current_version: boolean
          notes: string | null
          package_id: string | null
          provider_id: string
          sent_at: string | null
          signature_request_id: string | null
          signed_at: string | null
          signing_order: number | null
          status: string | null
          template_id: string
          template_version: number | null
          updated_at: string | null
          viewed_at: string | null
        }
        Insert: {
          created_at?: string | null
          file_url?: string | null
          id?: string
          is_current_version?: boolean
          notes?: string | null
          package_id?: string | null
          provider_id: string
          sent_at?: string | null
          signature_request_id?: string | null
          signed_at?: string | null
          signing_order?: number | null
          status?: string | null
          template_id: string
          template_version?: number | null
          updated_at?: string | null
          viewed_at?: string | null
        }
        Update: {
          created_at?: string | null
          file_url?: string | null
          id?: string
          is_current_version?: boolean
          notes?: string | null
          package_id?: string | null
          provider_id?: string
          sent_at?: string | null
          signature_request_id?: string | null
          signed_at?: string | null
          signing_order?: number | null
          status?: string | null
          template_id?: string
          template_version?: number | null
          updated_at?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_documents_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_documents_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_documents_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_health_scores: {
        Row: {
          ai_summary: string | null
          calculated_at: string
          factors: Json | null
          id: string
          provider_id: string
          recommended_actions: Json | null
          risk_level: string
          score: number
        }
        Insert: {
          ai_summary?: string | null
          calculated_at?: string
          factors?: Json | null
          id?: string
          provider_id: string
          recommended_actions?: Json | null
          risk_level?: string
          score: number
        }
        Update: {
          ai_summary?: string | null
          calculated_at?: string
          factors?: Json | null
          id?: string
          provider_id?: string
          recommended_actions?: Json | null
          risk_level?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "provider_health_scores_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_locations: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          created_at: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          latitude: number | null
          location_name: string | null
          longitude: number | null
          market_id: string | null
          provider_id: string
          state: string
          updated_at: string | null
          zip_code: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          market_id?: string | null
          provider_id: string
          state: string
          updated_at?: string | null
          zip_code: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          market_id?: string | null
          provider_id?: string
          state?: string
          updated_at?: string | null
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_locations_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "geographic_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_locations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_subscriptions: {
        Row: {
          billing_day: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          category_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_enterprise: boolean | null
          monthly_amount: number
          next_billing_date: string | null
          provider_id: string
          started_at: string | null
          status: string
          tier_id: string
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          billing_day?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          category_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_enterprise?: boolean | null
          monthly_amount: number
          next_billing_date?: string | null
          provider_id: string
          started_at?: string | null
          status?: string
          tier_id: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_day?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          category_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_enterprise?: boolean | null
          monthly_amount?: number
          next_billing_date?: string | null
          provider_id?: string
          started_at?: string | null
          status?: string
          tier_id?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_subscriptions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "specialty_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_subscriptions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_training_progress: {
        Row: {
          created_at: string
          id: string
          provider_id: string
          video_id: string
          watched: boolean
          watched_at: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider_id: string
          video_id: string
          watched?: boolean
          watched_at?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider_id?: string
          video_id?: string
          watched?: boolean
          watched_at?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_training_progress_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_training_progress_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "training_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_training_progress_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "onboarding_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_video_progress: {
        Row: {
          completed_at: string | null
          id: string
          progress_percent: number
          provider_id: string
          started_at: string | null
          status: string
          video_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          progress_percent?: number
          provider_id: string
          started_at?: string | null
          status?: string
          video_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          progress_percent?: number
          provider_id?: string
          started_at?: string | null
          status?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_video_progress_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_video_progress_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "training_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          assigned_sales_rep: string | null
          business_name: string
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          health_score: number | null
          health_score_updated_at: string | null
          id: string
          is_enterprise: boolean | null
          latitude: number | null
          longitude: number | null
          membership_tier_id: string | null
          notes: string | null
          provider_type: string | null
          search_vector: unknown
          service_package_id: string | null
          specialty_category_id: string | null
          state: string | null
          status: Database["public"]["Enums"]["provider_status"]
          tags: string[] | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          assigned_sales_rep?: string | null
          business_name: string
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          health_score?: number | null
          health_score_updated_at?: string | null
          id?: string
          is_enterprise?: boolean | null
          latitude?: number | null
          longitude?: number | null
          membership_tier_id?: string | null
          notes?: string | null
          provider_type?: string | null
          search_vector?: unknown
          service_package_id?: string | null
          specialty_category_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["provider_status"]
          tags?: string[] | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          assigned_sales_rep?: string | null
          business_name?: string
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          health_score?: number | null
          health_score_updated_at?: string | null
          id?: string
          is_enterprise?: boolean | null
          latitude?: number | null
          longitude?: number | null
          membership_tier_id?: string | null
          notes?: string | null
          provider_type?: string | null
          search_vector?: unknown
          service_package_id?: string | null
          specialty_category_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["provider_status"]
          tags?: string[] | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "providers_assigned_sales_rep_fkey"
            columns: ["assigned_sales_rep"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_membership_tier_id_fkey"
            columns: ["membership_tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_service_package_id_fkey"
            columns: ["service_package_id"]
            isOneToOne: false
            referencedRelation: "service_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "providers_specialty_category_id_fkey"
            columns: ["specialty_category_id"]
            isOneToOne: false
            referencedRelation: "specialty_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_cards: {
        Row: {
          category_id: string
          created_at: string | null
          effective_date: string
          id: string
          is_active: boolean | null
          market_id: string
          monthly_rate: number
          tier_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          effective_date?: string
          id?: string
          is_active?: boolean | null
          market_id: string
          monthly_rate: number
          tier_id: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          effective_date?: string
          id?: string
          is_active?: boolean | null
          market_id?: string
          monthly_rate?: number
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_cards_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "specialty_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_cards_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "geographic_markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_cards_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_pipeline: {
        Row: {
          created_at: string
          deal_type_id: string | null
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          notes: string | null
          probability: number | null
          provider_id: string
          sales_rep_id: string
          stage: Database["public"]["Enums"]["pipeline_stage"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_type_id?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          probability?: number | null
          provider_id: string
          sales_rep_id: string
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_type_id?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          probability?: number | null
          provider_id?: string
          sales_rep_id?: string
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_pipeline_deal_type_id_fkey"
            columns: ["deal_type_id"]
            isOneToOne: false
            referencedRelation: "deal_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_pipeline_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_pipeline_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          results_count: number
          search_category: string
          search_location: string | null
          search_radius_miles: number
          search_state: string | null
          search_zip: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["scrape_job_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          results_count?: number
          search_category: string
          search_location?: string | null
          search_radius_miles?: number
          search_state?: string | null
          search_zip?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["scrape_job_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          results_count?: number
          search_category?: string
          search_location?: string | null
          search_radius_miles?: number
          search_state?: string | null
          search_zip?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["scrape_job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "scrape_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scraped_leads: {
        Row: {
          address: string | null
          ai_score: number | null
          ai_summary: string | null
          assigned_to: string | null
          business_name: string
          business_size: string | null
          category: string | null
          city: string | null
          created_at: string
          disqualified_reason: string | null
          email: string | null
          id: string
          latitude: number | null
          longitude: number | null
          phone: string | null
          rating: number | null
          raw_data: Json | null
          review_count: number | null
          scrape_job_id: string | null
          source: string | null
          state: string | null
          status: Database["public"]["Enums"]["scraped_lead_status"]
          updated_at: string
          website: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          ai_score?: number | null
          ai_summary?: string | null
          assigned_to?: string | null
          business_name: string
          business_size?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          disqualified_reason?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          rating?: number | null
          raw_data?: Json | null
          review_count?: number | null
          scrape_job_id?: string | null
          source?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["scraped_lead_status"]
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          ai_score?: number | null
          ai_summary?: string | null
          assigned_to?: string | null
          business_name?: string
          business_size?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          disqualified_reason?: string | null
          email?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          rating?: number | null
          raw_data?: Json | null
          review_count?: number | null
          scrape_job_id?: string | null
          source?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["scraped_lead_status"]
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scraped_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraped_leads_scrape_job_id_fkey"
            columns: ["scrape_job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_packages: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          participant_type: string
          short_code: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          participant_type?: string
          short_code: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          participant_type?: string
          short_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_packages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_audit_log: {
        Row: {
          action: Database["public"]["Enums"]["signature_audit_action"]
          actor_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          signature_request_id: string
          user_agent: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["signature_audit_action"]
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          signature_request_id: string
          user_agent?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["signature_audit_action"]
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          signature_request_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_audit_log_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_requests: {
        Row: {
          contract_id: string
          counter_signature_url: string | null
          counter_signed_at: string | null
          counter_signed_by: string | null
          created_at: string
          declined_at: string | null
          expires_at: string | null
          final_document_url: string | null
          id: string
          ip_address: string | null
          message: string | null
          provider_document_id: string | null
          provider_id: string
          requested_by: string | null
          require_verification: boolean
          sent_at: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["signature_request_status"]
          user_agent: string | null
          viewed_at: string | null
        }
        Insert: {
          contract_id: string
          counter_signature_url?: string | null
          counter_signed_at?: string | null
          counter_signed_by?: string | null
          created_at?: string
          declined_at?: string | null
          expires_at?: string | null
          final_document_url?: string | null
          id?: string
          ip_address?: string | null
          message?: string | null
          provider_document_id?: string | null
          provider_id: string
          requested_by?: string | null
          require_verification?: boolean
          sent_at?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["signature_request_status"]
          user_agent?: string | null
          viewed_at?: string | null
        }
        Update: {
          contract_id?: string
          counter_signature_url?: string | null
          counter_signed_at?: string | null
          counter_signed_by?: string | null
          created_at?: string
          declined_at?: string | null
          expires_at?: string | null
          final_document_url?: string | null
          id?: string
          ip_address?: string | null
          message?: string | null
          provider_document_id?: string | null
          provider_id?: string
          requested_by?: string | null
          require_verification?: boolean
          sent_at?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["signature_request_status"]
          user_agent?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_counter_signed_by_fkey"
            columns: ["counter_signed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_provider_document_id_fkey"
            columns: ["provider_document_id"]
            isOneToOne: false
            referencedRelation: "provider_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_verifications: {
        Row: {
          attempted_at: string | null
          attempts: number
          completed_at: string | null
          id: string
          signature_request_id: string
          status: Database["public"]["Enums"]["verification_status"]
          verification_data: Json | null
          verification_type: Database["public"]["Enums"]["verification_type"]
        }
        Insert: {
          attempted_at?: string | null
          attempts?: number
          completed_at?: string | null
          id?: string
          signature_request_id: string
          status?: Database["public"]["Enums"]["verification_status"]
          verification_data?: Json | null
          verification_type: Database["public"]["Enums"]["verification_type"]
        }
        Update: {
          attempted_at?: string | null
          attempts?: number
          completed_at?: string | null
          id?: string
          signature_request_id?: string
          status?: Database["public"]["Enums"]["verification_status"]
          verification_data?: Json | null
          verification_type?: Database["public"]["Enums"]["verification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "signature_verifications_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      signed_documents: {
        Row: {
          certificate_data: Json | null
          contract_id: string
          created_at: string
          document_url: string | null
          id: string
          signature_image_url: string | null
          signature_request_id: string
        }
        Insert: {
          certificate_data?: Json | null
          contract_id: string
          created_at?: string
          document_url?: string | null
          id?: string
          signature_image_url?: string | null
          signature_request_id: string
        }
        Update: {
          certificate_data?: Json | null
          contract_id?: string
          created_at?: string
          document_url?: string | null
          id?: string
          signature_image_url?: string | null
          signature_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signed_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_documents_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      specialty_categories: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number
          id: string
          is_active: boolean | null
          name: string
          short_code: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order: number
          id?: string
          is_active?: boolean | null
          name: string
          short_code: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          name?: string
          short_code?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["ticket_category"]
          created_at: string
          description: string | null
          id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          provider_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          provider_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          description?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          provider_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      template_signing_fields: {
        Row: {
          assigned_to: string
          auto_fill_date: boolean
          checkbox_label: string | null
          created_at: string | null
          display_order: number
          field_label: string
          field_type: string
          height: number
          id: string
          is_required: boolean
          page_number: number
          placeholder_text: string | null
          template_id: string
          validation_rule: string | null
          width: number
          x_position: number
          y_position: number
        }
        Insert: {
          assigned_to?: string
          auto_fill_date?: boolean
          checkbox_label?: string | null
          created_at?: string | null
          display_order?: number
          field_label?: string
          field_type: string
          height?: number
          id?: string
          is_required?: boolean
          page_number?: number
          placeholder_text?: string | null
          template_id: string
          validation_rule?: string | null
          width?: number
          x_position?: number
          y_position?: number
        }
        Update: {
          assigned_to?: string
          auto_fill_date?: boolean
          checkbox_label?: string | null
          created_at?: string | null
          display_order?: number
          field_label?: string
          field_type?: string
          height?: number
          id?: string
          is_required?: boolean
          page_number?: number
          placeholder_text?: string | null
          template_id?: string
          validation_rule?: string | null
          width?: number
          x_position?: number
          y_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_signing_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          created_at: string
          id: string
          is_ai_response: boolean
          message: string
          sender_id: string | null
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_ai_response?: boolean
          message: string
          sender_id?: string | null
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_ai_response?: boolean
          message?: string
          sender_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      training_videos: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number
          duration_minutes: number
          id: string
          is_active: boolean
          is_required: boolean
          target_audience: string
          thumbnail_url: string | null
          title: string
          video_type: string
          video_url: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          target_audience?: string
          thumbnail_url?: string | null
          title: string
          video_type?: string
          video_url?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          target_audience?: string
          thumbnail_url?: string | null
          title?: string
          video_type?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflow_steps: {
        Row: {
          assigned_to: string | null
          auto_trigger: boolean
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["workflow_step_status"]
          step_name: string
          step_number: number
          step_type: Database["public"]["Enums"]["workflow_step_type"]
          trigger_delay_hours: number
          workflow_id: string
        }
        Insert: {
          assigned_to?: string | null
          auto_trigger?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["workflow_step_status"]
          step_name: string
          step_number: number
          step_type?: Database["public"]["Enums"]["workflow_step_type"]
          trigger_delay_hours?: number
          workflow_id: string
        }
        Update: {
          assigned_to?: string | null
          auto_trigger?: boolean
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["workflow_step_status"]
          step_name?: string
          step_number?: number
          step_type?: Database["public"]["Enums"]["workflow_step_type"]
          trigger_delay_hours?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "onboarding_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      recent_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"] | null
          created_at: string | null
          description: string | null
          id: string | null
          provider_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_ai_rate_limit: {
        Args: { _user_id: string }
        Returns: {
          calls_this_hour: number
          calls_today: number
        }[]
      }
      get_billing_aging: {
        Args: never
        Returns: {
          current_amount: number
          days_14: number
          days_30: number
          days_60: number
          days_60_plus: number
          days_7: number
        }[]
      }
      get_document_stats: {
        Args: never
        Returns: {
          fully_executed: number
          pending: number
          sent: number
          signed: number
        }[]
      }
      get_provider_stats: {
        Args: never
        Returns: {
          count: number
          status: string
        }[]
      }
      get_total_mrr: {
        Args: never
        Returns: {
          law_firm_mrr: number
          provider_mrr: number
          total_mrr: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      activity_type:
        | "call"
        | "email"
        | "meeting"
        | "note"
        | "status_change"
        | "contract_update"
      app_role: "admin" | "sales_rep" | "provider" | "law_firm"
      campaign_activity_type:
        | "call"
        | "voicemail"
        | "email"
        | "note"
        | "status_change"
        | "stage_change"
        | "qualification"
        | "deal_selected"
        | "term_sheet_sent"
        | "term_sheet_accepted"
        | "contracts_sent"
        | "document_signed"
        | "converted"
        | "marked_dead"
        | "revived"
      campaign_lead_status:
        | "pending"
        | "assigned"
        | "call_scheduled"
        | "called"
        | "follow_up"
        | "interested"
        | "not_interested"
        | "no_answer"
        | "wrong_number"
        | "converted"
        | "disqualified"
      campaign_status: "draft" | "active" | "paused" | "completed"
      campaign_type:
        | "state_outreach"
        | "category_blitz"
        | "re_engagement"
        | "custom"
      contract_status:
        | "draft"
        | "pending_review"
        | "sent"
        | "negotiating"
        | "signed"
        | "active"
        | "expired"
        | "terminated"
      contract_type: "standard" | "premium" | "enterprise" | "custom"
      onboarding_notification_status: "pending" | "sent" | "failed" | "read"
      onboarding_notification_type: "email" | "in_app" | "sms"
      pipeline_stage:
        | "lead_identified"
        | "initial_contact"
        | "discovery"
        | "proposal_sent"
        | "negotiation"
        | "closed_won"
        | "closed_lost"
      provider_status:
        | "prospect"
        | "in_negotiation"
        | "contracted"
        | "active"
        | "churned"
        | "suspended"
      review_flag_severity: "low" | "medium" | "high"
      review_flag_type:
        | "adversarial_intent"
        | "legal_loophole"
        | "termination_focused"
        | "competitive_mention"
        | "suspicious_pattern"
      review_message_role: "provider" | "ai" | "system"
      scrape_job_status:
        | "queued"
        | "in_progress"
        | "completed"
        | "failed"
        | "cancelled"
      scraped_lead_status:
        | "new"
        | "assigned"
        | "contacted"
        | "added_to_campaign"
        | "converted"
        | "disqualified"
        | "duplicate"
      signature_audit_action:
        | "request_created"
        | "email_sent"
        | "document_viewed"
        | "identity_check_started"
        | "identity_check_passed"
        | "identity_check_failed"
        | "signed"
        | "declined"
        | "voided"
        | "expired"
        | "downloaded"
        | "counter_signed"
      signature_request_status:
        | "pending"
        | "viewed"
        | "identity_verified"
        | "signed"
        | "declined"
        | "expired"
        | "voided"
        | "fully_executed"
      ticket_category:
        | "billing"
        | "technical"
        | "contract_question"
        | "onboarding"
        | "general"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status:
        | "open"
        | "in_progress"
        | "waiting_on_provider"
        | "resolved"
        | "closed"
      verification_status: "pending" | "passed" | "failed"
      verification_type:
        | "email_code"
        | "sms_code"
        | "knowledge_questions"
        | "selfie_match"
      workflow_status:
        | "not_started"
        | "in_progress"
        | "paused"
        | "completed"
        | "stalled"
      workflow_step_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "skipped"
        | "blocked"
      workflow_step_type:
        | "auto_email"
        | "manual_task"
        | "document_upload"
        | "contract_review"
        | "e_signature"
        | "ai_verification"
        | "approval"
        | "training"
        | "billing_setup"
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
      activity_type: [
        "call",
        "email",
        "meeting",
        "note",
        "status_change",
        "contract_update",
      ],
      app_role: ["admin", "sales_rep", "provider", "law_firm"],
      campaign_activity_type: [
        "call",
        "voicemail",
        "email",
        "note",
        "status_change",
        "stage_change",
        "qualification",
        "deal_selected",
        "term_sheet_sent",
        "term_sheet_accepted",
        "contracts_sent",
        "document_signed",
        "converted",
        "marked_dead",
        "revived",
      ],
      campaign_lead_status: [
        "pending",
        "assigned",
        "call_scheduled",
        "called",
        "follow_up",
        "interested",
        "not_interested",
        "no_answer",
        "wrong_number",
        "converted",
        "disqualified",
      ],
      campaign_status: ["draft", "active", "paused", "completed"],
      campaign_type: [
        "state_outreach",
        "category_blitz",
        "re_engagement",
        "custom",
      ],
      contract_status: [
        "draft",
        "pending_review",
        "sent",
        "negotiating",
        "signed",
        "active",
        "expired",
        "terminated",
      ],
      contract_type: ["standard", "premium", "enterprise", "custom"],
      onboarding_notification_status: ["pending", "sent", "failed", "read"],
      onboarding_notification_type: ["email", "in_app", "sms"],
      pipeline_stage: [
        "lead_identified",
        "initial_contact",
        "discovery",
        "proposal_sent",
        "negotiation",
        "closed_won",
        "closed_lost",
      ],
      provider_status: [
        "prospect",
        "in_negotiation",
        "contracted",
        "active",
        "churned",
        "suspended",
      ],
      review_flag_severity: ["low", "medium", "high"],
      review_flag_type: [
        "adversarial_intent",
        "legal_loophole",
        "termination_focused",
        "competitive_mention",
        "suspicious_pattern",
      ],
      review_message_role: ["provider", "ai", "system"],
      scrape_job_status: [
        "queued",
        "in_progress",
        "completed",
        "failed",
        "cancelled",
      ],
      scraped_lead_status: [
        "new",
        "assigned",
        "contacted",
        "added_to_campaign",
        "converted",
        "disqualified",
        "duplicate",
      ],
      signature_audit_action: [
        "request_created",
        "email_sent",
        "document_viewed",
        "identity_check_started",
        "identity_check_passed",
        "identity_check_failed",
        "signed",
        "declined",
        "voided",
        "expired",
        "downloaded",
        "counter_signed",
      ],
      signature_request_status: [
        "pending",
        "viewed",
        "identity_verified",
        "signed",
        "declined",
        "expired",
        "voided",
        "fully_executed",
      ],
      ticket_category: [
        "billing",
        "technical",
        "contract_question",
        "onboarding",
        "general",
      ],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: [
        "open",
        "in_progress",
        "waiting_on_provider",
        "resolved",
        "closed",
      ],
      verification_status: ["pending", "passed", "failed"],
      verification_type: [
        "email_code",
        "sms_code",
        "knowledge_questions",
        "selfie_match",
      ],
      workflow_status: [
        "not_started",
        "in_progress",
        "paused",
        "completed",
        "stalled",
      ],
      workflow_step_status: [
        "pending",
        "in_progress",
        "completed",
        "skipped",
        "blocked",
      ],
      workflow_step_type: [
        "auto_email",
        "manual_task",
        "document_upload",
        "contract_review",
        "e_signature",
        "ai_verification",
        "approval",
        "training",
        "billing_setup",
      ],
    },
  },
} as const

// Типы БД Veloseller — сгенерированы из ЖИВОЙ схемы Supabase (public) через MCP-
// интроспекцию (information_schema + pg_enum) 22.06.2026. supabase CLI на self-
// hosted упирался в multi-tenant postgres-meta, поэтому собрано напрямую.
//
// Маппинг: uuid/text/date/timestamptz → string, int*/numeric → number, bool →
// boolean, jsonb → Json, _text → string[], enum → public.Enums[...].
// Insert: колонки с DEFAULT или NULLABLE — опциональны. Update: все опциональны.
// Functions: точные сигнатуры из pg_proc — Args по именам параметров (DEFAULT →
// опционально), Returns по RETURNS TABLE/скаляру; триггеры — Returns: unknown.
// Relationships заполнены из живых FK, вьюхи — в Views. RPC типизирован сквозно.
//
// Регенерация: MCP execute_sql по information_schema/pg_enum/pg_proc + pg FK,
// либо `supabase gen types --db-url` на VPS (CLI ходит в БД напрямую).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      _wb_cards_debug: {
        Row: { captured_at: string; connection_id: string; sample: Json };
        Insert: { captured_at?: string; connection_id: string; sample: Json };
        Update: { captured_at?: string; connection_id?: string; sample?: Json };
        Relationships: [];
      };
      admin_audit_log: {
        Row: { action: string; admin_email: string; created_at: string; details: Json | null; id: string; target_seller_id: string | null };
        Insert: { action: string; admin_email: string; created_at?: string; details?: Json | null; id?: string; target_seller_id?: string | null };
        Update: { action?: string; admin_email?: string; created_at?: string; details?: Json | null; id?: string; target_seller_id?: string | null };
        Relationships: [
          { foreignKeyName: "admin_audit_log_target_seller_id_fkey"; columns: ["target_seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      alerts: {
        Row: { acknowledged_at: string | null; created_at: string; id: string; kind: Database["public"]["Enums"]["alert_kind"]; message: string; payload: Json; product_id: string; seller_id: string };
        Insert: { acknowledged_at?: string | null; created_at?: string; id?: string; kind: Database["public"]["Enums"]["alert_kind"]; message: string; payload?: Json; product_id: string; seller_id: string };
        Update: { acknowledged_at?: string | null; created_at?: string; id?: string; kind?: Database["public"]["Enums"]["alert_kind"]; message?: string; payload?: Json; product_id?: string; seller_id?: string };
        Relationships: [
          { foreignKeyName: "alerts_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["product_id"] },
          { foreignKeyName: "alerts_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      changelog: {
        Row: { confidence_impact: number | null; created_at: string; delta_stock: number | null; event_date: string; event_type: Database["public"]["Enums"]["event_type"]; id: string; message: string; product_id: string; seller_id: string };
        Insert: { confidence_impact?: number | null; created_at?: string; delta_stock?: number | null; event_date: string; event_type: Database["public"]["Enums"]["event_type"]; id?: string; message: string; product_id: string; seller_id: string };
        Update: { confidence_impact?: number | null; created_at?: string; delta_stock?: number | null; event_date?: string; event_type?: Database["public"]["Enums"]["event_type"]; id?: string; message?: string; product_id?: string; seller_id?: string };
        Relationships: [
          { foreignKeyName: "changelog_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["product_id"] },
          { foreignKeyName: "changelog_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      data_connections: {
        Row: { config: Json; created_at: string; error_notified_at: string | null; failure_count: number; id: string; last_error: string | null; last_sync_at: string | null; marketplace: Database["public"]["Enums"]["marketplace_kind"] | null; name: string; seller_id: string; source: Database["public"]["Enums"]["source_type"]; status: Database["public"]["Enums"]["connection_status"]; updated_at: string; warehouse_kind: Database["public"]["Enums"]["warehouse_kind"] };
        Insert: { config?: Json; created_at?: string; error_notified_at?: string | null; failure_count?: number; id?: string; last_error?: string | null; last_sync_at?: string | null; marketplace?: Database["public"]["Enums"]["marketplace_kind"] | null; name: string; seller_id: string; source: Database["public"]["Enums"]["source_type"]; status?: Database["public"]["Enums"]["connection_status"]; updated_at?: string; warehouse_kind: Database["public"]["Enums"]["warehouse_kind"] };
        Update: { config?: Json; created_at?: string; error_notified_at?: string | null; failure_count?: number; id?: string; last_error?: string | null; last_sync_at?: string | null; marketplace?: Database["public"]["Enums"]["marketplace_kind"] | null; name?: string; seller_id?: string; source?: Database["public"]["Enums"]["source_type"]; status?: Database["public"]["Enums"]["connection_status"]; updated_at?: string; warehouse_kind?: Database["public"]["Enums"]["warehouse_kind"] };
        Relationships: [
          { foreignKeyName: "data_connections_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      inventory_events: {
        Row: { created_at: string; current_snapshot_id: string; delta_stock: number | null; event_date: string; event_id: string; event_time: string; event_type: Database["public"]["Enums"]["event_type"]; excluded_from_confirmed_metrics: boolean; previous_snapshot_id: string | null; product_id: string };
        Insert: { created_at?: string; current_snapshot_id: string; delta_stock?: number | null; event_date: string; event_id?: string; event_time: string; event_type: Database["public"]["Enums"]["event_type"]; excluded_from_confirmed_metrics?: boolean; previous_snapshot_id?: string | null; product_id: string };
        Update: { created_at?: string; current_snapshot_id?: string; delta_stock?: number | null; event_date?: string; event_id?: string; event_time?: string; event_type?: Database["public"]["Enums"]["event_type"]; excluded_from_confirmed_metrics?: boolean; previous_snapshot_id?: string | null; product_id?: string };
        Relationships: [
          { foreignKeyName: "inventory_events_current_snapshot_id_fkey"; columns: ["current_snapshot_id"]; isOneToOne: false; referencedRelation: "inventory_snapshots"; referencedColumns: ["snapshot_id"] },
          { foreignKeyName: "inventory_events_previous_snapshot_id_fkey"; columns: ["previous_snapshot_id"]; isOneToOne: false; referencedRelation: "inventory_snapshots"; referencedColumns: ["snapshot_id"] },
          { foreignKeyName: "inventory_events_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["product_id"] },
        ];
      };
      inventory_snapshots: {
        Row: { availability: boolean; commission_pct: number | null; connection_id: string | null; created_at: string; marketing_price: number | null; price: number; product_id: string; seller_price: number | null; snapshot_id: string; snapshot_time: string; source: Database["public"]["Enums"]["source_type"]; stock_quantity: number };
        Insert: { availability: boolean; commission_pct?: number | null; connection_id?: string | null; created_at?: string; marketing_price?: number | null; price: number; product_id: string; seller_price?: number | null; snapshot_id?: string; snapshot_time: string; source: Database["public"]["Enums"]["source_type"]; stock_quantity: number };
        Update: { availability?: boolean; commission_pct?: number | null; connection_id?: string | null; created_at?: string; marketing_price?: number | null; price?: number; product_id?: string; seller_price?: number | null; snapshot_id?: string; snapshot_time?: string; source?: Database["public"]["Enums"]["source_type"]; stock_quantity?: number };
        Relationships: [
          { foreignKeyName: "inventory_snapshots_connection_id_fkey"; columns: ["connection_id"]; isOneToOne: false; referencedRelation: "data_connections"; referencedColumns: ["id"] },
          { foreignKeyName: "inventory_snapshots_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["product_id"] },
        ];
      };
      notification_subscriptions: {
        Row: { channel: Database["public"]["Enums"]["notification_channel"]; created_at: string; enabled: boolean; frequency: Database["public"]["Enums"]["notification_frequency"]; id: string; kind: Database["public"]["Enums"]["notification_kind"]; params: Json; seller_id: string; updated_at: string };
        Insert: { channel: Database["public"]["Enums"]["notification_channel"]; created_at?: string; enabled?: boolean; frequency?: Database["public"]["Enums"]["notification_frequency"]; id?: string; kind: Database["public"]["Enums"]["notification_kind"]; params?: Json; seller_id: string; updated_at?: string };
        Update: { channel?: Database["public"]["Enums"]["notification_channel"]; created_at?: string; enabled?: boolean; frequency?: Database["public"]["Enums"]["notification_frequency"]; id?: string; kind?: Database["public"]["Enums"]["notification_kind"]; params?: Json; seller_id?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "notification_subscriptions_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      price_elasticity: {
        Row: { change_date: string; computed_at: string; days_after: number; days_before: number; id: string; new_price: number; previous_price: number; price_delta_pct: number; price_impact_percent: number | null; product_id: string; seller_id: string; velocity_after: number | null; velocity_before: number | null };
        Insert: { change_date: string; computed_at?: string; days_after?: number; days_before?: number; id?: string; new_price: number; previous_price: number; price_delta_pct: number; price_impact_percent?: number | null; product_id: string; seller_id: string; velocity_after?: number | null; velocity_before?: number | null };
        Update: { change_date?: string; computed_at?: string; days_after?: number; days_before?: number; id?: string; new_price?: number; previous_price?: number; price_delta_pct?: number; price_impact_percent?: number | null; product_id?: string; seller_id?: string; velocity_after?: number | null; velocity_before?: number | null };
        Relationships: [
          { foreignKeyName: "price_elasticity_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["product_id"] },
          { foreignKeyName: "price_elasticity_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      product_events: {
        Row: { comment: string | null; connection_id: string; created_at: string; end_date: string | null; id: string; product_id: string | null; seller_id: string; start_date: string; title: string; updated_at: string };
        Insert: { comment?: string | null; connection_id: string; created_at?: string; end_date?: string | null; id?: string; product_id?: string | null; seller_id: string; start_date: string; title: string; updated_at?: string };
        Update: { comment?: string | null; connection_id?: string; created_at?: string; end_date?: string | null; id?: string; product_id?: string | null; seller_id?: string; start_date?: string; title?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "product_events_connection_id_fkey"; columns: ["connection_id"]; isOneToOne: false; referencedRelation: "data_connections"; referencedColumns: ["id"] },
          { foreignKeyName: "product_events_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["product_id"] },
          { foreignKeyName: "product_events_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      products: {
        Row: { brand: string | null; category: string | null; connection_id: string; cost_price: number | null; cost_price_updated_at: string | null; created_at: string; lead_time_days: number | null; product_id: string; product_name: string; safety_days: number | null; seller_id: string; sku: string; tags: string[] | null; updated_at: string; user_notes: string | null };
        Insert: { brand?: string | null; category?: string | null; connection_id: string; cost_price?: number | null; cost_price_updated_at?: string | null; created_at?: string; lead_time_days?: number | null; product_id?: string; product_name: string; safety_days?: number | null; seller_id: string; sku: string; tags?: string[] | null; updated_at?: string; user_notes?: string | null };
        Update: { brand?: string | null; category?: string | null; connection_id?: string; cost_price?: number | null; cost_price_updated_at?: string | null; created_at?: string; lead_time_days?: number | null; product_id?: string; product_name?: string; safety_days?: number | null; seller_id?: string; sku?: string; tags?: string[] | null; updated_at?: string; user_notes?: string | null };
        Relationships: [
          { foreignKeyName: "products_connection_id_fkey"; columns: ["connection_id"]; isOneToOne: false; referencedRelation: "data_connections"; referencedColumns: ["id"] },
          { foreignKeyName: "products_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      radar_actions: {
        Row: { action_type: string; created_at: string; id: string; query_id: string | null; seller_id: string };
        Insert: { action_type: string; created_at?: string; id?: string; query_id?: string | null; seller_id: string };
        Update: { action_type?: string; created_at?: string; id?: string; query_id?: string | null; seller_id?: string };
        Relationships: [
          { foreignKeyName: "radar_actions_query_id_fkey"; columns: ["query_id"]; isOneToOne: false; referencedRelation: "radar_queries"; referencedColumns: ["id"] },
          { foreignKeyName: "radar_actions_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      radar_brands: {
        Row: { avg_price: number | null; created_at: string; id: string; last_wordstat_at: string | null; name: string; name_normalized: string; seller_id: string; sku_count: number | null; source: string; status: string; updated_at: string };
        Insert: { avg_price?: number | null; created_at?: string; id?: string; last_wordstat_at?: string | null; name: string; name_normalized: string; seller_id: string; sku_count?: number | null; source?: string; status?: string; updated_at?: string };
        Update: { avg_price?: number | null; created_at?: string; id?: string; last_wordstat_at?: string | null; name?: string; name_normalized?: string; seller_id?: string; sku_count?: number | null; source?: string; status?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "radar_brands_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      radar_cache: {
        Row: { cache_key: string; created_at: string; expires_at: string; id: string; payload: Json; provider: string };
        Insert: { cache_key: string; created_at?: string; expires_at: string; id?: string; payload: Json; provider: string };
        Update: { cache_key?: string; created_at?: string; expires_at?: string; id?: string; payload?: Json; provider?: string };
        Relationships: [];
      };
      radar_price_models: {
        Row: { brand_name_hint: string | null; first_seen_at: string; last_seen_at: string; model_token: string; seller_id: string };
        Insert: { brand_name_hint?: string | null; first_seen_at?: string; last_seen_at?: string; model_token: string; seller_id: string };
        Update: { brand_name_hint?: string | null; first_seen_at?: string; last_seen_at?: string; model_token?: string; seller_id?: string };
        Relationships: [
          { foreignKeyName: "radar_price_models_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      radar_price_uploads: {
        Row: { ai_cost_usd: number | null; ai_input_tokens: number | null; ai_model: string | null; ai_output_tokens: number | null; ai_provider: string | null; ai_response: Json | null; brands_approved: number | null; brands_extracted: number | null; completed_at: string | null; created_at: string; error_message: string | null; file_hash: string; file_name: string; file_size_bytes: number; id: string; rows_total: number | null; seller_id: string; status: string };
        Insert: { ai_cost_usd?: number | null; ai_input_tokens?: number | null; ai_model?: string | null; ai_output_tokens?: number | null; ai_provider?: string | null; ai_response?: Json | null; brands_approved?: number | null; brands_extracted?: number | null; completed_at?: string | null; created_at?: string; error_message?: string | null; file_hash: string; file_name: string; file_size_bytes: number; id?: string; rows_total?: number | null; seller_id: string; status?: string };
        Update: { ai_cost_usd?: number | null; ai_input_tokens?: number | null; ai_model?: string | null; ai_output_tokens?: number | null; ai_provider?: string | null; ai_response?: Json | null; brands_approved?: number | null; brands_extracted?: number | null; completed_at?: string | null; created_at?: string; error_message?: string | null; file_hash?: string; file_name?: string; file_size_bytes?: number; id?: string; rows_total?: number | null; seller_id?: string; status?: string };
        Relationships: [
          { foreignKeyName: "radar_price_uploads_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      radar_queries: {
        Row: { brand_id: string; created_at: string; current_frequency: number | null; first_seen_at: string; id: string; is_favorite: boolean | null; last_updated_at: string; present_in_ozon: boolean | null; present_in_wb: boolean | null; query_normalized: string; query_text: string; seller_id: string; status: string; suggest_checked_at: string | null; trend_pct: number | null };
        Insert: { brand_id: string; created_at?: string; current_frequency?: number | null; first_seen_at?: string; id?: string; is_favorite?: boolean | null; last_updated_at?: string; present_in_ozon?: boolean | null; present_in_wb?: boolean | null; query_normalized: string; query_text: string; seller_id: string; status?: string; suggest_checked_at?: string | null; trend_pct?: number | null };
        Update: { brand_id?: string; created_at?: string; current_frequency?: number | null; first_seen_at?: string; id?: string; is_favorite?: boolean | null; last_updated_at?: string; present_in_ozon?: boolean | null; present_in_wb?: boolean | null; query_normalized?: string; query_text?: string; seller_id?: string; status?: string; suggest_checked_at?: string | null; trend_pct?: number | null };
        Relationships: [
          { foreignKeyName: "radar_queries_brand_id_fkey"; columns: ["brand_id"]; isOneToOne: false; referencedRelation: "radar_brands"; referencedColumns: ["id"] },
          { foreignKeyName: "radar_queries_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      radar_query_history: {
        Row: { captured_at: string; frequency: number; id: string; period_month: number; period_year: number; query_id: string };
        Insert: { captured_at?: string; frequency?: number; id?: string; period_month: number; period_year: number; query_id: string };
        Update: { captured_at?: string; frequency?: number; id?: string; period_month?: number; period_year?: number; query_id?: string };
        Relationships: [
          { foreignKeyName: "radar_query_history_query_id_fkey"; columns: ["query_id"]; isOneToOne: false; referencedRelation: "radar_queries"; referencedColumns: ["id"] },
        ];
      };
      recalc_jobs: {
        Row: { error_text: string | null; finished_at: string | null; progress: Json | null; result: Json | null; seller_id: string; started_at: string; status: string; updated_at: string; worker_id: string | null };
        Insert: { error_text?: string | null; finished_at?: string | null; progress?: Json | null; result?: Json | null; seller_id: string; started_at?: string; status: string; updated_at?: string; worker_id?: string | null };
        Update: { error_text?: string | null; finished_at?: string | null; progress?: Json | null; result?: Json | null; seller_id?: string; started_at?: string; status?: string; updated_at?: string; worker_id?: string | null };
        Relationships: [
          { foreignKeyName: "recalc_jobs_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      report_history: {
        Row: { channel: Database["public"]["Enums"]["notification_channel"]; day_of_week: number; error_message: string | null; file_name: string | null; file_size_bytes: number | null; id: string; kinds: string[]; seller_id: string; sent_at: string; sent_date: string | null; sku_counts: Json; status: string; storage_path: string | null };
        Insert: { channel: Database["public"]["Enums"]["notification_channel"]; day_of_week: number; error_message?: string | null; file_name?: string | null; file_size_bytes?: number | null; id?: string; kinds: string[]; seller_id: string; sent_at?: string; sent_date?: string | null; sku_counts?: Json; status?: string; storage_path?: string | null };
        Update: { channel?: Database["public"]["Enums"]["notification_channel"]; day_of_week?: number; error_message?: string | null; file_name?: string | null; file_size_bytes?: number | null; id?: string; kinds?: string[]; seller_id?: string; sent_at?: string; sent_date?: string | null; sku_counts?: Json; status?: string; storage_path?: string | null };
        Relationships: [
          { foreignKeyName: "report_history_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      robokassa_invoices: {
        Row: { amount: number; created_at: string; currency: string; expires_at: string; id: string; inv_id: number; is_test: boolean; paid_at: string | null; plan: string; product_kind: string | null; result_payload: Json | null; seller_id: string; status: string; updated_at: string };
        Insert: { amount: number; created_at?: string; currency?: string; expires_at?: string; id?: string; inv_id?: number; is_test?: boolean; paid_at?: string | null; plan: string; product_kind?: string | null; result_payload?: Json | null; seller_id: string; status?: string; updated_at?: string };
        Update: { amount?: number; created_at?: string; currency?: string; expires_at?: string; id?: string; inv_id?: number; is_test?: boolean; paid_at?: string | null; plan?: string; product_kind?: string | null; result_payload?: Json | null; seller_id?: string; status?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "robokassa_invoices_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      sellers: {
        Row: { created_at: string; currency: string; current_period_end: string | null; default_lead_time_days: number; default_safety_days: number; display_name: string | null; email: string; id: string; last_payment_failed_at: string | null; last_payment_failed_reason: string | null; last_payment_succeeded_at: string | null; notify_email: boolean; notify_telegram: boolean; payment_failure_count: number; plan: string; plan_sku_per_warehouse_limit: number; plan_warehouses_limit: number; radar_active_until: string | null; radar_brands_limit: number | null; radar_plan: string | null; radar_trial_started_at: string | null; subscription_expires_at: string | null; subscription_status: string | null; tax_rate: number | null; telegram_chat_id: string | null; timezone: string; trial_ends_at: string; updated_at: string };
        Insert: { created_at?: string; currency?: string; current_period_end?: string | null; default_lead_time_days?: number; default_safety_days?: number; display_name?: string | null; email: string; id: string; last_payment_failed_at?: string | null; last_payment_failed_reason?: string | null; last_payment_succeeded_at?: string | null; notify_email?: boolean; notify_telegram?: boolean; payment_failure_count?: number; plan?: string; plan_sku_per_warehouse_limit?: number; plan_warehouses_limit?: number; radar_active_until?: string | null; radar_brands_limit?: number | null; radar_plan?: string | null; radar_trial_started_at?: string | null; subscription_expires_at?: string | null; subscription_status?: string | null; tax_rate?: number | null; telegram_chat_id?: string | null; timezone?: string; trial_ends_at?: string; updated_at?: string };
        Update: { created_at?: string; currency?: string; current_period_end?: string | null; default_lead_time_days?: number; default_safety_days?: number; display_name?: string | null; email?: string; id?: string; last_payment_failed_at?: string | null; last_payment_failed_reason?: string | null; last_payment_succeeded_at?: string | null; notify_email?: boolean; notify_telegram?: boolean; payment_failure_count?: number; plan?: string; plan_sku_per_warehouse_limit?: number; plan_warehouses_limit?: number; radar_active_until?: string | null; radar_brands_limit?: number | null; radar_plan?: string | null; radar_trial_started_at?: string | null; subscription_expires_at?: string | null; subscription_status?: string | null; tax_rate?: number | null; telegram_chat_id?: string | null; timezone?: string; trial_ends_at?: string; updated_at?: string };
        Relationships: [];
      };
      store_metrics: {
        Row: { computed_at: string; dead_inventory_sku_count: number; demand_concentration_50: number | null; demand_pattern_distribution: Json; frequently_oos_sku_count: number; id: string; inactive_sku_count: number; inventory_concentration_50: number | null; lost_revenue: number; low_stock_sku_count: number; oos_sku_count: number; period_end: string; period_start: string; potential_revenue: number | null; seller_id: string; store_frozen_inventory_value: number; total_inventory_value: number; total_sku_count: number; warehouse_health_score: number | null };
        Insert: { computed_at?: string; dead_inventory_sku_count?: number; demand_concentration_50?: number | null; demand_pattern_distribution?: Json; frequently_oos_sku_count?: number; id?: string; inactive_sku_count?: number; inventory_concentration_50?: number | null; lost_revenue?: number; low_stock_sku_count?: number; oos_sku_count?: number; period_end: string; period_start: string; potential_revenue?: number | null; seller_id: string; store_frozen_inventory_value?: number; total_inventory_value?: number; total_sku_count?: number; warehouse_health_score?: number | null };
        Update: { computed_at?: string; dead_inventory_sku_count?: number; demand_concentration_50?: number | null; demand_pattern_distribution?: Json; frequently_oos_sku_count?: number; id?: string; inactive_sku_count?: number; inventory_concentration_50?: number | null; lost_revenue?: number; low_stock_sku_count?: number; oos_sku_count?: number; period_end?: string; period_start?: string; potential_revenue?: number | null; seller_id?: string; store_frozen_inventory_value?: number; total_inventory_value?: number; total_sku_count?: number; warehouse_health_score?: number | null };
        Relationships: [
          { foreignKeyName: "store_metrics_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      system_settings: {
        Row: { category: string | null; description: string | null; key: string; updated_at: string | null; updated_by: string | null; value: Json };
        Insert: { category?: string | null; description?: string | null; key: string; updated_at?: string | null; updated_by?: string | null; value: Json };
        Update: { category?: string | null; description?: string | null; key?: string; updated_at?: string | null; updated_by?: string | null; value?: Json };
        Relationships: [];
      };
      tvelo_metrics: {
        Row: { adjusted_velocity: number | null; computed_at: string; confidence_breakdown: Json; confidence_score: number; confirmed_velocity: number | null; coverage_days: number | null; current_price: number | null; current_stock: number; id: string; in_stock_days: number; inventory_segment: Database["public"]["Enums"]["inventory_segment"] | null; median_30d_velocity: number; period_end: string; period_start: string; product_id: string; sku_health_score: number | null; stockout_days: number; underestimated_sku: boolean };
        Insert: { adjusted_velocity?: number | null; computed_at?: string; confidence_breakdown?: Json; confidence_score: number; confirmed_velocity?: number | null; coverage_days?: number | null; current_price?: number | null; current_stock?: number; id?: string; in_stock_days?: number; inventory_segment?: Database["public"]["Enums"]["inventory_segment"] | null; median_30d_velocity?: number; period_end: string; period_start: string; product_id: string; sku_health_score?: number | null; stockout_days?: number; underestimated_sku?: boolean };
        Update: { adjusted_velocity?: number | null; computed_at?: string; confidence_breakdown?: Json; confidence_score?: number; confirmed_velocity?: number | null; coverage_days?: number | null; current_price?: number | null; current_stock?: number; id?: string; in_stock_days?: number; inventory_segment?: Database["public"]["Enums"]["inventory_segment"] | null; median_30d_velocity?: number; period_end?: string; period_start?: string; product_id?: string; sku_health_score?: number | null; stockout_days?: number; underestimated_sku?: boolean };
        Relationships: [
          { foreignKeyName: "tvelo_metrics_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["product_id"] },
        ];
      };
      warehouse_metrics: {
        Row: { computed_at: string; connection_id: string; dead_inventory_sku_count: number | null; demand_concentration_50: number | null; demand_pattern_distribution: Json | null; frequently_oos_sku_count: number | null; id: string; inactive_sku_count: number | null; inventory_concentration_50: number | null; lost_revenue: number | null; low_stock_sku_count: number | null; oos_sku_count: number | null; period_end: string; period_start: string; potential_revenue: number | null; seller_id: string; store_frozen_inventory_value: number | null; total_inventory_value: number | null; total_sku_count: number | null; warehouse_health_score: number | null };
        Insert: { computed_at?: string; connection_id: string; dead_inventory_sku_count?: number | null; demand_concentration_50?: number | null; demand_pattern_distribution?: Json | null; frequently_oos_sku_count?: number | null; id?: string; inactive_sku_count?: number | null; inventory_concentration_50?: number | null; lost_revenue?: number | null; low_stock_sku_count?: number | null; oos_sku_count?: number | null; period_end: string; period_start: string; potential_revenue?: number | null; seller_id: string; store_frozen_inventory_value?: number | null; total_inventory_value?: number | null; total_sku_count?: number | null; warehouse_health_score?: number | null };
        Update: { computed_at?: string; connection_id?: string; dead_inventory_sku_count?: number | null; demand_concentration_50?: number | null; demand_pattern_distribution?: Json | null; frequently_oos_sku_count?: number | null; id?: string; inactive_sku_count?: number | null; inventory_concentration_50?: number | null; lost_revenue?: number | null; low_stock_sku_count?: number | null; oos_sku_count?: number | null; period_end?: string; period_start?: string; potential_revenue?: number | null; seller_id?: string; store_frozen_inventory_value?: number | null; total_inventory_value?: number | null; total_sku_count?: number | null; warehouse_health_score?: number | null };
        Relationships: [
          { foreignKeyName: "warehouse_metrics_connection_id_fkey"; columns: ["connection_id"]; isOneToOne: false; referencedRelation: "data_connections"; referencedColumns: ["id"] },
          { foreignKeyName: "warehouse_metrics_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
      warehouse_metrics_history: {
        Row: { computed_at: string | null; connection_id: string; dead_inventory_sku_count: number | null; id: string; lost_revenue: number | null; period_end: string; period_start: string; seller_id: string; store_frozen_inventory_value: number | null; total_inventory_value: number | null; warehouse_health_score: number | null };
        Insert: { computed_at?: string | null; connection_id: string; dead_inventory_sku_count?: number | null; id?: string; lost_revenue?: number | null; period_end: string; period_start: string; seller_id: string; store_frozen_inventory_value?: number | null; total_inventory_value?: number | null; warehouse_health_score?: number | null };
        Update: { computed_at?: string | null; connection_id?: string; dead_inventory_sku_count?: number | null; id?: string; lost_revenue?: number | null; period_end?: string; period_start?: string; seller_id?: string; store_frozen_inventory_value?: number | null; total_inventory_value?: number | null; warehouse_health_score?: number | null };
        Relationships: [
          { foreignKeyName: "warehouse_metrics_history_connection_id_fkey"; columns: ["connection_id"]; isOneToOne: false; referencedRelation: "data_connections"; referencedColumns: ["id"] },
          { foreignKeyName: "warehouse_metrics_history_seller_id_fkey"; columns: ["seller_id"]; isOneToOne: false; referencedRelation: "sellers"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: {
      radar_queries_view: {
        Row: { id: string | null; seller_id: string | null; brand_id: string | null; brand_name: string | null; brand_normalized: string | null; brand_source: string | null; query_text: string | null; query_normalized: string | null; status: string | null; is_favorite: boolean | null; current_frequency: number | null; trend_pct: number | null; present_in_wb: boolean | null; present_in_ozon: boolean | null; in_any_suggest: boolean | null; suggest_checked_at: string | null; first_seen_at: string | null; last_updated_at: string | null; days_since_first_seen: number | null };
        Relationships: [];
      };
    };
    // Сигнатуры функций — из живой схемы (pg_proc), карта типов как у gen types.
    // Args нул-аргументных функций — Record<PropertyKey, never>; триггеры —
    // Returns: unknown. p_connection_id допускает null там, где вызовы шлют `?? null`.
    Functions: {
      admin_auth_onboarding_health: {
        Args: Record<PropertyKey, never>;
        Returns: { trigger_present: boolean; orphan_count: number }[];
      };
      admin_connection_data_age: {
        Args: Record<PropertyKey, never>;
        Returns: {
          connection_id: string; seller_id: string; seller_email: string; connection_name: string;
          marketplace: string; source: string; status: string; last_sync_at: string;
          hours_since_last_sync: number; first_snapshot_at: string; last_snapshot_at: string;
          days_of_history: number; snapshots_count: number; last_error: string;
        }[];
      };
      bulk_update_cost_prices: {
        Args: { p_seller_id: string; p_connection_id: string; p_costs: Json };
        Returns: number;
      };
      bulk_upsert_products: { Args: { p_rows: Json }; Returns: undefined };
      create_default_notification_subscriptions: { Args: Record<PropertyKey, never>; Returns: unknown };
      enforce_sku_limit: { Args: Record<PropertyKey, never>; Returns: unknown };
      execute_sql: { Args: { query: string; read_only?: boolean }; Returns: Json };
      get_concentration_product_ids: {
        Args: { p_seller_id: string; p_connection_id?: string | null; p_kind?: string };
        Returns: { product_id: string }[];
      };
      get_dashboard_velocities: {
        Args: { p_seller_id: string; p_connection_id?: string | null };
        Returns: { product_id: string; adjusted_velocity: number; confidence_score: number }[];
      };
      get_skus_facets: {
        Args: { p_seller_id: string; p_connection_id?: string | null };
        Returns: { brands: string[]; categories: string[]; tags: string[] }[];
      };
      get_skus_filter_ranges: {
        Args: { p_seller_id: string; p_connection_id?: string | null; p_period_days?: number };
        Returns: {
          stock_min: number; stock_max: number; oos_min: number; oos_max: number;
          lost_min: number; lost_max: number; coverage_min: number; coverage_max: number;
        }[];
      };
      get_skus_period_metrics: {
        Args: {
          p_seller_id: string; p_connection_id: string | null; p_period_start: string;
          p_period_end: string; p_product_ids: string[];
        };
        Returns: {
          product_id: string; velocity: number; in_stock_days: number; stockout_days: number;
          sales_units: number; current_stock: number; current_price: number;
          coverage_days: number; lost_revenue: number;
        }[];
      };
      get_sync_log_history: {
        Args: { p_seller_id: string; p_days?: number };
        Returns: { sync_date: string; connection_id: string; snapshots_count: number; last_snapshot_time: string }[];
      };
      get_warehouse_dashboard_metrics: {
        Args: { p_seller_id: string; p_connection_id: string; p_period_days?: number };
        Returns: {
          total_sku_count: number; active_sku_count: number; oos_sku_count: number;
          inactive_sku_count: number; low_stock_sku_count: number; dead_inventory_sku_count: number;
          frequently_oos_sku_count: number; total_inventory_value: number;
          store_frozen_inventory_value: number; lost_revenue: number; potential_revenue: number;
          warehouse_health_score: number; inventory_concentration_50: number;
          demand_concentration_50: number; demand_pattern_distribution: Json;
        }[];
      };
      handle_new_user: { Args: Record<PropertyKey, never>; Returns: unknown };
      mark_recalc_done: { Args: { p_seller_id: string; p_result: Json }; Returns: undefined };
      mark_recalc_error: { Args: { p_seller_id: string; p_error_text: string }; Returns: undefined };
      plan_sku_limit: { Args: { p: string }; Returns: number };
      set_updated_at: { Args: Record<PropertyKey, never>; Returns: unknown };
      touch_radar_brands_updated_at: { Args: Record<PropertyKey, never>; Returns: unknown };
      trg_recalc_jobs_touch: { Args: Record<PropertyKey, never>; Returns: unknown };
      try_acquire_recalc_lock: {
        Args: { p_seller_id: string; p_worker_id?: string | null; p_stale_after?: unknown };
        Returns: boolean;
      };
      update_recalc_progress: { Args: { p_seller_id: string; p_progress: Json }; Returns: undefined };
      update_warehouses_limit_on_plan_change: { Args: Record<PropertyKey, never>; Returns: unknown };
    };
    Enums: {
      alert_kind: "low_stock" | "critical_stock" | "dead_inventory" | "repeated_stockout" | "underestimated_sku";
      connection_status: "active" | "syncing" | "paused" | "error" | "pending";
      demand_pattern: "stable" | "unpredictable" | "seasonal_candidate" | "insufficient_history";
      event_type: "first_snapshot" | "no_change" | "sales_like" | "replenishment_like" | "anomaly_like" | "recount_like" | "missing_data" | "price_change";
      inventory_segment: "fast_movers" | "stable" | "slow_movers" | "dead_inventory_risk" | "insufficient_data";
      marketplace_kind: "ozon" | "wildberries" | "amazon" | "shopify";
      notification_channel: "email" | "telegram";
      notification_frequency: "weekly" | "monthly" | "daily";
      notification_kind: "low_stock" | "critical_stock" | "dead_inventory" | "repeated_stockout" | "underestimated_sku" | "sync_error" | "weekly_report" | "daily_digest";
      source_type: "google_sheet" | "marketplace_api" | "csv_upload" | "feed" | "manual";
      warehouse_kind: "ozon_fbo" | "ozon_fbs" | "wb_fbo" | "wb_fbs" | "google_sheet";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

// Точечные хелперы типов. Используйте их для аннотации результатов запросов
// вместо глобального generic createClient<Database>. Пример:
//   const { data } = await sb.from("products").select("*");
//   const rows = data as Tables<"products">[];
//
// Почему НЕ глобальный <Database>: файл собран вручную (CLI `supabase gen types`
// недоступен на self-hosted из-за multi-tenant postgres-meta), поэтому покрывает
// только Row/Insert/Update базовых таблиц. Здесь НЕТ полного вывода gen types:
// Relationships у всех таблиц пустые ([]) и не описаны вьюхи (connections,
// radar_queries_view). А postgrest-js@2.108 строго проверяет встроенные select'ы
// (sellers(email), products!inner(...)) по Relationships и цели .from() по списку
// отношений — с неполными метаданными глобальный generic даёт ложные ошибки на
// валидных запросах (каскад ~182 ошибок). Включить <Database> можно после
// регенерации файла через CLI либо полного заполнения Relationships + Views.
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

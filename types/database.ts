// Manual Supabase types for the clean insumos resolver schema.
// Replace with Supabase typegen when the hosted database is reset.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type Numeric = string

export type Database = {
  public: {
    Tables: {
      departamentos: {
        Row: {
          id: string
          name: string
          normalized_name: string
          active: boolean | null
        }
        Insert: {
          id: string
          name: string
          normalized_name: string
          active?: boolean | null
        }
        Update: {
          id?: string
          name?: string
          normalized_name?: string
          active?: boolean | null
        }
        Relationships: []
      }
      department_jornal_costs: {
        Row: {
          departamento_id: string
          jornal_with_food_cop: Numeric | null
          jornal_without_food_cop: Numeric
          source_sheet: string
          source_row: number
          source_row_data: Json | null
          active: boolean | null
        }
        Insert: {
          departamento_id: string
          jornal_with_food_cop?: Numeric | number | null
          jornal_without_food_cop: Numeric | number
          source_sheet?: string
          source_row: number
          source_row_data?: Json | null
          active?: boolean | null
        }
        Update: {
          departamento_id?: string
          jornal_with_food_cop?: Numeric | number | null
          jornal_without_food_cop?: Numeric | number
          source_sheet?: string
          source_row?: number
          source_row_data?: Json | null
          active?: boolean | null
        }
        Relationships: []
      }
      municipios: {
        Row: {
          id: string
          departamento_id: string
          name: string
          normalized_name: string
          type: string | null
          longitude: Numeric | null
          latitude: Numeric | null
          active: boolean | null
        }
        Insert: {
          id: string
          departamento_id: string
          name: string
          normalized_name: string
          type?: string | null
          longitude?: Numeric | number | null
          latitude?: Numeric | number | null
          active?: boolean | null
        }
        Update: {
          id?: string
          departamento_id?: string
          name?: string
          normalized_name?: string
          type?: string | null
          longitude?: Numeric | number | null
          latitude?: Numeric | number | null
          active?: boolean | null
        }
        Relationships: []
      }
      crops: {
        Row: {
          id: string
          name: string
          normalized_name: string
          active: boolean | null
        }
        Insert: {
          id: string
          name: string
          normalized_name: string
          active?: boolean | null
        }
        Update: {
          id?: string
          name?: string
          normalized_name?: string
          active?: boolean | null
        }
        Relationships: []
      }
      varieties: {
        Row: {
          id: string
          crop_id: string
          name: string
          normalized_name: string
          active: boolean | null
        }
        Insert: {
          id: string
          crop_id: string
          name: string
          normalized_name: string
          active?: boolean | null
        }
        Update: {
          id?: string
          crop_id?: string
          name?: string
          normalized_name?: string
          active?: boolean | null
        }
        Relationships: []
      }
      production_stages: {
        Row: {
          id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          name: string
          line_order: number
        }
        Insert: {
          id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          name: string
          line_order: number
        }
        Update: {
          id?: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          name?: string
          line_order?: number
        }
        Relationships: []
      }
      lookup_options: {
        Row: {
          id: string
          group_key: string
          value: string
          label: string
          metadata: Json | null
          line_order: number | null
          active: boolean | null
        }
        Insert: {
          id?: string
          group_key: string
          value: string
          label: string
          metadata?: Json | null
          line_order?: number | null
          active?: boolean | null
        }
        Update: {
          id?: string
          group_key?: string
          value?: string
          label?: string
          metadata?: Json | null
          line_order?: number | null
          active?: boolean | null
        }
        Relationships: []
      }
      crop_variety_agronomic_profiles: {
        Row: {
          id: string
          crop_id: string
          variety_id: string
          lifecycle_months: Numeric | null
          lifecycle_years: Numeric | null
          harvest_start_month: Numeric | null
          harvest_start_year: Numeric | null
          default_row_distance_m: Numeric | null
          default_plant_distance_m: Numeric | null
          default_density_plants_ha: Numeric | null
          harvest_years: Numeric | null
          support_years: Numeric | null
          source_row: number | null
          source_row_data: Json | null
        }
        Insert: {
          id?: string
          crop_id: string
          variety_id: string
          lifecycle_months?: Numeric | number | null
          lifecycle_years?: Numeric | number | null
          harvest_start_month?: Numeric | number | null
          harvest_start_year?: Numeric | number | null
          default_row_distance_m?: Numeric | number | null
          default_plant_distance_m?: Numeric | number | null
          default_density_plants_ha?: Numeric | number | null
          harvest_years?: Numeric | number | null
          support_years?: Numeric | number | null
          source_row?: number | null
          source_row_data?: Json | null
        }
        Update: {
          id?: string
          crop_id?: string
          variety_id?: string
          lifecycle_months?: Numeric | number | null
          lifecycle_years?: Numeric | number | null
          harvest_start_month?: Numeric | number | null
          harvest_start_year?: Numeric | number | null
          default_row_distance_m?: Numeric | number | null
          default_plant_distance_m?: Numeric | number | null
          default_density_plants_ha?: Numeric | number | null
          harvest_years?: Numeric | number | null
          support_years?: Numeric | number | null
          source_row?: number | null
          source_row_data?: Json | null
        }
        Relationships: []
      }
      municipio_crop_availability: {
        Row: {
          municipio_id: string
          crop_id: string
          variety_id: string
          source_year: number
          source_period: string
          dane_departamento_code: string | null
          dane_municipio_code: string | null
          planted_area_ha: Numeric | null
          harvested_area_ha: Numeric | null
          production_t: Numeric | null
          yield_t_ha: Numeric | null
          scientific_name: string | null
          crop_code: string | null
          physical_state: string | null
          source_sheet: string
          source_row: number
          source_row_data: Json | null
          active: boolean | null
        }
        Insert: {
          municipio_id: string
          crop_id: string
          variety_id: string
          source_year: number
          source_period: string
          dane_departamento_code?: string | null
          dane_municipio_code?: string | null
          planted_area_ha?: Numeric | number | null
          harvested_area_ha?: Numeric | number | null
          production_t?: Numeric | number | null
          yield_t_ha?: Numeric | number | null
          scientific_name?: string | null
          crop_code?: string | null
          physical_state?: string | null
          source_sheet?: string
          source_row: number
          source_row_data?: Json | null
          active?: boolean | null
        }
        Update: {
          municipio_id?: string
          crop_id?: string
          variety_id?: string
          source_year?: number
          source_period?: string
          dane_departamento_code?: string | null
          dane_municipio_code?: string | null
          planted_area_ha?: Numeric | number | null
          harvested_area_ha?: Numeric | number | null
          production_t?: Numeric | number | null
          yield_t_ha?: Numeric | number | null
          scientific_name?: string | null
          crop_code?: string | null
          physical_state?: string | null
          source_sheet?: string
          source_row?: number
          source_row_data?: Json | null
          active?: boolean | null
        }
        Relationships: []
      }
      cost_template_lines: {
        Row: {
          id: string
          crop_id: string
          variety_id: string
          stage_id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          line_order: number
          rubro_code: string | null
          rubro_name: string | null
          subrubro_code: string | null
          subrubro_name: string | null
          activity_code: string | null
          activity_name: string | null
          line_kind: "labor" | "input" | "other_cost"
          input_group_name: string | null
          input_name: string | null
          normalized_input_name: string | null
          presentation: string | null
          quantity: Numeric | null
          fixed_unit_price_cop: Numeric | null
          unit_price_mode: "fixed" | "input_price_lookup" | "jornal_lookup" | "calculated"
          source_sheet: string
          source_row: number
          source_row_data: Json | null
        }
        Insert: {
          id?: string
          crop_id: string
          variety_id: string
          stage_id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          line_order: number
          rubro_code?: string | null
          rubro_name?: string | null
          subrubro_code?: string | null
          subrubro_name?: string | null
          activity_code?: string | null
          activity_name?: string | null
          line_kind: "labor" | "input" | "other_cost"
          input_group_name?: string | null
          input_name?: string | null
          normalized_input_name?: string | null
          presentation?: string | null
          quantity?: Numeric | number | null
          fixed_unit_price_cop?: Numeric | number | null
          unit_price_mode?: "fixed" | "input_price_lookup" | "jornal_lookup" | "calculated"
          source_sheet?: string
          source_row: number
          source_row_data?: Json | null
        }
        Update: {
          id?: string
          crop_id?: string
          variety_id?: string
          stage_id?: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          line_order?: number
          rubro_code?: string | null
          rubro_name?: string | null
          subrubro_code?: string | null
          subrubro_name?: string | null
          activity_code?: string | null
          activity_name?: string | null
          line_kind?: "labor" | "input" | "other_cost"
          input_group_name?: string | null
          input_name?: string | null
          normalized_input_name?: string | null
          presentation?: string | null
          quantity?: Numeric | number | null
          fixed_unit_price_cop?: Numeric | number | null
          unit_price_mode?: "fixed" | "input_price_lookup" | "jornal_lookup" | "calculated"
          source_sheet?: string
          source_row?: number
          source_row_data?: Json | null
        }
        Relationships: []
      }
      input_price_rows: {
        Row: {
          id: string
          departamento_id: string | null
          input_group_name: string | null
          input_name: string
          normalized_input_name: string
          presentation: string | null
          average_price_final_cop: Numeric | null
          price_source: string | null
          expert_price_cop: Numeric | null
          region_name: string | null
          regional_imputed_price_cop: Numeric | null
          calculated_final_price_cop: Numeric | null
          source_sheet: string
          source_row: number
          source_row_data: Json | null
        }
        Insert: {
          id?: string
          departamento_id?: string | null
          input_group_name?: string | null
          input_name: string
          normalized_input_name: string
          presentation?: string | null
          average_price_final_cop?: Numeric | number | null
          price_source?: string | null
          expert_price_cop?: Numeric | number | null
          region_name?: string | null
          regional_imputed_price_cop?: Numeric | number | null
          calculated_final_price_cop?: Numeric | number | null
          source_sheet?: string
          source_row: number
          source_row_data?: Json | null
        }
        Update: {
          id?: string
          departamento_id?: string | null
          input_group_name?: string | null
          input_name?: string
          normalized_input_name?: string
          presentation?: string | null
          average_price_final_cop?: Numeric | number | null
          price_source?: string | null
          expert_price_cop?: Numeric | number | null
          region_name?: string | null
          regional_imputed_price_cop?: Numeric | number | null
          calculated_final_price_cop?: Numeric | number | null
          source_sheet?: string
          source_row?: number
          source_row_data?: Json | null
        }
        Relationships: []
      }
      yield_curve_points: {
        Row: {
          id: string
          crop_id: string
          variety_id: string
          age_years: Numeric
          stage_id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          potential_yield_kg_ha: Numeric | null
          default_density_plants_ha: Numeric | null
          density_factor: Numeric | null
          water_factor: Numeric | null
          source_sheet: string
          source_row: number
          source_row_data: Json | null
        }
        Insert: {
          id?: string
          crop_id: string
          variety_id: string
          age_years: Numeric | number
          stage_id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          potential_yield_kg_ha?: Numeric | number | null
          default_density_plants_ha?: Numeric | number | null
          density_factor?: Numeric | number | null
          water_factor?: Numeric | number | null
          source_sheet?: string
          source_row: number
          source_row_data?: Json | null
        }
        Update: {
          id?: string
          crop_id?: string
          variety_id?: string
          age_years?: Numeric | number
          stage_id?: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          potential_yield_kg_ha?: Numeric | number | null
          default_density_plants_ha?: Numeric | number | null
          density_factor?: Numeric | number | null
          water_factor?: Numeric | number | null
          source_sheet?: string
          source_row?: number
          source_row_data?: Json | null
        }
        Relationships: []
      }
      valuation_cases: {
        Row: {
          id: string
          user_id: string | null
          case_code: string
          valuation_asof_date: string
          departamento_id: string
          municipio_id: string
          vereda: string | null
          latitude: Numeric | null
          longitude: Numeric | null
          climate_type: string | null
          temperature_range: string | null
          altitude_range: string | null
          aptitude_upra_sipra: string | null
          slope_percent: Numeric | null
          agrologic_class: string | null
          altitude_m: Numeric | null
          total_parcel_area_ha: Numeric | null
          discount_rate_method: string
          discount_rate_ea: Numeric
          raw_form: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          case_code: string
          valuation_asof_date: string
          departamento_id: string
          municipio_id: string
          vereda?: string | null
          latitude?: Numeric | number | null
          longitude?: Numeric | number | null
          climate_type?: string | null
          temperature_range?: string | null
          altitude_range?: string | null
          aptitude_upra_sipra?: string | null
          slope_percent?: Numeric | number | null
          agrologic_class?: string | null
          altitude_m?: Numeric | number | null
          total_parcel_area_ha?: Numeric | number | null
          discount_rate_method?: string
          discount_rate_ea?: Numeric | number
          raw_form?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          case_code?: string
          valuation_asof_date?: string
          departamento_id?: string
          municipio_id?: string
          vereda?: string | null
          latitude?: Numeric | number | null
          longitude?: Numeric | number | null
          climate_type?: string | null
          temperature_range?: string | null
          altitude_range?: string | null
          aptitude_upra_sipra?: string | null
          slope_percent?: Numeric | number | null
          agrologic_class?: string | null
          altitude_m?: Numeric | number | null
          total_parcel_area_ha?: Numeric | number | null
          discount_rate_method?: string
          discount_rate_ea?: Numeric | number
          raw_form?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      valuation_form_drafts: {
        Row: {
          id: string
          user_id: string
          draft_type: string
          current_step: "parcel-form" | "block-form" | "calculation"
          parcel_data: Json | null
          block_data: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          draft_type?: string
          current_step?: "parcel-form" | "block-form" | "calculation"
          parcel_data?: Json | null
          block_data?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          draft_type?: string
          current_step?: "parcel-form" | "block-form" | "calculation"
          parcel_data?: Json | null
          block_data?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crop_blocks: {
        Row: {
          id: string
          valuation_case_id: string
          block_label: string
          crop_id: string
          variety_id: string
          crop_type: string | null
          production_system: string | null
          age_years: Numeric
          derived_stage_id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          derived_stage_reason: string | null
          fitosanitary_condition: string | null
          fitosanitary_factor: Numeric | null
          plant_distance_m: Numeric | null
          row_distance_m: Numeric | null
          planting_density_plants_ha: Numeric | null
          crop_area_ha: Numeric | null
          fresh_yield_kg_ha: Numeric | null
          water_availability: string | null
          rainfall_regime: string | null
          annual_precipitation_mm: Numeric | null
          planting_frame: string | null
          land_rent_cop_ha_year: Numeric | null
          jornal_cost_cop: Numeric | null
          soil_value_cop_ha: Numeric | null
          commercial_price_cop_kg: Numeric | null
          notes: string | null
          raw_form: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          valuation_case_id: string
          block_label: string
          crop_id: string
          variety_id: string
          crop_type?: string | null
          production_system?: string | null
          age_years: Numeric | number
          derived_stage_id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          derived_stage_reason?: string | null
          fitosanitary_condition?: string | null
          fitosanitary_factor?: Numeric | number | null
          plant_distance_m?: Numeric | number | null
          row_distance_m?: Numeric | number | null
          planting_density_plants_ha?: Numeric | number | null
          crop_area_ha?: Numeric | number | null
          fresh_yield_kg_ha?: Numeric | number | null
          water_availability?: string | null
          rainfall_regime?: string | null
          annual_precipitation_mm?: Numeric | number | null
          planting_frame?: string | null
          land_rent_cop_ha_year?: Numeric | number | null
          jornal_cost_cop?: Numeric | number | null
          soil_value_cop_ha?: Numeric | number | null
          commercial_price_cop_kg?: Numeric | number | null
          notes?: string | null
          raw_form?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          valuation_case_id?: string
          block_label?: string
          crop_id?: string
          variety_id?: string
          crop_type?: string | null
          production_system?: string | null
          age_years?: Numeric | number
          derived_stage_id?: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          derived_stage_reason?: string | null
          fitosanitary_condition?: string | null
          fitosanitary_factor?: Numeric | number | null
          plant_distance_m?: Numeric | number | null
          row_distance_m?: Numeric | number | null
          planting_density_plants_ha?: Numeric | number | null
          crop_area_ha?: Numeric | number | null
          fresh_yield_kg_ha?: Numeric | number | null
          water_availability?: string | null
          rainfall_regime?: string | null
          annual_precipitation_mm?: Numeric | number | null
          planting_frame?: string | null
          land_rent_cop_ha_year?: Numeric | number | null
          jornal_cost_cop?: Numeric | number | null
          soil_value_cop_ha?: Numeric | number | null
          commercial_price_cop_kg?: Numeric | number | null
          notes?: string | null
          raw_form?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      resolved_insumo_lines: {
        Row: {
          id: string
          crop_block_id: string
          template_line_id: string
          input_price_row_id: string | null
          stage_id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          line_order: number
          rubro_code: string | null
          rubro_name: string | null
          subrubro_code: string | null
          subrubro_name: string | null
          activity_code: string | null
          activity_name: string | null
          input_group_name: string | null
          input_name: string
          presentation: string | null
          quantity: Numeric | null
          unit_price_cop: Numeric | null
          unit_price_source: string | null
          total_cop: Numeric | null
          is_overridden: boolean | null
          override_reason: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          crop_block_id: string
          template_line_id: string
          input_price_row_id?: string | null
          stage_id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          line_order: number
          rubro_code?: string | null
          rubro_name?: string | null
          subrubro_code?: string | null
          subrubro_name?: string | null
          activity_code?: string | null
          activity_name?: string | null
          input_group_name?: string | null
          input_name: string
          presentation?: string | null
          quantity?: Numeric | number | null
          unit_price_cop?: Numeric | number | null
          unit_price_source?: string | null
          total_cop?: Numeric | number | null
          is_overridden?: boolean | null
          override_reason?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          crop_block_id?: string
          template_line_id?: string
          input_price_row_id?: string | null
          stage_id?: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          line_order?: number
          rubro_code?: string | null
          rubro_name?: string | null
          subrubro_code?: string | null
          subrubro_name?: string | null
          activity_code?: string | null
          activity_name?: string | null
          input_group_name?: string | null
          input_name?: string
          presentation?: string | null
          quantity?: Numeric | number | null
          unit_price_cop?: Numeric | number | null
          unit_price_source?: string | null
          total_cop?: Numeric | number | null
          is_overridden?: boolean | null
          override_reason?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      crop_appraisal_results: {
        Row: {
          id: string
          crop_block_id: string
          appraisal_rule: "vegetative" | "pre_equilibrium" | "post_equilibrium" | "salvamento"
          stage_id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          discount_rate_method: string
          discount_rate_ea: Numeric
          started_producing: boolean
          break_even_reached: boolean
          break_even_age_years: Numeric | null
          current_age_years: Numeric
          crop_area_ha: Numeric
          density_plants_ha: Numeric | null
          fitosanitary_factor: Numeric | null
          commercial_price_cop_kg: Numeric | null
          current_year_yield_kg_ha: Numeric | null
          current_year_revenue_cop_ha: Numeric | null
          current_year_cost_cop_ha: Numeric | null
          current_year_utility_cop_ha: Numeric | null
          vegetative_investment_cop_ha: Numeric | null
          pending_recovery_cop_ha: Numeric | null
          remaining_npv_cop_ha: Numeric | null
          appraised_value_cop_ha: Numeric
          appraised_value_cop: Numeric
          appraised_value_cop_per_plant: Numeric | null
          raw_result: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          crop_block_id: string
          appraisal_rule: "vegetative" | "pre_equilibrium" | "post_equilibrium" | "salvamento"
          stage_id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          discount_rate_method: string
          discount_rate_ea: Numeric | number
          started_producing: boolean
          break_even_reached: boolean
          break_even_age_years?: Numeric | number | null
          current_age_years: Numeric | number
          crop_area_ha: Numeric | number
          density_plants_ha?: Numeric | number | null
          fitosanitary_factor?: Numeric | number | null
          commercial_price_cop_kg?: Numeric | number | null
          current_year_yield_kg_ha?: Numeric | number | null
          current_year_revenue_cop_ha?: Numeric | number | null
          current_year_cost_cop_ha?: Numeric | number | null
          current_year_utility_cop_ha?: Numeric | number | null
          vegetative_investment_cop_ha?: Numeric | number | null
          pending_recovery_cop_ha?: Numeric | number | null
          remaining_npv_cop_ha?: Numeric | number | null
          appraised_value_cop_ha: Numeric | number
          appraised_value_cop: Numeric | number
          appraised_value_cop_per_plant?: Numeric | number | null
          raw_result?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          crop_block_id?: string
          appraisal_rule?: "vegetative" | "pre_equilibrium" | "post_equilibrium" | "salvamento"
          stage_id?: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          discount_rate_method?: string
          discount_rate_ea?: Numeric | number
          started_producing?: boolean
          break_even_reached?: boolean
          break_even_age_years?: Numeric | number | null
          current_age_years?: Numeric | number
          crop_area_ha?: Numeric | number
          density_plants_ha?: Numeric | number | null
          fitosanitary_factor?: Numeric | number | null
          commercial_price_cop_kg?: Numeric | number | null
          current_year_yield_kg_ha?: Numeric | number | null
          current_year_revenue_cop_ha?: Numeric | number | null
          current_year_cost_cop_ha?: Numeric | number | null
          current_year_utility_cop_ha?: Numeric | number | null
          vegetative_investment_cop_ha?: Numeric | number | null
          pending_recovery_cop_ha?: Numeric | number | null
          remaining_npv_cop_ha?: Numeric | number | null
          appraised_value_cop_ha?: Numeric | number
          appraised_value_cop?: Numeric | number
          appraised_value_cop_per_plant?: Numeric | number | null
          raw_result?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
      crop_appraisal_annual_flows: {
        Row: {
          id: string
          appraisal_result_id: string
          crop_block_id: string
          line_order: number
          age_years: Numeric
          stage_id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          potential_yield_kg_ha: Numeric | null
          adjusted_yield_kg_ha: Numeric | null
          revenue_cop_ha: Numeric | null
          cost_cop_ha: Numeric | null
          net_flow_cop_ha: Numeric | null
          cumulative_net_flow_cop_ha: Numeric | null
          investment_future_value_cop_ha: Numeric | null
          pending_recovery_cop_ha: Numeric | null
          discount_factor: Numeric | null
          present_value_cop_ha: Numeric | null
          is_current_year: boolean
          is_remaining_year: boolean
          created_at: string | null
        }
        Insert: {
          id?: string
          appraisal_result_id: string
          crop_block_id: string
          line_order: number
          age_years: Numeric | number
          stage_id: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          potential_yield_kg_ha?: Numeric | number | null
          adjusted_yield_kg_ha?: Numeric | number | null
          revenue_cop_ha?: Numeric | number | null
          cost_cop_ha?: Numeric | number | null
          net_flow_cop_ha?: Numeric | number | null
          cumulative_net_flow_cop_ha?: Numeric | number | null
          investment_future_value_cop_ha?: Numeric | number | null
          pending_recovery_cop_ha?: Numeric | number | null
          discount_factor?: Numeric | number | null
          present_value_cop_ha?: Numeric | number | null
          is_current_year?: boolean
          is_remaining_year?: boolean
          created_at?: string | null
        }
        Update: {
          id?: string
          appraisal_result_id?: string
          crop_block_id?: string
          line_order?: number
          age_years?: Numeric | number
          stage_id?: "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"
          potential_yield_kg_ha?: Numeric | number | null
          adjusted_yield_kg_ha?: Numeric | number | null
          revenue_cop_ha?: Numeric | number | null
          cost_cop_ha?: Numeric | number | null
          net_flow_cop_ha?: Numeric | number | null
          cumulative_net_flow_cop_ha?: Numeric | number | null
          investment_future_value_cop_ha?: Numeric | number | null
          pending_recovery_cop_ha?: Numeric | number | null
          discount_factor?: Numeric | number | null
          present_value_cop_ha?: Numeric | number | null
          is_current_year?: boolean
          is_remaining_year?: boolean
          created_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

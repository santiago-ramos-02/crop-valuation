-- Clean-start schema for the Excel-based crop appraisal workflow.
-- Run this before the generated seed SQL files in scripts/generated/.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop old valuation schema and any previous insumos refactor objects.
DROP TABLE IF EXISTS public.resolved_insumo_lines CASCADE;
DROP TABLE IF EXISTS public.crop_appraisal_annual_flows CASCADE;
DROP TABLE IF EXISTS public.crop_appraisal_results CASCADE;
DROP TABLE IF EXISTS public.crop_blocks CASCADE;
DROP TABLE IF EXISTS public.valuation_form_drafts CASCADE;
DROP TABLE IF EXISTS public.valuation_cases CASCADE;
DROP TABLE IF EXISTS public.input_price_rows CASCADE;
DROP TABLE IF EXISTS public.yield_curve_points CASCADE;
DROP TABLE IF EXISTS public.cost_template_lines CASCADE;
DROP TABLE IF EXISTS public.crop_variety_agronomic_profiles CASCADE;
DROP TABLE IF EXISTS public.lookup_options CASCADE;
DROP TABLE IF EXISTS public.production_stages CASCADE;
DROP TABLE IF EXISTS public.municipios CASCADE;
DROP TABLE IF EXISTS public.departamentos CASCADE;
DROP TABLE IF EXISTS public.varieties CASCADE;
DROP TABLE IF EXISTS public.crops CASCADE;

DROP TABLE IF EXISTS public.valuation_results CASCADE;
DROP TABLE IF EXISTS public.blocks CASCADE;
DROP TABLE IF EXISTS public.parcels CASCADE;
DROP TABLE IF EXISTS public.cost_templates CASCADE;
DROP TABLE IF EXISTS public.cost_curves CASCADE;
DROP TABLE IF EXISTS public.age_yield_curves CASCADE;
DROP TABLE IF EXISTS public.regions CASCADE;

DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.validate_block_areas() CASCADE;
DROP FUNCTION IF EXISTS public.calculate_age_years(DATE, DATE) CASCADE;

-- Reference tables.
CREATE TABLE public.departamentos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE public.municipios (
  id TEXT PRIMARY KEY,
  departamento_id TEXT NOT NULL REFERENCES public.departamentos(id),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  type TEXT,
  longitude DECIMAL(12,8),
  latitude DECIMAL(12,8),
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE public.crops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE public.varieties (
  id TEXT PRIMARY KEY,
  crop_id TEXT NOT NULL REFERENCES public.crops(id),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  UNIQUE (crop_id, normalized_name)
);

CREATE TABLE public.production_stages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  line_order INTEGER NOT NULL
);

INSERT INTO public.production_stages (id, name, line_order) VALUES
  ('establecimiento', 'Establecimiento', 1),
  ('improductivo', 'Improductivo', 2),
  ('mantenimiento', 'Mantenimiento', 3),
  ('salvamento', 'Salvamento', 4);

CREATE TABLE public.lookup_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_key TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  line_order INTEGER,
  active BOOLEAN DEFAULT TRUE,
  UNIQUE (group_key, value)
);

CREATE TABLE public.crop_variety_agronomic_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_id TEXT NOT NULL REFERENCES public.crops(id),
  variety_id TEXT NOT NULL REFERENCES public.varieties(id),
  crop_variety_name TEXT NOT NULL,

  lifecycle_months DECIMAL(10,2),
  lifecycle_years DECIMAL(10,2),
  harvest_start_month DECIMAL(10,2),
  harvest_start_year DECIMAL(10,2),
  default_row_distance_m DECIMAL(10,4),
  default_plant_distance_m DECIMAL(10,4),
  default_density_plants_ha DECIMAL(14,2),
  harvest_years DECIMAL(10,2),
  support_years DECIMAL(10,2),

  source_row INTEGER,
  raw_excel_row JSONB DEFAULT '{}'::jsonb,

  UNIQUE (crop_id, variety_id)
);

CREATE TABLE public.cost_template_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  crop_id TEXT NOT NULL REFERENCES public.crops(id),
  variety_id TEXT NOT NULL REFERENCES public.varieties(id),
  stage_id TEXT NOT NULL REFERENCES public.production_stages(id),
  line_order INTEGER NOT NULL,

  rubro_code TEXT,
  rubro_name TEXT,
  subrubro_code TEXT,
  subrubro_name TEXT,
  activity_code TEXT,
  activity_name TEXT,

  line_kind TEXT NOT NULL CHECK (line_kind IN ('labor', 'input', 'other_cost')),
  input_group_name TEXT,
  input_name TEXT,
  normalized_input_name TEXT,
  presentation TEXT,
  quantity DECIMAL(18,6),

  fixed_unit_price_cop DECIMAL(18,6),
  unit_price_mode TEXT NOT NULL DEFAULT 'input_price_lookup'
    CHECK (unit_price_mode IN ('fixed', 'input_price_lookup', 'jornal_lookup', 'calculated')),

  source_sheet TEXT NOT NULL DEFAULT 'Base_datActividades_priorFIN',
  source_row INTEGER NOT NULL,
  raw_excel_row JSONB DEFAULT '{}'::jsonb,

  UNIQUE (source_sheet, source_row)
);

CREATE TABLE public.yield_curve_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  crop_id TEXT NOT NULL REFERENCES public.crops(id),
  variety_id TEXT NOT NULL REFERENCES public.varieties(id),
  age_years DECIMAL(8,2) NOT NULL CHECK (age_years > 0),
  stage_id TEXT NOT NULL REFERENCES public.production_stages(id),

  potential_yield_kg_ha DECIMAL(14,2),
  default_density_plants_ha DECIMAL(14,2),
  density_factor DECIMAL(14,6),
  water_factor DECIMAL(14,6),

  source_sheet TEXT NOT NULL DEFAULT 'Rendimientos estandar_',
  source_row INTEGER NOT NULL,
  raw_excel_row JSONB DEFAULT '{}'::jsonb,

  UNIQUE (source_sheet, source_row),
  UNIQUE (crop_id, variety_id, age_years)
);

CREATE TABLE public.input_price_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  departamento_id TEXT REFERENCES public.departamentos(id),
  departamento_name_excel TEXT NOT NULL,
  input_group_name TEXT,
  input_name TEXT NOT NULL,
  normalized_input_name TEXT NOT NULL,
  presentation TEXT,

  average_price_final_cop DECIMAL(18,6),
  price_source TEXT,
  expert_price_cop DECIMAL(18,6),
  region_name TEXT,
  regional_imputed_price_cop DECIMAL(18,6),
  calculated_final_price_cop DECIMAL(18,6),

  source_sheet TEXT NOT NULL DEFAULT 'Tabla_Costos_Insumos',
  source_row INTEGER NOT NULL,
  raw_excel_row JSONB DEFAULT '{}'::jsonb,

  UNIQUE (source_sheet, source_row)
);

-- User-owned tables.
CREATE TABLE public.valuation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  case_code TEXT NOT NULL,
  valuation_asof_date DATE NOT NULL,

  departamento_id TEXT NOT NULL REFERENCES public.departamentos(id),
  municipio_id TEXT NOT NULL REFERENCES public.municipios(id),
  vereda TEXT,

  latitude DECIMAL(12,8),
  longitude DECIMAL(12,8),
  climate_type TEXT,
  temperature_range TEXT,
  altitude_range TEXT,
  aptitude_upra_sipra TEXT,
  slope_percent DECIMAL(8,4),
  agrologic_class TEXT,
  altitude_m DECIMAL(10,2),

  total_parcel_area_ha DECIMAL(12,4),
  discount_rate_method TEXT NOT NULL DEFAULT 'Finagro',
  discount_rate_ea DECIMAL(10,8) NOT NULL DEFAULT 0.08462342,
  raw_form JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.valuation_form_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL DEFAULT 'new_valuation',
  current_step TEXT NOT NULL DEFAULT 'parcel-form'
    CHECK (current_step IN ('parcel-form', 'block-form', 'calculation')),
  parcel_data JSONB,
  block_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, draft_type)
);

CREATE TABLE public.crop_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_case_id UUID NOT NULL REFERENCES public.valuation_cases(id) ON DELETE CASCADE,

  block_label TEXT NOT NULL,
  crop_id TEXT NOT NULL REFERENCES public.crops(id),
  variety_id TEXT NOT NULL REFERENCES public.varieties(id),

  crop_type TEXT,
  production_system TEXT,
  age_years DECIMAL(8,2) NOT NULL CHECK (age_years >= 0),
  derived_stage_id TEXT NOT NULL REFERENCES public.production_stages(id),
  derived_stage_reason TEXT,

  fitosanitary_condition TEXT,
  fitosanitary_factor DECIMAL(8,4),
  plant_distance_m DECIMAL(10,4),
  row_distance_m DECIMAL(10,4),
  planting_density_plants_ha DECIMAL(12,2),
  crop_area_ha DECIMAL(12,4),
  fresh_yield_kg_ha DECIMAL(14,2),

  water_availability TEXT,
  rainfall_regime TEXT,
  annual_precipitation_mm DECIMAL(12,2),
  planting_frame TEXT,
  land_rent_cop_ha_year DECIMAL(14,2),
  jornal_cost_cop DECIMAL(14,2),
  soil_value_cop_ha DECIMAL(16,2),
  commercial_price_cop_kg DECIMAL(14,2),

  notes TEXT,
  raw_form JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT crop_blocks_rent_or_soil_value_chk CHECK (
    COALESCE(land_rent_cop_ha_year, 0) <= 0
    OR COALESCE(soil_value_cop_ha, 0) <= 0
  ),
  UNIQUE (valuation_case_id, block_label)
);

CREATE TABLE public.crop_appraisal_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_block_id UUID NOT NULL UNIQUE REFERENCES public.crop_blocks(id) ON DELETE CASCADE,

  appraisal_rule TEXT NOT NULL
    CHECK (appraisal_rule IN ('vegetative', 'pre_equilibrium', 'post_equilibrium')),
  stage_id TEXT NOT NULL REFERENCES public.production_stages(id),
  discount_rate_method TEXT NOT NULL,
  discount_rate_ea DECIMAL(10,8) NOT NULL,

  started_producing BOOLEAN NOT NULL,
  break_even_reached BOOLEAN NOT NULL,
  break_even_age_years DECIMAL(8,2),
  current_age_years DECIMAL(8,2) NOT NULL,
  crop_area_ha DECIMAL(12,4) NOT NULL,
  density_plants_ha DECIMAL(14,2),
  fitosanitary_factor DECIMAL(8,4),
  commercial_price_cop_kg DECIMAL(14,2),

  current_year_yield_kg_ha DECIMAL(14,2),
  current_year_revenue_cop_ha DECIMAL(18,6),
  current_year_cost_cop_ha DECIMAL(18,6),
  current_year_utility_cop_ha DECIMAL(18,6),
  vegetative_investment_cop_ha DECIMAL(18,6),
  pending_recovery_cop_ha DECIMAL(18,6),
  remaining_npv_cop_ha DECIMAL(18,6),

  appraised_value_cop_ha DECIMAL(18,6) NOT NULL,
  appraised_value_cop DECIMAL(18,6) NOT NULL,
  appraised_value_cop_per_plant DECIMAL(18,6),
  raw_result JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.crop_appraisal_annual_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appraisal_result_id UUID NOT NULL REFERENCES public.crop_appraisal_results(id) ON DELETE CASCADE,
  crop_block_id UUID NOT NULL REFERENCES public.crop_blocks(id) ON DELETE CASCADE,

  line_order INTEGER NOT NULL,
  age_years DECIMAL(8,2) NOT NULL,
  stage_id TEXT NOT NULL REFERENCES public.production_stages(id),
  potential_yield_kg_ha DECIMAL(14,2),
  adjusted_yield_kg_ha DECIMAL(14,2),
  revenue_cop_ha DECIMAL(18,6),
  cost_cop_ha DECIMAL(18,6),
  net_flow_cop_ha DECIMAL(18,6),
  cumulative_net_flow_cop_ha DECIMAL(18,6),
  investment_future_value_cop_ha DECIMAL(18,6),
  pending_recovery_cop_ha DECIMAL(18,6),
  discount_factor DECIMAL(18,8),
  present_value_cop_ha DECIMAL(18,6),
  is_current_year BOOLEAN NOT NULL DEFAULT FALSE,
  is_remaining_year BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (appraisal_result_id, line_order)
);

CREATE TABLE public.resolved_insumo_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop_block_id UUID NOT NULL REFERENCES public.crop_blocks(id) ON DELETE CASCADE,
  template_line_id UUID NOT NULL REFERENCES public.cost_template_lines(id),
  input_price_row_id UUID REFERENCES public.input_price_rows(id),

  stage_id TEXT NOT NULL REFERENCES public.production_stages(id),
  line_order INTEGER NOT NULL,

  rubro_code TEXT,
  rubro_name TEXT,
  subrubro_code TEXT,
  subrubro_name TEXT,
  activity_code TEXT,
  activity_name TEXT,
  input_group_name TEXT,
  input_name TEXT NOT NULL,
  presentation TEXT,

  quantity DECIMAL(18,6),
  unit_price_cop DECIMAL(18,6),
  unit_price_source TEXT,
  total_cop DECIMAL(18,6),

  is_overridden BOOLEAN DEFAULT FALSE,
  override_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lookup indexes for the resolver and form selectors.
CREATE INDEX idx_municipios_departamento
  ON public.municipios (departamento_id, normalized_name);

CREATE INDEX idx_varieties_crop
  ON public.varieties (crop_id, normalized_name);

CREATE INDEX idx_crop_variety_profiles_lookup
  ON public.crop_variety_agronomic_profiles (crop_id, variety_id);

CREATE INDEX idx_cost_template_lines_resolver
  ON public.cost_template_lines (crop_id, variety_id, stage_id, line_order);

CREATE INDEX idx_cost_template_lines_inputs
  ON public.cost_template_lines (line_kind, normalized_input_name);

CREATE INDEX idx_yield_curve_points_lookup
  ON public.yield_curve_points (crop_id, variety_id, age_years);

CREATE INDEX idx_input_price_rows_lookup
  ON public.input_price_rows (departamento_id, normalized_input_name, source_row);

CREATE INDEX idx_valuation_cases_user
  ON public.valuation_cases (user_id, created_at DESC);

CREATE INDEX idx_valuation_form_drafts_user
  ON public.valuation_form_drafts (user_id, updated_at DESC);

CREATE INDEX idx_crop_blocks_case
  ON public.crop_blocks (valuation_case_id);

CREATE INDEX idx_crop_appraisal_results_block
  ON public.crop_appraisal_results (crop_block_id);

CREATE INDEX idx_crop_appraisal_annual_flows_result
  ON public.crop_appraisal_annual_flows (appraisal_result_id, line_order);

CREATE INDEX idx_resolved_insumo_lines_block
  ON public.resolved_insumo_lines (crop_block_id, line_order);

-- updated_at maintenance.
CREATE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER valuation_cases_set_updated_at
  BEFORE UPDATE ON public.valuation_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER valuation_form_drafts_set_updated_at
  BEFORE UPDATE ON public.valuation_form_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER crop_blocks_set_updated_at
  BEFORE UPDATE ON public.crop_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Row-level security.
ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.varieties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_variety_agronomic_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_template_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yield_curve_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.input_price_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.valuation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valuation_form_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_appraisal_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_appraisal_annual_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resolved_insumo_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departamentos_select_all" ON public.departamentos
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "municipios_select_all" ON public.municipios
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "crops_select_all" ON public.crops
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "varieties_select_all" ON public.varieties
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "production_stages_select_all" ON public.production_stages
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "lookup_options_select_all" ON public.lookup_options
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "crop_variety_agronomic_profiles_select_all" ON public.crop_variety_agronomic_profiles
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "cost_template_lines_select_all" ON public.cost_template_lines
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "yield_curve_points_select_all" ON public.yield_curve_points
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "input_price_rows_select_all" ON public.input_price_rows
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "valuation_cases_select_own" ON public.valuation_cases
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "valuation_cases_insert_own" ON public.valuation_cases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "valuation_cases_update_own" ON public.valuation_cases
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "valuation_cases_delete_own" ON public.valuation_cases
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "valuation_form_drafts_select_own" ON public.valuation_form_drafts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "valuation_form_drafts_insert_own" ON public.valuation_form_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "valuation_form_drafts_update_own" ON public.valuation_form_drafts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "valuation_form_drafts_delete_own" ON public.valuation_form_drafts
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "crop_blocks_select_own" ON public.crop_blocks
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.valuation_cases vc
      WHERE vc.id = crop_blocks.valuation_case_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "crop_blocks_insert_own" ON public.crop_blocks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.valuation_cases vc
      WHERE vc.id = crop_blocks.valuation_case_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "crop_blocks_update_own" ON public.crop_blocks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.valuation_cases vc
      WHERE vc.id = crop_blocks.valuation_case_id
        AND vc.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.valuation_cases vc
      WHERE vc.id = crop_blocks.valuation_case_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "crop_blocks_delete_own" ON public.crop_blocks
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.valuation_cases vc
      WHERE vc.id = crop_blocks.valuation_case_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "crop_appraisal_results_select_own" ON public.crop_appraisal_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = crop_appraisal_results.crop_block_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "crop_appraisal_results_insert_own" ON public.crop_appraisal_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = crop_appraisal_results.crop_block_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "crop_appraisal_results_update_own" ON public.crop_appraisal_results
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = crop_appraisal_results.crop_block_id
        AND vc.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = crop_appraisal_results.crop_block_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "crop_appraisal_results_delete_own" ON public.crop_appraisal_results
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = crop_appraisal_results.crop_block_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "crop_appraisal_annual_flows_select_own" ON public.crop_appraisal_annual_flows
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = crop_appraisal_annual_flows.crop_block_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "crop_appraisal_annual_flows_insert_own" ON public.crop_appraisal_annual_flows
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = crop_appraisal_annual_flows.crop_block_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "crop_appraisal_annual_flows_update_own" ON public.crop_appraisal_annual_flows
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = crop_appraisal_annual_flows.crop_block_id
        AND vc.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = crop_appraisal_annual_flows.crop_block_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "crop_appraisal_annual_flows_delete_own" ON public.crop_appraisal_annual_flows
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = crop_appraisal_annual_flows.crop_block_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "resolved_insumo_lines_select_own" ON public.resolved_insumo_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = resolved_insumo_lines.crop_block_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "resolved_insumo_lines_insert_own" ON public.resolved_insumo_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = resolved_insumo_lines.crop_block_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "resolved_insumo_lines_update_own" ON public.resolved_insumo_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = resolved_insumo_lines.crop_block_id
        AND vc.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = resolved_insumo_lines.crop_block_id
        AND vc.user_id = auth.uid()
    )
  );

CREATE POLICY "resolved_insumo_lines_delete_own" ON public.resolved_insumo_lines
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.crop_blocks cb
      JOIN public.valuation_cases vc ON vc.id = cb.valuation_case_id
      WHERE cb.id = resolved_insumo_lines.crop_block_id
        AND vc.user_id = auth.uid()
    )
  );

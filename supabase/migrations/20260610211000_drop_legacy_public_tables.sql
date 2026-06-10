-- Remove legacy public tables from the pre-insumos schema.
-- The current application schema is defined by 20260531000000_reset_insumos_schema.sql.

DROP TABLE IF EXISTS public.valuation_results CASCADE;
DROP TABLE IF EXISTS public.blocks CASCADE;
DROP TABLE IF EXISTS public.parcels CASCADE;
DROP TABLE IF EXISTS public.cost_curves CASCADE;
DROP TABLE IF EXISTS public.cost_templates CASCADE;
DROP TABLE IF EXISTS public.age_yield_curves CASCADE;
DROP TABLE IF EXISTS public.regions CASCADE;


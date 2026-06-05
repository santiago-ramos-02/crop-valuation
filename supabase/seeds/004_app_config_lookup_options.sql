-- Seed data maintained directly as SQL.
-- Loaded by Supabase using supabase/config.toml [db.seed]. Edit this file directly when catalog values change.

INSERT INTO public.lookup_options (group_key, value, label, metadata, line_order, active) VALUES
  ('discount_rate_method', 'DTF + Prima de Riesgo', 'DTF + Prima de Riesgo', '{"default": false, "interpretation": "Conservador.", "rate_ea": "0.13799981004843764", "source_row": 52, "source_sheet": "Entradas_Tasas"}'::jsonb, 1, TRUE),
  ('discount_rate_method', 'CAPM', 'CAPM', '{"default": false, "interpretation": "Técnico. Requiere justificar el beta sectorial.", "rate_ea": "0.12854971982144558", "source_row": 53, "source_sheet": "Entradas_Tasas"}'::jsonb, 2, TRUE),
  ('discount_rate_method', 'Finagro', 'Finagro', '{"default": true, "interpretation": "Referencia mínima del mercado agropecuario con recursos de fomento.", "rate_ea": "0.08462342102763798", "source_row": 54, "source_sheet": "Entradas_Tasas"}'::jsonb, 3, TRUE),
  ('discount_rate_method', 'WACC', 'WACC', '{"default": false, "interpretation": "Aplicable cuando el proyecto tiene deuda. Si no hay deuda = CAPM.", "rate_ea": "0.1164165637762371", "source_row": 55, "source_sheet": "Entradas_Tasas"}'::jsonb, 4, TRUE)
ON CONFLICT (group_key, value) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata, line_order = EXCLUDED.line_order, active = EXCLUDED.active;


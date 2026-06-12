# Supabase Seeds

These files are the source of truth for reference data and app configuration.

Supabase loads them in the order defined by `supabase/config.toml` during `supabase db reset`.

- `004_app_config_lookup_options.sql`: app configuration values that may change, including discount-rate methods.
- `006_municipio_crop_availability.sql`: supported cultivo/variedad availability by municipio. Its header lists the Excel source-category aliases used to map EVA labels such as `Plátano consumo interno` and `Limón demás variedades` to the supported calculation profiles. Generic `Palma de aceite` rows map only to `Elaeis guineensis`; OxG is not inferred because the EVA source does not provide municipio detail for that hybrid.
- `007_cost_template_lines.sql` and `008_input_price_rows.sql`: valuation cost and input-price catalogs.
- `009_department_jornal_costs.sql`: department jornal defaults from `Jornalesdeppto`, used when `Costo del Jornal` is empty.

## Excel 20260612 notes

- `007_cost_template_lines.sql` was updated from `20260612Aplicativo.xlsx`, sheet `Base_datActividades_priorFIN`.
- `008_input_price_rows.sql` was compared against `20260612Aplicativo.xlsx`, sheet `Tabla_Costos_Insumos`; no semantic price-row changes were found.
- `009_department_jornal_costs.sql` stores `Jornal agricola, sin alimentacion` from `Jornalesdeppto` as the default labor fallback. User-entered `Costo del Jornal` still overrides these values.
- `Tabla_Costos_Insumos` skips `Total general` rows and stores unit prices from `Precio Promedio Final`, matching the workbook cost lookup.
- `Calculos_generales!Q4` now uses `=IFERROR(NPV(Entradas_calculos!$K$4,D2:D31)/(NPV(Entradas_calculos!$K$4,E2:E31)+NPV(Entradas_calculos!$K$4,F2:F31)),"-")`. The app does not expose Relacion C/B yet; use this formula if that metric is added later.

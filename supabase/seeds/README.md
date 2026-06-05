# Supabase Seeds

These files are the source of truth for reference data and app configuration.

Supabase loads them in the order defined by `supabase/config.toml` during `supabase db reset`.

- `004_app_config_lookup_options.sql`: app configuration values that may change, including discount-rate methods.
- `006_municipio_crop_availability.sql`: supported cultivo/variedad availability by municipio. Its header lists the Excel source-category aliases used to map EVA labels such as `Plátano consumo interno` and `Limón demás variedades` to the supported calculation profiles. Generic `Palma de aceite` rows map only to `Elaeis guineensis`; OxG is not inferred because the EVA source does not provide municipio detail for that hybrid.
- `007_cost_template_lines.sql` and `008_input_price_rows.sql`: valuation cost and input-price catalogs.

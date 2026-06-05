# Plataforma de Avaluos Agricolas

Aplicacion web interna para registrar predios agricolas, capturar cultivos/lotes y calcular el avaluo final del cultivo con reglas derivadas de los libros de Excel y del arbol de decision del liquidador.

## Stack

- Next.js 16 App Router, React 19 y TypeScript.
- Tailwind CSS v4 con componentes shadcn/ui.
- Supabase Postgres y Auth.
- Semillas generadas desde `20260603Aplicativo.xlsx`.

## Flujo Principal

1. Capturar encabezado del predio: departamento, municipio, condicion agroecologica y tasa de descuento.
2. Capturar cada cultivo/lote: cultivo, variedad, edad, area, condicion fitosanitaria, jornal, arriendo y precio comercial.
3. Resolver etapa productiva e insumos desde los catalogos importados de Excel.
4. Calcular el avaluo final del cultivo:
   - etapa vegetativa: inversion acumulada mas costo de oportunidad;
   - produccion antes de equilibrio: utilidad del ano mas recuperacion pendiente;
   - equilibrio alcanzado: utilidad del ano.
5. Guardar el caso, los lotes, el resultado de avaluo y los flujos anuales en Supabase.

## Modulos Relevantes

| Ruta | Proposito |
| --- | --- |
| `app/valuation/new/page.tsx` | Flujo guiado para crear una valuacion. |
| `components/parcel-header-form.tsx` | Captura del predio y tasa de descuento. |
| `components/block-entry-form.tsx` | Captura de cultivos/lotes. |
| `components/valuation-calculator.tsx` | Persistencia del caso, insumos resueltos y avaluo final. |
| `lib/insumos/resolve-insumos.ts` | Resolucion de insumos por cultivo, variedad, etapa y departamento. |
| `lib/appraisal/calculate-crop-appraisal.ts` | Calculo del avaluo final y flujos anuales. |
| `scripts/import_excel_seed_data.py` | Generador de SQL seed desde el Excel vigente. |
| `supabase/migrations/20260531000000_reset_insumos_schema.sql` | Reset completo del esquema publico de la app. |
| `supabase/seed.sql` | Seed consolidado generado desde `scripts/generated/*.sql`. |

## Puesta en Marcha

Instalar dependencias:

```bash
pnpm install
```

Ejecutar en local:

```bash
pnpm dev
```

La aplicacion inicia por defecto en `http://localhost:3000`.

## Base de Datos

Este proyecto es nuevo, asi que el esquema se maneja como reset completo.

1. Aplicar `supabase/migrations/20260531000000_reset_insumos_schema.sql`.
2. Aplicar `supabase/seed.sql`.

Para regenerar el seed desde el Excel vigente:

```bash
python scripts/import_excel_seed_data.py
```

El generador actualiza `scripts/generated/*.sql` y `scripts/generated/seed_validation_report.json`. Despues de regenerar, reconstruya `supabase/seed.sql` concatenando los archivos generados en orden.

## Validacion

Ejecutar antes de entregar cambios:

```bash
pnpm lint
pnpm build
```

TypeScript se puede validar con:

```bash
./node_modules/.bin/tsc --noEmit
```

## Documentos Fuente

- `20260603Aplicativo.xlsx`: workbook vigente para semillas y reglas de calculo.
- `arbol de desición.jpg`: arbol de decision del liquidador.
- `instrucciones liquidador de cultivo.txt`: reglas textuales del avaluo.

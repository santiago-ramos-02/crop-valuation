# Plataforma de Avaluos Agricolas

Aplicacion web interna para registrar predios agricolas, capturar cultivos y calcular el avaluo final del cultivo con reglas mantenidas en Supabase.

## Stack

- Next.js 16 App Router, React 19 y TypeScript.
- Tailwind CSS v4 con componentes shadcn/ui.
- Supabase Postgres y Auth.
- Semillas mantenidas como SQL editable en `supabase/seeds/`.

## Flujo Principal

1. Capturar encabezado del predio: departamento, municipio, condicion agroecologica y tasa de descuento.
2. Capturar cada cultivo: cultivo, variedad, edad, area, condicion fitosanitaria, jornal, arriendo y precio comercial.
3. Resolver etapa productiva e insumos desde los catalogos sembrados en Supabase.
4. Calcular el avaluo final del cultivo:
   - etapa vegetativa: inversion acumulada mas costo de oportunidad;
   - produccion antes de equilibrio: utilidad del ano mas recuperacion pendiente;
   - equilibrio alcanzado: utilidad del ano.
5. Guardar el caso, los cultivos, el resultado de avaluo y los flujos anuales en Supabase.

## Modulos Relevantes

| Ruta | Proposito |
| --- | --- |
| `app/valuation/new/page.tsx` | Flujo guiado para crear una valuacion. |
| `components/parcel-header-form.tsx` | Captura del predio y tasa de descuento. |
| `components/block-entry-form.tsx` | Captura de cultivos. |
| `components/valuation-calculator.tsx` | Persistencia del caso, insumos resueltos y avaluo final. |
| `lib/insumos/resolve-insumos.ts` | Resolucion de insumos por cultivo, variedad, etapa y departamento. |
| `lib/appraisal/calculate-crop-appraisal.ts` | Calculo del avaluo final y flujos anuales. |
| `supabase/migrations/20260531000000_reset_insumos_schema.sql` | Reset completo del esquema publico de la app. |
| `supabase/seeds/*.sql` | Semillas de catalogos, configuracion de la app, disponibilidad de cultivos e insumos. |
| `supabase/config.toml` | Configura el orden en que Supabase aplica las semillas durante `db reset`. |

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

## Despliegue con Docker en Otra Maquina

Este proyecto usa dos partes:

- Backend: Supabase local, que crea contenedores Docker para Postgres, Auth, Kong, REST y Studio.
- Frontend: Next.js, empaquetado con `Dockerfile` y `compose.yaml`.

En la maquina destino, instalar Docker y una forma de ejecutar la CLI de Supabase. Con Node disponible, se puede usar `npx`.

Clonar el repositorio y levantar el backend:

```bash
git clone <repo-url>
cd crop-valuation
npx supabase start
npx supabase db reset
npx supabase status
```

Copiar la plantilla de entorno del frontend:

```bash
cp .env.docker.example .env.docker
```

Editar `.env.docker`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://<ip-o-dominio-de-la-maquina>:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-de-supabase-status>
WEB_PORT=3000
```

No usar `127.0.0.1` en `NEXT_PUBLIC_SUPABASE_URL` si el navegador esta en otra maquina. Ese valor se ejecuta en el navegador del usuario, asi que debe apuntar a una IP o dominio alcanzable desde la red.

Si la app se va a abrir desde otra maquina, actualizar tambien las URL de Auth en `supabase/config.toml` antes de iniciar/resetear Supabase:

```toml
site_url = "http://<ip-o-dominio-de-la-maquina>:3000"
additional_redirect_urls = ["http://<ip-o-dominio-de-la-maquina>:3000"]
```

Construir y levantar el frontend:

```bash
docker compose --env-file .env.docker up -d --build
```

Verificar:

```bash
docker ps
curl http://localhost:3000
curl http://localhost:54321/rest/v1/
```

Abrir en la red:

```text
http://<ip-o-dominio-de-la-maquina>:3000
```

Puertos que deben estar permitidos por firewall:

| Puerto | Servicio |
| --- | --- |
| `3000` | Frontend Next.js |
| `54321` | API de Supabase |
| `54323` | Supabase Studio, opcional |

Si cambia la IP o el dominio publico de Supabase, reconstruir el frontend con `docker compose --env-file .env.docker up -d --build`. Next.js inserta las variables `NEXT_PUBLIC_*` en el bundle que corre en el navegador.

## Base de Datos

Este proyecto es nuevo, asi que el esquema se maneja como reset completo.

```bash
supabase db reset
```

El reset aplica las migraciones y luego carga los SQL definidos en `supabase/config.toml`.
La configuracion editable de la app, como tasas de descuento, queda en `supabase/seeds/004_app_config_lookup_options.sql`.

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

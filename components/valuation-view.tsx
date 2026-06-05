"use client"

import { useEffect, useMemo, useReducer } from "react"
import { ArrowLeftIcon, Calendar, EditIcon, MapPin } from "lucide-react"
import { useParams, useRouter } from "next/navigation"

import { Header } from "@/components/header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PRODUCTION_STAGE_LABELS, type ProductionStageId } from "@/lib/insumos/stage"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/types/database"

type ValuationCase = Database["public"]["Tables"]["valuation_cases"]["Row"]
type CropBlock = Database["public"]["Tables"]["crop_blocks"]["Row"]
type ResolvedLine = Database["public"]["Tables"]["resolved_insumo_lines"]["Row"]
type AppraisalResult = Database["public"]["Tables"]["crop_appraisal_results"]["Row"]
type Departamento = Database["public"]["Tables"]["departamentos"]["Row"]
type Municipio = Database["public"]["Tables"]["municipios"]["Row"]
type Crop = Database["public"]["Tables"]["crops"]["Row"]
type Variety = Database["public"]["Tables"]["varieties"]["Row"]

interface ViewState {
  valuationCase: ValuationCase | null
  blocks: CropBlock[]
  linesByBlock: Record<string, ResolvedLine[]>
  appraisalsByBlock: Record<string, AppraisalResult>
  departamento: Departamento | null
  municipio: Municipio | null
  cropsById: Map<string, Crop>
  varietiesById: Map<string, Variety>
  isLoading: boolean
  error: string | null
}

type LoadedPayload = Omit<ViewState, "error" | "isLoading">

const initialState: ViewState = {
  valuationCase: null,
  blocks: [],
  linesByBlock: {},
  appraisalsByBlock: {},
  departamento: null,
  municipio: null,
  cropsById: new Map(),
  varietiesById: new Map(),
  isLoading: true,
  error: null,
}

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  year: "numeric",
  month: "short",
  day: "numeric",
})

const numberFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 })

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat("es-CO", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function viewReducer(state: ViewState, action: { type: "loading" } | { type: "loaded"; payload: LoadedPayload } | { type: "error"; error: string }) {
  if (action.type === "loading") return { ...initialState }
  if (action.type === "error") return { ...state, isLoading: false, error: action.error }
  return { ...action.payload, isLoading: false, error: null }
}

function formatDate(dateString: string) {
  return dateFormatter.format(new Date(dateString))
}

function formatNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return ""
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return ""
  return numberFormatter.format(parsed)
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "No disponible"
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return "No disponible"
  return currencyFormatter.format(parsed)
}

function formatPercent(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return ""
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return ""
  return percentFormatter.format(parsed)
}

function formatDisplayLabel(value: string | null | undefined) {
  if (!value) return ""
  const text = value.replace(/_/g, " ").trim().toLocaleLowerCase("es-CO")
  return text ? text.charAt(0).toLocaleUpperCase("es-CO") + text.slice(1) : ""
}

function formatStageLabel(stageId: string | null | undefined) {
  if (!stageId) return "Sin etapa"
  return PRODUCTION_STAGE_LABELS[stageId as ProductionStageId] || formatDisplayLabel(stageId)
}

function firstCropLabel(blocks: CropBlock[], cropsById: Map<string, Crop>, varietiesById: Map<string, Variety>) {
  const block = blocks[0]
  if (!block) return null
  return `${cropsById.get(block.crop_id)?.name || block.crop_id} ${
    varietiesById.get(block.variety_id)?.name || block.variety_id
  }`
}

async function loadValuationViewData(
  supabase: ReturnType<typeof createClient>,
  caseId: string,
): Promise<LoadedPayload> {
  const { data: caseData, error: caseError } = await supabase
    .from("valuation_cases")
    .select("*")
    .eq("id", caseId)
    .single()
    .returns<ValuationCase>()

  if (caseError) throw caseError

  const { data: blocksData, error: blocksError } = await supabase
    .from("crop_blocks")
    .select("*")
    .eq("valuation_case_id", caseId)
    .order("created_at", { ascending: true })
    .returns<CropBlock[]>()

  if (blocksError) throw blocksError

  const blocks = blocksData || []
  const cropIds = Array.from(new Set(blocks.map((block) => block.crop_id)))
  const varietyIds = Array.from(new Set(blocks.map((block) => block.variety_id)))
  const blockIds = blocks.map((block) => block.id)

  const [departamentoRes, municipioRes, cropsRes, varietiesRes, linesRes, appraisalsRes] = await Promise.all([
    supabase.from("departamentos").select("*").eq("id", caseData.departamento_id).returns<Departamento>().maybeSingle(),
    supabase.from("municipios").select("*").eq("id", caseData.municipio_id).returns<Municipio>().maybeSingle(),
    cropIds.length
      ? supabase.from("crops").select("*").in("id", cropIds).returns<Crop[]>()
      : Promise.resolve({ data: [] as Crop[], error: null }),
    varietyIds.length
      ? supabase.from("varieties").select("*").in("id", varietyIds).returns<Variety[]>()
      : Promise.resolve({ data: [] as Variety[], error: null }),
    blockIds.length
      ? supabase
          .from("resolved_insumo_lines")
          .select("*")
          .in("crop_block_id", blockIds)
          .order("line_order", { ascending: true })
          .returns<ResolvedLine[]>()
      : Promise.resolve({ data: [] as ResolvedLine[], error: null }),
    blockIds.length
      ? supabase.from("crop_appraisal_results").select("*").in("crop_block_id", blockIds).returns<AppraisalResult[]>()
      : Promise.resolve({ data: [] as AppraisalResult[], error: null }),
  ])

  if (cropsRes.error) throw cropsRes.error
  if (varietiesRes.error) throw varietiesRes.error
  if (linesRes.error) throw linesRes.error
  if (appraisalsRes.error) throw appraisalsRes.error

  const linesByBlock: Record<string, ResolvedLine[]> = {}
  for (const line of linesRes.data || []) {
    linesByBlock[line.crop_block_id] = [...(linesByBlock[line.crop_block_id] || []), line]
  }

  const appraisalsByBlock: Record<string, AppraisalResult> = {}
  for (const appraisal of appraisalsRes.data || []) {
    appraisalsByBlock[appraisal.crop_block_id] = appraisal
  }

  return {
    valuationCase: caseData,
    blocks,
    linesByBlock,
    appraisalsByBlock,
    departamento: departamentoRes.data || null,
    municipio: municipioRes.data || null,
    cropsById: new Map((cropsRes.data || []).map((crop) => [crop.id, crop])),
    varietiesById: new Map((varietiesRes.data || []).map((variety) => [variety.id, variety])),
  }
}

function ValuationViewHeader({ caseCode, caseId }: Readonly<{ caseCode: string | undefined; caseId: string }>) {
  const router = useRouter()

  return (
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-balance">Resultados de Valuación</h1>
        <p className="text-muted-foreground text-pretty">Análisis de valuación para el predio: {caseCode || caseId}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.push("/dashboard")} className="flex items-center gap-2">
          <ArrowLeftIcon className="h-4 w-4" />
          Volver al Panel
        </Button>
        <Button onClick={() => router.push(`/valuation/edit/${caseId}`)} className="flex items-center gap-2">
          <EditIcon className="h-4 w-4" />
          Editar Valuación
        </Button>
      </div>
    </div>
  )
}

function ValuationSummaryBand({
  blocks,
  cropsById,
  departamento,
  municipio,
  totalAppraisedValue,
  valuationCase,
  varietiesById,
}: Readonly<{
  blocks: CropBlock[]
  cropsById: Map<string, Crop>
  departamento: Departamento | null
  municipio: Municipio | null
  totalAppraisedValue: number
  valuationCase: ValuationCase
  varietiesById: Map<string, Variety>
}>) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-0">
        <dl className="grid divide-y text-sm md:grid-cols-[1.25fr_1fr_1fr_1fr] md:divide-x md:divide-y-0">
          <div className="flex min-h-16 items-center gap-3 px-4 py-3">
            <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Ubicación</dt>
              <dd className="truncate font-medium">
                {departamento?.name || valuationCase.departamento_id} / {municipio?.name || valuationCase.municipio_id}
                {valuationCase.vereda ? ` - ${valuationCase.vereda}` : ""}
              </dd>
            </div>
          </div>
          <div className="flex min-h-16 items-center px-4 py-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Cultivos/Lotes</dt>
              <dd className="font-medium">{blocks.length}</dd>
              {firstCropLabel(blocks, cropsById, varietiesById) ? (
                <dd className="truncate text-slate-500">{firstCropLabel(blocks, cropsById, varietiesById)}</dd>
              ) : null}
            </div>
          </div>
          <div className="flex min-h-16 items-center gap-3 px-4 py-3">
            <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Fecha</dt>
              <dd className="font-medium">{formatDate(valuationCase.valuation_asof_date)}</dd>
            </div>
          </div>
          <div className="flex min-h-16 items-center px-4 py-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Avalúo final</dt>
              <dd className="font-semibold text-emerald-700">{formatCurrency(totalAppraisedValue)}</dd>
              <dd className="text-slate-500">{formatPercent(valuationCase.discount_rate_ea)} EA</dd>
            </div>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}

function AppraisalMetrics({ appraisal }: Readonly<{ appraisal: AppraisalResult }>) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-md border bg-white px-4 py-3">
          <div className="text-xs text-muted-foreground">Valor del cultivo</div>
          <div className="text-lg font-semibold text-emerald-700">{formatCurrency(appraisal.appraised_value_cop)}</div>
        </div>
        <div className="rounded-md border bg-white px-4 py-3">
          <div className="text-xs text-muted-foreground">Valor por hectárea</div>
          <div className="text-lg font-semibold">{formatCurrency(appraisal.appraised_value_cop_ha)}</div>
        </div>
        <div className="rounded-md border bg-white px-4 py-3">
          <div className="text-xs text-muted-foreground">Valor por planta</div>
          <div className="text-lg font-semibold">{formatCurrency(appraisal.appraised_value_cop_per_plant)}</div>
        </div>
        <div className="rounded-md border bg-white px-4 py-3">
          <div className="text-xs text-muted-foreground">Área valorada</div>
          <div className="text-lg font-semibold">{formatNumber(appraisal.crop_area_ha)} ha</div>
        </div>
      </div>
      <div className="grid gap-4 text-sm md:grid-cols-5">
        <div>
          <span className="font-medium">Rendimiento del año:</span> {formatNumber(appraisal.current_year_yield_kg_ha)}{" "}
          kg/ha
        </div>
        <div>
          <span className="font-medium">Ingreso del año:</span> {formatCurrency(appraisal.current_year_revenue_cop_ha)}
        </div>
        <div>
          <span className="font-medium">Costo del año:</span> {formatCurrency(appraisal.current_year_cost_cop_ha)}
        </div>
        <div>
          <span className="font-medium">Utilidad del año:</span> {formatCurrency(appraisal.current_year_utility_cop_ha)}
        </div>
        <div>
          <span className="font-medium">Pendiente por recuperar:</span>{" "}
          {formatCurrency(appraisal.pending_recovery_cop_ha)}
        </div>
      </div>
    </>
  )
}

function ResolvedLinesTable({ lines }: Readonly<{ lines: ResolvedLine[] }>) {
  const blockTotalCop = lines.reduce((sum, line) => sum + toNumber(line.total_cop), 0)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rubro</TableHead>
          <TableHead>Servicio o insumo</TableHead>
          <TableHead>Actividad</TableHead>
          <TableHead>Presentación</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead className="text-right">Precio unitario (COP)</TableHead>
          <TableHead className="text-right">Total (COP)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell>{line.rubro_name}</TableCell>
            <TableCell className="font-medium">{line.input_name}</TableCell>
            <TableCell>{formatDisplayLabel(line.activity_name)}</TableCell>
            <TableCell>{line.presentation}</TableCell>
            <TableCell className="text-right">{formatNumber(line.quantity)}</TableCell>
            <TableCell className="text-right">{formatCurrency(line.unit_price_cop)}</TableCell>
            <TableCell className="text-right font-medium">{formatCurrency(line.total_cop)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={6}>Total</TableCell>
          <TableCell className="text-right">{formatCurrency(blockTotalCop)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

function CropBlockResultCard({
  appraisal,
  block,
  crop,
  lines,
  variety,
}: Readonly<{
  appraisal: AppraisalResult | undefined
  block: CropBlock
  crop: Crop | undefined
  lines: ResolvedLine[]
  variety: Variety | undefined
}>) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{block.block_label}</CardTitle>
            <CardDescription>
              {crop?.name || block.crop_id} {variety?.name || block.variety_id}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Etapa: {formatStageLabel(block.derived_stage_id)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {appraisal ? <AppraisalMetrics appraisal={appraisal} /> : null}
        <ResolvedLinesTable lines={lines} />
      </CardContent>
    </Card>
  )
}

function EmptyBlocksCard() {
  return (
    <Card>
      <CardContent className="py-8 text-sm text-muted-foreground">No hay cultivos/lotes para mostrar.</CardContent>
    </Card>
  )
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="py-8 text-sm text-muted-foreground">Cargando valuación...</CardContent>
    </Card>
  )
}

function NotFoundCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Valuación No Encontrada</CardTitle>
        <CardDescription>La valuación solicitada no existe o ha sido eliminada.</CardDescription>
      </CardHeader>
    </Card>
  )
}

function ErrorMessage({ error }: Readonly<{ error: string }>) {
  return <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
}

export function ValuationViewClient() {
  const params = useParams<{ id: string }>()
  const supabase = useMemo(() => createClient(), [])
  const [state, dispatch] = useReducer(viewReducer, initialState)

  useEffect(() => {
    let isActive = true

    async function loadCase() {
      dispatch({ type: "loading" })

      try {
        const payload = await loadValuationViewData(supabase, params.id)
        if (isActive) dispatch({ type: "loaded", payload })
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "No se pudo cargar la valuación."
        if (isActive) dispatch({ type: "error", error: message })
      }
    }

    loadCase()

    return () => {
      isActive = false
    }
  }, [params.id, supabase])

  const totalAppraisedValue = Object.values(state.appraisalsByBlock).reduce(
    (sum, appraisal) => sum + toNumber(appraisal.appraised_value_cop),
    0,
  )

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 min-h-[calc(100vh-3.5rem)] p-6">
        <div className="max-w-6xl mx-auto space-y-8">
          <ValuationViewHeader caseCode={state.valuationCase?.case_code} caseId={params.id} />

          {state.isLoading ? <LoadingCard /> : null}
          {state.error ? <ErrorMessage error={state.error} /> : null}
          {!state.isLoading && !state.error && !state.valuationCase ? <NotFoundCard /> : null}

          {state.valuationCase ? (
            <>
              <ValuationSummaryBand
                blocks={state.blocks}
                cropsById={state.cropsById}
                departamento={state.departamento}
                municipio={state.municipio}
                totalAppraisedValue={totalAppraisedValue}
                valuationCase={state.valuationCase}
                varietiesById={state.varietiesById}
              />

              {state.blocks.length === 0 ? <EmptyBlocksCard /> : null}

              {state.blocks.map((block) => (
                <CropBlockResultCard
                  key={block.id}
                  appraisal={state.appraisalsByBlock[block.id]}
                  block={block}
                  crop={state.cropsById.get(block.crop_id)}
                  lines={state.linesByBlock[block.id] || []}
                  variety={state.varietiesById.get(block.variety_id)}
                />
              ))}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

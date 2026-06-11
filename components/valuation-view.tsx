"use client"

import { useEffect, useMemo, useReducer } from "react"
import { ArrowLeftIcon, Calendar, EditIcon, MapPin } from "lucide-react"
import { useParams, useRouter } from "next/navigation"

import { Header } from "@/components/header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { projectedEquilibriumAgeYears } from "@/lib/appraisal/equilibrium-year"
import { PRODUCTION_STAGE_LABELS, isProductionStageId, productionStageBadgeClassName } from "@/lib/insumos/stage"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/types/database"

type ValuationCase = Database["public"]["Tables"]["valuation_cases"]["Row"]
type CropBlock = Database["public"]["Tables"]["crop_blocks"]["Row"]
type ResolvedLine = Database["public"]["Tables"]["resolved_insumo_lines"]["Row"]
type AppraisalResult = Database["public"]["Tables"]["crop_appraisal_results"]["Row"]
type AnnualFlow = Database["public"]["Tables"]["crop_appraisal_annual_flows"]["Row"]
type AgronomicProfile = Database["public"]["Tables"]["crop_variety_agronomic_profiles"]["Row"]
type Departamento = Database["public"]["Tables"]["departamentos"]["Row"]
type Municipio = Database["public"]["Tables"]["municipios"]["Row"]
type Crop = Database["public"]["Tables"]["crops"]["Row"]
type Variety = Database["public"]["Tables"]["varieties"]["Row"]

interface ViewState {
  valuationCase: ValuationCase | null
  blocks: CropBlock[]
  linesByBlock: Record<string, ResolvedLine[]>
  appraisalsByBlock: Record<string, AppraisalResult>
  flowsByBlock: Record<string, AnnualFlow[]>
  profilesByCropVariety: Map<string, AgronomicProfile>
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
  flowsByBlock: {},
  profilesByCropVariety: new Map(),
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

function cropVarietyKey(cropId: string, varietyId: string) {
  return `${cropId}::${varietyId}`
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
  if (value === null || value === undefined || value === "") return "No disponible"
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return "No disponible"
  return percentFormatter.format(parsed)
}

function parseDisplayNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function rawResultNumber(rawResult: AppraisalResult["raw_result"], key: string) {
  if (!isRecord(rawResult)) return null

  const value = rawResult[key]
  if (typeof value !== "number" && typeof value !== "string") return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatEquilibriumYear(value: string | number | null | undefined) {
  const parsed = parseDisplayNumber(value)
  return parsed === null ? "No disponible" : `Año ${formatNumber(parsed)}`
}

function displayBreakEvenAge(
  appraisal: AppraisalResult,
  annualFlows: AnnualFlow[] = [],
  profile?: AgronomicProfile,
) {
  return projectedEquilibriumAgeYears({
    annualFlows: annualFlows.map((flow) => ({
      ageYears: flow.age_years,
      netFlowCopHa: flow.net_flow_cop_ha,
    })),
    breakEvenAgeYears: appraisal.break_even_age_years,
    currentAgeYears: appraisal.current_age_years,
    currentYearUtilityCopHa: appraisal.current_year_utility_cop_ha,
    pendingRecoveryCopHa: appraisal.pending_recovery_cop_ha,
    referenceAgeYears: profile?.harvest_start_year,
  })
}

function formatDisplayLabel(value: string | null | undefined) {
  if (!value) return ""
  const text = value.replace(/_/g, " ").trim().toLocaleLowerCase("es-CO")
  return text ? text.charAt(0).toLocaleUpperCase("es-CO") + text.slice(1) : ""
}

function formatStageLabel(stageId: string | null | undefined) {
  if (!stageId) return "Sin etapa"
  return isProductionStageId(stageId) ? PRODUCTION_STAGE_LABELS[stageId] : formatDisplayLabel(stageId)
}

function firstCropLabel(blocks: CropBlock[], cropsById: Map<string, Crop>, varietiesById: Map<string, Variety>) {
  const block = blocks[0]
  if (!block) return null
  const cropName = cropsById.get(block.crop_id)?.name || "Sin cultivo"
  const varietyName = varietiesById.get(block.variety_id)?.name || ""
  return `${cropName} ${varietyName}`.trim()
}

function metricValueClassName(value: number) {
  if (value > 0) return "text-emerald-700"
  if (value < 0) return "text-red-700"
  return "text-foreground"
}

function hasPendingRecovery(value: string | number | null | undefined) {
  return toNumber(value) > 0
}

function appraisalBasisLabel(appraisalRule: AppraisalResult["appraisal_rule"]) {
  if (appraisalRule === "salvamento") return "Valor de salvamento"
  if (appraisalRule === "vegetative") return "Inversión acumulada"
  if (appraisalRule === "pre_equilibrium") return "Utilidad + pendiente"
  return "Utilidad del año"
}

function buildValuationSummary(
  blocks: CropBlock[],
  appraisalsByBlock: Record<string, AppraisalResult>,
) {
  const appraisedBlocks = blocks.flatMap((block) => {
    const appraisal = appraisalsByBlock[block.id]
    return appraisal ? [{ block, appraisal }] : []
  })

  const totalAppraisedValue = appraisedBlocks.reduce(
    (sum, { appraisal }) => sum + toNumber(appraisal.appraised_value_cop),
    0,
  )
  const totalAreaHa = appraisedBlocks.reduce((sum, { appraisal }) => sum + toNumber(appraisal.crop_area_ha), 0)
  const averageValueCopHa = totalAreaHa > 0 ? totalAppraisedValue / totalAreaHa : null
  const totalRevenueCop = appraisedBlocks.reduce(
    (sum, { appraisal }) => sum + toNumber(appraisal.current_year_revenue_cop_ha) * toNumber(appraisal.crop_area_ha),
    0,
  )
  const totalCostCop = appraisedBlocks.reduce(
    (sum, { appraisal }) => sum + toNumber(appraisal.current_year_cost_cop_ha) * toNumber(appraisal.crop_area_ha),
    0,
  )
  const totalUtilityCop = appraisedBlocks.reduce(
    (sum, { appraisal }) => sum + toNumber(appraisal.current_year_utility_cop_ha) * toNumber(appraisal.crop_area_ha),
    0,
  )
  const totalPendingRecoveryCop = appraisedBlocks.reduce(
    (sum, { appraisal }) =>
      appraisal.stage_id === "salvamento"
        ? sum
        : sum + toNumber(appraisal.pending_recovery_cop_ha) * toNumber(appraisal.crop_area_ha),
    0,
  )
  const totalPlants = appraisedBlocks.reduce((sum, { appraisal }) => {
    const density = toNumber(appraisal.density_plants_ha)
    return density > 0 ? sum + density * toNumber(appraisal.crop_area_ha) : sum
  }, 0)
  const averageValueCopPerPlant = totalPlants > 0 ? totalAppraisedValue / totalPlants : null
  const utilityMargin = totalRevenueCop > 0 ? totalUtilityCop / totalRevenueCop : null
  return {
    averageValueCopHa,
    averageValueCopPerPlant,
    totalAppraisedValue,
    totalAreaHa,
    totalCostCop,
    totalPendingRecoveryCop,
    totalRevenueCop,
    totalUtilityCop,
    utilityMargin,
  }
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

  const [departamentoRes, municipioRes, cropsRes, varietiesRes, profilesRes, linesRes, appraisalsRes, flowsRes] = await Promise.all([
    supabase.from("departamentos").select("*").eq("id", caseData.departamento_id).returns<Departamento>().maybeSingle(),
    supabase.from("municipios").select("*").eq("id", caseData.municipio_id).returns<Municipio>().maybeSingle(),
    cropIds.length
      ? supabase.from("crops").select("*").in("id", cropIds).returns<Crop[]>()
      : Promise.resolve({ data: [] as Crop[], error: null }),
    varietyIds.length
      ? supabase.from("varieties").select("*").in("id", varietyIds).returns<Variety[]>()
      : Promise.resolve({ data: [] as Variety[], error: null }),
    cropIds.length && varietyIds.length
      ? supabase
          .from("crop_variety_agronomic_profiles")
          .select("*")
          .in("crop_id", cropIds)
          .in("variety_id", varietyIds)
          .returns<AgronomicProfile[]>()
      : Promise.resolve({ data: [] as AgronomicProfile[], error: null }),
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
    blockIds.length
      ? supabase
          .from("crop_appraisal_annual_flows")
          .select("*")
          .in("crop_block_id", blockIds)
          .order("line_order", { ascending: true })
          .returns<AnnualFlow[]>()
      : Promise.resolve({ data: [] as AnnualFlow[], error: null }),
  ])

  if (departamentoRes.error) throw departamentoRes.error
  if (municipioRes.error) throw municipioRes.error
  if (cropsRes.error) throw cropsRes.error
  if (varietiesRes.error) throw varietiesRes.error
  if (profilesRes.error) throw profilesRes.error
  if (linesRes.error) throw linesRes.error
  if (appraisalsRes.error) throw appraisalsRes.error
  if (flowsRes.error) throw flowsRes.error

  const linesByBlock: Record<string, ResolvedLine[]> = {}
  for (const line of linesRes.data || []) {
    linesByBlock[line.crop_block_id] = [...(linesByBlock[line.crop_block_id] || []), line]
  }

  const appraisalsByBlock: Record<string, AppraisalResult> = {}
  for (const appraisal of appraisalsRes.data || []) {
    appraisalsByBlock[appraisal.crop_block_id] = appraisal
  }

  const flowsByBlock: Record<string, AnnualFlow[]> = {}
  for (const flow of flowsRes.data || []) {
    flowsByBlock[flow.crop_block_id] = [...(flowsByBlock[flow.crop_block_id] || []), flow]
  }

  return {
    valuationCase: caseData,
    blocks,
    linesByBlock,
    appraisalsByBlock,
    flowsByBlock,
    profilesByCropVariety: new Map(
      (profilesRes.data || []).map((profile) => [cropVarietyKey(profile.crop_id, profile.variety_id), profile]),
    ),
    departamento: departamentoRes.data || null,
    municipio: municipioRes.data || null,
    cropsById: new Map((cropsRes.data || []).map((crop) => [crop.id, crop])),
    varietiesById: new Map((varietiesRes.data || []).map((variety) => [variety.id, variety])),
  }
}

function ValuationViewHeader({ caseCode, caseId }: Readonly<{ caseCode: string | undefined; caseId: string }>) {
  const router = useRouter()

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 space-y-2">
        <h1 className="text-3xl font-bold text-balance">Resultados de Valuación</h1>
        <p className="text-muted-foreground text-pretty">Análisis de valuación para el predio: {caseCode || caseId}</p>
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
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
  summary,
  valuationCase,
  varietiesById,
}: Readonly<{
  blocks: CropBlock[]
  cropsById: Map<string, Crop>
  departamento: Departamento | null
  municipio: Municipio | null
  summary: ReturnType<typeof buildValuationSummary>
  valuationCase: ValuationCase
  varietiesById: Map<string, Variety>
}>) {
  const cropLabel = firstCropLabel(blocks, cropsById, varietiesById)
  const hasTotalPendingRecovery = hasPendingRecovery(summary.totalPendingRecoveryCop)

  return (
    <Card className="gap-3 py-5">
      <CardHeader>
        <CardTitle>Resumen del cultivo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid gap-5 sm:grid-cols-[minmax(220px,0.9fr)_minmax(0,1fr)]">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Avalúo final del cultivo</div>
              <div className="text-4xl font-semibold tracking-normal text-emerald-700">
                {formatCurrency(summary.totalAppraisedValue)}
              </div>
            </div>

            <dl className="grid gap-x-5 gap-y-3 border-t pt-4 sm:grid-cols-2 sm:border-t-0 sm:pt-0">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Área valorada</dt>
                <dd className="text-base font-semibold">{formatNumber(summary.totalAreaHa)} ha</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Valor promedio por ha</dt>
                <dd className="text-base font-semibold">{formatCurrency(summary.averageValueCopHa)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Promedio por planta</dt>
                <dd className="text-base font-semibold">{formatCurrency(summary.averageValueCopPerPlant)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Cultivos</dt>
                <dd className="text-base font-semibold">{blocks.length}</dd>
              </div>
            </dl>
          </div>

          <div className="border-t pt-5 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
            <div className="mb-3 text-sm font-medium">Resultado económico</div>
            <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Ingreso año actual</dt>
                <dd className="text-base font-semibold">{formatCurrency(summary.totalRevenueCop)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Costo año actual</dt>
                <dd className="text-base font-semibold">{formatCurrency(summary.totalCostCop)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Utilidad año actual</dt>
                <dd className={`text-base font-semibold ${metricValueClassName(summary.totalUtilityCop)}`}>
                  {formatCurrency(summary.totalUtilityCop)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Margen de utilidad</dt>
                <dd className={`text-base font-semibold ${metricValueClassName(summary.totalUtilityCop)}`}>
                  {formatPercent(summary.utilityMargin)}
                </dd>
              </div>
              {hasTotalPendingRecovery ? (
                <div className="min-w-0 border-t border-amber-200 pt-3 sm:col-span-2 lg:col-span-4">
                  <dt className="text-xs text-muted-foreground">Pendiente total por recuperar</dt>
                  <dd className="text-base font-semibold text-amber-700">
                    {formatCurrency(summary.totalPendingRecoveryCop)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>

        <dl className="grid gap-4 border-t pt-4 text-sm md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="flex min-w-0 items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Ubicación</dt>
              <dd className="truncate font-medium">
                {departamento?.name || "Sin departamento"} / {municipio?.name || "Sin municipio"}
                {valuationCase.vereda ? ` - ${valuationCase.vereda}` : ""}
              </dd>
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-3">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Fecha</dt>
              <dd className="font-medium">{formatDate(valuationCase.valuation_asof_date)}</dd>
            </div>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Tasa de descuento</dt>
            <dd className="font-medium">{formatPercent(valuationCase.discount_rate_ea)} EA</dd>
            {cropLabel ? <dd className="truncate text-slate-500">{cropLabel}</dd> : null}
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}

function AppraisalMetrics({
  annualFlows,
  appraisal,
  profile,
}: Readonly<{ annualFlows: AnnualFlow[]; appraisal: AppraisalResult; profile: AgronomicProfile | undefined }>) {
  const isSalvage = appraisal.stage_id === "salvamento"
  const hasBlockPendingRecovery = !isSalvage && hasPendingRecovery(appraisal.pending_recovery_cop_ha)
  const blockBreakEvenAge = hasBlockPendingRecovery ? displayBreakEvenAge(appraisal, annualFlows, profile) : null
  const currentYearSalvageCostCopHa = rawResultNumber(appraisal.raw_result, "current_year_salvage_cost_cop_ha")
  const producedThisYear =
    toNumber(appraisal.current_year_yield_kg_ha) > 0 || toNumber(appraisal.current_year_revenue_cop_ha) > 0
  const contextMetrics = [
    isSalvage
      ? { label: "Etapa", value: "Salvamento" }
      : hasBlockPendingRecovery
      ? { label: "Pendiente por recuperar", value: formatCurrency(appraisal.pending_recovery_cop_ha) }
      : { label: "Situación financiera", value: "Inversión recuperada" },
    hasBlockPendingRecovery && blockBreakEvenAge !== null
      ? { label: "Año equilibrio", value: formatEquilibriumYear(blockBreakEvenAge) }
      : { label: "Base del avalúo", value: appraisalBasisLabel(appraisal.appraisal_rule) },
  ]

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
      <div className="grid gap-4 text-sm md:grid-cols-3 xl:grid-cols-6">
        <div>
          <span className="font-medium">Edad del cultivo:</span> {formatNumber(appraisal.current_age_years)} años
        </div>
        {producedThisYear ? (
          <>
            <div>
              <span className="font-medium">Rendimiento del año:</span>{" "}
              {formatNumber(appraisal.current_year_yield_kg_ha)} kg/ha
            </div>
            <div>
              <span className="font-medium">Ingreso del año:</span> {formatCurrency(appraisal.current_year_revenue_cop_ha)}
            </div>
          </>
        ) : null}
        <div>
          <span className="font-medium">Costo del año:</span> {formatCurrency(appraisal.current_year_cost_cop_ha)}
        </div>
        {currentYearSalvageCostCopHa !== null && currentYearSalvageCostCopHa > 0 ? (
          <div>
            <span className="font-medium">Costo de salvamento:</span> {formatCurrency(currentYearSalvageCostCopHa)}
          </div>
        ) : null}
        <div>
          <span className="font-medium">Utilidad del año:</span>{" "}
          <span className="whitespace-nowrap">{formatCurrency(appraisal.current_year_utility_cop_ha)}</span>
        </div>
        {contextMetrics.map((metric) => (
          <div key={metric.label}>
            <span className="font-medium">{metric.label}:</span> {metric.value}
          </div>
        ))}
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
  flows,
  lines,
  profile,
  variety,
}: Readonly<{
  appraisal: AppraisalResult | undefined
  block: CropBlock
  crop: Crop | undefined
  flows: AnnualFlow[]
  lines: ResolvedLine[]
  profile: AgronomicProfile | undefined
  variety: Variety | undefined
}>) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{crop?.name || "Cultivo"}</CardTitle>
            <CardDescription>{variety?.name || "Resultado del cultivo registrado"}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={productionStageBadgeClassName(block.derived_stage_id)}>
              Etapa: {formatStageLabel(block.derived_stage_id)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {appraisal ? <AppraisalMetrics annualFlows={flows} appraisal={appraisal} profile={profile} /> : null}
        <ResolvedLinesTable lines={lines} />
      </CardContent>
    </Card>
  )
}

function EmptyBlocksCard() {
  return (
    <Card>
      <CardContent className="py-8 text-sm text-muted-foreground">No hay cultivos para mostrar.</CardContent>
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

  const summary = buildValuationSummary(state.blocks, state.appraisalsByBlock)

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
                summary={summary}
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
                  flows={state.flowsByBlock[block.id] || []}
                  lines={state.linesByBlock[block.id] || []}
                  profile={state.profilesByCropVariety.get(cropVarietyKey(block.crop_id, block.variety_id))}
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

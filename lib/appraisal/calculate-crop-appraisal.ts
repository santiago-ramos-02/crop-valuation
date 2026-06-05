import type { SupabaseClient } from "@supabase/supabase-js"

import { normalizeText } from "@/lib/insumos/normalize"
import type { ProductionStageId } from "@/lib/insumos/stage"
import type { Database, Json } from "@/types/database"

type AgronomicProfile = Database["public"]["Tables"]["crop_variety_agronomic_profiles"]["Row"]
type CostTemplateLine = Database["public"]["Tables"]["cost_template_lines"]["Row"]
type InputPriceRow = Database["public"]["Tables"]["input_price_rows"]["Row"]
type YieldCurvePoint = Database["public"]["Tables"]["yield_curve_points"]["Row"]
type AppraisalResultInsert = Database["public"]["Tables"]["crop_appraisal_results"]["Insert"]
type AppraisalFlowInsert = Database["public"]["Tables"]["crop_appraisal_annual_flows"]["Insert"]

export type AppraisalRule = "vegetative" | "pre_equilibrium" | "post_equilibrium"

export interface CropAppraisalAnnualFlow {
  lineOrder: number
  ageYears: number
  stageId: ProductionStageId
  potentialYieldKgHa: number
  adjustedYieldKgHa: number
  revenueCopHa: number
  costCopHa: number
  netFlowCopHa: number
  cumulativeNetFlowCopHa: number
  investmentFutureValueCopHa: number | null
  pendingRecoveryCopHa: number | null
  discountFactor: number | null
  presentValueCopHa: number | null
  isCurrentYear: boolean
  isRemainingYear: boolean
}

export interface CalculatedCropAppraisal {
  appraisalRule: AppraisalRule
  stageId: ProductionStageId
  discountRateMethod: string
  discountRateEa: number
  startedProducing: boolean
  breakEvenReached: boolean
  breakEvenAgeYears: number | null
  currentAgeYears: number
  currentAgeYear: number
  cropAreaHa: number
  densityPlantsHa: number | null
  fitosanitaryFactor: number
  commercialPriceCopKg: number
  currentYearYieldKgHa: number
  currentYearRevenueCopHa: number
  currentYearCostCopHa: number
  currentYearUtilityCopHa: number
  vegetativeInvestmentCopHa: number
  pendingRecoveryCopHa: number
  remainingNpvCopHa: number
  vegetativeFinalValueCopHa: number
  productiveFinalValueCopHa: number
  decisionTreeValueCopHa: number
  finalValueStage: "vegetative" | "productive"
  appraisedValueCopHa: number
  appraisedValueCop: number
  appraisedValueCopPerPlant: number | null
  missingCostLineCount: number
  stageCostTotalsCopHa: Record<ProductionStageId, number>
  annualFlows: CropAppraisalAnnualFlow[]
}

export interface CalculateCropAppraisalInput {
  supabase: SupabaseClient<Database>
  cropId: string
  varietyId: string
  departamentoId: string
  currentStageId: ProductionStageId
  profile: AgronomicProfile
  ageYears: number
  cropAreaHa: number
  densityPlantsHa: number | null
  fitosanitaryFactor: number | null
  commercialPriceCopKg: number | null
  freshYieldKgHa: number | null
  jornalCostCop: number | null
  landRentCopHaYear: number | null
  discountRateMethod: string
  discountRateEa: number
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function firstPricesByInput(prices: InputPriceRow[]) {
  const byInput = new Map<string, InputPriceRow>()
  for (const price of prices) {
    if (!byInput.has(price.normalized_input_name)) byInput.set(price.normalized_input_name, price)
  }
  return byInput
}

function fixedPriceForLine(line: CostTemplateLine, jornalCostCop: number | null, landRentCopHaYear: number | null) {
  if (line.unit_price_mode === "jornal_lookup" && jornalCostCop !== null) return jornalCostCop

  const inputGroup = normalizeText(line.input_group_name)
  const inputName = normalizeText(line.input_name)
  const activityName = normalizeText(line.activity_name)
  if (
    landRentCopHaYear !== null &&
    (inputGroup.includes("arrendamiento") || inputName.includes("hectarea anual") || activityName.includes("canon"))
  ) {
    return landRentCopHaYear
  }

  return toNumber(line.fixed_unit_price_cop)
}

function lineTotalCopHa(
  line: CostTemplateLine,
  pricesByInput: Map<string, InputPriceRow>,
  jornalCostCop: number | null,
  landRentCopHaYear: number | null,
) {
  const quantity = toNumber(line.quantity)
  if (quantity === null) return { totalCopHa: 0, missingPrice: false }

  const price =
    line.unit_price_mode === "input_price_lookup"
      ? toNumber(pricesByInput.get(line.normalized_input_name || "")?.average_price_final_cop)
      : fixedPriceForLine(line, jornalCostCop, landRentCopHaYear)

  return {
    totalCopHa: price === null ? 0 : quantity * price,
    missingPrice: price === null,
  }
}

function stageTotals(
  lines: CostTemplateLine[],
  pricesByInput: Map<string, InputPriceRow>,
  jornalCostCop: number | null,
  landRentCopHaYear: number | null,
) {
  const totals: Record<ProductionStageId, number> = {
    establecimiento: 0,
    improductivo: 0,
    mantenimiento: 0,
    salvamento: 0,
  }
  let missingCostLineCount = 0

  for (const line of lines) {
    const { totalCopHa, missingPrice } = lineTotalCopHa(line, pricesByInput, jornalCostCop, landRentCopHaYear)
    totals[line.stage_id] += totalCopHa
    if (missingPrice) missingCostLineCount += 1
  }

  return { totals, missingCostLineCount }
}

function currentAgeYear(ageYears: number) {
  return Math.max(1, Math.ceil(ageYears))
}

function annualCostForPoint(
  point: YieldCurvePoint,
  nextPoint: YieldCurvePoint | undefined,
  costTotals: Record<ProductionStageId, number>,
) {
  const stageId = point.stage_id
  const salvageCost =
    stageId === "mantenimiento" && nextPoint?.stage_id !== "mantenimiento" ? costTotals.salvamento : 0
  return costTotals[stageId] + salvageCost
}

function breakEvenAgeWithOpportunityCost(flows: CropAppraisalAnnualFlow[], discountRateEa: number) {
  for (const flow of flows) {
    const capitalizedNetThroughYear = flows
      .filter((candidate) => candidate.ageYears <= flow.ageYears)
      .reduce(
        (sum, candidate) =>
          sum + candidate.netFlowCopHa * (1 + discountRateEa) ** (flow.ageYears - candidate.ageYears),
        0,
      )
    if (capitalizedNetThroughYear >= 0) return flow.ageYears
  }
  return null
}

export async function calculateCropAppraisal({
  supabase,
  cropId,
  varietyId,
  departamentoId,
  currentStageId,
  profile,
  ageYears,
  cropAreaHa,
  densityPlantsHa,
  fitosanitaryFactor,
  commercialPriceCopKg,
  freshYieldKgHa,
  jornalCostCop,
  landRentCopHaYear,
  discountRateMethod,
  discountRateEa,
}: CalculateCropAppraisalInput): Promise<CalculatedCropAppraisal> {
  if (!Number.isFinite(ageYears) || ageYears < 0) throw new Error("La edad del cultivo debe ser mayor o igual a cero.")
  if (!Number.isFinite(cropAreaHa) || cropAreaHa <= 0) throw new Error("El área del cultivo debe ser positiva.")
  if (commercialPriceCopKg === null || commercialPriceCopKg <= 0) {
    throw new Error("El precio de comercialización es requerido para calcular el avalúo del cultivo.")
  }
  if (!Number.isFinite(discountRateEa) || discountRateEa < 0) {
    throw new Error("La tasa de descuento debe ser mayor o igual a cero.")
  }

  const [templateRes, yieldRes] = await Promise.all([
    supabase
      .from("cost_template_lines")
      .select("*")
      .eq("crop_id", cropId)
      .eq("variety_id", varietyId)
      .order("line_order", { ascending: true })
      .returns<CostTemplateLine[]>(),
    supabase
      .from("yield_curve_points")
      .select("*")
      .eq("crop_id", cropId)
      .eq("variety_id", varietyId)
      .order("age_years", { ascending: true })
      .returns<YieldCurvePoint[]>(),
  ])

  if (templateRes.error) throw templateRes.error
  if (yieldRes.error) throw yieldRes.error

  const templateLines = templateRes.data || []
  const yieldPoints = yieldRes.data || []
  if (yieldPoints.length === 0) throw new Error("No hay curva de rendimiento para el cultivo seleccionado.")

  const normalizedInputNames = Array.from(
    new Set(
      templateLines
        .filter((line) => line.unit_price_mode === "input_price_lookup")
        .map((line) => line.normalized_input_name)
        .filter((value): value is string => Boolean(value)),
    ),
  )

  let priceRows: InputPriceRow[] = []
  if (normalizedInputNames.length > 0) {
    const { data, error } = await supabase
      .from("input_price_rows")
      .select("*")
      .eq("departamento_id", departamentoId)
      .in("normalized_input_name", normalizedInputNames)
      .order("source_row", { ascending: true })
      .returns<InputPriceRow[]>()

    if (error) throw error
    priceRows = data || []
  }

  const pricesByInput = firstPricesByInput(priceRows)
  const { totals, missingCostLineCount } = stageTotals(templateLines, pricesByInput, jornalCostCop, landRentCopHaYear)
  const currentYear = currentAgeYear(ageYears)
  const maxCurveAge = Math.max(...yieldPoints.map((point) => toNumber(point.age_years) || 0))
  if (currentYear > maxCurveAge) {
    throw new Error("La edad registrada supera la curva de rendimiento disponible para el cultivo.")
  }

  const factor = fitosanitaryFactor ?? 1
  let cumulativeNetFlowCopHa = 0
  const annualFlows = yieldPoints.map((point, index): CropAppraisalAnnualFlow => {
    const pointAge = toNumber(point.age_years) || index + 1
    const potentialYield = toNumber(point.potential_yield_kg_ha) || 0
    const curveYield = potentialYield * factor
    const isCurrentYear = pointAge === currentYear
    const adjustedYieldKgHa = isCurrentYear && freshYieldKgHa !== null && freshYieldKgHa >= 0 ? freshYieldKgHa : curveYield
    const revenueCopHa = adjustedYieldKgHa * commercialPriceCopKg
    const costCopHa = annualCostForPoint(point, yieldPoints[index + 1], totals)
    const netFlowCopHa = revenueCopHa - costCopHa
    cumulativeNetFlowCopHa += netFlowCopHa

    const isPastOrCurrent = pointAge <= currentYear
    const isRemainingYear = pointAge >= currentYear
    const yearsToCurrent = currentYear - pointAge
    const remainingIndex = pointAge - currentYear + 1
    const investmentFutureValueCopHa = isPastOrCurrent ? costCopHa * (1 + discountRateEa) ** yearsToCurrent : null
    const capitalizedNetFlow = isPastOrCurrent ? netFlowCopHa * (1 + discountRateEa) ** yearsToCurrent : null
    const discountFactor = isRemainingYear ? (1 + discountRateEa) ** remainingIndex : null

    return {
      lineOrder: index + 1,
      ageYears: pointAge,
      stageId: point.stage_id,
      potentialYieldKgHa: potentialYield,
      adjustedYieldKgHa,
      revenueCopHa,
      costCopHa,
      netFlowCopHa,
      cumulativeNetFlowCopHa,
      investmentFutureValueCopHa,
      pendingRecoveryCopHa: capitalizedNetFlow === null ? null : Math.max(0, -capitalizedNetFlow),
      discountFactor,
      presentValueCopHa: discountFactor === null ? null : netFlowCopHa / discountFactor,
      isCurrentYear,
      isRemainingYear,
    }
  })

  const currentFlow = annualFlows.find((flow) => flow.ageYears === currentYear)
  if (!currentFlow) throw new Error("No se encontró el año actual dentro de la curva de rendimiento.")

  const harvestStartYear = toNumber(profile.harvest_start_year)
  const startedProducing =
    harvestStartYear !== null && harvestStartYear > 0 ? ageYears >= harvestStartYear : currentFlow.adjustedYieldKgHa > 0

  const capitalizedNetThroughCurrent = annualFlows
    .filter((flow) => flow.ageYears <= currentYear)
    .reduce((sum, flow) => sum + flow.netFlowCopHa * (1 + discountRateEa) ** (currentYear - flow.ageYears), 0)
  const vegetativeInvestmentCopHa = annualFlows
    .filter((flow) => flow.ageYears <= currentYear)
    .reduce((sum, flow) => sum + flow.costCopHa * (1 + discountRateEa) ** (currentYear - flow.ageYears), 0)
  const pendingRecoveryCopHa = Math.max(0, -capitalizedNetThroughCurrent)
  const foundBreakEvenAge = breakEvenAgeWithOpportunityCost(annualFlows, discountRateEa)
  const breakEvenReached = capitalizedNetThroughCurrent >= 0
  const remainingNpvCopHa = annualFlows.reduce((sum, flow) => sum + (flow.presentValueCopHa || 0), 0)
  const appraisalRule: AppraisalRule = !startedProducing
    ? "vegetative"
    : breakEvenReached
      ? "post_equilibrium"
      : "pre_equilibrium"

  const decisionTreeValueCopHa =
    appraisalRule === "vegetative"
      ? vegetativeInvestmentCopHa
      : appraisalRule === "pre_equilibrium"
        ? currentFlow.netFlowCopHa + pendingRecoveryCopHa
        : currentFlow.netFlowCopHa
  const vegetativeFinalValueCopHa = vegetativeInvestmentCopHa
  const productiveFinalValueCopHa = remainingNpvCopHa
  const finalValueStage = startedProducing ? "productive" : "vegetative"
  const appraisedValueCopHa =
    finalValueStage === "vegetative" ? vegetativeFinalValueCopHa : productiveFinalValueCopHa
  const appraisedValueCop = appraisedValueCopHa * cropAreaHa
  const appraisedValueCopPerPlant =
    densityPlantsHa !== null && densityPlantsHa > 0 ? appraisedValueCopHa / densityPlantsHa : null

  return {
    appraisalRule,
    stageId: currentStageId,
    discountRateMethod,
    discountRateEa,
    startedProducing,
    breakEvenReached,
    breakEvenAgeYears: foundBreakEvenAge,
    currentAgeYears: ageYears,
    currentAgeYear: currentYear,
    cropAreaHa,
    densityPlantsHa,
    fitosanitaryFactor: factor,
    commercialPriceCopKg,
    currentYearYieldKgHa: currentFlow.adjustedYieldKgHa,
    currentYearRevenueCopHa: currentFlow.revenueCopHa,
    currentYearCostCopHa: currentFlow.costCopHa,
    currentYearUtilityCopHa: currentFlow.netFlowCopHa,
    vegetativeInvestmentCopHa,
    pendingRecoveryCopHa,
    remainingNpvCopHa,
    vegetativeFinalValueCopHa,
    productiveFinalValueCopHa,
    decisionTreeValueCopHa,
    finalValueStage,
    appraisedValueCopHa,
    appraisedValueCop,
    appraisedValueCopPerPlant,
    missingCostLineCount,
    stageCostTotalsCopHa: totals,
    annualFlows,
  }
}

export function buildCropAppraisalResultInsert(cropBlockId: string, appraisal: CalculatedCropAppraisal): AppraisalResultInsert {
  return {
    crop_block_id: cropBlockId,
    appraisal_rule: appraisal.appraisalRule,
    stage_id: appraisal.stageId,
    discount_rate_method: appraisal.discountRateMethod,
    discount_rate_ea: appraisal.discountRateEa,
    started_producing: appraisal.startedProducing,
    break_even_reached: appraisal.breakEvenReached,
    break_even_age_years: appraisal.breakEvenAgeYears,
    current_age_years: appraisal.currentAgeYears,
    crop_area_ha: appraisal.cropAreaHa,
    density_plants_ha: appraisal.densityPlantsHa,
    fitosanitary_factor: appraisal.fitosanitaryFactor,
    commercial_price_cop_kg: appraisal.commercialPriceCopKg,
    current_year_yield_kg_ha: appraisal.currentYearYieldKgHa,
    current_year_revenue_cop_ha: appraisal.currentYearRevenueCopHa,
    current_year_cost_cop_ha: appraisal.currentYearCostCopHa,
    current_year_utility_cop_ha: appraisal.currentYearUtilityCopHa,
    vegetative_investment_cop_ha: appraisal.vegetativeInvestmentCopHa,
    pending_recovery_cop_ha: appraisal.pendingRecoveryCopHa,
    remaining_npv_cop_ha: appraisal.remainingNpvCopHa,
    appraised_value_cop_ha: appraisal.appraisedValueCopHa,
    appraised_value_cop: appraisal.appraisedValueCop,
    appraised_value_cop_per_plant: appraisal.appraisedValueCopPerPlant,
    raw_result: {
      current_age_year: appraisal.currentAgeYear,
      final_value_stage: appraisal.finalValueStage,
      vegetative_final_value_cop_ha: appraisal.vegetativeFinalValueCopHa,
      productive_final_value_cop_ha: appraisal.productiveFinalValueCopHa,
      decision_tree_value_cop_ha: appraisal.decisionTreeValueCopHa,
      missing_cost_line_count: appraisal.missingCostLineCount,
      stage_cost_totals_cop_ha: appraisal.stageCostTotalsCopHa,
    } as unknown as Json,
  }
}

export function buildCropAppraisalAnnualFlowInserts(
  appraisalResultId: string,
  cropBlockId: string,
  flows: CropAppraisalAnnualFlow[],
): AppraisalFlowInsert[] {
  return flows.map((flow) => ({
    appraisal_result_id: appraisalResultId,
    crop_block_id: cropBlockId,
    line_order: flow.lineOrder,
    age_years: flow.ageYears,
    stage_id: flow.stageId,
    potential_yield_kg_ha: flow.potentialYieldKgHa,
    adjusted_yield_kg_ha: flow.adjustedYieldKgHa,
    revenue_cop_ha: flow.revenueCopHa,
    cost_cop_ha: flow.costCopHa,
    net_flow_cop_ha: flow.netFlowCopHa,
    cumulative_net_flow_cop_ha: flow.cumulativeNetFlowCopHa,
    investment_future_value_cop_ha: flow.investmentFutureValueCopHa,
    pending_recovery_cop_ha: flow.pendingRecoveryCopHa,
    discount_factor: flow.discountFactor,
    present_value_cop_ha: flow.presentValueCopHa,
    is_current_year: flow.isCurrentYear,
    is_remaining_year: flow.isRemainingYear,
  }))
}

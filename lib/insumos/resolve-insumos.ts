import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"
import { normalizeText } from "./normalize"
import { deriveStage, type ProductionStageId } from "./stage"

type CostTemplateLine = Database["public"]["Tables"]["cost_template_lines"]["Row"]
type InputPriceRow = Database["public"]["Tables"]["input_price_rows"]["Row"]
type AgronomicProfile = Database["public"]["Tables"]["crop_variety_agronomic_profiles"]["Row"]
type ResolvedInsumoInsert = Database["public"]["Tables"]["resolved_insumo_lines"]["Insert"]

export interface ResolveInsumosInput {
  supabase: SupabaseClient<Database>
  cropId: string
  varietyId: string
  departamentoId: string
  ageYears: number
  cropName?: string | null
  varietyName?: string | null
  jornalCostCop?: number | null
  landRentCopHaYear?: number | null
}

export interface ResolvedInsumo {
  templateLineId: string
  inputPriceRowId: string | null
  stageId: ProductionStageId
  lineOrder: number
  lineKind: CostTemplateLine["line_kind"]
  rubroCode: string | null
  rubroName: string | null
  subrubroCode: string | null
  subrubroName: string | null
  activityCode: string | null
  activityName: string | null
  inputGroupName: string | null
  inputName: string
  normalizedInputName: string
  presentation: string | null
  quantity: number | null
  unitPriceCop: number | null
  unitPriceSource: string
  totalCop: number | null
  templateSourceRow: number
  priceSourceRow: number | null
}

export interface ResolvedInsumosResult {
  stageId: ProductionStageId
  stageName: string
  stageReason: string
  harvestStartYear: number | null
  profile: AgronomicProfile
  lines: ResolvedInsumo[]
  missingPriceCount: number
  totalCop: number
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function firstPricesByInput(prices: InputPriceRow[]): Map<string, InputPriceRow> {
  const byInput = new Map<string, InputPriceRow>()
  for (const price of prices) {
    if (!byInput.has(price.normalized_input_name)) {
      byInput.set(price.normalized_input_name, price)
    }
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

export async function resolveInsumosWithContext({
  supabase,
  cropId,
  varietyId,
  departamentoId,
  ageYears,
  cropName,
  varietyName,
  jornalCostCop = null,
  landRentCopHaYear = null,
}: ResolveInsumosInput): Promise<ResolvedInsumosResult> {
  const profileResponse = await supabase
    .from("crop_variety_agronomic_profiles")
    .select("*")
    .eq("crop_id", cropId)
    .eq("variety_id", varietyId)
    .maybeSingle()

  const profile = profileResponse.data as AgronomicProfile | null
  const profileError = profileResponse.error
  if (profileError) throw profileError
  if (!profile) {
    throw new Error(`No hay perfil agronomico para crop=${cropId}, variety=${varietyId}.`)
  }

  const harvestStartYear = toNumber(profile.harvest_start_year)
  const stage = deriveStage({
    ageYears,
    harvestStartYear,
    cropName,
    varietyName,
  })

  const { data: templateLines, error: templateError } = await supabase
    .from("cost_template_lines")
    .select("*")
    .eq("crop_id", cropId)
    .eq("variety_id", varietyId)
    .eq("stage_id", stage.stageId)
    .order("line_order", { ascending: true })
    .returns<CostTemplateLine[]>()

  if (templateError) throw templateError

  const normalizedInputNames = Array.from(
    new Set(
      (templateLines || [])
        .filter((line) => line.unit_price_mode === "input_price_lookup")
        .map((line) => line.normalized_input_name)
        .filter(Boolean) as string[],
    ),
  )

  let priceRows: InputPriceRow[] = []
  if (normalizedInputNames.length > 0) {
    const { data: prices, error: pricesError } = await supabase
      .from("input_price_rows")
      .select("*")
      .eq("departamento_id", departamentoId)
      .in("normalized_input_name", normalizedInputNames)
      .order("source_row", { ascending: true })
      .returns<InputPriceRow[]>()

    if (pricesError) throw pricesError
    priceRows = prices || []
  }

  const pricesByInput = firstPricesByInput(priceRows)
  const lines = (templateLines || []).map((line): ResolvedInsumo => {
    const normalizedInputName = line.normalized_input_name || ""
    const price = pricesByInput.get(normalizedInputName) || null
    const quantity = toNumber(line.quantity)
    const unitPriceCop =
      line.unit_price_mode === "input_price_lookup"
        ? toNumber(price?.average_price_final_cop)
        : fixedPriceForLine(line, jornalCostCop, landRentCopHaYear)
    const totalCop = quantity !== null && unitPriceCop !== null ? quantity * unitPriceCop : null

    return {
      templateLineId: line.id,
      inputPriceRowId: price?.id || null,
      stageId: stage.stageId,
      lineOrder: line.line_order,
      lineKind: line.line_kind,
      rubroCode: line.rubro_code,
      rubroName: line.rubro_name,
      subrubroCode: line.subrubro_code,
      subrubroName: line.subrubro_name,
      activityCode: line.activity_code,
      activityName: line.activity_name,
      inputGroupName: line.input_group_name,
      inputName: line.input_name || "Sin nombre",
      normalizedInputName,
      presentation: line.presentation,
      quantity,
      unitPriceCop,
      unitPriceSource:
        line.unit_price_mode === "input_price_lookup"
          ? price?.price_source || (price ? "Precio Promedio Final" : "Precio no encontrado")
          : line.unit_price_mode === "jornal_lookup"
            ? "Jornal de referencia"
            : "Precio fijo",
      totalCop,
      templateSourceRow: line.source_row,
      priceSourceRow: price?.source_row || null,
    }
  })

  return {
    stageId: stage.stageId,
    stageName: stage.stageName,
    stageReason: stage.reason,
    harvestStartYear,
    profile,
    lines,
    missingPriceCount: lines.filter((line) => line.unitPriceCop === null).length,
    totalCop: lines.reduce((sum, line) => sum + (line.totalCop || 0), 0),
  }
}

export function buildResolvedInsumoInserts(
  cropBlockId: string,
  lines: ResolvedInsumo[],
): ResolvedInsumoInsert[] {
  return lines.map((line) => ({
    crop_block_id: cropBlockId,
    template_line_id: line.templateLineId,
    input_price_row_id: line.inputPriceRowId,
    stage_id: line.stageId,
    line_order: line.lineOrder,
    rubro_code: line.rubroCode,
    rubro_name: line.rubroName,
    subrubro_code: line.subrubroCode,
    subrubro_name: line.subrubroName,
    activity_code: line.activityCode,
    activity_name: line.activityName,
    input_group_name: line.inputGroupName,
    input_name: line.inputName,
    presentation: line.presentation,
    quantity: line.quantity,
    unit_price_cop: line.unitPriceCop,
    unit_price_source: line.unitPriceSource,
    total_cop: line.totalCop,
  }))
}

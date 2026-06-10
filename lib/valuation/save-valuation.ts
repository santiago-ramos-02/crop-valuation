import type { SupabaseClient } from "@supabase/supabase-js"

import {
  buildCropAppraisalAnnualFlowInserts,
  buildCropAppraisalResultInsert,
  calculateCropAppraisal,
  type CalculatedCropAppraisal,
} from "@/lib/appraisal/calculate-crop-appraisal"
import {
  buildResolvedInsumoInserts,
  resolveInsumosWithContext,
  type ResolvedInsumosResult,
} from "@/lib/insumos/resolve-insumos"
import { parseLocalizedNumberInput } from "@/lib/number-notation"
import type { BlockData, ParcelHeaderData } from "@/lib/valuation/form-data"
import type { Database, Json } from "@/types/database"

type MunicipioCropAvailability = Database["public"]["Tables"]["municipio_crop_availability"]["Row"]

export interface SavedBlockResolution {
  cropBlockId: string
  appraisalResultId: string
  block: BlockData
  result: ResolvedInsumosResult
  appraisal: CalculatedCropAppraisal
}

export interface SaveValuationInput {
  supabase: SupabaseClient<Database>
  parcelData: ParcelHeaderData
  blockData: BlockData[]
  existingCaseId?: string
}

export interface SaveValuationResult {
  caseId: string
  persistedBlocks: SavedBlockResolution[]
}

interface ValidatedBlock {
  block: BlockData
  ageYears: number
  cropAreaHa: number
  commercialPriceCopKg: number
}

function cropAvailabilityKey(cropId: string, varietyId: string) {
  return `${cropId}:${varietyId}`
}

function numberOrNull(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  const parsed = parseLocalizedNumberInput(text)
  return parsed === null ? null : String(parsed)
}

function optionalNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  return parseLocalizedNumberInput(trimmed)
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed || null
}

function requiredText(value: string, message: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(message)
  return trimmed
}

function requiredNumber(value: string, message: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(message)
  const parsed = parseLocalizedNumberInput(trimmed)
  if (parsed === null) throw new Error(message)
  return parsed
}

function positiveRequiredNumber(value: string, message: string) {
  const parsed = requiredNumber(value, message)
  if (parsed <= 0) throw new Error(message)
  return parsed
}

function fitosanitaryFactorFromCondition(condition: string) {
  const normalized = condition.trim().toLocaleLowerCase("es-CO")
  if (normalized === "buena" || normalized === "bueno") return 0.95
  if (normalized === "aceptable") return 0.7
  if (normalized === "regular") return 0.475
  if (normalized === "mala" || normalized === "malo") return 0.2
  return null
}

function blockFitosanitaryFactor(block: BlockData) {
  return optionalNumber(block.fitosanitaryFactor) ?? fitosanitaryFactorFromCondition(block.fitosanitaryCondition)
}

function validateInputs(parcelData: ParcelHeaderData, blockData: BlockData[]) {
  const departamentoId = requiredText(parcelData.departamentoId, "El departamento es requerido para resolver los insumos.")
  const municipioId = requiredText(parcelData.municipioId, "El municipio es requerido.")
  const discountRateMethod = requiredText(parcelData.discountRateMethod, "El método de tasa de descuento es requerido.")
  const discountRateEa = requiredNumber(parcelData.discountRateEa, "La tasa de descuento es requerida para calcular el avalúo.")
  if (discountRateEa < 0) throw new Error("La tasa de descuento debe ser mayor o igual a cero.")

  const slopePercent = optionalNumber(parcelData.slopePercent)
  if (slopePercent !== null && slopePercent < 0) throw new Error("La pendiente del predio debe ser mayor o igual a cero.")
  if (blockData.length === 0) throw new Error("Debe registrar al menos un cultivo/lote.")

  const blocks = blockData.map((block, index): ValidatedBlock => {
    requiredText(block.blockLabel, `El nombre del cultivo/lote ${index + 1} es requerido.`)
    requiredText(block.cropId, `El cultivo del lote ${index + 1} es requerido para resolver los insumos.`)
    requiredText(block.varietyId, `La variedad del lote ${index + 1} es requerida para resolver los insumos.`)

    const ageYears = requiredNumber(
      block.ageYears,
      `La edad del lote ${index + 1} es requerida para calcular la etapa y los insumos.`,
    )
    if (ageYears < 0) throw new Error(`La edad del lote ${index + 1} debe ser mayor o igual a cero.`)

    const cropAreaHa = positiveRequiredNumber(
      block.cropAreaHa,
      `El área del cultivo/lote ${index + 1} es requerida y debe ser positiva.`,
    )
    const commercialPriceCopKg = positiveRequiredNumber(
      block.commercialPriceCopKg,
      `El precio de comercialización del lote ${index + 1} es requerido para calcular el avalúo.`,
    )
    const jornalCostCop = optionalNumber(block.jornalCostCop)
    const landRentCopHaYear = optionalNumber(block.landRentCopHaYear)
    const soilValueCopHa = optionalNumber(block.soilValueCopHa)

    if (jornalCostCop !== null && jornalCostCop < 0) {
      throw new Error(`El costo del jornal del lote ${index + 1} debe ser mayor o igual a cero.`)
    }
    if (landRentCopHaYear !== null && landRentCopHaYear < 0) {
      throw new Error(`El costo de arriendo del lote ${index + 1} debe ser mayor o igual a cero.`)
    }
    if (soilValueCopHa !== null && soilValueCopHa < 0) {
      throw new Error(`El valor del suelo del lote ${index + 1} debe ser mayor o igual a cero.`)
    }
    if ((landRentCopHaYear || 0) > 0 && (soilValueCopHa || 0) > 0) {
      throw new Error(`Registre costo de arriendo o valor del suelo en el lote ${index + 1}, no ambos.`)
    }

    return { block, ageYears, cropAreaHa, commercialPriceCopKg }
  })

  return { departamentoId, municipioId, discountRateMethod, discountRateEa, slopePercent, blocks }
}

async function validateMunicipioCropAvailability({
  blocks,
  municipioId,
  supabase,
}: {
  blocks: ValidatedBlock[]
  municipioId: string
  supabase: SupabaseClient<Database>
}) {
  const { data, error } = await supabase
    .from("municipio_crop_availability")
    .select("crop_id,variety_id")
    .eq("municipio_id", municipioId)
    .eq("active", true)
    .returns<Array<Pick<MunicipioCropAvailability, "crop_id" | "variety_id">>>()

  if (error) throw error

  const availablePairs = new Set((data || []).map((row) => cropAvailabilityKey(row.crop_id, row.variety_id)))
  const unavailableBlock = blocks.find(({ block }) => !availablePairs.has(cropAvailabilityKey(block.cropId, block.varietyId)))
  if (unavailableBlock) throw new Error("El cultivo seleccionado no está disponible para el municipio del predio.")
}

export async function saveValuation({
  supabase,
  parcelData,
  blockData,
  existingCaseId,
}: SaveValuationInput): Promise<SaveValuationResult> {
  const validated = validateInputs(parcelData, blockData)

  const { data: userRes, error: userError } = await supabase.auth.getUser()
  if (userError || !userRes.user) throw new Error("Debe iniciar sesión para guardar la valuación.")
  const user = userRes.user

  await validateMunicipioCropAvailability({
    blocks: validated.blocks,
    municipioId: validated.municipioId,
    supabase,
  })

  const resolvedBlocks = await Promise.all(
    validated.blocks.map(async ({ block, ageYears, cropAreaHa, commercialPriceCopKg }) => {
      const jornalCostCop = optionalNumber(block.jornalCostCop)
      const landRentCopHaYear = optionalNumber(block.landRentCopHaYear)
      const result = await resolveInsumosWithContext({
        supabase,
        cropId: block.cropId,
        varietyId: block.varietyId,
        departamentoId: validated.departamentoId,
        ageYears,
        fitosanitaryCondition: block.fitosanitaryCondition,
        jornalCostCop,
        landRentCopHaYear,
        slopePercent: validated.slopePercent,
      })
      const densityPlantsHa =
        optionalNumber(block.plantingDensityPlantsHa) ?? optionalNumber(result.profile.default_density_plants_ha)
      const appraisal = await calculateCropAppraisal({
        supabase,
        cropId: block.cropId,
        varietyId: block.varietyId,
        departamentoId: validated.departamentoId,
        currentStageId: result.stageId,
        profile: result.profile,
        ageYears,
        cropAreaHa,
        densityPlantsHa,
        fitosanitaryFactor: blockFitosanitaryFactor(block),
        commercialPriceCopKg,
        freshYieldKgHa: optionalNumber(block.freshYieldKgHa),
        jornalCostCop,
        landRentCopHaYear,
        slopePercent: validated.slopePercent,
        discountRateMethod: validated.discountRateMethod,
        discountRateEa: validated.discountRateEa,
      })

      return { block, ageYears, cropAreaHa, result, appraisal }
    }),
  )

  const rawForm = { parcelData, blockData } as unknown as Json
  let caseId = existingCaseId || ""

  const casePayload = {
    user_id: user.id,
    case_code: parcelData.parcelId,
    valuation_asof_date: parcelData.valuationAsOfDate,
    departamento_id: validated.departamentoId,
    municipio_id: validated.municipioId,
    vereda: textOrNull(parcelData.vereda),
    latitude: numberOrNull(parcelData.latitude),
    longitude: numberOrNull(parcelData.longitude),
    climate_type: textOrNull(parcelData.climateType),
    temperature_range: textOrNull(parcelData.temperatureRange),
    altitude_range: textOrNull(parcelData.altitudeRange),
    aptitude_upra_sipra: textOrNull(parcelData.aptitudeUpraSipra),
    slope_percent: numberOrNull(parcelData.slopePercent),
    agrologic_class: textOrNull(parcelData.agrologicClass),
    altitude_m: numberOrNull(parcelData.altitudeM),
    total_parcel_area_ha: numberOrNull(parcelData.totalParcelAreaHa),
    discount_rate_method: validated.discountRateMethod,
    discount_rate_ea: String(validated.discountRateEa),
    raw_form: rawForm,
  }

  async function updateExistingCase(targetCaseId: string) {
    const { error: caseError } = await supabase
      .from("valuation_cases")
      .update(casePayload)
      .eq("id", targetCaseId)
      .eq("user_id", user.id)
      .select("id")
      .single()
    if (caseError) throw caseError

    const { data: oldBlocks, error: oldBlocksError } = await supabase
      .from("crop_blocks")
      .select("id")
      .eq("valuation_case_id", targetCaseId)

    if (oldBlocksError) throw oldBlocksError

    const oldBlockIds = (oldBlocks || []).map((block) => block.id)
    if (oldBlockIds.length > 0) {
      const { error: linesDeleteError } = await supabase.from("resolved_insumo_lines").delete().in("crop_block_id", oldBlockIds)
      if (linesDeleteError) throw linesDeleteError
    }

    const { error: blocksDeleteError } = await supabase.from("crop_blocks").delete().eq("valuation_case_id", targetCaseId)
    if (blocksDeleteError) throw blocksDeleteError
  }

  if (existingCaseId) {
    await updateExistingCase(existingCaseId)
  } else {
    const { data: matchingCases, error: matchingCaseError } = await supabase
      .from("valuation_cases")
      .select("id")
      .eq("user_id", user.id)
      .eq("case_code", parcelData.parcelId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .returns<Array<{ id: string }>>()

    if (matchingCaseError) throw matchingCaseError

    const matchingCaseId = matchingCases?.[0]?.id
    if (matchingCaseId) {
      caseId = matchingCaseId
      await updateExistingCase(matchingCaseId)
    } else {
      const { data: createdCase, error: caseError } = await supabase
        .from("valuation_cases")
        .insert(casePayload)
        .select("id")
        .single()

      if (caseError) throw caseError
      caseId = createdCase.id
    }
  }

  const persistedBlocks = await Promise.all(
    resolvedBlocks.map(async (resolvedBlock) => {
      const { block, result, appraisal, ageYears, cropAreaHa } = resolvedBlock
      const plantDistanceM = numberOrNull(block.plantDistanceM) ?? numberOrNull(result.profile.default_plant_distance_m)
      const rowDistanceM = numberOrNull(block.rowDistanceM) ?? numberOrNull(result.profile.default_row_distance_m)
      const plantingDensityPlantsHa =
        numberOrNull(block.plantingDensityPlantsHa) ?? numberOrNull(result.profile.default_density_plants_ha)
      const blockRawForm = { parcelData, block } as unknown as Json
      const { data: createdBlock, error: blockError } = await supabase
        .from("crop_blocks")
        .insert({
          valuation_case_id: caseId,
          block_label: block.blockLabel,
          crop_id: block.cropId,
          variety_id: block.varietyId,
          crop_type: textOrNull(block.cropType),
          production_system: textOrNull(block.productionSystem),
          age_years: String(ageYears),
          derived_stage_id: result.stageId,
          derived_stage_reason: result.stageReason,
          fitosanitary_condition: textOrNull(block.fitosanitaryCondition),
          fitosanitary_factor: blockFitosanitaryFactor(block),
          plant_distance_m: plantDistanceM,
          row_distance_m: rowDistanceM,
          planting_density_plants_ha: plantingDensityPlantsHa,
          crop_area_ha: String(cropAreaHa),
          fresh_yield_kg_ha: numberOrNull(block.freshYieldKgHa),
          water_availability: textOrNull(block.waterAvailability),
          rainfall_regime: textOrNull(block.rainfallRegime),
          annual_precipitation_mm: numberOrNull(block.annualPrecipitationMm),
          planting_frame: textOrNull(block.plantingFrame),
          land_rent_cop_ha_year: numberOrNull(block.landRentCopHaYear),
          jornal_cost_cop: numberOrNull(block.jornalCostCop),
          soil_value_cop_ha: numberOrNull(block.soilValueCopHa),
          commercial_price_cop_kg: numberOrNull(block.commercialPriceCopKg),
          notes: textOrNull(block.notes),
          raw_form: blockRawForm,
        })
        .select("id")
        .single()

      if (blockError) throw blockError

      const resolvedInserts = buildResolvedInsumoInserts(createdBlock.id, result.lines)
      if (resolvedInserts.length > 0) {
        const { error: linesError } = await supabase.from("resolved_insumo_lines").insert(resolvedInserts)
        if (linesError) throw linesError
      }

      const { data: createdAppraisal, error: appraisalError } = await supabase
        .from("crop_appraisal_results")
        .insert(buildCropAppraisalResultInsert(createdBlock.id, appraisal))
        .select("id")
        .single()

      if (appraisalError) throw appraisalError

      const flowInserts = buildCropAppraisalAnnualFlowInserts(createdAppraisal.id, createdBlock.id, appraisal.annualFlows)
      if (flowInserts.length > 0) {
        const { error: flowError } = await supabase.from("crop_appraisal_annual_flows").insert(flowInserts)
        if (flowError) throw flowError
      }

      return {
        cropBlockId: createdBlock.id,
        appraisalResultId: createdAppraisal.id,
        block,
        result,
        appraisal,
      }
    }),
  )

  return { caseId, persistedBlocks }
}

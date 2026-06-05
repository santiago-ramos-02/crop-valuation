"use client"

import { useMemo, useState } from "react"
import { PencilIcon } from "lucide-react"
import type { SupabaseClient } from "@supabase/supabase-js"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NumericInput } from "@/components/ui/numeric-input"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  buildCropAppraisalAnnualFlowInserts,
  buildCropAppraisalResultInsert,
  calculateCropAppraisal,
  recalculateCropAppraisalWithCostDeltas,
  type CalculatedCropAppraisal,
} from "@/lib/appraisal/calculate-crop-appraisal"
import {
  buildResolvedInsumoInserts,
  resolveInsumosWithContext,
  type ResolvedInsumo,
  type ResolvedInsumosResult,
} from "@/lib/insumos/resolve-insumos"
import { parseLocalizedNumberInput } from "@/lib/number-notation"
import { createClient } from "@/lib/supabase/client"
import type { Database, Json } from "@/types/database"
import type { BlockData } from "./block-entry-form"
import type { ParcelHeaderData } from "./parcel-header-form"

type MunicipioCropAvailability = Database["public"]["Tables"]["municipio_crop_availability"]["Row"]

export interface SavedBlockResolution {
  cropBlockId: string
  appraisalResultId: string
  block: BlockData
  result: ResolvedInsumosResult
  appraisal: CalculatedCropAppraisal
}

interface SaveValuationInput {
  supabase: SupabaseClient<Database>
  parcelData: ParcelHeaderData
  blockData: BlockData[]
  existingCaseId?: string
}

interface SaveValuationResult {
  caseId: string
  persistedBlocks: SavedBlockResolution[]
}

interface ValuationResultTablesProps {
  savedBlocks: SavedBlockResolution[]
}

interface ValidatedBlock {
  block: BlockData
  ageYears: number
  cropAreaHa: number
  commercialPriceCopKg: number
}

interface EditableUnitPriceCellProps {
  disabled: boolean
  isEditing: boolean
  isSaving: boolean
  value: number | null
  onCancel: () => void
  onCommit: (value: number) => void
  onStartEdit: () => void
}

type UnitPriceOverrides = Record<string, number>

const numberFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 })

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat("es-CO", {
  style: "percent",
  maximumFractionDigits: 1,
})

const unitPriceOverrideSource = "Precio ajustado por perito"

function unitPriceLineKey(cropBlockId: string, templateLineId: string) {
  return `${cropBlockId}:${templateLineId}`
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

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return ""
  return numberFormatter.format(value)
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "No disponible"
  return currencyFormatter.format(value)
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "No disponible"
  return percentFormatter.format(value)
}

function formatDisplayLabel(value: string | null | undefined) {
  if (!value) return ""
  const text = value.replaceAll('_', " ").trim().toLocaleLowerCase("es-CO")
  return text ? text.charAt(0).toLocaleUpperCase("es-CO") + text.slice(1) : ""
}

function metricValueClassName(value: number) {
  if (value > 0) return "text-emerald-700"
  if (value < 0) return "text-red-700"
  return "text-foreground"
}

function resolvedLineTotal(quantity: number | null, unitPriceCop: number | null) {
  return quantity !== null && unitPriceCop !== null ? quantity * unitPriceCop : null
}

function overrideLineUnitPrice(
  savedBlock: SavedBlockResolution,
  line: ResolvedInsumo,
  unitPriceCop: number,
): SavedBlockResolution {
  const nextTotalCop = resolvedLineTotal(line.quantity, unitPriceCop)
  const costDeltaCopHa = (nextTotalCop || 0) - (line.totalCop || 0)
  const nextLines = savedBlock.result.lines.map((candidate) =>
    candidate.templateLineId === line.templateLineId
      ? {
          ...candidate,
          unitPriceCop,
          unitPriceSource: unitPriceOverrideSource,
          totalCop: nextTotalCop,
        }
      : candidate,
  )

  return {
    ...savedBlock,
    result: {
      ...savedBlock.result,
      lines: nextLines,
      missingPriceCount: nextLines.filter((candidate) => candidate.unitPriceCop === null).length,
      totalCop: nextLines.reduce((sum, candidate) => sum + (candidate.totalCop || 0), 0),
    },
    appraisal: recalculateCropAppraisalWithCostDeltas(savedBlock.appraisal, {
      [line.stageId]: costDeltaCopHa,
    }),
  }
}

function applyUnitPriceOverrides(savedBlock: SavedBlockResolution, unitPriceOverrides: UnitPriceOverrides) {
  return savedBlock.result.lines.reduce((currentBlock, originalLine) => {
    const unitPriceCop = unitPriceOverrides[unitPriceLineKey(savedBlock.cropBlockId, originalLine.templateLineId)]
    if (unitPriceCop === undefined) return currentBlock

    const currentLine = currentBlock.result.lines.find((candidate) => candidate.templateLineId === originalLine.templateLineId)
    return currentLine ? overrideLineUnitPrice(currentBlock, currentLine, unitPriceCop) : currentBlock
  }, savedBlock)
}

async function persistUnitPriceOverride({
  line,
  savedBlock,
  supabase,
  unitPriceCop,
}: {
  line: ResolvedInsumo
  savedBlock: SavedBlockResolution
  supabase: SupabaseClient<Database>
  unitPriceCop: number
}) {
  const nextBlock = overrideLineUnitPrice(savedBlock, line, unitPriceCop)
  const nextLine = nextBlock.result.lines.find((candidate) => candidate.templateLineId === line.templateLineId)
  if (!nextLine) throw new Error("No se pudo encontrar el insumo actualizado.")

  const { error: lineError } = await supabase
    .from("resolved_insumo_lines")
    .update({
      unit_price_cop: nextLine.unitPriceCop,
      unit_price_source: unitPriceOverrideSource,
      total_cop: nextLine.totalCop,
      is_overridden: true,
      override_reason: "Precio unitario ajustado por perito",
    })
    .eq("crop_block_id", savedBlock.cropBlockId)
    .eq("template_line_id", line.templateLineId)

  if (lineError) throw lineError

  const { error: appraisalError } = await supabase
    .from("crop_appraisal_results")
    .update(buildCropAppraisalResultInsert(savedBlock.cropBlockId, nextBlock.appraisal))
    .eq("id", savedBlock.appraisalResultId)

  if (appraisalError) throw appraisalError

  const flowInserts = buildCropAppraisalAnnualFlowInserts(
    savedBlock.appraisalResultId,
    savedBlock.cropBlockId,
    nextBlock.appraisal.annualFlows,
  )

  if (flowInserts.length > 0) {
    const { error: flowsError } = await supabase
      .from("crop_appraisal_annual_flows")
      .upsert(flowInserts, { onConflict: "appraisal_result_id,line_order" })

    if (flowsError) throw flowsError
  }

  return nextBlock
}

function EditableUnitPriceCell({
  disabled,
  isEditing,
  isSaving,
  onCancel,
  onCommit,
  onStartEdit,
  value,
}: Readonly<EditableUnitPriceCellProps>) {
  const commitText = (text: string) => {
    const parsed = parseLocalizedNumberInput(text)
    if (parsed === null || parsed < 0) {
      onCancel()
      return
    }
    onCommit(parsed)
  }

  if (isEditing) {
    return (
      <NumericInput
        aria-label="Precio unitario"
        autoFocus
        className="ml-auto h-8 w-32 text-right"
        disabled={isSaving}
        value={value ?? ""}
        onBlur={(event) => commitText(event.currentTarget.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
          }
        }}
        onValueChange={() => undefined}
      />
    )
  }

  return (
    <button
      type="button"
      aria-label="Editar precio unitario"
      className="group/price ml-auto inline-flex items-center justify-end gap-1 text-right tabular-nums outline-none transition-opacity focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onStartEdit}
    >
      <span>{formatCurrency(value)}</span>
      <PencilIcon
        aria-hidden="true"
        className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover/price:opacity-55 group-focus-visible/price:opacity-70"
      />
    </button>
  )
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
    const landRentCopHaYear = optionalNumber(block.landRentCopHaYear)
    const soilValueCopHa = optionalNumber(block.soilValueCopHa)
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

  return { departamentoId, municipioId, discountRateMethod, discountRateEa, blocks }
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
  if (unavailableBlock) {
    throw new Error("El cultivo seleccionado no está disponible para el municipio del predio.")
  }
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
        jornalCostCop,
        landRentCopHaYear,
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
        discountRateMethod: validated.discountRateMethod,
        discountRateEa: validated.discountRateEa,
      })

      return { block, ageYears, cropAreaHa, result, appraisal }
    }),
  )

  const rawForm = { parcelData, blockData } as unknown as Json
  let caseId = existingCaseId || ""

  const casePayload = {
    user_id: userRes.user.id,
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

  if (existingCaseId) {
    const { error: caseError } = await supabase.from("valuation_cases").update(casePayload).eq("id", existingCaseId)
    if (caseError) throw caseError

    const { data: oldBlocks, error: oldBlocksError } = await supabase
      .from("crop_blocks")
      .select("id")
      .eq("valuation_case_id", existingCaseId)

    if (oldBlocksError) throw oldBlocksError

    const oldBlockIds = (oldBlocks || []).map((block) => block.id)
    if (oldBlockIds.length > 0) {
      const { error: linesDeleteError } = await supabase.from("resolved_insumo_lines").delete().in("crop_block_id", oldBlockIds)
      if (linesDeleteError) throw linesDeleteError
    }

    const { error: blocksDeleteError } = await supabase.from("crop_blocks").delete().eq("valuation_case_id", existingCaseId)
    if (blocksDeleteError) throw blocksDeleteError
  } else {
    const { data: createdCase, error: caseError } = await supabase
      .from("valuation_cases")
      .insert({
        user_id: userRes.user.id,
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
      })
      .select("id")
      .single()

    if (caseError) throw caseError
    caseId = createdCase.id
  }

  const persistedBlocks = await Promise.all(resolvedBlocks.map(async (resolvedBlock) => {
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
  }))

  return { caseId, persistedBlocks }
}

export function ValuationResultTables({ savedBlocks }: Readonly<ValuationResultTablesProps>) {
  const supabase = useMemo(() => createClient(), [])
  const [editingLineKey, setEditingLineKey] = useState<string | null>(null)
  const [savingLineKey, setSavingLineKey] = useState<string | null>(null)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [unitPriceOverrides, setUnitPriceOverrides] = useState<UnitPriceOverrides>({})

  if (savedBlocks.length === 0) return null

  const displayedBlocks = savedBlocks.map((savedBlock) => applyUnitPriceOverrides(savedBlock, unitPriceOverrides))

  const handleUnitPriceCommit = async (savedBlock: SavedBlockResolution, line: ResolvedInsumo, unitPriceCop: number) => {
    const lineKey = unitPriceLineKey(savedBlock.cropBlockId, line.templateLineId)
    const previousOverride = unitPriceOverrides[lineKey]
    setEditingLineKey(null)

    if (line.unitPriceCop !== null && Math.abs(line.unitPriceCop - unitPriceCop) < 0.000001) return

    setPriceError(null)
    setSavingLineKey(lineKey)
    setUnitPriceOverrides((current) => ({ ...current, [lineKey]: unitPriceCop }))

    try {
      await persistUnitPriceOverride({ line, savedBlock, supabase, unitPriceCop })
    } catch {
      setUnitPriceOverrides((current) => {
        const next = { ...current }
        if (previousOverride === undefined) {
          delete next[lineKey]
        } else {
          next[lineKey] = previousOverride
        }
        return next
      })
      setPriceError("No se pudo actualizar el precio unitario. Intente nuevamente.")
    } finally {
      setSavingLineKey(null)
    }
  }

  const totalAppraisedValue = displayedBlocks.reduce((sum, block) => sum + block.appraisal.appraisedValueCop, 0)
  const totalAreaHa = displayedBlocks.reduce((sum, block) => sum + block.appraisal.cropAreaHa, 0)
  const averageValueCopHa = totalAreaHa > 0 ? totalAppraisedValue / totalAreaHa : null
  const totalRevenueCop = displayedBlocks.reduce(
    (sum, block) => sum + block.appraisal.currentYearRevenueCopHa * block.appraisal.cropAreaHa,
    0,
  )
  const totalCostCop = displayedBlocks.reduce(
    (sum, block) => sum + block.appraisal.currentYearCostCopHa * block.appraisal.cropAreaHa,
    0,
  )
  const totalUtilityCop = displayedBlocks.reduce(
    (sum, block) => sum + block.appraisal.currentYearUtilityCopHa * block.appraisal.cropAreaHa,
    0,
  )
  const totalPendingRecoveryCop = displayedBlocks.reduce(
    (sum, block) => sum + block.appraisal.pendingRecoveryCopHa * block.appraisal.cropAreaHa,
    0,
  )
  const totalPlants = displayedBlocks.reduce((sum, block) => {
    const density = block.appraisal.densityPlantsHa
    return density && density > 0 ? sum + density * block.appraisal.cropAreaHa : sum
  }, 0)
  const averageValueCopPerPlant = totalPlants > 0 ? totalAppraisedValue / totalPlants : null
  const utilityMargin = totalRevenueCop > 0 ? totalUtilityCop / totalRevenueCop : null
  const highestValueBlock = displayedBlocks.reduce((highest, block) =>
    block.appraisal.appraisedValueCop > highest.appraisal.appraisedValueCop ? block : highest,
  )

  return (
    <div className="space-y-6">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Resumen del predio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">Avalúo final del predio</div>
                <div className="text-4xl font-semibold tracking-normal text-emerald-700">
                  {formatCurrency(totalAppraisedValue)}
                </div>
              </div>
              <dl className="grid gap-4 sm:grid-cols-3">
                <div className="border-l border-emerald-200 pl-4">
                  <dt className="text-xs text-muted-foreground">Área valorada</dt>
                  <dd className="text-lg font-semibold">{formatNumber(totalAreaHa)} ha</dd>
                </div>
                <div className="border-l border-emerald-200 pl-4">
                  <dt className="text-xs text-muted-foreground">Valor promedio por ha</dt>
                  <dd className="text-lg font-semibold">{formatCurrency(averageValueCopHa)}</dd>
                </div>
                <div className="border-l border-emerald-200 pl-4">
                  <dt className="text-xs text-muted-foreground">Cultivos/Lotes</dt>
                  <dd className="text-lg font-semibold">{displayedBlocks.length}</dd>
                </div>
              </dl>
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="border-l border-border pl-4">
                <dt className="text-xs text-muted-foreground">Ingreso año actual</dt>
                <dd className="text-base font-semibold">{formatCurrency(totalRevenueCop)}</dd>
              </div>
              <div className="border-l border-border pl-4">
                <dt className="text-xs text-muted-foreground">Costo año actual</dt>
                <dd className="text-base font-semibold">{formatCurrency(totalCostCop)}</dd>
              </div>
              <div className="border-l border-border pl-4">
                <dt className="text-xs text-muted-foreground">Utilidad año actual</dt>
                <dd className={`text-base font-semibold ${metricValueClassName(totalUtilityCop)}`}>
                  {formatCurrency(totalUtilityCop)}
                </dd>
              </div>
              <div className="border-l border-border pl-4">
                <dt className="text-xs text-muted-foreground">Margen de utilidad</dt>
                <dd className={`text-base font-semibold ${metricValueClassName(totalUtilityCop)}`}>
                  {formatPercent(utilityMargin)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="grid gap-4 border-t pt-5 text-sm md:grid-cols-3">
            <div>
              <span className="font-medium">Valor promedio por planta:</span> {formatCurrency(averageValueCopPerPlant)}
            </div>
            <div>
              <span className="font-medium">Pendiente por recuperar:</span> {formatCurrency(totalPendingRecoveryCop)}
            </div>
            <div>
              <span className="font-medium">Lote de mayor valor:</span> {highestValueBlock.block.blockLabel} ·{" "}
              {formatCurrency(highestValueBlock.appraisal.appraisedValueCop)}
            </div>
          </div>
        </CardContent>
      </Card>

      {priceError ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-800">{priceError}</CardContent>
        </Card>
      ) : null}

      {displayedBlocks.map((savedBlock) => {
        const { cropBlockId, block, result, appraisal } = savedBlock

        return (
          <Card key={cropBlockId}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{block.blockLabel}</CardTitle>
                  <CardDescription>Resultado del cultivo registrado</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Etapa: {result.stageName}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-md border bg-white px-4 py-3">
                  <div className="text-xs text-muted-foreground">Valor del cultivo</div>
                  <div className="text-lg font-semibold text-emerald-700">
                    {formatCurrency(appraisal.appraisedValueCop)}
                  </div>
                </div>
                <div className="rounded-md border bg-white px-4 py-3">
                  <div className="text-xs text-muted-foreground">Valor por hectárea</div>
                  <div className="text-lg font-semibold">{formatCurrency(appraisal.appraisedValueCopHa)}</div>
                </div>
                <div className="rounded-md border bg-white px-4 py-3">
                  <div className="text-xs text-muted-foreground">Valor por planta</div>
                  <div className="text-lg font-semibold">{formatCurrency(appraisal.appraisedValueCopPerPlant)}</div>
                </div>
                <div className="rounded-md border bg-white px-4 py-3">
                  <div className="text-xs text-muted-foreground">Área valorada</div>
                  <div className="text-lg font-semibold">{formatNumber(appraisal.cropAreaHa)} ha</div>
                </div>
              </div>

              <div className="grid gap-4 text-sm md:grid-cols-5">
                <div>
                  <span className="font-medium">Rendimiento del año:</span>{" "}
                  {formatNumber(appraisal.currentYearYieldKgHa)} kg/ha
                </div>
                <div>
                  <span className="font-medium">Ingreso del año:</span>{" "}
                  {formatCurrency(appraisal.currentYearRevenueCopHa)}
                </div>
                <div>
                  <span className="font-medium">Costo del año:</span> {formatCurrency(appraisal.currentYearCostCopHa)}
                </div>
                <div>
                  <span className="font-medium">Utilidad del año:</span>{" "}
                  {formatCurrency(appraisal.currentYearUtilityCopHa)}
                </div>
                <div>
                  <span className="font-medium">Pendiente por recuperar:</span>{" "}
                  {formatCurrency(appraisal.pendingRecoveryCopHa)}
                </div>
              </div>

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
                  {result.lines.map((line) => {
                    const lineKey = unitPriceLineKey(cropBlockId, line.templateLineId)

                    return (
                      <TableRow key={line.templateLineId}>
                        <TableCell>{line.rubroName}</TableCell>
                        <TableCell className="font-medium">{line.inputName}</TableCell>
                        <TableCell>{formatDisplayLabel(line.activityName)}</TableCell>
                        <TableCell>{line.presentation}</TableCell>
                        <TableCell className="text-right">{formatNumber(line.quantity)}</TableCell>
                        <TableCell className="text-right">
                          <EditableUnitPriceCell
                            disabled={savingLineKey !== null}
                            isEditing={editingLineKey === lineKey}
                            isSaving={savingLineKey === lineKey}
                            value={line.unitPriceCop}
                            onCancel={() => setEditingLineKey(null)}
                            onCommit={(value) => {
                              void handleUnitPriceCommit(savedBlock, line, value)
                            }}
                            onStartEdit={() => setEditingLineKey(lineKey)}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(line.totalCop)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={6}>Total</TableCell>
                    <TableCell className="text-right">{formatCurrency(result.totalCop)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

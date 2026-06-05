"use client"

import { useCallback, useMemo, useState } from "react"
import { SaveIcon } from "lucide-react"
import type { SupabaseClient } from "@supabase/supabase-js"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  buildCropAppraisalAnnualFlowInserts,
  buildCropAppraisalResultInsert,
  calculateCropAppraisal,
  type CalculatedCropAppraisal,
} from "@/lib/appraisal/calculate-crop-appraisal"
import { buildResolvedInsumoInserts, resolveInsumosWithContext, type ResolvedInsumosResult } from "@/lib/insumos/resolve-insumos"
import { parseLocalizedNumberInput } from "@/lib/number-notation"
import { createClient } from "@/lib/supabase/client"
import type { Database, Json } from "@/types/database"
import type { BlockData } from "./block-entry-form"
import type { ParcelHeaderData } from "./parcel-header-form"

interface ValuationCalculatorProps {
  parcelData: ParcelHeaderData
  blockData: BlockData[]
  existingCaseId?: string
  onSaved?: (caseId: string) => void
}

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

interface ValidatedBlock {
  block: BlockData
  ageYears: number
  cropAreaHa: number
  commercialPriceCopKg: number
}

const numberFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 })

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

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

function formatDisplayLabel(value: string | null | undefined) {
  if (!value) return ""
  const text = value.replaceAll('_', " ").trim().toLocaleLowerCase("es-CO")
  return text ? text.charAt(0).toLocaleUpperCase("es-CO") + text.slice(1) : ""
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

export async function saveValuation({
  supabase,
  parcelData,
  blockData,
  existingCaseId,
}: SaveValuationInput): Promise<SaveValuationResult> {
  const validated = validateInputs(parcelData, blockData)

  const { data: userRes, error: userError } = await supabase.auth.getUser()
  if (userError || !userRes.user) throw new Error("Debe iniciar sesión para guardar la valuación.")

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

export function ValuationResultTables({ savedBlocks }: Readonly<{ savedBlocks: SavedBlockResolution[] }>) {
  if (savedBlocks.length === 0) return null
  const totalAppraisedValue = savedBlocks.reduce((sum, block) => sum + block.appraisal.appraisedValueCop, 0)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Avalúo final del predio</CardTitle>
          <CardDescription>Valor consolidado de los cultivos registrados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold text-emerald-700">{formatCurrency(totalAppraisedValue)}</div>
        </CardContent>
      </Card>

      {savedBlocks.map(({ cropBlockId, block, result, appraisal }) => (
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
                <div className="text-lg font-semibold text-emerald-700">{formatCurrency(appraisal.appraisedValueCop)}</div>
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
                <span className="font-medium">Rendimiento del año:</span> {formatNumber(appraisal.currentYearYieldKgHa)} kg/ha
              </div>
              <div>
                <span className="font-medium">Ingreso del año:</span> {formatCurrency(appraisal.currentYearRevenueCopHa)}
              </div>
              <div>
                <span className="font-medium">Costo del año:</span> {formatCurrency(appraisal.currentYearCostCopHa)}
              </div>
              <div>
                <span className="font-medium">Utilidad del año:</span> {formatCurrency(appraisal.currentYearUtilityCopHa)}
              </div>
              <div>
                <span className="font-medium">Pendiente por recuperar:</span> {formatCurrency(appraisal.pendingRecoveryCopHa)}
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
                {result.lines.map((line) => (
                  <TableRow key={line.templateLineId}>
                    <TableCell>{line.rubroName}</TableCell>
                    <TableCell className="font-medium">{line.inputName}</TableCell>
                    <TableCell>{formatDisplayLabel(line.activityName)}</TableCell>
                    <TableCell>{line.presentation}</TableCell>
                    <TableCell className="text-right">{formatNumber(line.quantity)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(line.unitPriceCop)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(line.totalCop)}</TableCell>
                  </TableRow>
                ))}
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
      ))}
    </div>
  )
}

export function ValuationCalculator({ parcelData, blockData, existingCaseId, onSaved }: Readonly<ValuationCalculatorProps>) {
  const supabase = useMemo(() => createClient(), [])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedCaseId, setSavedCaseId] = useState<string | null>(null)
  const [savedBlocks, setSavedBlocks] = useState<SavedBlockResolution[]>([])

  const handleSubmit = useCallback(async () => {
    setError(null)
    setIsSaving(true)

    try {
      const result = await saveValuation({ supabase, parcelData, blockData, existingCaseId })
      setSavedCaseId(result.caseId)
      setSavedBlocks(result.persistedBlocks)
      onSaved?.(result.caseId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar la valuación.")
    } finally {
      setIsSaving(false)
    }
  }, [blockData, existingCaseId, onSaved, parcelData, supabase])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SaveIcon className="h-5 w-5 text-emerald-600" />
            Resultado de Valuación
          </CardTitle>
          <CardDescription>
            Guardar la valuación del predio {parcelData.parcelId} y presentar el avalúo final.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Predio:</span> {parcelData.parcelId}
            </div>
            {parcelData.totalParcelAreaHa ? (
              <div>
                <span className="font-medium">Área total:</span> {parcelData.totalParcelAreaHa} ha
              </div>
            ) : null}
            <div>
              <span className="font-medium">Cultivos/Lotes:</span> {blockData.length}
            </div>
            <div>
              <span className="font-medium">Fecha:</span> {parcelData.valuationAsOfDate}
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
          ) : null}

          <Button onClick={handleSubmit} disabled={isSaving || Boolean(savedCaseId)} className="w-full">
            {isSaving
              ? "Guardando..."
              : savedCaseId
                ? "Valuación guardada"
                : existingCaseId
                  ? "Actualizar y presentar resultado"
                  : "Guardar y presentar resultado"}
          </Button>
        </CardContent>
      </Card>

      <ValuationResultTables savedBlocks={savedBlocks} />
    </div>
  )
}

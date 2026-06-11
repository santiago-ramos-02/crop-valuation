"use client"

import { useMemo, useState } from "react"
import { PencilIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NumericInput } from "@/components/ui/numeric-input"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { projectedEquilibriumAgeYears } from "@/lib/appraisal/equilibrium-year"
import type { ResolvedInsumo } from "@/lib/insumos/resolve-insumos"
import { productionStageBadgeClassName } from "@/lib/insumos/stage"
import { parseLocalizedNumberInput } from "@/lib/number-notation"
import { createClient } from "@/lib/supabase/client"
import { normalizeBlockLabel } from "@/lib/valuation/form-data"
import type { SavedBlockResolution } from "@/lib/valuation/save-valuation"
import {
  applyUnitPriceOverrides,
  persistUnitPriceOverride,
  type UnitPriceOverrides,
  unitPriceLineKey,
} from "@/lib/valuation/unit-price-overrides"

interface ValuationResultTablesProps {
  savedBlocks: SavedBlockResolution[]
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

function formatEquilibriumYear(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "No disponible"
  return `Año ${formatNumber(value)}`
}

function displayBreakEvenAge(
  appraisal: SavedBlockResolution["appraisal"],
  referenceAgeYears?: string | number | null,
) {
  return projectedEquilibriumAgeYears({
    annualFlows: appraisal.annualFlows,
    breakEvenAgeYears: appraisal.breakEvenAgeYears,
    currentAgeYears: appraisal.currentAgeYears,
    currentYearUtilityCopHa: appraisal.currentYearUtilityCopHa,
    pendingRecoveryCopHa: appraisal.pendingRecoveryCopHa,
    referenceAgeYears,
  })
}

function formatDisplayLabel(value: string | null | undefined) {
  if (!value) return ""
  const text = value.replaceAll("_", " ").trim().toLocaleLowerCase("es-CO")
  return text ? text.charAt(0).toLocaleUpperCase("es-CO") + text.slice(1) : ""
}

function metricValueClassName(value: number) {
  if (value > 0) return "text-emerald-700"
  if (value < 0) return "text-red-700"
  return "text-foreground"
}

function hasPendingRecovery(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0
}

function appraisalBasisLabel(appraisalRule: SavedBlockResolution["appraisal"]["appraisalRule"]) {
  if (appraisalRule === "salvamento") return "Valor de salvamento"
  if (appraisalRule === "vegetative") return "Inversión acumulada"
  if (appraisalRule === "pre_equilibrium") return "Utilidad + pendiente"
  return "Utilidad del año"
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
    (sum, block) =>
      block.appraisal.stageId === "salvamento"
        ? sum
        : sum + block.appraisal.pendingRecoveryCopHa * block.appraisal.cropAreaHa,
    0,
  )
  const totalPlants = displayedBlocks.reduce((sum, block) => {
    const density = block.appraisal.densityPlantsHa
    return density && density > 0 ? sum + density * block.appraisal.cropAreaHa : sum
  }, 0)
  const averageValueCopPerPlant = totalPlants > 0 ? totalAppraisedValue / totalPlants : null
  const utilityMargin = totalRevenueCop > 0 ? totalUtilityCop / totalRevenueCop : null
  const hasTotalPendingRecovery = hasPendingRecovery(totalPendingRecoveryCop)

  return (
    <div className="space-y-6">
      <Card className="gap-3 py-5">
        <CardHeader>
          <CardTitle>Resumen del cultivo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid gap-5 sm:grid-cols-[minmax(220px,0.9fr)_minmax(0,1fr)]">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Avalúo final del cultivo</div>
                <div className="text-4xl font-semibold tracking-normal text-emerald-700">
                  {formatCurrency(totalAppraisedValue)}
                </div>
              </div>

              <dl className="grid gap-x-5 gap-y-3 border-t pt-4 sm:grid-cols-2 sm:border-t-0 sm:pt-0">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Área valorada</dt>
                  <dd className="text-base font-semibold">{formatNumber(totalAreaHa)} ha</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Valor promedio por ha</dt>
                  <dd className="text-base font-semibold">{formatCurrency(averageValueCopHa)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Promedio por planta</dt>
                  <dd className="text-base font-semibold">{formatCurrency(averageValueCopPerPlant)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Cultivos</dt>
                  <dd className="text-base font-semibold">{displayedBlocks.length}</dd>
                </div>
              </dl>
            </div>

            <div className="border-t pt-5 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
              <div className="mb-3 text-sm font-medium">Resultado económico</div>
              <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Ingreso año actual</dt>
                  <dd className="text-base font-semibold">{formatCurrency(totalRevenueCop)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Costo año actual</dt>
                  <dd className="text-base font-semibold">{formatCurrency(totalCostCop)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Utilidad año actual</dt>
                  <dd className={`text-base font-semibold ${metricValueClassName(totalUtilityCop)}`}>
                    {formatCurrency(totalUtilityCop)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Margen de utilidad</dt>
                  <dd className={`text-base font-semibold ${metricValueClassName(totalUtilityCop)}`}>
                    {formatPercent(utilityMargin)}
                  </dd>
                </div>
                {hasTotalPendingRecovery ? (
                  <div className="min-w-0 border-t border-amber-200 pt-3 sm:col-span-2 lg:col-span-4">
                    <dt className="text-xs text-muted-foreground">Pendiente total por recuperar</dt>
                    <dd className="text-base font-semibold text-amber-700">
                      {formatCurrency(totalPendingRecoveryCop)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        </CardContent>
      </Card>

      {priceError ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-800">{priceError}</CardContent>
        </Card>
      ) : null}

      {displayedBlocks.map((savedBlock, index) => {
        const { cropBlockId, block, result, appraisal } = savedBlock
        const isSalvage = appraisal.stageId === "salvamento"
        const hasBlockPendingRecovery = !isSalvage && hasPendingRecovery(appraisal.pendingRecoveryCopHa)
        const blockBreakEvenAge = hasBlockPendingRecovery
          ? displayBreakEvenAge(appraisal, result.profile.harvest_start_year)
          : null
        const blockContextMetrics = [
          isSalvage
            ? { label: "Etapa", value: "Salvamento" }
            : hasBlockPendingRecovery
            ? { label: "Pendiente por recuperar", value: formatCurrency(appraisal.pendingRecoveryCopHa) }
            : { label: "Situación financiera", value: "Inversión recuperada" },
          hasBlockPendingRecovery && blockBreakEvenAge !== null
            ? { label: "Año equilibrio", value: formatEquilibriumYear(blockBreakEvenAge) }
            : { label: "Base del avalúo", value: appraisalBasisLabel(appraisal.appraisalRule) },
        ]

        return (
          <Card key={cropBlockId}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{normalizeBlockLabel(block.blockLabel, index)}</CardTitle>
                  <CardDescription>Resultado del cultivo registrado</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={productionStageBadgeClassName(result.stageId)}>
                    Etapa: {result.stageName}
                  </Badge>
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

              <div className="grid gap-4 text-sm md:grid-cols-3 xl:grid-cols-6">
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
                {appraisal.currentYearSalvageCostCopHa > 0 ? (
                  <div>
                    <span className="font-medium">Costo de salvamento:</span>{" "}
                    {formatCurrency(appraisal.currentYearSalvageCostCopHa)}
                  </div>
                ) : null}
                <div>
                  <span className="font-medium">Utilidad del año:</span>{" "}
                  {formatCurrency(appraisal.currentYearUtilityCopHa)}
                </div>
                {blockContextMetrics.map((metric) => (
                  <div key={metric.label}>
                    <span className="font-medium">{metric.label}:</span> {metric.value}
                  </div>
                ))}
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

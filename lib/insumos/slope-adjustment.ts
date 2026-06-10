import type { Database, Json } from "@/types/database"

type CostTemplateLine = Database["public"]["Tables"]["cost_template_lines"]["Row"]

function sourceRowObject(value: Json | null) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  return value
}

function sourceNumber(value: Json | string | number | null | undefined) {
  if (typeof value !== "string" && typeof value !== "number") return null
  if (value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function slopeAdjustmentFactor(slopePercent: number | null | undefined) {
  if (slopePercent === null || slopePercent === undefined || !Number.isFinite(slopePercent)) return null
  if (slopePercent <= 7) return 1.1
  if (slopePercent <= 12) return 1.2
  if (slopePercent <= 25) return 1.3
  return 1.4
}

export function adjustedQuantityForSlope(
  line: Pick<CostTemplateLine, "quantity" | "source_row_data" | "unit_price_mode">,
  slopePercent: number | null | undefined,
) {
  const quantity = sourceNumber(line.quantity)
  if (line.unit_price_mode !== "jornal_lookup") return quantity

  const factor = slopeAdjustmentFactor(slopePercent)
  if (factor === null) return quantity

  const sourceRow = sourceRowObject(line.source_row_data)
  if (!sourceRow) return quantity

  const totalJornales = sourceNumber(sourceRow["TOTAL JORNALES AÑO"])
  if (totalJornales !== null) return totalJornales

  const baseCorrectionJornales = sourceNumber(sourceRow["jornal base correccion"])
  if (baseCorrectionJornales !== null) return Math.ceil(baseCorrectionJornales * factor)

  const frequency = sourceNumber(sourceRow["FRECUENCIA (REPETICIONES_AÑO)"])
  const referenceJornales = sourceNumber(sourceRow["JORNAL DE REFERENCIA"])
  if (frequency !== null && referenceJornales !== null) {
    return Math.ceil(frequency * referenceJornales * factor)
  }

  return quantity
}

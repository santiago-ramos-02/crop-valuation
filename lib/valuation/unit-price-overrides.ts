import type { SupabaseClient } from "@supabase/supabase-js"

import {
  buildCropAppraisalAnnualFlowInserts,
  buildCropAppraisalResultInsert,
  recalculateCropAppraisalWithCostDeltas,
} from "@/lib/appraisal/calculate-crop-appraisal"
import type { ResolvedInsumo } from "@/lib/insumos/resolve-insumos"
import type { SavedBlockResolution } from "@/lib/valuation/save-valuation"
import type { Database } from "@/types/database"

export type UnitPriceOverrides = Record<string, number>

const unitPriceOverrideSource = "Precio ajustado por perito"

export function unitPriceLineKey(cropBlockId: string, templateLineId: string) {
  return `${cropBlockId}:${templateLineId}`
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

export function applyUnitPriceOverrides(savedBlock: SavedBlockResolution, unitPriceOverrides: UnitPriceOverrides) {
  return savedBlock.result.lines.reduce((currentBlock, originalLine) => {
    const unitPriceCop = unitPriceOverrides[unitPriceLineKey(savedBlock.cropBlockId, originalLine.templateLineId)]
    if (unitPriceCop === undefined) return currentBlock

    const currentLine = currentBlock.result.lines.find((candidate) => candidate.templateLineId === originalLine.templateLineId)
    return currentLine ? overrideLineUnitPrice(currentBlock, currentLine, unitPriceCop) : currentBlock
  }, savedBlock)
}

export async function persistUnitPriceOverride({
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

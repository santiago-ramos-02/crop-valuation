export type ProductionStageId = "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"

export const PRODUCTION_STAGE_LABELS: Record<ProductionStageId, string> = {
  establecimiento: "Establecimiento",
  improductivo: "Improductivo",
  mantenimiento: "Mantenimiento",
  salvamento: "Salvamento",
}

export interface DeriveStageInput {
  ageYears: number
  harvestStartYear: number | null | undefined
  cropName?: string | null
  varietyName?: string | null
}

export interface DerivedStage {
  stageId: ProductionStageId
  stageName: string
  reason: string
}

export function deriveStage({
  ageYears,
  harvestStartYear,
  cropName,
  varietyName,
}: DeriveStageInput): DerivedStage {
  const cropVariety = [cropName, varietyName].filter(Boolean).join(" ").trim()
  const subject = cropVariety ? ` para ${cropVariety}` : ""

  if (!Number.isFinite(ageYears) || ageYears < 0) {
    throw new Error("La edad del cultivo debe ser un numero mayor o igual a cero.")
  }

  if (ageYears <= 1) {
    return {
      stageId: "establecimiento",
      stageName: PRODUCTION_STAGE_LABELS.establecimiento,
      reason: `edad ${ageYears} <= 1${subject}`,
    }
  }

  if (!harvestStartYear || !Number.isFinite(harvestStartYear) || harvestStartYear <= 0) {
    return {
      stageId: "mantenimiento",
      stageName: PRODUCTION_STAGE_LABELS.mantenimiento,
      reason: `edad ${ageYears} > 1 y no hay inicio de cosecha valido${subject}`,
    }
  }

  if (ageYears < harvestStartYear) {
    return {
      stageId: "improductivo",
      stageName: PRODUCTION_STAGE_LABELS.improductivo,
      reason: `edad ${ageYears} < inicio de cosecha ${harvestStartYear}${subject}`,
    }
  }

  return {
    stageId: "mantenimiento",
    stageName: PRODUCTION_STAGE_LABELS.mantenimiento,
    reason: `edad ${ageYears} >= inicio de cosecha ${harvestStartYear}${subject}`,
  }
}

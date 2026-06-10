export type ProductionStageId = "establecimiento" | "improductivo" | "mantenimiento" | "salvamento"

export const PRODUCTION_STAGE_LABELS: Record<ProductionStageId, string> = {
  establecimiento: "Establecimiento",
  improductivo: "Improductivo",
  mantenimiento: "Mantenimiento",
  salvamento: "Salvamento",
}

const PRODUCTION_STAGE_IDS: ProductionStageId[] = ["establecimiento", "improductivo", "mantenimiento", "salvamento"]

export const PRODUCTION_STAGE_BADGE_CLASS_NAMES: Record<ProductionStageId, string> = {
  establecimiento: "border-emerald-200 bg-emerald-50 text-emerald-700",
  improductivo: "border-amber-200 bg-amber-50 text-amber-700",
  mantenimiento: "border-sky-200 bg-sky-50 text-sky-700",
  salvamento: "border-red-200 bg-red-50 text-red-700",
}

export function isProductionStageId(stageId: string | null | undefined): stageId is ProductionStageId {
  return PRODUCTION_STAGE_IDS.some((candidate) => candidate === stageId)
}

export function productionStageBadgeClassName(stageId: string | null | undefined) {
  return isProductionStageId(stageId)
    ? PRODUCTION_STAGE_BADGE_CLASS_NAMES[stageId]
    : "border-border bg-muted text-muted-foreground"
}

export interface DeriveStageInput {
  ageYears: number
  harvestStartYear: number | null | undefined
  cropName?: string | null
  varietyName?: string | null
  fitosanitaryCondition?: string | null
  maxYieldCurveAgeYears?: number | null
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
  fitosanitaryCondition,
  maxYieldCurveAgeYears,
}: DeriveStageInput): DerivedStage {
  const cropVariety = [cropName, varietyName].filter(Boolean).join(" ").trim()
  const subject = cropVariety ? ` para ${cropVariety}` : ""

  if (!Number.isFinite(ageYears) || ageYears < 0) {
    throw new Error("La edad del cultivo debe ser un numero mayor o igual a cero.")
  }

  if (isPoorFitosanitaryCondition(fitosanitaryCondition)) {
    return {
      stageId: "salvamento",
      stageName: PRODUCTION_STAGE_LABELS.salvamento,
      reason: `condición fitosanitaria mala${subject}`,
    }
  }

  if (
    maxYieldCurveAgeYears !== null &&
    maxYieldCurveAgeYears !== undefined &&
    Number.isFinite(maxYieldCurveAgeYears) &&
    ageYears > maxYieldCurveAgeYears
  ) {
    return {
      stageId: "salvamento",
      stageName: PRODUCTION_STAGE_LABELS.salvamento,
      reason: `edad ${ageYears} supera la curva productiva hasta ${maxYieldCurveAgeYears} años${subject}`,
    }
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

export function isPoorFitosanitaryCondition(value: string | null | undefined) {
  const normalized = value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-CO")

  return normalized === "mala" || normalized === "malo"
}

export interface ParcelHeaderData {
  valuationAsOfDate: string
  parcelId: string
  departamentoId: string
  municipioId: string
  vereda: string
  latitude: string
  longitude: string
  climateType: string
  temperatureRange: string
  altitudeRange: string
  aptitudeUpraSipra: string
  slopePercent: string
  agrologicClass: string
  altitudeM: string
  totalParcelAreaHa: string
  discountRateMethod: string
  discountRateEa: string
}

export interface BlockData {
  blockLabel: string
  cropId: string
  varietyId: string
  cropType: string
  productionSystem: string
  ageYears: string
  fitosanitaryCondition: string
  fitosanitaryFactor: string
  plantDistanceM: string
  rowDistanceM: string
  plantingDensityPlantsHa: string
  cropAreaHa: string
  freshYieldKgHa: string
  waterAvailability: string
  rainfallRegime: string
  annualPrecipitationMm: string
  plantingFrame: string
  landRentCopHaYear: string
  jornalCostCop: string
  soilValueCopHa: string
  commercialPriceCopKg: string
  notes: string
}

export type ValuationStep = "parcel-form" | "block-form" | "calculation"

export const defaultDiscountRateMethod = "Finagro"
export const defaultDiscountRateEa = "0.08462342102763798"

function defaultBlockLabel(index = 0) {
  return `Cultivo ${index + 1}`
}

export function normalizeBlockLabel(value: string, index = 0) {
  const trimmed = value.trim()
  const legacyDefault = /^Lote\s+(\d+)$/i.exec(trimmed)
  if (legacyDefault) return `Cultivo ${legacyDefault[1]}`
  return trimmed || defaultBlockLabel(index)
}

export function createDefaultParcelHeaderData(): ParcelHeaderData {
  return {
    valuationAsOfDate: new Date().toISOString().slice(0, 10),
    parcelId: `VAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    departamentoId: "",
    municipioId: "",
    vereda: "",
    latitude: "",
    longitude: "",
    climateType: "",
    temperatureRange: "",
    altitudeRange: "",
    aptitudeUpraSipra: "",
    slopePercent: "",
    agrologicClass: "",
    altitudeM: "",
    totalParcelAreaHa: "",
    discountRateMethod: defaultDiscountRateMethod,
    discountRateEa: defaultDiscountRateEa,
  }
}

export function createEmptyBlock(index = 0): BlockData {
  return {
    blockLabel: defaultBlockLabel(index),
    cropId: "",
    varietyId: "",
    cropType: "",
    productionSystem: "",
    ageYears: "",
    fitosanitaryCondition: "",
    fitosanitaryFactor: "",
    plantDistanceM: "",
    rowDistanceM: "",
    plantingDensityPlantsHa: "",
    cropAreaHa: "",
    freshYieldKgHa: "",
    waterAvailability: "",
    rainfallRegime: "",
    annualPrecipitationMm: "",
    plantingFrame: "",
    landRentCopHaYear: "",
    jornalCostCop: "",
    soilValueCopHa: "",
    commercialPriceCopKg: "",
    notes: "",
  }
}

export const parcelFields = [
  "valuationAsOfDate",
  "parcelId",
  "departamentoId",
  "municipioId",
  "vereda",
  "latitude",
  "longitude",
  "climateType",
  "temperatureRange",
  "altitudeRange",
  "aptitudeUpraSipra",
  "slopePercent",
  "agrologicClass",
  "altitudeM",
  "totalParcelAreaHa",
  "discountRateMethod",
  "discountRateEa",
] satisfies Array<keyof ParcelHeaderData>

export const blockFields = [
  "blockLabel",
  "cropId",
  "varietyId",
  "cropType",
  "productionSystem",
  "ageYears",
  "fitosanitaryCondition",
  "fitosanitaryFactor",
  "plantDistanceM",
  "rowDistanceM",
  "plantingDensityPlantsHa",
  "cropAreaHa",
  "freshYieldKgHa",
  "waterAvailability",
  "rainfallRegime",
  "annualPrecipitationMm",
  "plantingFrame",
  "landRentCopHaYear",
  "jornalCostCop",
  "soilValueCopHa",
  "commercialPriceCopKg",
  "notes",
] satisfies Array<keyof BlockData>

export function isValuationStep(value: unknown): value is ValuationStep {
  return value === "parcel-form" || value === "block-form" || value === "calculation"
}

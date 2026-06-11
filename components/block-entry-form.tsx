"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { PlusIcon, SproutIcon, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { parseLocalizedNumberInput } from "@/lib/number-notation"
import { createClient } from "@/lib/supabase/client"
import {
  createEmptyBlock,
  defaultCropType,
  defaultProductionSystem,
  normalizeBlockLabel,
  type BlockData,
} from "@/lib/valuation/form-data"
import type { Database } from "@/types/database"

type Crop = Database["public"]["Tables"]["crops"]["Row"]
type Variety = Database["public"]["Tables"]["varieties"]["Row"]
type LookupOption = Database["public"]["Tables"]["lookup_options"]["Row"]
type AgronomicProfile = Database["public"]["Tables"]["crop_variety_agronomic_profiles"]["Row"]
type MunicipioCropAvailability = Database["public"]["Tables"]["municipio_crop_availability"]["Row"]

interface BlockEntryFormProps {
  blocks: BlockData[]
  onSubmit: (blocks: BlockData[]) => void
  onChange: (blocks: BlockData[]) => void
  isLoading?: boolean
  municipioId?: string
  totalParcelAreaHa?: number
  submitLabel?: string
}

type BlockErrors = Partial<Record<keyof BlockData, string>>

const numberFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 })

function optionGroups(options: LookupOption[]) {
  return options.reduce<Record<string, LookupOption[]>>((groups, option) => {
    groups[option.group_key] = groups[option.group_key] || []
    groups[option.group_key].push(option)
    return groups
  }, {})
}

function SelectField({
  id,
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
  required,
  invalid,
}: Readonly<{
  id: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder: string
  className?: string
  disabled?: boolean
  required?: boolean
  invalid?: boolean
}>) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        className={`w-full ${className || ""}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function toNumber(value: string) {
  return parseLocalizedNumberInput(value)
}

function hasPositiveValue(value: string) {
  const parsed = toNumber(value)
  return parsed !== null && parsed > 0
}

function valueText(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return ""
  return String(value)
}

function formatMeasurement(value: string | number | null | undefined, suffix = "") {
  const parsed = parseLocalizedNumberInput(value)
  if (parsed === null) return "No disponible"
  return `${numberFormatter.format(parsed)}${suffix}`
}

function normalizedOption(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-CO")
}

function densityFromSpacing(rowDistanceM: string, plantDistanceM: string, plantingFrame: string) {
  const rowDistance = toNumber(rowDistanceM)
  const plantDistance = toNumber(plantDistanceM)
  if (rowDistance === null || plantDistance === null || rowDistance <= 0 || plantDistance <= 0) return null

  const normalizedFrame = normalizedOption(plantingFrame)
  if (normalizedFrame === "tres bolillo") return Math.round(10000 / (rowDistance * plantDistance * 0.866))
  if (normalizedFrame === "cuadro") return Math.round(10000 / (rowDistance * plantDistance))
  return null
}

function fitosanitaryFactorFor(condition: string) {
  const normalized = condition.trim().toLocaleLowerCase("es-CO")
  if (normalized === "buena" || normalized === "bueno") return "0.95"
  if (normalized === "aceptable") return "0.7"
  if (normalized === "regular") return "0.475"
  if (normalized === "mala" || normalized === "malo") return "0.2"
  return ""
}

function availabilityKey(cropId: string, varietyId: string) {
  return `${cropId}:${varietyId}`
}

function nextBlockIndex(blocks: BlockData[]) {
  return blocks.reduce((nextIndex, block, index) => {
    const label = normalizeBlockLabel(block.blockLabel, index)
    const labelNumber = /^Cultivo\s+(\d+)$/i.exec(label)
    const currentIndex = labelNumber ? Number(labelNumber[1]) : index + 1
    return Math.max(nextIndex, currentIndex)
  }, 0)
}

export function BlockEntryForm({
  blocks,
  onSubmit,
  onChange,
  isLoading = false,
  municipioId = "",
  totalParcelAreaHa,
  submitLabel = "Guardar y presentar resultado",
}: Readonly<BlockEntryFormProps>) {
  const supabase = useMemo(() => createClient(), [])
  const [errors, setErrors] = useState<Record<number, BlockErrors>>({})
  const [crops, setCrops] = useState<Crop[]>([])
  const [varieties, setVarieties] = useState<Variety[]>([])
  const [lookupOptions, setLookupOptions] = useState<LookupOption[]>([])
  const [profiles, setProfiles] = useState<AgronomicProfile[]>([])
  const [availabilityRows, setAvailabilityRows] = useState<MunicipioCropAvailability[]>([])
  const [availabilityLoadedFor, setAvailabilityLoadedFor] = useState("")
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  useEffect(() => {
    async function loadCatalogs() {
      const [cropsRes, varietiesRes, lookupRes, profilesRes] = await Promise.all([
        supabase.from("crops").select("*").order("name").returns<Crop[]>(),
        supabase.from("varieties").select("*").order("name").returns<Variety[]>(),
        supabase
          .from("lookup_options")
          .select("*")
          .eq("active", true)
          .order("group_key")
          .order("line_order")
          .returns<LookupOption[]>(),
        supabase.from("crop_variety_agronomic_profiles").select("*").returns<AgronomicProfile[]>(),
      ])

      setCrops((cropsRes.data || []).filter((crop) => crop.active !== false))
      setVarieties((varietiesRes.data || []).filter((variety) => variety.active !== false))
      setLookupOptions(lookupRes.data || [])
      setProfiles(profilesRes.data || [])
    }

    loadCatalogs()
  }, [supabase])

  useEffect(() => {
    let isActive = true

    async function loadAvailability() {
      if (!municipioId) {
        setAvailabilityRows([])
        setAvailabilityLoadedFor("")
        setAvailabilityError(null)
        setIsAvailabilityLoading(false)
        return
      }

      setIsAvailabilityLoading(true)
      setAvailabilityError(null)
      try {
        const { data, error } = await supabase
          .from("municipio_crop_availability")
          .select("*")
          .eq("municipio_id", municipioId)
          .eq("active", true)
          .returns<MunicipioCropAvailability[]>()

        if (error) throw error
        if (isActive) {
          setAvailabilityRows(data || [])
          setAvailabilityLoadedFor(municipioId)
          setAvailabilityError(null)
        }
      } catch {
        if (isActive) {
          setAvailabilityRows([])
          setAvailabilityLoadedFor(municipioId)
          setAvailabilityError("No se pudieron cargar los cultivos disponibles para el municipio seleccionado.")
        }
      } finally {
        if (isActive) setIsAvailabilityLoading(false)
      }
    }

    loadAvailability()

    return () => {
      isActive = false
    }
  }, [municipioId, supabase])

  const optionsByGroup = useMemo(() => optionGroups(lookupOptions), [lookupOptions])
  const cropTypeOptions = (optionsByGroup.crop_type || []).map((option) => ({ value: option.value, label: option.label }))
  const productionSystemOptions = (optionsByGroup.production_system || []).map((option) => ({
    value: option.value,
    label: option.label,
  }))
  const displayedCropTypeOptions = cropTypeOptions.some((option) => option.value === defaultCropType)
    ? cropTypeOptions
    : [{ value: defaultCropType, label: defaultCropType }, ...cropTypeOptions]
  const displayedProductionSystemOptions = productionSystemOptions.some((option) => option.value === defaultProductionSystem)
    ? productionSystemOptions
    : [{ value: defaultProductionSystem, label: defaultProductionSystem }, ...productionSystemOptions]
  const currentAvailabilityRows = availabilityLoadedFor === municipioId ? availabilityRows : []
  const availableCropIds = new Set(currentAvailabilityRows.map((row) => row.crop_id))
  const availablePairKeys = new Set(currentAvailabilityRows.map((row) => availabilityKey(row.crop_id, row.variety_id)))
  const availableCrops = crops.filter((crop) => availableCropIds.has(crop.id))
  const totalBlockArea = blocks.reduce((sum, block) => sum + (toNumber(block.cropAreaHa) || 0), 0)
  const areaWarning =
    totalParcelAreaHa && totalBlockArea > totalParcelAreaHa
      ? `El área de cultivos (${totalBlockArea.toLocaleString("es-CO")} ha) supera el área total del predio.`
      : null

  const getProfile = (block: BlockData) =>
    profiles.find((profile) => profile.crop_id === block.cropId && profile.variety_id === block.varietyId) || null

  const applyProfileDefaults = (block: BlockData) => {
    const profile = profiles.find(
      (candidate) => candidate.crop_id === block.cropId && candidate.variety_id === block.varietyId,
    )
    if (!profile) return block

    return {
      ...block,
      rowDistanceM: block.rowDistanceM || valueText(profile.default_row_distance_m),
      plantDistanceM:
        block.plantDistanceM || valueText(profile.default_plant_distance_m),
      plantingDensityPlantsHa:
        block.plantingDensityPlantsHa || valueText(profile.default_density_plants_ha),
    }
  }

  const updateBlock = (index: number, field: keyof BlockData, value: string) => {
    const next = [...blocks]
    let updated = { ...next[index], [field]: value }

    if (field === "cropId") {
      updated = {
        ...updated,
        varietyId: "",
        rowDistanceM: "",
        plantDistanceM: "",
        plantingDensityPlantsHa: "",
      }
    }

    if (field === "varietyId") {
      updated = applyProfileDefaults(updated)
    }

    if (field === "fitosanitaryCondition") {
      updated.fitosanitaryFactor = fitosanitaryFactorFor(value)
    }

    next[index] = updated
    onChange(next)

    if (
      errors[index]?.[field] ||
      field === "landRentCopHaYear" ||
      field === "jornalCostCop" ||
      field === "soilValueCopHa"
    ) {
      setErrors((current) => {
        const next = { ...current }
        next[index] = { ...next[index], [field]: undefined }
        if (field === "landRentCopHaYear") next[index].soilValueCopHa = undefined
        if (field === "soilValueCopHa") next[index].landRentCopHaYear = undefined
        if (Object.values(next[index]).every((message) => !message)) delete next[index]
        return next
      })
    }
  }

  const addBlock = () => {
    onChange([...blocks, createEmptyBlock(nextBlockIndex(blocks))])
  }

  const removeBlock = (index: number) => {
    if (blocks.length <= 1) return
    onChange(blocks.filter((_, currentIndex) => currentIndex !== index))
    setErrors((current) => {
      const next: Record<number, BlockErrors> = {}
      Object.entries(current).forEach(([key, value]) => {
        const numericKey = Number(key)
        if (numericKey < index) next[numericKey] = value
        if (numericKey > index) next[numericKey - 1] = value
      })
      return next
    })
  }

  const validateBlocks = () => {
    const nextErrors: Record<number, BlockErrors> = {}

    blocks.forEach((block, index) => {
      const blockErrors: BlockErrors = {}
      const ageYears = block.ageYears.trim() ? toNumber(block.ageYears) : null
      const cropAreaHa = block.cropAreaHa ? toNumber(block.cropAreaHa) : null
      const commercialPriceCopKg = block.commercialPriceCopKg ? toNumber(block.commercialPriceCopKg) : null
      const landRentCopHaYear = block.landRentCopHaYear.trim() ? toNumber(block.landRentCopHaYear) : null
      const jornalCostCop = block.jornalCostCop.trim() ? toNumber(block.jornalCostCop) : null
      const soilValueCopHa = block.soilValueCopHa.trim() ? toNumber(block.soilValueCopHa) : null

      if (!block.blockLabel.trim()) blockErrors.blockLabel = "El nombre del cultivo es requerido"
      if (!municipioId) {
        blockErrors.cropId = "Seleccione un municipio para consultar cultivos disponibles"
      } else if (!block.cropId) {
        blockErrors.cropId = "El cultivo es requerido"
      }
      if (!block.varietyId) blockErrors.varietyId = "La variedad es requerida"
      if (!block.fitosanitaryCondition) blockErrors.fitosanitaryCondition = "La condición fitosanitaria es requerida"
      if (!block.ageYears.trim()) {
        blockErrors.ageYears = "La edad es requerida"
      } else if (ageYears === null || ageYears < 0) {
        blockErrors.ageYears = "La edad debe ser un número mayor o igual a cero"
      }
      if (!block.cropAreaHa) {
        blockErrors.cropAreaHa = "El área del cultivo es requerida"
      } else if (cropAreaHa === null || cropAreaHa <= 0) {
        blockErrors.cropAreaHa = "El área debe ser un número positivo"
      }
      if (!block.commercialPriceCopKg) {
        blockErrors.commercialPriceCopKg = "El precio de comercialización es requerido"
      } else if (commercialPriceCopKg === null || commercialPriceCopKg <= 0) {
        blockErrors.commercialPriceCopKg = "El precio debe ser un número positivo"
      }
      if (block.cropId && block.varietyId && !getProfile(block)) {
        blockErrors.varietyId = "La variedad seleccionada no está disponible para este cultivo"
      }
      if (block.cropId && block.varietyId && !availablePairKeys.has(availabilityKey(block.cropId, block.varietyId))) {
        blockErrors.cropId = "El cultivo seleccionado no está disponible para el municipio"
      }
      if (landRentCopHaYear !== null && landRentCopHaYear < 0) {
        blockErrors.landRentCopHaYear = "El costo de arriendo debe ser mayor o igual a cero"
      }
      if (jornalCostCop !== null && jornalCostCop < 0) {
        blockErrors.jornalCostCop = "El costo del jornal debe ser mayor o igual a cero"
      }
      if (soilValueCopHa !== null && soilValueCopHa < 0) {
        blockErrors.soilValueCopHa = "El valor del suelo debe ser mayor o igual a cero"
      }
      if ((landRentCopHaYear || 0) > 0 && (soilValueCopHa || 0) > 0) {
        const message = "Registre costo de arriendo o valor del suelo, no ambos"
        blockErrors.landRentCopHaYear = message
        blockErrors.soilValueCopHa = message
      }

      if (Object.keys(blockErrors).length > 0) nextErrors[index] = blockErrors
    })

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (validateBlocks()) onSubmit(blocks)
  }

  return (
    <div className="space-y-6">
      {areaWarning ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{areaWarning}</div>
      ) : null}
      {availabilityError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{availabilityError}</div>
      ) : null}
      {municipioId && !isAvailabilityLoading && !availabilityError && availableCrops.length === 0 ? (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          No hay cultivos disponibles para el municipio seleccionado.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {blocks.map((block, index) => {
          const availableVarietyIds = new Set<string>()
          for (const row of currentAvailabilityRows) {
            if (row.crop_id === block.cropId) availableVarietyIds.add(row.variety_id)
          }
          const filteredVarieties = varieties.filter(
            (variety) => variety.crop_id === block.cropId && availableVarietyIds.has(variety.id),
          )
          const profile = getProfile(block)
          const rowDistanceM = block.rowDistanceM || valueText(profile?.default_row_distance_m)
          const plantDistanceM = block.plantDistanceM || valueText(profile?.default_plant_distance_m)
          const plantingFrameDensity = densityFromSpacing(rowDistanceM, plantDistanceM, block.plantingFrame)
          const hasLandRent = hasPositiveValue(block.landRentCopHaYear)
          const hasSoilValue = hasPositiveValue(block.soilValueCopHa)
          const rentDisabled = hasSoilValue && !hasLandRent
          const soilDisabled = hasLandRent && !hasSoilValue
          const cropTitle = crops.find((crop) => crop.id === block.cropId)?.name || "Cultivo"
          const cropTypeValue = block.cropType || defaultCropType
          const productionSystemValue = block.productionSystem || defaultProductionSystem

          return (
            <Card key={normalizeBlockLabel(block.blockLabel, index)} className="w-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <SproutIcon className="h-5 w-5 text-emerald-600" />
                      {cropTitle}
                    </CardTitle>
                    <CardDescription>Datos del cultivo y condiciones del predio</CardDescription>
                  </div>
                  {blocks.length > 1 ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => removeBlock(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="font-medium">Datos generales del cultivo</h3>
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`crop-${index}`}>Cultivo *</Label>
                        <SelectField
                          id={`crop-${index}`}
                          value={block.cropId}
                          onChange={(value) => updateBlock(index, "cropId", value)}
                          className={errors[index]?.cropId ? "border-destructive" : ""}
                          required
                          invalid={Boolean(errors[index]?.cropId)}
                          placeholder={isAvailabilityLoading ? "Cargando cultivos" : "Seleccione cultivo"}
                          disabled={!municipioId || isAvailabilityLoading || availableCrops.length === 0}
                          options={availableCrops.map((crop) => ({ value: crop.id, label: crop.name }))}
                        />
                        {errors[index]?.cropId ? <p className="text-sm text-destructive">{errors[index]?.cropId}</p> : null}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`variety-${index}`}>Variedad *</Label>
                        <SelectField
                          id={`variety-${index}`}
                          value={block.varietyId}
                          onChange={(value) => updateBlock(index, "varietyId", value)}
                          className={errors[index]?.varietyId ? "border-destructive" : ""}
                          required
                          invalid={Boolean(errors[index]?.varietyId)}
                          placeholder="Seleccione variedad"
                          disabled={!block.cropId || isAvailabilityLoading}
                          options={filteredVarieties.map((variety) => ({ value: variety.id, label: variety.name }))}
                        />
                        {errors[index]?.varietyId ? (
                          <p className="text-sm text-destructive">{errors[index]?.varietyId}</p>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`cropType-${index}`}>Tipo de Cultivo</Label>
                        <SelectField
                          id={`cropType-${index}`}
                          value={cropTypeValue}
                          onChange={(value) => updateBlock(index, "cropType", value)}
                          placeholder="Seleccione tipo"
                          disabled
                          options={displayedCropTypeOptions}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`productionSystem-${index}`}>Sistema Productivo</Label>
                        <SelectField
                          id={`productionSystem-${index}`}
                          value={productionSystemValue}
                          onChange={(value) => updateBlock(index, "productionSystem", value)}
                          placeholder="Seleccione sistema"
                          disabled
                          options={displayedProductionSystemOptions}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`fitosanitary-${index}`}>Condición Fitosanitaria *</Label>
                        <SelectField
                          id={`fitosanitary-${index}`}
                          value={block.fitosanitaryCondition}
                          onChange={(value) => updateBlock(index, "fitosanitaryCondition", value)}
                          className={errors[index]?.fitosanitaryCondition ? "border-destructive" : ""}
                          required
                          invalid={Boolean(errors[index]?.fitosanitaryCondition)}
                          placeholder="Seleccione condición"
                          options={(optionsByGroup.fitosanitary_condition || []).map((option) => ({
                            value: option.value,
                            label: option.label,
                          }))}
                        />
                        {errors[index]?.fitosanitaryCondition ? (
                          <p className="text-sm text-destructive">{errors[index]?.fitosanitaryCondition}</p>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`plantingFrame-${index}`}>Marco de Plantación</Label>
                        <SelectField
                          id={`plantingFrame-${index}`}
                          value={block.plantingFrame}
                          onChange={(value) => updateBlock(index, "plantingFrame", value)}
                          placeholder="Seleccione marco"
                          options={(optionsByGroup.planting_frame || []).map((option) => ({
                            value: option.value,
                            label: option.label,
                          }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-muted-foreground">Medidas y producción</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`ageYears-${index}`}>Edad (años) *</Label>
                          <NumericInput
                            id={`ageYears-${index}`}
                            placeholder="1"
                            required
                            aria-invalid={Boolean(errors[index]?.ageYears)}
                            value={block.ageYears}
                            onValueChange={(value) => updateBlock(index, "ageYears", value)}
                            className={errors[index]?.ageYears ? "border-destructive" : ""}
                          />
                          {errors[index]?.ageYears ? <p className="text-sm text-destructive">{errors[index]?.ageYears}</p> : null}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`cropArea-${index}`}>Área del Cultivo (ha) *</Label>
                          <NumericInput
                            id={`cropArea-${index}`}
                            required
                            placeholder="1"
                            aria-invalid={Boolean(errors[index]?.cropAreaHa)}
                            value={block.cropAreaHa}
                            onValueChange={(value) => updateBlock(index, "cropAreaHa", value)}
                            className={errors[index]?.cropAreaHa ? "border-destructive" : ""}
                          />
                          {errors[index]?.cropAreaHa ? (
                            <p className="text-sm text-destructive">{errors[index]?.cropAreaHa}</p>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`freshYield-${index}`}>Rendimiento en Fresco (kg/ha)</Label>
                          <NumericInput
                            id={`freshYield-${index}`}
                            placeholder="1.000"
                            value={block.freshYieldKgHa}
                            onValueChange={(value) => updateBlock(index, "freshYieldKgHa", value)}
                          />
                        </div>

                        <div className="space-y-3 rounded-md border bg-muted/30 p-4 sm:col-span-2 lg:col-span-3">
                          <div>
                            <div className="text-sm font-medium">Medidas de referencia</div>
                            <div className="text-xs text-muted-foreground">Según cultivo y variedad seleccionados</div>
                          </div>
                          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                            <div>
                              <dt className="text-muted-foreground">Distancia entre plantas</dt>
                              <dd className="font-medium">{formatMeasurement(plantDistanceM, " m")}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Distancia entre surcos</dt>
                              <dd className="font-medium">{formatMeasurement(rowDistanceM, " m")}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Densidad de siembra</dt>
                              <dd className="font-medium">
                                {plantingFrameDensity === null
                                  ? "Seleccione marco de plantación"
                                  : formatMeasurement(plantingFrameDensity, " plantas/ha")}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-medium">Condiciones del predio</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`water-${index}`}>Disponibilidad de Agua</Label>
                      <SelectField
                        id={`water-${index}`}
                        value={block.waterAvailability}
                        onChange={(value) => updateBlock(index, "waterAvailability", value)}
                        placeholder="Seleccione disponibilidad"
                        options={(optionsByGroup.water_availability || []).map((option) => ({
                          value: option.value,
                          label: option.label,
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`rainfallRegime-${index}`}>Régimen de Lluvias</Label>
                      <SelectField
                        id={`rainfallRegime-${index}`}
                        value={block.rainfallRegime}
                        onChange={(value) => updateBlock(index, "rainfallRegime", value)}
                        placeholder="Seleccione régimen"
                        options={(optionsByGroup.rainfall_regime || []).map((option) => ({
                          value: option.value,
                          label: option.label,
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`precipitation-${index}`}>Precipitación Anual (mm/año)</Label>
                      <NumericInput
                        id={`precipitation-${index}`}
                        placeholder="1.000"
                        value={block.annualPrecipitationMm}
                        onValueChange={(value) => updateBlock(index, "annualPrecipitationMm", value)}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-medium">Información económica</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`landRent-${index}`}>Costo de Arriendo (COP/ha/año)</Label>
                      <NumericInput
                        id={`landRent-${index}`}
                        placeholder="100.000"
                        disabled={rentDisabled}
                        aria-invalid={Boolean(errors[index]?.landRentCopHaYear)}
                        value={block.landRentCopHaYear}
                        onValueChange={(value) => updateBlock(index, "landRentCopHaYear", value)}
                        className={errors[index]?.landRentCopHaYear ? "border-destructive" : ""}
                      />
                      {errors[index]?.landRentCopHaYear ? (
                        <p className="text-sm text-destructive">{errors[index]?.landRentCopHaYear}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {rentDisabled
                            ? "Quite el valor del suelo para registrar arriendo."
                            : "Registre arriendo o valor del suelo, no ambos."}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`jornal-${index}`}>Costo del Jornal (COP/jornal)</Label>
                      <NumericInput
                        id={`jornal-${index}`}
                        placeholder="50.000"
                        aria-invalid={Boolean(errors[index]?.jornalCostCop)}
                        value={block.jornalCostCop}
                        onValueChange={(value) => updateBlock(index, "jornalCostCop", value)}
                        className={errors[index]?.jornalCostCop ? "border-destructive" : ""}
                      />
                      {errors[index]?.jornalCostCop ? (
                        <p className="text-sm text-destructive">{errors[index]?.jornalCostCop}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Reemplaza el precio unitario de las labores en jornal.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`soilValue-${index}`}>Valor del Suelo (COP/ha)</Label>
                      <NumericInput
                        id={`soilValue-${index}`}
                        placeholder="10.000.000"
                        disabled={soilDisabled}
                        aria-invalid={Boolean(errors[index]?.soilValueCopHa)}
                        value={block.soilValueCopHa}
                        onValueChange={(value) => updateBlock(index, "soilValueCopHa", value)}
                        className={errors[index]?.soilValueCopHa ? "border-destructive" : ""}
                      />
                      {errors[index]?.soilValueCopHa ? (
                        <p className="text-sm text-destructive">{errors[index]?.soilValueCopHa}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {soilDisabled
                            ? "Quite el costo de arriendo para registrar valor del suelo."
                            : "Registre arriendo o valor del suelo, no ambos."}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`commercialPrice-${index}`}>Precio de Comercialización (COP/kg) *</Label>
                      <NumericInput
                        id={`commercialPrice-${index}`}
                        required
                        aria-invalid={Boolean(errors[index]?.commercialPriceCopKg)}
                        placeholder="1.000"
                        value={block.commercialPriceCopKg}
                        onValueChange={(value) => updateBlock(index, "commercialPriceCopKg", value)}
                        className={errors[index]?.commercialPriceCopKg ? "border-destructive" : ""}
                      />
                      {errors[index]?.commercialPriceCopKg ? (
                        <p className="text-sm text-destructive">{errors[index]?.commercialPriceCopKg}</p>
                      ) : null }
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={addBlock} className="flex w-full items-center gap-2 bg-transparent sm:w-auto">
            <PlusIcon className="h-4 w-4" />
            Agregar Cultivo
          </Button>

          <Button type="submit" disabled={isLoading || isAvailabilityLoading} className="w-full sm:w-auto sm:min-w-32">
            {isAvailabilityLoading ? "Cargando cultivos..." : isLoading ? "Guardando..." : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  )
}

"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { parseLocalizedNumberInput } from "@/lib/number-notation"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/types/database"

type Departamento = Database["public"]["Tables"]["departamentos"]["Row"]
type Municipio = Database["public"]["Tables"]["municipios"]["Row"]
type LookupOption = Database["public"]["Tables"]["lookup_options"]["Row"]

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

interface ParcelHeaderFormProps {
  onSubmit: (data: ParcelHeaderData) => void
  onChange?: (data: ParcelHeaderData) => void
  initialData?: Partial<ParcelHeaderData>
  isLoading?: boolean
}

const today = () => new Date().toISOString().slice(0, 10)
const defaultParcelId = () => `VAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`
const defaultDiscountRateMethod = "Finagro"
const defaultDiscountRateEa = "0.08462342102763798"

function optionGroups(options: LookupOption[]) {
  return options.reduce<Record<string, LookupOption[]>>((groups, option) => {
    groups[option.group_key] = groups[option.group_key] || []
    groups[option.group_key].push(option)
    return groups
  }, {})
}

function metadataText(option: LookupOption | undefined, key: string) {
  const metadata = option?.metadata
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return ""
  const value = metadata[key]
  return typeof value === "string" || typeof value === "number" ? String(value) : ""
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

export function ParcelHeaderForm({ onSubmit, onChange, initialData, isLoading = false }: Readonly<ParcelHeaderFormProps>) {
  const supabase = useMemo(() => createClient(), [])
  const [departamentos, setDepartamentos] = useState<Departamento[]>([])
  const [municipios, setMunicipios] = useState<Municipio[]>([])
  const [lookupOptions, setLookupOptions] = useState<LookupOption[]>([])
  const [errors, setErrors] = useState<Partial<Record<keyof ParcelHeaderData, string>>>({})

  const [formData, setFormData] = useState<ParcelHeaderData>({
    valuationAsOfDate: initialData?.valuationAsOfDate || today(),
    parcelId: initialData?.parcelId || defaultParcelId(),
    departamentoId: initialData?.departamentoId || "",
    municipioId: initialData?.municipioId || "",
    vereda: initialData?.vereda || "",
    latitude: initialData?.latitude || "",
    longitude: initialData?.longitude || "",
    climateType: initialData?.climateType || "",
    temperatureRange: initialData?.temperatureRange || "",
    altitudeRange: initialData?.altitudeRange || "",
    aptitudeUpraSipra: initialData?.aptitudeUpraSipra || "",
    slopePercent: initialData?.slopePercent || "",
    agrologicClass: initialData?.agrologicClass || "",
    altitudeM: initialData?.altitudeM || "",
    totalParcelAreaHa: initialData?.totalParcelAreaHa || "",
    discountRateMethod: initialData?.discountRateMethod || defaultDiscountRateMethod,
    discountRateEa: initialData?.discountRateEa || defaultDiscountRateEa,
  })

  useEffect(() => {
    async function loadCatalogs() {
      const [departamentosRes, municipiosRes, lookupRes] = await Promise.all([
        supabase.from("departamentos").select("*").order("name").returns<Departamento[]>(),
        supabase.from("municipios").select("*").order("name").returns<Municipio[]>(),
        supabase
          .from("lookup_options")
          .select("*")
          .eq("active", true)
          .order("group_key")
          .order("line_order")
          .returns<LookupOption[]>(),
      ])

      setDepartamentos((departamentosRes.data || []).filter((departamento) => departamento.active !== false))
      setMunicipios((municipiosRes.data || []).filter((municipio) => municipio.active !== false))
      setLookupOptions(lookupRes.data || [])
    }

    loadCatalogs()
  }, [supabase])

  useEffect(() => {
    onChange?.(formData)
  }, [formData, onChange])

  const filteredMunicipios = useMemo(
    () => municipios.filter((municipio) => municipio.departamento_id === formData.departamentoId),
    [formData.departamentoId, municipios],
  )

  const optionsByGroup = useMemo(() => optionGroups(lookupOptions), [lookupOptions])

  const handleInputChange = (field: keyof ParcelHeaderData, value: string) => {
    setFormData((current) => {
      const next = { ...current, [field]: value }
      if (field === "departamentoId") {
        next.municipioId = ""
        next.vereda = ""
        next.latitude = ""
        next.longitude = ""
      }
      if (field === "municipioId") {
        const selectedMunicipio = municipios.find((municipio) => municipio.id === value)
        next.latitude = selectedMunicipio?.latitude ? String(selectedMunicipio.latitude) : ""
        next.longitude = selectedMunicipio?.longitude ? String(selectedMunicipio.longitude) : ""
      }
      if (field === "climateType") {
        const selectedClimate = lookupOptions.find((option) => option.group_key === "climate_type" && option.value === value)
        next.temperatureRange = metadataText(selectedClimate, "temperature_range")
        next.altitudeRange = metadataText(selectedClimate, "altitude_range")
      }
      if (field === "discountRateMethod") {
        const selectedRate = lookupOptions.find((option) => option.group_key === "discount_rate_method" && option.value === value)
        next.discountRateEa = metadataText(selectedRate, "rate_ea") || next.discountRateEa
      }
      return next
    })

    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }))
    }
  }

  const validateForm = () => {
    const nextErrors: Partial<Record<keyof ParcelHeaderData, string>> = {}

    if (!formData.valuationAsOfDate) nextErrors.valuationAsOfDate = "La fecha de valoración es requerida"
    if (!formData.parcelId.trim()) nextErrors.parcelId = "El identificador del predio es requerido"
    if (!formData.departamentoId) nextErrors.departamentoId = "El departamento es requerido"
    if (!formData.municipioId) nextErrors.municipioId = "El municipio es requerido"

    if (formData.totalParcelAreaHa) {
      const area = parseLocalizedNumberInput(formData.totalParcelAreaHa)
      if (area === null || area <= 0) nextErrors.totalParcelAreaHa = "El área debe ser un número positivo"
    }
    if (!formData.discountRateMethod) nextErrors.discountRateMethod = "El método de tasa es requerido"
    if (!formData.discountRateEa.trim()) {
      nextErrors.discountRateEa = "La tasa de descuento es requerida"
    } else {
      const rate = parseLocalizedNumberInput(formData.discountRateEa)
      if (rate === null || rate < 0) nextErrors.discountRateEa = "La tasa debe ser un número mayor o igual a cero"
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (validateForm()) onSubmit(formData)
  }

  const handleClear = () => {
    setFormData({
      valuationAsOfDate: today(),
      parcelId: defaultParcelId(),
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
    })
    setErrors({})
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold text-balance">Información del Predio</CardTitle>
        <CardDescription className="text-pretty">
          Ingrese la ubicación y características agrológicas del predio
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div className="space-y-4">
            <h3 className="font-medium">Datos generales</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="departamento">Departamento *</Label>
                <SelectField
                  id="departamento"
                  value={formData.departamentoId}
                  onChange={(value) => handleInputChange("departamentoId", value)}
                  className={errors.departamentoId ? "border-destructive" : ""}
                  required
                  invalid={Boolean(errors.departamentoId)}
                  placeholder="Seleccione departamento"
                  options={departamentos.map((departamento) => ({ value: departamento.id, label: departamento.name }))}
                />
                {errors.departamentoId ? <p className="text-sm text-destructive">{errors.departamentoId}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="municipio">Municipio *</Label>
                <SelectField
                  id="municipio"
                  value={formData.municipioId}
                  onChange={(value) => handleInputChange("municipioId", value)}
                  className={errors.municipioId ? "border-destructive" : ""}
                  required
                  invalid={Boolean(errors.municipioId)}
                  placeholder="Seleccione municipio"
                  disabled={!formData.departamentoId}
                  options={filteredMunicipios.map((municipio) => ({ value: municipio.id, label: municipio.name }))}
                />
                {errors.municipioId ? <p className="text-sm text-destructive">{errors.municipioId}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="vereda">Vereda</Label>
                <Input
                  id="vereda"
                  placeholder="Vereda"
                  value={formData.vereda}
                  onChange={(event) => handleInputChange("vereda", event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">Características agrológicas</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="climateType">Tipo de Clima</Label>
                <SelectField
                  id="climateType"
                  value={formData.climateType}
                  onChange={(value) => handleInputChange("climateType", value)}
                  placeholder="Seleccione tipo de clima"
                  options={(optionsByGroup.climate_type || []).map((option) => ({ value: option.value, label: option.label }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="aptitude">Aptitud UPRA/SIPRA</Label>
                <Input
                  id="aptitude"
                  placeholder="Aptitud"
                  value={formData.aptitudeUpraSipra}
                  onChange={(event) => handleInputChange("aptitudeUpraSipra", event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slope">Pendiente del Predio (%)</Label>
                <NumericInput
                  id="slope"
                  placeholder="7"
                  value={formData.slopePercent}
                  onValueChange={(value) => handleInputChange("slopePercent", value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agrologicClass">Clase Agrológica</Label>
                <SelectField
                  id="agrologicClass"
                  value={formData.agrologicClass}
                  onChange={(value) => handleInputChange("agrologicClass", value)}
                  placeholder="Seleccione clase"
                  options={(optionsByGroup.agrologic_class || []).map((option) => ({ value: option.value, label: option.label }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="altitudeM">Altitud (msnm)</Label>
                <NumericInput
                  id="altitudeM"
                  placeholder="1.200"
                  value={formData.altitudeM}
                  onValueChange={(value) => handleInputChange("altitudeM", value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountRateMethod">Método de tasa de descuento *</Label>
                <SelectField
                  id="discountRateMethod"
                  value={formData.discountRateMethod}
                  onChange={(value) => handleInputChange("discountRateMethod", value)}
                  className={errors.discountRateMethod ? "border-destructive" : ""}
                  required
                  invalid={Boolean(errors.discountRateMethod)}
                  placeholder="Seleccione método"
                  options={(optionsByGroup.discount_rate_method || []).map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
                {errors.discountRateMethod ? <p className="text-sm text-destructive">{errors.discountRateMethod}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountRateEa">Tasa de descuento (EA, decimal) *</Label>
                <NumericInput
                  id="discountRateEa"
                  placeholder="0,08462342"
                  required
                  aria-invalid={Boolean(errors.discountRateEa)}
                  value={formData.discountRateEa}
                  onValueChange={(value) => handleInputChange("discountRateEa", value)}
                  className={errors.discountRateEa ? "border-destructive" : ""}
                />
                {errors.discountRateEa ? (
                  <p className="text-sm text-destructive">{errors.discountRateEa}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Ej.: 0.0846 equivale a 8,46 % EA.</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button type="button" variant="outline" onClick={handleClear}>
              Limpiar Formulario
            </Button>
            <Button type="submit" disabled={isLoading} className="min-w-32">
              {isLoading ? "Guardando..." : "Continuar a Cultivos/Lotes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

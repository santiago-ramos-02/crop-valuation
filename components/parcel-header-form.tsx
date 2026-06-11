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
import {
  createDefaultParcelHeaderData,
  defaultDiscountRateEa,
  type ParcelHeaderData,
} from "@/lib/valuation/form-data"
import type { Database } from "@/types/database"

type Departamento = Database["public"]["Tables"]["departamentos"]["Row"]
type Municipio = Database["public"]["Tables"]["municipios"]["Row"]
type LookupOption = Database["public"]["Tables"]["lookup_options"]["Row"]

interface ParcelHeaderFormProps {
  onSubmit: (data: ParcelHeaderData) => void
  onChange: (data: ParcelHeaderData) => void
  value: ParcelHeaderData
  isLoading?: boolean
}

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

const roundedPercentFormatter = new Intl.NumberFormat("es-CO", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatRoundedDiscountRate(value: string) {
  const parsed = parseLocalizedNumberInput(value)
  if (parsed === null) return ""
  return roundedPercentFormatter.format(parsed)
}

function SelectField({
  id,
  value,
  onChange,
  options,
  placeholder,
  className,
  describedBy,
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
  describedBy?: string
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
        aria-describedby={describedBy}
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

export function ParcelHeaderForm({ onSubmit, onChange, value: formData, isLoading = false }: Readonly<ParcelHeaderFormProps>) {
  const supabase = useMemo(() => createClient(), [])
  const [departamentos, setDepartamentos] = useState<Departamento[]>([])
  const [municipios, setMunicipios] = useState<Municipio[]>([])
  const [lookupOptions, setLookupOptions] = useState<LookupOption[]>([])
  const [errors, setErrors] = useState<Partial<Record<keyof ParcelHeaderData, string>>>({})

  useEffect(() => {
    async function loadCatalogs() {
      const [departamentosRes, lookupRes] = await Promise.all([
        supabase.from("departamentos").select("*").order("name").returns<Departamento[]>(),
        supabase
          .from("lookup_options")
          .select("*")
          .eq("active", true)
          .order("group_key")
          .order("line_order")
          .returns<LookupOption[]>(),
      ])

      setDepartamentos((departamentosRes.data || []).filter((departamento) => departamento.active !== false))
      setLookupOptions(lookupRes.data || [])
    }

    loadCatalogs()
  }, [supabase])

  useEffect(() => {
    async function loadMunicipios() {
      if (!formData.departamentoId) {
        setMunicipios([])
        return
      }

      const { data } = await supabase
        .from("municipios")
        .select("*")
        .eq("departamento_id", formData.departamentoId)
        .order("name")
        .returns<Municipio[]>()

      setMunicipios((data || []).filter((municipio) => municipio.active !== false))
    }

    loadMunicipios()
  }, [formData.departamentoId, supabase])

  const filteredMunicipios = useMemo(
    () => municipios.filter((municipio) => municipio.departamento_id === formData.departamentoId),
    [formData.departamentoId, municipios],
  )

  const optionsByGroup = useMemo(() => optionGroups(lookupOptions), [lookupOptions])
  const discountRateDescription = formatRoundedDiscountRate(formData.discountRateEa)

  const handleInputChange = (field: keyof ParcelHeaderData, value: string) => {
    const next = { ...formData, [field]: value }
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
      next.discountRateEa = metadataText(selectedRate, "rate_ea") || defaultDiscountRateEa
    }
    onChange(next)

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

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (validateForm()) onSubmit({ ...formData, discountRateEa: formData.discountRateEa.trim() || defaultDiscountRateEa })
  }

  const handleClear = () => {
    onChange(createDefaultParcelHeaderData())
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
                <Label htmlFor="slope">Pendiente del Predio (%)</Label>
                <NumericInput
                  id="slope"
                  placeholder="10"
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
                  placeholder="1.000"
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
                  describedBy={discountRateDescription ? "discountRateDescription" : undefined}
                  required
                  invalid={Boolean(errors.discountRateMethod)}
                  placeholder="Seleccione método"
                  options={(optionsByGroup.discount_rate_method || []).map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
                {discountRateDescription ? (
                  <p id="discountRateDescription" className="text-sm text-muted-foreground">
                    Tasa aplicada: {discountRateDescription} E.A.
                  </p>
                ) : null}
                {errors.discountRateMethod ? <p className="text-sm text-destructive">{errors.discountRateMethod}</p> : null}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button type="button" variant="outline" onClick={handleClear}>
              Limpiar Formulario
            </Button>
            <Button type="submit" disabled={isLoading} className="min-w-32">
              {isLoading ? "Guardando..." : "Continuar a Cultivos"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

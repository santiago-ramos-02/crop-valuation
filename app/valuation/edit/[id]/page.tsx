"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeftIcon } from "lucide-react"
import { useParams, useRouter } from "next/navigation"

import { BlockEntryForm, type BlockData } from "@/components/block-entry-form"
import { Header } from "@/components/header"
import { ParcelHeaderForm, type ParcelHeaderData } from "@/components/parcel-header-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ValuationCalculator } from "@/components/valuation-calculator"
import { parseLocalizedNumberInput } from "@/lib/number-notation"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/types/database"

type ValuationCase = Database["public"]["Tables"]["valuation_cases"]["Row"]
type CropBlock = Database["public"]["Tables"]["crop_blocks"]["Row"]

function valueToString(value: string | number | null | undefined) {
  return value === null || value === undefined ? "" : String(value)
}

export default function EditValuationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [currentStep, setCurrentStep] = useState<"parcel-form" | "block-form" | "calculation">("parcel-form")
  const [parcelData, setParcelData] = useState<ParcelHeaderData | null>(null)
  const [blockData, setBlockData] = useState<BlockData[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadExistingValuation() {
      setIsLoading(true)
      setError(null)

      try {
        const { data: valuationCase, error: caseError } = await supabase
          .from("valuation_cases")
          .select("*")
          .eq("id", params.id)
          .single()
          .returns<ValuationCase>()

        if (caseError) throw caseError

        const { data: blocks, error: blocksError } = await supabase
          .from("crop_blocks")
          .select("*")
          .eq("valuation_case_id", params.id)
          .order("created_at", { ascending: true })
          .returns<CropBlock[]>()

        if (blocksError) throw blocksError

        setParcelData({
          valuationAsOfDate: valuationCase.valuation_asof_date,
          parcelId: valuationCase.case_code,
          departamentoId: valuationCase.departamento_id,
          municipioId: valuationCase.municipio_id,
          vereda: valuationCase.vereda || "",
          latitude: valueToString(valuationCase.latitude),
          longitude: valueToString(valuationCase.longitude),
          climateType: valuationCase.climate_type || "",
          temperatureRange: valuationCase.temperature_range || "",
          altitudeRange: valuationCase.altitude_range || "",
          aptitudeUpraSipra: valuationCase.aptitude_upra_sipra || "",
          slopePercent: valueToString(valuationCase.slope_percent),
          agrologicClass: valuationCase.agrologic_class || "",
          altitudeM: valueToString(valuationCase.altitude_m),
          totalParcelAreaHa: valueToString(valuationCase.total_parcel_area_ha),
          discountRateMethod: valuationCase.discount_rate_method,
          discountRateEa: valueToString(valuationCase.discount_rate_ea),
        })

        setBlockData(
          (blocks || []).map((block) => ({
            blockLabel: block.block_label,
            cropId: block.crop_id,
            varietyId: block.variety_id,
            cropType: block.crop_type || "",
            productionSystem: block.production_system || "",
            ageYears: valueToString(block.age_years),
            fitosanitaryCondition: block.fitosanitary_condition || "",
            fitosanitaryFactor: valueToString(block.fitosanitary_factor),
            plantDistanceM: valueToString(block.plant_distance_m),
            rowDistanceM: valueToString(block.row_distance_m),
            plantingDensityPlantsHa: valueToString(block.planting_density_plants_ha),
            cropAreaHa: valueToString(block.crop_area_ha),
            freshYieldKgHa: valueToString(block.fresh_yield_kg_ha),
            waterAvailability: block.water_availability || "",
            rainfallRegime: block.rainfall_regime || "",
            annualPrecipitationMm: valueToString(block.annual_precipitation_mm),
            plantingFrame: block.planting_frame || "",
            landRentCopHaYear: valueToString(block.land_rent_cop_ha_year),
            jornalCostCop: valueToString(block.jornal_cost_cop),
            soilValueCopHa: valueToString(block.soil_value_cop_ha),
            commercialPriceCopKg: valueToString(block.commercial_price_cop_kg),
            notes: block.notes || "",
          })),
        )
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "No se pudo cargar la valuación.")
      } finally {
        setIsLoading(false)
      }
    }

    loadExistingValuation()
  }, [params.id, supabase])

  const handleParcelSubmit = (data: ParcelHeaderData) => {
    setParcelData(data)
    setCurrentStep("block-form")
  }

  const handleBlockSubmit = (blocks: BlockData[]) => {
    setBlockData(blocks)
    setCurrentStep("calculation")
  }

  const goBack = () => {
    if (currentStep === "calculation") {
      setCurrentStep("block-form")
    } else if (currentStep === "block-form") {
      setCurrentStep("parcel-form")
    } else {
      router.push(`/valuation/view/${params.id}`)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 min-h-[calc(100vh-3.5rem)] p-6">
          <div className="max-w-6xl mx-auto space-y-8">
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">Cargando datos para edición...</CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (error || !parcelData) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 min-h-[calc(100vh-3.5rem)] p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Valuación No Encontrada</CardTitle>
                <CardDescription>{error || "La valuación solicitada no existe o ha sido eliminada."}</CardDescription>
              </CardHeader>
            </Card>
            <Button onClick={() => router.push("/dashboard")}>Volver al Panel de Control</Button>
          </div>
        </div>
      </div>
    )
  }

  if (currentStep === "calculation") {
    if (!blockData) {
      return (
        <div className="min-h-screen bg-background">
          <Header />
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 min-h-[calc(100vh-3.5rem)] p-6">
            <div className="max-w-4xl mx-auto space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>Error</CardTitle>
                  <CardDescription>
                    No se pudieron preparar los datos de la valuación. Por favor regrese y verifique sus datos.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Button onClick={goBack}>Regresar</Button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 min-h-[calc(100vh-3.5rem)] p-6">
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-balance">Resultado de Valuación</h1>
                <p className="text-muted-foreground text-pretty">
                  Revisar la información y actualizar el avalúo final del predio: {parcelData.parcelId}
                </p>
              </div>
              <Button variant="outline" onClick={goBack} className="flex items-center gap-2 bg-transparent">
                <ArrowLeftIcon className="h-4 w-4" />
                Volver a Cultivos/Lotes
              </Button>
            </div>

            <ValuationCalculator parcelData={parcelData} blockData={blockData} existingCaseId={params.id} />
          </div>
        </div>
      </div>
    )
  }

  if (currentStep === "block-form") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 min-h-[calc(100vh-3.5rem)] p-6">
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-balance">Editar Cultivos/Lotes</h1>
                <p className="text-muted-foreground text-pretty">
                  Modificar cultivos/lotes individuales dentro del predio: {parcelData.parcelId}
                </p>
              </div>
              <Button variant="outline" onClick={goBack} className="flex items-center gap-2 bg-transparent">
                <ArrowLeftIcon className="h-4 w-4" />
                Volver a Predio
              </Button>
            </div>

            <BlockEntryForm
              onSubmit={handleBlockSubmit}
              onChange={setBlockData}
              initialBlocks={blockData || undefined}
              totalParcelAreaHa={parseLocalizedNumberInput(parcelData.totalParcelAreaHa) ?? undefined}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 min-h-[calc(100vh-3.5rem)] p-6">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-balance">Editar Valuación</h1>
              <p className="text-muted-foreground text-pretty">Modificar datos de la valuación existente</p>
            </div>
            <Button variant="outline" onClick={goBack} className="flex items-center gap-2 bg-transparent">
              <ArrowLeftIcon className="h-4 w-4" />
              Volver a Vista
            </Button>
          </div>

          <ParcelHeaderForm onSubmit={handleParcelSubmit} onChange={setParcelData} initialData={parcelData} />
        </div>
      </div>
    </div>
  )
}

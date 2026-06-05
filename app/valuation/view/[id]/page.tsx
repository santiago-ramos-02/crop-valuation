"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeftIcon, Calendar, EditIcon, MapPin } from "lucide-react"
import { useParams, useRouter } from "next/navigation"

import { Header } from "@/components/header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PRODUCTION_STAGE_LABELS, type ProductionStageId } from "@/lib/insumos/stage"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/types/database"

type ValuationCase = Database["public"]["Tables"]["valuation_cases"]["Row"]
type CropBlock = Database["public"]["Tables"]["crop_blocks"]["Row"]
type ResolvedLine = Database["public"]["Tables"]["resolved_insumo_lines"]["Row"]
type AppraisalResult = Database["public"]["Tables"]["crop_appraisal_results"]["Row"]
type Departamento = Database["public"]["Tables"]["departamentos"]["Row"]
type Municipio = Database["public"]["Tables"]["municipios"]["Row"]
type Crop = Database["public"]["Tables"]["crops"]["Row"]
type Variety = Database["public"]["Tables"]["varieties"]["Row"]

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  year: "numeric",
  month: "short",
  day: "numeric",
})

const numberFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 })

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat("es-CO", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatDate(dateString: string) {
  return dateFormatter.format(new Date(dateString))
}

function formatNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return ""
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return ""
  return numberFormatter.format(parsed)
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "No disponible"
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return "No disponible"
  return currencyFormatter.format(parsed)
}

function formatPercent(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return ""
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return ""
  return percentFormatter.format(parsed)
}

function formatDisplayLabel(value: string | null | undefined) {
  if (!value) return ""
  const text = value.replace(/_/g, " ").trim().toLocaleLowerCase("es-CO")
  return text ? text.charAt(0).toLocaleUpperCase("es-CO") + text.slice(1) : ""
}

function formatStageLabel(stageId: string | null | undefined) {
  if (!stageId) return "Sin etapa"
  return PRODUCTION_STAGE_LABELS[stageId as ProductionStageId] || formatDisplayLabel(stageId)
}

export default function ValuationViewPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const supabase = useMemo(() => createClient(), [])

  const [valuationCase, setValuationCase] = useState<ValuationCase | null>(null)
  const [blocks, setBlocks] = useState<CropBlock[]>([])
  const [linesByBlock, setLinesByBlock] = useState<Record<string, ResolvedLine[]>>({})
  const [appraisalsByBlock, setAppraisalsByBlock] = useState<Record<string, AppraisalResult>>({})
  const [departamento, setDepartamento] = useState<Departamento | null>(null)
  const [municipio, setMunicipio] = useState<Municipio | null>(null)
  const [cropsById, setCropsById] = useState<Map<string, Crop>>(new Map())
  const [varietiesById, setVarietiesById] = useState<Map<string, Variety>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadCase() {
      setIsLoading(true)
      setError(null)

      try {
        const { data: caseData, error: caseError } = await supabase
          .from("valuation_cases")
          .select("*")
          .eq("id", params.id)
          .single()
          .returns<ValuationCase>()

        if (caseError) throw caseError
        setValuationCase(caseData)

        const { data: blocksData, error: blocksError } = await supabase
          .from("crop_blocks")
          .select("*")
          .eq("valuation_case_id", params.id)
          .order("created_at", { ascending: true })
          .returns<CropBlock[]>()

        if (blocksError) throw blocksError
        const loadedBlocks = blocksData || []
        setBlocks(loadedBlocks)

        const [departamentoRes, municipioRes] = await Promise.all([
          supabase.from("departamentos").select("*").eq("id", caseData.departamento_id).returns<Departamento>().maybeSingle(),
          supabase.from("municipios").select("*").eq("id", caseData.municipio_id).returns<Municipio>().maybeSingle(),
        ])

        setDepartamento(departamentoRes.data || null)
        setMunicipio(municipioRes.data || null)

        const cropIds = Array.from(new Set(loadedBlocks.map((block) => block.crop_id)))
        const varietyIds = Array.from(new Set(loadedBlocks.map((block) => block.variety_id)))
        const blockIds = loadedBlocks.map((block) => block.id)

        const [cropsRes, varietiesRes, linesRes, appraisalsRes] = await Promise.all([
          cropIds.length
            ? supabase.from("crops").select("*").in("id", cropIds).returns<Crop[]>()
            : Promise.resolve({ data: [] as Crop[], error: null }),
          varietyIds.length
            ? supabase.from("varieties").select("*").in("id", varietyIds).returns<Variety[]>()
            : Promise.resolve({ data: [] as Variety[], error: null }),
          blockIds.length
            ? supabase
                .from("resolved_insumo_lines")
                .select("*")
                .in("crop_block_id", blockIds)
                .order("line_order", { ascending: true })
                .returns<ResolvedLine[]>()
            : Promise.resolve({ data: [] as ResolvedLine[], error: null }),
          blockIds.length
            ? supabase.from("crop_appraisal_results").select("*").in("crop_block_id", blockIds).returns<AppraisalResult[]>()
            : Promise.resolve({ data: [] as AppraisalResult[], error: null }),
        ])

        if (cropsRes.error) throw cropsRes.error
        if (varietiesRes.error) throw varietiesRes.error
        if (linesRes.error) throw linesRes.error
        if (appraisalsRes.error) throw appraisalsRes.error

        setCropsById(new Map((cropsRes.data || []).map((crop) => [crop.id, crop])))
        setVarietiesById(new Map((varietiesRes.data || []).map((variety) => [variety.id, variety])))

        const nextLinesByBlock: Record<string, ResolvedLine[]> = {}
        for (const line of linesRes.data || []) {
          nextLinesByBlock[line.crop_block_id] = [...(nextLinesByBlock[line.crop_block_id] || []), line]
        }
        setLinesByBlock(nextLinesByBlock)

        const nextAppraisalsByBlock: Record<string, AppraisalResult> = {}
        for (const appraisal of appraisalsRes.data || []) {
          nextAppraisalsByBlock[appraisal.crop_block_id] = appraisal
        }
        setAppraisalsByBlock(nextAppraisalsByBlock)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "No se pudo cargar la valuación.")
      } finally {
        setIsLoading(false)
      }
    }

    loadCase()
  }, [params.id, supabase])

  const totalAppraisedValue = Object.values(appraisalsByBlock).reduce(
    (sum, appraisal) => sum + toNumber(appraisal.appraised_value_cop),
    0,
  )

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 min-h-[calc(100vh-3.5rem)] p-6">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-balance">Resultados de Valuación</h1>
              <p className="text-muted-foreground text-pretty">
                Análisis de valuación para el predio: {valuationCase?.case_code || params.id}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push("/dashboard")} className="flex items-center gap-2">
                <ArrowLeftIcon className="h-4 w-4" />
                Volver al Panel
              </Button>
              <Button onClick={() => router.push(`/valuation/edit/${params.id}`)} className="flex items-center gap-2">
                <EditIcon className="h-4 w-4" />
                Editar Valuación
              </Button>
            </div>
          </div>

          {isLoading ? <Card><CardContent className="py-8 text-sm text-muted-foreground">Cargando valuación...</CardContent></Card> : null}
          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

          {!isLoading && !error && !valuationCase ? (
            <Card>
              <CardHeader>
                <CardTitle>Valuación No Encontrada</CardTitle>
                <CardDescription>La valuación solicitada no existe o ha sido eliminada.</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {valuationCase ? (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Ubicación</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      {departamento?.name || valuationCase.departamento_id} / {municipio?.name || valuationCase.municipio_id}
                    </div>
                    {valuationCase.vereda ? <div className="mt-1 text-slate-500">{valuationCase.vereda}</div> : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Cultivos/Lotes</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="font-medium">{blocks.length}</div>
                    {blocks[0] ? (
                      <div className="mt-1 text-slate-500">
                        {cropsById.get(blocks[0].crop_id)?.name || blocks[0].crop_id}{" "}
                        {varietiesById.get(blocks[0].variety_id)?.name || blocks[0].variety_id}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Fecha</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      {formatDate(valuationCase.valuation_asof_date)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Avalúo final</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="font-medium text-emerald-700">{formatCurrency(totalAppraisedValue)}</div>
                    <div className="mt-1 text-slate-500">{formatPercent(valuationCase.discount_rate_ea)} EA</div>
                  </CardContent>
                </Card>
              </div>

              {blocks.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-sm text-muted-foreground">No hay cultivos/lotes para mostrar.</CardContent>
                </Card>
              ) : null}

              {blocks.map((block) => {
                const blockLines = linesByBlock[block.id] || []
                const blockTotalCop = blockLines.reduce((sum, line) => sum + toNumber(line.total_cop), 0)
                const crop = cropsById.get(block.crop_id)
                const variety = varietiesById.get(block.variety_id)
                const appraisal = appraisalsByBlock[block.id]

                return (
                  <Card key={block.id}>
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle>{block.block_label}</CardTitle>
                          <CardDescription>
                            {crop?.name || block.crop_id} {variety?.name || block.variety_id}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">Etapa: {formatStageLabel(block.derived_stage_id)}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {appraisal ? (
                        <>
                          <div className="grid gap-4 md:grid-cols-4">
                            <div className="rounded-md border bg-white px-4 py-3">
                              <div className="text-xs text-muted-foreground">Valor del cultivo</div>
                              <div className="text-lg font-semibold text-emerald-700">
                                {formatCurrency(appraisal.appraised_value_cop)}
                              </div>
                            </div>
                            <div className="rounded-md border bg-white px-4 py-3">
                              <div className="text-xs text-muted-foreground">Valor por hectárea</div>
                              <div className="text-lg font-semibold">{formatCurrency(appraisal.appraised_value_cop_ha)}</div>
                            </div>
                            <div className="rounded-md border bg-white px-4 py-3">
                              <div className="text-xs text-muted-foreground">Valor por planta</div>
                              <div className="text-lg font-semibold">
                                {formatCurrency(appraisal.appraised_value_cop_per_plant)}
                              </div>
                            </div>
                            <div className="rounded-md border bg-white px-4 py-3">
                              <div className="text-xs text-muted-foreground">Área valorada</div>
                              <div className="text-lg font-semibold">{formatNumber(appraisal.crop_area_ha)} ha</div>
                            </div>
                          </div>
                          <div className="grid gap-4 text-sm md:grid-cols-5">
                            <div>
                              <span className="font-medium">Rendimiento del año:</span>{" "}
                              {formatNumber(appraisal.current_year_yield_kg_ha)} kg/ha
                            </div>
                            <div>
                              <span className="font-medium">Ingreso del año:</span>{" "}
                              {formatCurrency(appraisal.current_year_revenue_cop_ha)}
                            </div>
                            <div>
                              <span className="font-medium">Costo del año:</span>{" "}
                              {formatCurrency(appraisal.current_year_cost_cop_ha)}
                            </div>
                            <div>
                              <span className="font-medium">Utilidad del año:</span>{" "}
                              {formatCurrency(appraisal.current_year_utility_cop_ha)}
                            </div>
                            <div>
                              <span className="font-medium">Pendiente por recuperar:</span>{" "}
                              {formatCurrency(appraisal.pending_recovery_cop_ha)}
                            </div>
                          </div>
                        </>
                      ) : null}
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
                          {blockLines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell>{line.rubro_name}</TableCell>
                              <TableCell className="font-medium">{line.input_name}</TableCell>
                              <TableCell>{formatDisplayLabel(line.activity_name)}</TableCell>
                              <TableCell>{line.presentation}</TableCell>
                              <TableCell className="text-right">{formatNumber(line.quantity)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(line.unit_price_cop)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(line.total_cop)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={6}>Total</TableCell>
                            <TableCell className="text-right">{formatCurrency(blockTotalCop)}</TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </CardContent>
                  </Card>
                )
              })}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

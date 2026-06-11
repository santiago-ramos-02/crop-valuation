"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Calendar, Edit, Eye, LayoutDashboard, MapPin, Search, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import type { Database } from "@/types/database"

type ValuationCase = Database["public"]["Tables"]["valuation_cases"]["Row"]
type CropBlock = Database["public"]["Tables"]["crop_blocks"]["Row"]
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

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 2,
})

interface ValuationSummary {
  id: string
  caseCode: string
  location: string
  crop: string
  variety: string
  totalAreaHa: number
  blockCount: number
  totalAppraisedCop: number
  valuationDate: string
  createdAt: string
}

function formatDate(dateString: string) {
  return dateFormatter.format(new Date(dateString))
}

function toNumber(value: string | null | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(amount: number) {
  return currencyFormatter.format(amount)
}

function formatNumber(amount: number) {
  return numberFormatter.format(amount)
}

function valuationCaseTimestamp(valuationCase: ValuationCase) {
  return new Date(valuationCase.updated_at || valuationCase.created_at || valuationCase.valuation_asof_date).getTime()
}

function latestCasesByCode(cases: ValuationCase[]) {
  const byCode = new Map<string, ValuationCase>()

  for (const valuationCase of cases) {
    const current = byCode.get(valuationCase.case_code)
    if (!current || valuationCaseTimestamp(valuationCase) > valuationCaseTimestamp(current)) {
      byCode.set(valuationCase.case_code, valuationCase)
    }
  }

  return Array.from(byCode.values())
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()

  const [valuations, setValuations] = useState<ValuationSummary[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const valuationToDeleteRef = useRef<string | null>(null)

  const loadValuations = useCallback(async () => {
    setIsLoading(true)
    try {
      const casesRes = await supabase
        .from("valuation_cases")
        .select("*")
        .order("updated_at", { ascending: false })
        .returns<ValuationCase[]>()

      if (casesRes.error) throw casesRes.error

      const cases = latestCasesByCode(casesRes.data || [])
      const caseIds = cases.map((valuationCase) => valuationCase.id)
      const blocksRes = caseIds.length
        ? await supabase.from("crop_blocks").select("*").in("valuation_case_id", caseIds).returns<CropBlock[]>()
        : { data: [] as CropBlock[], error: null }
      if (blocksRes.error) throw blocksRes.error

      const blockIds = (blocksRes.data || []).map((block) => block.id)
      const departamentoIds = Array.from(new Set(cases.map((valuationCase) => valuationCase.departamento_id)))
      const municipioIds = Array.from(new Set(cases.map((valuationCase) => valuationCase.municipio_id)))
      const cropIds = Array.from(new Set((blocksRes.data || []).map((block) => block.crop_id)))
      const varietyIds = Array.from(new Set((blocksRes.data || []).map((block) => block.variety_id)))

      const [appraisalsRes, departamentosRes, municipiosRes, cropsRes, varietiesRes] = await Promise.all([
        blockIds.length
          ? supabase.from("crop_appraisal_results").select("*").in("crop_block_id", blockIds).returns<AppraisalResult[]>()
          : Promise.resolve({ data: [] as AppraisalResult[], error: null }),
        departamentoIds.length
          ? supabase.from("departamentos").select("*").in("id", departamentoIds).returns<Departamento[]>()
          : Promise.resolve({ data: [] as Departamento[], error: null }),
        municipioIds.length
          ? supabase.from("municipios").select("*").in("id", municipioIds).returns<Municipio[]>()
          : Promise.resolve({ data: [] as Municipio[], error: null }),
        cropIds.length
          ? supabase.from("crops").select("*").in("id", cropIds).returns<Crop[]>()
          : Promise.resolve({ data: [] as Crop[], error: null }),
        varietyIds.length
          ? supabase.from("varieties").select("*").in("id", varietyIds).returns<Variety[]>()
          : Promise.resolve({ data: [] as Variety[], error: null }),
      ])
      if (appraisalsRes.error) throw appraisalsRes.error
      if (departamentosRes.error) throw departamentosRes.error
      if (municipiosRes.error) throw municipiosRes.error
      if (cropsRes.error) throw cropsRes.error
      if (varietiesRes.error) throw varietiesRes.error

      const departamentos = new Map((departamentosRes.data || []).map((row) => [row.id, row.name]))
      const municipios = new Map((municipiosRes.data || []).map((row) => [row.id, row.name]))
      const crops = new Map((cropsRes.data || []).map((row) => [row.id, row.name]))
      const varieties = new Map((varietiesRes.data || []).map((row) => [row.id, row.name]))
      const blocksByCase = new Map<string, CropBlock[]>()
      for (const block of blocksRes.data || []) {
        blocksByCase.set(block.valuation_case_id, [...(blocksByCase.get(block.valuation_case_id) || []), block])
      }
      const appraisalsByBlock = new Map((appraisalsRes.data || []).map((row) => [row.crop_block_id, row]))

      setValuations(
        cases.map((valuationCase) => {
          const caseBlocks = blocksByCase.get(valuationCase.id) || []
          const firstBlock = caseBlocks[0]
          const blockAppraisals = caseBlocks.flatMap((block) => {
            const appraisal = appraisalsByBlock.get(block.id)
            return appraisal ? [appraisal] : []
          })
          const blockAreaHa = caseBlocks.reduce((sum, block) => sum + toNumber(block.crop_area_ha), 0)
          return {
            id: valuationCase.id,
            caseCode: valuationCase.case_code,
            location: `${departamentos.get(valuationCase.departamento_id) || "Sin departamento"} / ${
              municipios.get(valuationCase.municipio_id) || "Sin municipio"
            }`,
            crop: firstBlock ? crops.get(firstBlock.crop_id) || "Sin cultivo" : "Sin cultivo",
            variety: firstBlock ? varieties.get(firstBlock.variety_id) || "" : "",
            totalAreaHa: toNumber(valuationCase.total_parcel_area_ha) || blockAreaHa,
            blockCount: caseBlocks.length,
            totalAppraisedCop: blockAppraisals.reduce((sum, appraisal) => sum + toNumber(appraisal.appraised_value_cop), 0),
            valuationDate: valuationCase.valuation_asof_date,
            createdAt: valuationCase.created_at || new Date().toISOString(),
          }
        }),
      )
    } catch (error) {
      console.error("Error cargando valuaciones:", error)
      setValuations([])
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadValuations()
  }, [loadValuations])

  const filteredValuations = valuations.filter((valuation) => {
    const needle = searchTerm.toLowerCase()
    return (
      valuation.caseCode.toLowerCase().includes(needle) ||
      valuation.location.toLowerCase().includes(needle) ||
      valuation.crop.toLowerCase().includes(needle) ||
      valuation.variety.toLowerCase().includes(needle)
    )
  })

  const totalCases = valuations.length
  const totalArea = valuations.reduce((sum, valuation) => sum + valuation.totalAreaHa, 0)
  const totalBlocks = valuations.reduce((sum, valuation) => sum + valuation.blockCount, 0)
  const totalAppraisedCop = valuations.reduce((sum, valuation) => sum + valuation.totalAppraisedCop, 0)
  const averageAppraisedCop = totalCases > 0 ? totalAppraisedCop / totalCases : 0
  const averageValueCopHa = totalArea > 0 ? totalAppraisedCop / totalArea : 0
  const averageAreaHa = totalCases > 0 ? totalArea / totalCases : 0
  const averageBlocks = totalCases > 0 ? totalBlocks / totalCases : 0

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase.from("valuation_cases").delete().eq("id", id)
      if (error) throw error
      setValuations((current) => current.filter((valuation) => valuation.id !== id))
      toast({ title: "Valuación eliminada", description: "La valuación y sus resultados asociados fueron eliminados." })
    } catch (error) {
      console.error("Error eliminando valuación:", error)
      toast({
        title: "Error al eliminar",
        description: "No se pudo eliminar la valuación.",
        variant: "destructive",
      })
    }
  }

  function confirmDelete() {
    const valuationToDelete = valuationToDeleteRef.current
    if (valuationToDelete) {
      handleDelete(valuationToDelete)
      setDeleteDialogOpen(false)
      valuationToDeleteRef.current = null
    }
  }

  function startNewValuation() {
    router.push(`/valuation/new?fresh=${Date.now()}`)
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 min-h-[calc(100vh-3.5rem)] p-4">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <LayoutDashboard className="h-8 w-8 text-emerald-600" />
                Panel de Valuaciones
              </h1>
              <p className="text-gray-600 mt-1">Gestiona y revisa todas tus valuaciones agrícolas</p>
            </div>
            <Button
              onClick={startNewValuation}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Nueva Valuación
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Avalúo promedio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-700">{formatCurrency(averageAppraisedCop)}</div>
                <div className="text-xs text-muted-foreground mt-1">Promedio por valuación</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Valor por hectárea</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(averageValueCopHa)}</div>
                <div className="text-xs text-muted-foreground mt-1">Referencia ponderada por área</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Área promedio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(averageAreaHa)} ha</div>
                <div className="text-xs text-muted-foreground mt-1">Hectáreas por valuación</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Cultivos por valuación</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(averageBlocks)}</div>
                <div className="text-xs text-muted-foreground mt-1">Promedio de cultivos</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Búsqueda</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar por código, ubicación o cultivo..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
              <CardDescription>
                {filteredValuations.length} de {valuations.length} valuaciones
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-8 text-center text-sm text-slate-600">Cargando valuaciones...</div>
              ) : filteredValuations.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-600">No hay valuaciones para mostrar.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Valuación</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead>Cultivo</TableHead>
                      <TableHead>Área</TableHead>
                      <TableHead>Avalúo final</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredValuations.map((valuation) => (
                      <TableRow key={valuation.id}>
                        <TableCell className="font-medium">{valuation.caseCode}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            {valuation.location}
                          </div>
                        </TableCell>
                        <TableCell>
                          {valuation.crop} {valuation.variety}
                        </TableCell>
                        <TableCell>{valuation.totalAreaHa.toLocaleString("es-CO")} ha</TableCell>
                        <TableCell className="font-medium text-emerald-700">{formatCurrency(valuation.totalAppraisedCop)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            {formatDate(valuation.valuationDate)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => router.push(`/valuation/view/${valuation.id}`)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => router.push(`/valuation/edit/${valuation.id}`)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => {
                                valuationToDeleteRef.current = valuation.id
                                setDeleteDialogOpen(true)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) valuationToDeleteRef.current = null
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar valuación</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la valuación, sus cultivos y los resultados asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

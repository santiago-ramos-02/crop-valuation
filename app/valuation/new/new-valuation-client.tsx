"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeftIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

import { BlockEntryForm } from "@/components/block-entry-form"
import { Header } from "@/components/header"
import { ParcelHeaderForm } from "@/components/parcel-header-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ValuationResultTables } from "@/components/valuation-calculator"
import { parseLocalizedNumberInput } from "@/lib/number-notation"
import { createClient } from "@/lib/supabase/client"
import {
  blockFields,
  createDefaultParcelHeaderData,
  createEmptyBlock,
  isValuationStep,
  parcelFields,
  type BlockData,
  type ParcelHeaderData,
  type ValuationStep,
} from "@/lib/valuation/form-data"
import { saveValuation, type SavedBlockResolution } from "@/lib/valuation/save-valuation"
import type { Database, Json } from "@/types/database"

const NEW_VALUATION_DRAFT_TYPE = "new_valuation"

type ValuationDraftInsert = Database["public"]["Tables"]["valuation_form_drafts"]["Insert"]
type ValuationDraftRow = Database["public"]["Tables"]["valuation_form_drafts"]["Row"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function formString(value: unknown) {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

function normalizeParcelData(value: Json | null | undefined): ParcelHeaderData | null {
  if (!isRecord(value)) return null

  return parcelFields.reduce((data, field) => {
    data[field] = formString(value[field])
    return data
  }, {} as ParcelHeaderData)
}

function normalizeBlock(value: unknown): BlockData | null {
  if (!isRecord(value)) return null

  return blockFields.reduce((block, field) => {
    block[field] = formString(value[field])
    return block
  }, {} as BlockData)
}

function normalizeBlockData(value: Json | null | undefined): BlockData[] | null {
  if (!Array.isArray(value)) return null

  const blocks = value.flatMap((block) => {
    const normalized = normalizeBlock(block)
    return normalized ? [normalized] : []
  })

  return blocks.length > 0 ? blocks : null
}

function resolveDraftStep(value: unknown, hasParcelData: boolean) {
  const step = isValuationStep(value) ? value : "parcel-form"

  if (step === "calculation") return hasParcelData ? "block-form" : "parcel-form"
  if (step === "block-form" && !hasParcelData) return "parcel-form"
  return step
}

function hasMeaningfulParcelData(data: ParcelHeaderData) {
  return Object.entries(data).some(([field, value]) => {
    if (field === "valuationAsOfDate" || field === "parcelId") return false
    return value.trim() !== ""
  })
}

function hasMeaningfulBlockData(blocks: BlockData[]) {
  if (blocks.length === 0) return false

  return blocks.some((block, index) =>
    Object.entries(block).some(([field, value]) => {
      if (field === "blockLabel") return value.trim() !== "" && value.trim() !== `Lote ${index + 1}`
      return value.trim() !== ""
    }),
  )
}

function shouldPersistDraft(currentStep: ValuationStep, parcelData: ParcelHeaderData, blockData: BlockData[]) {
  return currentStep !== "parcel-form" || hasMeaningfulParcelData(parcelData) || hasMeaningfulBlockData(blockData)
}

export default function NewValuationPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const freshRequest = searchParams.get("fresh") || ""
  const [currentStep, setCurrentStep] = useState<ValuationStep>("parcel-form")
  const [parcelData, setParcelData] = useState<ParcelHeaderData>(() => createDefaultParcelHeaderData())
  const [blockData, setBlockData] = useState<BlockData[]>(() => [createEmptyBlock()])
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [isSavingValuation, setIsSavingValuation] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedBlocks, setSavedBlocks] = useState<SavedBlockResolution[]>([])
  const userIdRef = useRef<string | null>(null)
  const savedCaseIdRef = useRef<string | null>(null)

  useEffect(() => {
    let isActive = true

    async function loadDraft() {
      setDraftLoaded(false)
      setCurrentStep("parcel-form")
      setParcelData(createDefaultParcelHeaderData())
      setBlockData([createEmptyBlock()])
      setSaveError(null)
      setSavedBlocks([])
      userIdRef.current = null
      savedCaseIdRef.current = null

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError
        if (!user) {
          if (isActive) setDraftError("Debe iniciar sesión para cargar o guardar el formulario.")
          return
        }

        if (!isActive) return
        userIdRef.current = user.id

        if (freshRequest) {
          const { error } = await supabase
            .from("valuation_form_drafts")
            .delete()
            .eq("user_id", user.id)
            .eq("draft_type", NEW_VALUATION_DRAFT_TYPE)

          if (error) throw error
          setDraftError(null)
          router.replace("/valuation/new")
          return
        }

        const { data: draftResult, error } = await supabase
          .from("valuation_form_drafts")
          .select("*")
          .eq("user_id", user.id)
          .eq("draft_type", NEW_VALUATION_DRAFT_TYPE)
          .maybeSingle()

        if (error) throw error
        const draft = draftResult as ValuationDraftRow | null
        if (!draft || !isActive) return

        const restoredParcelData = normalizeParcelData(draft.parcel_data)
        const restoredBlockData = normalizeBlockData(draft.block_data)

        setParcelData(restoredParcelData ?? createDefaultParcelHeaderData())
        setBlockData(restoredBlockData ?? [createEmptyBlock()])
        setCurrentStep(resolveDraftStep(draft.current_step, restoredParcelData !== null))
        setDraftError(null)
      } catch (caught) {
        if (isActive) {
          setDraftError(caught instanceof Error ? caught.message : "No se pudo cargar el formulario guardado.")
        }
      } finally {
        if (isActive) setDraftLoaded(true)
      }
    }

    loadDraft()

    return () => {
      isActive = false
    }
  }, [freshRequest, router, supabase])

  useEffect(() => {
    const userId = userIdRef.current
    if (!draftLoaded || !userId || savedCaseIdRef.current) return

    const timeoutId = window.setTimeout(async () => {
      try {
        if (!shouldPersistDraft(currentStep, parcelData, blockData)) {
          const { error } = await supabase
            .from("valuation_form_drafts")
            .delete()
            .eq("user_id", userId)
            .eq("draft_type", NEW_VALUATION_DRAFT_TYPE)

          if (error) throw error
          setDraftError(null)
          return
        }

        const draft: ValuationDraftInsert = {
          user_id: userId,
          draft_type: NEW_VALUATION_DRAFT_TYPE,
          current_step: currentStep,
          parcel_data: parcelData as unknown as Json,
          block_data: blockData as unknown as Json,
        }

        const { error } = await supabase
          .from("valuation_form_drafts")
          .upsert(draft, { onConflict: "user_id,draft_type" })

        if (error) throw error
        setDraftError(null)
      } catch (caught) {
        setDraftError(caught instanceof Error ? caught.message : "No se pudo guardar el formulario en la base de datos.")
      }
    }, 400)

    return () => window.clearTimeout(timeoutId)
  }, [blockData, currentStep, draftLoaded, parcelData, supabase])

  const clearPersistedDraft = useCallback(async () => {
    const userId = userIdRef.current
    if (!userId) return

    const { error } = await supabase
      .from("valuation_form_drafts")
      .delete()
      .eq("user_id", userId)
      .eq("draft_type", NEW_VALUATION_DRAFT_TYPE)

    if (error) {
      setDraftError(error.message)
    } else {
      setDraftError(null)
    }
  }, [supabase])

  const handleParcelSubmit = (data: ParcelHeaderData) => {
    setParcelData(data)
    setCurrentStep("block-form")
  }

  const handleBlockSubmit = async (blocks: BlockData[]) => {
    setBlockData(blocks)
    setCurrentStep("calculation")
    setSavedBlocks([])
    setSaveError(null)

    setIsSavingValuation(true)

    try {
      const result = await saveValuation({
        supabase,
        parcelData,
        blockData: blocks,
        existingCaseId: savedCaseIdRef.current ?? undefined,
      })
      savedCaseIdRef.current = result.caseId
      setSavedBlocks(result.persistedBlocks)
      await clearPersistedDraft()
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "No se pudo guardar la valuación.")
    } finally {
      setIsSavingValuation(false)
    }
  }

  const goBack = () => {
    if (currentStep === "calculation") {
      setCurrentStep("block-form")
    } else if (currentStep === "block-form") {
      setCurrentStep("parcel-form")
    } else {
      router.push("/")
    }
  }

  if (!draftLoaded) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 min-h-[calc(100vh-3.5rem)] p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Cargando valuación...</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  const draftNotice = draftError ? (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{draftError}</div>
  ) : null

  if (currentStep === "calculation") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 min-h-[calc(100vh-3.5rem)] p-6">
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-balance">Resultado de Valuación</h1>
                <p className="text-muted-foreground text-pretty">
                  Revisar la información y presentar el avalúo final del predio: {parcelData.parcelId}
                </p>
              </div>
              <Button variant="outline" onClick={goBack} className="flex w-full items-center gap-2 bg-transparent sm:w-auto">
                <ArrowLeftIcon className="h-4 w-4" />
                Volver a Cultivos/Lotes
              </Button>
            </div>

            {draftNotice}
            {isSavingValuation ? (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">Guardando valuación...</CardContent>
              </Card>
            ) : null}
            {saveError ? (
              <Card>
                <CardHeader>
                  <CardTitle>No se pudo guardar la valuación</CardTitle>
                  <CardDescription>{saveError}</CardDescription>
                </CardHeader>
              </Card>
            ) : null}
            <ValuationResultTables savedBlocks={savedBlocks} />
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-balance">Entrada de Cultivos/Lotes</h1>
                <p className="text-muted-foreground text-pretty">
                  Configurar cultivos/lotes individuales dentro del predio: {parcelData.parcelId}
                </p>
              </div>
              <Button variant="outline" onClick={goBack} className="flex w-full items-center gap-2 bg-transparent sm:w-auto">
                <ArrowLeftIcon className="h-4 w-4" />
                Volver a Predio
              </Button>
            </div>

            {draftNotice}
            <BlockEntryForm
              onSubmit={handleBlockSubmit}
              onChange={setBlockData}
              blocks={blockData}
              isLoading={isSavingValuation}
              municipioId={parcelData.municipioId}
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-balance">Nueva Valuación</h1>
              <p className="text-muted-foreground text-pretty">
                Crear una nueva valuación profesional de predio agrícola
              </p>
            </div>
            <Button variant="outline" onClick={goBack} className="flex w-full items-center gap-2 bg-transparent sm:w-auto">
              <ArrowLeftIcon className="h-4 w-4" />
              Volver al Inicio
            </Button>
          </div>

          {draftNotice}
          <ParcelHeaderForm value={parcelData} onSubmit={handleParcelSubmit} onChange={setParcelData} />
        </div>
      </div>
    </div>
  )
}

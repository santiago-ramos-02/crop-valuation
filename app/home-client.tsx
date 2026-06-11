"use client"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LeafIcon, CalculatorIcon, FileTextIcon, PlusIcon, LayoutDashboardIcon } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Header } from "@/components/header"

export function HomePageClient() {
  const router = useRouter()

  function startNewValuation() {
    router.push(`/valuation/new?fresh=${Date.now()}`)
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="bg-linear-to-br from-emerald-50 to-teal-50 min-h-[calc(100vh-3.5rem)]">
        <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
          {/* Hero Section */}
          <div className="text-center space-y-6">
            <div className="flex justify-center mb-6">
              <Image src="/igac-logo.svg" alt="IGAC" width={56} height={80} className="h-20 w-auto" priority />
            </div>
            <h2 className="text-4xl font-bold text-balance">Valuaciones Agrícolas</h2>
            <p className="text-xl text-muted-foreground text-pretty max-w-3xl mx-auto">
              Sistema completo para la valuación de propiedades agrícolas con análisis financiero avanzado, cálculos
              automatizados de VPN e IRR, y reportes con niveles de confianza.
            </p>
            <div className="flex justify-center gap-4 pt-4">
              <Button
                size="lg"
                onClick={startNewValuation}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                Comenzar Nueva Valuación
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push("/dashboard")}>
                <LayoutDashboardIcon className="h-5 w-5 mr-2" />
                Ver Valuaciones Existentes
              </Button>
            </div>
          </div>

          {/* ... existing features and process sections ... */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="text-center border-0 shadow-lg">
              <CardHeader>
                <div className="flex justify-center mb-4">
                  <div className="rounded-full bg-emerald-100 p-4">
                    <LeafIcon className="h-8 w-8 text-emerald-600" />
                  </div>
                </div>
                <CardTitle className="text-xl">Análisis Multi Cultivo</CardTitle>
                <CardDescription className="text-base">
                  Soporte para múltiples cultivos plantados con diferentes edades, variedades y patrones de rendimiento.
                  Análisis detallado por cultivo con agregación automática.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center border-0 shadow-lg">
              <CardHeader>
                <div className="flex justify-center mb-4">
                  <div className="rounded-full bg-blue-100 p-4">
                    <CalculatorIcon className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
                <CardTitle className="text-xl">Cálculos Financieros Avanzados</CardTitle>
                <CardDescription className="text-base">
                  VPN, TIR y análisis de punto de equilibrio automatizados con tasas de descuento configurables.
                  Clasificación de fases productivas e improductivas.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="text-center border-0 shadow-lg">
              <CardHeader>
                <div className="flex justify-center mb-4">
                  <div className="rounded-full bg-purple-100 p-4">
                    <FileTextIcon className="h-8 w-8 text-purple-600" />
                  </div>
                </div>
                <CardTitle className="text-xl">Reportes</CardTitle>
                <CardDescription className="text-base">
                  Reportes detallados de valuación con niveles de confianza (A, B, C), trazabilidad de auditoría y
                  exportación en múltiples formatos.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Process Steps */}
          <div className="space-y-8">
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-4">Proceso de Valuación</h3>
              <p className="text-muted-foreground text-lg">Siga estos simples pasos para completar su valuación</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto">
                  1
                </div>
                <h4 className="font-semibold">Información de Parcela</h4>
                <p className="text-sm text-muted-foreground">
                  Ingrese datos básicos de la propiedad, departamento/municipio y área total
                </p>
              </div>

              <div className="text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto">
                  2
                </div>
                <h4 className="font-semibold">Configuración de Cultivos</h4>
                <p className="text-sm text-muted-foreground">
                  Defina cultivos individuales con edades y costos
                </p>
              </div>

              <div className="text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto">
                  3
                </div>
                <h4 className="font-semibold">Cálculo Automático</h4>
                <p className="text-sm text-muted-foreground">
                  El sistema ejecuta todos los cálculos financieros automáticamente
                </p>
              </div>

              <div className="text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto">
                  4
                </div>
                <h4 className="font-semibold">Reporte Final</h4>
                <p className="text-sm text-muted-foreground">Obtenga reportes listos para presentar</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

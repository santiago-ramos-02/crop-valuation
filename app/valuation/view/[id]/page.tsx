import type { Metadata } from "next"

import { ValuationViewClient } from "@/components/valuation-view"

export const metadata = {
  title: "Resultados de Valuación",
  description: "Consulta del avalúo agrícola registrado.",
} satisfies Metadata

export default function ValuationViewPage() {
  return <ValuationViewClient />
}

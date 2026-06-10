import type { Metadata } from "next"

import NewValuationPageClient from "./new-valuation-client"

export const metadata: Metadata = {
  title: "Nueva valuación | Avalúos Agrícolas",
  description: "Crear una nueva valuación de predio agrícola.",
}

export default function NewValuationPage() {
  return <NewValuationPageClient />
}

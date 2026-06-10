import type { Metadata } from "next"

import EditValuationPageClient from "./edit-valuation-client"

export const metadata: Metadata = {
  title: "Editar valuación | Avalúos Agrícolas",
  description: "Actualizar una valuación de predio agrícola.",
}

export default function EditValuationPage() {
  return <EditValuationPageClient />
}

import type { Metadata } from "next"

import { HomePageClient } from "./home-client"

export const metadata: Metadata = {
  title: "Avalúos Agrícolas Profesionales",
  description: "Sistema para la valuación de predios agrícolas.",
}

export default function HomePage() {
  return <HomePageClient />
}

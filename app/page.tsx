import type { Metadata } from "next"

import { HomePageClient } from "./home-client"

export const metadata: Metadata = {
  title: "Avalúos Agrícolas",
  description: "Sistema para la valuación de cultivos agrícolas.",
}

export default function HomePage() {
  return <HomePageClient />
}

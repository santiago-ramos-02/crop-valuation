"use client"

import Image from "next/image"
import Link from "next/link"
import { UserMenu } from "./user-menu"

export function Header() {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="w-full max-w-none px-4 flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <Image src="/igac-logo.svg" alt="IGAC" width={23} height={32} className="h-8 w-auto" priority />
          <span className="font-bold">Avalúos Agrícolas</span>
        </Link>
        <div className="flex items-center">
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

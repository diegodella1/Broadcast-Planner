import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Roxom Playout Manager",
  description: "Calendar-controlled broadcast playout manager for Roxom TV"
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

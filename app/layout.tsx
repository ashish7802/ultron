/**
 * @file app/layout.tsx
 * @description Root layout component for the ULTRON AI Operating Environment.
 *
 * Subsystem:
 * Presentation Layer & Typography Shell.
 *
 * Key Responsibilities:
 * - Loads Plus Jakarta Sans (display), DM Sans (UI/body), and JetBrains Mono (code/telemetry)
 *   via `next/font/google` and binds them to CSS custom properties.
 * - Configures dark OLED viewport settings and SEO/OpenGraph metadata.
 * - Imports Tailwind CSS v4 design tokens (`globals.css`).
 *
 * Architectural Role & Interactions:
 * - Top-level Next.js App Router wrapper serving both localhost browser and Electron desktop shell.
 *
 * Safety / Security Guarantees:
 * - Zero external telemetry scripts or third-party trackers.
 */

import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ULTRON — Desktop AI Operating Environment",
  description:
    "Local-first desktop AI assistant with encrypted episodic memory, local Ollama model orchestration, fail-closed security governance, and real-time system diagnostics.",
  openGraph: {
    title: "ULTRON — Desktop AI Operating Environment",
    description:
      "Local-first desktop AI assistant with encrypted episodic memory, local Ollama model orchestration, and fail-closed security governance.",
    type: "website",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/ultron_logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#06090f",
};

/**
 * RootLayout wraps the entire Next.js App Router tree with dark-mode typography variables.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${dmSans.variable} ${jetbrainsMono.variable} dark`}
      suppressHydrationWarning
    >
      <body
        className="bg-[#06090f] text-slate-100 antialiased selection:bg-blue-500/30 selection:text-cyan-100"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}

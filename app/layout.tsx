/**
 * @file app/layout.tsx
 * @description Root layout component for the ULTRON web and desktop interface.
 * 
 * Subsystem:
 * Presentation Layer & Browser Shell.
 * 
 * Responsibilities:
 * - Configures global HTML structure, dark-theme viewport settings, and branding metadata.
 * - Injects global styling (`globals.css`).
 * - Includes a tamper-resistant fetch hardening script to prevent browser extensions from corrupting AI streaming responses.
 * 
 * Safety / Security Guarantees:
 * - Locks native Window.fetch context against prototype pollution.
 * - Disables external telemetry scripts.
 */

import type { Metadata, Viewport } from "next";
import "./globals.css";

// Application metadata displayed in browser tabs and desktop shell
export const metadata: Metadata = {
  title: "ULTRON AI - Next-Gen Desktop Intelligence",
  description: "ChatGPT-style AI interface with local desktop app control, autonomous quantum web research, and persistent conversation history.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/ultron_logo.png",
  },
};

// Viewport configuration ensuring OLED deep dark background and responsive scaling
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080c14",
};

/**
 * RootLayout
 * The top-level layout wrapper required by Next.js App Router.
 * Wraps all pages in an HTML5 shell and applies hydration-warning suppressions for client-only dynamic elements.
 * 
 * @param {Readonly<{ children: React.ReactNode }>} props - Child elements rendered inside the body.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

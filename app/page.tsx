/**
 * @file app/page.tsx
 * @description Main application page for ULTRON ChatGPT-style AI interface.
 * 
 * Subsystem:
 * User Interface & Navigation.
 * 
 * Key Responsibilities:
 * - Mounts the client-side `UltronChat` interface dynamically.
 * - Disables Server-Side Rendering (SSR) for `UltronChat` to ensure smooth hydration
 *   with browser `localStorage` and client APIs.
 * 
 * Architectural Role & Interactions:
 * - Replaces the legacy 3D orb HUD with the new high-throughput chat & conversation history workspace.
 * - Serves as the primary viewport for both browser access (http://localhost:3000) and the
 *   standalone Electron desktop shell.
 * 
 * Safety / Security Guarantees:
 * - Runs fully sandboxed in client mode without exposing sensitive environment keys to the DOM.
 */

"use client";

import dynamic from "next/dynamic";

// Dynamically import UltronChat with ssr: false to avoid hydration mismatches with localStorage
const UltronChat = dynamic(() => import("@/components/UltronChat"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        backgroundColor: "#080c14",
        color: "#00f0ff",
        fontFamily: "monospace",
        fontSize: "14px",
        letterSpacing: "0.1em",
      }}
    >
      INITIALIZING ULTRON INTELLIGENCE...
    </div>
  ),
});

/**
 * Home component
 * Renders the primary full-screen ULTRON chat & conversation history interface.
 *
 * @returns React.JSX.Element
 */
export default function Home() {
  return <UltronChat />;
}

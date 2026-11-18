/**
 * @file app/page.tsx
 * @description Root entrypoint mounting the unified ULTRON AI Operating Environment.
 *
 * Subsystem:
 * Presentation Layer & Workspace Bootstrap.
 *
 * Key Responsibilities:
 * - Dynamically mounts `UltronWorkspace` with `ssr: false` so browser storage, Web Audio,
 *   and client-side session bootstrapping hydrate cleanly without mismatch warnings.
 *
 * Architectural Role & Interactions:
 * - Primary viewport served on `http://localhost:3000` and inside the Electron shell.
 *
 * Safety / Security Guarantees:
 * - Contains zero secrets or privileged server logic.
 */

"use client";

import dynamic from "next/dynamic";

const UltronWorkspace = dynamic(() => import("@/components/UltronWorkspace"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[#06090f] text-slate-200">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
      <div className="font-mono text-xs tracking-wider text-slate-400">
        INITIALIZING ULTRON OPERATING ENVIRONMENT...
      </div>
    </div>
  ),
});

export default function Home() {
  return <UltronWorkspace />;
}

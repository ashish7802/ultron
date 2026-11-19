/**
 * @file app/page.tsx
 * @description Root entrypoint mounting the unified ULTRON AI Operating Environment.
 *
 * Subsystem:
 * Presentation Layer & Workspace Bootstrap.
 *
 * Key Responsibilities:
 * - Directly renders `UltronWorkspace` on initial SSR and client hydration so the user
 *   lands immediately on the ULTRON Command Center UI/UX with zero blocking loading screen.
 *
 * Architectural Role & Interactions:
 * - Primary viewport served on `http://localhost:3000`, the AI Studio preview host,
 *   and inside the Electron desktop shell.
 *
 * Safety / Security Guarantees:
 * - Contains zero secrets or privileged server logic.
 */

import UltronWorkspace from "@/components/UltronWorkspace";

/**
 * Root page component rendering the ULTRON operating environment directly.
 */
export default function Home() {
  return <UltronWorkspace />;
}

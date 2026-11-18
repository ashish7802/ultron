/**
 * @file components/workspace/types.ts
 * @description Shared TypeScript contracts for the ULTRON AI Operating Environment UI.
 *
 * Subsystem:
 * Frontend Workspace State & Telemetry Contracts.
 *
 * Key Responsibilities:
 * - Defines strongly typed navigation view IDs covering all 9 required ULTRON centers.
 * - Defines shared payloads returned by `/api/dashboard`, `/api/models`, `/api/settings`,
 *   `/api/diagnostics`, `/api/memory`, `/api/security/*`, and `/api/chat`.
 *
 * Architectural Role & Interactions:
 * - Imported by `UltronWorkspace.tsx`, `apiClient.ts`, and all view components under `components/views/`.
 *
 * Safety / Security Guarantees:
 * - Types strictly mirror sanitized API responses; secret fields are never modeled for UI rendering.
 */

import type { UltronSettings } from "@/lib/runtimeConfig";

export type UltronViewId =
  | "command"
  | "chat"
  | "voice"
  | "memory"
  | "system"
  | "models"
  | "security"
  | "settings"
  | "diagnostics";

export interface SessionInfo {
  authenticated: boolean;
  sessionId: string | null;
  userId: string | null;
  userRole: string;
  authenticationLevel: string;
  expiresAt: number | null;
}

export interface DashboardSnapshot {
  ok: boolean;
  sampledAt: number;
  host: {
    platform: string;
    release: string;
    cpuModel: string | null;
    cpuCores: number | null;
    uptimeSeconds?: number;
  };
  metrics: {
    cpuPercent: number | null;
    memoryPercent: number | null;
    memoryTotalBytes: number | null;
    memoryFreeBytes: number | null;
    storage: {
      totalBytes: number;
      freeBytes: number;
      usedPercent: number;
    } | null;
    gpuPercent: number | null;
  };
  model: {
    status: "ready" | "unavailable";
    model: string | null;
    endpoint?: string;
  };
  memory?: {
    totalRecords: number | null;
    encryption?: {
      encrypted?: boolean;
      cipher?: string;
      keySource?: string;
      status?: string;
    };
  };
  workflows: {
    total: number;
    active: number;
    openTasks: number;
  } | null;
  visibleWindows: number | null;
  security: {
    recentEventCount: number;
    activeIncidentCount: number;
    lockdownActive?: boolean;
  };
  diagnostics: {
    cpuAvailable: boolean;
    storageAvailable: boolean;
    workflowStoreAvailable: boolean;
    desktopWindowInspectionAvailable: boolean;
  };
}

export interface PendingPermissionPlan {
  planId: string;
  actionType: string;
  title: string;
  description: string;
  target: string;
  riskLevel: string;
  riskExplanation?: string;
  approvalToken?: string;
  status?: "pending" | "approved" | "rejected" | "executed" | "failed";
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  model?: string;
  providerStatus?: string;
  memoryUsed?: boolean;
  error?: boolean;
  permissionPlan?: PendingPermissionPlan | null;
  sources?: Array<{ title: string; url: string; domain?: string }>;
}

export interface ChatConversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatTurn[];
}

export interface ToastNotice {
  id: string;
  tone: "info" | "success" | "warn" | "error";
  title: string;
  detail?: string;
}

export type { UltronSettings };

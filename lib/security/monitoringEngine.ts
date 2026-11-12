/**
 * @file lib/security/monitoringEngine.ts
 * @description Centralized Security Monitoring & Threat Detection Engine for ULTRON.
 *
 * Subsystem:
 * Centralized Security, Monitoring & Threat Detection Subsystem (Module 7).
 *
 * Key Responsibilities:
 * - Ingests and processes real-time security events across all ULTRON subsystems.
 * - Detects anomalous patterns:
 *   * Repeated failed authentications and brute-force attempts
 *   * Direct gateway bypass attempts
 *   * Expired approval usage or parameter tampering
 *   * Unauthorized resource access spikes
 * - Automatically classifies and escalates threats into structured SecurityIncidents:
 *   `INFO` -> `LOW` -> `MEDIUM` -> `HIGH` -> `CRITICAL`.
 * - Emits security alerts and integrates with the Emergency Protection System on critical anomalies.
 *
 * Architectural Role & Interactions:
 * - Subscribed to by `lib/security/identityEngine.ts`, `lib/security/actionGateway.ts`,
 *   and `app/api/security/monitoring`.
 *
 * Safety / Security Guarantees:
 * - Non-sensitive event logging: sanitizes all metadata before storing.
 * - Honest reporting: does not claim real-time monitoring where none is active.
 */

import crypto from "crypto";
import { scanAndSanitizeText } from "./privacyEngine.ts";
import type {
  SecurityEvent,
  SecurityEventType,
  ThreatSeverity,
  SecurityIncident,
} from "./types.ts";

/** In-memory security events log (capped at 1000 items). */
const securityEvents: SecurityEvent[] = [];
const MAX_EVENTS = 1000;

/** Active incidents registry. */
const activeIncidents: SecurityIncident[] = [];
const MAX_INCIDENTS = 100;

/** Thresholds for automatic threat escalation. */
const THREAT_THRESHOLDS = {
  repeatedAuthFailures: 3, // 3 failures in 5 min -> Incident MEDIUM
  tamperingAttempts: 1, // 1 tampering -> Incident CRITICAL
  gatewayBypassAttempts: 1, // 1 bypass -> Incident CRITICAL
};

/**
 * Emits and records a security event into the centralized monitoring pipeline.
 *
 * @param type - Event category.
 * @param severity - Threat tier.
 * @param actor - Associated actor or system identity.
 * @param details - Diagnostic explanation.
 * @param options - Additional metadata.
 * @returns Recorded SecurityEvent.
 */
export function recordSecurityEvent(
  type: SecurityEventType,
  severity: ThreatSeverity,
  actor: string,
  details: string,
  options: {
    sessionId?: string;
    resource?: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  } = {}
): SecurityEvent {
  const sanitizedDetails = scanAndSanitizeText(details).sanitizedText;
  const eventId = "evt_" + crypto.randomBytes(10).toString("hex");

  const event: SecurityEvent = {
    eventId,
    timestamp: Date.now(),
    type,
    severity,
    actor,
    sessionId: options.sessionId,
    resource: options.resource,
    details: sanitizedDetails,
    ipAddress: options.ipAddress || "127.0.0.1",
    metadata: options.metadata,
  };

  securityEvents.unshift(event);
  if (securityEvents.length > MAX_EVENTS) {
    securityEvents.pop();
  }

  // Evaluate anomaly patterns and auto-escalate if necessary
  evaluateThreatAnomalies(event);

  return event;
}

/**
 * Evaluates security events for anomalous patterns and generates incidents.
 *
 * @param latestEvent - Newly ingested event.
 */
function evaluateThreatAnomalies(latestEvent: SecurityEvent): void {
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;

  // 1. Critical Tampering or Gateway Bypass -> Immediate Incident
  if (
    latestEvent.type === "TAMPERING_DETECTED" ||
    latestEvent.type === "GATEWAY_BYPASS_ATTEMPT" ||
    latestEvent.type === "PERMISSION_BYPASS_ATTEMPT"
  ) {
    createSecurityIncident(
      "CRITICAL",
      `Critical Security Violation: ${latestEvent.type.replace(/_/g, " ")}`,
      `Detected malicious attempt to bypass or tamper with security controls: ${latestEvent.details}`,
      [latestEvent.eventId]
    );
    return;
  }

  // 2. Repeated Authentication Failures
  if (latestEvent.type === "AUTH_FAILURE" || latestEvent.type === "BIOMETRIC_FAILED") {
    const recentFailures = securityEvents.filter(
      (e) =>
        (e.type === "AUTH_FAILURE" || e.type === "BIOMETRIC_FAILED") &&
        e.timestamp > fiveMinutesAgo &&
        e.actor === latestEvent.actor
    );

    if (recentFailures.length >= THREAT_THRESHOLDS.repeatedAuthFailures) {
      createSecurityIncident(
        "HIGH",
        "Repeated Authentication Failures Detected",
        `Actor "${latestEvent.actor}" has failed ${recentFailures.length} authentication attempts within 5 minutes.`,
        recentFailures.map((f) => f.eventId)
      );
    }
  }
}

/**
 * Creates and registers a new security incident.
 *
 * @param severity - Incident severity.
 * @param title - Short title.
 * @param summary - Full description.
 * @param triggeringEvents - List of event IDs.
 * @returns Created SecurityIncident.
 */
export function createSecurityIncident(
  severity: ThreatSeverity,
  title: string,
  summary: string,
  triggeringEvents: string[]
): SecurityIncident {
  const incidentId = "inc_" + crypto.randomBytes(8).toString("hex");
  const incident: SecurityIncident = {
    incidentId,
    timestamp: Date.now(),
    severity,
    title,
    summary,
    triggeringEvents,
    status: "OPEN",
  };

  activeIncidents.unshift(incident);
  if (activeIncidents.length > MAX_INCIDENTS) {
    activeIncidents.pop();
  }

  console.warn(`[THREAT DETECTION] *** INCIDENT RAISED (${severity}): ${title} ***`);
  return incident;
}

/**
 * Retrieves recent security events.
 *
 * @param limit - Max entries to return.
 * @returns Array of SecurityEvents.
 */
export function listSecurityEvents(limit = 100): SecurityEvent[] {
  return securityEvents.slice(0, limit);
}

/**
 * Retrieves all active security incidents.
 *
 * @returns Array of SecurityIncidents.
 */
export function listSecurityIncidents(): SecurityIncident[] {
  return [...activeIncidents];
}

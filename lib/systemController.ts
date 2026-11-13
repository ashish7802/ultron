/**
 * @file lib/systemController.ts
 * @description Windows Laptop & OS System Controller for ULTRON.
 * 
 * Subsystem:
 * Local Hardware, OS Introspection & Device Control Agent.
 * 
 * Key Responsibilities:
 * - Queries hardware and operating system state: Battery percentage & charging state,
 *   RAM utilization, CPU information, and system uptime.
 * - Controls laptop audio levels: Volume Up, Volume Down, Mute/Unmute toggle.
 * - Launches websites directly in the user's default browser (YouTube, GitHub, etc.).
 * - Executes allow-listed Windows system actions (Lock Workstation, Task Manager, Settings).
 * 
 * Architectural Role & Interactions:
 * - Invoked by `app/api/chat/route.ts` during background agent routing whenever the user
 *   requests laptop hardware status, media controls, or web URL navigation.
 * 
 * Safety / Security Guarantees:
 * - Only safe, non-destructive Win32 / WMI queries and keyboard media dispatch are executed.
 * - Raw user strings are sanitized before being passed to child processes.
 */

import { exec, spawn } from "child_process";
import os from "os";
import { planAction, verifyGatewayExecutionGrant, type ActionPlan } from "./permissionGateway.ts";

export interface SystemTelemetry {
  batteryPercent: number | null;
  isCharging: boolean | null;
  totalMemoryGb: number;
  freeMemoryGb: number;
  usedMemoryGb: number;
  memoryUsagePercent: number;
  cpuModel: string;
  cpuCores: number;
  platform: string;
  hostname: string;
  uptimeHours: number;
}

export interface SystemActionResult {
  handled: boolean;
  message: string;
  telemetry?: Partial<SystemTelemetry>;
  permissionPlan?: ActionPlan;
}

/**
 * Queries Windows CIM/WMI for battery state (percentage and charging status).
 *
 * @returns Battery percentage and charging flag, or nulls if unavailable.
 */
export async function getBatteryStatus(): Promise<{ percent: number | null; isCharging: boolean | null }> {
  if (process.platform !== "win32") {
    return { percent: null, isCharging: null };
  }

  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Battery | Select-Object -Property EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json"',
      { timeout: 4000 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve({ percent: null, isCharging: null });
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          const percent = typeof parsed.EstimatedChargeRemaining === "number" ? parsed.EstimatedChargeRemaining : null;
          // BatteryStatus 2 = Connected to AC / Charging, 1 = Discharging
          const isCharging = parsed.BatteryStatus === 2;
          resolve({ percent, isCharging });
        } catch {
          resolve({ percent: null, isCharging: null });
        }
      }
    );
  });
}

/**
 * Collects complete system hardware and OS metrics.
 *
 * @returns Comprehensive telemetry object.
 */
export async function getSystemTelemetry(): Promise<SystemTelemetry> {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();

  const battery = await getBatteryStatus();

  return {
    batteryPercent: battery.percent,
    isCharging: battery.isCharging,
    totalMemoryGb: parseFloat((totalMem / (1024 ** 3)).toFixed(2)),
    freeMemoryGb: parseFloat((freeMem / (1024 ** 3)).toFixed(2)),
    usedMemoryGb: parseFloat((usedMem / (1024 ** 3)).toFixed(2)),
    memoryUsagePercent: Math.round((usedMem / totalMem) * 100),
    cpuModel: cpus.length > 0 ? cpus[0].model.trim() : "Unknown CPU",
    cpuCores: cpus.length,
    platform: process.platform,
    hostname: os.hostname(),
    uptimeHours: parseFloat((os.uptime() / 3600).toFixed(1)),
  };
}

/**
 * Adjusts laptop audio volume using standard Windows Shell virtual keycodes.
 * Enforces mandatory authorization via Universal Computer Action Permission Gateway.
 *
 * @param action - "up", "down", or "mute".
 * @param gatewayAuth - Cryptographic authorization grant from permission gateway.
 * @returns Boolean indicating whether key simulation was dispatched.
 */
export async function controlAudioVolume(
  action: "up" | "down" | "mute",
  gatewayAuth?: { planId: string; grantToken: string }
): Promise<boolean> {
  if (process.platform !== "win32") return false;
  if (!gatewayAuth || !verifyGatewayExecutionGrant(gatewayAuth.planId, gatewayAuth.grantToken)) {
    console.warn("[SYSTEM CONTROLLER] Blocked direct volume change without permission gateway grant.");
    return false;
  }

  // Keycode 175 = Volume Up, 174 = Volume Down, 173 = Mute Toggle
  const charCode = action === "up" ? 175 : action === "down" ? 174 : 173;
  // Send key sequence 5 times for volume up/down for a noticeable adjustment
  const repeat = action === "mute" ? 1 : 5;

  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -Command "for ($i=0; $i -lt ${repeat}; $i++) { (New-Object -ComObject Wscript.Shell).SendKeys([char]${charCode}) }"`,
      { timeout: 3000 },
      (err) => {
        resolve(!err);
      }
    );
  });
}

/**
 * Opens any verified website URL in the user's default browser.
 * Enforces mandatory authorization via Universal Computer Action Permission Gateway.
 *
 * @param url - Destination web address.
 * @param gatewayAuth - Cryptographic authorization grant from permission gateway.
 * @returns Boolean indicating success.
 */
export async function openUrlInBrowser(
  url: string,
  gatewayAuth?: { planId: string; grantToken: string }
): Promise<boolean> {
  if (!gatewayAuth || !verifyGatewayExecutionGrant(gatewayAuth.planId, gatewayAuth.grantToken)) {
    console.warn("[SYSTEM CONTROLLER] Blocked direct browser navigation without permission gateway grant.");
    return false;
  }

  return new Promise((resolve) => {
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `https://${cleanUrl}`;
    }

    // Launch URL with standard OS explorer handler
    const child = spawn("explorer.exe", [cleanUrl], {
      detached: true,
      stdio: "ignore",
    });
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
    child.once("error", () => resolve(false));
  });
}

/**
 * Detects and evaluates laptop hardware, system telemetry, and OS control intents.
 *
 * @param query - Raw user query.
 * @returns Handled outcome or null if query is not an OS control command.
 */
export async function handleSystemControlIntent(query: string): Promise<SystemActionResult | null> {
  const lower = query.toLowerCase().trim();

  // 1. Battery Telemetry: "battery kitni hai", "check battery", "laptop battery"
  if (
    lower.includes("battery") ||
    lower.includes("charging") ||
    /charge\s*(kitna|level|percentage)/i.test(lower)
  ) {
    const battery = await getBatteryStatus();
    if (battery.percent !== null) {
      const stateStr = battery.isCharging ? "plugged in and charging" : "running on battery power";
      return {
        handled: true,
        message: `Laptop battery is currently at **${battery.percent}%** (${stateStr}).`,
        telemetry: { batteryPercent: battery.percent, isCharging: battery.isCharging },
      };
    } else {
      return {
        handled: true,
        message: "Battery level: Your device is connected to AC power or battery telemetry is managed by desktop hardware.",
      };
    }
  }

  // Recognize a clear ChatGPT-open request before hardware keywords like "memory" can
  // accidentally route the same sentence to system telemetry.
  if (/\b(?:chatgpt|chat\s+gpt)\b.{0,32}\b(?:open|launch|kholo|khol)\b/i.test(lower)) {
    const targetUrl = "https://chatgpt.com";
    const plan = planAction("browser_open", targetUrl, { targetUrl }, ["Default Web Browser", "Windows Shell"]);
    return {
      handled: true,
      message:
        `I prepared an approval request to open ChatGPT in your default browser.\n\n` +
        `ULTRON will not send your saved profile or memories to an external service.`,
      permissionPlan: plan,
    };
  }

  // General mentions of memory are common in user-profile requests, so require a hardware
  // qualifier before treating "memory" as RAM telemetry.
  const isMemoryTelemetryQuery =
    /\b(?:memory|ram)\s+(?:usage|utilization|stats|status|available|free|capacity|kitni|kitna)\b/i.test(lower) ||
    /\b(?:free|used|available)\s+memory\b/i.test(lower);
  // 2. RAM & CPU Specs: "ram kitni use ho rahi hai", "system stats", "pc specs", "laptop specs", "performance"
  if (
    (/\b(ram|cpu|specs|performance|system specs|telemetry|hardware)\b/i.test(lower) || isMemoryTelemetryQuery) &&
    !lower.includes("research")
  ) {
    const telem = await getSystemTelemetry();
    return {
      handled: true,
      message:
        `### Laptop System Telemetry\n\n` +
        `- **CPU:** ${telem.cpuModel} (${telem.cpuCores} Cores)\n` +
        `- **RAM Usage:** **${telem.usedMemoryGb} GB** used of **${telem.totalMemoryGb} GB** (${telem.memoryUsagePercent}%)\n` +
        `- **Free Memory:** ${telem.freeMemoryGb} GB\n` +
        `- **Battery:** ${telem.batteryPercent !== null ? `${telem.batteryPercent}%` : "AC Connected"}\n` +
        `- **System Uptime:** ${telem.uptimeHours} hours on ${telem.hostname}`,
      telemetry: telem,
    };
  }

  // 3. Audio Volume Control: "volume badhao", "volume up", "volume kam karo", "mute karo"
  if (/\b(volume\s*(up|badhao|increase|badha\s*do)|sound\s*up)\b/i.test(lower)) {
    const plan = planAction("volume_change", "Volume Increase", { volumeAction: "up" }, ["Windows Audio Endpoint"]);
    return {
      handled: true,
      message: `🛡️ **Computer Action Approval Required**\n\nI have prepared an execution plan to increase audio volume.\n\n- **Target:** System Volume UP\n- **Risk Level:** LOW\n\nPlease approve or cancel this action.`,
      permissionPlan: plan,
    };
  }
  if (/\b(volume\s*(down|kam|decrease|ghatao)|sound\s*down)\b/i.test(lower)) {
    const plan = planAction("volume_change", "Volume Decrease", { volumeAction: "down" }, ["Windows Audio Endpoint"]);
    return {
      handled: true,
      message: `🛡️ **Computer Action Approval Required**\n\nI have prepared an execution plan to lower audio volume.\n\n- **Target:** System Volume DOWN\n- **Risk Level:** LOW\n\nPlease approve or cancel this action.`,
      permissionPlan: plan,
    };
  }
  if (/\b(mute|unmute|sound\s*band|awaaz\s*band)\b/i.test(lower)) {
    const plan = planAction("volume_change", "Volume Mute Toggle", { volumeAction: "mute" }, ["Windows Audio Endpoint"]);
    return {
      handled: true,
      message: `🛡️ **Computer Action Approval Required**\n\nI have prepared an execution plan to toggle audio mute.\n\n- **Target:** Audio Mute Toggle\n- **Risk Level:** LOW\n\nPlease approve or cancel this action.`,
      permissionPlan: plan,
    };
  }

  // 4. Web URLs / Popular Services: "open youtube", "open github", "youtube kholo", "open google"
  const urlPatterns: Record<string, string> = {
    youtube: "https://www.youtube.com",
    google: "https://www.google.com",
    chatgpt: "https://chatgpt.com",
    github: "https://www.github.com",
    twitter: "https://twitter.com",
    x: "https://x.com",
    reddit: "https://www.reddit.com",
    linkedin: "https://www.linkedin.com",
    netflix: "https://www.netflix.com",
    spotify: "https://open.spotify.com",
  };

  const webMatch = lower.match(/(?:open|launch|kholo|chalao)\s+([a-z0-9_-]+)(?:\.com|\.org|\.net)?$/i);
  if (webMatch) {
    const siteKey = webMatch[1].toLowerCase();
    if (urlPatterns[siteKey]) {
      const targetUrl = urlPatterns[siteKey];
      const plan = planAction("browser_open", targetUrl, { targetUrl }, ["Default Web Browser", "Windows Shell"]);
      return {
        handled: true,
        message: `🛡️ **Computer Action Approval Required**\n\nI have prepared an execution plan to open **${siteKey.toUpperCase()}** (${targetUrl}) in your default browser.\n\n- **Target:** ${targetUrl}\n- **Risk Level:** LOW\n\nPlease approve or cancel this action.`,
        permissionPlan: plan,
      };
    }
  }

  return null;
}

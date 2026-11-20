/**
 * @file components/UltronHudView.tsx
 * @description Stark Industries / Iron Man High-Fidelity Rainmeter-Style Sci-Fi Desktop HUD.
 *
 * Subsystem:
 * Presentation Layer — Futuristic Stark Industries HUD & Development Team Agent Deck.
 *
 * Key Responsibilities:
 * - Recreates the exact Rainmeter Iron Man / Stark Industries sci-fi HUD layout:
 *   1. Top edge-to-edge numbered ruler (01-30), Stark Industries logo & weather dial.
 *   2. Massive central rotating Arc Reactor HUD core (~600px) with degree ticks,
 *      concentric rotating rings, curved digital clock, 3D wireframe Ultron suit,
 *      angled telemetry wedges, and project status banner.
 *   3. Left modules: Large circular calendar dial, storage usage meters, energy dial,
 *      network IP gauge, game launcher, Google search bar, and AI Research card.
 *   4. Right modules: System CPU/RAM/SWAP telemetry, notepad with watermark,
 *      portal quick links, and Google news feed.
 *   5. Bottom 10 circular glowing HUD buttons representing the Development Team Agents
 *      with small glowing titles below each (NEXUS, ARCHITECT, FORGE, AEGIS, VELOCITY,
 *      ORBIT, CIPHER, PIXEL, VECTOR, CHRONO).
 *   6. Full interactive holographic Chat Drawer connecting to real `/api/chat`.
 */

"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Activity,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Layers,
  Lock,
  Maximize2,
  Mic,
  MicOff,
  Radio,
  Search,
  Send,
  Shield,
  Sparkles,
  Terminal,
  Volume2,
  Wifi,
  X,
} from "lucide-react";
import { ensureDesktopSession, ultronFetch, ultronJson } from "./workspace/apiClient";

interface AgentMeta {
  id: string;
  name: string;
  role: string;
  department: string;
  status: "ONLINE" | "BUSY" | "STANDBY";
  skills: string[];
  iconType: string;
}

const AGENTS: AgentMeta[] = [
  { id: "nexus", name: "NEXUS", role: "Lead Systems Agent", department: "Executive", status: "ONLINE", skills: ["Orchestration", "System Sync", "Governance"], iconType: "crosshair" },
  { id: "architect", name: "ARCHITECT", role: "Systems Architect", department: "Architecture", status: "ONLINE", skills: ["Topologies", "API Contracts", "Data Models"], iconType: "radar" },
  { id: "forge", name: "FORGE", role: "Core Engine Developer", department: "Engineering", status: "BUSY", skills: ["Rust/C++", "Next.js", "Python Bridge"], iconType: "rotor" },
  { id: "aegis", name: "AEGIS", role: "Security & Custody Officer", department: "Security", status: "ONLINE", skills: ["DPAPI", "AES-256-GCM", "Audit Gate"], iconType: "shield" },
  { id: "velocity", name: "VELOCITY", role: "DevOps & Build Specialist", department: "Infrastructure", status: "ONLINE", skills: ["Turbopack", "Electron Packaging", "CI/CD"], iconType: "chevron" },
  { id: "orbit", name: "ORBIT", role: "Task & DAG Orchestrator", department: "Workflows", status: "ONLINE", skills: ["DAG Scheduler", "Resource Queue", "Checkpoints"], iconType: "dualnode" },
  { id: "cipher", name: "CIPHER", role: "Memory Vault Custodian", department: "Intelligence", status: "ONLINE", skills: ["Episodic Vault", "Vector Ranking", "Deduplication"], iconType: "crescent" },
  { id: "pixel", name: "PIXEL", role: "Spatial UI/UX Engineer", department: "Creative", status: "BUSY", skills: ["HUD 3D CSS", "Motion Graphics", "Glassmorphism"], iconType: "iris" },
  { id: "vector", name: "VECTOR", role: "QA & Verification Gatekeeper", department: "Quality Assurance", status: "ONLINE", skills: ["Regression Battery", "Adversarial Testing", "Coverage"], iconType: "target" },
  { id: "chrono", name: "CHRONO", role: "Telemetry & Chrono Sync", department: "Operations", status: "ONLINE", skills: ["Loopback Sync", "Ollama Monitor", "Diagnostics"], iconType: "orbital" },
];

export default function UltronHudView() {
  const [timeStr, setTimeStr] = useState("22:38:00");
  const [hoursMin, setHoursMin] = useState("22:38");
  const [dayName, setDayName] = useState("ВТОРНИК");
  const [monthName, setMonthName] = useState("АПРЕЛЬ");
  const [dayNum, setDayNum] = useState("02");
  const [cpuUsage, setCpuUsage] = useState(36);
  const [ramUsage, setRamUsage] = useState(28);
  const [swapUsage, setSwapUsage] = useState(16);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Interactive Chat Drawer
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentMeta | null>(null);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    { role: "assistant", content: "ULTRON Neural Core online. All 10 development agents are operational. How can I assist you?" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Live Clock Updater
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, "0");
      const m = String(now.getMinutes()).padStart(2, "0");
      const s = String(now.getSeconds()).padStart(2, "0");
      setTimeStr(`${h}:${m}:${s}`);
      setHoursMin(`${h}:${m}`);
      
      const days = ["ВОСКРЕСЕНЬЕ", "ПОНЕДЕЛЬНИК", "ВТОРНИК", "СРЕДА", "ЧЕТВЕРГ", "ПЯТНИЦА", "СУББОТА"];
      const months = ["ЯНВАРЬ", "ФЕВРАЛЬ", "МАРТ", "АПРЕЛЬ", "МАЙ", "ИЮНЬ", "ИЮЛЬ", "АВГУСТ", "СЕНТЯБРЬ", "ОКТЯБРЬ", "НОЯБРЬ", "ДЕКАБРЬ"];
      setDayName(days[now.getDay()]);
      setMonthName(months[now.getMonth()]);
      setDayNum(String(now.getDate()).padStart(2, "0"));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Telemetry Poll
  useEffect(() => {
    let mounted = true;
    const fetchTelemetry = async () => {
      try {
        await ensureDesktopSession();
        const res = await ultronJson<{
          system?: { cpuLoad?: number; memoryUsedPercent?: number };
        }>("/api/dashboard");
        if (mounted && res.ok && res.data?.system) {
          if (typeof res.data.system.cpuLoad === "number") {
            setCpuUsage(Math.round(res.data.system.cpuLoad));
          }
          if (typeof res.data.system.memoryUsedPercent === "number") {
            setRamUsage(Math.round(res.data.system.memoryUsedPercent));
          }
        }
      } catch {
        // Fallback to stable default
      }
    };
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 8000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend || chatInput).trim();
    if (!content || isSending) return;
    
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    setIsSending(true);

    try {
      const token = await ensureDesktopSession();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "X-ULTRON-Session-Token": token } : {}),
        },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content }].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.reply || "Command executed successfully.";
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } else {
        const err = await res.text();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ Error executing command: ${err}` },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Connection failed: ${err.message}` },
      ]);
    } finally {
      setIsSending(false);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  const handleAgentClick = (agent: AgentMeta) => {
    setSelectedAgent(agent);
    setChatOpen(true);
  };

  const handleGoogleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`, "_blank");
    setSearchQuery("");
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#02050c] text-[#00e5ff] font-mono select-none">
      {/* Sci-Fi Background Grid & Center Radial Glow */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0, 229, 255, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 229, 255, 0.12) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(0, 200, 255, 0.14) 0%, rgba(2, 6, 18, 0.7) 65%, #01040a 100%)",
        }}
      />

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* 1. TOP EDGE-TO-EDGE TICK RULER BAR (01 TO 30) */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      <header className="absolute top-0 left-0 right-0 h-9 border-b border-[#00e5ff]/30 bg-[#010814]/80 backdrop-blur-md flex items-center justify-between px-3 z-30 text-[11px] tracking-widest text-[#00e5ff]/80">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[#00e5ff]">
            <span className="inline-block w-2 h-2 rounded-full bg-[#00e5ff] animate-ping" />
            <span className="font-bold">LIVE</span>
          </div>
          <span className="text-[#00e5ff]/40">|</span>
          <span className="text-[#00e5ff]/70 text-[10px]">SYS.VER: 4.2.0</span>
        </div>

        {/* The 01 - 30 Ruler */}
        <div className="hidden md:flex items-center justify-center gap-3 font-mono text-[10px] text-[#00e5ff]/60 overflow-hidden px-4">
          {Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, "0")).map((num) => (
            <div key={num} className="flex flex-col items-center">
              <span>{num}</span>
              <span className="w-[1px] h-1.5 bg-[#00e5ff]/40 mt-0.5" />
            </div>
          ))}
        </div>

        {/* Top-Right Stark Industries Brand & Weather */}
        <div className="flex items-center gap-4">
          <div className="text-right leading-none">
            <div className="font-bold text-[12px] tracking-wider text-white flex items-center gap-1.5">
              <span>STARK INDUSTRIES</span>
              <span className="text-[#00e5ff]">//</span>
              <span className="text-[#00e5ff]">ULTRON</span>
            </div>
            <div className="text-[9px] text-[#00e5ff]/50 mt-0.5">ADVANCED DEFENSE & AI SYSTEMS</div>
          </div>
          {/* Weather dial */}
          <div className="flex items-center gap-2 pl-2 border-l border-[#00e5ff]/30">
            <div className="relative w-8 h-8 rounded-full border border-[#00e5ff]/60 flex items-center justify-center text-[11px] font-bold text-white shadow-[0_0_8px_rgba(0,229,255,0.4)]">
              <span>3°</span>
              <div className="absolute inset-0 rounded-full border-t-2 border-[#00e5ff] animate-spin" style={{ animationDuration: "12s" }} />
            </div>
            <div className="text-[9px] text-[#00e5ff]/70 leading-tight">
              <div>Троицк, Россия</div>
              <div className="text-[#00e5ff]/50">Погода: Ясно</div>
            </div>
          </div>
        </div>
      </header>

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* 2. TOP CENTER TITLE: ULTRON */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      <div className="absolute top-11 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-auto cursor-pointer" onClick={() => setChatOpen(true)}>
        <h1
          className="text-3xl lg:text-4xl font-extrabold tracking-[0.4em] text-white"
          style={{
            textShadow:
              "0 0 10px rgba(0, 229, 255, 0.9), 0 0 25px rgba(0, 229, 255, 0.6), 0 0 45px rgba(0, 229, 255, 0.3)",
          }}
        >
          ULTRON
        </h1>
        <div className="flex items-center justify-center gap-2 mt-0.5 text-[10px] tracking-[0.25em] text-[#00e5ff]/70">
          <span className="w-6 h-[1px] bg-[#00e5ff]/50" />
          <span>AUTONOMOUS DESKTOP INTELLIGENCE</span>
          <span className="w-6 h-[1px] bg-[#00e5ff]/50" />
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* 3. CENTER MASSIVE ARC REACTOR CORE HUD (550px - 620px diameter) */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] lg:w-[620px] lg:h-[620px] pointer-events-none z-10 flex items-center justify-center">
        {/* Outer Degree Scale Ring */}
        <div className="absolute inset-0 rounded-full border border-[#00e5ff]/20 shadow-[0_0_30px_rgba(0,229,255,0.15)] flex items-center justify-center">
          <div className="absolute inset-2 rounded-full border border-dashed border-[#00e5ff]/30 animate-spin" style={{ animationDuration: "90s" }} />
          <div className="absolute inset-6 rounded-full border border-[#00e5ff]/25" />
        </div>

        {/* Rotating Outer Tech Cog Ring */}
        <div
          className="absolute inset-10 rounded-full border-2 border-transparent border-t-[#00e5ff]/70 border-b-[#00e5ff]/70 animate-spin shadow-[0_0_20px_rgba(0,229,255,0.2)]"
          style={{ animationDuration: "40s" }}
        />

        {/* Counter-Rotating Segmented Ring */}
        <div
          className="absolute inset-16 rounded-full border border-[#00e5ff]/30 animate-spin"
          style={{ animationDuration: "25s", animationDirection: "reverse" }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-1 bg-[#00e5ff] shadow-[0_0_8px_#00e5ff]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-1 bg-[#00e5ff] shadow-[0_0_8px_#00e5ff]" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3 bg-[#00e5ff] shadow-[0_0_8px_#00e5ff]" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-3 bg-[#00e5ff] shadow-[0_0_8px_#00e5ff]" />
        </div>

        {/* Curved Top Arc Clock: 22:38 */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 text-center">
          <div
            className="text-2xl font-bold tracking-widest text-white"
            style={{
              textShadow: "0 0 12px rgba(0,229,255,0.9), 0 0 24px rgba(0,229,255,0.5)",
            }}
          >
            {hoursMin}
          </div>
          <div className="text-[9px] tracking-wider text-[#00e5ff]/70">SYSTEM SYNCHRONIZED</div>
        </div>

        {/* Inner Arc Reactor Core SVG with Holographic Ultron Suit Silhouette */}
        <svg className="w-[320px] h-[320px] lg:w-[380px] lg:h-[380px]" viewBox="0 0 400 400">
          <defs>
            <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.4" />
              <stop offset="60%" stopColor="#0077aa" stopOpacity="0.1" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Central Reactor Glow Circle */}
          <circle cx="200" cy="200" r="140" fill="url(#coreGlow)" />
          <circle cx="200" cy="200" r="130" stroke="#00e5ff" strokeWidth="1" strokeDasharray="8 6" opacity="0.6" />
          <circle cx="200" cy="200" r="110" stroke="#00e5ff" strokeWidth="1.5" opacity="0.4" />
          <circle cx="200" cy="200" r="80" stroke="#00e5ff" strokeWidth="2" strokeDasharray="16 10" opacity="0.8" />

          {/* 3-Blade Arc Reactor Vanes */}
          <g transform="rotate(30 200 200)">
            <line x1="200" y1="120" x2="200" y2="80" stroke="#00e5ff" strokeWidth="3" strokeLinecap="round" />
            <line x1="130" y1="240" x2="95" y2="260" stroke="#00e5ff" strokeWidth="3" strokeLinecap="round" />
            <line x1="270" y1="240" x2="305" y2="260" stroke="#00e5ff" strokeWidth="3" strokeLinecap="round" />
          </g>

          {/* Holographic Wireframe Ultron / Iron Man Armor Silhouette */}
          <g transform="translate(130, 95) scale(0.7)" stroke="#00e5ff" strokeWidth="1.5" fill="none" opacity="0.85">
            {/* Head & Helmet */}
            <path d="M 100 30 L 115 45 L 115 65 L 105 75 L 95 75 L 85 65 L 85 45 Z" strokeWidth="2" fill="rgba(0, 229, 255, 0.15)" />
            {/* Glowing Eyes */}
            <line x1="90" y1="52" x2="96" y2="52" stroke="#fff" strokeWidth="2" />
            <line x1="104" y1="52" x2="110" y2="52" stroke="#fff" strokeWidth="2" />
            {/* Neck & Shoulders */}
            <line x1="95" y1="75" x2="95" y2="85" />
            <line x1="105" y1="75" x2="105" y2="85" />
            <path d="M 60 95 L 85 85 L 115 85 L 140 95 L 130 135 L 70 135 Z" strokeWidth="1.8" />
            {/* Chest Arc Reactor (Heart) */}
            <circle cx="100" cy="110" r="10" stroke="#fff" strokeWidth="2.5" fill="#00e5ff" />
            {/* Abdomen & Torso Plates */}
            <path d="M 75 135 L 85 170 L 115 170 L 125 135" />
            <line x1="85" y1="150" x2="115" y2="150" />
            {/* Pelvis & Legs */}
            <path d="M 85 170 L 75 220 L 85 220 L 95 180" />
            <path d="M 115 170 L 125 220 L 115 220 L 105 180" />
            {/* Arms & Gauntlets */}
            <path d="M 60 95 L 50 145 L 58 175" />
            <path d="M 140 95 L 150 145 L 142 175" />
          </g>

          {/* Diagnostic Leader Lines */}
          <path d="M 70 170 L 120 170 L 135 150" stroke="#00e5ff" strokeWidth="1" fill="none" opacity="0.6" />
          <path d="M 330 180 L 280 180 L 265 160" stroke="#00e5ff" strokeWidth="1" fill="none" opacity="0.6" />
          <text x="50" y="165" fill="#00e5ff" fontSize="9" letterSpacing="1" opacity="0.8">SYSTEM DIAGNOSTICS</text>
          <text x="270" y="175" fill="#00e5ff" fontSize="9" letterSpacing="1" opacity="0.8">AUXILIARY FAN: 94%</text>
        </svg>

        {/* Angled Left HUD Gauge Wedge (Disk / Upload / CPU Fan) */}
        <div className="absolute left-6 lg:left-12 bottom-20 w-36 text-[9px] p-2 bg-[#010a18]/70 border border-[#00e5ff]/40 rounded backdrop-blur-sm pointer-events-auto">
          <div className="flex justify-between text-[10px] font-bold text-white mb-1">
            <span>DISK STATUS</span>
            <span className="text-[#00e5ff]">54%</span>
          </div>
          <div className="w-full bg-[#00e5ff]/15 h-1.5 rounded-full overflow-hidden mb-2">
            <div className="bg-[#00e5ff] h-full w-[54%] shadow-[0_0_6px_#00e5ff]" />
          </div>
          <div className="flex justify-between text-[10px] font-bold text-white mb-1">
            <span>CORE INTEGRITY</span>
            <span className="text-[#00e5ff]">100%</span>
          </div>
          <div className="w-full bg-[#00e5ff]/15 h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#00e5ff] h-full w-full shadow-[0_0_6px_#00e5ff]" />
          </div>
        </div>

        {/* Angled Right HUD Gauge Wedge (System Telemetry) */}
        <div className="absolute right-6 lg:right-12 bottom-20 w-36 text-[9px] p-2 bg-[#010a18]/70 border border-[#00e5ff]/40 rounded backdrop-blur-sm pointer-events-auto">
          <div className="flex justify-between text-[10px] font-bold text-white mb-1">
            <span>HARD DRIVE</span>
            <span className="text-[#00e5ff]">ONLINE</span>
          </div>
          <div className="w-full bg-[#00e5ff]/15 h-1.5 rounded-full overflow-hidden mb-2">
            <div className="bg-[#00e5ff] h-full w-[85%] shadow-[0_0_6px_#00e5ff]" />
          </div>
          <div className="flex justify-between text-[10px] font-bold text-white mb-1">
            <span>GPU THERMAL</span>
            <span className="text-[#00e5ff]">42°C</span>
          </div>
          <div className="w-full bg-[#00e5ff]/15 h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#00e5ff] h-full w-[42%] shadow-[0_0_6px_#00e5ff]" />
          </div>
        </div>

        {/* Bottom Project Readout Box */}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-80 text-center bg-[#010a18]/80 border border-[#00e5ff]/40 px-3 py-1.5 rounded backdrop-blur-sm pointer-events-auto">
          <div className="flex items-center justify-between text-[10px] text-[#00e5ff]/80 mb-1">
            <span className="font-bold text-white">Проект // ULTRON AI</span>
            <span className="text-emerald-400">ACTIVE</span>
          </div>
          <div className="w-full flex gap-1 h-1.5">
            {Array.from({ length: 18 }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 rounded-sm ${i < 13 ? "bg-[#00e5ff] shadow-[0_0_4px_#00e5ff]" : "bg-[#00e5ff]/20"}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* 4. LEFT SIDE MODULES */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      <aside className="absolute left-4 top-14 bottom-24 w-64 lg:w-72 flex flex-col justify-between pointer-events-auto z-20 space-y-2">
        {/* Large Circular Calendar Widget */}
        <div className="bg-[#010916]/80 border border-[#00e5ff]/35 rounded-lg p-3 backdrop-blur-md shadow-[0_0_15px_rgba(0,229,255,0.15)] flex items-center gap-3">
          <div className="relative w-16 h-16 rounded-full border-2 border-[#00e5ff]/70 flex flex-col items-center justify-center text-center shadow-[0_0_12px_rgba(0,229,255,0.4)]">
            <span className="text-[9px] text-[#00e5ff]/70 leading-none">{monthName}</span>
            <span className="text-2xl font-black text-white leading-none mt-0.5">{dayNum}</span>
            <div className="absolute inset-0 rounded-full border-t-2 border-[#00e5ff] animate-spin" style={{ animationDuration: "16s" }} />
          </div>
          <div className="text-[11px] leading-snug">
            <div className="font-bold text-white tracking-wider">{dayName}</div>
            <div className="text-sm font-black text-[#00e5ff] tracking-widest">{timeStr}</div>
            <div className="text-[9px] text-[#00e5ff]/50 mt-0.5">ВРЕМЯ РАБОТЫ: 4 ч 33 мин</div>
          </div>
        </div>

        {/* AI Research Image Card (User requested: "jaha car dikh rahi hai vaha research images hongi") */}
        <div className="bg-[#010916]/80 border border-[#00e5ff]/35 rounded-lg p-2.5 backdrop-blur-md shadow-[0_0_15px_rgba(0,229,255,0.15)]">
          <div className="flex items-center justify-between text-[10px] text-[#00e5ff]/80 mb-1.5 font-bold">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#00e5ff]" />
              <span>RESEARCH // TOPOLOGY</span>
            </span>
            <span className="px-1.5 py-0.2 bg-[#00e5ff]/20 text-[#00e5ff] text-[9px] rounded">LIVE</span>
          </div>
          {/* Animated Neural Network / Research Visual Surface */}
          <div className="relative h-24 rounded border border-[#00e5ff]/40 bg-gradient-to-br from-[#002244] via-[#001122] to-[#010916] overflow-hidden flex items-center justify-center">
            {/* SVG Waveform Simulation */}
            <svg className="w-full h-full opacity-80" viewBox="0 0 200 80">
              <path
                d="M 0 40 Q 50 10, 100 40 T 200 40"
                fill="none"
                stroke="#00e5ff"
                strokeWidth="2"
              >
                <animate
                  attributeName="d"
                  values="M 0 40 Q 50 10, 100 40 T 200 40; M 0 40 Q 50 70, 100 40 T 200 40; M 0 40 Q 50 10, 100 40 T 200 40"
                  dur="4s"
                  repeatCount="indefinite"
                />
              </path>
              <circle cx="50" cy="25" r="3" fill="#fff" />
              <circle cx="100" cy="40" r="4" fill="#00e5ff" />
              <circle cx="150" cy="55" r="3" fill="#fff" />
              <line x1="50" y1="25" x2="100" y2="40" stroke="#00e5ff" strokeWidth="1" strokeDasharray="2 2" />
              <line x1="100" y1="40" x2="150" y2="55" stroke="#00e5ff" strokeWidth="1" strokeDasharray="2 2" />
            </svg>
            <div className="absolute bottom-1 left-2 text-[8px] text-white/80 font-mono tracking-wider">
              QUANTUM NEURAL TOPOLOGY SIMULATION
            </div>
          </div>
        </div>

        {/* Disk Space & Storage Breakdown */}
        <div className="bg-[#010916]/80 border border-[#00e5ff]/35 rounded-lg p-2.5 backdrop-blur-md text-[10px] space-y-1.5">
          <div className="flex justify-between font-bold text-white">
            <span>ДИСК C:</span>
            <span className="text-[#00e5ff]">СВОБОДНО 209 G / 450 G</span>
          </div>
          <div className="w-full bg-[#00e5ff]/15 h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#00e5ff] h-full w-[54%]" />
          </div>
          <div className="flex justify-between font-bold text-white">
            <span>ДИСК D:</span>
            <span className="text-[#00e5ff]">СВОБОДНО 380 G / 500 G</span>
          </div>
          <div className="w-full bg-[#00e5ff]/15 h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#00e5ff] h-full w-[24%]" />
          </div>
        </div>

        {/* Energy & Network IP Dial */}
        <div className="bg-[#010916]/80 border border-[#00e5ff]/35 rounded-lg p-2.5 backdrop-blur-md flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-2">
            <div className="relative w-10 h-10 rounded-full border border-[#00e5ff]/60 flex items-center justify-center font-bold text-[9px] text-white">
              100%
              <div className="absolute inset-0 rounded-full border-b border-[#00e5ff] animate-spin" style={{ animationDuration: "8s" }} />
            </div>
            <div>
              <div className="font-bold text-white">ЭНЕРГИЯ: 100%</div>
              <div className="text-[9px] text-[#00e5ff]/60">510 ФАЙЛОВ / 19.9 GB</div>
            </div>
          </div>
          <div className="text-right text-[9px]">
            <div className="text-white font-mono">88.205.188.122</div>
            <div className="text-[#00e5ff]/60">UP 0.0 KB | DN 0.0 KB</div>
          </div>
        </div>

        {/* Game / App Launcher Box */}
        <div className="bg-[#010916]/80 border border-[#00e5ff]/35 rounded-lg p-2.5 backdrop-blur-md text-[10px]">
          <div className="font-bold text-white mb-1 tracking-wider text-[9px]">ПРИЛОЖЕНИЯ // ИГРЫ:</div>
          <div className="grid grid-cols-2 gap-1 text-[9px] text-[#00e5ff]/80">
            <div className="hover:text-white cursor-pointer transition-colors">▶ Crysis</div>
            <div className="hover:text-white cursor-pointer transition-colors">▶ Crysis 2</div>
            <div className="hover:text-white cursor-pointer transition-colors">▶ Harry Potter 7</div>
            <div className="hover:text-white cursor-pointer transition-colors">▶ Warcraft II</div>
          </div>
          <div className="flex justify-between pt-1.5 mt-1.5 border-t border-[#00e5ff]/20 text-[9px]">
            <span className="hover:text-amber-400 cursor-pointer">⏻ Выключение</span>
            <span className="hover:text-cyan-300 cursor-pointer">↻ Перезагрузка</span>
          </div>
        </div>

        {/* Google Search Bar at Bottom-Left */}
        <form onSubmit={handleGoogleSearch} className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ПОИСК В GOOGLE..."
            className="w-full bg-[#010916]/90 border border-[#00e5ff]/50 rounded px-2.5 py-1.5 text-xs text-white placeholder-[#00e5ff]/40 focus:outline-none focus:border-[#00e5ff] shadow-[0_0_10px_rgba(0,229,255,0.2)]"
          />
          <button type="submit" className="absolute right-2 top-2 text-[#00e5ff]/60 hover:text-white">
            <Search className="w-3.5 h-3.5" />
          </button>
        </form>
      </aside>

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* 5. RIGHT SIDE MODULES */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      <aside className="absolute right-4 top-14 bottom-24 w-64 lg:w-72 flex flex-col justify-between pointer-events-auto z-20 space-y-2">
        {/* System Resource Telemetry (СИСТЕМА) */}
        <div className="bg-[#010916]/80 border border-[#00e5ff]/35 rounded-lg p-3 backdrop-blur-md shadow-[0_0_15px_rgba(0,229,255,0.15)] text-[10px] space-y-2">
          <div className="flex items-center justify-between font-bold text-white border-b border-[#00e5ff]/25 pb-1">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[#00e5ff]" />
              <span>СИСТЕМА // TELEMETRY</span>
            </span>
            <span className="text-[#00e5ff] text-[9px]">ONLINE</span>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span>CPU Использовано:</span>
              <span className="font-bold text-white">{cpuUsage}%</span>
            </div>
            <div className="w-full bg-[#00e5ff]/15 h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#00e5ff] h-full transition-all duration-500 shadow-[0_0_6px_#00e5ff]" style={{ width: `${cpuUsage}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span>RAM Использовано:</span>
              <span className="font-bold text-white">{ramUsage}%</span>
            </div>
            <div className="w-full bg-[#00e5ff]/15 h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#00e5ff] h-full transition-all duration-500 shadow-[0_0_6px_#00e5ff]" style={{ width: `${ramUsage}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span>SWAP Использовано:</span>
              <span className="font-bold text-white">{swapUsage}%</span>
            </div>
            <div className="w-full bg-[#00e5ff]/15 h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#00e5ff] h-full transition-all duration-500 shadow-[0_0_6px_#00e5ff]" style={{ width: `${swapUsage}%` }} />
            </div>
          </div>
        </div>

        {/* Notepad / System Dossier with Stark Industries Watermark */}
        <div className="relative bg-[#010916]/80 border border-[#00e5ff]/35 rounded-lg p-3 backdrop-blur-md shadow-[0_0_15px_rgba(0,229,255,0.15)] text-[10px] leading-relaxed overflow-hidden">
          {/* Faint Watermark Logo */}
          <div className="absolute right-2 bottom-2 text-[#00e5ff]/10 text-5xl font-black pointer-events-none select-none">
            STARK
          </div>
          <div className="font-bold text-white mb-1.5 flex items-center justify-between border-b border-[#00e5ff]/20 pb-1">
            <span>БЛОКНОТ // ДОСЬЕ</span>
            <span className="text-[9px] text-[#00e5ff]/60">V.4</span>
          </div>
          <p className="text-[#00e5ff]/80 text-[9px] italic">
            Сосняком по откосам кудрявится<br />
            Пограничный скупой кругозор.<br />
            Принимай нас, Суоми-красавица,<br />
            В ожерелье прозрачных озёр!<br />
            Ломят танки широкие просеки,<br />
            Самолёты кружат в облаках...
          </p>
        </div>

        {/* Portal & Social Links List */}
        <div className="bg-[#010916]/80 border border-[#00e5ff]/35 rounded-lg p-2.5 backdrop-blur-md text-[10px]">
          <div className="font-bold text-white mb-1.5 text-[9px] tracking-wider">ПОРТАЛЫ // СВЯЗЬ:</div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] text-[#00e5ff]/80">
            <a href="https://vk.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">◈ В контакте</a>
            <a href="https://mail.ru" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">◈ Mail.ru</a>
            <a href="https://ok.ru" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">◈ Одноклассники</a>
            <a href="https://yandex.ru" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">◈ Яндекс</a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">◈ Twitter</a>
            <a href="https://facebook.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">◈ Facebook</a>
            <a href="https://youtube.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">◈ YouTube</a>
            <a href="https://wikipedia.org" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">◈ Wikipedia</a>
          </div>
        </div>

        {/* News Feed // Google */}
        <div className="bg-[#010916]/80 border border-[#00e5ff]/35 rounded-lg p-2.5 backdrop-blur-md text-[10px]">
          <div className="font-bold text-white mb-1.5 text-[9px] flex items-center justify-between border-b border-[#00e5ff]/20 pb-1">
            <span>НОВОСТИ // GOOGLE</span>
            <span className="text-emerald-400 text-[8px] animate-pulse">FEED ACTIVE</span>
          </div>
          <ul className="space-y-1 text-[9px] text-[#00e5ff]/80">
            <li className="truncate hover:text-white cursor-pointer">▪ Дочь Джона Кеннеди может стать представителем...</li>
            <li className="truncate hover:text-white cursor-pointer">▪ Янукович обнародовал декларацию о доходах...</li>
            <li className="truncate hover:text-white cursor-pointer">▪ Чехия разрешила медицинскую марихуану...</li>
          </ul>
        </div>
      </aside>

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* 6. BOTTOM ROW: 10 CIRCULAR GLOWING HUD BUTTONS (DEVELOPMENT TEAM AGENTS) */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      <footer className="absolute bottom-2 left-0 right-0 h-20 flex items-center justify-center gap-3 lg:gap-5 px-4 z-30 pointer-events-auto">
        {AGENTS.map((agent, index) => {
          const isSelected = selectedAgent?.id === agent.id && chatOpen;
          return (
            <button
              key={agent.id}
              onClick={() => handleAgentClick(agent)}
              className="group flex flex-col items-center focus:outline-none transition-transform duration-200 hover:-translate-y-1"
            >
              {/* Double Concentric Circular Glowing Button */}
              <div
                className={`relative w-12 h-12 lg:w-14 lg:h-14 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                  isSelected
                    ? "border-white bg-[#00e5ff]/30 shadow-[0_0_20px_#00e5ff,inset_0_0_10px_#00e5ff]"
                    : "border-[#00e5ff]/70 bg-[#010916]/80 hover:border-white hover:shadow-[0_0_15px_rgba(0,229,255,0.8)] shadow-[0_0_8px_rgba(0,229,255,0.3)]"
                }`}
              >
                {/* Rotating Outer Arc Ring on Hover */}
                <div
                  className="absolute inset-0.5 rounded-full border border-dashed border-[#00e5ff]/40 group-hover:animate-spin"
                  style={{ animationDuration: "8s" }}
                />

                {/* Vector HUD Icon matching reference design */}
                <div className="relative text-[#00e5ff] group-hover:text-white transition-colors">
                  {agent.iconType === "crosshair" && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="8" />
                      <line x1="12" y1="2" x2="12" y2="6" />
                      <line x1="12" y1="18" x2="12" y2="22" />
                      <line x1="2" y1="12" x2="6" y2="12" />
                      <line x1="18" y1="12" x2="22" y2="12" />
                    </svg>
                  )}
                  {agent.iconType === "radar" && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 12 L20 8" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                  {agent.iconType === "rotor" && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2 L12 6 M12 18 L12 22 M2 12 L6 12 M18 12 L22 12" />
                      <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
                    </svg>
                  )}
                  {agent.iconType === "shield" && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3 L20 7 V12 C20 17 12 21 12 21 C12 21 4 17 4 12 V7 Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                  {agent.iconType === "chevron" && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 15 L12 9 L18 15" />
                      <path d="M6 19 L12 13 L18 19" />
                    </svg>
                  )}
                  {agent.iconType === "dualnode" && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="7" cy="12" r="3" />
                      <circle cx="17" cy="12" r="3" />
                      <line x1="10" y1="12" x2="14" y2="12" />
                    </svg>
                  )}
                  {agent.iconType === "crescent" && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 12 A6 6 0 1 1 12 6 A8 8 0 0 0 18 12 Z" />
                    </svg>
                  )}
                  {agent.iconType === "iris" && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 3 19 8 19 16 12 21 5 16 5 8" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                  {agent.iconType === "target" && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <circle cx="12" cy="12" r="5" />
                      <circle cx="12" cy="12" r="1" fill="currentColor" />
                    </svg>
                  )}
                  {agent.iconType === "orbital" && (
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(30 12 12)" />
                      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)" />
                      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Small Glowing Agent Name Below Each Button */}
              <span className="text-[10px] font-bold tracking-wider mt-1.5 text-[#00e5ff]/80 group-hover:text-white transition-colors">
                {agent.name}
              </span>
            </button>
          );
        })}
      </footer>

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* 7. INTERACTIVE HOLOGRAPHIC CHAT & AGENT DECK DRAWER */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {chatOpen && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[460px] bg-[#020917]/95 border-l border-[#00e5ff]/50 backdrop-blur-xl z-50 flex flex-col shadow-[-10px_0_30px_rgba(0,229,255,0.25)]">
          {/* Header */}
          <div className="h-14 border-b border-[#00e5ff]/30 px-4 flex items-center justify-between bg-[#010d22]/80">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-[#00e5ff]" />
              <div>
                <div className="font-bold text-sm text-white tracking-wide flex items-center gap-2">
                  <span>{selectedAgent ? `${selectedAgent.name} // AGENT DECK` : "ULTRON NEURAL TERMINAL"}</span>
                  <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/40">
                    ONLINE
                  </span>
                </div>
                <div className="text-[10px] text-[#00e5ff]/60">
                  {selectedAgent ? selectedAgent.role : "Local Desktop Intelligence & Voice Bridge"}
                </div>
              </div>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="text-[#00e5ff]/60 hover:text-white p-1 rounded hover:bg-[#00e5ff]/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Agent Meta Pill Bar */}
          {selectedAgent && (
            <div className="px-4 py-2 border-b border-[#00e5ff]/20 bg-[#00142e]/50 flex flex-wrap gap-1.5 text-[10px]">
              <span className="text-[#00e5ff]/60">Skills:</span>
              {selectedAgent.skills.map((skill) => (
                <span key={skill} className="px-1.5 py-0.5 bg-[#00e5ff]/15 text-[#00e5ff] rounded">
                  {skill}
                </span>
              ))}
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div className="text-[9px] text-[#00e5ff]/50 mb-1">
                  {m.role === "user" ? "ASHISH // COMMAND" : (selectedAgent?.name || "ULTRON")}
                </div>
                <div
                  className={`max-w-[85%] rounded-lg p-3 leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-[#00e5ff]/20 border border-[#00e5ff]/50 text-white shadow-[0_0_10px_rgba(0,229,255,0.2)]"
                      : "bg-[#01142e]/80 border border-[#00e5ff]/30 text-[#00e5ff]/90 shadow-[0_0_8px_rgba(0,229,255,0.1)]"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex items-center gap-2 text-xs text-[#00e5ff]/70 italic">
                <span className="inline-block w-2 h-2 rounded-full bg-[#00e5ff] animate-ping" />
                <span>Processing verified desktop operation...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-3 py-1.5 border-t border-[#00e5ff]/20 bg-[#010e24] flex gap-2 overflow-x-auto text-[10px]">
            <button
              onClick={() => handleSendMessage("who am i")}
              className="shrink-0 px-2 py-1 bg-[#00e5ff]/10 hover:bg-[#00e5ff]/25 border border-[#00e5ff]/30 rounded text-[#00e5ff]"
            >
              Who am I
            </button>
            <button
              onClick={() => handleSendMessage("What desktop and research tools are currently available, and which actions require approval?")}
              className="shrink-0 px-2 py-1 bg-[#00e5ff]/10 hover:bg-[#00e5ff]/25 border border-[#00e5ff]/30 rounded text-[#00e5ff]"
            >
              Available Tools
            </button>
            <button
              onClick={() => handleSendMessage("ultron me chrome me docss open karo or sari docs files pado")}
              className="shrink-0 px-2 py-1 bg-[#00e5ff]/10 hover:bg-[#00e5ff]/25 border border-[#00e5ff]/30 rounded text-[#00e5ff]"
            >
              Docs Reader
            </button>
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 border-t border-[#00e5ff]/30 bg-[#010d22] flex gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask Ultron or assign task to agent..."
              disabled={isSending}
              className="flex-1 bg-[#01142e] border border-[#00e5ff]/40 rounded px-3 py-2 text-xs text-white placeholder-[#00e5ff]/40 focus:outline-none focus:border-[#00e5ff] shadow-[inset_0_0_6px_rgba(0,229,255,0.2)]"
            />
            <button
              type="submit"
              disabled={isSending || !chatInput.trim()}
              className="px-3.5 py-2 rounded bg-[#00e5ff]/20 hover:bg-[#00e5ff]/40 text-[#00e5ff] border border-[#00e5ff]/60 disabled:opacity-40 transition-colors flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

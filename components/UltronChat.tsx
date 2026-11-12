/**
 * @file components/UltronChat.tsx
 * @description Primary client-side ChatGPT-style UI for ULTRON with conversation history,
 * local desktop app execution, autonomous quantum web research, and rich markdown rendering.
 * 
 * Subsystem:
 * Core Interactive Chat Interface & Session State Manager.
 * 
 * Key Responsibilities:
 * - Manages multi-session conversation history with auto-save to browser storage (`localStorage`).
 * - Supports real-time Server-Sent Events (SSE) streaming with live execution status updates.
 * - Auto-generates concise conversation titles based on user's opening prompt.
 * - Provides instantaneous chronological grouping (Today, Yesterday, Last 7 Days, Older) and search filter.
 * - Integrates with ULTRON backend route `/api/chat` supporting app launching and web research.
 * - Features rich code block rendering, 1-click clipboard copying, and Markdown/JSON export.
 * 
 * Architectural Role & Interactions:
 * - Replaces the legacy 3D orb HUD and voice recording with an ultra-clean, high-throughput text interface.
 * - Connects directly to `app/api/chat/route.ts` using fetch with `activationMode: "PUSH_TO_TALK"`
 *   to ensure deterministic execution without requiring wake-words.
 * 
 * Safety / Security Guarantees:
 * - Encapsulates all conversation records on the local machine (no third-party cloud analytics).
 * - Implements request abort signals allowing the user to instantly cancel in-flight model generation.
 */

"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import ScreenAwarenessIndicator from "./ScreenAwarenessIndicator";
import TaskOrchestrationModal from "./TaskOrchestrationModal";

/** Metadata attached to assistant responses (citations, grounding source, execution time). */
export interface MessageMeta {
  grounded?: boolean;
  degraded?: boolean;
  usedLocalRule?: boolean;
  usedResearch?: boolean;
  usedTool?: boolean;
  intent?: string;
  sources?: Array<{
    title: string;
    url: string;
    domain: string;
    credibility_score?: number;
  }>;
  executionTimeMs?: number;
}

export interface MemoryItem {
  id: string;
  key: string;
  category: "profile" | "preference" | "project" | "fact" | "instruction";
  content: string;
  importance: number;
  source: string;
  updatedAt: number;
}

/** Individual turn in a conversation. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  meta?: MessageMeta;
}

/** Full conversation session with unique ID and timestamps. */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  modelMode: "hybrid" | "research" | "desktop";
}

/** Live status narration event emitted from server during SSE generation. */
interface SseStatus {
  phase: string;
  progress: number;
  message: string;
}

const STORAGE_KEY = "ultron_conversations_v2";
const ACTIVE_CONV_KEY = "ultron_active_conv_id";

/**
 * Creates a unique random string ID for messages and conversations.
 *
 * @returns Cryptographically unique hexadecimal identifier.
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/**
 * Derives a readable, concise title from the user's first prompt.
 *
 * @param prompt - Initial user query.
 * @returns Clean 3 to 6 word title.
 */
function generateTitleFromPrompt(prompt: string): string {
  const clean = prompt
    .replace(/[^\w\s-]/gi, "")
    .trim()
    .split(/\s+/);
  if (clean.length === 0 || !clean[0]) return "New Conversation";
  const words = clean.slice(0, 5).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Categorizes a timestamp into chronological human buckets.
 *
 * @param timestamp - Epoch millisecond timestamp.
 * @returns Bucket label ("Today", "Yesterday", "Previous 7 Days", "Older").
 */
function getChronologicalBucket(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0 && now.getDate() === date.getDate()) return "Today";
  if (diffDays <= 1) return "Yesterday";
  if (diffDays < 7) return "Previous 7 Days";
  return "Older";
}

export default function UltronChat() {
  // ── Conversation State ──────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // ── Chat & Generation State ─────────────────────────────────────────────
  const [inputPrompt, setInputPrompt] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [liveStatus, setLiveStatus] = useState<SseStatus | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState<string>("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // ── Neural Memory Vault Modal State ─────────────────────────────────────
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState<boolean>(false);
  const [isOrchestrationModalOpen, setIsOrchestrationModalOpen] = useState<boolean>(false);
  const [memoriesList, setMemoriesList] = useState<MemoryItem[]>([]);
  const [newMemoryInput, setNewMemoryInput] = useState<string>("");
  const [newMemoryCat, setNewMemoryCat] = useState<"profile" | "preference" | "project" | "fact" | "instruction">("fact");
  const [isSavingMemory, setIsSavingMemory] = useState<boolean>(false);

  // ── System Status & Refs ────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── 1. Initial Load from LocalStorage ───────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Sanitize every conversation to prevent hydration or type crashes
          const sanitized: Conversation[] = parsed
            .filter((c): c is Conversation => Boolean(c && typeof c === "object" && typeof c.id === "string"))
            .map((c) => ({
              id: c.id,
              title: c.title || "Conversation",
              createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
              updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : Date.now(),
              modelMode: "hybrid",
              messages: Array.isArray(c.messages)
                ? c.messages.filter((m): m is ChatMessage => Boolean(m && typeof m === "object" && typeof m.content === "string"))
                : [],
            }));

          if (sanitized.length > 0) {
            setConversations(sanitized);
            const savedActiveId = localStorage.getItem(ACTIVE_CONV_KEY);
            if (savedActiveId && sanitized.some((c) => c.id === savedActiveId)) {
              setActiveId(savedActiveId);
            } else {
              setActiveId(sanitized[0].id);
            }
            return;
          }
        }
      }
    } catch (e) {
      console.warn("Could not load stored conversations:", e);
    }

    // Default seed conversation if none exists
    const initialConv: Conversation = {
      id: generateId(),
      title: "Welcome to ULTRON",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelMode: "hybrid",
      messages: [
        {
          id: generateId(),
          role: "assistant",
          content:
            "Greetings. I am **ULTRON**, your autonomous desktop intelligence.\n\n" +
            "I can execute local desktop actions, research live web topics with verified citations, " +
            "perform rapid mathematical calculations, and write production-grade code.\n\n" +
            "How can I assist your workflow today?",
          timestamp: Date.now(),
          meta: {
            grounded: true,
            usedLocalRule: true,
          },
        },
      ],
    };

    setConversations([initialConv]);
    setActiveId(initialConv.id);
  }, []);

  // ── 2. Persist to LocalStorage whenever conversations change ────────────
  useEffect(() => {
    if (conversations.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      } catch (err) {
        console.error("Failed to persist conversations to localStorage:", err);
      }
    }
  }, [conversations]);

  // ── 3. Persist Active ID ───────────────────────────────────────────────
  useEffect(() => {
    if (activeId) {
      localStorage.setItem(ACTIVE_CONV_KEY, activeId);
    }
  }, [activeId]);

  // ── 4. Auto-scroll to bottom of chat ────────────────────────────────────
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom("smooth");
  }, [conversations, activeId, liveStatus, isGenerating]);

  // ── 5. Always Auto-Focus Composer Textarea (Zero Click Requirement) ─────
  useEffect(() => {
    if (!isMemoryModalOpen) {
      textareaRef.current?.focus();
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isGenerating, isMemoryModalOpen, activeId]);

  // ── 6. Global Keystroke Capture (Type anywhere to focus chat input) ──────
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcut combinations (Ctrl/Alt/Meta) and inside modal
      if (e.ctrlKey || e.altKey || e.metaKey || isMemoryModalOpen) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      // If user presses any standard printable key or Backspace, auto-focus textarea
      if (e.key.length === 1 || e.key === "Backspace") {
        textareaRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isMemoryModalOpen]);

  // ── Current active conversation ─────────────────────────────────────────
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeId) || conversations[0] || null;
  }, [conversations, activeId]);

  // ── Filtered conversations by search query ──────────────────────────────
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(query) ||
        c.messages.some((m) => m.content.toLowerCase().includes(query))
    );
  }, [conversations, searchQuery]);

  // ── Grouped conversations by date bucket ────────────────────────────────
  const groupedConversations = useMemo(() => {
    const groups: Record<string, Conversation[]> = {
      Today: [],
      Yesterday: [],
      "Previous 7 Days": [],
      Older: [],
    };

    // Sort descending by updatedAt
    const sorted = [...filteredConversations].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const conv of sorted) {
      const bucket = getChronologicalBucket(conv.updatedAt);
      if (groups[bucket]) {
        groups[bucket].push(conv);
      } else {
        groups["Older"].push(conv);
      }
    }

    return groups;
  }, [filteredConversations]);

  // ── Start New Conversation ──────────────────────────────────────────────
  const handleNewChat = () => {
    const newConv: Conversation = {
      id: generateId(),
      title: "New Conversation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelMode: "hybrid",
      messages: [],
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveId(newConv.id);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // ── Memory Management Handlers ──────────────────────────────────────────
  const fetchMemories = async () => {
    try {
      const res = await fetch("/api/memory");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.memories)) {
          setMemoriesList(data.memories);
        }
      }
    } catch (err) {
      console.warn("Could not load memories:", err);
    }
  };

  const handleOpenMemoryModal = () => {
    setIsMemoryModalOpen(true);
    fetchMemories();
  };

  const handleCreateMemory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMemoryInput.trim()) return;
    setIsSavingMemory(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newMemoryInput.trim(),
          category: newMemoryCat,
          importance: 4,
        }),
      });
      if (res.ok) {
        setNewMemoryInput("");
        fetchMemories();
      }
    } catch (err) {
      console.error("Error creating memory:", err);
    } finally {
      setIsSavingMemory(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMemoriesList((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (err) {
      console.error("Error deleting memory:", err);
    }
  };

  const handleClearAllMemoriesFromModal = async () => {
    if (!confirm("Are you sure you want to clear all stored memories?")) return;
    try {
      const res = await fetch("/api/memory?clearAll=true", {
        method: "DELETE",
      });
      if (res.ok) {
        setMemoriesList([]);
      }
    } catch (err) {
      console.error("Error clearing memories:", err);
    }
  };

  // ── Delete Conversation ─────────────────────────────────────────────────
  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this conversation?")) {
      setConversations((prev) => {
        const remaining = prev.filter((c) => c.id !== id);
        if (remaining.length === 0) {
          const fresh: Conversation = {
            id: generateId(),
            title: "New Conversation",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            modelMode: "hybrid",
            messages: [],
          };
          setActiveId(fresh.id);
          return [fresh];
        }
        if (activeId === id) {
          setActiveId(remaining[0].id);
        }
        return remaining;
      });
    }
  };

  // ── Rename Conversation ─────────────────────────────────────────────────
  const startRenaming = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitleId(conv.id);
    setEditTitleText(conv.title);
  };

  const saveRenamedTitle = () => {
    if (editingTitleId && editTitleText.trim()) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === editingTitleId ? { ...c, title: editTitleText.trim() } : c
        )
      );
    }
    setEditingTitleId(null);
  };

  // ── Clear All Conversations ─────────────────────────────────────────────
  const handleClearAllHistory = () => {
    if (confirm("Clear all conversations and reset history? This cannot be undone.")) {
      const fresh: Conversation = {
        id: generateId(),
        title: "New Conversation",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        modelMode: "hybrid",
        messages: [],
      };
      setConversations([fresh]);
      setActiveId(fresh.id);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  // ── Export Chat ─────────────────────────────────────────────────────────
  const handleExportChat = (format: "md" | "json") => {
    if (!activeConversation) return;

    let content = "";
    let mimeType = "text/plain";
    let extension = "txt";

    if (format === "md") {
      mimeType = "text/markdown";
      extension = "md";
      content = `# ${activeConversation.title}\n\n`;
      content += `*Exported from ULTRON on ${new Date().toLocaleString()}*\n\n---\n\n`;
      for (const msg of activeConversation.messages) {
        const role = msg.role === "user" ? "**User**" : "**ULTRON**";
        const time = new Date(msg.timestamp).toLocaleTimeString();
        content += `### ${role} (${time})\n\n${msg.content}\n\n---\n\n`;
      }
    } else {
      mimeType = "application/json";
      extension = "json";
      content = JSON.stringify(activeConversation, null, 2);
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ultron_chat_${activeConversation.title.replace(/\s+/g, "_").toLowerCase()}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── Copy Message Content ────────────────────────────────────────────────
  const handleCopyMessage = async (msgId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(msgId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (e) {
      console.warn("Clipboard write failed", e);
    }
  };

  // ── Stop Generation ─────────────────────────────────────────────────────
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setLiveStatus(null);
  };

  // ── Send Message ────────────────────────────────────────────────────────
  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt ?? inputPrompt).trim();
    if (!textToSend || isGenerating) return;

    setInputPrompt("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Guarantee a valid active conversation ID
    let targetConvId = activeId;
    if (!targetConvId || !conversations.some((c) => c.id === targetConvId)) {
      targetConvId = activeConversation?.id || (conversations[0] ? conversations[0].id : generateId());
      setActiveId(targetConvId);
    }

    const isFirstMessage = !activeConversation || activeConversation.messages.length === 0;
    const userMessageId = generateId();
    const assistantMessageId = generateId();
    const startTime = Date.now();

    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: textToSend,
      timestamp: startTime,
    };

    // Prepare updated message list
    const currentMessages = activeConversation?.messages || [];
    const updatedMessages = [...currentMessages, userMessage];

    // Optimistically update conversation with user message
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === targetConvId) {
          const newTitle = isFirstMessage ? generateTitleFromPrompt(textToSend) : c.title;
          return {
            ...c,
            title: newTitle,
            updatedAt: Date.now(),
            messages: updatedMessages,
          };
        }
        return c;
      })
    );

    // Initial empty assistant message placeholder for streaming
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      meta: {},
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === targetConvId
          ? { ...c, messages: [...updatedMessages, assistantPlaceholder] }
          : c
      )
    );

    setIsGenerating(true);
    setLiveStatus({ phase: "initiating", progress: 0.1, message: "Analyzing query..." });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Build conversation payload formatted for API route
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Dispatch to Next.js API route
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: apiMessages,
          stream: true,
          activationMode: "PUSH_TO_TALK", // Direct user input; bypasses wake word gate
          followUpActive: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      // Handle direct JSON response if server did not stream SSE
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await response.json();
        const finalReply = json.reply || json.acknowledgement_phrase || "Request completed.";
        setConversations((prev) =>
          prev.map((c) =>
            c.id === targetConvId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          content: finalReply,
                          meta: {
                            grounded: json.grounded,
                            degraded: json.degraded,
                            usedTool: json.intent === "TOOL_CALL",
                            usedResearch: json.intent === "QUANTUM_RESEARCH",
                            usedLocalRule: json.intent === "SYSTEM_LOCAL",
                            sources: json.sources || [],
                          },
                        }
                      : m
                  ),
                }
              : c
          )
        );
        setIsGenerating(false);
        setLiveStatus(null);
        return;
      }

      if (!response.body) {
        throw new Error("No response body received from server");
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedReply = "";
      let responseMeta: MessageMeta = {
        executionTimeMs: 0,
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          const trimmed = block.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const eventData = JSON.parse(jsonStr);

            // 1. Status event: live execution narration
            if (eventData.type === "status") {
              setLiveStatus({
                phase: eventData.phase || "processing",
                progress: eventData.progress ?? 0.5,
                message: eventData.message || "",
              });
            }

            // 2. Token event: word chunk streaming
            if (eventData.type === "token" && typeof eventData.content === "string") {
              accumulatedReply += eventData.content;
              const currentContent = accumulatedReply;
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id === targetConvId) {
                    return {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, content: currentContent }
                          : m
                      ),
                    };
                  }
                  return c;
                })
              );
            }

            // 3. Done event: final completion with full metadata & sources
            if (eventData.type === "done") {
              const executionTimeMs = Date.now() - startTime;
              responseMeta = {
                grounded: eventData.grounded,
                degraded: eventData.degraded,
                intent: eventData.intent,
                sources: eventData.sources || [],
                usedTool: eventData.intent === "TOOL_CALL",
                usedResearch: eventData.intent === "QUANTUM_RESEARCH",
                usedLocalRule: eventData.intent === "SYSTEM_LOCAL",
                executionTimeMs,
              };

              const finalReply = eventData.reply || accumulatedReply;
              setConversations((prev) =>
                prev.map((c) => {
                  if (c.id === targetConvId) {
                    return {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMessageId
                          ? {
                              ...m,
                              content: finalReply,
                              meta: responseMeta,
                            }
                          : m
                      ),
                    };
                  }
                  return c;
                })
              );
            }
          } catch {
            // Ignore incomplete JSON chunks in stream
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Generation manually stopped by user.");
      } else {
        console.error("Chat generation failed:", err);
        const errMsg =
          "I encountered an issue processing that turn. Please ask again or check local connection.";
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === targetConvId) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content: errMsg,
                        meta: { degraded: true },
                      }
                    : m
                ),
              };
            }
            return c;
          })
        );
      }
    } finally {
      setIsGenerating(false);
      setLiveStatus(null);
      abortControllerRef.current = null;
    }
  };

  // ── Keyboard handling for textarea ──────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating && inputPrompt.trim()) {
        handleSendMessage();
      }
    }
  };

  // ── Auto-adjust textarea height ─────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputPrompt(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  return (
    <div className="ultron-app-container">
      {/* ── LEFT SIDEBAR (ChatGPT-style history & navigation) ─────────────── */}
      <aside className={`ultron-sidebar ${isSidebarOpen ? "open" : "collapsed"}`}>
        {/* Sidebar Brand Header */}
        <div className="ultron-sidebar-header">
          <div className="ultron-brand">
            <div className="ultron-logo-icon">
              <span className="ultron-core-dot" />
            </div>
            <div className="ultron-brand-text">
              <span className="ultron-brand-title">ULTRON</span>
              <span className="ultron-brand-badge">AI v2.0</span>
            </div>
          </div>
          <button
            type="button"
            className="ultron-sidebar-toggle-btn"
            onClick={() => setIsSidebarOpen(false)}
            title="Collapse Sidebar"
            aria-label="Collapse Sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </div>

        {/* New Chat Button */}
        <div className="ultron-sidebar-actions">
          <button
            type="button"
            onClick={handleNewChat}
            className="ultron-new-chat-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New Chat</span>
          </button>
        </div>

        {/* History Search Bar */}
        <div className="ultron-search-wrapper">
          <svg className="ultron-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ultron-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="ultron-search-clear"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>

        {/* Chronological Conversation List */}
        <div className="ultron-history-scrollable">
          {Object.entries(groupedConversations).map(([groupTitle, convList]) => {
            if (convList.length === 0) return null;
            return (
              <div key={groupTitle} className="ultron-history-group">
                <div className="ultron-history-group-title">{groupTitle}</div>
                <div className="ultron-history-items">
                  {convList.map((conv) => {
                    const isActive = conv.id === activeId;
                    const isEditing = conv.id === editingTitleId;

                    return (
                      <div
                        key={conv.id}
                        onClick={() => setActiveId(conv.id)}
                        className={`ultron-history-item ${isActive ? "active" : ""}`}
                      >
                        <div className="ultron-history-item-content">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ultron-chat-bubble-icon">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>

                          {isEditing ? (
                            <input
                              type="text"
                              value={editTitleText}
                              onChange={(e) => setEditTitleText(e.target.value)}
                              onBlur={saveRenamedTitle}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRenamedTitle();
                                if (e.key === "Escape") setEditingTitleId(null);
                              }}
                              autoFocus
                              className="ultron-edit-title-input"
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className="ultron-history-item-title" title={conv.title}>
                              {conv.title}
                            </span>
                          )}
                        </div>

                        {/* Action buttons (Rename, Delete) */}
                        <div className="ultron-history-item-actions">
                          <button
                            type="button"
                            onClick={(e) => startRenaming(conv, e)}
                            className="ultron-item-action-btn"
                            title="Rename"
                            aria-label="Rename conversation"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteConversation(conv.id, e)}
                            className="ultron-item-action-btn delete"
                            title="Delete"
                            aria-label="Delete conversation"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer Dock */}
        <div className="ultron-sidebar-footer">
          {/* Task Orchestration Action */}
          <button
            type="button"
            onClick={() => setIsOrchestrationModalOpen(true)}
            className="ultron-sidebar-memory-btn"
            style={{ borderColor: "#00f0ff" }}
            title="Inspect autonomous task orchestration & workflows"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00f0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span style={{ color: "#00f0ff" }}>Task Orchestration</span>
          </button>

          {/* Stored Memories Action */}
          <button
            type="button"
            onClick={handleOpenMemoryModal}
            className="ultron-sidebar-memory-btn"
            title="Inspect stored long-term memories"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <span>Neural Memories</span>
          </button>

          {/* Clear History Button */}
          <button
            type="button"
            onClick={handleClearAllHistory}
            className="ultron-clear-history-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>Clear Conversations</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CHAT WORKSPACE ───────────────────────────────────────────── */}
      <main className="ultron-main-workspace">
        {/* Workspace Top Navigation Bar */}
        <header className="ultron-topbar">
          <div className="ultron-topbar-left">
            {!isSidebarOpen && (
              <button
                type="button"
                className="ultron-topbar-btn"
                onClick={() => setIsSidebarOpen(true)}
                title="Open Sidebar"
                aria-label="Open Sidebar"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </button>
            )}

            <div className="ultron-topbar-title-wrapper">
              <h2 className="ultron-topbar-title">
                {activeConversation?.title || "New Conversation"}
              </h2>
            </div>
          </div>

          <div className="ultron-topbar-right">
            {/* Screen Awareness Floating Indicator (Module 01) */}
            <ScreenAwarenessIndicator />

            {/* Export Chat */}
            <button
              type="button"
              className="ultron-topbar-btn"
              onClick={() => handleExportChat("md")}
              title="Export as Markdown"
              aria-label="Export conversation as Markdown"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="ultron-topbar-btn-text">Export</span>
            </button>

            {/* New Chat Quick Icon */}
            <button
              type="button"
              className="ultron-topbar-btn primary"
              onClick={handleNewChat}
              title="Start New Chat"
              aria-label="Start New Chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="ultron-topbar-btn-text">New</span>
            </button>
          </div>
        </header>

        {/* ── Scrollable Chat Messages Area ───────────────────────────────── */}
        <div className="ultron-chat-scrollable">
          {(!activeConversation || activeConversation.messages.length === 0) ? (
            /* ── EMPTY STATE WELCOME SCREEN (ChatGPT Clean Minimalist Style) ── */
            <div className="ultron-welcome-view">
              <div className="ultron-welcome-hero">
                <div className="ultron-core-crest">
                  <div className="ultron-crest-outer-ring" />
                  <div className="ultron-crest-inner-ring" />
                  <div className="ultron-crest-symbol">U</div>
                </div>
                <h1 className="ultron-welcome-title">How can I help you today?</h1>
                <p className="ultron-welcome-subtitle">
                  Autonomous Multi-Agent Core is online. Ask anything, launch apps, inspect laptop specs, or trigger quantum web research.
                </p>
              </div>
            </div>
          ) : (
            /* ── CONVERSATION THREAD ── */
            <div className="ultron-messages-thread">
              {activeConversation.messages.map((message) => {
                const isUser = message.role === "user";
                const isCopied = copiedMessageId === message.id;

                return (
                  <div
                    key={message.id}
                    className={`ultron-message-row ${isUser ? "user-row" : "assistant-row"}`}
                  >
                    <div className="ultron-message-bubble-wrapper">
                      {/* Avatar */}
                      <div className="ultron-message-avatar">
                        {isUser ? (
                          <div className="ultron-user-avatar">You</div>
                        ) : (
                          <div className="ultron-assistant-avatar">
                            <span className="ultron-avatar-symbol">⚡</span>
                          </div>
                        )}
                      </div>

                      {/* Content Container */}
                      <div className="ultron-message-body">
                        {/* Assistant Header & Grounding Badges */}
                        {!isUser && (
                          <div className="ultron-assistant-meta-header">
                            <span className="ultron-assistant-name">ULTRON</span>

                            {message.meta?.usedTool && (
                              <span className="ultron-grounding-tag tool">
                                🚀 Desktop Tool Executed
                              </span>
                            )}
                            {message.meta?.usedResearch && (
                              <span className="ultron-grounding-tag research">
                                🌐 Quantum Web Research ({message.meta.sources?.length || 0} sources)
                              </span>
                            )}
                            {message.meta?.usedLocalRule && (
                              <span className="ultron-grounding-tag local">
                                ⚡ Instant System Rule
                              </span>
                            )}
                            {message.meta?.executionTimeMs && message.meta.executionTimeMs > 0 && (
                              <span className="ultron-execution-time">
                                {(message.meta.executionTimeMs / 1000).toFixed(2)}s
                              </span>
                            )}
                          </div>
                        )}

                        {/* Formatted Content */}
                        <div className="ultron-message-text">
                          {isUser ? (
                            <p className="ultron-user-text">{message.content}</p>
                          ) : message.content ? (
                            <MarkdownRenderer content={message.content} />
                          ) : (
                            // Generating indicator if content is still empty
                            <div className="ultron-streaming-typing">
                              <span className="ultron-dot-pulse" />
                              <span className="ultron-dot-pulse" />
                              <span className="ultron-dot-pulse" />
                            </div>
                          )}
                        </div>

                        {/* Research Sources Drawer (if available) */}
                        {!isUser && message.meta?.sources && message.meta.sources.length > 0 && (
                          <details className="ultron-sources-drawer">
                            <summary className="ultron-sources-summary">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="2" y1="12" x2="22" y2="12" />
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                              </svg>
                              <span>Cited Sources ({message.meta.sources.length})</span>
                            </summary>
                            <div className="ultron-sources-list">
                              {message.meta.sources.map((src, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ultron-source-card"
                                >
                                  <div className="ultron-source-domain">{src.domain || "Web Source"}</div>
                                  <div className="ultron-source-title">{src.title}</div>
                                </a>
                              ))}
                            </div>
                          </details>
                        )}

                        {/* Message Action Bar (Copy, Timestamp) */}
                        <div className="ultron-message-actions">
                          <span className="ultron-message-time">
                            {new Date(message.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleCopyMessage(message.id, message.content)}
                            className="ultron-msg-action-btn"
                            title="Copy message"
                            aria-label="Copy message"
                          >
                            {isCopied ? (
                              <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Real-time Streaming Status Pill */}
              {isGenerating && liveStatus && (
                <div className="ultron-live-status-pill">
                  <div className="ultron-status-spinner" />
                  <span className="ultron-status-text">
                    {liveStatus.message || "Generating response..."}
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── BOTTOM COMPOSER INPUT ───────────────────────────────────────── */}
        <footer className="ultron-composer-footer">
          <div className="ultron-composer-box">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputPrompt}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask ULTRON anything, launch apps, or explore research..."
              className="ultron-prompt-textarea"
            />

            <div className="ultron-composer-controls">
              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  className="ultron-stop-btn"
                  title="Stop generating"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputPrompt.trim()}
                  className={`ultron-send-btn ${inputPrompt.trim() ? "active" : ""}`}
                  title="Send message (Enter)"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="ultron-composer-hint">
            <span>Press <strong>Enter</strong> to send • <strong>Shift + Enter</strong> for new line • Ultron Multi-Agent Core</span>
          </div>
        </footer>
      </main>

      {/* ── NEURAL MEMORY VAULT MODAL ── */}
      {isMemoryModalOpen && (
        <div className="ultron-modal-backdrop" onClick={() => setIsMemoryModalOpen(false)}>
          <div className="ultron-memory-modal" onClick={(e) => e.stopPropagation()}>
            <header className="ultron-memory-modal-header">
              <div className="ultron-memory-modal-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                <span>Neural Memory Vault</span>
                <span className="ultron-memory-badge-count">{memoriesList.length}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMemoryModalOpen(false)}
                className="ultron-memory-modal-close"
                title="Close"
              >
                ✕
              </button>
            </header>

            <div className="ultron-memory-modal-body">
              {/* Add Memory Form */}
              <form onSubmit={handleCreateMemory} className="ultron-memory-add-form">
                <input
                  type="text"
                  placeholder="Teach ULTRON a new fact (e.g. My name is Ashish, I prefer TypeScript)..."
                  value={newMemoryInput}
                  onChange={(e) => setNewMemoryInput(e.target.value)}
                  className="ultron-memory-add-input"
                />
                <select
                  value={newMemoryCat}
                  onChange={(e) => setNewMemoryCat(e.target.value as any)}
                  className="ultron-memory-cat-select"
                >
                  <option value="fact">Fact</option>
                  <option value="profile">Profile</option>
                  <option value="preference">Preference</option>
                  <option value="project">Project</option>
                  <option value="instruction">Instruction</option>
                </select>
                <button
                  type="submit"
                  disabled={!newMemoryInput.trim() || isSavingMemory}
                  className="ultron-memory-add-btn"
                >
                  {isSavingMemory ? "Saving..." : "Add"}
                </button>
              </form>

              {/* Memory List */}
              <div className="ultron-memory-list">
                {memoriesList.length === 0 ? (
                  <p style={{ color: "#64748b", textAlign: "center", padding: "1.5rem 0", fontSize: "0.9rem" }}>
                    No memories stored yet. Tell ULTRON facts about you or add one above!
                  </p>
                ) : (
                  memoriesList.map((mem) => (
                    <div key={mem.id} className="ultron-memory-card">
                      <div className="ultron-memory-card-left">
                        <span className={`ultron-memory-tag ${mem.category}`}>
                          {mem.category}
                        </span>
                        <span className="ultron-memory-content">{mem.content}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(mem.id)}
                        className="ultron-memory-del-btn"
                        title="Delete memory"
                        aria-label="Delete memory"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <footer className="ultron-memory-modal-footer">
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Stored locally in <code>ultron_memory_vault.json</code>
              </span>
              {memoriesList.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllMemoriesFromModal}
                  className="ultron-memory-clear-btn"
                >
                  Clear All Memories
                </button>
              )}
            </footer>
          </div>
        </div>
      )}

      {/* ── TASK ORCHESTRATION ENGINE MODAL ── */}
      <TaskOrchestrationModal
        isOpen={isOrchestrationModalOpen}
        onClose={() => setIsOrchestrationModalOpen(false)}
      />
    </div>
  );
}

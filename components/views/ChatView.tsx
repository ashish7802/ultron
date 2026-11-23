/**
 * @file components/views/ChatView.tsx
 * @description Production AI Chat Interface supporting English & Hinglish, Streaming, Editing, Regeneration & Approvals.
 *
 * Subsystem:
 * Interface Area B — AI Chat Interface.
 *
 * Key Responsibilities:
 * - Natural English and Hinglish conversations backed by `/api/chat` with streaming NDJSON/SSE parsing
 *   and clean non-streaming fallback.
 * - Multimodal file and image attachment subsystem supporting image previews, code/doc file ingestion,
 *   drag-and-drop, and clipboard image pasting.
 * - Persistent local conversation history with search, create, inline rename, inline delete (no `window.confirm`),
 *   and JSON export.
 * - Full message lifecycle controls: edit any user message (branching/re-running cleanly), regenerate any
 *   assistant reply, copy raw markdown, and stop/abort in-flight requests.
 * - Inline Permission Approval cards wired directly to `/api/permission` (approve / reject).
 * - Truthful active model and Ollama connectivity status bar with shortcut to AI Model Manager.
 *
 * Architectural Role & Interactions:
 * - Consumes `pendingPrompt` from `UltronWorkspace` (e.g., from Command Center or Voice Studio).
 * - Syncs with `/api/chat` and `/api/permission` via `ultronFetch`.
 *
 * Safety / Security Guarantees:
 * - Zero `window.alert`, `window.confirm`, or `window.prompt`.
 * - Keyboard shortcuts scoped strictly to the composer textarea (never steals focus from other views).
 * - Attachment payloads are size-bounded and safely sanitized before localStorage serialization.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Database,
  Edit3,
  Eye,
  File,
  FileCode,
  FileText,
  History,
  Image as ImageIcon,
  Maximize2,
  MessageSquarePlus,
  Mic,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Server,
  ShieldAlert,
  Square,
  Trash2,
  X,
} from "lucide-react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type {
  ChatAttachment,
  ChatConversation,
  ChatTurn,
  DashboardSnapshot,
  PendingPermissionPlan,
  ToastNotice,
  UltronSettings,
  UltronViewId,
} from "@/components/workspace/types";
import { ultronFetch, ultronJson } from "@/components/workspace/apiClient";

const STORAGE_KEY = "ultron_conversations_v2";

/**
 * Formats byte counts into human-readable strings (B, KB, MB).
 *
 * @param bytes - Size in bytes.
 * @returns Formatted size label.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Ingests a client-side File, producing a structured ChatAttachment.
 * For images, applies canvas-based downsampling if dimensions exceed 1600px to ensure fast transmission.
 * For code, document, and text files, reads up to 30,000 characters of UTF-8 content.
 *
 * @param file - Browser File object from input, paste or drag-and-drop.
 * @returns Fully populated ChatAttachment object.
 */
async function processSelectedFile(file: File): Promise<ChatAttachment> {
  const isImage = file.type.startsWith("image/");
  const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (isImage) {
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawUrl = (e.target?.result as string) || "";
        if (typeof window === "undefined") {
          resolve(rawUrl);
          return;
        }
        const img = new window.Image();
        img.onload = () => {
          const maxDim = 1600;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL(file.type || "image/jpeg", 0.85));
          } else {
            resolve(rawUrl);
          }
        };
        img.onerror = () => resolve(rawUrl);
        img.src = rawUrl;
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });

    return {
      id,
      name: file.name,
      type: "image",
      mimeType: file.type || "image/png",
      size: file.size,
      dataUrl,
    };
  } else {
    let textContent: string | undefined;
    const isTextReadable =
      file.type.startsWith("text/") ||
      /\.(txt|md|json|csv|tsv|ts|tsx|js|jsx|py|java|c|cpp|h|cs|go|rs|php|rb|html|css|scss|xml|yaml|yml|sh|bash|ps1|bat|cmd|sql|env|log|ini|toml|conf|dockerfile|gitignore)$/i.test(
        file.name
      );

    if (isTextReadable && file.size < 2 * 1024 * 1024) {
      try {
        const rawText = await file.text();
        textContent =
          rawText.length > 30000
            ? rawText.slice(0, 30000) + "\n\n...[Content truncated for model context limit]..."
            : rawText;
      } catch {
        // Fallback silently if read fails
      }
    }

    return {
      id,
      name: file.name,
      type: "file",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      textContent,
    };
  }
}

interface ChatViewProps {
  dashboard: DashboardSnapshot | null;
  settings: UltronSettings | null;
  pendingPrompt: string | null;
  onConsumePendingPrompt: () => void;
  onNavigate: (view: UltronViewId) => void;
  onNotify: (notice: Omit<ToastNotice, "id">) => void;
}

function createEmptyConversation(): ChatConversation {
  return {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: "New Session",
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

function loadStoredConversations(): ChatConversation[] {
  if (typeof window === "undefined") return [createEmptyConversation()];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [createEmptyConversation()];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Fallback to clean session on corrupt localStorage
  }
  return [createEmptyConversation()];
}

export default function ChatView({
  dashboard,
  settings,
  pendingPrompt,
  onConsumePendingPrompt,
  onNavigate,
  onNotify,
}: ChatViewProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>(() => loadStoredConversations());
  const [activeId, setActiveId] = useState<string>(() => conversations[0]?.id || "");
  const [historyOpen, setHistoryOpen] = useState(true);
  const [historyQuery, setHistoryQuery] = useState("");
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [approvingPlanId, setApprovingPlanId] = useState<string | null>(null);

  // Multimodal file and image attachment state
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title: string } | null>(null);
  const [previewFile, setPreviewFile] = useState<{ name: string; content: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || conversations[0],
    [conversations, activeId],
  );

  useEffect(() => {
    if (!activeConversation && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [activeConversation, conversations]);

  // Persist conversation history safely, sanitizing large dataUrls to protect localStorage quota
  useEffect(() => {
    try {
      const sanitized = conversations.slice(0, 30).map((conv) => ({
        ...conv,
        messages: conv.messages.map((m) => ({
          ...m,
          attachments: m.attachments?.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            mimeType: a.mimeType,
            size: a.size,
            dataUrl: a.dataUrl && a.dataUrl.length > 150_000 ? a.dataUrl.slice(0, 150_000) : a.dataUrl,
            textContent: a.textContent && a.textContent.length > 5000 ? a.textContent.slice(0, 5000) : a.textContent,
          })),
        })),
      }));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [conversations]);

  // Smooth scroll to latest turn
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages.length, statusMessage]);

  const updateActiveMessages = useCallback(
    (updater: (prev: ChatTurn[]) => ChatTurn[], newTitle?: string) => {
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== activeConversation?.id) return conv;
          const nextMessages = updater(conv.messages);
          return {
            ...conv,
            title: newTitle || conv.title,
            updatedAt: new Date().toISOString(),
            messages: nextMessages,
          };
        }),
      );
    },
    [activeConversation?.id],
  );

  const executePrompt = useCallback(
    async (promptText: string, baseHistory?: ChatTurn[], attachmentsToSend?: ChatAttachment[]) => {
      const attachments = attachmentsToSend ?? [];
      const cleaned = promptText.trim();
      if ((!cleaned && attachments.length === 0) || isStreaming) return;

      const effectiveContent = cleaned || (
        attachments.length > 0
          ? `Please analyze the attached items: ${attachments.map((a) => a.name).join(", ")}.`
          : ""
      );

      const priorMessages = baseHistory ?? activeConversation?.messages ?? [];
      const userTurn: ChatTurn = {
        id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        role: "user",
        content: effectiveContent,
        timestamp: new Date().toISOString(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const nextTitle =
        priorMessages.length === 0
          ? effectiveContent.slice(0, 42) + (effectiveContent.length > 42 ? "…" : "")
          : undefined;

      const assistantTurnId = `ast_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const placeholderAssistant: ChatTurn = {
        id: assistantTurnId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        model: settings?.ai.activeModel || dashboard?.model.model || undefined,
      };

      updateActiveMessages(() => [...priorMessages, userTurn, placeholderAssistant], nextTitle);
      setIsStreaming(true);
      setStatusMessage("Connecting to ULTRON intelligence pipeline...");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const apiMessages = [...priorMessages, userTurn].map((m) => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments,
        }));

        const res = await ultronFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: apiMessages,
            stream: settings?.ai.streamResponses !== false,
          }),
        });

        if (!res.ok) {
          const errPayload = await res.json().catch(() => null);
          const errMsg =
            errPayload?.error ||
            errPayload?.reply ||
            `ULTRON backend returned HTTP ${res.status}.`;
          updateActiveMessages((msgs) =>
            msgs.map((m) =>
              m.id === assistantTurnId
                ? {
                    ...m,
                    content: errMsg,
                    error: true,
                    providerStatus: `HTTP ${res.status}`,
                  }
                : m,
            ),
          );
          return;
        }

        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("text/event-stream") && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          let finalReply = "";
          let detectedMemory = false;
          let detectedModel = settings?.ai.activeModel || dashboard?.model.model || undefined;
          let detectedPlan: PendingPermissionPlan | null = null;
          let detectedSources: Array<{ title: string; url: string; domain?: string }> | undefined;

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split("\n\n");
            buffer = events.pop() || "";

            for (const rawEvent of events) {
              const dataLine = rawEvent
                .split("\n")
                .find((l) => l.startsWith("data:"));
              if (!dataLine) continue;
              const rawJson = dataLine.slice(5).trim();
              if (!rawJson || rawJson === "[DONE]") continue;
              try {
                const evt = JSON.parse(rawJson);
                if (evt.type === "status" && typeof evt.message === "string") {
                  setStatusMessage(evt.message);
                } else if (evt.type === "token" && (typeof evt.token === "string" || typeof evt.content === "string")) {
                  const tokenChunk = typeof evt.token === "string" ? evt.token : evt.content;
                  finalReply += tokenChunk;
                  updateActiveMessages((msgs) =>
                    msgs.map((m) =>
                      m.id === assistantTurnId ? { ...m, content: finalReply } : m,
                    ),
                  );
                } else if (evt.type === "final" || typeof evt.reply === "string") {
                  const payload = evt.payload || evt;
                  if (typeof payload.reply === "string") finalReply = payload.reply;
                  if (payload.memorySaved || (Array.isArray(payload.recalledMemories) && payload.recalledMemories.length > 0)) {
                    detectedMemory = true;
                  }
                  if (payload.cognitiveModelSelection?.selectedModel?.modelId) {
                    detectedModel = payload.cognitiveModelSelection.selectedModel.modelId;
                  }
                  if (payload.permissionPlan) {
                    detectedPlan = { ...payload.permissionPlan, status: "pending" };
                  }
                  if (Array.isArray(payload.sources)) {
                    detectedSources = payload.sources;
                  }
                } else if (evt.type === "error") {
                  finalReply = evt.error || "An error occurred during response generation.";
                }
              } catch {
                // Skip partial chunk
              }
            }
          }

          updateActiveMessages((msgs) =>
            msgs.map((m) =>
              m.id === assistantTurnId
                ? {
                    ...m,
                    content:
                      finalReply ||
                      "No response returned. Verify local Ollama status in AI Models.",
                    model: detectedModel,
                    memoryUsed: detectedMemory,
                    permissionPlan: detectedPlan,
                    sources: detectedSources,
                  }
                : m,
            ),
          );
        } else {
          const data = await res.json();
          const replyText =
            typeof data.reply === "string"
              ? data.reply
              : data.error || "No response generated.";
          updateActiveMessages((msgs) =>
            msgs.map((m) =>
              m.id === assistantTurnId
                ? {
                    ...m,
                    content: replyText,
                    model: data.cognitiveModelSelection?.selectedModel?.modelId || m.model,
                    memoryUsed: Boolean(data.memorySaved),
                    permissionPlan: data.permissionPlan
                      ? { ...data.permissionPlan, status: "pending" }
                      : null,
                    sources: Array.isArray(data.sources) ? data.sources : undefined,
                  }
                : m,
            ),
          );
        }
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        updateActiveMessages((msgs) =>
          msgs.map((m) =>
            m.id === assistantTurnId
              ? {
                  ...m,
                  content: aborted
                    ? m.content || "Generation stopped by operator."
                    : `Connection error: ${err instanceof Error ? err.message : "Unable to reach /api/chat"}`,
                  error: !aborted,
                }
              : m,
          ),
        );
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
        setStatusMessage(null);
      }
    },
    [activeConversation?.messages, dashboard?.model.model, isStreaming, settings?.ai.activeModel, settings?.ai.streamResponses, updateActiveMessages],
  );

  // Auto-run prompt bridged from Command Center or Voice Studio
  useEffect(() => {
    if (pendingPrompt && !isStreaming) {
      const promptToRun = pendingPrompt;
      onConsumePendingPrompt();
      void executePrompt(promptToRun);
    }
  }, [pendingPrompt, isStreaming, onConsumePendingPrompt, executePrompt]);

  const handleStop = () => {
    abortRef.current?.abort();
  };

  /**
   * Processes selected files/images, normalizing them into ChatAttachment descriptors.
   */
  const handleFilesSelected = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    try {
      const processed = await Promise.all(list.map(processSelectedFile));
      setPendingAttachments((prev) => [...prev, ...processed].slice(0, 10));
    } catch {
      onNotify({
        tone: "error",
        title: "Attachment Error",
        detail: "Failed to process one or more attached files.",
      });
    }
  };

  /** Removes a single pending attachment from the composer shelf */
  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  /** Clears all pending attachments */
  const clearAllAttachments = () => {
    setPendingAttachments([]);
  };

  /** Captures images pasted directly from the system clipboard into the chat textarea */
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      void handleFilesSelected(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handleComposerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && pendingAttachments.length === 0) || isStreaming) return;
    const text = input;
    const attachments = [...pendingAttachments];
    setInput("");
    setPendingAttachments([]);
    void executePrompt(text, undefined, attachments);
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((input.trim() || pendingAttachments.length > 0) && !isStreaming) {
        const text = input;
        const attachments = [...pendingAttachments];
        setInput("");
        setPendingAttachments([]);
        void executePrompt(text, undefined, attachments);
      }
    }
  };

  const handleCopy = async (turn: ChatTurn) => {
    try {
      await navigator.clipboard.writeText(turn.content);
      setCopiedId(turn.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      onNotify({ tone: "warn", title: "Clipboard unavailable", detail: "Copy manually from the message." });
    }
  };

  const handleRegenerate = (assistantIndex: number) => {
    if (isStreaming || !activeConversation) return;
    // Find nearest preceding user turn
    for (let idx = assistantIndex - 1; idx >= 0; idx--) {
      const turn = activeConversation.messages[idx];
      if (turn.role === "user") {
        const prompt = turn.content;
        const baseHistory = activeConversation.messages.slice(0, idx);
        void executePrompt(prompt, baseHistory, turn.attachments);
        return;
      }
    }
  };

  const handleSaveEdit = (userIndex: number) => {
    if (!editingText.trim() || !activeConversation || isStreaming) return;
    const priorTurn = activeConversation.messages[userIndex];
    const baseHistory = activeConversation.messages.slice(0, userIndex);
    const updatedPrompt = editingText.trim();
    setEditingTurnId(null);
    setEditingText("");
    void executePrompt(updatedPrompt, baseHistory, priorTurn?.attachments);
  };

  const handlePermissionDecision = async (turnId: string, plan: PendingPermissionPlan, decision: "approve" | "reject") => {
    setApprovingPlanId(plan.planId);
    const res = await ultronJson<{ ok?: boolean; message?: string; error?: string }>("/api/permission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: decision,
        planId: plan.planId,
        approvalToken: plan.approvalToken,
      }),
    });
    setApprovingPlanId(null);

    updateActiveMessages((msgs) =>
      msgs.map((m) =>
        m.id === turnId && m.permissionPlan
          ? {
              ...m,
              permissionPlan: {
                ...m.permissionPlan,
                status: res.ok ? (decision === "approve" ? "executed" : "rejected") : "failed",
              },
            }
          : m,
      ),
    );

    onNotify({
      tone: res.ok ? "success" : "error",
      title: res.ok
        ? decision === "approve"
          ? "Action approved & executed"
          : "Action rejected"
        : "Permission decision failed",
      detail: res.data?.message || res.error || undefined,
    });
  };

  const handleNewConversation = () => {
    const fresh = createEmptyConversation();
    setConversations((prev) => [fresh, ...prev]);
    setActiveId(fresh.id);
    setConfirmDeleteId(null);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const fresh = createEmptyConversation();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (activeId === id) {
        setActiveId(remaining[0].id);
      }
      return remaining;
    });
    setConfirmDeleteId(null);
  };

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(historyQuery.trim().toLowerCase()),
  );

  const modelReady = dashboard?.model.status === "ready";
  const activeModel = settings?.ai.activeModel || dashboard?.model.model || "qwen2.5:7b-instruct-q4_K_M";

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[540px] w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#0b101b]">
      {/* Conversation History Rail */}
      {historyOpen && (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800/80 bg-[#080c15] md:flex">
          <div className="flex items-center justify-between border-b border-slate-800/80 p-3">
            <span className="font-display text-xs font-semibold uppercase tracking-wider text-slate-400">
              Conversations
            </span>
            <button
              type="button"
              onClick={handleNewConversation}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600/20 px-2 py-1 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-600/30 hover:text-white"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>New</span>
            </button>
          </div>

          <div className="p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Filter history..."
                className="w-full rounded-md border border-slate-800 bg-[#0b101b] py-1.5 pr-2.5 pl-8 text-xs text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
            {filteredConversations.map((conv) => {
              const isActive = conv.id === activeConversation?.id;
              const confirming = confirmDeleteId === conv.id;
              return (
                <div
                  key={conv.id}
                  className={`group flex items-center justify-between gap-1 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                    isActive
                      ? "border border-blue-500/30 bg-blue-600/15 text-white"
                      : "border border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveId(conv.id)}
                    className="min-w-0 flex-1 truncate text-left font-medium"
                    title={conv.title}
                  >
                    {conv.title}
                  </button>
                  {confirming ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDeleteConversation(conv.id)}
                        className="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-rose-500"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded p-0.5 text-slate-400 hover:text-white"
                        aria-label="Cancel delete"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(conv.id)}
                      className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-slate-800 hover:text-rose-400 group-hover:opacity-100 focus:opacity-100"
                      aria-label={`Delete conversation ${conv.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* Main Conversation Stream */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Chat Sub-Header with Truthful Model & Connection Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-[#0d1320] px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="hidden rounded-md border border-slate-800 p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white md:inline-flex"
              aria-label="Toggle conversation history"
            >
              <History className="h-4 w-4" />
            </button>
            <div>
              <div className="text-sm font-semibold text-white">
                {activeConversation?.title || "AI Chat"}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1 font-mono">
                  <Server className="h-3 w-3" />
                  {activeModel}
                </span>
                <span>·</span>
                <span className={modelReady ? "text-emerald-400" : "text-amber-400"}>
                  {modelReady ? "Ollama Connected" : "Ollama Offline (Deterministic / Tools Ready)"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate("models")}
              className="rounded-md border border-slate-700/80 bg-[#101726] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-blue-500/40 hover:text-white"
            >
              Switch Model
            </button>
            <button
              type="button"
              onClick={handleNewConversation}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700/80 bg-[#101726] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-blue-500/40 hover:text-white md:hidden"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>New</span>
            </button>
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-14 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400">
                <Server className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-display text-xl font-semibold text-white">
                How can ULTRON assist you?
              </h2>
              <p className="mt-1.5 max-w-md text-sm text-slate-400">
                Converse naturally in English or Hinglish. ULTRON remembers encrypted context,
                checks local system state, and requests explicit approval before running system actions.
              </p>

              <div className="mt-6 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
                {[
                  "Mera current CPU aur RAM status batao",
                  "Remember that my primary project uses Next.js and TypeScript",
                  "Explain ULTRON's security layers and encryption architecture",
                  "Draft a concise Python utility to verify SHA-256 checksums",
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => void executePrompt(sample)}
                    className="rounded-lg border border-slate-800 bg-[#101726]/70 px-3.5 py-3 text-left text-xs text-slate-300 transition-colors hover:border-blue-500/40 hover:bg-[#141d30] hover:text-white"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {activeConversation.messages.map((turn, idx) => {
                const isUser = turn.role === "user";
                const isEditing = editingTurnId === turn.id;

                return (
                  <article
                    key={turn.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`w-full max-w-[92%] rounded-xl border px-4 py-3.5 sm:max-w-[85%] ${
                        isUser
                          ? "border-blue-500/30 bg-blue-600/15 text-slate-100"
                          : turn.error
                            ? "border-rose-500/35 bg-rose-950/20 text-rose-100"
                            : "border-slate-800/90 bg-[#101726]/85 text-slate-100"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">
                            {isUser ? "Operator" : settings?.general.assistantName || "ULTRON"}
                          </span>
                          {!isUser && turn.model && (
                            <span className="font-mono text-[10px] text-slate-500">{turn.model}</span>
                          )}
                          {!isUser && turn.memoryUsed && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-cyan-300">
                              <Database className="h-3 w-3" />
                              Memory aware
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                          {new Date(turn.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {/* Attached Images */}
                      {turn.attachments && turn.attachments.some((a) => a.type === "image") && (
                        <div className="mb-2.5 flex flex-wrap gap-2">
                          {turn.attachments
                            .filter((a) => a.type === "image")
                            .map((att) => (
                              <div
                                key={att.id}
                                onClick={() =>
                                  att.dataUrl && setLightboxImage({ src: att.dataUrl, title: att.name })
                                }
                                className="group relative cursor-pointer overflow-hidden rounded-lg border border-slate-700/80 bg-slate-900/80 transition-all hover:border-cyan-500/60"
                              >
                                {att.dataUrl ? (
                                  <img
                                    src={att.dataUrl}
                                    alt={att.name}
                                    className="max-h-56 max-w-xs object-cover transition-transform group-hover:scale-[1.02]"
                                  />
                                ) : null}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                  <span className="inline-flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-[11px] text-white">
                                    <Maximize2 className="h-3 w-3" />
                                    View
                                  </span>
                                </div>
                                <div className="border-t border-slate-800 bg-[#06090f]/95 px-2 py-1 text-[10px] text-slate-300">
                                  <span className="block max-w-[180px] truncate">{att.name}</span>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}

                      {/* Attached Files (Documents, Code, Logs) */}
                      {turn.attachments && turn.attachments.some((a) => a.type === "file") && (
                        <div className="mb-2.5 flex flex-wrap gap-2">
                          {turn.attachments
                            .filter((a) => a.type === "file")
                            .map((att) => (
                              <div
                                key={att.id}
                                className="flex items-center gap-2 rounded-lg border border-slate-700/80 bg-[#0a101d] px-3 py-2 text-xs text-slate-200"
                              >
                                <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-950 text-blue-400">
                                  {/\.(ts|tsx|js|jsx|py|java|cpp|c|html|css|json|sql)$/i.test(att.name) ? (
                                    <FileCode className="h-4 w-4" />
                                  ) : (
                                    <FileText className="h-4 w-4" />
                                  )}
                                </div>
                                <div className="flex flex-col text-left">
                                  <span className="max-w-[180px] truncate font-medium text-slate-100">{att.name}</span>
                                  <span className="font-mono text-[10px] text-slate-400">{formatFileSize(att.size)}</span>
                                </div>
                                {att.textContent && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewFile({ name: att.name, content: att.textContent || "" })}
                                    className="ml-1 inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800/80 px-2 py-1 text-[10px] text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
                                  >
                                    <Eye className="h-3 w-3" />
                                    <span>View</span>
                                  </button>
                                )}
                              </div>
                            ))}
                        </div>
                      )}

                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-blue-500/50 bg-[#06090f] p-2.5 text-sm text-slate-100 focus:outline-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingTurnId(null)}
                              className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(idx)}
                              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500"
                            >
                              Save & Re-run
                            </button>
                          </div>
                        </div>
                      ) : turn.content ? (
                        <MarkdownRenderer content={turn.content} />
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
                          <span>{statusMessage || "Formulating response..."}</span>
                        </div>
                      )}

                      {/* Inline Permission Approval Card */}
                      {turn.permissionPlan && (
                        <div className="mt-3 rounded-lg border border-amber-500/35 bg-amber-950/20 p-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <ShieldAlert className="h-4 w-4 text-amber-400" />
                              <span className="text-xs font-semibold text-amber-200">
                                Action Approval Required · {turn.permissionPlan.riskLevel.toUpperCase()}
                              </span>
                            </div>
                            <span className="font-mono text-[10px] text-amber-300/80">
                              {turn.permissionPlan.actionType}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-slate-200">{turn.permissionPlan.title}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            Target: <code className="text-slate-200">{turn.permissionPlan.target}</code>
                          </p>

                          {turn.permissionPlan.status === "pending" ? (
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                disabled={approvingPlanId === turn.permissionPlan.planId}
                                onClick={() =>
                                  void handlePermissionDecision(turn.id, turn.permissionPlan!, "approve")
                                }
                                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                              >
                                Approve & Execute
                              </button>
                              <button
                                type="button"
                                disabled={approvingPlanId === turn.permissionPlan.planId}
                                onClick={() =>
                                  void handlePermissionDecision(turn.id, turn.permissionPlan!, "reject")
                                }
                                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <div className="mt-2 font-mono text-[11px] text-slate-300">
                              Decision status: {turn.permissionPlan.status}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Turn Action Bar */}
                      {!isEditing && turn.content && (
                        <div className="mt-2.5 flex items-center gap-1 border-t border-slate-800/70 pt-2">
                          <button
                            type="button"
                            onClick={() => void handleCopy(turn)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                          >
                            {copiedId === turn.id ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          {isUser && !isStreaming && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTurnId(turn.id);
                                setEditingText(turn.content);
                              }}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                          )}

                          {!isUser && !isStreaming && (
                            <button
                              type="button"
                              onClick={() => handleRegenerate(idx)}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                            >
                              <RefreshCw className="h-3 w-3" />
                              <span>Regenerate</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Status / Offline Notice */}
        {statusMessage && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between border-t border-slate-800/80 bg-[#0d1422] px-4 py-1.5 text-xs text-cyan-300"
          >
            <span className="truncate">{statusMessage}</span>
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-1 rounded bg-rose-600/20 px-2 py-0.5 text-[11px] font-medium text-rose-300 hover:bg-rose-600/30"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              <span>Stop</span>
            </button>
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={handleComposerSubmit}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="relative border-t border-slate-800/80 bg-[#090d16] p-3.5 sm:px-5"
        >
          {/* Drag & Drop Overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center border-2 border-dashed border-cyan-400 bg-[#070d18]/95 p-4 backdrop-blur-sm">
              <Paperclip className="h-8 w-8 animate-bounce text-cyan-400" />
              <p className="mt-2 text-sm font-semibold text-cyan-200">
                Drop images or files here to attach
              </p>
              <span className="text-[11px] text-slate-400">
                Supports PNG, JPG, WebP, documents, logs, and code files
              </span>
            </div>
          )}

          {!modelReady && dashboard && (
            <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-950/15 px-3 py-1.5 text-[11px] text-amber-200">
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                Local Ollama daemon is offline. System telemetry, memory commands, and diagnostics remain active; LLM replies require Ollama.
              </span>
              <button
                type="button"
                onClick={() => onNavigate("models")}
                className="shrink-0 font-medium text-amber-300 underline hover:text-white"
              >
                Model Manager
              </button>
            </div>
          )}

          {/* Pending Attachments Shelf */}
          {pendingAttachments.length > 0 && (
            <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/70 bg-[#0b1322] p-2">
              {pendingAttachments.map((att) => (
                <div
                  key={att.id}
                  className="group relative flex items-center gap-2 rounded-md border border-slate-700/90 bg-[#06090f] p-1.5 pr-2"
                >
                  {att.type === "image" && att.dataUrl ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="h-9 w-9 rounded object-cover border border-slate-800"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded bg-blue-950/80 text-blue-400">
                      {/\.(ts|tsx|js|jsx|py|java|cpp|c|html|css|json|sql)$/i.test(att.name) ? (
                        <FileCode className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                    </div>
                  )}
                  <div className="flex max-w-[130px] flex-col text-left">
                    <span className="truncate text-xs font-medium text-slate-200" title={att.name}>
                      {att.name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {formatFileSize(att.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(att.id)}
                    className="ml-1 rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-rose-400"
                    title="Remove attachment"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={clearAllAttachments}
                className="ml-auto px-2 py-1 text-[11px] font-medium text-slate-400 underline transition-colors hover:text-rose-300"
              >
                Clear all ({pendingAttachments.length})
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Hidden file & image inputs */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleFilesSelected(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleFilesSelected(e.target.files);
                e.target.value = "";
              }}
            />

            {/* Voice Studio button */}
            <button
              type="button"
              onClick={() => onNavigate("voice")}
              title="Open Voice Studio"
              aria-label="Open Voice Studio"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-[#101726] text-slate-300 transition-colors hover:border-blue-500/40 hover:text-white"
            >
              <Mic className="h-4 w-4" />
            </button>

            {/* Attach Image button */}
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              title="Attach Image (PNG, JPG, WebP, GIF)"
              aria-label="Attach Image"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-[#101726] text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
            >
              <ImageIcon className="h-4 w-4" />
            </button>

            {/* Attach File button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach File (Code, Docs, Logs, Text)"
              aria-label="Attach File"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-[#101726] text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              onPaste={handlePaste}
              rows={1}
              placeholder="Message ULTRON (English or Hinglish · Enter to send, Shift+Enter for newline)..."
              className="max-h-36 min-h-[40px] flex-1 resize-y rounded-lg border border-slate-700/80 bg-[#06090f] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />

            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-medium text-white transition-colors hover:bg-rose-500"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() && pendingAttachments.length === 0}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[90vh] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#090d16] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 bg-[#0c121f] px-4 py-2.5">
              <span className="truncate text-xs font-medium text-slate-200">{lightboxImage.title}</span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-center overflow-auto bg-[#05080e] p-2">
              <img
                src={lightboxImage.src}
                alt={lightboxImage.title}
                className="max-h-[80vh] max-w-full rounded object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Text / Code File Preview Modal */}
      {previewFile && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewFile(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-[80vh] w-[90vw] max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#090d16] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 bg-[#0c121f] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-medium text-slate-200">{previewFile.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(previewFile.content);
                    onNotify({ tone: "success", title: "Copied", detail: "File content copied to clipboard." });
                  }}
                  className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  Copy All
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-[#05080e] p-4">
              <pre className="select-text whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300">
                {previewFile.content}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

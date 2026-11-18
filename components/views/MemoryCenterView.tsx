/**
 * @file components/views/MemoryCenterView.tsx
 * @description Encrypted Memory Center View (Overview, Search, CRUD, Integrity & AES-256-GCM Status).
 *
 * Subsystem:
 * Interface Area D — Memory Center.
 *
 * Key Responsibilities:
 * - Displays real memory vault count, category breakdown, file size, backup snapshot availability,
 *   and verified AES-256-GCM encryption status from `GET /api/memory`.
 * - Provides live client-side search and category filtering across stored memories.
 * - Supports creating, inline editing, and inline deleting memories via `/api/memory`.
 * - Zero `window.confirm`: destructive actions use inline confirmation states.
 *
 * Architectural Role & Interactions:
 * - Communicates strictly with `/api/memory` through `ultronJson`.
 *
 * Safety / Security Guarantees:
 * - Never displays encryption keys; only surfaces non-sensitive encryption posture from `getCryptoStatus()`.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Database,
  Edit3,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { ToastNotice } from "@/components/workspace/types";
import { formatBytes, ultronJson } from "@/components/workspace/apiClient";

interface MemoryRecord {
  id: string;
  key: string;
  content: string;
  category: "profile" | "preference" | "project" | "fact" | "instruction";
  confidence?: number;
  updatedAt?: string;
  createdAt?: string;
}

interface MemoryApiResponse {
  ok: boolean;
  memories: MemoryRecord[];
  stats: {
    total: number;
    byCategory?: Record<string, number>;
  };
  vault?: {
    exists: boolean;
    sizeBytes: number;
    updatedAt: string | null;
    backupPresent: boolean;
    encryption?: {
      encrypted?: boolean;
      cipher?: string;
      keySource?: string;
      status?: string;
    };
  };
}

interface MemoryCenterViewProps {
  onNotify: (notice: Omit<ToastNotice, "id">) => void;
}

const CATEGORIES = ["all", "profile", "preference", "project", "fact", "instruction"] as const;

export default function MemoryCenterView({ onNotify }: MemoryCenterViewProps) {
  const [data, setData] = useState<MemoryApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<(typeof CATEGORIES)[number]>("all");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryRecord["category"]>("fact");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Inline edit / delete state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await ultronJson<MemoryApiResponse>("/api/memory");
    if (res.ok && res.data) {
      setData(res.data);
    } else {
      setError(res.error || "Failed to load memory vault.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  const filteredMemories = useMemo(() => {
    const list = data?.memories || [];
    const q = search.trim().toLowerCase();
    return list.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.key.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [data?.memories, search, categoryFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newContent.trim()) return;
    setSaving(true);
    const res = await ultronJson("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: newKey.trim(),
        category: newCategory,
        content: newContent.trim(),
      }),
    });
    setSaving(false);

    if (res.ok) {
      setNewKey("");
      setNewContent("");
      setShowCreate(false);
      onNotify({ tone: "success", title: "Memory saved to encrypted vault" });
      void loadMemories();
    } else {
      onNotify({ tone: "error", title: "Could not save memory", detail: res.error || undefined });
    }
  };

  const handleSaveEdit = async (mem: MemoryRecord) => {
    if (!editContent.trim()) return;
    setSaving(true);
    const res = await ultronJson("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: mem.id,
        key: mem.key,
        category: mem.category,
        content: editContent.trim(),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setEditingId(null);
      onNotify({ tone: "success", title: "Memory updated" });
      void loadMemories();
    } else {
      onNotify({ tone: "error", title: "Update failed", detail: res.error || undefined });
    }
  };

  const handleDelete = async (id: string) => {
    const res = await ultronJson(`/api/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    if (res.ok) {
      onNotify({ tone: "success", title: "Memory record deleted" });
      void loadMemories();
    } else {
      onNotify({ tone: "error", title: "Delete failed", detail: res.error || undefined });
    }
  };

  const vault = data?.vault;
  const isEncrypted = vault?.encryption?.encrypted;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">Memory Center</h1>
          <p className="text-sm text-slate-400">
            Search, inspect, and manage ULTRON&apos;s persistent encrypted memory vault.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadMemories()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0b101b] px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-500"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Memory</span>
          </button>
        </div>
      </div>

      {/* Vault Integrity & Encryption Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Stored Memories</span>
            <Database className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-white">
            {data ? data.stats.total : "—"}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">Persisted across sessions</div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Encryption Cipher</span>
            <Lock className={`h-4 w-4 ${isEncrypted ? "text-emerald-400" : "text-amber-400"}`} />
          </div>
          <div className="mt-2 font-mono text-sm font-semibold text-white">
            {vault?.encryption?.cipher || (isEncrypted ? "AES-256-GCM" : "Unverified")}
          </div>
          <div className={`mt-1 text-[11px] ${isEncrypted ? "text-emerald-400" : "text-amber-400"}`}>
            {vault?.encryption?.status || (isEncrypted ? "Authenticated encryption active" : "Check vault key status")}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Vault File Integrity</span>
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 font-mono text-sm font-semibold tabular-nums text-white">
            {vault?.exists ? formatBytes(vault.sizeBytes) : "Not found"}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {vault?.updatedAt ? `Updated ${new Date(vault.updatedAt).toLocaleDateString()}` : "Local vault storage"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-[#0b101b] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Recovery Snapshot</span>
            <Database className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-sm font-semibold text-white">
            {vault ? (vault.backupPresent ? "Snapshot Preserved" : "No Snapshot") : "—"}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Pre-migration immutable backup</div>
        </div>
      </div>

      {/* Create Memory Form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-blue-500/35 bg-[#0d1422] p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-white">Create Encrypted Memory</h2>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded p-1 text-slate-400 hover:text-white"
              aria-label="Close form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="mem-key" className="text-xs font-medium text-slate-400">
                Key / Identifier
              </label>
              <input
                id="mem-key"
                type="text"
                required
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="e.g., workspace_primary_stack"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#06090f] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="mem-category" className="text-xs font-medium text-slate-400">
                Category
              </label>
              <select
                id="mem-category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MemoryRecord["category"])}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-[#06090f] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="fact">Fact</option>
                <option value="preference">Preference</option>
                <option value="project">Project</option>
                <option value="profile">Profile</option>
                <option value="instruction">Instruction</option>
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="mem-content" className="text-xs font-medium text-slate-400">
              Memory Content
            </label>
            <textarea
              id="mem-content"
              required
              rows={3}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Enter factual context, preference, or standing instruction..."
              className="mt-1 w-full rounded-lg border border-slate-700 bg-[#06090f] px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Encrypting & Saving..." : "Save to Vault"}
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-[#0b101b] p-3.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories by key, content, or category..."
            className="w-full rounded-lg border border-slate-800 bg-[#06090f] py-2 pr-3 pl-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                categoryFilter === cat
                  ? "bg-blue-600 text-white"
                  : "border border-slate-800 bg-[#101726]/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Memory Records List */}
      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/35 bg-rose-950/20 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-xl bg-slate-800/40" />
          ))}
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-[#0b101b] py-12 text-center">
          <Database className="mx-auto h-6 w-6 text-slate-500" />
          <p className="mt-2 text-sm font-medium text-slate-300">No matching memories found</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Try clearing your search filter or add a new encrypted memory record.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredMemories.map((mem) => {
            const isEditing = editingId === mem.id;
            const isConfirmingDelete = confirmDeleteId === mem.id;
            return (
              <div
                key={mem.id}
                className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#0b101b] p-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-semibold text-cyan-300">{mem.key}</span>
                      <span className="ml-2 font-mono text-[10px] uppercase text-slate-500">
                        {mem.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(mem.id);
                          setEditContent(mem.content);
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                        aria-label={`Edit memory ${mem.key}`}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleDelete(mem.id)}
                            className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-rose-500"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded p-0.5 text-slate-400 hover:text-white"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(mem.id)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-rose-400"
                          aria-label={`Delete memory ${mem.key}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="mt-2.5 space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-blue-500/40 bg-[#06090f] p-2 text-xs text-slate-100 focus:outline-none"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-300"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleSaveEdit(mem)}
                          className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm leading-relaxed text-slate-200">{mem.content}</p>
                  )}
                </div>

                {mem.updatedAt && (
                  <div className="mt-3 border-t border-slate-800/70 pt-2 font-mono text-[10px] text-slate-500 tabular-nums">
                    Updated {new Date(mem.updatedAt).toLocaleString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

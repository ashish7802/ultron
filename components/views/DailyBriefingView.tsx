/**
 * @file components/views/DailyBriefingView.tsx
 * @description Daily Briefing & World Awareness Screen for ULTRON Lite.
 *
 * Subsystem:
 * Presentation Layer — Real-Time World Intelligence & Daily Digest.
 *
 * Key Responsibilities:
 * - Displays structured daily briefing: Top Developments, India & World, AI/Tech, Topic to Learn, Sources.
 * - Supports on-demand user-triggered "Generate Today's Briefing" / "Refresh" action.
 * - Provides verified publication dates, source badges, and direct outbound links.
 * - Allows 1-click opening in browser or 1-click saving of highlights to persistent memory.
 * - Graceful fallback and error states when offline.
 *
 * Safety / Security Guarantees:
 * - Anti-hallucination: displays only stories fetched from verified open RSS feeds.
 * - Outbound links open safely in external browser via `/api/browser`.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Bookmark,
  Calendar,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Globe,
  GraduationCap,
  Newspaper,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { ToastNotice } from "@/components/workspace/types";
import { ultronJson } from "@/components/workspace/apiClient";
import type { DailyBriefingPayload, NewsStory } from "@/lib/news/dailyBriefingEngine";

interface DailyBriefingViewProps {
  onNotify: (notice: Omit<ToastNotice, "id">) => void;
  onOpenExplorerWithTopic?: (topic: string) => void;
}

export default function DailyBriefingView({ onNotify, onOpenExplorerWithTopic }: DailyBriefingViewProps) {
  const [briefing, setBriefing] = useState<DailyBriefingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const fetchBriefing = useCallback(async (forceRefresh: boolean = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const endpoint = "/api/briefing";
      const res = forceRefresh
        ? await ultronJson<{ ok: boolean; briefing: DailyBriefingPayload }>(endpoint, {
            method: "POST",
            body: JSON.stringify({ refresh: true }),
          })
        : await ultronJson<{ ok: boolean; briefing: DailyBriefingPayload }>(endpoint);

      if (res.ok && res.data?.briefing) {
        setBriefing(res.data.briefing);
        if (forceRefresh) {
          onNotify({
            tone: "success",
            title: "Briefing Refreshed",
            detail: "Fresh RSS feeds synchronized successfully.",
          });
        }
      } else {
        setError(res.error || "Failed to load daily briefing.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error connecting to briefing service.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onNotify]);

  useEffect(() => {
    fetchBriefing(false);
  }, [fetchBriefing]);

  const handleOpenLink = async (url: string) => {
    try {
      await ultronJson("/api/browser", {
        method: "POST",
        body: JSON.stringify({ action: "open", url }),
      });
      onNotify({
        tone: "info",
        title: "Browser Opened",
        detail: "Opening story in your desktop browser.",
      });
    } catch {
      window.open(url, "_blank");
    }
  };

  const handleSaveStory = async (story: NewsStory) => {
    try {
      const res = await ultronJson("/api/browser", {
        method: "POST",
        body: JSON.stringify({
          action: "save_research",
          title: story.title,
          summary: story.description || story.title,
          sourceUrl: story.link,
          publishedDate: story.pubDate,
        }),
      });

      if (res.ok) {
        setSavedIds((prev) => new Set([...prev, story.id]));
        onNotify({
          tone: "success",
          title: "Saved to Memory",
          detail: `"${story.title.slice(0, 35)}..." saved to research vault.`,
        });
      }
    } catch {
      onNotify({
        tone: "warn",
        title: "Save Failed",
        detail: "Could not save to memory vault.",
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0f1d] text-slate-100 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Newspaper className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Daily World Briefing
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-medium border border-cyan-500/30">
                  LITE
                </span>
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                {briefing?.briefingDate || new Date().toISOString().slice(0, 10)}
                {briefing?.cached && (
                  <span className="text-[11px] text-slate-500 bg-slate-800 px-1.5 py-0.2 rounded">
                    Cached for low RAM
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchBriefing(true)}
            disabled={loading || refreshing}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs md:text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Synchronizing..." : "Generate Today's Briefing"}</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center space-x-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !briefing && (
        <div className="space-y-4 animate-pulse">
          <div className="h-40 rounded-xl bg-slate-900/60 border border-slate-800" />
          <div className="h-64 rounded-xl bg-slate-900/60 border border-slate-800" />
        </div>
      )}

      {briefing && (
        <div className="space-y-8">
          {/* Section 4: Daily Learning Concept Spotlight */}
          {briefing.topicToLearn && (
            <div className="p-5 md:p-6 rounded-xl bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-cyan-950/30 border border-indigo-500/30 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-indigo-400">
                  <GraduationCap className="w-4 h-4 text-indigo-400" />
                  <span>One New Topic to Learn Today</span>
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
                  {briefing.topicToLearn.category}
                </span>
              </div>

              <h2 className="text-lg md:text-xl font-bold text-white mb-2">
                {briefing.topicToLearn.title}
              </h2>

              <p className="text-sm md:text-base text-slate-300 leading-relaxed mb-4 bg-slate-950/40 p-3.5 rounded-lg border border-slate-800/60">
                {briefing.topicToLearn.simpleExplanationHinglish}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 text-xs">
                  <span className="font-semibold text-cyan-300 block mb-1">Kyun Zaruri Hai (Why it Matters):</span>
                  <p className="text-slate-400">{briefing.topicToLearn.whyItMatters}</p>
                </div>
                <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-800 text-xs">
                  <span className="font-semibold text-amber-300 block mb-1">Fact vs Speculation:</span>
                  <p className="text-slate-400">{briefing.topicToLearn.factVsSpeculation}</p>
                </div>
              </div>

              {briefing.topicToLearn.keyTerms && briefing.topicToLearn.keyTerms.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/80">
                  {briefing.topicToLearn.keyTerms.map((t, idx) => (
                    <div key={idx} className="text-xs bg-slate-800/80 px-2.5 py-1 rounded text-slate-300 border border-slate-700/60">
                      <strong className="text-cyan-400">{t.term}:</strong> {t.explanation}
                    </div>
                  ))}
                </div>
              )}

              {onOpenExplorerWithTopic && (
                <div className="pt-3 flex justify-end">
                  <button
                    onClick={() => onOpenExplorerWithTopic(briefing.topicToLearn.title)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-xs font-medium transition-colors cursor-pointer"
                  >
                    <span>Explore This Concept</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Section 1: Top Important Developments */}
          <div>
            <div className="flex items-center space-x-2 mb-3.5">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h3 className="text-base font-bold text-white uppercase tracking-wider text-xs md:text-sm">
                Top Important Developments
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {briefing.topDevelopments.map((story) => (
                <div
                  key={story.id}
                  className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-cyan-500/40 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                      <span className="font-medium text-cyan-400">{story.source}</span>
                      <span>{story.pubDate ? story.pubDate.slice(0, 16) : ""}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-100 mb-2 line-clamp-2">
                      {story.title}
                    </h4>
                    {story.description && (
                      <p className="text-xs text-slate-400 line-clamp-3 mb-3 leading-relaxed">
                        {story.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                    <button
                      onClick={() => handleOpenLink(story.link)}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 font-medium cursor-pointer"
                    >
                      <span>Read Story</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleSaveStory(story)}
                      className="text-slate-400 hover:text-white flex items-center space-x-1 cursor-pointer"
                    >
                      {savedIds.has(story.id) ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Bookmark className="w-3.5 h-3.5" />
                      )}
                      <span>{savedIds.has(story.id) ? "Saved" : "Save"}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: India & World Updates */}
          <div>
            <div className="flex items-center space-x-2 mb-3.5">
              <Globe className="w-4 h-4 text-emerald-400" />
              <h3 className="text-base font-bold text-white uppercase tracking-wider text-xs md:text-sm">
                India & World Affairs
              </h3>
            </div>

            <div className="space-y-3">
              {briefing.indiaAndWorld.map((story) => (
                <div
                  key={story.id}
                  className="p-3.5 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400 mb-1">
                      <span className="text-emerald-400 font-medium">{story.source}</span>
                      <span>•</span>
                      <span>{story.pubDate ? story.pubDate.slice(0, 16) : ""}</span>
                    </div>
                    <h4 className="text-xs md:text-sm font-medium text-slate-200 truncate">
                      {story.title}
                    </h4>
                  </div>
                  <button
                    onClick={() => handleOpenLink(story.link)}
                    className="shrink-0 p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400 cursor-pointer"
                    title="Open in Browser"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: AI & Technology News */}
          <div>
            <div className="flex items-center space-x-2 mb-3.5">
              <Cpu className="w-4 h-4 text-purple-400" />
              <h3 className="text-base font-bold text-white uppercase tracking-wider text-xs md:text-sm">
                AI & Technology Updates
              </h3>
            </div>

            <div className="space-y-3">
              {briefing.aiAndTechnology.map((story) => (
                <div
                  key={story.id}
                  className="p-3.5 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400 mb-1">
                      <span className="text-purple-400 font-medium">{story.source}</span>
                      <span>•</span>
                      <span>{story.pubDate ? story.pubDate.slice(0, 16) : ""}</span>
                    </div>
                    <h4 className="text-xs md:text-sm font-medium text-slate-200 truncate">
                      {story.title}
                    </h4>
                  </div>
                  <button
                    onClick={() => handleOpenLink(story.link)}
                    className="shrink-0 p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400 cursor-pointer"
                    title="Open in Browser"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Section 5: Verified Sources Audit */}
          {briefing.sources && briefing.sources.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-900 text-xs">
              <span className="text-slate-400 font-semibold block mb-2">Verified Sources Consulted Today:</span>
              <div className="flex flex-wrap gap-2">
                {briefing.sources.map((s, idx) => (
                  <span key={idx} className="px-2.5 py-1 rounded bg-slate-900 text-slate-300 border border-slate-800 flex items-center gap-1.5">
                    <span>{s.name}</span>
                    <span className="text-[10px] text-cyan-400 font-mono">({s.count} stories)</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

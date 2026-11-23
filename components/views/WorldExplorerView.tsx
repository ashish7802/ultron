/**
 * @file components/views/WorldExplorerView.tsx
 * @description World Explorer, Concept Learning & Web Article Synthesis Screen for ULTRON Lite.
 *
 * Subsystem:
 * Educational Exploration, Cognitive Learning & Browser Article Synthesis.
 *
 * Key Responsibilities:
 * - World Explorer Mode: Explains advanced science, tech, history, economy, and politics topics in simple Hinglish.
 * - Key Terms Glossary & Fact vs Speculation distinction.
 * - Web Article Reader & Summarizer: Paste any public article URL to extract clean metadata, read text, and generate structured Hinglish takeaways.
 * - Grounded Follow-up Q&A strictly bound to article contents.
 * - One-click persistent memory note saving.
 *
 * Safety / Security Guarantees:
 * - Untrusted web content is sanitized before display.
 * - SSRF protected via server-side URL validation.
 */

"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Bookmark,
  Compass,
  ExternalLink,
  FileText,
  HelpCircle,
  Search,
  Sparkles,
} from "lucide-react";
import type { ToastNotice } from "@/components/workspace/types";
import { ultronJson } from "@/components/workspace/apiClient";
import type { ExploredTopicResult } from "@/lib/learning/worldExplorerEngine";
import type { ArticleSummaryResult, ExtractedArticle } from "@/lib/browser/browserAssistant";

interface WorldExplorerViewProps {
  onNotify: (notice: Omit<ToastNotice, "id">) => void;
  initialTopic?: string;
}

const SUGGESTED_TOPICS = [
  "Quantum Computing",
  "Semiconductor Manufacturing",
  "How Transformer AI Works",
  "Inflation & Central Banks",
  "CRISPR Gene Editing",
  "ISRO Space Missions",
  "Blockchain & Consensus",
  "Nuclear Fusion Energy",
];

export default function WorldExplorerView({ onNotify, initialTopic = "" }: WorldExplorerViewProps) {
  const [activeTab, setActiveTab] = useState<"explorer" | "articleReader">("explorer");

  // World Explorer state
  const [topicInput, setTopicInput] = useState(initialTopic);
  const [exploring, setExploring] = useState(false);
  const [exploredTopic, setExploredTopic] = useState<ExploredTopicResult | null>(null);
  const [explorerError, setExplorerError] = useState<string | null>(null);

  // Article Reader state
  const [articleUrl, setArticleUrl] = useState("");
  const [readingArticle, setReadingArticle] = useState(false);
  const [articleResult, setArticleResult] = useState<{
    article: ExtractedArticle;
    summary: ArticleSummaryResult;
  } | null>(null);
  const [articleError, setArticleError] = useState<string | null>(null);

  // Follow-up Q&A state
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [answeringQa, setAnsweringQa] = useState(false);
  const [qaAnswer, setQaAnswer] = useState<string | null>(null);

  const handleExplore = async (topicToSearch?: string) => {
    const target = (topicToSearch || topicInput).trim();
    if (!target) return;

    setExploring(true);
    setExplorerError(null);
    setTopicInput(target);

    try {
      const res = await ultronJson<{ ok: boolean; exploration: ExploredTopicResult }>("/api/explorer", {
        method: "POST",
        body: JSON.stringify({ action: "explore", topic: target }),
      });

      if (res.ok && res.data?.exploration) {
        setExploredTopic(res.data.exploration);
      } else {
        setExplorerError(res.error || "Failed to explore topic.");
      }
    } catch (err: unknown) {
      setExplorerError(err instanceof Error ? err.message : "Error connecting to learning engine.");
    } finally {
      setExploring(false);
    }
  };

  const handleReadArticle = async () => {
    const url = articleUrl.trim();
    if (!url) return;

    setReadingArticle(true);
    setArticleError(null);
    setArticleResult(null);
    setQaAnswer(null);

    try {
      const res = await ultronJson<{
        ok: boolean;
        article: ExtractedArticle;
        summary: ArticleSummaryResult;
      }>("/api/browser", {
        method: "POST",
        body: JSON.stringify({ action: "summarize", url }),
      });

      if (res.ok && res.data) {
        setArticleResult({
          article: res.data.article,
          summary: res.data.summary,
        });
      } else {
        setArticleError(res.error || "Failed to extract and summarize article.");
      }
    } catch (err: unknown) {
      setArticleError(err instanceof Error ? err.message : "Network error reading article.");
    } finally {
      setReadingArticle(false);
    }
  };

  const handleAskFollowUp = async () => {
    if (!articleResult?.article || !followUpQuestion.trim()) return;

    setAnsweringQa(true);
    try {
      const res = await ultronJson<{ ok: boolean; answer: string }>("/api/browser", {
        method: "POST",
        body: JSON.stringify({
          action: "qa",
          article: articleResult.article,
          question: followUpQuestion.trim(),
        }),
      });

      if (res.ok && res.data?.answer) {
        setQaAnswer(res.data.answer);
      }
    } catch {
      onNotify({
        tone: "warn",
        title: "Q&A Failed",
        detail: "Could not answer follow-up question.",
      });
    } finally {
      setAnsweringQa(false);
    }
  };

  const handleSaveExplorerNote = async () => {
    if (!exploredTopic) return;
    try {
      await ultronJson("/api/explorer", {
        method: "POST",
        body: JSON.stringify({
          action: "save_note",
          topic: exploredTopic.topic,
          notes: exploredTopic.beginnerExplanationHinglish,
          sourceUrl: exploredTopic.recommendedSources[0]?.url,
        }),
      });
      onNotify({
        tone: "success",
        title: "Note Saved",
        detail: `Learning note for "${exploredTopic.topic}" saved to vault.`,
      });
    } catch {
      onNotify({
        tone: "warn",
        title: "Save Failed",
        detail: "Could not save note to memory.",
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0f1d] text-slate-100 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
      {/* Top Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                World Explorer & Article Reader
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5">
                Understand unfamiliar concepts in simple Hinglish and read web articles cleanly.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-1">
          <button
            onClick={() => setActiveTab("explorer")}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "explorer"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Concept Explorer</span>
          </button>
          <button
            onClick={() => setActiveTab("articleReader")}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "articleReader"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Article Reader & Summary</span>
          </button>
        </div>
      </div>

      {/* TAB 1: CONCEPT EXPLORER */}
      {activeTab === "explorer" && (
        <div className="space-y-6">
          {/* Search Box */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
              Ask About Any Concept (Science, History, Economy, Tech, Politics)
            </span>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleExplore()}
                  placeholder="e.g. How does Quantum Computing work? or Semiconductor chips kya hote hain..."
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              <button
                onClick={() => handleExplore()}
                disabled={exploring || !topicInput.trim()}
                className="px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs md:text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>{exploring ? "Explaining..." : "Explain Concept"}</span>
              </button>
            </div>

            {/* Topic Pills */}
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-[11px] text-slate-500 py-1">Quick Suggestions:</span>
              {SUGGESTED_TOPICS.map((topic, i) => (
                <button
                  key={i}
                  onClick={() => handleExplore(topic)}
                  className="text-xs px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/50 transition-colors cursor-pointer"
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>

          {explorerError && (
            <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{explorerError}</span>
            </div>
          )}

          {/* Result Card */}
          {exploredTopic && (
            <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
                    {exploredTopic.category}
                  </span>
                  <h2 className="text-xl font-bold text-white mt-0.5">{exploredTopic.topic}</h2>
                </div>
                <button
                  onClick={handleSaveExplorerNote}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 cursor-pointer"
                >
                  <Bookmark className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Save to Notes</span>
                </button>
              </div>

              {/* Beginner Explanation */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  📖 Aasan Shabdon Me Samjhein (Beginner Explanation)
                </h3>
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 text-sm text-slate-200 leading-relaxed">
                  {exploredTopic.beginnerExplanationHinglish}
                </div>
              </div>

              {/* Background & History */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  🏛️ Background & History
                </h3>
                <p className="text-xs md:text-sm text-slate-300 bg-slate-900/50 p-3 rounded-lg border border-slate-800/60">
                  {exploredTopic.backgroundAndHistory}
                </p>
              </div>

              {/* Key Terms */}
              {exploredTopic.keyTermsExplained.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    🔑 Key Terms Simplified
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {exploredTopic.keyTermsExplained.map((term, i) => (
                      <div key={i} className="p-3 rounded-lg bg-slate-950/40 border border-slate-800 text-xs">
                        <strong className="text-cyan-300 block mb-1">{term.term}</strong>
                        <p className="text-slate-400">{term.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Facts vs Speculation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs">
                  <span className="font-semibold text-emerald-400 block mb-1.5">✅ Verified Facts:</span>
                  <ul className="space-y-1 text-slate-300">
                    {exploredTopic.factVsInterpretation.verifiedFacts.map((f, i) => (
                      <li key={i}>• {f}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-3.5 rounded-lg bg-amber-950/20 border border-amber-500/20 text-xs">
                  <span className="font-semibold text-amber-400 block mb-1.5">⚠️ Speculation & Debates:</span>
                  <ul className="space-y-1 text-slate-300">
                    {exploredTopic.factVsInterpretation.speculationOrDebates.map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Recommended Sources */}
              {exploredTopic.recommendedSources.length > 0 && (
                <div className="pt-2 border-t border-slate-800 text-xs flex flex-wrap items-center gap-3">
                  <span className="text-slate-400 font-semibold">Recommended Sources:</span>
                  {exploredTopic.recommendedSources.map((source, i) => (
                    <a
                      key={i}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:underline flex items-center space-x-1"
                    >
                      <span>{source.name}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ARTICLE READER & SUMMARIZER */}
      {activeTab === "articleReader" && (
        <div className="space-y-6">
          {/* URL Input Bar */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
              Enter Web Article or News URL to Read & Summarize
            </span>
            <div className="flex gap-2">
              <input
                type="url"
                value={articleUrl}
                onChange={(e) => setArticleUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleReadArticle()}
                placeholder="https://example.com/article-url..."
                className="flex-1 bg-slate-950/80 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
              <button
                onClick={handleReadArticle}
                disabled={readingArticle || !articleUrl.trim()}
                className="px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs md:text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
              >
                <FileText className="w-4 h-4" />
                <span>{readingArticle ? "Extracting..." : "Read & Summarize"}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Safe read-only extraction. Strips advertisements, navigation, and prompt injection attempts.
            </p>
          </div>

          {articleError && (
            <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{articleError}</span>
            </div>
          )}

          {articleResult && (
            <div className="p-6 rounded-xl bg-slate-900/80 border border-slate-800 space-y-5">
              {/* Article Header */}
              <div className="border-b border-slate-800 pb-3">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span>Author: {articleResult.article.author || "Unknown"}</span>
                  <span>Published: {articleResult.article.publishedDate ? articleResult.article.publishedDate.slice(0, 10) : "N/A"}</span>
                </div>
                <h2 className="text-xl font-bold text-white">{articleResult.article.title}</h2>
                <a
                  href={articleResult.article.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:underline flex items-center space-x-1 mt-1"
                >
                  <span>{articleResult.article.sourceUrl}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Hinglish Summary */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  💡 Hinglish Saransh (Summary)
                </h3>
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {articleResult.summary.hinglishSummary}
                </div>
              </div>

              {/* Key Takeaways */}
              {articleResult.summary.keyTakeaways.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    📌 Mukhya Baatein (Key Takeaways)
                  </h3>
                  <div className="space-y-2">
                    {articleResult.summary.keyTakeaways.map((takeaway, i) => (
                      <div key={i} className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
                        {takeaway}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grounded Follow-up Q&A */}
              <div className="p-4 rounded-lg bg-slate-950/50 border border-slate-800/80 space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center space-x-1.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Ask a Follow-up Question on this Article</span>
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={followUpQuestion}
                    onChange={(e) => setFollowUpQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAskFollowUp()}
                    placeholder="Ask anything about what this article mentions..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                  />
                  <button
                    onClick={handleAskFollowUp}
                    disabled={answeringQa || !followUpQuestion.trim()}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {answeringQa ? "Searching..." : "Ask"}
                  </button>
                </div>

                {qaAnswer && (
                  <div className="p-3 rounded bg-slate-900/80 border border-cyan-500/20 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed mt-2">
                    {qaAnswer}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

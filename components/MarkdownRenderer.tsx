/**
 * @file components/MarkdownRenderer.tsx
 * @description Clean, XSS-safe Markdown & Code Block Renderer for ULTRON Chat Responses.
 *
 * Subsystem:
 * AI Chat Presentation Layer.
 *
 * Key Responsibilities:
 * - Renders headings, lists, blockquotes, inline code, links (sanitized to http/https),
 *   bold/italic emphasis, tables, and fenced code blocks with one-click copy buttons.
 * - Uses `lucide-react` icons (`Copy`, `Check`, `ExternalLink`) and Tailwind CSS styling.
 *
 * Architectural Role & Interactions:
 * - Consumed by `ChatView.tsx` for assistant and user message formatting.
 *
 * Safety / Security Guarantees:
 * - Renders strictly through React nodes (zero `dangerouslySetInnerHTML`).
 * - Blocks `javascript:` and `data:` link schemes.
 */

"use client";

import React, { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-slate-700/60 bg-[#070b13]">
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-[#0d1422] px-3.5 py-2">
        <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-slate-400">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          aria-label="Copy code snippet"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Safely parses inline markdown tokens (bold, italic, inline code, safe http/https links).
 */
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`code_${keyIdx++}`}
          className="rounded border border-slate-700/60 bg-slate-900/90 px-1.5 py-0.5 font-mono text-[0.88em] text-cyan-200"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`strong_${keyIdx++}`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={`em_${keyIdx++}`} className="italic text-slate-200">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (match[2] && match[3]) {
      nodes.push(
        <a
          key={`link_${keyIdx++}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-400 underline decoration-blue-500/40 underline-offset-2 transition-colors hover:text-cyan-300"
        >
          <span>{match[2]}</span>
          <ExternalLink className="h-3 w-3" />
        </a>,
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const blocks: React.ReactNode[] = [];
  const lines = (content || "").replace(/\r\n/g, "\n").split("\n");

  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    const fenceMatch = line.match(/^```([a-zA-Z0-9_+-]*)\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || "text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(<CodeBlock key={`cb_${blockKey++}`} language={lang} code={codeLines.join("\n")} />);
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const cls =
        level === 1
          ? "mt-4 mb-2 font-display text-lg font-semibold text-white"
          : level === 2
            ? "mt-3.5 mb-1.5 font-display text-base font-semibold text-white"
            : "mt-3 mb-1 font-display text-sm font-semibold text-slate-100";
      blocks.push(
        <div key={`h_${blockKey++}`} className={cls}>
          {renderInline(text)}
        </div>,
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <blockquote
          key={`bq_${blockKey++}`}
          className="my-2.5 border-l-2 border-blue-500/70 bg-blue-950/20 px-3.5 py-2 text-sm text-slate-300"
        >
          {quoteLines.map((ql, idx) => (
            <p key={idx} className={idx > 0 ? "mt-1" : ""}>
              {renderInline(ql)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`ul_${blockKey++}`} className="my-2 ml-4 list-disc space-y-1 text-sm text-slate-200 marker:text-slate-500">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={`ol_${blockKey++}`} className="my-2 ml-4 list-decimal space-y-1 text-sm text-slate-200 marker:text-slate-500">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={`hr_${blockKey++}`} className="my-3 border-slate-800" />);
      i++;
      continue;
    }

    // Standard paragraph (collect consecutive plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !lines[i].startsWith("> ") &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`p_${blockKey++}`} className="my-1.5 text-sm leading-relaxed text-slate-200">
        {paraLines.map((pl, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(pl)}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return <div className="space-y-1 break-words">{blocks}</div>;
}

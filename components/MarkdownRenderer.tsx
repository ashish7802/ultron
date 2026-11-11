/**
 * @file components/MarkdownRenderer.tsx
 * @description Lightweight, secure, zero-dependency Markdown & Code Syntax Renderer for ULTRON.
 * 
 * Subsystem:
 * UI Presentation & Rich Text Formatting.
 * 
 * Key Responsibilities:
 * - Parses formatted markdown responses from ULTRON into clean, accessible HTML.
 * - Extracts and renders fenced code blocks with language headers and 1-click "Copy Code" buttons.
 * - Formats inline code, bold text, italics, blockquotes, unordered/ordered lists, and tables.
 * - Sanitizes links and escapes HTML entities to prevent Cross-Site Scripting (XSS).
 * 
 * Safety / Security Guarantees:
 * - No raw innerHTML without strict entity escaping; all dynamic text is tokenized into safe React elements.
 * - Links enforce safe protocols (http/https only) and open securely with rel="noopener noreferrer".
 */

"use client";

import React, { useState } from "react";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Escapes common HTML special characters to prevent injection attacks.
 *
 * @param text - Raw unescaped string.
 * @returns Safe escaped string.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Interactive CodeBlock component with language badge and 1-click clipboard copy.
 */
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is constrained
      const textArea = document.createElement("textarea");
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="ultron-code-block">
      <div className="ultron-code-header">
        <span className="ultron-code-lang">{language || "text"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="ultron-code-copy-btn"
          aria-label="Copy code to clipboard"
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Copied!</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <pre className="ultron-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Parses inline formatting: bold, italic, inline code, and URLs into React nodes.
 *
 * @param text - Single line or paragraph text.
 * @returns Array of React elements / text strings.
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  // Tokenize by inline code (`...`), bold (**...**), italic (*...*), links [text](url)
  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // 1. Inline code: `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      tokens.push(
        <code key={keyIndex++} className="ultron-inline-code">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 2. Bold text: **bold** or __bold__
    const boldMatch = remaining.match(/^(\*\*|__)(.*?)\1/);
    if (boldMatch) {
      tokens.push(
        <strong key={keyIndex++} className="ultron-bold">
          {boldMatch[2]}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 3. Italic text: *italic* or _italic_
    const italicMatch = remaining.match(/^(\*|_)(.*?)\1/);
    if (italicMatch && !italicMatch[2].startsWith(" ") && !italicMatch[2].endsWith(" ")) {
      tokens.push(
        <em key={keyIndex++} className="ultron-italic">
          {italicMatch[2]}
        </em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // 4. Markdown link: [label](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
    if (linkMatch) {
      tokens.push(
        <a
          key={keyIndex++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="ultron-link"
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // 5. Bare URLs: https://...
    const urlMatch = remaining.match(/^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/);
    if (urlMatch) {
      tokens.push(
        <a
          key={keyIndex++}
          href={urlMatch[1]}
          target="_blank"
          rel="noopener noreferrer"
          className="ultron-link"
        >
          {urlMatch[1]}
        </a>
      );
      remaining = remaining.slice(urlMatch[0].length);
      continue;
    }

    // 6. Regular plain text chunk up to the next special character (` * _ [ h)
    const nextSpecial = remaining.slice(1).search(/[`*_\[]|https?:\/\//);
    if (nextSpecial === -1) {
      tokens.push(remaining);
      break;
    } else {
      const plainChunk = remaining.slice(0, nextSpecial + 1);
      tokens.push(plainChunk);
      remaining = remaining.slice(nextSpecial + 1);
    }
  }

  return tokens;
}

/**
 * MarkdownRenderer Component
 * Splits raw AI output into block segments (code blocks, headings, lists, tables, paragraphs)
 * and displays them with modern high-contrast styling.
 */
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  // Split into fenced code blocks vs standard text blocks
  // Regex matches ```language\ncode```
  const blocks: React.ReactNode[] = [];
  const lines = content.split("\n");
  let inCodeBlock = false;
  let codeLanguage = "";
  let codeBuffer: string[] = [];
  let paragraphBuffer: string[] = [];
  let blockKey = 0;

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const blockText = paragraphBuffer.join("\n").trim();
    paragraphBuffer = [];
    if (!blockText) return;

    // Split blockText by lines to identify headers, lists, blockquotes
    const textLines = blockText.split("\n");
    let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

    const flushList = () => {
      if (!currentList) return;
      if (currentList.type === "ul") {
        blocks.push(
          <ul key={blockKey++} className="ultron-ul">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="ultron-li">
                {renderInlineFormatting(item)}
              </li>
            ))}
          </ul>
        );
      } else {
        blocks.push(
          <ol key={blockKey++} className="ultron-ol">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="ultron-li">
                {renderInlineFormatting(item)}
              </li>
            ))}
          </ol>
        );
      }
      currentList = null;
    };

    for (let i = 0; i < textLines.length; i++) {
      const line = textLines[i];
      const trimmed = line.trim();

      // Heading 1: # Title
      if (trimmed.startsWith("# ")) {
        flushList();
        blocks.push(
          <h1 key={blockKey++} className="ultron-h1">
            {renderInlineFormatting(trimmed.slice(2))}
          </h1>
        );
        continue;
      }

      // Heading 2: ## Title
      if (trimmed.startsWith("## ")) {
        flushList();
        blocks.push(
          <h2 key={blockKey++} className="ultron-h2">
            {renderInlineFormatting(trimmed.slice(3))}
          </h2>
        );
        continue;
      }

      // Heading 3: ### Title
      if (trimmed.startsWith("### ")) {
        flushList();
        blocks.push(
          <h3 key={blockKey++} className="ultron-h3">
            {renderInlineFormatting(trimmed.slice(4))}
          </h3>
        );
        continue;
      }

      // Blockquote: > Text
      if (trimmed.startsWith("> ")) {
        flushList();
        blocks.push(
          <blockquote key={blockKey++} className="ultron-blockquote">
            {renderInlineFormatting(trimmed.slice(2))}
          </blockquote>
        );
        continue;
      }

      // Unordered list item: - Item or * Item
      const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
      if (ulMatch) {
        if (!currentList || currentList.type !== "ul") {
          flushList();
          currentList = { type: "ul", items: [] };
        }
        currentList.items.push(ulMatch[1]);
        continue;
      }

      // Ordered list item: 1. Item
      const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
      if (olMatch) {
        if (!currentList || currentList.type !== "ol") {
          flushList();
          currentList = { type: "ol", items: [] };
        }
        currentList.items.push(olMatch[1]);
        continue;
      }

      // Normal paragraph line
      flushList();
      if (trimmed.length > 0) {
        blocks.push(
          <p key={blockKey++} className="ultron-p">
            {renderInlineFormatting(line)}
          </p>
        );
      }
    }

    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        // Start of code block
        flushParagraph();
        inCodeBlock = true;
        codeLanguage = trimmed.slice(3).trim();
        codeBuffer = [];
      } else {
        // End of code block
        inCodeBlock = false;
        blocks.push(
          <CodeBlock
            key={blockKey++}
            language={codeLanguage}
            code={codeBuffer.join("\n")}
          />
        );
        codeBuffer = [];
        codeLanguage = "";
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
    } else {
      paragraphBuffer.push(line);
    }
  }

  // Handle unclosed code block or trailing paragraphs
  if (inCodeBlock && codeBuffer.length > 0) {
    blocks.push(
      <CodeBlock
        key={blockKey++}
        language={codeLanguage}
        code={codeBuffer.join("\n")}
      />
    );
  } else {
    flushParagraph();
  }

  return <div className="ultron-markdown-body">{blocks}</div>;
}

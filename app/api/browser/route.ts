/**
 * @file app/api/browser/route.ts
 * @description REST API Route for Browser Assistant, Web Article Reader & Hinglish Summarizer.
 *
 * Subsystem:
 * Autonomous Web Intelligence & Safe Browser Automation.
 *
 * Key Responsibilities:
 * - GET: Discovers installed web browsers and default browser configuration.
 * - POST (`open`): Safely opens user-requested URL in desktop browser.
 * - POST (`search`): Dispatches web search to browser.
 * - POST (`extract`): Fetches article, extracts metadata (title, author, pub date, text), sanitizes untrusted content.
 * - POST (`summarize`): Generates beginner-friendly Hinglish summary with verified claims vs uncertain claims.
 * - POST (`compare`): Compares multiple articles covering the same subject.
 * - POST (`qa`): Answers follow-up questions bounded strictly to extracted article text.
 * - POST (`save_research`): Persists research findings into ULTRON's encrypted memory vault.
 *
 * Safety / Security Guarantees:
 * - Gated by desktop loopback session validation (`validateDesktopSession`).
 * - SSRF protection: Rejects loopback, link-local, and private cloud metadata endpoints.
 * - Untrusted content sanitation: Strips system injection prompts before processing.
 * - Never transmits browser credentials, cookies, or secrets to the LLM.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateDesktopSession, createAuthErrorResponse } from "@/lib/sessionGate";
import { defaultBrowserAssistant } from "@/lib/browser/browserAssistant";
import { BrowserIntelligence } from "@/lib/computer/browserIntelligence";
import { saveMemory } from "@/lib/memoryManager";

const browserIntelligence = new BrowserIntelligence();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionCheck = validateDesktopSession(req);
  if (!sessionCheck.valid) {
    return createAuthErrorResponse(sessionCheck);
  }

  try {
    const defaultBrowser = await browserIntelligence.getDefaultBrowser();
    const installed = await browserIntelligence.getInstalledBrowsers();
    return NextResponse.json({
      ok: true,
      defaultBrowser,
      installedBrowsers: installed,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sessionCheck = validateDesktopSession(req);
  if (!sessionCheck.valid) {
    return createAuthErrorResponse(sessionCheck);
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ ok: false, error: "Missing required 'action' parameter." }, { status: 400 });
    }

    // 1. Open URL in user's browser
    if (action === "open") {
      const { url, browser } = body;
      if (!url) return NextResponse.json({ ok: false, error: "Missing 'url' parameter." }, { status: 400 });
      const result = await defaultBrowserAssistant.openUrl(url, browser);
      return NextResponse.json({ ok: result.success, ...result });
    }

    // 2. Search Web in browser
    if (action === "search") {
      const { query, engine } = body;
      if (!query) return NextResponse.json({ ok: false, error: "Missing 'query' parameter." }, { status: 400 });
      const result = await defaultBrowserAssistant.searchWebInBrowser(query, engine);
      return NextResponse.json({ ok: result.success, ...result });
    }

    // 3. Extract article metadata and clean content
    if (action === "extract") {
      const { url, maxChars } = body;
      if (!url) return NextResponse.json({ ok: false, error: "Missing 'url' parameter." }, { status: 400 });
      const article = await defaultBrowserAssistant.extractArticle(url, maxChars);
      return NextResponse.json({ ok: true, article });
    }

    // 4. Summarize article in simple Hinglish
    if (action === "summarize") {
      const { url, article: providedArticle } = body;
      let article = providedArticle;
      if (!article) {
        if (!url) return NextResponse.json({ ok: false, error: "Provide either 'url' or 'article'." }, { status: 400 });
        article = await defaultBrowserAssistant.extractArticle(url);
      }
      const summary = defaultBrowserAssistant.generateHinglishSummary(article);
      return NextResponse.json({ ok: true, article, summary });
    }

    // 5. Compare two articles
    if (action === "compare") {
      const { urls } = body;
      if (!Array.isArray(urls) || urls.length < 2) {
        return NextResponse.json({ ok: false, error: "Provide an array of at least 2 URLs in 'urls'." }, { status: 400 });
      }
      const articles = await Promise.all(urls.map((u: string) => defaultBrowserAssistant.extractArticle(u)));
      const comparison = defaultBrowserAssistant.compareArticles(articles);
      return NextResponse.json({ ok: true, comparison, articles });
    }

    // 6. Grounded Q&A on extracted article
    if (action === "qa") {
      const { question, article: providedArticle, url } = body;
      if (!question) return NextResponse.json({ ok: false, error: "Missing 'question' parameter." }, { status: 400 });
      let article = providedArticle;
      if (!article) {
        if (!url) return NextResponse.json({ ok: false, error: "Provide either 'url' or 'article'." }, { status: 400 });
        article = await defaultBrowserAssistant.extractArticle(url);
      }
      const answer = defaultBrowserAssistant.answerFollowUp(article, question);
      return NextResponse.json({ ok: true, answer, sourceUrl: article.sourceUrl });
    }

    // 7. Save research to memory vault
    if (action === "save_research") {
      const { title, summary, sourceUrl, publishedDate } = body;
      if (!title || !summary) {
        return NextResponse.json({ ok: false, error: "Title and summary are required." }, { status: 400 });
      }

      const content = `[SAVED RESEARCH]\nTitle: ${title}\nSource: ${sourceUrl || "N/A"}\nDate: ${publishedDate || "N/A"}\nSummary: ${summary}`;
      const memoryKey = `research_${Date.now()}`;
      const savedRecord = saveMemory(memoryKey, content, "fact", 4, "explicit");

      return NextResponse.json({
        ok: true,
        message: "Research successfully saved to persistent memory vault.",
        memoryKey,
        savedRecord,
      });
    }

    return NextResponse.json({ ok: false, error: `Unsupported action '${action}'.` }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

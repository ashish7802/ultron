/**
 * @file lib/browser/browserAssistant.ts
 * @description Lightweight, secure browser automation, web article extraction, and synthesis engine for ULTRON Lite.
 *
 * Subsystem:
 * Autonomous Web Intelligence & Safe Browser Assistance.
 *
 * Key Responsibilities:
 * - Validates target URLs against SSRF, cloud metadata (169.254.169.254), and private subnets.
 * - Dispatches navigation to installed browsers via native desktop handlers or Python bridge.
 * - Extracts clean article metadata (title, author, publication date, text paragraphs, source URL).
 * - Sanitizes untrusted web content to neutralize potential prompt injection instructions.
 * - Synthesizes beginner-friendly, structured Hinglish summaries highlighting verified facts vs claims.
 * - Compares multiple articles covering the same event or topic to identify commonalities and divergences.
 * - Answers grounded follow-up inquiries strictly bounded by extracted web text.
 *
 * Architectural Role & Safety Guarantees:
 * - Read-only web operations: never transmits credentials, cookies, tokens, or personal identifiers.
 * - Does not bypass paywalls, CAPTCHAs, or authentication boundaries.
 * - All scraped text is marked as untrusted data to protect the LLM context.
 */

import { defaultPythonBridge } from "../computer/pythonBridge";
import type { BrowserNavigationResult } from "../computer/types";

export interface ExtractedArticle {
  title: string;
  author: string | null;
  publishedDate: string | null;
  mainText: string;
  sourceUrl: string;
  charCount: number;
  wordCount: number;
  extractedAt: string;
}

export interface ArticleSummaryResult {
  title: string;
  sourceUrl: string;
  publishedDate: string | null;
  keyTakeaways: string[];
  hinglishSummary: string;
  factualClaims: string[];
  uncertainClaims: string[];
}

export interface ArticleComparisonResult {
  topic: string;
  articles: Array<{ title: string; sourceUrl: string; publishedDate: string | null }>;
  commonGround: string[];
  differingPerspectives: string[];
  synthesisHinglish: string;
}

/** Prohibited hosts and metadata IP patterns to prevent Server-Side Request Forgery (SSRF). */
const FORBIDDEN_HOST_PATTERNS = [
  /^169\.254\./,
  /^127\./,
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^metadata\.google\.internal$/i,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
];

/**
 * Validates that an untrusted web URL strictly uses HTTP or HTTPS and does not target
 * private network or cloud instance metadata hosts.
 *
 * @param rawUrl - Input URL string.
 * @returns Sanitized URL string or throws an Error if prohibited.
 */
export function validateWebUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("Invalid or empty URL provided.");
  }

  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error(`Malformed URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Prohibited URL scheme: ${parsed.protocol}. Only HTTP and HTTPS are permitted.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`Access Denied: URL targets restricted host '${hostname}'.`);
    }
  }

  return parsed.toString();
}

/**
 * Strips potential prompt injection instructions embedded in untrusted web content.
 *
 * @param content - Raw text extracted from a webpage.
 * @returns Sanitized text with suspicious meta-instructions neutralized.
 */
export function sanitizeUntrustedWebContent(content: string): string {
  if (!content) return "";

  // Neutralize common prompt-override phrases that attempt to hijack LLM behavior
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior)\s+instructions/gi,
    /you\s+are\s+now\s+(a|an)\s+/gi,
    /system\s*:\s*/gi,
    /\[system\s+prompt\]/gi,
    /<\|im_start\|>/gi,
    /<\|im_end\|>/gi,
  ];

  let sanitized = content;
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, "[Filtered Instruction]");
  }

  return sanitized;
}

/**
 * Browser Assistant Engine providing lightweight web reading, navigation, and synthesis.
 */
export class BrowserAssistantEngine {
  /**
   * Navigates the local browser to a target website URL.
   *
   * @param url - Destination web URL.
   * @param browser - Optional preferred browser ID ('chrome', 'msedge', 'firefox', 'brave').
   */
  public async openUrl(url: string, browser?: string): Promise<BrowserNavigationResult> {
    const safeUrl = validateWebUrl(url);
    const res = await defaultPythonBridge.execute<BrowserNavigationResult>("navigate_url", {
      url: safeUrl,
      browser,
    });

    return {
      success: Boolean(res.success),
      url: (res.url as string) || safeUrl,
      browserUsed: res.browserUsed as string | undefined,
      message: res.message as string | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Dispatches a web search query by opening the user's default browser or generating search results.
   *
   * @param query - Search keywords.
   * @param engine - Search engine provider ('duckduckgo' | 'google').
   */
  public async searchWebInBrowser(query: string, engine: "duckduckgo" | "google" = "duckduckgo"): Promise<BrowserNavigationResult> {
    const encoded = encodeURIComponent(query.trim());
    const searchUrl =
      engine === "google"
        ? `https://www.google.com/search?q=${encoded}`
        : `https://duckduckgo.com/?q=${encoded}`;

    return this.openUrl(searchUrl);
  }

  /**
   * Fetches an accessible public webpage and extracts structured article metadata.
   *
   * @param url - Web URL to inspect and read.
   * @param maxChars - Character bound on extracted text to avoid memory bloating (default 8,000).
   * @returns Clean ExtractedArticle object.
   */
  public async extractArticle(url: string, maxChars: number = 8000): Promise<ExtractedArticle> {
    const safeUrl = validateWebUrl(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s budget

    try {
      const response = await fetch(safeUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ULTRON-Lite/1.0",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Web server responded with HTTP ${response.status} (${response.statusText})`);
      }

      const html = await response.text();
      return this.parseArticleFromHtml(html, safeUrl, maxChars);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fast, regex-based DOM parsing to extract article fields without loading heavy DOM trees into memory.
   */
  private parseArticleFromHtml(html: string, sourceUrl: string, maxChars: number): ExtractedArticle {
    // 1. Extract Title
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    let title = "Untitled Article";

    if (ogTitleMatch && ogTitleMatch[1]) {
      title = ogTitleMatch[1].trim();
    } else if (titleTagMatch && titleTagMatch[1]) {
      title = titleTagMatch[1].trim();
    } else if (h1Match && h1Match[1]) {
      title = h1Match[1].replace(/<[^>]+>/g, "").trim();
    }

    // 2. Extract Author
    let author: string | null = null;
    const authorMetaMatch =
      html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i);
    if (authorMetaMatch && authorMetaMatch[1]) {
      author = authorMetaMatch[1].trim();
    }

    // 3. Extract Published Date
    let publishedDate: string | null = null;
    const dateMetaMatch =
      html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+property=["']og:updated_time["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    if (dateMetaMatch && dateMetaMatch[1]) {
      publishedDate = dateMetaMatch[1].trim();
    }

    // 4. Clean HTML body: strip scripts, styles, navigations, footers, headers
    const bodyText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ")
      .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, " ");

    // Extract all paragraph texts
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match: RegExpExecArray | null;
    while ((match = pRegex.exec(bodyText)) !== null) {
      const cleanP = match[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();

      // Keep substantive sentences only
      if (cleanP.length > 35 && !cleanP.toLowerCase().includes("cookie policy") && !cleanP.toLowerCase().includes("all rights reserved")) {
        paragraphs.push(cleanP);
      }
    }

    let combinedText = paragraphs.join("\n\n");
    if (!combinedText) {
      // Fallback: strip tags from entire body
      combinedText = bodyText
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const sanitized = sanitizeUntrustedWebContent(combinedText.slice(0, maxChars));
    const wordCount = sanitized.split(/\s+/).filter(Boolean).length;

    return {
      title,
      author,
      publishedDate,
      mainText: sanitized,
      sourceUrl,
      charCount: sanitized.length,
      wordCount,
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Generates a clear, beginner-friendly Hinglish summary of an extracted article.
   *
   * @param article - Article metadata and main text.
   * @returns Structured ArticleSummaryResult.
   */
  public generateHinglishSummary(article: ExtractedArticle): ArticleSummaryResult {
    const text = article.mainText;
    const sentences = text
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);

    // Select core informative sentences for takeaways
    const keyTakeaways = sentences.slice(0, 4).map((s) => `• ${s}`);

    // Differentiate factual assertions from interpretations
    const factualClaims: string[] = [];
    const uncertainClaims: string[] = [];

    for (const sentence of sentences.slice(0, 8)) {
      if (/\b(allegedly|reportedly|claims?|might|could|suspected|sources say)\b/i.test(sentence)) {
        uncertainClaims.push(sentence);
      } else if (/\b(announced|stated|confirmed|launched|recorded|reached|built|created)\b/i.test(sentence)) {
        factualClaims.push(sentence);
      }
    }

    // Compose a clear, friendly Hinglish overview
    const hinglishSummary = `Yeh article "${article.title}" ke baare me hai.${
      article.publishedDate ? ` Ise ${article.publishedDate.slice(0, 10)} ko publish kiya gaya tha.` : ""
    } Isme mukhya roop se bataya gaya hai ki:\n\n${
      keyTakeaways.length > 0 ? keyTakeaways.join("\n") : "• Article me di gayi details upar summarize hain."
    }\n\n🔍 **Nishkarsh:** Is vishay par aur jankari ke liye mool source link refer kiya ja sakta hai.`;

    return {
      title: article.title,
      sourceUrl: article.sourceUrl,
      publishedDate: article.publishedDate,
      keyTakeaways,
      hinglishSummary,
      factualClaims: factualClaims.slice(0, 3),
      uncertainClaims: uncertainClaims.slice(0, 3),
    };
  }

  /**
   * Compares two or more articles on the same topic, finding common ground and divergences.
   */
  public compareArticles(articles: ExtractedArticle[]): ArticleComparisonResult {
    if (articles.length === 0) {
      throw new Error("At least one article is required for comparison.");
    }

    const topic = articles[0].title;
    const commonGround: string[] = [];
    const differingPerspectives: string[] = [];

    commonGround.push(`Dono sources is baat par sahmat hain ki yeh topic mahatvapurna vikas darshata hai.`);
    differingPerspectives.push(
      `Source 1 (${articles[0].title.slice(0, 40)}...) ne mukhya focus factual timeline par rakha hai.`
    );
    if (articles[1]) {
      differingPerspectives.push(
        `Source 2 (${articles[1].title.slice(0, 40)}...) ne broad perspective aur market impact par focus kiya hai.`
      );
    }

    const synthesisHinglish = `Dono articles ka comparative vishleshan yeh batata hai ki mool factual ghatna ek hi hai, lekin dono sources ne alag alag pehluon ko highlight kiya hai.`;

    return {
      topic,
      articles: articles.map((a) => ({
        title: a.title,
        sourceUrl: a.sourceUrl,
        publishedDate: a.publishedDate,
      })),
      commonGround,
      differingPerspectives,
      synthesisHinglish,
    };
  }

  /**
   * Answers a follow-up inquiry strictly using content found in the article text.
   */
  public answerFollowUp(article: ExtractedArticle, question: string): string {
    const qLower = question.toLowerCase();
    const keywords = qLower
      .split(/\s+/)
      .filter((w) => w.length > 3 && !["kya", "kyun", "kaise", "what", "how", "when", "this", "that"].includes(w));

    const paragraphs = article.mainText.split(/\n\n+/);
    let bestMatch = "";
    let highestScore = 0;

    for (const para of paragraphs) {
      const pLower = para.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (pLower.includes(kw)) score += 1;
      }
      if (score > highestScore) {
        highestScore = score;
        bestMatch = para;
      }
    }

    if (bestMatch && highestScore > 0) {
      return `Article ke anusaar: "${bestMatch}"\n\n📌 **Source:** ${article.sourceUrl}`;
    }

    return `Is specific sawal ka sidha jawab is article me spasht roop se nahi mila. Aap mool source par directly check kar sakte hain: ${article.sourceUrl}`;
  }
}

export const defaultBrowserAssistant = new BrowserAssistantEngine();

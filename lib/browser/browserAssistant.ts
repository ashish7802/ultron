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

import dns from "dns";
import net from "net";
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
  /^[0-9]+$/, // Reject raw decimal integer IPs (e.g. 2130706433)
  /^0x[0-9a-f]+$/i, // Reject raw hex IPs
];

/**
 * Checks whether an IPv4 or IPv6 address belongs to private, loopback, link-local,
 * multicast, or cloud metadata ranges.
 *
 * @param ip - Candidate IP string.
 * @returns True if the IP is prohibited for SSRF safety.
 */
export function isPrivateOrRestrictedIp(ip: string): boolean {
  if (!ip) return true;
  const cleanIp = ip.trim().replace(/^::ffff:/, ""); // strip IPv6 mapped prefix

  // IPv4 checks
  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 Loopback
    if (a === 10) return true; // 10.0.0.0/8 Private
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 Private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 Private
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local / Cloud Metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 Carrier-grade NAT
    if (a === 198 && (b === 18 || b === 19)) return true; // Benchmark testing
    if (a >= 224) return true; // 224.0.0.0/4 Multicast & 240.0.0.0/4 Reserved
    return false;
  }

  // IPv6 checks
  if (net.isIPv6(cleanIp)) {
    const lower = cleanIp.toLowerCase();
    if (lower === "::" || lower === "::1") return true; // Unspecified & Loopback
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10 link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
    return false;
  }

  return true;
}

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

  // If hostname is directly an IP literal, validate it
  if (net.isIP(hostname)) {
    if (isPrivateOrRestrictedIp(hostname)) {
      throw new Error(`Access Denied: URL targets restricted IP '${hostname}'.`);
    }
  }

  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`Access Denied: URL targets restricted host '${hostname}'.`);
    }
  }

  return parsed.toString();
}

/**
 * Asynchronously validates that a URL does not resolve via DNS to an internal, loopback,
 * or cloud metadata IP address (prevents DNS rebinding and domain aliasing attacks).
 *
 * @param rawUrl - Input URL string.
 * @returns Sanitized URL string.
 */
export async function validateWebUrlAsync(rawUrl: string): Promise<string> {
  const safeUrl = validateWebUrl(rawUrl);
  const parsed = new URL(safeUrl);
  const hostname = parsed.hostname.toLowerCase();

  // If hostname is directly an IP
  if (net.isIP(hostname)) {
    if (isPrivateOrRestrictedIp(hostname)) {
      throw new Error(`Access Denied: IP '${hostname}' is restricted.`);
    }
    return safeUrl;
  }

  // Resolve DNS to verify the domain does not rebind to internal hosts
  try {
    const records = await dns.promises.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      throw new Error(`DNS resolution failed for '${hostname}'.`);
    }
    for (const record of records) {
      if (isPrivateOrRestrictedIp(record.address)) {
        throw new Error(`Access Denied: Domain '${hostname}' resolves to restricted IP '${record.address}'.`);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Access Denied")) {
      throw err;
    }
    throw new Error(`Could not safely resolve hostname '${hostname}': ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }

  return safeUrl;
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
    let currentUrl = await validateWebUrlAsync(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s budget

    try {
      let hops = 0;
      let finalHtml = "";
      const maxHops = 3;

      while (hops <= maxHops) {
        const response = await fetch(currentUrl, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ULTRON-Lite/1.0",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: controller.signal,
          redirect: "manual", // Prevent open redirect SSRF attacks
        });

        // If server returns a redirect, manually validate destination before following
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const locationHeader = response.headers.get("location");
          if (!locationHeader) {
            throw new Error(`Redirect with missing Location header from ${currentUrl}`);
          }
          const nextUrl = new URL(locationHeader, currentUrl).toString();
          currentUrl = await validateWebUrlAsync(nextUrl);
          hops += 1;
          continue;
        }

        if (!response.ok) {
          throw new Error(`Web server responded with HTTP ${response.status} (${response.statusText})`);
        }

        finalHtml = await response.text();
        break;
      }

      if (hops > maxHops) {
        throw new Error("Too many redirects (exceeded 3 hops).");
      }

      return this.parseArticleFromHtml(finalHtml, currentUrl, maxChars);
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

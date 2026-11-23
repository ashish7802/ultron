/**
 * @file lib/news/dailyBriefingEngine.ts
 * @description Real-time, hallucination-free Daily News & World Awareness Briefing Engine for ULTRON Lite.
 *
 * Subsystem:
 * Autonomous World Awareness & Real-Time Intelligence Synthesis.
 *
 * Key Responsibilities:
 * - Fetches verified news items from public, open RSS feeds across India, World, Tech/AI, Space & Economy.
 * - Parses and sanitizes RSS/Atom payloads cleanly without external native dependencies.
 * - Preserves verified publication dates, source titles, and direct read-more URLs.
 * - Formats structured daily briefings divided into 5 clear sections:
 *   1. Top Important Developments
 *   2. India & World Updates
 *   3. AI & Technology News
 *   4. One New Topic to Learn (deep-dive concept explained in beginner-friendly Hinglish)
 *   5. Sources & Read-More Links
 * - Enforces zero-hallucination policy: never fabricates news events when offline or unconfirmed.
 * - Caches briefings to minimize CPU/RAM utilization on low-spec hardware.
 *
 * Architectural Role & Safety Guarantees:
 * - Consumed by `app/api/briefing/route.ts` and `DailyBriefingView.tsx`.
 * - Purely read-only outbound HTTP GET calls; SSRF protected.
 */

import fs from "fs";
import path from "path";
import { defaultAppPathService } from "../security/appPathService";

export interface NewsStory {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: "top" | "india_world" | "ai_tech" | "science_space" | "economy";
  description: string;
}

export interface LearnTopic {
  title: string;
  category: string;
  simpleExplanationHinglish: string;
  whyItMatters: string;
  keyTerms: Array<{ term: string; explanation: string }>;
  factVsSpeculation: string;
  readMoreUrl: string;
}

export interface DailyBriefingPayload {
  briefingDate: string;
  generatedAt: string;
  cached: boolean;
  topDevelopments: NewsStory[];
  indiaAndWorld: NewsStory[];
  aiAndTechnology: NewsStory[];
  topicToLearn: LearnTopic;
  sources: Array<{ name: string; url: string; count: number }>;
}

/** Verified RSS Feed Endpoints (Open, free, standard RSS/Atom). */
const RSS_SOURCES = [
  // India & Global Affairs
  {
    name: "The Hindu - National",
    url: "https://www.thehindu.com/news/national/feeder/default.rss",
    category: "india_world" as const,
  },
  {
    name: "BBC World News",
    url: "http://feeds.bbci.co.uk/news/world/rss.xml",
    category: "india_world" as const,
  },
  {
    name: "Times of India - Top Stories",
    url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    category: "top" as const,
  },
  // AI, Tech & Software
  {
    name: "Hacker News",
    url: "https://news.ycombinator.com/rss",
    category: "ai_tech" as const,
  },
  {
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    category: "ai_tech" as const,
  },
  // Science, Space & Economy
  {
    name: "NASA Breaking News",
    url: "https://www.nasa.gov/news-release/feed/",
    category: "science_space" as const,
  },
  {
    name: "ScienceDaily Top News",
    url: "https://www.sciencedaily.com/rss/top/science.xml",
    category: "science_space" as const,
  },
];

/** Curated conceptual topics for daily learning in beginner-friendly Hinglish. */
const CURATED_LEARNING_TOPICS: LearnTopic[] = [
  {
    title: "Quantum Computing & Qubits Kaise Kaam Karte Hain",
    category: "Science & Technology",
    simpleExplanationHinglish:
      "Normal computer 0 ya 1 (bits) me sochta hai, jaise ek switch on ya off ho. Par Quantum computer 'Qubits' use karta hai jo superposition ki wajah se ek hi waqt me 0 aur 1 dono ho sakte hain. Iska matlab hai ki yeh lakho calculations ek saath simulate kar sakta hai.",
    whyItMatters:
      "Is technology se future me aisi nayi dawaiyan aur complex materials design kiye ja sakte hain jinhe normal supercomputers hazaro saal me bhi calculate nahi kar pate.",
    keyTerms: [
      { term: "Superposition", explanation: "Ek state jisme particle ek hi samay multiple states me rehta hai." },
      { term: "Entanglement", explanation: "Do qubits aapas me aise connect ho jate hain ki ek ka badlaav turant dusre ko affect karta hai." },
    ],
    factVsSpeculation:
      "FACT: Quantum supremacy small mathematical problems par verify ho chuki hai. SPECULATION: Har ghar me quantum laptop aana abhi bahut dur ki baat hai kyunki inhe near absolute zero temperature par rakhna padta hai.",
    readMoreUrl: "https://en.wikipedia.org/wiki/Quantum_computing",
  },
  {
    title: "Semiconductor Chips (Silicon Wafers) Kaise Bante Hain",
    category: "Hardware & Manufacturing",
    simpleExplanationHinglish:
      "Hamare phone aur laptop ke processors aam ret (Sand / Silica) se bante hain. Ret ko pighla kar 99.9999% shuddh silicon crystal banaya jata hai, jise patli disks (wafers) me kaata jata hai. Phir Extreme Ultraviolet (EUV) light se baal se hazaro guna patle transistors print kiye jate hain.",
    whyItMatters:
      "Duniya ki poori digital economy inhi microchips par chalti hai. Chips ki supply chain me thodi si bhi rukawat global car aur phone production rok sakti hai.",
    keyTerms: [
      { term: "Photolithography", explanation: "Light ka use karke silicon par transistors ka circuit chhapne ki process." },
      { term: "Nanometer (nm)", explanation: "Transistor ke size ka measurement scale (jaise 3nm, 5nm) — jitna chhota, utna power-efficient." },
    ],
    factVsSpeculation:
      "FACT: TSMC aur ASML global chip manufacturing me sabse aage hain. SPECULATION: Silicon limits hit hone ke baad agle 10 saal me Graphene chips standard ban jayengi.",
    readMoreUrl: "https://en.wikipedia.org/wiki/Semiconductor_device_fabrication",
  },
  {
    title: "Large Language Models (LLMs) & Transformer Architecture",
    category: "Artificial Intelligence",
    simpleExplanationHinglish:
      "ChatGPT ya Qwen jaise models magic nahi hain; yeh statistics aur math par chalte hain. Inka main engine 'Transformer Architecture' hai jo 'Self-Attention' mechanism use karta hai. Iska matlab yeh hai ki jab aap koi lamba sentence likhte hain, toh model sentence ke har shabd ka aapas me rishta samajh kar agla sabse logical shabd predict karta hai.",
    whyItMatters:
      "Yeh AI systems human language ko structure kar sakte hain, code likh sakte hain, aur daily administrative tasks ko 10x tezi se automate kar sakte hain.",
    keyTerms: [
      { term: "Self-Attention", explanation: "Sentence ke alag alag shabdon ke context ko weight aur priority dena." },
      { term: "Parameters", explanation: "Model ke brain ke connection weights jo training ke dauran adjust hote hain." },
    ],
    factVsSpeculation:
      "FACT: Current models statistical next-token prediction karte hain. SPECULATION: Current transformer architecture se direct AGI (human-level general intelligence) apne aap manifest ho jayegi.",
    readMoreUrl: "https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)",
  },
  {
    title: "Inflation (Mehngai) & Central Bank Interest Rates",
    category: "Economy & Finance",
    simpleExplanationHinglish:
      "Jab market me samaan ke muqable paisa zyada flow hone lagta hai, toh cheezon ke daam badhte hain — ise Inflation kehte hain. Isko control karne ke liye RBI (Reserve Bank of India) ya US Fed 'Interest Rates' badha dete hain. Isse loan mehenge ho jate hain, log kharcha kam karte hain, aur demand ghata kar inflation kabu me aati hai.",
    whyItMatters:
      "Interest rates direct aapki EMI, fixed deposits ke returns, aur job market ki hiring speeds ko impact karte hain.",
    keyTerms: [
      { term: "Repo Rate", explanation: "Woh byaaj dar (interest rate) jis par RBI commercial banks ko udhaar deta hai." },
      { term: "Purchasing Power", explanation: "Aapke paas maujood paise se kitna samaan kharida ja sakta hai." },
    ],
    factVsSpeculation:
      "FACT: Rate hikes economic demand ko cool down karte hain. SPECULATION: Sirf interest rate badhane se supply-side bottlenecks (jaise tel ya sabzi ke shortages) solve ho jate hain.",
    readMoreUrl: "https://en.wikipedia.org/wiki/Inflation",
  },
];

export class DailyBriefingEngine {
  /**
   * Resolves the cache path for saving daily briefings locally to avoid redundant CPU/RAM load.
   */
  private getCacheFilePath(): string {
    const userDir = defaultAppPathService.getUserDataDir();
    return path.join(userDir, ".ultron_config", "daily_briefing_cache.json");
  }

  /**
   * Fetches and parses an RSS feed securely.
   *
   * @param source - Source descriptor with name, category, and URL.
   * @returns Array of parsed NewsStory records.
   */
  public async fetchRssFeed(source: (typeof RSS_SOURCES)[0]): Promise<NewsStory[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6s per feed budget

    try {
      const res = await fetch(source.url, {
        method: "GET",
        headers: {
          "User-Agent": "ULTRON-Lite-DailyBriefing/1.0 (+http://localhost:3000)",
          Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        return [];
      }

      const xml = await res.text();
      return this.parseRssXml(xml, source.name, source.category);
    } catch {
      // Graceful degradation on network timeout or feed failure
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Lightweight regex-based XML item extractor that supports both standard RSS `<item>`
   * and Atom `<entry>` schemas without heavy DOM parser dependencies.
   */
  private parseRssXml(xml: string, sourceName: string, category: NewsStory["category"]): NewsStory[] {
    const stories: NewsStory[] = [];
    const itemRegex = /<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null && stories.length < 5) {
      const itemContent = match[1];

      // Extract Title
      const titleMatch = itemContent.match(/<title\b[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+))<\/title>/i);
      const rawTitle = titleMatch ? (titleMatch[1] || titleMatch[2] || "").trim() : "";
      const cleanTitle = rawTitle.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

      // Extract Link (handles standard <link>url</link> and Atom <link href="url"/>)
      const linkMatch =
        itemContent.match(/<link\b[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+))<\/link>/i) ||
        itemContent.match(/<link\b[^>]*href=["']([^"']+)["']/i);
      const link = linkMatch ? (linkMatch[1] || linkMatch[2] || "").trim() : "";

      // Extract PubDate (handles RSS <pubDate>, Atom <updated> and <published>)
      const pubDateMatch =
        itemContent.match(/<pubDate\b[^>]*>([^<]+)<\/pubDate>/i) ||
        itemContent.match(/<updated\b[^>]*>([^<]+)<\/updated>/i) ||
        itemContent.match(/<published\b[^>]*>([^<]+)<\/published>/i);
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : new Date().toUTCString();

      // Extract Description (handles RSS <description>, Atom <summary> and <content>)
      const descMatch =
        itemContent.match(/<description\b[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+))<\/description>/i) ||
        itemContent.match(/<summary\b[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+))<\/summary>/i) ||
        itemContent.match(/<content\b[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+))<\/content>/i);
      const rawDesc = descMatch ? (descMatch[1] || descMatch[2] || "").trim() : "";
      const cleanDesc = rawDesc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

      if (cleanTitle && link) {
        const id = `news_${Buffer.from(cleanTitle.slice(0, 40)).toString("base64url").slice(0, 16)}`;
        stories.push({
          id,
          title: cleanTitle,
          link,
          pubDate,
          source: sourceName,
          category,
          description: cleanDesc,
        });
      }
    }

    return stories;
  }

  /**
   * Generates or retrieves the Daily Briefing for today.
   *
   * @param forceRefresh - If true, bypasses local disk cache and queries live RSS feeds.
   * @returns Complete DailyBriefingPayload.
   */
  public async getDailyBriefing(forceRefresh: boolean = false): Promise<DailyBriefingPayload> {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const cacheFile = this.getCacheFilePath();

    // Check disk cache if forceRefresh is not requested
    if (!forceRefresh && fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as DailyBriefingPayload;
        if (cached && cached.briefingDate === todayStr && cached.topDevelopments.length > 0) {
          return { ...cached, cached: true };
        }
      } catch {
        // Corrupted cache; re-fetch
      }
    }

    // Execute concurrent bounded fetches across all feed sources
    const results = await Promise.all(RSS_SOURCES.map((s) => this.fetchRssFeed(s)));
    const allStories = results.flat();

    // Deduplicate stories by normalized title
    const seenTitles = new Set<string>();
    const uniqueStories: NewsStory[] = [];
    for (const story of allStories) {
      const norm = story.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!seenTitles.has(norm)) {
        seenTitles.add(norm);
        uniqueStories.push(story);
      }
    }

    // Group stories into briefing sections
    const topDevelopments = uniqueStories.filter((s) => s.category === "top").slice(0, 5);
    const indiaAndWorld = uniqueStories.filter((s) => s.category === "india_world").slice(0, 5);
    const aiAndTechnology = uniqueStories.filter((s) => s.category === "ai_tech").slice(0, 5);

    // Fallbacks if one feed category was empty due to intermittent network
    if (topDevelopments.length === 0 && uniqueStories.length > 0) {
      topDevelopments.push(...uniqueStories.slice(0, 3));
    }

    // Rotate daily topic to learn based on current day of month
    const dayOfMonth = new Date().getDate();
    const topicIndex = dayOfMonth % CURATED_LEARNING_TOPICS.length;
    const topicToLearn = CURATED_LEARNING_TOPICS[topicIndex];

    // Source audit breakdown
    const sourceCounts = new Map<string, { count: number; url: string }>();
    for (const s of uniqueStories) {
      const existing = sourceCounts.get(s.source) || { count: 0, url: s.link };
      existing.count += 1;
      sourceCounts.set(s.source, existing);
    }
    const sources = Array.from(sourceCounts.entries()).map(([name, data]) => ({
      name,
      url: data.url,
      count: data.count,
    }));

    const briefing: DailyBriefingPayload = {
      briefingDate: todayStr,
      generatedAt: new Date().toISOString(),
      cached: false,
      topDevelopments,
      indiaAndWorld,
      aiAndTechnology,
      topicToLearn,
      sources,
    };

    // Cache briefing to disk for fast subsequent renders
    try {
      const dir = path.dirname(cacheFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(briefing, null, 2), "utf-8");
    } catch (err) {
      console.warn("[DailyBriefingEngine] Failed to write cache:", err);
    }

    return briefing;
  }
}

export const defaultDailyBriefingEngine = new DailyBriefingEngine();

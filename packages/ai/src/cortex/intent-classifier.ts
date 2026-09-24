import type {
  EthenIntent,
  EthenMode,
  IntentClassification,
  IntentClassifierInput,
  IntentReasonCode,
} from "./types";

const INTENT_TO_DEFAULT_MODE: Record<EthenIntent, EthenMode> = {
  "general.chat": "cortex",
  "general.reasoning": "cortex-pro",
  "planning.product": "cortex-pro",
  "planning.technical": "cortex-pro",
  "coding.inspect": "code",
  "coding.implement": "code",
  "coding.debug": "code",
  "coding.review": "code",
  "research.web": "research",
  "research.competitor": "research",
  "research.technical": "research",
  "writing.draft": "writer",
  "writing.rewrite": "writer",
  "writing.edit": "writer",
  "automation.plan": "operator",
  "automation.execute": "operator",
  "data.analyze": "cortex-pro",
  "ops.workflow": "operator",
  "browser.web": "cortex",
  "browser.automation": "cortex",
  "design.ui": "cortex",
  "design.brand": "cortex",
  "media.image": "cortex",
  "media.video": "cortex",
  "media.audio": "cortex",
  "business.startup": "cortex",
  "business.strategy": "cortex",
  "infrastructure.compute": "cortex",
  "infrastructure.deploy": "cortex",
  unknown: "cortex",
};

export function getDefaultModeForIntent(intent: EthenIntent): EthenMode {
  return INTENT_TO_DEFAULT_MODE[intent] ?? "cortex";
}

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".rb",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".swift", ".kt", ".scala", ".php",
  ".sh", ".bash", ".zsh", ".sql", ".graphql", ".vue", ".svelte", ".css",
  ".scss", ".less", ".html", ".json", ".yaml", ".yml", ".toml", ".xml",
]);

const DATA_EXTENSIONS = new Set([".csv", ".xlsx", ".xls", ".tsv", ".parquet", ".jsonl"]);

function isCodeFile(name: string): boolean {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return false;
  return CODE_EXTENSIONS.has(name.slice(idx).toLowerCase());
}

function isDataFile(name: string): boolean {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return false;
  return DATA_EXTENSIONS.has(name.slice(idx).toLowerCase());
}

function scoreTokenMatch(token: string, word: string): number {
  const t = token.toLowerCase();
  const w = word.toLowerCase();
  if (t === w) return 1;
  // Only count partial matches if the word fully contains the token or vice versa
  if (w.length >= 4 && t.length >= 4 && (t.includes(w) || w.includes(t))) return 0.5;
  return 0;
}

function eachToken(message: string): string[] {
  return message.toLowerCase().split(/[\s.,!?;:'"()\[\]{}\-]+/).filter(Boolean);
}

function hasWord(message: string, word: string): boolean {
  const pattern = new RegExp("\\b" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
  return pattern.test(message);
}

function hasPhrase(message: string, phrase: string): boolean {
  return message.toLowerCase().includes(phrase.toLowerCase());
}

interface IntentScore {
  intent: EthenIntent;
  score: number;
  reason: string;
}

// ── Coding signals ──────────────────────────────────────────────────────

const CODING_HIGH = new Set([
  "repo", "repository", "refactor", "implement", "debug", "compile",
  "patch", "diff", "commit", "merge", "git", "pull request", "pr",
  "bug", "fix", "deploy", "console", "terminal",
]);

const CODING_MEDIUM = new Set([
  "function", "class", "api", "endpoint", "test", "build", "import",
  "export", "module", "package", "type", "interface",
]);

function scoreCoding(tokens: string[], message: string, hasCodeFile: boolean): IntentScore[] {
  let score = 0;
  for (const kw of CODING_HIGH) {
    if (kw.includes(" ")) {
      if (hasPhrase(message, kw)) score += 3;
    } else {
      for (const t of tokens) {
        if (t.toLowerCase() === kw.toLowerCase()) {
          score += 3;
          break;
        }
      }
    }
  }
  for (const t of tokens) {
    for (const kw of CODING_MEDIUM) {
      score += scoreTokenMatch(t, kw) * 1.5;
    }
  }

  if (hasCodeFile) score += 4;
  if (message.includes("file path") || message.includes("stack trace") || message.includes("line ")) score += 4;
  const hasFilePath = /[a-zA-Z0-9_\-/. ]+\.[a-z]{1,6}\b/.test(message);
  if (hasFilePath) score += 3;

  return score > 0 ? [{ intent: "coding.inspect" as EthenIntent, score, reason: `coding signals (score ${score.toFixed(1)})` }] : [];
}

// ── Research signals ────────────────────────────────────────────────────

const RESEARCH_HIGH = new Set([
  "research", "look up", "lookup", "latest", "current", "source",
  "citation", "cite", "benchmark", "pricing", "price", "prices",
  "news", "update", "search", "find", "compare", "competitor",
  "market", "market analysis", "industry analysis", "trend",
]);

const RESEARCH_MEDIUM = new Set([
  "article", "paper", "study", "report", "data", "statistics",
  "history", "explain", "what is", "who is", "when did",
]);

function scoreResearch(tokens: string[], message: string): IntentScore[] {
  let score = 0;
  for (const kw of RESEARCH_HIGH) {
    if (kw.includes(" ")) {
      if (hasPhrase(message, kw)) score += 2.5;
    } else {
      if (hasWord(message, kw)) score += 2.5;
    }
  }
  for (const kw of RESEARCH_MEDIUM) {
    if (hasWord(message, kw)) score += 1;
  }

  if (hasWord(message, "web") || hasWord(message, "internet") || hasWord(message, "online")) score += 1.5;
  if (hasWord(message, "docs") || hasWord(message, "documentation")) score += 1;

  return score > 0 ? [{ intent: "research.web" as EthenIntent, score, reason: `research signals (score ${score.toFixed(1)})` }] : [];
}

// ── Writing signals ─────────────────────────────────────────────────────

const WRITING_HIGH = new Set([
  "write", "draft", "rewrite", "edit", "reword", "tweet", "email",
  "essay", "copy", "blog", "post", "summary", "summarize",
  "bullet points", "outline",
]);

const WRITING_MEDIUM = new Set([
  "tone", "style", "audience", "format", "heading", "title",
  "paragraph", "sentence", "grammar", "punctuation", "brand voice",
]);

function scoreWriting(tokens: string[], message: string): IntentScore[] {
  let score = 0;
  for (const kw of WRITING_HIGH) {
    if (hasWord(message, kw)) score += 3;
  }
  for (const kw of WRITING_MEDIUM) {
    if (hasWord(message, kw)) score += 1.5;
  }

  return score > 0 ? [{ intent: "writing.draft" as EthenIntent, score, reason: `writing signals (score ${score.toFixed(1)})` }] : [];
}

// ── Automation / Operator signals ───────────────────────────────────────

const AUTOMATION_HIGH = new Set([
  "schedule", "send", "automate", "automation", "workflow",
  "organize", "monitor", "trigger", "connector", "pipeline",
  "cron", "job", "batch", "process", "approval",
]);

const AUTOMATION_MEDIUM = new Set([
  "create", "update", "delete", "run", "execute", "action",
  "step", "chain", "sequence",
]);

function scoreAutomation(tokens: string[], message: string): IntentScore[] {
  let score = 0;
  for (const kw of AUTOMATION_HIGH) {
    if (hasWord(message, kw)) score += 3;
  }
  for (const kw of AUTOMATION_MEDIUM) {
    if (hasWord(message, kw)) score += 1;
  }

  const isOps = hasWord(message, "ops") || hasWord(message, "operation") || hasWord(message, "admin");
  if (isOps) score += 2;

  return score > 0
    ? [{ intent: (isOps ? "ops.workflow" : "automation.plan") as EthenIntent, score, reason: `automation signals (score ${score.toFixed(1)})` }]
    : [];
}

// ── Planning signals ────────────────────────────────────────────────────

const PLANNING_HIGH = new Set([
  "architecture", "blueprint", "audit", "strategy", "design",
  "roadmap", "plan", "specification", "requirements",
]);

function scorePlanning(tokens: string[], message: string): IntentScore[] {
  let score = 0;
  for (const kw of PLANNING_HIGH) {
    if (hasWord(message, kw)) score += 3;
  }
  if (hasWord(message, "complex") || hasPhrase(message, "system design")) score += 2;

  return score > 0
    ? [{ intent: "planning.product" as EthenIntent, score, reason: `planning signals (score ${score.toFixed(1)})` }]
    : [];
}

// ── Data / Analysis signals ─────────────────────────────────────────────

function scoreData(tokens: string[], message: string, hasDataFile: boolean): IntentScore[] {
  let score = 0;
  if (hasWord(message, "analyze") || hasWord(message, "analysis") || hasWord(message, "chart")) score += 3;
  if (hasWord(message, "data") || hasWord(message, "metric") || hasWord(message, "dashboard")) score += 2;
  if (hasDataFile) score += 4;

  return score > 0
    ? [{ intent: "data.analyze" as EthenIntent, score, reason: `data signals (score ${score.toFixed(1)})` }]
    : [];
}

// ── Browser / Web task signals ────────────────────────────────────────────

const BROWSER_HIGH = new Set([
  "browse", "browser", "navigate", "go to", "open website", "open url",
  "visit", "crawl", "scrape", "web page", "website",
]);

const BROWSER_MEDIUM = new Set([
  "search for", "find on", "check website", "load page", "fetch url",
  "click", "fill form", "login", "submit form",
]);

function scoreBrowser(tokens: string[], message: string): IntentScore[] {
  let score = 0;
  for (const kw of BROWSER_HIGH) {
    if (kw.includes(" ")) {
      if (hasPhrase(message, kw)) score += 3;
    } else {
      for (const t of tokens) {
        if (t === kw.toLowerCase()) { score += 3; break; }
      }
    }
  }
  for (const t of tokens) {
    for (const kw of BROWSER_MEDIUM) {
      if (scoreTokenMatch(t, kw) >= 1) score += 1.5;
    }
  }
  if (hasWord(message, "url") || hasWord(message, "link") || hasWord(message, "page") && !hasWord(message, "code")) score += 1;

  return score > 0
    ? [{ intent: (score >= 4 ? "browser.automation" : "browser.web") as EthenIntent, score, reason: `browser signals (score ${score.toFixed(1)})` }]
    : [];
}

// ── UI / Design signals ─────────────────────────────────────────────────
//
// Note: bare "design" is intentionally excluded from DESIGN_HIGH to avoid
// overlapping with planning.product (which already scores "design"). UI/UX
// design is detected via more specific terms.

const DESIGN_HIGH = new Set([
  "ui", "ux", "prototype", "wireframe", "mockup", "layout",
  "screen spec", "design system", "figma",
]);

const DESIGN_MEDIUM = new Set([
  "visual", "interface", "user experience", "interaction", "responsive",
  "color palette", "typography", "style", "theme", "dark mode",
  "component", "design", "screen", "app ui", "login screen",
  "navbar", "landing page",
]);

function scoreDesign(tokens: string[], message: string): IntentScore[] {
  let score = 0;
  for (const kw of DESIGN_HIGH) {
    if (kw.includes(" ")) {
      if (hasPhrase(message, kw)) score += 3;
    } else {
      if (hasWord(message, kw)) score += 3;
    }
  }
  for (const kw of DESIGN_MEDIUM) {
    if (hasWord(message, kw)) score += 1.5;
  }

  return score > 0
    ? [{ intent: "design.ui" as EthenIntent, score, reason: `design signals (score ${score.toFixed(1)})` }]
    : [];
}

// ── Media / Image / Video / Audio signals ────────────────────────────────

const MEDIA_HIGH = new Set([
  "generate image", "create image", "make image", "produce image",
  "generate video", "create video", "edit video",
  "generate audio", "create audio", "voiceover", "voice over",
  "generate media", "create media", "animated", "animation",
]);

const MEDIA_MEDIUM = new Set([
  "image", "photo", "picture", "illustration", "thumbnail", "video",
  "audio", "sound", "music", "voice", "narration", "motion",
  "graphic", "canvas", "artwork", "render",
]);

const MEDIA_LOW = new Set([
  "logo", "icon", "banner", "poster", "flyer", "ad", "social media",
  "visual content", "media asset", "asset",
]);

function scoreMedia(tokens: string[], message: string): IntentScore[] {
  let score = 0;
  for (const kw of MEDIA_HIGH) {
    if (kw.includes(" ")) {
      if (hasPhrase(message, kw)) score += 3;
    } else {
      if (hasWord(message, kw)) score += 3;
    }
  }
  for (const kw of MEDIA_MEDIUM) {
    if (hasWord(message, kw)) score += 2;
  }
  for (const kw of MEDIA_LOW) {
    if (hasWord(message, kw)) score += 1;
  }

  const isVideo = hasWord(message, "video") || hasPhrase(message, "animated") || hasPhrase(message, "motion");
  const isAudio = hasWord(message, "audio") || hasWord(message, "voiceover") || hasWord(message, "musi") || hasWord(message, "song");
  const intent: EthenIntent = isVideo ? "media.video" : isAudio ? "media.audio" : "media.image";

  return score > 0 ? [{ intent, score, reason: `media signals (score ${score.toFixed(1)})` }] : [];
}

// ── Business / Startup signals ───────────────────────────────────────────

const BUSINESS_HIGH = new Set([
  "startup", "business plan", "go to market", "go-to-market", "gtm",
  "fundraising", "pitch deck", "investor", "valuation",
  "business model", "revenue model", "pricing strategy",
]);

const BUSINESS_MEDIUM = new Set([
  "founder", "co-founder", "launch", "product market fit",
  "customer segment", "target market", "market size", "tam",
  "unit economics", "burn rate", "runway", "saas metrics",
  "board deck", "executive summary",
]);

function scoreBusiness(tokens: string[], message: string): IntentScore[] {
  let score = 0;
  for (const kw of BUSINESS_HIGH) {
    if (kw.includes(" ")) {
      if (hasPhrase(message, kw)) score += 3;
    } else {
      if (hasWord(message, kw)) score += 3;
    }
  }
  for (const kw of BUSINESS_MEDIUM) {
    if (kw.includes(" ")) {
      if (hasPhrase(message, kw)) score += 1.5;
    } else {
      if (hasWord(message, kw)) score += 1.5;
    }
  }

  const hasStrategy = hasWord(message, "strategy") || hasWord(message, "strategic") || hasWord(message, "planning");
  const intent: EthenIntent = hasStrategy ? "business.strategy" : "business.startup";

  return score > 0 ? [{ intent, score, reason: `business signals (score ${score.toFixed(1)})` }] : [];
}

// ── Infrastructure / Compute signals ─────────────────────────────────────

const COMPUTE_HIGH = new Set([
  "deploy", "provision", "vm", "instance", "server", "infrastructure",
  "kubernetes", "docker", "container", "terraform",
  "aws", "gcp", "azure", "vps",
]);

const COMPUTE_MEDIUM = new Set([
  "compute", "cloud", "hosting", "scaling", "load balancer", "cluster",
  "orchestrate", "pipeline deploy", "ci/cd", "devops", "ops",
]);

function scoreCompute(tokens: string[], message: string): IntentScore[] {
  let score = 0;
  for (const kw of COMPUTE_HIGH) {
    if (kw.includes(" ")) {
      if (hasPhrase(message, kw)) score += 3;
    } else {
      if (hasWord(message, kw)) score += 3;
    }
  }
  for (const kw of COMPUTE_MEDIUM) {
    if (kw.includes(" ")) {
      if (hasPhrase(message, kw)) score += 1.5;
    } else {
      if (hasWord(message, kw)) score += 1.5;
    }
  }

  const isDeploy = hasWord(message, "deploy") || hasPhrase(message, "ci/cd") || hasPhrase(message, "release");
  const intent: EthenIntent = isDeploy ? "infrastructure.deploy" : "infrastructure.compute";

  return score > 0 ? [{ intent, score, reason: `compute signals (score ${score.toFixed(1)})` }] : [];
}

// ── High-stakes risk detection ──────────────────────────────────────────

const HIGH_RISK_WORDS = new Set([
  "deploy", "production", "delete", "irreversible", "sensitive",
  "payment", "credit card", "password", "secret", "credentials",
  "pii", "personal data", "gdpr", "hipaa", "compliance",
]);

function detectRiskLevel(message: string): "low" | "medium" | "high" {
  for (const word of HIGH_RISK_WORDS) {
    if (hasWord(message, word)) return "high";
  }
  if (hasWord(message, "approval") || hasWord(message, "review") || hasWord(message, "critical")) return "medium";
  return "low";
}

// ── Main classifier ─────────────────────────────────────────────────────

function isWritingIntent(intent: EthenIntent): boolean {
  return intent.startsWith("writing.");
}

function isAutomationIntent(intent: EthenIntent): boolean {
  return intent.startsWith("automation.") || intent === "ops.workflow";
}

export function classifyIntent(input: IntentClassifierInput): IntentClassification {
  const { message, attachments, selectedMode, conversationState, userPreferences } = input;
  const tokens = eachToken(message);
  const reasonCodes: IntentReasonCode[] = [];

  const hasCodeFile = (attachments ?? []).some(
    (a) => isCodeFile(a.path ?? a.name ?? "")
  );
  const hasDataFile = (attachments ?? []).some(
    (a) => isDataFile(a.path ?? a.name ?? "")
  );

  const candidates: IntentScore[] = [
    ...scoreCoding(tokens, message, hasCodeFile),
    ...scoreResearch(tokens, message),
    ...scoreBusiness(tokens, message),
    ...scoreWriting(tokens, message),
    ...scoreAutomation(tokens, message),
    ...scoreBrowser(tokens, message),
    ...scoreDesign(tokens, message),
    ...scoreMedia(tokens, message),
    ...scoreCompute(tokens, message),
    ...scorePlanning(tokens, message),
    ...scoreData(tokens, message, hasDataFile),
  ];

  if (hasCodeFile) reasonCodes.push("attachment_signal");
  if (hasDataFile) reasonCodes.push("attachment_signal");

  candidates.sort((a, b) => b.score - a.score);

  // Tiebreak: prefer automation over writing when message leads with an action verb
  if (candidates.length >= 2) {
    const hasAutomation = candidates.some((c) => isAutomationIntent(c.intent));
    const hasWriting = candidates.some((c) => isWritingIntent(c.intent));
    if (hasAutomation && hasWriting) {
      const topTwo = [candidates[0], candidates[1]];
      if (topTwo[1] && Math.abs(topTwo[0].score - topTwo[1].score) < 1) {
        const topIsWriting = isWritingIntent(topTwo[0].intent);
        const secondIsAuto = isAutomationIntent(topTwo[1].intent);
        const actionLead = /^(schedule|send|set up|automate|organize|monitor|trigger|run|execute)\b/i;
        if ((topIsWriting && secondIsAuto) || (isAutomationIntent(topTwo[0].intent) && isWritingIntent(topTwo[1].intent))) {
          if (actionLead.test(message.trim())) {
            const autoIdx = candidates.findIndex((c) => isAutomationIntent(c.intent));
            if (autoIdx > 0) {
              const [auto] = candidates.splice(autoIdx, 1);
              candidates.unshift(auto);
            }
          }
        }
      }
    }
  }

  let primaryIntent: EthenIntent;
  let confidence: number;
  const secondaryIntents: EthenIntent[] = [];

  if (candidates.length === 0) {
    primaryIntent = "general.chat";
    confidence = 0.3;
    reasonCodes.push("default_fallback");
  } else {
    primaryIntent = candidates[0].intent;
    reasonCodes.push("keyword_match");

    const topScore = candidates[0].score;
    if (candidates.length > 1) {
      const secondScore = candidates[1].score;
      if (secondScore > topScore * 0.6) {
        secondaryIntents.push(candidates[1].intent);
      }
    }

    if (topScore >= 8) confidence = 0.9;
    else if (topScore >= 5) confidence = 0.75;
    else if (topScore >= 3) confidence = 0.6;
    else confidence = 0.45;
  }

  // Selected mode override
  if (selectedMode !== "auto" && selectedMode !== undefined && selectedMode !== null) {
    const modeIntents = getIntentsForMode(selectedMode);
    if (modeIntents.length > 0 && !modeIntents.includes(primaryIntent)) {
      const override = modeIntents[0];
      if (primaryIntent !== "unknown") {
        secondaryIntents.unshift(primaryIntent);
      }
      primaryIntent = override;
      confidence = Math.max(confidence, 0.7);
      reasonCodes.unshift("mode_override");
    }
  }

  // Conversation context boost
  if (conversationState?.lastIntent && conversationState.turnCount > 0) {
    if (primaryIntent !== conversationState.lastIntent) {
      reasonCodes.push("conversation_context");
    }
  }

  const riskLevel = detectRiskLevel(message);
  const isCoding = primaryIntent.startsWith("coding.");
  const isResearch = primaryIntent.startsWith("research.");
  const isAutoOrOps = primaryIntent.startsWith("automation.") || primaryIntent === "ops.workflow";

  return {
    primaryIntent,
    secondaryIntents,
    confidence,
    reasonCodes,
    requiresFreshness:
      isResearch ||
      hasWord(message, "current") || hasWord(message, "latest") || hasWord(message, "news") ||
      hasWord(message, "update") || hasWord(message, "price") || hasWord(message, "status") ||
      hasWord(message, "today") || hasWord(message, "now"),
    requiresTools: isResearch || isCoding || isAutoOrOps,
    requiresRepoContext: isCoding,
    requiresVerifier: riskLevel === "high" || isCoding || isResearch,
    riskLevel,
  };
}

function getIntentsForMode(mode: EthenMode): EthenIntent[] {
  switch (mode) {
    case "cortex-lite":
      return ["general.chat", "writing.draft", "writing.rewrite"];
    case "cortex":
      return ["general.reasoning", "planning.product", "general.chat"];
    case "cortex-pro":
      return ["planning.technical", "general.reasoning", "data.analyze"];
    case "code":
      return ["coding.inspect", "coding.implement", "coding.debug", "coding.review"];
    case "research":
      return ["research.web", "research.competitor", "research.technical"];
    case "writer":
      return ["writing.draft", "writing.rewrite", "writing.edit"];
    case "operator":
      return ["automation.plan", "automation.execute", "ops.workflow"];
    default:
      return [];
  }
}

export interface AuthOptions {
  enabled: boolean;
  email?: string;
  password?: string;
}

export interface CrawlOptions {
  startUrl: string;
  maxDepth: number;
  maxPages: number;
  maxPagesPerPattern?: number;
  delayMs: number;
  pageTimeoutMs: number;
  maxSnapshotChars: number;
  maxPageTextChars: number;
  generateKnowledge?: boolean;
  includeSubdomains: boolean;
  respectRobots: boolean;
  fresh?: boolean;
  auth: AuthOptions;
  ollamaUrl: string;
  ollamaModel: string;
  screenshot: boolean;
}

export interface ExtractedLink {
  href: string;
  text: string;
}

export interface PageExtraction {
  title: string;
  description: string;
  canonical: string;
  headings: Array<{ tag: string; text: string }>;
  links: ExtractedLink[];
  text: string;
  passwordFields: number;
}

export interface AiAnalysis {
  summary: string;
  page_type: string;
  key_topics: string[];
  important_entities: string[];
  recommendations: string[];
}

export interface CrawledPage {
  url: string;
  finalUrl: string;
  depth: number;
  status: "ok" | "error" | "skipped";
  title?: string;
  description?: string;
  canonical?: string;
  headings?: Array<{ tag: string; text: string }>;
  links?: ExtractedLink[];
  linksFound?: number;
  text?: string;
  snapshotFile?: string;
  dataFile?: string;
  analysis?: AiAnalysis;
  authWall?: boolean;
  authHandled?: boolean;
  error?: string;
  pattern?: string;
  crawledAt: string;
}

export interface CrawlReport {
  startUrl: string;
  startedAt: string;
  finishedAt: string;
  settings: {
    maxDepth: number;
    maxPages: number;
    maxPagesPerPattern?: number;
    delayMs: number;
    includeSubdomains: boolean;
    respectRobots: boolean;
    auth: { enabled: boolean };
    generateKnowledge?: boolean;
    ollamaModel: string;
  };
  totals: {
    discovered: number;
    visited: number;
    succeeded: number;
    failed: number;
    skippedByRobots: number;
    skippedByAuth: number;
    skippedByPattern?: number;
  };
  pages: CrawledPage[];
  patternGroups?: Record<string, { crawled: number; skipped: number }>;
}

export interface ScreenKnowledge {
  screenId: string;
  pattern: string;
  screenName: string;
  screenType: string;
  isPatternGroup: boolean;
  sampleUrls: string[];
  summary: string;
  purpose: string;
  keyWorkflows: string[];
  dataEntities: string[];
  uiComponents: string[];
  keywords: string[];
  isFallback?: boolean;
  screenFile?: string;
}

export interface CrawlKnowledgeResult {
  startUrl: string;
  generatedAt: string;
  ollamaModel: string;
  totalScreens: number;
  totalPatternGroups: number;
  screens: ScreenKnowledge[];
  globalKeywords: string[];
  siteSummary: string;
}

export interface KnowledgeChunk {
  id: string;
  document: string;
  metadata: Record<string, string | number | boolean>;
}

export interface IndexKnowledgeOptions {
  collectionName?: string;
  databaseName?: string;
  knowledge?: CrawlKnowledgeResult;
  knowledgePath?: string;
  runDir?: string;
  reportPath?: string;
  embedModel?: string;
  ollamaUrl?: string;
  chromaUrl?: string;
  chromaHost?: string;
  chromaPort?: number;
  chromaSsl?: boolean;
  chromaTenant?: string;
  chromaDatabase?: string;
  chromaClient?: any;
  ollamaClient?: any;
}

export interface IndexKnowledgeResult {
  collectionName: string;
  databaseName?: string;
  totalChunks: number;
  screensCount: number;
  embedModel: string;
  indexedAt: string;
}

export interface SearchRagOptions {
  query: string;
  collectionName?: string;
  databaseName?: string;
  nResults?: number;
  generateAnswer?: boolean;
  embedModel?: string;
  ollamaModel?: string;
  ollamaUrl?: string;
  chromaUrl?: string;
  chromaHost?: string;
  chromaPort?: number;
  chromaSsl?: boolean;
  chromaTenant?: string;
  chromaDatabase?: string;
  chromaClient?: any;
  ollamaClient?: any;
}

export interface RagSearchResultItem {
  id: string;
  screenId?: string;
  screenName?: string;
  screenType?: string;
  pattern?: string;
  chunkType?: string;
  url?: string;
  document: string;
  score?: number;
  distance?: number;
  metadata?: Record<string, unknown>;
}

export interface SearchRagResult {
  query: string;
  collectionName: string;
  resultsCount: number;
  results: RagSearchResultItem[];
  answer?: string;
}



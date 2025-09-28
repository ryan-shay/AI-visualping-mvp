import 'dotenv/config';

export type ScrubPattern = {
  pattern: string;
  flags?: string;
};

export type SiteConfig = {
  id: string;
  url: string;
  selector?: string;
  check_min?: number;
  check_max?: number;
  wait_until?: 'load' | 'domcontentloaded' | 'networkidle' | 'networkidle0' | 'networkidle2' | 'commit';
  headless?: boolean;
  watch_goal?: string;
  goal_date?: string;
  goal_party_size?: string;
  goal_keywords?: string[];
  goal_negative_hints?: string[];
  relevance_mode?: 'strict' | 'loose';
  scrub_patterns?: ScrubPattern[];
};

// Removed complex SitesConfig - using simple array now

export type GlobalConfig = {
  // Required
  OPENAI_API_KEY: string;
  DISCORD_WEBHOOK_URL: string;
  
  // Simple multi-site support
  WATCH_URLS?: string;
  
  // Legacy support
  TARGET_URL?: string;
  CSS_SELECTOR?: string;
  CHECK_INTERVAL_MINUTES?: number;
  
  // New global settings
  GLOBAL_CHECK_MIN: number;
  GLOBAL_CHECK_MAX: number;
  MAX_CONCURRENCY: number;
  STAGGER_STARTUP_MINUTES: number;
  SCRAPE_TIMEOUT_SECONDS: number;
  WAIT_UNTIL: 'load' | 'domcontentloaded' | 'networkidle' | 'networkidle0' | 'networkidle2' | 'commit';
  PUPPETEER_HEADLESS: boolean;
  HEADLESS: boolean; // Legacy support
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  DATA_DIR: string;
  SEND_BASELINE_NOTICE: boolean;
  
  // XVFB settings
  XVFB_ENABLED: boolean;
  XVFB_DISPLAY: string;
  XVFB_WIDTH: number;
  XVFB_HEIGHT: number;
  XVFB_DEPTH: number;
  
  // Booking settings
  BOOK_URL?: string;
  BOOK_TIME?: string;
};

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function loadGlobalConfig(): GlobalConfig {
  const config: GlobalConfig = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || '',
    
    // Simple multi-site support
    WATCH_URLS: process.env.WATCH_URLS,
    
    // Legacy support
    TARGET_URL: process.env.TARGET_URL,
    CSS_SELECTOR: process.env.CSS_SELECTOR,
    CHECK_INTERVAL_MINUTES: parseNumber(process.env.CHECK_INTERVAL_MINUTES, 240),
    
    // New settings
    GLOBAL_CHECK_MIN: parseNumber(process.env.GLOBAL_CHECK_MIN, 4),
    GLOBAL_CHECK_MAX: parseNumber(process.env.GLOBAL_CHECK_MAX, 6),
    MAX_CONCURRENCY: parseNumber(process.env.MAX_CONCURRENCY, 3),
    STAGGER_STARTUP_MINUTES: parseNumber(process.env.STAGGER_STARTUP_MINUTES, 3),
    SCRAPE_TIMEOUT_SECONDS: parseNumber(process.env.SCRAPE_TIMEOUT_SECONDS, 90),
    WAIT_UNTIL: (process.env.WAIT_UNTIL as any) || 'networkidle0',
    PUPPETEER_HEADLESS: parseBoolean(process.env.PUPPETEER_HEADLESS || process.env.PLAYWRIGHT_HEADLESS, true),
    HEADLESS: parseBoolean(process.env.HEADLESS, true),
    LOG_LEVEL: (process.env.LOG_LEVEL as any) || 'info',
    DATA_DIR: process.env.DATA_DIR || '.data',
    SEND_BASELINE_NOTICE: parseBoolean(process.env.SEND_BASELINE_NOTICE, true),
    
    // XVFB settings
    XVFB_ENABLED: parseBoolean(process.env.XVFB_ENABLED, false),
    XVFB_DISPLAY: process.env.XVFB_DISPLAY || ':99',
    XVFB_WIDTH: parseNumber(process.env.XVFB_WIDTH, 1920),
    XVFB_HEIGHT: parseNumber(process.env.XVFB_HEIGHT, 1080),
    XVFB_DEPTH: parseNumber(process.env.XVFB_DEPTH, 24),
    
    // Booking settings
    BOOK_URL: process.env.BOOK_URL,
    BOOK_TIME: process.env.BOOK_TIME,
  };

  // Validation
  if (!config.OPENAI_API_KEY) {
    throw new Error('Missing required environment variable: OPENAI_API_KEY');
  }
  if (!config.DISCORD_WEBHOOK_URL) {
    throw new Error('Missing required environment variable: DISCORD_WEBHOOK_URL');
  }

  return config;
}

function createSiteFromUrl(url: string, index: number, globalConfig: GlobalConfig): SiteConfig {
  // Extract a simple ID from the URL
  let siteId: string;
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');
    siteId = `${hostname}-${index + 1}`;
  } catch {
    siteId = `site-${index + 1}`;
  }

  return {
    id: siteId,
    url: url.trim(),
    selector: 'main',
    check_min: globalConfig.GLOBAL_CHECK_MIN,
    check_max: globalConfig.GLOBAL_CHECK_MAX,
    wait_until: globalConfig.WAIT_UNTIL,
      headless: globalConfig.PUPPETEER_HEADLESS,
    relevance_mode: 'strict',
    goal_keywords: ['available', 'availability', 'open', 'book', 'reserve', 'slots', 'seats', 'tables'],
    goal_negative_hints: ['sold out', 'fully booked', 'waitlist', 'notify'],
    watch_goal: 'Monitor for reservation availability changes'
  };
}

export function loadSitesConfig(): SiteConfig[] {
  const globalConfig = loadGlobalConfig();
  
  // Primary approach: WATCH_URLS (comma-separated URLs)
  if (globalConfig.WATCH_URLS) {
    const urls = globalConfig.WATCH_URLS
      .split(',')
      .map(url => url.trim())
      .filter(url => url.length > 0);
    
    if (urls.length > 0) {
      return urls.map((url, index) => createSiteFromUrl(url, index, globalConfig));
    }
  }
  
  // Fallback: Legacy single-site mode
  if (globalConfig.TARGET_URL) {
    return [{
      id: 'legacy-site',
      url: globalConfig.TARGET_URL,
      selector: globalConfig.CSS_SELECTOR || 'main',
      check_min: Math.floor((globalConfig.CHECK_INTERVAL_MINUTES || 240) / 60) || globalConfig.GLOBAL_CHECK_MIN,
      check_max: Math.ceil((globalConfig.CHECK_INTERVAL_MINUTES || 240) / 60) || globalConfig.GLOBAL_CHECK_MAX,
      wait_until: globalConfig.WAIT_UNTIL,
      headless: globalConfig.PUPPETEER_HEADLESS,
      relevance_mode: 'loose', // Legacy mode defaults to loose
      goal_keywords: ['available', 'availability', 'open', 'book', 'reserve', 'slots', 'seats', 'tables'],
      goal_negative_hints: ['sold out', 'fully booked', 'waitlist', 'notify'],
      watch_goal: 'Monitor for changes'
    }];
  }
  
  throw new Error('No WATCH_URLS or TARGET_URL found. Please provide site configuration in .env file.');
}

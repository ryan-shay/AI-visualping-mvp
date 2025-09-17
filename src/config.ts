import 'dotenv/config';
import { readFile, access, constants } from 'node:fs/promises';
import YAML from 'yaml';

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
  wait_until?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  headless?: boolean;
  watch_goal?: string;
  goal_date?: string;
  goal_party_size?: string;
  goal_keywords?: string[];
  goal_negative_hints?: string[];
  relevance_mode?: 'strict' | 'loose';
  scrub_patterns?: ScrubPattern[];
};

export type SitesConfig = {
  defaults?: Partial<SiteConfig>;
  sites: SiteConfig[];
};

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
  WAIT_UNTIL: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  PLAYWRIGHT_HEADLESS: boolean;
  HEADLESS: boolean; // Legacy support
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  DATA_DIR: string;
  SEND_BASELINE_NOTICE: boolean;
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
    WAIT_UNTIL: (process.env.WAIT_UNTIL as any) || 'networkidle',
    PLAYWRIGHT_HEADLESS: parseBoolean(process.env.PLAYWRIGHT_HEADLESS, true),
    HEADLESS: parseBoolean(process.env.HEADLESS, true),
    LOG_LEVEL: (process.env.LOG_LEVEL as any) || 'info',
    DATA_DIR: process.env.DATA_DIR || '.data',
    SEND_BASELINE_NOTICE: parseBoolean(process.env.SEND_BASELINE_NOTICE, true),
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

function createSimpleSiteFromUrl(url: string, index: number, globalConfig: GlobalConfig): SiteConfig {
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
    headless: globalConfig.PLAYWRIGHT_HEADLESS || globalConfig.HEADLESS,
    relevance_mode: 'strict', // Simple mode defaults to loose
    goal_keywords: ['available', 'availability', 'open', 'book', 'reserve', 'slots', 'seats', 'tables'],
    goal_negative_hints: ['sold out', 'fully booked', 'waitlist', 'notify'],
    watch_goal: 'Monitor for any meaningful changes'
  };
}

export async function loadSitesConfig(): Promise<SitesConfig> {
  const globalConfig = loadGlobalConfig();
  
  // Priority 1: Check for simple WATCH_URLS (easiest approach)
  if (globalConfig.WATCH_URLS) {
    const urls = globalConfig.WATCH_URLS
      .split(',')
      .map(url => url.trim())
      .filter(url => url.length > 0);
    
    if (urls.length > 0) {
      const sites = urls.map((url, index) => createSimpleSiteFromUrl(url, index, globalConfig));
      return { sites };
    }
  }
  
  // Priority 2: Try to load sites.yaml or sites.json
  let sitesConfig: SitesConfig | null = null;
  
  try {
    await access('sites.yaml', constants.F_OK);
    const yamlContent = await readFile('sites.yaml', 'utf8');
    sitesConfig = YAML.parse(yamlContent);
  } catch {
    try {
      await access('sites.json', constants.F_OK);
      const jsonContent = await readFile('sites.json', 'utf8');
      sitesConfig = JSON.parse(jsonContent);
    } catch {
      // Priority 3: Fall back to legacy single-site mode
      if (globalConfig.TARGET_URL) {
        sitesConfig = {
          sites: [{
            id: 'legacy-site',
            url: globalConfig.TARGET_URL,
            selector: globalConfig.CSS_SELECTOR || 'main',
            check_min: Math.floor((globalConfig.CHECK_INTERVAL_MINUTES || 240) / 60) || globalConfig.GLOBAL_CHECK_MIN,
            check_max: Math.ceil((globalConfig.CHECK_INTERVAL_MINUTES || 240) / 60) || globalConfig.GLOBAL_CHECK_MAX,
            wait_until: globalConfig.WAIT_UNTIL,
            headless: globalConfig.PLAYWRIGHT_HEADLESS || globalConfig.HEADLESS,
            relevance_mode: 'loose' // Default to loose for legacy mode
          }]
        };
      } else {
        throw new Error('No WATCH_URLS, sites.yaml, sites.json, or TARGET_URL found. Please provide site configuration.');
      }
    }
  }

  if (!sitesConfig || !sitesConfig.sites || sitesConfig.sites.length === 0) {
    throw new Error('No sites configured. Please add at least one site to sites.yaml or sites.json');
  }

  // Apply defaults inheritance
  const processedSites: SiteConfig[] = sitesConfig.sites.map(site => {
    const merged: SiteConfig = {
      // Global defaults
      check_min: globalConfig.GLOBAL_CHECK_MIN,
      check_max: globalConfig.GLOBAL_CHECK_MAX,
      wait_until: globalConfig.WAIT_UNTIL,
      headless: globalConfig.PLAYWRIGHT_HEADLESS || globalConfig.HEADLESS,
      selector: 'main',
      relevance_mode: 'strict',
      goal_keywords: ['available', 'availability', 'open', 'book', 'reserve', 'slots', 'seats', 'tables'],
      goal_negative_hints: ['sold out', 'fully booked', 'waitlist', 'notify'],
      
      // Apply config defaults
      ...sitesConfig.defaults,
      
      // Apply site-specific config
      ...site
    };

    // Validation
    if (!merged.id) {
      throw new Error(`Site missing required 'id' field: ${JSON.stringify(site)}`);
    }
    if (!merged.url) {
      throw new Error(`Site '${merged.id}' missing required 'url' field`);
    }

    return merged;
  });

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (const site of processedSites) {
    if (ids.has(site.id)) {
      throw new Error(`Duplicate site ID found: '${site.id}'`);
    }
    ids.add(site.id);
  }

  return {
    defaults: sitesConfig.defaults,
    sites: processedSites
  };
}

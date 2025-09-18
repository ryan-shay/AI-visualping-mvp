import { chromium, Browser, BrowserContext } from '@playwright/test';
import { log } from './logger.js';
import { loadGlobalConfig } from './config.js';

let sharedBrowser: Browser | null = null;
let currentHeadlessMode: boolean | null = null;

export async function getSharedBrowser(headless?: boolean): Promise<Browser> {
  // Load config to get headless setting if not provided
  if (headless === undefined) {
    const config = loadGlobalConfig();
    headless = config.PLAYWRIGHT_HEADLESS;
  }

  // If browser exists but with different headless mode, close it
  if (sharedBrowser && currentHeadlessMode !== headless) {
    log('info', `Closing browser to switch headless mode from ${currentHeadlessMode} to ${headless}`);
    await sharedBrowser.close();
    sharedBrowser = null;
  }

  if (!sharedBrowser) {
    log('info', `Launching shared Chromium browser (headless: ${headless})`);
    sharedBrowser = await chromium.launch({ 
      headless: headless,
      // Add some useful debugging options when in headfull mode
      ...(headless === false && {
        slowMo: 100, // Slow down actions by 100ms for visibility
        devtools: false // Set to true if you want devtools open
      })
    });
    currentHeadlessMode = headless;
  }
  return sharedBrowser;
}

export async function newContext(headless?: boolean): Promise<BrowserContext> {
  const browser = await getSharedBrowser(headless);
  
  // Create context with user agent
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
  });
  
  return context;
}

export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    log('info', 'Closing shared browser');
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  log('info', 'Received SIGTERM, closing browser');
  await closeSharedBrowser();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('info', 'Received SIGINT, closing browser');
  await closeSharedBrowser();
  process.exit(0);
});

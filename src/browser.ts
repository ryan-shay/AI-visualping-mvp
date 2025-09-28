import { connect } from 'puppeteer-real-browser';
import type { Browser } from 'rebrowser-puppeteer-core';
import { log } from './logger.js';
import { loadGlobalConfig } from './config.js';
import { ensureXvfbForHeadfull, stopGlobalXvfb } from './xvfb.js';

let sharedBrowser: Browser | null = null;
let currentHeadlessMode: boolean | null = null;

export async function getSharedBrowser(headless?: boolean): Promise<Browser> {
  // Load config to get headless setting if not provided
  if (headless === undefined) {
    const config = loadGlobalConfig();
    headless = config.PUPPETEER_HEADLESS;
  }

  // If browser exists but with different headless mode, close it
  if (sharedBrowser && currentHeadlessMode !== headless) {
    log('info', `Closing browser to switch headless mode from ${currentHeadlessMode} to ${headless}`);
    await sharedBrowser.close();
    sharedBrowser = null;
  }

  if (!sharedBrowser) {
    // Ensure Xvfb is running if we need headfull mode in a headless environment
    await ensureXvfbForHeadfull(headless);
    
    log('info', `Launching shared Chromium browser (headless: ${headless})`);
    
    const { browser } = await connect({
      headless: headless,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ],
      customConfig: {},
      turnstile: true, // Enable Cloudflare Turnstile bypass
      connectOption: {
        defaultViewport: null
      },
      disableXvfb: false,
      ignoreAllFlags: false
    });
    
    sharedBrowser = browser;
    currentHeadlessMode = headless;
  }
  return sharedBrowser;
}

export async function newPage(headless?: boolean): Promise<any> {
  const browser = await getSharedBrowser(headless);
  
  // Create new page directly from browser
  const page = await browser.newPage();
  
  // Set user agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36');
  
  // Set viewport if needed
  await page.setViewport({ width: 1920, height: 1080 });
  
  return page;
}

// Legacy compatibility function - returns a page instead of context
export async function newContext(headless?: boolean): Promise<{ newPage: () => Promise<any>, close: () => Promise<void> }> {
  const browser = await getSharedBrowser(headless);
  
  // Return a context-like object that creates pages from the shared browser
  return {
    newPage: async () => {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      return page;
    },
    close: async () => {
      // Don't close the shared browser, just log
      log('debug', 'Context close called - shared browser remains open');
    }
  };
}

export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    log('info', 'Closing shared browser');
    await sharedBrowser.close();
    sharedBrowser = null;
  }
  
  // Also stop Xvfb if it was started
  await stopGlobalXvfb();
}

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  log('info', 'Received SIGTERM, closing browser and Xvfb');
  await closeSharedBrowser();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('info', 'Received SIGINT, closing browser and Xvfb');
  await closeSharedBrowser();
  process.exit(0);
});

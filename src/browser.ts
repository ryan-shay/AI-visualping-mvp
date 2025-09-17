import { chromium, Browser, BrowserContext } from '@playwright/test';
import { log } from './logger.js';

let sharedBrowser: Browser | null = null;

export async function getSharedBrowser(): Promise<Browser> {
  if (!sharedBrowser) {
    log('info', 'Launching shared Chromium browser');
    sharedBrowser = await chromium.launch({ 
      headless: true // Will be overridden per context if needed
    });
  }
  return sharedBrowser;
}

export async function newContext(headless: boolean = true): Promise<BrowserContext> {
  const browser = await getSharedBrowser();
  
  // Note: headless is set at browser launch, but we can control other context options
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

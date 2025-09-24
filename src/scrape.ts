import { newContext } from './browser.js';
import { SiteConfig } from './config.js';
import { log } from './logger.js';
import { processText } from './hash.js';

async function scrapeWithRetry(site: SiteConfig, attempt: number = 1): Promise<string> {
  const maxAttempts = 2;
  const context = await newContext(site.headless);
  
  try {
    const page = await context.newPage();
    
    // Simplified timeout strategy - no site-specific logic
    const waitCondition = site.wait_until || 'networkidle';
    const { loadGlobalConfig } = await import('./config.js');
    const config = loadGlobalConfig();
    const timeout = config.SCRAPE_TIMEOUT_SECONDS * 1000;
    
    log('info', `🚀 ${site.id}: Scraping (${waitCondition}, attempt ${attempt}/${maxAttempts})`);
    
    await page.goto(site.url, { 
      waitUntil: waitCondition, 
      timeout 
    });

    // Simple wait for dynamic content
    await page.waitForTimeout(3000);

    // Extract content from specified selector
    const selector = site.selector || 'main';
    let text = '';
    
    try {
      await page.waitForSelector(selector, { timeout: 15000 });
      text = await page.locator(selector).innerText();
    } catch (err) {
      // Fallback to main or body
      const fallback = (await page.locator('main').count()) ? 'main' : 'body';
      log('debug', `${site.id}: Fallback to ${fallback}`);
      text = await page.locator(fallback).innerText();
    }

    // Process text: scrub patterns then normalize in one step
    const processedText = processText(text, site.scrub_patterns);
    log('info', `📄 ${site.id}: Extracted ${processedText.length} chars`);
    
    return processedText;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', `Error scraping site: ${site.id} (attempt ${attempt}/${maxAttempts})`, { error: errorMessage });
    
    if (attempt < maxAttempts && errorMessage.includes('Timeout')) {
      log('info', `Retrying ${site.id}...`);
      await context.close();
      await new Promise(resolve => setTimeout(resolve, 2000));
      return scrapeWithRetry(site, attempt + 1);
    }
    
    throw error;
  } finally {
    await context.close();
  }
}

export async function scrapeSite(site: SiteConfig): Promise<string> {
  log('info', `🌐 ${site.id}: Starting scrape (${site.selector || 'main'})`);
  
  return scrapeWithRetry(site, 1);
}

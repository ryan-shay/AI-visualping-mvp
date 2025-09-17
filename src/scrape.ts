import { newContext } from './browser.js';
import { SiteConfig } from './config.js';
import { log } from './logger.js';
import { normalizeText, applyScrubPatterns } from './hash.js';

async function scrapeWithRetry(site: SiteConfig, attempt: number = 1): Promise<string> {
  const maxAttempts = 2;
  const context = await newContext(site.headless);
  
  try {
    const page = await context.newPage();
    
    // Smart timeout and wait strategy based on site
    const isHeavyJSSite = site.url.includes('exploretock.com') || site.url.includes('resy.com') || site.url.includes('opentable.com');
    const waitCondition = isHeavyJSSite ? 'domcontentloaded' : (site.wait_until || 'networkidle');
    
    // Use configurable timeout, but shorter for heavy JS sites
    const { loadGlobalConfig } = await import('./config.js');
    const config = loadGlobalConfig();
    const baseTimeout = config.SCRAPE_TIMEOUT_SECONDS * 1000;
    const timeout = isHeavyJSSite ? Math.min(baseTimeout, 60000) : baseTimeout;
    
    log('info', `🚀 ${site.id}: Navigating (${waitCondition}, ${timeout/1000}s timeout, attempt ${attempt}/${maxAttempts})`);
    
    await page.goto(site.url, { 
      waitUntil: waitCondition, 
      timeout 
    });

    // Wait for dynamic content - longer for heavy JS sites
    const waitTime = isHeavyJSSite ? 5000 : 2000;
    log('debug', `Waiting ${waitTime/1000}s for dynamic content to load`, { siteId: site.id });
    await page.waitForTimeout(waitTime);

    let text = '';
    const selector = site.selector || 'main';
    
    log('debug', `Checking if selector exists: ${selector}`, { siteId: site.id });
    const hasSelector = await page.locator(selector).first().isVisible().catch(() => false);
    
    if (hasSelector) {
      log('debug', `Selector found: ${selector}, waiting for it to be ready`, { siteId: site.id });
      try {
        await page.waitForSelector(selector, { timeout: 15000 });
        log('debug', `Successfully waited for selector: ${selector}`, { siteId: site.id });
      } catch (err) {
        log('warn', `Selector ${selector} not found within timeout, proceeding anyway`, { siteId: site.id });
      }
      text = await page.locator(selector).innerText();
      log('debug', `Extracted text from ${selector}`, { 
        siteId: site.id, 
        textLength: text.length, 
        preview: text.slice(0, 200) + '...' 
      });
    } else {
      // Fallback to main or body
      const fallback = (await page.locator('main').count()) ? 'main' : 'body';
      log('info', `Selector not visible, falling back to: ${fallback}`, { siteId: site.id });
      try {
        await page.waitForSelector(fallback, { timeout: 15000 });
        log('debug', `Successfully waited for fallback selector: ${fallback}`, { siteId: site.id });
      } catch (err) {
        log('warn', `Fallback selector ${fallback} not found within timeout, proceeding anyway`, { siteId: site.id });
      }
      text = await page.locator(fallback).innerText();
      log('debug', `Extracted text from ${fallback}`, { 
        siteId: site.id, 
        textLength: text.length, 
        preview: text.slice(0, 200) + '...' 
      });
    }

    // Apply scrub patterns before normalization
    const scrubbedText = applyScrubPatterns(text, site.scrub_patterns);
    if (site.scrub_patterns && site.scrub_patterns.length > 0) {
      log('debug', `Applied ${site.scrub_patterns.length} scrub patterns`, { 
        siteId: site.id,
        originalLength: text.length,
        scrubbedLength: scrubbedText.length
      });
    }

    const normalizedText = normalizeText(scrubbedText);
    log('info', `📄 ${site.id}: Extracted ${normalizedText.length} chars (${text.length} → ${normalizedText.length})`);
    
    return normalizedText;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', `Error scraping site: ${site.id} (attempt ${attempt}/${maxAttempts})`, { error: errorMessage });
    
    if (attempt < maxAttempts && errorMessage.includes('Timeout')) {
      log('info', `Retrying ${site.id} with fallback strategy...`);
      await context.close();
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay before retry
      return scrapeWithRetry(site, attempt + 1);
    }
    
    throw error;
  } finally {
    await context.close();
    log('debug', `Browser context closed for site: ${site.id}`);
  }
}

export async function scrapeSite(site: SiteConfig): Promise<string> {
  log('info', `🌐 ${site.id}: Starting scrape (${site.selector || 'main'})`);
  
  return scrapeWithRetry(site);
}

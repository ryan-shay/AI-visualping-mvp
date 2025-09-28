import { newPage } from './browser.js';
import { SiteConfig } from './config.js';
import { log } from './logger.js';
import { processText } from './hash.js';

async function scrapeWithRetry(site: SiteConfig, attempt: number = 1): Promise<string> {
  const maxAttempts = 2;
  const page = await newPage(site.headless);
  
  try {
    // Simplified timeout strategy - no site-specific logic
    const waitCondition = site.wait_until || 'networkidle';
    const { loadGlobalConfig } = await import('./config.js');
    const config = loadGlobalConfig();
    const timeout = config.SCRAPE_TIMEOUT_SECONDS * 1000;
    
    log('info', `🚀 ${site.id}: Scraping (${waitCondition}, attempt ${attempt}/${maxAttempts})`);
    
    // Convert Playwright waitUntil values to Puppeteer equivalents
    let puppeteerWaitUntil: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2' = 'networkidle0';
    if (waitCondition === 'networkidle') {
      puppeteerWaitUntil = 'networkidle0';
    } else if (waitCondition === 'load') {
      puppeteerWaitUntil = 'load';
    } else if (waitCondition === 'domcontentloaded') {
      puppeteerWaitUntil = 'domcontentloaded';
    } else if (waitCondition === 'commit') {
      puppeteerWaitUntil = 'domcontentloaded'; // Closest equivalent
    }

    await page.goto(site.url, { 
      waitUntil: puppeteerWaitUntil, 
      timeout 
    });

    // Simple wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract content from specified selector
    const selector = site.selector || 'main';
    let text = '';
    
    try {
      await page.waitForSelector(selector, { timeout: 15000 });
      text = await page.$eval(selector, (el: Element) => el.textContent || '');
    } catch (err) {
      // Fallback to main or body
      const mainExists = await page.$('main');
      const fallback = mainExists ? 'main' : 'body';
      log('debug', `${site.id}: Fallback to ${fallback}`);
      text = await page.$eval(fallback, (el: Element) => el.textContent || '');
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
      await page.close();
      await new Promise(resolve => setTimeout(resolve, 2000));
      return scrapeWithRetry(site, attempt + 1);
    }
    
    throw error;
  } finally {
    await page.close();
  }
}

export async function scrapeSite(site: SiteConfig): Promise<string> {
  log('info', `🌐 ${site.id}: Starting scrape (${site.selector || 'main'})`);
  
  return scrapeWithRetry(site, 1);
}

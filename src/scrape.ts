import { newContext } from './browser.js';
import { SiteConfig } from './config.js';
import { log } from './logger.js';
import { normalizeText, applyScrubPatterns } from './hash.js';
import { Page } from '@playwright/test';

async function tryInteractWithReservationElements(page: Page, site: SiteConfig): Promise<void> {
  const siteId = site.id;
  
  try {
    // Site-specific interaction strategies
    if (site.url.includes('exploretock.com')) {
      log('debug', `${siteId}: Attempting Tock-specific interactions`);
      
      // Look for time slot buttons or reservation links
      const timeSlotSelectors = [
        '[data-testid="time-slot"]',
        '.time-slot',
        '.available-time',
        'button[class*="time"]',
        'a[href*="book"]',
        'button:has-text("Reserve")',
        'button:has-text("Book")'
      ];
      
      for (const selector of timeSlotSelectors) {
        try {
          const element = page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            log('info', `${siteId}: Found clickable element: ${selector}`);
            await element.click();
            await page.waitForTimeout(3000); // Wait for popup/modal to appear
            break;
          }
        } catch (err) {
          // Continue to next selector
        }
      }
    } else if (site.url.includes('pocket-concierge.jp')) {
      log('debug', `${siteId}: Attempting Pocket Concierge-specific interactions`);
      
      // Look for reservation buttons or links
      const reservationSelectors = [
        'a[href*="reserve"]',
        'button:has-text("Reserve")',
        'button:has-text("予約")',
        '.reservation-button',
        '.book-now',
        '[data-action="reserve"]'
      ];
      
      for (const selector of reservationSelectors) {
        try {
          const element = page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            log('info', `${siteId}: Found reservation element: ${selector}`);
            await element.click();
            await page.waitForTimeout(4000); // Wait longer for popup
            break;
          }
        } catch (err) {
          // Continue to next selector
        }
      }
    } else if (site.url.includes('resy.com')) {
      log('debug', `${siteId}: Attempting Resy-specific interactions`);
      
      const resySelectors = [
        '[data-test-id="book-button"]',
        'button:has-text("Reserve")',
        '.ReservationButton',
        '.book-reservation'
      ];
      
      for (const selector of resySelectors) {
        try {
          const element = page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            log('info', `${siteId}: Found Resy reservation element: ${selector}`);
            await element.click();
            await page.waitForTimeout(3000);
            break;
          }
        } catch (err) {
          // Continue to next selector
        }
      }
    }
    
    // Generic fallback for any site
    const genericSelectors = [
      'a[href*="book"]',
      'a[href*="reserve"]',
      'button:has-text("Book")',
      'button:has-text("Reserve")',
      'button:has-text("Available")',
      '.book',
      '.reserve',
      '.available'
    ];
    
    for (const selector of genericSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 })) {
          log('info', `${siteId}: Found generic reservation element: ${selector}`);
          await element.click();
          await page.waitForTimeout(2000);
          break;
        }
      } catch (err) {
        // Continue to next selector
      }
    }
    
  } catch (error) {
    log('debug', `${siteId}: Error during reservation interaction`, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function capturePopupContent(page: Page, site: SiteConfig): Promise<string> {
  const siteId = site.id;
  let popupContent = '';
  
  try {
    // Common popup/modal selectors
    const popupSelectors = [
      '[role="dialog"]',
      '[role="modal"]',
      '.modal',
      '.popup',
      '.overlay',
      '.dialog',
      '[data-testid="modal"]',
      '[data-testid="popup"]',
      '.reservation-modal',
      '.booking-popup',
      '.availability-modal'
    ];
    
    // Wait a bit for popups to fully render
    await page.waitForTimeout(2000);
    
    for (const selector of popupSelectors) {
      try {
        const popup = page.locator(selector);
        if (await popup.isVisible({ timeout: 3000 })) {
          const content = await popup.innerText();
          if (content && content.trim().length > 20) { // Only capture meaningful content
            popupContent += content + '\n\n';
            log('info', `${siteId}: Captured popup content from ${selector} (${content.length} chars)`);
          }
        }
      } catch (err) {
        // Continue to next selector
      }
    }
    
    // Site-specific popup selectors
    if (site.url.includes('exploretock.com')) {
      const tockPopupSelectors = [
        '[data-testid="reservation-modal"]',
        '.tock-modal',
        '.booking-flow-modal',
        '.time-selection-modal',
        // Additional Tock-specific selectors for automatic popups
        '[class*="modal"]',
        '[class*="popup"]',
        '[class*="overlay"]',
        '[id*="modal"]',
        '[id*="popup"]',
        'div[style*="position: fixed"]', // Common for overlay modals
        'div[style*="z-index"]' // High z-index elements are often popups
      ];
      
      for (const selector of tockPopupSelectors) {
        try {
          const popup = page.locator(selector);
          if (await popup.isVisible({ timeout: 1000 })) {
            const content = await popup.innerText();
            if (content && content.trim().length > 20) {
              popupContent += content + '\n\n';
              log('info', `${siteId}: Captured Tock-specific popup from ${selector}`);
            }
          }
        } catch (err) {
          // Continue
        }
      }
    }
    
    if (site.url.includes('pocket-concierge.jp')) {
      const pcPopupSelectors = [
        '.reservation-popup',
        '.booking-modal',
        '[class*="modal"]',
        '[class*="popup"]'
      ];
      
      for (const selector of pcPopupSelectors) {
        try {
          const popup = page.locator(selector);
          if (await popup.isVisible({ timeout: 1000 })) {
            const content = await popup.innerText();
            if (content && content.trim().length > 20) {
              popupContent += content + '\n\n';
              log('info', `${siteId}: Captured Pocket Concierge popup from ${selector}`);
            }
          }
        } catch (err) {
          // Continue
        }
      }
    }
    
  } catch (error) {
    log('debug', `${siteId}: Error capturing popup content`, { error: error instanceof Error ? error.message : String(error) });
  }
  
  return popupContent.trim();
}

async function scrapeWithRetry(site: SiteConfig, attempt: number = 1, extraWaitMs?: number): Promise<string> {
  const maxAttempts = 2;
  const context = await newContext(site.headless);
  
  try {
    const page = await context.newPage();
    
    // Smart timeout and wait strategy based on site
    const isHeavyJSSite = site.url.includes('exploretock.com') || site.url.includes('resy.com') || site.url.includes('opentable.com') || site.url.includes('pocket-concierge.jp');
    const isTockSite = site.url.includes('exploretock.com');
    const isPocketConciergeSite = site.url.includes('pocket-concierge.jp');
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

    // Wait for dynamic content - reduced since we're not doing interactions
    const baseWaitTime = isHeavyJSSite ? 5000 : 3000;
    const totalWaitTime = baseWaitTime + (extraWaitMs || 0);
    log('debug', `Waiting ${totalWaitTime/1000}s for dynamic content to load`, { siteId: site.id });
    await page.waitForTimeout(totalWaitTime);

    // Wait for automatic popups on Tock sites (they appear after ~10 seconds automatically)
    let popupText = '';
    if (isTockSite) {
      log('debug', `${site.id}: Tock site detected, waiting for automatic popup to appear`);
      
      // Capture initial page state
      const initialBodyText = await page.locator('body').innerText().catch(() => '');
      
      // Tock sites automatically show popups after ~10 seconds, so wait a bit longer
      await page.waitForTimeout(12000); // Wait 12 seconds for automatic popup
      
      // Try to capture popup content using selectors
      popupText = await capturePopupContent(page, site);
      
      // Fallback: if no popup content found via selectors, check for new content on page
      if (!popupText || popupText.trim().length < 50) {
        const finalBodyText = await page.locator('body').innerText().catch(() => '');
        if (finalBodyText.length > initialBodyText.length + 100) {
          // Significant new content appeared, likely a popup
          const newContent = finalBodyText.slice(initialBodyText.length);
          if (newContent.toLowerCase().includes('reservat') || newContent.toLowerCase().includes('availab')) {
            popupText = newContent;
            log('info', `${site.id}: Captured new content that appeared (likely popup): ${newContent.length} chars`);
          }
        }
      }
    }

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
    
    // Combine main content with popup content (for Tock sites)
    if (popupText) {
      text = text + '\n\n--- POPUP/MODAL CONTENT ---\n' + popupText;
      log('info', `${site.id}: Added ${popupText.length} chars from popup content`);
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
      return scrapeWithRetry(site, attempt + 1, extraWaitMs);
    }
    
    throw error;
  } finally {
    await context.close();
    log('debug', `Browser context closed for site: ${site.id}`);
  }
}

export async function scrapeSite(site: SiteConfig, extraWaitMs?: number): Promise<string> {
  log('info', `🌐 ${site.id}: Starting scrape (${site.selector || 'main'})`);
  
  return scrapeWithRetry(site, 1, extraWaitMs);
}

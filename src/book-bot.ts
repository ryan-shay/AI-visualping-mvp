import { newContext } from './browser.js';
import { log } from './logger.js';

export class BookReservationBot {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  private getRandomRefreshInterval(): number {
    // Random interval between 5-10 seconds (5000-10000 ms)
    return Math.floor(Math.random() * 5000) + 5000;
  }

  async start(): Promise<void> {
    log('info', '📖 Starting Book Reservation Bot - Single Attempt Mode');
    log('info', `🔗 Target URL: ${this.url}`);

    const context = await newContext(false); // Use headful mode for manual takeover
    const page = await context.newPage();
    
    // Set a larger viewport to ensure we can see all elements
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    try {
      // Navigate to the Tock URL
      log('info', '🚀 Navigating to reservation page...');
      await page.goto(this.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });

      // Wait for the page to load completely
      await page.waitForTimeout(5000);

      // Wait for the search modal to appear
      log('info', '⏳ Waiting for reservation popup to load...');
      await page.waitForSelector('.SearchModal-body', { timeout: 45000 });
      
      // Keep refreshing until we find the booking button
      let foundBookButton = false;
      
      while (!foundBookButton) {
        try {
          log('info', '🔍 Looking for available Book button...');
          
          // Wait for booking card buttons to be present
          await page.waitForSelector('button[data-testid="booking-card-button"]', { timeout: 30000 });
          
          // Get all booking buttons
          const bookingButtons = page.locator('button[data-testid="booking-card-button"]');
          const buttonCount = await bookingButtons.count();
          log('info', `📋 Found ${buttonCount} booking buttons`);
          
          // Check each button to find one that says "Book"
          for (let i = 0; i < buttonCount; i++) {
            const button = bookingButtons.nth(i);
            
            const buttonText = await button.locator('span[role="presentation"]').textContent();
            log('info', `🔍 Button ${i + 1} text: "${buttonText}"`);
            
            if (buttonText?.trim() === 'Book') {
              log('info', '✅ Found available reservation! Clicking Book button...');
              await button.click();
              log('info', '🎉 Successfully clicked the Book button!');
              
              // Wait a moment to see the redirect
              await page.waitForTimeout(3000);
              log('info', `📍 Current URL after click: ${page.url()}`);
              
              log('info', '🛑 Bot stopping here - manual user can take over!');
              log('info', '👤 The browser window will remain open for manual completion.');
              
              foundBookButton = true;
              return; // Exit the function, leaving browser open
            }
          }
          
          if (!foundBookButton) {
            log('info', '❌ No available reservations found. All buttons show sold out or other status.');
            
            // Get random refresh interval
            const refreshInterval = this.getRandomRefreshInterval();
            log('info', `🔄 Refreshing page in ${refreshInterval / 1000} seconds...`);
            
            // Wait random interval before refreshing
            await page.waitForTimeout(refreshInterval);
            
            // Refresh the page and try again
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            
            // Wait for the search modal to appear again
            await page.waitForSelector('.SearchModal-body', { timeout: 45000 });
          }
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log('error', 'Error while looking for book button', { error: errorMessage });
          
          // Get random refresh interval
          const refreshInterval = this.getRandomRefreshInterval();
          log('info', `🔄 Error occurred, refreshing page in ${refreshInterval / 1000} seconds...`);
          
          // Wait random interval before refreshing
          await page.waitForTimeout(refreshInterval);
          
          // Refresh the page and try again
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(3000);
          
          // Wait for the search modal to appear again
          try {
            await page.waitForSelector('.SearchModal-body', { timeout: 45000 });
          } catch (modalError) {
            log('error', 'Could not find search modal after refresh', { error: modalError });
            // Continue the loop to try again
          }
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', 'Fatal error in book bot', { error: errorMessage });
      throw error;
    }
  }
}

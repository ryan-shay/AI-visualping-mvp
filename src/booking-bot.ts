import { newContext } from './browser.js';
import { log } from './logger.js';
import { loadGlobalConfig } from './config.js';

export class BookingBot {
  private url: string;
  private bookTime: string;

  constructor(url: string, bookTime: string) {
    this.url = url;
    this.bookTime = bookTime;
  }

  /**
   * Parse time string in format "HH:MM" or "HH:MM:SS" and return Date object for today
   */
  private parseBookTime(timeStr: string): Date {
    const timeParts = timeStr.split(':');
    if (timeParts.length < 2 || timeParts.length > 3) {
      throw new Error(`Invalid time format: ${timeStr}. Expected HH:MM or HH:MM:SS`);
    }

    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    const seconds = timeParts.length === 3 ? parseInt(timeParts[2], 10) : 0;

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
      throw new Error(`Invalid time values: ${timeStr}`);
    }

    const now = new Date();
    const bookDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, seconds);
    
    // If the time has already passed today, schedule for tomorrow
    if (bookDate <= now) {
      bookDate.setDate(bookDate.getDate() + 1);
    }

    return bookDate;
  }

  /**
   * Wait until the specified book time
   */
  private async waitUntilBookTime(): Promise<void> {
    const bookDate = this.parseBookTime(this.bookTime);
    const now = new Date();
    const waitTime = bookDate.getTime() - now.getTime();

    if (waitTime <= 0) {
      log('info', '🕐 Book time has already passed, executing immediately');
      return;
    }

    log('info', `⏰ Waiting until ${bookDate.toLocaleString()} to start booking (${Math.round(waitTime / 1000)} seconds)`);
    
    // Wait until 5 seconds before the target time to prepare
    const prepareTime = Math.max(0, waitTime - 5000);
    if (prepareTime > 0) {
      await new Promise(resolve => setTimeout(resolve, prepareTime));
      log('info', '🚀 Preparing for booking in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Execute the booking process
   */
  async executeBooking(): Promise<void> {
    log('info', '📚 Starting Booking Bot');
    log('info', `🔗 Target URL: ${this.url}`);
    log('info', `⏰ Scheduled time: ${this.bookTime}`);

    // Wait until the scheduled time
    await this.waitUntilBookTime();

    log('info', '🎯 Booking time reached! Launching browser...');

    const context = await newContext(false); // Use headful mode so user can see and take over
    const page = await context.newPage();
    
    try {
      // Set a larger viewport to ensure we can see all elements
      await page.setViewport({ width: 1920, height: 1080 });
      
      log('info', '🚀 Navigating to booking page...');
      await page.goto(this.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });

      // Wait for the page to load completely
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Wait for the search modal to appear (Tock-specific)
      log('info', '⏳ Waiting for booking interface to load...');
      try {
        await page.waitForSelector('.SearchModal-body', { timeout: 30000 });
      } catch (err) {
        log('warn', 'SearchModal not found, continuing with generic booking button search...');
      }
      
      // Look for the booking button
      log('info', '🔍 Looking for Book button...');
      
      let foundBookButton = false;
      const maxAttempts = 10;
      let attempt = 0;
      
      while (!foundBookButton && attempt < maxAttempts) {
        attempt++;
        
        try {
          // Try multiple selectors for book buttons
          const selectors = [
            'button[data-testid="booking-card-button"]', // Tock specific
            'button:has-text("Book")', // Generic button with "Book" text
            'button[class*="book"]', // Button with "book" in class name
            'a[class*="book"]', // Link with "book" in class name
            '.book-button', // Common book button class
            '#book-button' // Common book button ID
          ];
          
          for (const selector of selectors) {
            try {
              await page.waitForSelector(selector, { timeout: 5000 });
              
              if (selector === 'button[data-testid="booking-card-button"]') {
                // Tock-specific logic
                const bookingButtons = await page.$$(selector);
                log('info', `📋 Found ${bookingButtons.length} booking buttons`);
                
                for (let i = 0; i < bookingButtons.length; i++) {
                  const button = bookingButtons[i];
                  
                  try {
                    const buttonText = await button.$eval('span[role="presentation"]', (el: Element) => el.textContent);
                    log('info', `🔍 Button ${i + 1} text: "${buttonText}"`);
                    
                    if (buttonText?.trim() === 'Book') {
                      log('info', '✅ Found available reservation! Clicking Book button...');
                      await button.click();
                      foundBookButton = true;
                      break;
                    }
                  } catch (err) {
                    // Try clicking the button anyway if we can't read the text
                    log('info', `🔍 Button ${i + 1}: Cannot read text, trying to click...`);
                    await button.click();
                    foundBookButton = true;
                    break;
                  }
                }
              } else {
                // Generic button logic
                const button = await page.$(selector);
                if (button) {
                  log('info', `✅ Found booking button with selector: ${selector}`);
                  await button.click();
                  foundBookButton = true;
                  break;
                }
              }
              
              if (foundBookButton) break;
              
            } catch (err) {
              // Selector not found, try next one
              continue;
            }
          }
          
          if (foundBookButton) {
            log('info', '🎉 Successfully clicked the Book button!');
            
            // Wait a moment to see the result
            await new Promise(resolve => setTimeout(resolve, 3000));
            log('info', `📍 Current URL after click: ${page.url()}`);
            
            // Keep the browser open for user to complete the booking
            log('info', '👤 Browser will remain open for you to complete the booking process');
            log('info', '🔄 The reservation should now be held - please complete your booking manually');
            
            // Don't close the browser - let the user take over
            return;
          }
          
        } catch (error) {
          log('info', `🔄 Attempt ${attempt}/${maxAttempts}: No booking button found, retrying in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Try refreshing the page every few attempts
          if (attempt % 3 === 0) {
            log('info', '🔄 Refreshing page...');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }
      
      if (!foundBookButton) {
        log('error', '❌ Could not find any booking button after all attempts');
        log('info', '👤 Browser will remain open for manual booking');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', 'Error during booking process', { error: errorMessage });
      log('info', '👤 Browser will remain open for manual intervention');
    }
    
    // Keep browser open - don't close context
    log('info', '🔄 Booking bot completed. Browser remains open for manual completion.');
  }
}

/**
 * Start the booking bot with configuration from environment variables
 */
export async function startBookingBot(): Promise<void> {
  const config = loadGlobalConfig();
  
  if (!config.BOOK_URL) {
    throw new Error('BOOK_URL environment variable is required');
  }
  
  if (!config.BOOK_TIME) {
    throw new Error('BOOK_TIME environment variable is required (format: HH:MM or HH:MM:SS)');
  }
  
  const bot = new BookingBot(config.BOOK_URL, config.BOOK_TIME);
  await bot.executeBooking();
}

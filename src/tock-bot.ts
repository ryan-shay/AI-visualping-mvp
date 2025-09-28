import { newContext } from './browser.js';
import { log } from './logger.js';

export class TockReservationBot {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  async start(): Promise<void> {
    log('info', '🍽️ Starting Tock Reservation Bot - Infinite Loop Mode');
    log('info', `🔗 Target URL: ${this.url}`);

    const context = await newContext(false); // Use headful mode to see what's happening
    const page = await context.newPage();
    
    // Set a larger viewport to ensure we can see all elements
    await page.setViewport({ width: 1920, height: 1080 });
    
    let cycleCount = 0;
    
    // Infinite loop
    while (true) {
      cycleCount++;
      log('info', `🔄 Starting cycle ${cycleCount}`);
      
      try {
        // Navigate to the Tock URL
        log('info', '🚀 Navigating to Tock reservation page...');
        await page.goto(this.url, { 
          waitUntil: 'domcontentloaded',
          timeout: 60000 
        });

        // Wait for the page to load completely
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Wait for the search modal to appear
        log('info', '⏳ Waiting for reservation popup to load...');
        await page.waitForSelector('.SearchModal-body', { timeout: 45000 });
        
        // Look for the booking button with the specific test ID
        log('info', '🔍 Looking for available Book button...');
        
        // Keep refreshing every 30 seconds until we find the booking button
        let foundBookButton = false;
        let refreshCount = 0;
        
        while (!foundBookButton) {
          try {
            // Wait for booking card buttons to be present
            await page.waitForSelector('button[data-testid="booking-card-button"]', { timeout: 30000 });
            
            // Get all booking buttons
            const bookingButtons = await page.$$('button[data-testid="booking-card-button"]');
            const buttonCount = bookingButtons.length;
            log('info', `📋 Found ${buttonCount} booking buttons`);
            
            // Check each button to find one that says "Book"
            for (let i = 0; i < buttonCount; i++) {
              const button = bookingButtons[i];
              
              const buttonText = await button.$eval('span[role="presentation"]', (el: Element) => el.textContent);
              log('info', `🔍 Button ${i + 1} text: "${buttonText}"`);
              
              if (buttonText?.trim() === 'Book') {
                log('info', '✅ Found available reservation! Clicking Book button...');
                await button.click();
                log('info', '🎉 Successfully clicked the Book button!');
                
                // Wait a moment to see the redirect
                await new Promise(resolve => setTimeout(resolve, 5000));
                log('info', `📍 Current URL after click: ${page.url()}`);
                
                foundBookButton = true;
                break;
              }
            }
            
            if (!foundBookButton) {
              log('info', '❌ No available reservations found. All buttons show sold out or other status.');
              break; // Exit the refresh loop, no available buttons
            }
            
          } catch (error) {
            refreshCount++;
            log('info', `🔄 Button not found or not stable, refreshing page in 30 seconds (attempt ${refreshCount})...`);
            
            // Wait 30 seconds before refreshing
            await new Promise(resolve => setTimeout(resolve, 30000));
            
            // Refresh the page and try again
            await page.reload({ waitUntil: 'domcontentloaded' });
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Wait for the search modal to appear again
            await page.waitForSelector('.SearchModal-body', { timeout: 45000 });
            
            // Continue the loop to try finding the button again
          }
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log('error', `Error in cycle ${cycleCount}`, { error: errorMessage });
      }
      
      // Wait exactly 10 minutes before next cycle
      log('info', '⏰ Waiting 10 minutes before next cycle...');
      await new Promise(resolve => setTimeout(resolve, 10 * 60 * 1000)); // 10 minutes in milliseconds
    }
  }
}

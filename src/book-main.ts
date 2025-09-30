import 'dotenv/config';
import { BookReservationBot } from './book-bot.js';
import { log } from './logger.js';
import { closeSharedBrowser } from './browser.js';
import { loadGlobalConfig } from './config.js';

function parseBookTime(timeString: string): Date {
  // Support formats like:
  // "14:30" (today at 2:30 PM)
  // "2024-12-25 14:30" (specific date and time)
  // "2024-12-25T14:30:00" (ISO format)
  
  const now = new Date();
  
  // If it's just time (HH:MM format)
  if (/^\d{1,2}:\d{2}$/.test(timeString)) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const targetTime = new Date();
    targetTime.setHours(hours, minutes, 0, 0);
    
    // If the time has already passed today, schedule for tomorrow
    if (targetTime <= now) {
      targetTime.setDate(targetTime.getDate() + 1);
    }
    
    return targetTime;
  }
  
  // If it's a full date-time string
  const targetTime = new Date(timeString);
  if (isNaN(targetTime.getTime())) {
    throw new Error(`Invalid BOOK_TIME format: ${timeString}. Use formats like "14:30" or "2024-12-25 14:30"`);
  }
  
  return targetTime;
}

async function waitUntilScheduledTime(targetTime: Date): Promise<void> {
  const now = new Date();
  const msUntilTarget = targetTime.getTime() - now.getTime();
  
  if (msUntilTarget <= 0) {
    log('info', '⏰ Scheduled time has already passed, starting immediately');
    return;
  }
  
  log('info', `⏰ Scheduled to start at ${targetTime.toLocaleString()}`);
  log('info', `⏳ Waiting ${Math.round(msUntilTarget / 1000)} seconds until start time...`);
  
  // Use setTimeout for the wait
  return new Promise((resolve) => {
    setTimeout(() => {
      log('info', '🚀 Scheduled time reached, starting bot!');
      resolve();
    }, msUntilTarget);
  });
}

async function main(): Promise<void> {
  const config = loadGlobalConfig();
  
  if (!config.BOOK_URL) {
    log('error', 'BOOK_URL environment variable is required');
    process.exit(1);
  }
  
  const bookUrl = config.BOOK_URL;
  
  try {
    log('info', '📖 Starting Book Reservation Bot');
    log('info', `🎯 Target URL: ${bookUrl}`);
    
    // Handle scheduling if BOOK_TIME is provided
    if (config.BOOK_TIME) {
      try {
        const targetTime = parseBookTime(config.BOOK_TIME);
        await waitUntilScheduledTime(targetTime);
      } catch (error) {
        log('error', 'Error parsing BOOK_TIME', { error });
        process.exit(1);
      }
    } else {
      log('info', '⚡ No BOOK_TIME specified, starting immediately');
    }
    
    const bot = new BookReservationBot(bookUrl);
    await bot.start();
    
    log('info', '✅ Bot execution completed - browser left open for manual completion');
    
  } catch (error) {
    log('error', 'Book bot execution failed', { error });
    await closeSharedBrowser();
    process.exit(1);
  }
}

// Handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  log('info', `Received ${signal}, shutting down Book bot...`);
  try {
    await closeSharedBrowser();
    process.exit(0);
  } catch (error) {
    log('error', 'Error during shutdown', { error });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log('error', 'Unhandled Promise Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  log('error', 'Uncaught Exception', { error });
  process.exit(1);
});

// Start the Book bot
main().catch((error) => {
  log('error', 'Book bot failed to start', { error });
  process.exit(1);
});
import 'dotenv/config';
import { TockReservationBot } from './tock-bot.js';
import { log } from './logger.js';
import { closeSharedBrowser } from './browser.js';
import { loadGlobalConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadGlobalConfig();
  
  if (!config.TOCK_URL) {
    log('error', 'TOCK_URL environment variable is required');
    process.exit(1);
  }
  
  const tockUrl = config.TOCK_URL;
  
  try {
    log('info', '🍽️ Starting Tock Reservation Bot');
    log('info', `🎯 Target URL: ${tockUrl}`);
    
    const bot = new TockReservationBot(tockUrl);
    await bot.start();
    
    log('info', '✅ Bot execution completed');
    
  } catch (error) {
    log('error', 'Bot execution failed', { error });
    await closeSharedBrowser();
    process.exit(1);
  }
}

// Handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  log('info', `Received ${signal}, shutting down Tock bot...`);
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

// Start the Tock bot
main().catch((error) => {
  log('error', 'Tock bot failed to start', { error });
  process.exit(1);
});

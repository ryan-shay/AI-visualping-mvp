#!/usr/bin/env node

import { startBookingBot } from './booking-bot.js';
import { log } from './logger.js';

async function main() {
  try {
    log('info', '🚀 Starting Booking Bot Application');
    await startBookingBot();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', 'Failed to start booking bot', { error: errorMessage });
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

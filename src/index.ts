import 'dotenv/config';
import { loadGlobalConfig, loadSitesConfig } from './config.js';
import { log } from './logger.js';
import { SiteScheduler } from './scheduler.js';
import { closeSharedBrowser } from './browser.js';
import { ensureDataDir } from './baseline.js';

async function main(): Promise<void> {
  try {
    log('info', '🎬 Visual Watcher starting up...');
    
    // Load configuration
    const globalConfig = loadGlobalConfig();
    const sites = loadSitesConfig();
    
    log('info', `📋 Configuration loaded: ${sites.length} sites, concurrency=${globalConfig.MAX_CONCURRENCY}, log=${globalConfig.LOG_LEVEL}`);
    
    // Ensure data directory exists
    await ensureDataDir();
    
    // Create and configure scheduler
    const scheduler = new SiteScheduler();
    
    // Add all sites to scheduler
    for (const site of sites) {
      scheduler.addSite(site);
      log('info', `📍 ${site.id}: Added (${site.check_min}-${site.check_max}min, ${site.relevance_mode} mode)`);
    }
    
    // Setup graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      log('info', `Received ${signal}, initiating graceful shutdown...`);
      
      try {
        await scheduler.stop();
        await closeSharedBrowser();
        log('info', 'Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        log('error', 'Error during shutdown', { error });
        process.exit(1);
      }
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Start the scheduler
    log('info', '🚀 Starting multi-site scheduler with goal-aware monitoring');
    await scheduler.start();
    
  } catch (error) {
    log('error', 'Fatal error during startup', { error });
    
    try {
      await closeSharedBrowser();
    } catch (browserError) {
      log('error', 'Error closing browser during cleanup', { browserError });
    }
    
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log('error', 'Unhandled Promise Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  log('error', 'Uncaught Exception', { error });
  process.exit(1);
});

// Start the application
main().catch((error) => {
  log('error', 'Application failed to start', { error });
  process.exit(1);
});
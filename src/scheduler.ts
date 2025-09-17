import { setTimeout as sleep } from 'node:timers/promises';
import { SiteConfig, loadGlobalConfig } from './config.js';
import { log } from './logger.js';
import { scrapeSite } from './scrape.js';
import { sha256 } from './hash.js';
import { readBaseline, writeBaseline } from './baseline.js';
import { checkHeuristic, classifyRelevance } from './relevance.js';
import { summarizeGoalAware } from './summarize.js';
import { postToDiscord, shouldThrottleError } from './notify.js';

type SiteSchedule = {
  site: SiteConfig;
  nextRunAt: Date;
  isRunning: boolean;
};

type WorkerJob = {
  site: SiteConfig;
  resolve: () => void;
  reject: (error: Error) => void;
};

export class SiteScheduler {
  private schedules: Map<string, SiteSchedule> = new Map();
  private workerQueue: WorkerJob[] = [];
  private activeWorkers = 0;
  private maxConcurrency: number;
  private running = false;
  private siteAddOrder = 0; // Track order sites are added for staggering

  constructor() {
    const config = loadGlobalConfig();
    this.maxConcurrency = config.MAX_CONCURRENCY;
  }

  private randomMinutes(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  private scheduleNextRun(siteId: string): void {
    const schedule = this.schedules.get(siteId);
    if (!schedule) return;

    const site = schedule.site;
    const minMinutes = site.check_min || 4;
    const maxMinutes = site.check_max || 6;
    const delayMinutes = this.randomMinutes(minMinutes, maxMinutes);
    
    schedule.nextRunAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    schedule.isRunning = false;

    log('info', `⏰ ${siteId}: Next run in ${delayMinutes.toFixed(1)}min (${schedule.nextRunAt.toTimeString().slice(0,8)})`);
  }

  private async processSite(site: SiteConfig): Promise<void> {
    const siteId = site.id;
    log('info', `🔄 Processing site: ${siteId}`);

    try {
      // Scrape the site
      const currentText = await scrapeSite(site);
      const currentHash = sha256(currentText);
      
      log('info', `🔐 ${siteId}: Generated hash ${currentHash.slice(0,12)}...`);

      // Check baseline
      const baseline = await readBaseline(siteId);
      const now = new Date().toISOString();

      if (!baseline) {
        // First run - save baseline
        log('info', `No baseline found for ${siteId}, creating initial baseline`);
        await writeBaseline(siteId, {
          hash: currentHash,
          text: currentText,
          lastCheckedISO: now
        });

        // Send baseline notice if enabled
        const config = loadGlobalConfig();
        if (config.SEND_BASELINE_NOTICE) {
          await postToDiscord(site, 'baseline', { isFirstRun: true });
        }
        
        log('info', `Initial baseline created for ${siteId}`);
        return;
      }

    log('info', `🔍 ${siteId}: Comparing hashes (current: ${currentHash.slice(0,8)}..., baseline: ${baseline.hash.slice(0,8)}...)`);

      if (baseline.hash === currentHash) {
        log('info', `✅ No changes detected for ${siteId}`);
        return;
      }

      // Change detected!
      log('info', `🚨 Change detected for ${siteId}! Processing relevance`);

      const heuristicResult = checkHeuristic(currentText, site);
      log('info', `Heuristic check for ${siteId}`, heuristicResult);

      let shouldNotify = false;
      let relevanceReason = '';

      if (site.relevance_mode === 'strict') {
        if (heuristicResult.hit) {
          // Run GPT classifier
          const relevanceResult = await classifyRelevance(baseline.text, currentText, site);
          shouldNotify = relevanceResult.relevant;
          relevanceReason = relevanceResult.reason;
          
          log('info', `GPT relevance check for ${siteId}`, {
            relevant: relevanceResult.relevant,
            reason: relevanceResult.reason
          });
        } else {
          log('info', `Heuristic failed for ${siteId}, skipping GPT and notification`);
        }
      } else {
        // Loose mode - always notify but include heuristic info
        shouldNotify = true;
        log('info', `Loose mode for ${siteId}, will notify regardless of relevance`);
      }

      // Update baseline regardless of notification decision
      await writeBaseline(siteId, {
        hash: currentHash,
        text: currentText,
        lastCheckedISO: now
      });

      if (shouldNotify) {
        // Generate summary
        const summary = await summarizeGoalAware(baseline.text, currentText, site);
        
        // Send notification
        if (site.relevance_mode === 'strict') {
          await postToDiscord(site, 'relevant', {
            summary,
            relevanceReason
          });
        } else {
          await postToDiscord(site, 'loose', {
            summary,
            heuristicResult
          });
        }
        
        log('info', `Notification sent for ${siteId}`);
      } else {
        log('info', `Change not relevant for ${siteId}, baseline updated silently`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', `Error processing site ${siteId}`, { error: errorMessage });

      // Send error notification (with throttling)
      if (!shouldThrottleError(siteId)) {
        try {
          await postToDiscord(site, 'error', { error: errorMessage });
        } catch (discordError) {
          log('error', `Failed to send error notification for ${siteId}`, { discordError });
        }
      } else {
        log('info', `Error notification throttled for ${siteId}`);
      }

      // Re-throw to be handled by worker
      throw error;
    }
  }

  private async worker(): Promise<void> {
    while (this.running) {
      if (this.workerQueue.length === 0 || this.activeWorkers >= this.maxConcurrency) {
        await sleep(100); // Short sleep to avoid busy waiting
        continue;
      }

      const job = this.workerQueue.shift();
      if (!job) continue;

      this.activeWorkers++;
      
      // Process job asynchronously
      this.processSite(job.site)
        .then(() => {
          job.resolve();
        })
        .catch((error) => {
          job.reject(error);
        })
        .finally(() => {
          this.activeWorkers--;
          this.scheduleNextRun(job.site.id);
        });
    }
  }

  private async dispatcher(): Promise<void> {
    while (this.running) {
      const now = new Date();
      
      // Find sites that are due for processing, but only queue one at a time to respect staggering
      let queuedThisRound = 0;
      const maxQueuePerRound = 1; // Only queue 1 site per dispatch round for better staggering
      
      for (const [siteId, schedule] of this.schedules) {
        if (schedule.isRunning || schedule.nextRunAt > now) {
          continue;
        }

        if (this.activeWorkers >= this.maxConcurrency || queuedThisRound >= maxQueuePerRound) {
          break; // Wait for workers to free up or respect per-round limit
        }

        // Mark as running and queue for processing
        schedule.isRunning = true;
        queuedThisRound++;
        
        const job: WorkerJob = {
          site: schedule.site,
          resolve: () => {
            log('debug', `Job completed for ${siteId}`);
          },
          reject: (error: Error) => {
            log('error', `Job failed for ${siteId}`, { error: error.message });
          }
        };
        
        this.workerQueue.push(job);
        log('debug', `Queued job for ${siteId} (active: ${this.activeWorkers}/${this.maxConcurrency})`);
      }

      await sleep(3000); // Check every 3 seconds for more controlled dispatching
    }
  }

  private calculateStaggeredStartTime(siteIndex: number, totalSites: number): Date {
    const config = loadGlobalConfig();
    
    // Intelligent staggering strategy:
    // 1. Spread initial runs across configurable window to avoid simultaneous starts
    // 2. Add some randomization to prevent predictable patterns  
    // 3. Ensure we don't exceed concurrency limits at startup
    
    const baseDelayMs = 10000; // Start after 10 seconds minimum
    const staggerWindowMs = config.STAGGER_STARTUP_MINUTES * 60 * 1000; // Configurable stagger window
    const staggerDelayMs = (siteIndex * staggerWindowMs) / Math.max(1, totalSites - 1);
    
    // Add some randomization (±30 seconds) to avoid predictable timing
    const randomOffsetMs = (Math.random() - 0.5) * 60000; // ±30 seconds
    
    const totalDelayMs = baseDelayMs + staggerDelayMs + randomOffsetMs;
    
    return new Date(Date.now() + Math.max(5000, totalDelayMs)); // Minimum 5s delay
  }

  public addSite(site: SiteConfig): void {
    const siteId = site.id;
    
    if (this.schedules.has(siteId)) {
      log('warn', `Site ${siteId} already scheduled, skipping`);
      return;
    }

    // Calculate staggered start time based on order added
    const startTime = this.calculateStaggeredStartTime(this.siteAddOrder, this.schedules.size + 1);
    
    const schedule: SiteSchedule = {
      site,
      nextRunAt: startTime,
      isRunning: false
    };

    this.schedules.set(siteId, schedule);
    this.siteAddOrder++;
    
    const delayMinutes = ((startTime.getTime() - Date.now()) / 1000 / 60).toFixed(1);
    log('info', `📍 Added site: ${siteId} → first run in ${delayMinutes}min (${startTime.toISOString()})`);
  }

  public async start(): Promise<void> {
    if (this.running) {
      log('warn', 'Scheduler already running');
      return;
    }

    this.running = true;
    log('info', `🚀 Starting site scheduler: ${this.schedules.size} sites, max concurrency=${this.maxConcurrency}`);

    // Start worker processes
    const workerPromises = [];
    for (let i = 0; i < Math.min(4, this.maxConcurrency); i++) {
      workerPromises.push(this.worker());
    }

    // Start dispatcher
    const dispatcherPromise = this.dispatcher();

    // Wait for all processes (they run indefinitely)
    await Promise.all([...workerPromises, dispatcherPromise]);
  }

  public async stop(): Promise<void> {
    log('info', 'Stopping scheduler...');
    this.running = false;

    // Wait for active workers to complete
    while (this.activeWorkers > 0) {
      log('info', `Waiting for ${this.activeWorkers} active workers to complete...`);
      await sleep(1000);
    }

    log('info', 'Scheduler stopped');
  }

  public getStatus(): { totalSites: number, activeWorkers: number, queuedJobs: number } {
    return {
      totalSites: this.schedules.size,
      activeWorkers: this.activeWorkers,
      queuedJobs: this.workerQueue.length
    };
  }
}

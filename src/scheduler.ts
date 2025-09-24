import { setTimeout as sleep } from 'node:timers/promises';
import { SiteConfig, loadGlobalConfig } from './config.js';
import { log } from './logger.js';
import { scrapeSite } from './scrape.js';
import { sha256 } from './hash.js';
import { readBaseline, writeBaseline } from './baseline.js';
import { checkHeuristic, analyzeChangeRelevanceAndSummary } from './relevance.js';
import { postToDiscord, shouldThrottleError } from './notify.js';

export class SiteScheduler {
  private sites: SiteConfig[] = [];
  private currentSiteIndex = 0;
  private running = false;
  private cycleStartTime = 0;

  constructor() {
    // Sequential processing - no concurrency settings needed
  }

  /**
   * Calculate how long to spend on each site based on desired check frequency
   * Formula: (desired_check_minutes * 60) / total_sites = seconds_per_site
   */
  private calculateSiteViewTime(site: SiteConfig): number {
    const totalSites = this.sites.length;
    if (totalSites === 0) return 10000; // fallback to 10s
    
    const minMinutes = site.check_min || 4;
    const maxMinutes = site.check_max || 6;
    const avgCheckMinutes = (minMinutes + maxMinutes) / 2;
    
    // Convert to milliseconds and divide by number of sites
    const msPerSite = (avgCheckMinutes * 60 * 1000) / totalSites;
    
    // Minimum 10 seconds, maximum 60 seconds per site
    return Math.max(10000, Math.min(60000, msPerSite));
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

      if (baseline.hash === currentHash) {
        log('debug', `✅ No changes detected for ${siteId}`);
        return;
      }

      // Change detected!
      log('info', `🚨 Change detected for ${siteId}! Processing relevance`);

      const heuristicResult = checkHeuristic(currentText, site);
      log('debug', `Heuristic check for ${siteId}`, heuristicResult);

      let shouldNotify = false;
      let summary = '';
      let relevanceReason = '';

      if (site.relevance_mode === 'strict') {
        if (heuristicResult.hit) {
          // Run combined GPT analysis (relevance + summary in one call)
          const analysisResult = await analyzeChangeRelevanceAndSummary(baseline.text, currentText, site);
          shouldNotify = analysisResult.relevant;
          relevanceReason = analysisResult.reason;
          summary = analysisResult.summary;
          
          log('debug', `Combined GPT analysis for ${siteId}`, {
            relevant: analysisResult.relevant,
            reason: analysisResult.reason
          });
        } else {
          log('debug', `Heuristic failed for ${siteId}, skipping GPT and notification`);
        }
      } else {
        // Loose mode - always notify but include heuristic info
        shouldNotify = true;
        // For loose mode, generate summary separately (could be optimized further)
        const analysisResult = await analyzeChangeRelevanceAndSummary(baseline.text, currentText, site);
        summary = analysisResult.summary;
        log('debug', `Loose mode for ${siteId}, will notify regardless of relevance`);
      }

      // Update baseline regardless of notification decision
      await writeBaseline(siteId, {
        hash: currentHash,
        text: currentText,
        lastCheckedISO: now
      });

      if (shouldNotify) {
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

  /**
   * Main pipeline loop - processes sites sequentially in rotation
   */
  private async runPipeline(): Promise<void> {
    log('info', `🚀 Starting sequential pipeline with ${this.sites.length} sites`);
    this.cycleStartTime = Date.now();
    
    while (this.running) {
      if (this.sites.length === 0) {
        await sleep(5000);
        continue;
      }
      
      // Get current site
      const site = this.sites[this.currentSiteIndex];
      const viewTime = this.calculateSiteViewTime(site);
      
      log('info', `📍 Pipeline: Processing site ${this.currentSiteIndex + 1}/${this.sites.length}: ${site.id} (${Math.round(viewTime/1000)}s)`);
      
      const startTime = Date.now();
      
      try {
        // Process the site
        await this.processSite(site);
        
        // Calculate remaining time to spend on this site
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, viewTime - elapsedTime);
        
        if (remainingTime > 0) {
          log('debug', `⏱️  ${site.id}: Processing took ${Math.round(elapsedTime/1000)}s, waiting additional ${Math.round(remainingTime/1000)}s`);
          await sleep(remainingTime);
        }
        
      } catch (error) {
        log('error', `❌ Error processing ${site.id}`, { error: error instanceof Error ? error.message : String(error) });
        
        // Still wait the minimum time even on error to maintain timing
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, Math.min(viewTime, 10000) - elapsedTime); // At least wait 10s on error
        
        if (remainingTime > 0) {
          await sleep(remainingTime);
        }
      }
      
      // Move to next site
      this.currentSiteIndex = (this.currentSiteIndex + 1) % this.sites.length;
      
      // Log cycle completion
      if (this.currentSiteIndex === 0) {
        const cycleTime = Date.now() - this.cycleStartTime;
        log('info', `🔄 Completed full cycle in ${Math.round(cycleTime/1000)}s, starting next cycle`);
        this.cycleStartTime = Date.now();
      }
    }
  }

  public addSite(site: SiteConfig): void {
    const siteId = site.id;
    
    // Check for duplicates
    if (this.sites.some(s => s.id === siteId)) {
      log('warn', `Site ${siteId} already added, skipping`);
      return;
    }

    this.sites.push(site);
    
    const viewTime = this.calculateSiteViewTime(site);
    log('info', `📍 Added site: ${siteId} → will spend ${Math.round(viewTime/1000)}s per visit`);
  }

  public async start(): Promise<void> {
    if (this.running) {
      log('warn', 'Scheduler already running');
      return;
    }

    if (this.sites.length === 0) {
      throw new Error('No sites added to scheduler');
    }

    this.running = true;
    
    // Calculate and log timing info
    const avgCheckMin = this.sites.reduce((sum, site) => sum + (site.check_min || 4), 0) / this.sites.length;
    const avgCheckMax = this.sites.reduce((sum, site) => sum + (site.check_max || 6), 0) / this.sites.length;
    const avgCheckTime = (avgCheckMin + avgCheckMax) / 2;
    const cycleTime = avgCheckTime / this.sites.length;
    
    log('info', `🚀 Starting sequential pipeline:`);
    log('info', `   • ${this.sites.length} sites`);
    log('info', `   • ~${Math.round(cycleTime * 60)}s per site`);
    log('info', `   • ~${Math.round(avgCheckTime)}min full cycle`);
    log('info', `   • Each site checked every ~${Math.round(avgCheckTime)}min`);

    // Start the pipeline
    await this.runPipeline();
  }

  public async stop(): Promise<void> {
    log('info', 'Stopping pipeline...');
    this.running = false;
    log('info', 'Pipeline stopped');
  }

  public getStatus(): { totalSites: number, currentSite: string | null, cycleProgress: string } {
    const currentSite = this.sites.length > 0 ? this.sites[this.currentSiteIndex]?.id || null : null;
    const progress = this.sites.length > 0 ? `${this.currentSiteIndex + 1}/${this.sites.length}` : '0/0';
    
    return {
      totalSites: this.sites.length,
      currentSite,
      cycleProgress: progress
    };
  }
}

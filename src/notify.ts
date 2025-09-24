import { request } from 'undici';
import { SiteConfig, loadGlobalConfig } from './config.js';
import { log } from './logger.js';
import { HeuristicResult } from './relevance.js';

let discordWebhookUrl: string;

try {
  const config = loadGlobalConfig();
  discordWebhookUrl = config.DISCORD_WEBHOOK_URL;
} catch (err) {
  // Will be initialized later when actually needed
}

export type NotificationKind = 'relevant' | 'loose' | 'baseline' | 'error';

export type NotificationData = {
  summary?: string;
  relevanceReason?: string;
  heuristicResult?: HeuristicResult;
  error?: string;
  isFirstRun?: boolean;
};

function getEmojiForKind(kind: NotificationKind): string {
  switch (kind) {
    case 'relevant': return '🔔';
    case 'loose': return '🟡';
    case 'baseline': return '👀';
    case 'error': return '❗';
    default: return '🔔';
  }
}

export async function postToDiscord(
  site: SiteConfig,
  kind: NotificationKind,
  data: NotificationData
): Promise<void> {
  if (!discordWebhookUrl) {
    const config = loadGlobalConfig();
    discordWebhookUrl = config.DISCORD_WEBHOOK_URL;
  }
  
  const emoji = getEmojiForKind(kind);
  const timestamp = new Date().toISOString();
  
  let content: string;
  
  if (kind === 'error') {
    content = [
      `${emoji} **Error for ${site.id}**`,
      `${site.url}`,
      ``,
      `**Error:**`,
      data.error || 'Unknown error occurred',
      ``,
      `Time: ${timestamp}`
    ].join('\n');
  } else if (kind === 'baseline') {
    content = [
      `${emoji} **Baseline saved for ${site.id}**`,
      `${site.url}`,
      ``,
      `Watching selector: \`${site.selector || 'main'}\``,
      `Goal: ${site.watch_goal || 'Monitor for changes'}`,
      site.goal_date ? `Date: ${site.goal_date}` : '',
      site.goal_party_size ? `Party: ${site.goal_party_size}` : '',
      `Mode: ${site.relevance_mode || 'strict'}`,
      ``,
      `Time: ${timestamp}`
    ].filter(line => line !== '').join('\n');
  } else {
    // Change notifications (relevant or loose)
    const messageParts = [
      `${emoji} **Change detected - ${site.id}**`,
      `${site.url}`,
      ``
    ];

    if (data.summary) {
      messageParts.push(`**Summary:**`);
      messageParts.push(data.summary);
      messageParts.push(``);
    }

    // Add goal information
    messageParts.push(`**Goal:** ${site.watch_goal || 'Monitor for changes'}`);
    if (site.goal_date) messageParts.push(`**Date:** ${site.goal_date}`);
    if (site.goal_party_size) messageParts.push(`**Party:** ${site.goal_party_size}`);
    
    messageParts.push(`**Selector:** \`${site.selector || 'main'}\``);
    messageParts.push(`**Checked at:** ${timestamp}`);

    // Add relevance information
    if (kind === 'relevant' && data.relevanceReason) {
      messageParts.push(`**Relevance:** ${data.relevanceReason}`);
    } else if (kind === 'loose' && data.heuristicResult) {
      const heuristicLabel = data.heuristicResult.hit ? 'hit' : 'miss';
      messageParts.push(`**Heuristic:** ${heuristicLabel} (${data.heuristicResult.detail})`);
    }

    content = messageParts.join('\n');
  }
  
  log('info', `📢 ${site.id}: Sending ${kind} notification (${content.length} chars)`);
  
  try {
    const payload = { content };
    const response = await request(discordWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (response.statusCode >= 300) {
      const body = await response.body.text();
      throw new Error(`Discord webhook failed: ${response.statusCode} ${body}`);
    }
    
    log('info', `✅ ${site.id}: Discord notification sent (${response.statusCode})`);
  } catch (error) {
    log('error', `Failed to send Discord notification for ${site.id}`, { error });
    throw error;
  }
}

// Error throttling to prevent Discord spam with automatic cleanup
const errorThrottleMap = new Map<string, number>();
const THROTTLE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const cutoff = now - THROTTLE_INTERVAL_MS;
  
  for (const [siteId, timestamp] of errorThrottleMap.entries()) {
    if (timestamp < cutoff) {
      errorThrottleMap.delete(siteId);
    }
  }
}, CLEANUP_INTERVAL_MS);

export function shouldThrottleError(siteId: string): boolean {
  const now = Date.now();
  const lastError = errorThrottleMap.get(siteId);
  
  if (!lastError || (now - lastError) > THROTTLE_INTERVAL_MS) {
    errorThrottleMap.set(siteId, now);
    return false; // Don't throttle
  }
  
  return true; // Throttle this error
}

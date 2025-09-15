import 'dotenv/config';
import { chromium } from '@playwright/test';
import { writeFile, readFile, access, constants, mkdir } from 'node:fs/promises';
import { OpenAI } from 'openai';
import { setTimeout as sleep } from 'node:timers/promises';
import crypto from 'node:crypto';
import { request } from 'undici';

type Baseline = {
  hash: string;
  text: string;
  lastChecked: string;
};

const TARGET_URL = process.env.TARGET_URL!;
if (!TARGET_URL) throw new Error("Missing TARGET_URL");

const CSS_SELECTOR = process.env.CSS_SELECTOR || 'main';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL!;
if (!DISCORD_WEBHOOK_URL) throw new Error("Missing DISCORD_WEBHOOK_URL");

const CHECK_INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 240);
const WAIT_UNTIL = (process.env.WAIT_UNTIL || 'networkidle') as 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
const HEADLESS = String(process.env.HEADLESS || 'true') === 'true';

const DATA_DIR = '.data';
const BASELINE_PATH = `${DATA_DIR}/baseline.json`;

const ai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Logging utility
function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level}: ${message}`;
  console.log(logMessage);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function normalizeText(t: string) {
  return t
    .replace(/\s+/g, ' ')
    .replace(/\u200B/g, '')
    .trim();
}

function sha256(input: string) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

async function ensureDataDir() {
  try { await access(DATA_DIR, constants.F_OK); }
  catch { await mkdir(DATA_DIR, { recursive: true }); }
}

async function readBaseline(): Promise<Baseline | null> {
  try {
    const buf = await readFile(BASELINE_PATH, 'utf8');
    return JSON.parse(buf);
  } catch {
    return null;
  }
}

async function writeBaseline(b: Baseline) {
  await writeFile(BASELINE_PATH, JSON.stringify(b, null, 2), 'utf8');
}

async function fetchSectionText(): Promise<string> {
  log('INFO', 'Starting browser and navigating to page', { url: TARGET_URL, headless: HEADLESS });
  
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
  });
  const page = await ctx.newPage();
  
  log('INFO', `Navigating to URL with wait condition: ${WAIT_UNTIL}`);
  await page.goto(TARGET_URL, { waitUntil: WAIT_UNTIL, timeout: 90_000 });

  // Wait a beat for dynamic content
  log('INFO', 'Waiting 2s for dynamic content to load');
  await page.waitForTimeout(2000);

  let text = '';
  log('INFO', `Checking if selector exists: ${CSS_SELECTOR}`);
  const hasSelector = await page.locator(CSS_SELECTOR).first().isVisible().catch(() => false);
  
  if (hasSelector) {
    log('INFO', `Selector found: ${CSS_SELECTOR}, waiting for it to be ready`);
    // Enhanced waiting for heavy JS pages
    try {
      await page.waitForSelector(CSS_SELECTOR, { timeout: 15000 });
      log('INFO', `Successfully waited for selector: ${CSS_SELECTOR}`);
    } catch (err) {
      log('WARN', `Selector ${CSS_SELECTOR} not found within timeout, proceeding anyway`);
    }
    text = await page.locator(CSS_SELECTOR).innerText();
    log('INFO', `Extracted text from ${CSS_SELECTOR}`, { textLength: text.length, preview: text.slice(0, 200) + '...' });
  } else {
    // Fallback to main or body
    const fallback = (await page.locator('main').count()) ? 'main' : 'body';
    log('INFO', `Selector not visible, falling back to: ${fallback}`);
    try {
      await page.waitForSelector(fallback, { timeout: 15000 });
      log('INFO', `Successfully waited for fallback selector: ${fallback}`);
    } catch (err) {
      log('WARN', `Fallback selector ${fallback} not found within timeout, proceeding anyway`);
    }
    text = await page.locator(fallback).innerText();
    log('INFO', `Extracted text from ${fallback}`, { textLength: text.length, preview: text.slice(0, 200) + '...' });
  }

  await ctx.close();
  await browser.close();
  log('INFO', 'Browser closed successfully');

  const normalizedText = normalizeText(text);
  log('INFO', 'Text normalized', { originalLength: text.length, normalizedLength: normalizedText.length });
  
  return normalizedText;
}

async function summarizeDiff(oldText: string, newText: string): Promise<string> {
  log('INFO', 'Calling GPT to summarize differences', { 
    oldTextLength: oldText.length, 
    newTextLength: newText.length,
    oldPreview: oldText.slice(0, 100) + '...',
    newPreview: newText.slice(0, 100) + '...'
  });
  
  // Keep prompts short and focused to control cost
  const system = "You compare two versions of a web section and write a terse, bullet-point summary of meaningful changes. If no meaningful change, say 'No material change.'";
  const user = `Target URL: ${TARGET_URL}

Old (truncated to 6k chars):
${oldText.slice(0, 6000)}

New (truncated to 6k chars):
${newText.slice(0, 6000)}

Write 3-6 bullets focusing on availability, dates, times, prices, or status changes. Include specific numbers or times if visible.`;

  const resp = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  const summary = resp.choices[0]?.message?.content?.trim() || "Change detected.";
  log('INFO', 'GPT summary generated', { summary });
  
  return summary;
}

async function postToDiscord(content: string) {
  log('INFO', 'Sending message to Discord', { contentLength: content.length, preview: content.slice(0, 100) + '...' });
  
  const payload = { content };
  const r = await request(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (r.statusCode >= 300) {
    const body = await r.body.text();
    log('ERROR', 'Discord webhook failed', { statusCode: r.statusCode, body });
    throw new Error(`Discord webhook failed: ${r.statusCode} ${body}`);
  }
  
  log('INFO', 'Discord message sent successfully', { statusCode: r.statusCode });
}

async function runOnce() {
  log('INFO', '🔄 Starting check cycle');
  await ensureDataDir();
  const now = new Date().toISOString();
  
  const latestText = await fetchSectionText();
  const latestHash = sha256(latestText);
  log('INFO', 'Generated content hash', { hash: latestHash });

  const baseline = await readBaseline();
  
  if (!baseline) {
    log('INFO', 'No baseline found, creating initial baseline');
    await writeBaseline({ hash: latestHash, text: latestText, lastChecked: now });
    await postToDiscord(`👀 Baseline saved for:\n${TARGET_URL}\n(Watching selector: \`${CSS_SELECTOR}\`)\nTime: ${now}`);
    log('INFO', 'Initial baseline created and Discord notification sent');
    return;
  }

  log('INFO', 'Comparing with existing baseline', { 
    currentHash: latestHash, 
    baselineHash: baseline.hash,
    lastChecked: baseline.lastChecked 
  });

  if (baseline.hash !== latestHash) {
    log('INFO', '🚨 Change detected! Generating summary with GPT');
    
    // Summarize with GPT
    const summary = await summarizeDiff(baseline.text, latestText);

    const msg = [
      `🔔 **Change detected**`,
      `${TARGET_URL}`,
      ``,
      `**Summary:**`,
      summary,
      ``,
      `Checked: ${now}`,
      `Selector: \`${CSS_SELECTOR}\``
    ].join('\n');

    await postToDiscord(msg);

    // Update baseline
    await writeBaseline({ hash: latestHash, text: latestText, lastChecked: now });
    log('INFO', 'Baseline updated with new content');
  } else {
    log('INFO', '✅ No changes detected');
    // Optional: quiet mode (no Discord ping). If you prefer a heartbeat, uncomment:
    // await postToDiscord(`✅ No change for: ${TARGET_URL} (Checked ${now})`);
  }
}

async function mainLoop() {
  const intervalMs = Math.max(1, CHECK_INTERVAL_MINUTES) * 60_000;
  log('INFO', '🚀 Starting Visual Watcher', { 
    targetUrl: TARGET_URL,
    selector: CSS_SELECTOR,
    intervalMinutes: CHECK_INTERVAL_MINUTES,
    intervalMs,
    headless: HEADLESS,
    waitUntil: WAIT_UNTIL
  });
  
  // Run immediately, then sleep/loop
  while (true) {
    try {
      await runOnce();
      log('INFO', `💤 Sleeping for ${CHECK_INTERVAL_MINUTES} minutes until next check`);
    } catch (err: any) {
      const msg = `❗ Watcher error: ${err?.message || err}`;
      log('ERROR', 'Error during check cycle', { error: err?.message || err, stack: err?.stack });
      console.error(msg);
      try { 
        await postToDiscord(msg); 
        log('INFO', 'Error notification sent to Discord');
      } catch (discordErr) {
        log('ERROR', 'Failed to send error notification to Discord', { discordError: discordErr });
      }
    }
    await sleep(intervalMs);
  }
}

log('INFO', '🎬 Visual Watcher starting up...');
mainLoop();

# Visual Watcher (Playwright + GPT + Discord)

A sophisticated multi-site watcher that monitors web pages for changes with goal-aware relevance filtering and intelligent summaries sent to Discord.

## Features

- 🎭 **Playwright Integration**: Uses shared Chromium browser with per-site contexts
- 🤖 **Goal-Aware GPT Analysis**: Leverages OpenAI's GPT with heuristic pre-filtering for relevant changes
- 📢 **Enhanced Discord Notifications**: Rich notifications with goal context and relevance reasoning
- 🗓️ **Multi-Site Monitoring**: Configure multiple sites with individual goals and schedules
- ⏰ **Randomized Scheduling**: Randomized intervals (4-6 min default) with concurrency control
- 🎯 **Smart Relevance Filtering**: Strict/loose modes with keyword matching and date awareness
- 🔧 **Text Scrubbing**: Configurable regex patterns to clean content before comparison
- 💾 **Organized Storage**: Per-site baselines in structured data directory
- 🚦 **Concurrency Control**: Configurable worker pool to manage resource usage
- 🛡️ **Error Resilience**: Graceful error handling with throttled notifications

## Setup

1. **Clone and Install**
   ```bash
   git clone <your-repo-url> visualwatch
   cd visualwatch
   npm install
   npm run playwright:install
   ```

2. **Environment Configuration**
   ```bash
   cp env.example .env
   ```
   
   **Simple Multi-Site Setup (Recommended):**
   ```bash
   # Required
   OPENAI_API_KEY="sk-your-key-here"
   DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/your-webhook"
   
   # Just list your URLs separated by commas - that's it!
   WATCH_URLS="https://site1.com,https://site2.com/page,https://site3.com"
   ```
   
   The system automatically:
   - Creates smart site IDs from hostnames
   - Uses sensible defaults (4-6 min intervals, loose relevance mode)
   - Monitors the main content area of each page
   - Applies standard availability keywords

3. **Advanced Configuration (Optional)**
   For fine-tuned control, create a `sites.yaml` file:
   
   ```yaml
   # Optional global defaults (inherited by all sites)
   defaults:
     check_min: 4
     check_max: 6
     wait_until: networkidle
     headless: true
     watch_goal: "Alert only if there is new availability for the target date and party size."
     goal_keywords: ["available","availability","open","book","reserve","slots","seats","tables"]
     goal_negative_hints: ["sold out","fully booked","waitlist","notify"]
     relevance_mode: "strict"

   sites:
     - id: "pocket-concierge"
       url: "https://pocket-concierge.jp/en/restaurants/243892?extlink=pa-jp-ICS-PC_243892_HP_EN&date=2025-10-21&partySize=4&serviceType=DINNER"
       selector: "main"
       watch_goal: "Alert only if there is new availability for the target date and party size."
       goal_date: "2025-10-21"
       goal_party_size: "4"
       relevance_mode: "strict"
       scrub_patterns:
         - pattern: "\\bUpdated at\\s*\\d{1,2}:\\d{2}(:\\d{2})?\\b"
           flags: "i"
         - pattern: "\\s+"
           flags: "g"
   ```

4. **Run the Watcher**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm run build
   npm start
   ```

## Configuration Options

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✅ | - | OpenAI API key for GPT summaries |
| `DISCORD_WEBHOOK_URL` | ✅ | - | Discord webhook for notifications |
| `WATCH_URLS` | ⭐ | - | **Simple setup**: Comma-separated URLs to monitor |
| `GLOBAL_CHECK_MIN` | ❌ | `4` | Minimum minutes between checks |
| `GLOBAL_CHECK_MAX` | ❌ | `6` | Maximum minutes between checks |
| `MAX_CONCURRENCY` | ❌ | `3` | Maximum concurrent site checks |
| `STAGGER_STARTUP_MINUTES` | ❌ | `3` | Minutes to spread initial site launches |
| `LOG_LEVEL` | ❌ | `info` | Logging level (debug/info/warn/error) |
| `SEND_BASELINE_NOTICE` | ❌ | `true` | Send Discord notice for new baselines |

### Legacy Support (Single Site)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TARGET_URL` | ❌ | - | Legacy single URL to monitor |
| `CSS_SELECTOR` | ❌ | `main` | Legacy CSS selector |
| `CHECK_INTERVAL_MINUTES` | ❌ | `240` | Legacy check interval |
| `HEADLESS` | ❌ | `true` | Legacy headless setting |

### Sites Configuration Schema

Each site in `sites.yaml` supports these fields:

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `id` | ✅ | - | Unique identifier for the site |
| `url` | ✅ | - | URL to monitor |
| `selector` | ❌ | `main` | CSS selector to monitor |
| `check_min` | ❌ | `4` | Minimum minutes between checks |
| `check_max` | ❌ | `6` | Maximum minutes between checks |
| `wait_until` | ❌ | `networkidle` | Playwright wait condition |
| `headless` | ❌ | `true` | Run browser headlessly |
| `watch_goal` | ❌ | - | Description of what to watch for |
| `goal_date` | ❌ | - | Target date to monitor (YYYY-MM-DD) |
| `goal_party_size` | ❌ | - | Target party size |
| `goal_keywords` | ❌ | `[]` | Keywords indicating positive changes |
| `goal_negative_hints` | ❌ | `[]` | Keywords indicating negative changes |
| `relevance_mode` | ❌ | `strict` | `strict` or `loose` relevance filtering |
| `scrub_patterns` | ❌ | `[]` | Regex patterns to clean text |

### Wait Conditions

- `load`: Wait for the load event
- `domcontentloaded`: Wait for DOMContentLoaded event
- `networkidle`: Wait for network to be idle (recommended)
- `commit`: Wait for navigation commit

## Production Deployment

### Using systemd (Linux)

1. Create service file `/etc/systemd/system/visualwatch.service`:
   ```ini
   [Unit]
   Description=Visual Watcher (Playwright + GPT + Discord)
   After=network-online.target

   [Service]
   WorkingDirectory=/home/youruser/visualwatch
   ExecStart=/usr/bin/npm run dev
   Restart=always
   RestartSec=5
   Environment=NODE_ENV=production
   User=youruser

   [Install]
   WantedBy=multi-user.target
   ```

2. Enable and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now visualwatch
   sudo systemctl status visualwatch
   journalctl -u visualwatch -f
   ```

## How It Works

1. **Staggered Multi-Site Scheduling**: Sites launch spread across 3 minutes (configurable) to avoid simultaneous requests
2. **Smart Concurrency Control**: Worker pool limits concurrent scraping (default: 3 sites max at once)
3. **Randomized Intervals**: Each site reschedules randomly within 4-6 minute windows after each check
4. **Smart Scraping**: Uses shared browser with per-site contexts and configurable text scrubbing
5. **Goal-Aware Filtering**: 
   - **Heuristic Check**: Fast keyword and date matching
   - **GPT Classification**: Deep relevance analysis (strict mode only)
6. **Intelligent Notifications**: Context-rich Discord messages with goal information and relevance reasoning
7. **Resilient Operation**: Error handling, throttling, and graceful shutdown

### Relevance Modes

- **Strict Mode**: Only notifies if heuristic passes AND GPT confirms relevance
- **Loose Mode**: Always notifies but includes heuristic results in message

### Notification Types

- 🔔 **Relevant Change**: Strict mode confirmed relevant change
- 🟡 **Loose Change**: Loose mode change with heuristic info
- 👀 **Baseline Saved**: Initial baseline creation (optional)
- ❗ **Error**: Processing errors (throttled to prevent spam)

### Concurrency & Timing Control

**Smart Staggering** prevents overwhelming target servers:
- **Startup**: Sites launch spread across `STAGGER_STARTUP_MINUTES` (default: 3 min)
- **Runtime**: Max `MAX_CONCURRENCY` sites scraped simultaneously (default: 3)
- **Intervals**: Each site reschedules randomly between `GLOBAL_CHECK_MIN` and `GLOBAL_CHECK_MAX` minutes

**Example with 5 restaurant sites:**
```
Site 1: Starts at 0.5 min  →  Next check in 4.2 min
Site 2: Starts at 1.7 min  →  Next check in 5.8 min  
Site 3: Starts at 2.3 min  →  Next check in 4.5 min
Site 4: Starts at 2.8 min  →  Next check in 6.1 min
Site 5: Starts at 3.1 min  →  Next check in 5.3 min
```

This ensures:
- ✅ No simultaneous requests to similar sites
- ✅ Natural, human-like timing patterns
- ✅ Respectful server load distribution
- ✅ Reduced risk of rate limiting or blocking

## Error Handling

- Network timeouts and browser errors are caught and reported to Discord
- Failed Discord webhooks are logged but don't stop the monitoring
- The watcher continues running even after errors, with automatic retries

## File Structure

```
visualwatch/
├── src/
│   ├── index.ts          # Main application entry point
│   ├── config.ts         # Configuration loading and validation
│   ├── scheduler.ts      # Multi-site scheduler with worker pool
│   ├── browser.ts        # Shared browser lifecycle management
│   ├── scrape.ts         # Site scraping with text processing
│   ├── relevance.ts      # Heuristic and GPT relevance checking
│   ├── summarize.ts      # Goal-aware GPT summaries
│   ├── notify.ts         # Enhanced Discord notifications
│   ├── baseline.ts       # Per-site baseline management
│   ├── hash.ts           # Text normalization and hashing
│   └── logger.ts         # Configurable logging utility
├── .data/
│   └── baselines/        # Per-site baseline storage
│       ├── site1.json    # Individual site baselines
│       └── site2.json
├── sites.yaml            # Multi-site configuration
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── env.example           # Environment template
└── README.md            # This file
```

## Cost Considerations

- Uses `gpt-4o-mini` for cost-effective analysis
- Heuristic pre-filtering reduces GPT calls in strict mode
- Truncates content to 6k characters to control API costs
- Only calls GPT when actual changes are detected
- Strict mode can significantly reduce API usage vs loose mode

## Troubleshooting

### Common Issues

1. **Selector not found**: The watcher will fall back to `main` or `body` if your CSS selector isn't found
2. **Heavy JavaScript pages**: The enhanced waiting logic includes `waitForSelector` with 15-second timeouts
3. **Rate limiting**: Adjust `CHECK_INTERVAL_MINUTES` if you hit API rate limits

### Debugging

Run in non-headless mode to see what the browser is doing:
```bash
# In your .env file
HEADLESS=false
```

Enable verbose logging by checking the console output and Discord error messages.

## Quick Start Examples

### Super Simple (Just URLs)
```bash
# .env file
OPENAI_API_KEY="sk-your-key"
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/your-webhook"
WATCH_URLS="https://restaurant1.com,https://tickets.site2.com,https://bookings.site3.com/calendar"
```

### Single Site (Legacy Compatible)
```bash
# .env file  
OPENAI_API_KEY="sk-your-key"
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/your-webhook"
TARGET_URL="https://your-site.com"
CSS_SELECTOR="main"
```

### Advanced Multi-Site (YAML Config)
Create `sites.yaml` for fine control over goals, keywords, and scheduling per site.

## Migration from Single-Site Version

**Zero effort migration** - your existing `.env` continues to work exactly as before!

### Upgrade Options

1. **Keep as-is**: Single site monitoring continues unchanged
2. **Add more sites**: Just add `WATCH_URLS="site1,site2,site3"` to your `.env`
3. **Advanced tuning**: Create `sites.yaml` for per-site customization

### What's New After Upgrade

- **Multi-site monitoring**: Monitor 5+ sites easily with comma-separated URLs
- **Smart site IDs**: Auto-generated from hostnames (e.g., `github.com` → `github-1`)
- **Randomized scheduling**: More natural 4-6 minute intervals per site
- **Enhanced notifications**: Richer Discord messages with site context
- **Better resource management**: Shared browser with concurrency limits

# Visual Watcher (Playwright + GPT + Discord)

A simple Visualping-style watcher that monitors web pages for changes and sends intelligent summaries to Discord.

## Features

- 🎭 **Playwright Integration**: Uses Chromium to load and monitor web pages
- 🤖 **GPT-powered Summaries**: Leverages OpenAI's GPT to create intelligent change summaries
- 📢 **Discord Notifications**: Sends change alerts directly to your Discord channel
- ⏰ **Configurable Intervals**: Set custom check intervals (default: 4 hours)
- 🎯 **CSS Selector Support**: Target specific page sections or fall back to `<main>`
- 💾 **Local Storage**: No database required - uses local JSON files for baselines

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
   
   Fill in your `.env` file with:
   - `TARGET_URL`: The webpage to monitor (required)
   - `OPENAI_API_KEY`: Your OpenAI API key (required)
   - `DISCORD_WEBHOOK_URL`: Your Discord webhook URL (required)
   - `CSS_SELECTOR`: CSS selector to monitor (optional, defaults to "main")
   - `CHECK_INTERVAL_MINUTES`: Check interval in minutes (optional, defaults to 240)
   - `WAIT_UNTIL`: Playwright wait condition (optional, defaults to "networkidle")
   - `HEADLESS`: Run browser in headless mode (optional, defaults to true)

3. **Run the Watcher**
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
| `TARGET_URL` | ✅ | - | URL to monitor for changes |
| `OPENAI_API_KEY` | ✅ | - | OpenAI API key for GPT summaries |
| `DISCORD_WEBHOOK_URL` | ✅ | - | Discord webhook for notifications |
| `CSS_SELECTOR` | ❌ | `main` | CSS selector to monitor |
| `CHECK_INTERVAL_MINUTES` | ❌ | `240` | Minutes between checks |
| `WAIT_UNTIL` | ❌ | `networkidle` | Playwright wait condition |
| `HEADLESS` | ❌ | `true` | Run browser headlessly |

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

1. **Initial Run**: Creates a baseline snapshot of the target page section
2. **Monitoring**: Periodically checks the page and compares content
3. **Change Detection**: Uses SHA256 hashing to detect meaningful changes
4. **AI Analysis**: When changes are detected, GPT analyzes the differences
5. **Notification**: Sends a formatted summary to your Discord channel

## Error Handling

- Network timeouts and browser errors are caught and reported to Discord
- Failed Discord webhooks are logged but don't stop the monitoring
- The watcher continues running even after errors, with automatic retries

## File Structure

```
visualwatch/
├── src/
│   └── index.ts          # Main application logic
├── .data/
│   └── baseline.json     # Stored page snapshots
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── env.example           # Environment template
└── README.md            # This file
```

## Cost Considerations

- Uses `gpt-4o-mini` for cost-effective summaries
- Truncates content to 6k characters to control API costs
- Only calls GPT when actual changes are detected

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

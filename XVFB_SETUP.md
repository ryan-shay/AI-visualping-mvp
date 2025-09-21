# Xvfb Setup for Visual Watcher

This document explains how to set up and use Xvfb (X Virtual Framebuffer) with Visual Watcher for improved scraping performance, especially for Tock reservation sites and other dynamic web applications.

## What is Xvfb?

Xvfb (X Virtual Framebuffer) is a display server that performs all graphical operations in virtual memory without showing any screen output. This allows you to run headfull browsers (with full GUI capabilities) on headless servers, which can significantly improve scraping performance for sites that rely heavily on JavaScript and dynamic content.

## Why Use Xvfb with Visual Watcher?

### Benefits for Tock Scrapers and Dynamic Sites

1. **Better JavaScript Execution**: Headfull browsers execute JavaScript more reliably than headless ones
2. **Improved Element Interaction**: Better handling of popups, modals, and dynamic content
3. **Enhanced Debugging**: Ability to take screenshots and inspect the actual rendered page
4. **Reduced Detection**: Some sites detect and block headless browsers
5. **Full Browser Features**: Access to all browser APIs and features

### When to Use Headfull Mode

- **Tock reservation sites** (exploretock.com)
- **Resy** (resy.com)
- **OpenTable** (opentable.com)
- **Pocket Concierge** (pocket-concierge.jp)
- Any site with complex JavaScript interactions
- Sites that show important content in popups or modals

## Installation

### Automatic Installation

Use the provided installation script:

```bash
# Make the script executable (if not already)
chmod +x install-xvfb.sh

# Run the installation script
./install-xvfb.sh

# Or use npm script
npm run install:xvfb
```

### Manual Installation

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install -y xvfb x11-utils xauth
```

#### CentOS/RHEL/Fedora
```bash
# CentOS/RHEL
sudo yum install -y xorg-x11-server-Xvfb xorg-x11-utils xauth

# Fedora
sudo dnf install -y xorg-x11-server-Xvfb xorg-x11-utils xauth
```

#### Arch Linux
```bash
sudo pacman -S xorg-server-xvfb xorg-xauth xorg-xdpyinfo
```

#### Alpine Linux
```bash
sudo apk add --no-cache xvfb xauth
```

#### macOS
```bash
brew install --cask xquartz
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Browser settings
PLAYWRIGHT_HEADLESS=false  # Enable headfull mode for better scraping

# Xvfb settings (optional - good defaults provided)
XVFB_ENABLED=true         # Auto-enable Xvfb when needed (default: true)
XVFB_DISPLAY=99          # Virtual display number (default: 99)
XVFB_WIDTH=1920          # Screen width (default: 1920)
XVFB_HEIGHT=1080         # Screen height (default: 1080)
XVFB_DEPTH=24            # Color depth (default: 24)
```

### Site-Specific Configuration

In your `sites.yaml`, you can enable headfull mode per site:

```yaml
sites:
  - id: tock-restaurant
    url: https://exploretock.com/restaurant-name
    headless: false  # Use headfull mode for better interaction
    selector: main
    watch_goal: "Monitor for available reservation slots"
    
  - id: regular-site
    url: https://example.com
    headless: true   # Use headless mode for simple sites
    selector: main
```

## How It Works

### Automatic Detection

Visual Watcher automatically:

1. **Detects headless environments** (no DISPLAY variable)
2. **Checks if Xvfb is available** on the system
3. **Starts Xvfb automatically** when headfull mode is requested
4. **Manages the virtual display lifecycle** (start/stop/cleanup)
5. **Falls back gracefully** if Xvfb is not available

### Process Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Request Browser │───▶│ Check Environment│───▶│ Start Xvfb?     │
│ (headless=false)│    │ & Configuration  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Launch Browser  │◀───│ Set DISPLAY var  │◀───│ Start Xvfb      │
│ with GUI        │    │ :99 (or config)  │    │ Virtual Display │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Testing

### Test Xvfb Installation

```bash
# Test the installation
npm run test:xvfb

# Or run directly
npm run build && node test-headless.js
```

### Manual Testing

```bash
# Start Xvfb manually
Xvfb :99 -screen 0 1920x1080x24 -ac &

# Test with a simple X client
DISPLAY=:99 xdpyinfo

# Stop Xvfb
pkill Xvfb
```

## Troubleshooting

### Common Issues

#### 1. "Xvfb is not installed"
```bash
# Install using the provided script
./install-xvfb.sh

# Or install manually for your OS (see Installation section)
```

#### 2. "Display :99 already in use"
```bash
# Check what's using the display
ps aux | grep Xvfb

# Kill existing Xvfb processes
pkill Xvfb

# Or change the display number in your config
XVFB_DISPLAY=100
```

#### 3. "Permission denied" errors
```bash
# Make sure you have permission to create lock files
ls -la /tmp/.X*-lock

# Clean up stale lock files if needed
sudo rm /tmp/.X99-lock
```

#### 4. Browser still fails to start
```bash
# Check if Xvfb is actually running
ps aux | grep Xvfb

# Test the display
DISPLAY=:99 xdpyinfo

# Check logs for more details
LOG_LEVEL=debug npm run dev
```

### Debug Mode

Enable debug logging to see Xvfb operations:

```bash
LOG_LEVEL=debug npm run dev
```

This will show:
- Xvfb startup/shutdown messages
- Display detection and configuration
- Browser launch details
- Error messages and troubleshooting hints

## Performance Considerations

### Resource Usage

- **Memory**: Xvfb uses minimal memory (~10-50MB)
- **CPU**: Negligible CPU overhead
- **Disk**: No disk usage beyond temporary files

### Optimization Tips

1. **Use appropriate resolution**: Don't use 4K if you don't need it
2. **Reuse displays**: The system automatically reuses existing displays
3. **Clean shutdown**: Always stop Xvfb properly to avoid lock files
4. **Monitor resources**: Use `htop` or similar to monitor system resources

## Production Deployment

### Docker

```dockerfile
# Install Xvfb in your Docker image
RUN apt-get update && apt-get install -y xvfb x11-utils && rm -rf /var/lib/apt/lists/*

# Your app will automatically use Xvfb when needed
ENV PLAYWRIGHT_HEADLESS=false
ENV XVFB_ENABLED=true
```

### Systemd Service

```ini
[Unit]
Description=Visual Watcher with Xvfb
After=network-online.target

[Service]
Type=simple
User=visualwatch
WorkingDirectory=/opt/visualwatch
Environment=PLAYWRIGHT_HEADLESS=false
Environment=XVFB_ENABLED=true
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Cloud Platforms

Most cloud platforms (AWS, GCP, Azure) support Xvfb:

```bash
# Install Xvfb during deployment
apt-get update && apt-get install -y xvfb

# Set environment variables
export PLAYWRIGHT_HEADLESS=false
export XVFB_ENABLED=true

# Run your application
npm start
```

## Advanced Configuration

### Custom Display Settings

```bash
# High resolution for detailed screenshots
XVFB_WIDTH=2560
XVFB_HEIGHT=1440
XVFB_DEPTH=32

# Multiple displays (advanced)
XVFB_DISPLAY=100  # Use display :100 instead of :99
```

### Integration with CI/CD

```yaml
# GitHub Actions example
- name: Install Xvfb
  run: sudo apt-get install -y xvfb

- name: Run tests with Xvfb
  run: |
    export PLAYWRIGHT_HEADLESS=false
    export XVFB_ENABLED=true
    npm test
```

## FAQ

**Q: Do I need Xvfb on my local development machine?**
A: No, Xvfb is only needed on headless servers. On your local machine with a display, headfull browsers work normally.

**Q: Will this work with other browsers besides Chromium?**
A: Yes, Xvfb works with any browser that supports X11 (Firefox, Chrome, etc.).

**Q: Can I run multiple scrapers simultaneously?**
A: Yes, the system automatically manages display allocation and can handle multiple concurrent browsers.

**Q: What happens if Xvfb fails to start?**
A: The system falls back to headless mode with a warning message. Your scraper will still work, just without the benefits of headfull mode.

**Q: How do I know if Xvfb is being used?**
A: Check the logs - you'll see messages like "🖥️ Xvfb virtual display ready: :99" when it starts.

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Run tests with `npm run test:xvfb`
3. Enable debug logging with `LOG_LEVEL=debug`
4. Check system resources and Xvfb processes
5. Review the installation script output for errors

The Xvfb integration is designed to work automatically and fail gracefully, so your scrapers should work whether or not Xvfb is available.


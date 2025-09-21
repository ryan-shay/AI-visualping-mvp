import { spawn, ChildProcess } from 'child_process';
import { log } from './logger.js';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export interface XvfbOptions {
  displayNum?: number;
  width?: number;
  height?: number;
  depth?: number;
  timeout?: number;
  silent?: boolean;
  reuse?: boolean;
}

export class XvfbManager {
  private process: ChildProcess | null = null;
  private displayNum: number;
  private width: number;
  private height: number;
  private depth: number;
  private timeout: number;
  private silent: boolean;
  private reuse: boolean;
  private isRunning: boolean = false;

  constructor(options: XvfbOptions = {}) {
    this.displayNum = options.displayNum || this.findAvailableDisplay();
    this.width = options.width || 1920;
    this.height = options.height || 1080;
    this.depth = options.depth || 24;
    this.timeout = options.timeout || 10000;
    this.silent = options.silent || false;
    this.reuse = options.reuse || false;
  }

  /**
   * Check if Xvfb is available on the system
   */
  static async isXvfbAvailable(): Promise<boolean> {
    try {
      await execAsync('which Xvfb');
      return true;
    } catch {
      try {
        // Try alternative path locations
        await execAsync('command -v Xvfb');
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Check if we're running in a headless environment (no DISPLAY)
   */
  static isHeadlessEnvironment(): boolean {
    return !process.env.DISPLAY && process.platform !== 'win32' && process.platform !== 'darwin';
  }

  /**
   * Check if Xvfb should be automatically used
   */
  static shouldUseXvfb(): boolean {
    // Use Xvfb if we're in a headless environment and it's available
    return this.isHeadlessEnvironment();
  }

  /**
   * Get installation instructions for Xvfb based on platform
   */
  static getInstallationInstructions(): string {
    const platform = process.platform;
    
    switch (platform) {
      case 'linux':
        // Detect Linux distribution
        try {
          const fs = require('fs');
          if (fs.existsSync('/etc/debian_version')) {
            return 'sudo apt-get update && sudo apt-get install -y xvfb';
          } else if (fs.existsSync('/etc/redhat-release')) {
            return 'sudo yum install -y xorg-x11-server-Xvfb || sudo dnf install -y xorg-x11-server-Xvfb';
          } else if (fs.existsSync('/etc/arch-release')) {
            return 'sudo pacman -S xorg-server-xvfb';
          }
        } catch (e) {
          // Fallback to generic
        }
        return 'Install Xvfb using your package manager (apt, yum, dnf, pacman, etc.)';
      
      case 'darwin':
        return 'brew install --cask xquartz';
      
      default:
        return 'Xvfb installation varies by platform. Please consult your system documentation.';
    }
  }

  /**
   * Find an available display number
   */
  private findAvailableDisplay(): number {
    // Start from display 99 and work up to avoid conflicts
    for (let i = 99; i < 200; i++) {
      try {
        const fs = require('fs');
        if (!fs.existsSync(`/tmp/.X${i}-lock`)) {
          return i;
        }
      } catch (e) {
        // Continue searching
      }
    }
    return 99; // Fallback
  }

  /**
   * Start Xvfb virtual display
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log('debug', `Xvfb display :${this.displayNum} is already running`);
      return;
    }

    // Check if Xvfb is available
    if (!(await XvfbManager.isXvfbAvailable())) {
      const instructions = XvfbManager.getInstallationInstructions();
      throw new Error(`Xvfb is not installed. Please install it first:\n${instructions}`);
    }

    // Check if display is already in use and reuse is enabled
    if (this.reuse && await this.isDisplayInUse()) {
      log('info', `Reusing existing display :${this.displayNum}`);
      process.env.DISPLAY = `:${this.displayNum}`;
      this.isRunning = true;
      return;
    }

    return new Promise((resolve, reject) => {
      const args = [
        `:${this.displayNum}`,
        '-screen', '0', `${this.width}x${this.height}x${this.depth}`,
        '-ac', // Disable access control
        '-nolisten', 'tcp', // Don't listen on TCP
        '+extension', 'GLX', // Enable GLX extension
        '+extension', 'RANDR', // Enable RANDR extension
        '-noreset' // Don't reset after last client exits
      ];

      if (!this.silent) {
        log('info', `Starting Xvfb on display :${this.displayNum} (${this.width}x${this.height}x${this.depth})`);
        log('debug', `Xvfb command: Xvfb ${args.join(' ')}`);
      }

      this.process = spawn('Xvfb', args, {
        stdio: this.silent ? 'ignore' : 'pipe',
        detached: false
      });

      let startupTimeout: NodeJS.Timeout;

      const onError = (error: Error) => {
        clearTimeout(startupTimeout);
        log('error', 'Failed to start Xvfb', { error: error.message });
        reject(new Error(`Failed to start Xvfb: ${error.message}`));
      };

      const onExit = (code: number | null, signal: string | null) => {
        clearTimeout(startupTimeout);
        this.isRunning = false;
        if (code !== null && code !== 0) {
          reject(new Error(`Xvfb exited with code ${code}`));
        } else if (signal) {
          reject(new Error(`Xvfb killed with signal ${signal}`));
        }
      };

      this.process.on('error', onError);
      this.process.on('exit', onExit);

      if (!this.silent && this.process.stderr) {
        this.process.stderr.on('data', (data) => {
          log('debug', `Xvfb stderr: ${data}`);
        });
      }

      // Wait for Xvfb to start up
      startupTimeout = setTimeout(async () => {
        try {
          // Test if display is working
          if (await this.isDisplayInUse()) {
            process.env.DISPLAY = `:${this.displayNum}`;
            this.isRunning = true;
            
            // Remove error handlers since we're successful
            this.process?.removeListener('error', onError);
            this.process?.removeListener('exit', onExit);
            
            // Add cleanup handlers
            this.setupCleanupHandlers();
            
            if (!this.silent) {
              log('info', `✅ Xvfb started successfully on display :${this.displayNum}`);
            }
            resolve();
          } else {
            reject(new Error('Xvfb started but display is not accessible'));
          }
        } catch (error) {
          reject(new Error(`Failed to verify Xvfb startup: ${error instanceof Error ? error.message : String(error)}`));
        }
      }, 2000); // Give Xvfb 2 seconds to start
    });
  }

  /**
   * Stop Xvfb virtual display
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.process) {
      log('info', `Stopping Xvfb display :${this.displayNum}`);
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) {
            log('warn', 'Xvfb did not terminate gracefully, forcing kill');
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        this.process!.on('exit', () => {
          clearTimeout(timeout);
          this.isRunning = false;
          this.process = null;
          
          // Clean up environment
          if (process.env.DISPLAY === `:${this.displayNum}`) {
            delete process.env.DISPLAY;
          }
          
          log('info', `Xvfb display :${this.displayNum} stopped`);
          resolve();
        });

        this.process!.kill('SIGTERM');
      });
    }

    this.isRunning = false;
  }

  /**
   * Check if a display is currently in use
   */
  private async isDisplayInUse(): Promise<boolean> {
    try {
      await execAsync(`xdpyinfo -display :${this.displayNum}`, { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   */
  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      await this.stop();
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);
    process.on('unhandledRejection', cleanup);
  }

  /**
   * Get the display string for this Xvfb instance
   */
  getDisplayString(): string {
    return `:${this.displayNum}`;
  }

  /**
   * Get current status
   */
  getStatus(): { running: boolean; display: string; resolution: string } {
    return {
      running: this.isRunning,
      display: this.getDisplayString(),
      resolution: `${this.width}x${this.height}x${this.depth}`
    };
  }
}

// Global Xvfb instance for shared use
let globalXvfb: XvfbManager | null = null;

/**
 * Get or create a global Xvfb instance
 */
export async function getGlobalXvfb(options: XvfbOptions = {}): Promise<XvfbManager | null> {
  // Load config to check if Xvfb is enabled
  const { loadGlobalConfig } = await import('./config.js');
  const config = loadGlobalConfig();
  
  // Only use Xvfb if enabled and we're in a headless environment
  if (!config.XVFB_ENABLED || !XvfbManager.shouldUseXvfb()) {
    return null;
  }

  if (!globalXvfb) {
    // Parse display number from string like ":99" -> 99
    const displayNum = parseInt(config.XVFB_DISPLAY.replace(':', ''), 10) || 99;
    
    globalXvfb = new XvfbManager({
      displayNum,
      width: config.XVFB_WIDTH,
      height: config.XVFB_HEIGHT,
      depth: config.XVFB_DEPTH,
      silent: true,
      reuse: true,
      ...options
    });
    
    try {
      await globalXvfb.start();
    } catch (error) {
      log('warn', 'Failed to start Xvfb, headfull mode may not work in headless environments', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      globalXvfb = null;
      return null;
    }
  }

  return globalXvfb;
}

/**
 * Stop the global Xvfb instance
 */
export async function stopGlobalXvfb(): Promise<void> {
  if (globalXvfb) {
    await globalXvfb.stop();
    globalXvfb = null;
  }
}

/**
 * Ensure Xvfb is running if needed for headfull mode
 */
export async function ensureXvfbForHeadfull(headless: boolean): Promise<void> {
  // Only start Xvfb if we're running in headfull mode and in a headless environment
  if (!headless && XvfbManager.shouldUseXvfb()) {
    const xvfb = await getGlobalXvfb();
    if (!xvfb) {
      log('warn', 'Running in headfull mode but Xvfb is not available. Browser may fail to start.');
      log('info', `To install Xvfb: ${XvfbManager.getInstallationInstructions()}`);
    } else {
      log('info', `🖥️  Xvfb virtual display ready: ${xvfb.getDisplayString()}`);
    }
  }
}


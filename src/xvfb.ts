import { spawn, ChildProcess } from 'child_process';
import { log } from './logger.js';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// Global Xvfb instance
let globalXvfb: ChildProcess | null = null;
let currentDisplay = ':99';

/**
 * Check if we're in a headless environment that needs Xvfb
 */
function shouldUseXvfb(): boolean {
  return !process.env.DISPLAY && process.platform !== 'win32' && process.platform !== 'darwin';
}

/**
 * Check if Xvfb is available on the system
 */
async function isXvfbAvailable(): Promise<boolean> {
  try {
    await execAsync('which Xvfb');
    return true;
  } catch {
    return false;
  }
}

/**
 * Start Xvfb if needed for headfull mode in headless environments
 */
export async function ensureXvfbForHeadfull(headless: boolean): Promise<void> {
  // Only start if running headfull in a headless environment
  if (headless || !shouldUseXvfb()) {
    return;
  }

  // Check if already running
  if (globalXvfb) {
    return;
  }

  // Check if Xvfb is available
  if (!(await isXvfbAvailable())) {
    log('warn', 'Xvfb not available. Install with: sudo apt-get install -y xvfb');
    return;
  }

  try {
    log('info', `🖥️  Starting Xvfb virtual display ${currentDisplay}`);
    
    globalXvfb = spawn('Xvfb', [
      currentDisplay,
      '-screen', '0', '1920x1080x24',
      '-ac',
      '-nolisten', 'tcp'
    ], {
      stdio: 'ignore',
      detached: false
    });

    // Set display environment variable
    process.env.DISPLAY = currentDisplay;

    // Wait a moment for Xvfb to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    log('info', `✅ Xvfb started on display ${currentDisplay}`);
    
  } catch (error) {
    log('warn', 'Failed to start Xvfb', { error });
    globalXvfb = null;
  }
}

/**
 * Stop the global Xvfb instance
 */
export async function stopGlobalXvfb(): Promise<void> {
  if (globalXvfb) {
    log('info', 'Stopping Xvfb');
    globalXvfb.kill('SIGTERM');
    globalXvfb = null;
    
    // Clean up environment
    if (process.env.DISPLAY === currentDisplay) {
      delete process.env.DISPLAY;
    }
  }
}


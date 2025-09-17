import { loadGlobalConfig } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

let currentLogLevel: LogLevel = 'info';

try {
  const config = loadGlobalConfig();
  currentLogLevel = config.LOG_LEVEL;
} catch {
  // Fallback if config can't be loaded
  currentLogLevel = 'info';
}

export function log(level: LogLevel, message: string, data?: any): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLogLevel]) {
    return;
  }

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  
  if (level === 'error') {
    console.error(logMessage);
  } else if (level === 'warn') {
    console.warn(logMessage);
  } else {
    console.log(logMessage);
  }
  
  if (data) {
    if (level === 'error') {
      console.error(JSON.stringify(data, null, 2));
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

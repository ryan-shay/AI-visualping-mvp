import { writeFile, readFile, mkdir, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { loadGlobalConfig } from './config.js';
import { log } from './logger.js';

export type Baseline = {
  hash: string;
  text: string;
  lastCheckedISO: string;
};

let dataDir: string;

try {
  const config = loadGlobalConfig();
  dataDir = config.DATA_DIR;
} catch {
  dataDir = '.data';
}

const baselinesDir = join(dataDir, 'baselines');

export async function ensureDataDir(): Promise<void> {
  try {
    await access(dataDir, constants.F_OK);
  } catch {
    log('info', `Creating data directory: ${dataDir}`);
    await mkdir(dataDir, { recursive: true });
  }
  
  try {
    await access(baselinesDir, constants.F_OK);
  } catch {
    log('info', `Creating baselines directory: ${baselinesDir}`);
    await mkdir(baselinesDir, { recursive: true });
  }
}

export async function readBaseline(siteId: string): Promise<Baseline | null> {
  const baselinePath = join(baselinesDir, `${siteId}.json`);
  
  try {
    const content = await readFile(baselinePath, 'utf8');
    const baseline = JSON.parse(content);
    log('debug', `Loaded baseline for site: ${siteId}`, { 
      hash: baseline.hash, 
      lastChecked: baseline.lastCheckedISO 
    });
    return baseline;
  } catch (err) {
    log('debug', `No baseline found for site: ${siteId}`);
    return null;
  }
}

export async function writeBaseline(siteId: string, baseline: Baseline): Promise<void> {
  await ensureDataDir();
  
  const baselinePath = join(baselinesDir, `${siteId}.json`);
  await writeFile(baselinePath, JSON.stringify(baseline, null, 2), 'utf8');
  
  log('debug', `Saved baseline for site: ${siteId}`, { 
    hash: baseline.hash, 
    lastChecked: baseline.lastCheckedISO 
  });
}

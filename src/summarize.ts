import { OpenAI } from 'openai';
import { SiteConfig, loadGlobalConfig } from './config.js';
import { log } from './logger.js';

let openai: OpenAI;

try {
  const config = loadGlobalConfig();
  openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
} catch (err) {
  // Will be initialized later when actually needed
}

export async function summarizeGoalAware(
  oldText: string,
  newText: string,
  site: SiteConfig
): Promise<string> {
  if (!openai) {
    const config = loadGlobalConfig();
    openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  
  log('info', `📝 ${site.id}: Generating GPT summary (${oldText.length} → ${newText.length} chars)`);
  
  const systemPrompt = `You compare two versions of a web section and write a terse, bullet-point summary of meaningful changes. Focus on availability, timeslots, prices, deposits, and booking status. If no meaningful change, say 'No material change.'`;

  const userPrompt = `Target URL: ${site.url}
Watching Goal: ${site.watch_goal || 'Monitor for changes'}
Date of Interest: ${site.goal_date || 'Not specified'}
Party Size: ${site.goal_party_size || 'Not specified'}

Old version (truncated to 6k chars):
${oldText.slice(0, 6000)}

New version (truncated to 6k chars):
${newText.slice(0, 6000)}

Write 3-6 bullets focusing on availability, dates, times, prices, or status changes. Include specific numbers or times if visible. Pay special attention to the date and party size mentioned in the goal.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const summary = response.choices[0]?.message?.content?.trim() || 'Change detected.';
    
    log('info', `📋 ${site.id}: Summary generated (${summary.length} chars)`);
    
    return summary;
  } catch (error) {
    log('error', `Error generating summary for site: ${site.id}`, { error });
    return `Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

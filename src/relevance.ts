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

export type HeuristicResult = {
  hit: boolean;
  detail: string;
};

export type RelevanceResult = {
  relevant: boolean;
  reason: string;
};

export function checkHeuristic(text: string, site: SiteConfig): HeuristicResult {
  const lowerText = text.toLowerCase();
  
  // Check for positive keywords
  const positiveHits = (site.goal_keywords || []).filter(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
  
  // Check for negative hints
  const negativeHits = (site.goal_negative_hints || []).filter(hint => 
    lowerText.includes(hint.toLowerCase())
  );
  
  // Check for goal date if specified
  let dateCheck = true;
  if (site.goal_date) {
    const isoDate = site.goal_date; // e.g., "2025-10-21"
    const condensedDate = site.goal_date.replace(/-/g, ''); // e.g., "20251021"
    
    dateCheck = lowerText.includes(isoDate) || lowerText.includes(condensedDate);
  }
  
  const hasPositive = positiveHits.length > 0;
  const hasNegative = negativeHits.length > 0;
  
  const hit = hasPositive && !hasNegative && dateCheck;
  
  const details = [];
  if (hasPositive) details.push(`positive: ${positiveHits.join(', ')}`);
  if (hasNegative) details.push(`negative: ${negativeHits.join(', ')}`);
  if (!dateCheck) details.push(`date not found: ${site.goal_date}`);
  
  return {
    hit,
    detail: details.length > 0 ? details.join('; ') : 'no specific indicators'
  };
}

export async function classifyRelevance(
  oldText: string, 
  newText: string, 
  site: SiteConfig
): Promise<RelevanceResult> {
  if (!openai) {
    const config = loadGlobalConfig();
    openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  
  log('info', `🤖 ${site.id}: Running GPT relevance classifier`);
  
  const systemPrompt = `You are a change relevance classifier. Analyze the differences between two versions of a webpage and determine if the changes are relevant to the user's watching goal.

Return ONLY valid JSON in this exact format:
{"relevant": boolean, "reason": "brief explanation"}

Be strict: only return true if the changes directly relate to the goal.`;

  const userPrompt = `Goal: ${site.watch_goal || 'Monitor for changes'}
Date of interest: ${site.goal_date || 'Not specified'}
Party size: ${site.goal_party_size || 'Not specified'}

Old version (truncated to 6k chars):
${oldText.slice(0, 6000)}

New version (truncated to 6k chars):
${newText.slice(0, 6000)}

Analyze the differences and determine relevance to the goal.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Empty response from GPT');
    }

    const result: RelevanceResult = JSON.parse(content);
    
    // Validate the response structure
    if (typeof result.relevant !== 'boolean' || typeof result.reason !== 'string') {
      throw new Error('Invalid response format from GPT');
    }

    log('info', `🎯 ${site.id}: GPT relevance → ${result.relevant ? '✅ RELEVANT' : '❌ NOT RELEVANT'} (${result.reason})`);

    return result;
  } catch (error) {
    log('error', `Error in GPT relevance classification for site: ${site.id}`, { error });
    
    // Fallback to considering it relevant to avoid missing important changes
    return {
      relevant: true,
      reason: `Classification error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

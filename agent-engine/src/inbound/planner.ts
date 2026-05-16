/**
 * Lightweight tool planner.
 *
 * Runs only on messages that look complex (heuristic gate), at which point
 * a single Flash-Lite call (~$0.0001) maps the message to the subset of
 * tool names that are likely needed. We then surface that subset to the
 * brain as a "PROBABLY-NEEDED TOOLS" hint — Gemini Flash still decides on
 * its own, but with a sharper prior, which cuts wrong-tool firings and
 * shortens the function-calling loop.
 *
 * The planner is intentionally not authoritative: it cannot prevent any
 * tool call. The brain may still ignore the hint when context dictates.
 */
import { generateObject } from 'ai';
import { z } from 'zod';
import { models } from '../lib/gemini.js';
import { logger } from '../lib/logger.js';

const PlanSchema = z.object({
  needed_tools: z.array(z.string()),
  reasoning: z.string(),
});

/** Returns a hint string to inject into the system prompt, or '' to skip. */
export async function planTools(
  message: string,
  availableToolNames: string[],
): Promise<string> {
  if (!shouldPlan(message)) return '';
  if (availableToolNames.length === 0) return '';

  const prompt = `You are choosing which of the available tools an AI WhatsApp agent will need to handle the following customer message. Be conservative: include a tool ONLY if it is clearly needed.

CUSTOMER MESSAGE:
"${message.slice(0, 600)}"

AVAILABLE TOOLS:
${availableToolNames.map((n) => `- ${n}`).join('\n')}

Return needed_tools as a subset of the above (use exact names). Add a one-sentence reasoning.`;

  try {
    const { object } = await generateObject({
      model: models.classifier,
      schema: PlanSchema,
      prompt,
      temperature: 0,
      maxRetries: 1,
    });
    const valid = object.needed_tools.filter((n) => availableToolNames.includes(n));
    if (valid.length === 0) return '';
    return `\n\n# TOOL PLAN (advisory)\nA planner pre-pass suggests these tools will be useful: ${valid.join(', ')}.\nReason: ${object.reasoning}\nYou may still ignore this if the message context warrants — it is a prior, not a constraint.`;
  } catch (err) {
    logger.warn({ err }, 'tool planner: classifier failed (continuing without plan)');
    return '';
  }
}

/**
 * Cheap heuristic: only invoke the planner on messages that look complex.
 * Skip short greetings, single-question pings, etc.
 */
function shouldPlan(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 30) return false;
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 8) return false;
  // multiple sentences OR multiple verbs OR explicit "and" connecting clauses
  const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length >= 2) return true;
  if (/\b(and|then|also|plus)\b/i.test(trimmed) && wordCount >= 12) return true;
  return false;
}

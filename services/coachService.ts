// coachService.ts — Claude API integration for SBL Coach
// API key MUST be provided via EXPO_PUBLIC_ANTHROPIC_API_KEY env var — never hardcode it

import type { CoachMessage, CheckIn, UserProfile, WorkoutLog } from '../types';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

export async function sendCoachMessage(
  userMessage: string,
  history: CoachMessage[],
  userProfile: UserProfile | null,
  latestCheckIn: CheckIn | null,
  recentWorkouts: WorkoutLog[],
): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error('AI Coach requires EXPO_PUBLIC_ANTHROPIC_API_KEY — add it to your .env file');
  }

  const systemPrompt = buildSystemPrompt(userProfile, latestCheckIn, recentWorkouts);

  // Use last 10 messages for context
  const messages = [
    ...history.slice(-10).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  const res = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Coach API error ${res.status}: ${err}`);
  }

  const data = await res.json() as { content: { text: string }[] };
  return data.content[0].text;
}

function buildSystemPrompt(
  userProfile: UserProfile | null,
  latestCheckIn: CheckIn | null,
  recentWorkouts: WorkoutLog[],
): string {
  const lines = [
    'You are SBL Coach — a science-backed fitness AI for Indian gym-goers.',
    'Keep responses under 150 words unless the user explicitly asks for more detail.',
    'Be direct, evidence-based, and cite research when relevant (e.g. Helms et al. 2014).',
    'Never recommend steroids, extreme caloric restriction, or unsupported supplements.',
  ];

  if (userProfile) {
    lines.push(
      `User: ${userProfile.weight}kg, ${userProfile.height}cm, age ${userProfile.age},` +
      ` goal: ${userProfile.goal}, training age: ${userProfile.trainingAge}, diet: ${userProfile.dietType}.`,
    );
  }

  if (latestCheckIn) {
    const s = latestCheckIn.scores;
    lines.push(
      `Latest check-in (${latestCheckIn.date}): Energy ${s.energy}/10, Recovery ${s.recovery}/10,` +
      ` Hunger ${s.hunger}/10, Motivation ${s.motivation}/10, Sleep ${s.sleep}/10, Gym performance ${s.gymPerformance}/10.`,
    );
  }

  if (recentWorkouts.length > 0) {
    lines.push(`User has completed ${recentWorkouts.length} total workouts.`);
  }

  return lines.join(' ');
}

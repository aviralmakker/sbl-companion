import type { CheckIn } from '../types';

export type InsightType = 'recovery' | 'sleep' | 'peak' | 'no_checkin';

export interface CoachInsight {
  type: InsightType;
  message: string;
  cta: string;
}

export function getProactiveInsight(
  latestCheckIn: CheckIn | null,
  currentWeek: string,
): CoachInsight | null {
  if (!latestCheckIn || latestCheckIn.week !== currentWeek) {
    return {
      type: 'no_checkin',
      message: 'Complete your weekly check-in to unlock a personalised game plan.',
      cta: 'Take Check-In',
    };
  }

  const { recovery, sleep } = latestCheckIn.scores;

  if (recovery <= 4) {
    return {
      type: 'recovery',
      message: `Recovery is low (${recovery}/10). Consider a deload or extra sleep — poor recovery cuts MPS by up to 24% (Dattilo et al. 2011).`,
      cta: 'Ask Coach',
    };
  }

  if (sleep <= 4) {
    return {
      type: 'sleep',
      message: `Sleep quality is low (${sleep}/10). Short sleep blunts protein synthesis and spikes cortisol (Leproult & Van Cauter 2011).`,
      cta: 'Ask Coach',
    };
  }

  const allScores = Object.values(latestCheckIn.scores);
  if (allScores.every((s) => s >= 8)) {
    return {
      type: 'peak',
      message: "All systems green — you're primed for a PR session. Push hard today.",
      cta: 'View Plan',
    };
  }

  return null;
}

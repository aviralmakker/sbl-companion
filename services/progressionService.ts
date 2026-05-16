import type { WorkoutLog, TrainingDay } from '../types';
import { exerciseLibrary } from '../data/exercises';

export interface ProgressionStatus {
  shouldIncrease: boolean;
  currentWeight: number;
  nextWeight: number;
  lastReps: number[];
  repRangeLow: number;
  repRangeHigh: number;
  targetSets: number;
}

// Double progression: when ALL sets across the last session hit the top of the rep range,
// flag the exercise for a weight increase next session.
// TODO: Supabase — replace local log scan with query on exercise_sets table per user
export function getProgressionStatus(
  exerciseId: string,
  workoutLogs: WorkoutLog[],
  day: TrainingDay,
  currentWeight: number,
): ProgressionStatus {
  const ex = exerciseLibrary.find((e) => e.id === exerciseId);
  const repRangeLow = ex?.repRangeLow ?? 8;
  const repRangeHigh = ex?.repRangeHigh ?? 12;
  const weightIncrement = ex?.weightIncrement ?? 2.5;
  const sessionEx = day.exercises.find((e) => e.exerciseId === exerciseId);
  const targetSets = sessionEx?.sets ?? 3;

  // Find the most recent log that contains this exercise
  const sortedLogs = [...workoutLogs]
    .filter((l) => l.dayIndex === day.exercises.findIndex((e) => e.exerciseId === exerciseId) || Object.keys(l.sets).includes(exerciseId))
    .sort((a, b) => b.date.localeCompare(a.date));

  const lastLog = sortedLogs.find((l) => l.sets[exerciseId] && l.sets[exerciseId].length > 0);
  if (!lastLog) {
    return { shouldIncrease: false, currentWeight, nextWeight: currentWeight + weightIncrement, lastReps: [], repRangeLow, repRangeHigh, targetSets };
  }

  const lastSets = lastLog.sets[exerciseId];
  const lastReps = lastSets.map((s) => s.reps);

  // All working sets (non-warmup, i.e. >= targetSets) hit the top of the range
  const workingSets = lastSets.slice(-targetSets);
  const allHitTop = workingSets.length >= targetSets && workingSets.every((s) => s.reps >= repRangeHigh);

  return {
    shouldIncrease: allHitTop,
    currentWeight,
    nextWeight: currentWeight + weightIncrement,
    lastReps,
    repRangeLow,
    repRangeHigh,
    targetSets,
  };
}

// Check progression for all exercises in a day — used to show ↑ chips on routine cards
export function getDayProgressionFlags(
  day: TrainingDay,
  workoutLogs: WorkoutLog[],
  exerciseProgress: Record<string, { currentWeight: number; lastReps: number[] }>,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  day.exercises.forEach(({ exerciseId }) => {
    const currentWeight = exerciseProgress[exerciseId]?.currentWeight ?? 0;
    const status = getProgressionStatus(exerciseId, workoutLogs, day, currentWeight);
    result[exerciseId] = status.shouldIncrease;
  });
  return result;
}

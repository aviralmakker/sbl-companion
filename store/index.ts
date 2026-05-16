import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  UserProfile,
  TrainingProgram,
  TrainingDay,
  ActiveSession,
  WorkoutLog,
  FoodLog,
  FoodSection,
  MealEntry,
  FoodItem,
  MealSlot,
  SetLog,
  ExerciseProgress,
  Macros,
  MorningWeight,
  SavedMeal,
  CheckIn,
  ProgressEntry,
  HydrationLog,
  CoachMessage,
  CustomProgram,
} from '../types';

const DEFAULT_FOOD_SECTIONS: FoodSection[] = [
  { id: 'breakfast',    label: 'Breakfast' },
  { id: 'pre_workout',  label: 'Pre-Workout Meal' },
  { id: 'post_workout', label: 'Post-Workout Meal' },
  { id: 'dinner',       label: 'Dinner' },
];
import { STORAGE_KEYS } from '../constants/storageKeys';
import { generateProgram, getTrainingDayIndex } from '../utils/programGenerator';
import { scaleMacros, scaleMicronutrients, scaleFatBreakdown } from '../utils/macroCalculator';
import { exerciseLibrary } from '../data/exercises';
import { submitScore } from '../services/leaderboardService';

interface SBLState {
  userProfile: UserProfile | null;
  currentProgram: TrainingProgram | null;
  completedSessionCount: number;
  currentSession: ActiveSession | null;
  workoutLogs: WorkoutLog[];
  foodLogs: FoodLog[];
  foodSections: FoodSection[];
  exerciseProgress: Record<string, ExerciseProgress>;
  morningWeights: MorningWeight[];
  savedMeals: SavedMeal[];
  bestEst1RMs: Record<string, number>;
  checkIns: CheckIn[];
  dismissedCheckInWeek: string | null;
  progressEntries: ProgressEntry[];
  hydration: HydrationLog[];
  coachHistory: CoachMessage[];
  customPrograms: CustomProgram[];

  completeOnboarding: (profile: UserProfile) => void;
  resetApp: () => void;
  addMorningWeight: (date: string, weight: number) => void;
  addFoodSection: (label: string) => void;
  renameFoodSection: (id: string, label: string) => void;
  deleteFoodSection: (id: string) => void;
  startSession: () => void;
  startSessionWithDay: (dayIndex: number) => void;
  logSet: (exerciseId: string, set: SetLog) => void;
  removeSet: (exerciseId: string, setIndex: number) => void;
  completeSession: () => void;
  abandonSession: () => void;
  logFood: (food: FoodItem, grams: number, slot: string) => void;
  removeFoodEntry: (date: string, entryId: string) => void;
  updateMacros: (macros: Macros) => void;
  updateProgramDays: (days: TrainingDay[]) => void;
  saveMeal: (name: string, entries: { food: FoodItem; grams: number }[]) => void;
  deleteSavedMeal: (id: string) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  saveCheckIn: (checkIn: CheckIn) => void;
  dismissCheckIn: (week: string) => void;
  addProgressEntry: (entry: ProgressEntry) => void;
  deleteProgressEntry: (id: string) => void;
  logHydration: (date: string, glasses: number, goalGlasses?: number) => void;
  addCoachMessage: (msg: CoachMessage) => void;
  clearCoachHistory: () => void;
  saveCustomProgram: (program: CustomProgram) => void;
  updateCustomProgram: (program: CustomProgram) => void;
  deleteCustomProgram: (id: string) => void;
  duplicateCustomProgram: (id: string) => void;
}

const todayKey = () => new Date().toISOString().split('T')[0];

export const useStore = create<SBLState>()(
  persist(
    (set, get) => ({
      userProfile: null,
      currentProgram: null,
      completedSessionCount: 0,
      currentSession: null,
      workoutLogs: [],
      foodLogs: [],
      foodSections: DEFAULT_FOOD_SECTIONS,
      exerciseProgress: {},
      morningWeights: [],
      savedMeals: [],
      bestEst1RMs: {},
      checkIns: [],
      dismissedCheckInWeek: null,
      progressEntries: [],
      hydration: [],
      coachHistory: [],
      customPrograms: [],

      completeOnboarding: (profile) => {
        const program = generateProgram(profile);
        const progress: Record<string, ExerciseProgress> = {};
        program.days.forEach((day) => {
          day.exercises.forEach(({ exerciseId }) => {
            if (!progress[exerciseId]) {
              const ex = exerciseLibrary.find((e) => e.id === exerciseId);
              progress[exerciseId] = {
                currentWeight: ex?.defaultWeight ?? 0,
                lastReps: [],
              };
            }
          });
        });
        set({ userProfile: profile, currentProgram: program, exerciseProgress: progress });
      },

      resetApp: () =>
        set({
          userProfile: null,
          currentProgram: null,
          completedSessionCount: 0,
          currentSession: null,
          workoutLogs: [],
          foodLogs: [],
          foodSections: DEFAULT_FOOD_SECTIONS,
          exerciseProgress: {},
          morningWeights: [],
          savedMeals: [],
          bestEst1RMs: {},
          checkIns: [],
          dismissedCheckInWeek: null,
          progressEntries: [],
          hydration: [],
          coachHistory: [],
          customPrograms: [],
        }),

      addFoodSection: (label) => {
        const id = `section_${Date.now()}`;
        set({ foodSections: [...get().foodSections, { id, label }] });
      },
      renameFoodSection: (id, label) =>
        set({ foodSections: get().foodSections.map((s) => (s.id === id ? { ...s, label } : s)) }),
      deleteFoodSection: (id) =>
        set({ foodSections: get().foodSections.filter((s) => s.id !== id) }),

      addMorningWeight: (date, weight) => {
        const weights = get().morningWeights.filter((w) => w.date !== date);
        set({ morningWeights: [...weights, { date, weight }] });
      },

      startSession: () => {
        const { currentProgram, completedSessionCount } = get();
        if (!currentProgram) return;
        const dayIndex = getTrainingDayIndex(currentProgram.days, completedSessionCount);
        set({
          currentSession: {
            dayIndex,
            startTime: new Date().toISOString(),
            sets: {},
            completed: false,
          },
        });
      },

      startSessionWithDay: (dayIndex) => {
        set({
          currentSession: {
            dayIndex,
            startTime: new Date().toISOString(),
            sets: {},
            completed: false,
          },
        });
      },

      logSet: (exerciseId, setData) => {
        const session = get().currentSession;
        if (!session) return;
        const existing = session.sets[exerciseId] ?? [];
        set({
          currentSession: {
            ...session,
            sets: { ...session.sets, [exerciseId]: [...existing, setData] },
          },
        });
      },

      removeSet: (exerciseId, setIndex) => {
        const session = get().currentSession;
        if (!session) return;
        const existing = session.sets[exerciseId] ?? [];
        set({
          currentSession: {
            ...session,
            sets: {
              ...session.sets,
              [exerciseId]: existing.filter((_, i) => i !== setIndex),
            },
          },
        });
      },

      completeSession: () => {
        const { currentSession, workoutLogs, exerciseProgress, completedSessionCount, currentProgram, userProfile, bestEst1RMs } = get();
        if (!currentSession || !currentProgram) return;

        const updatedProgress = { ...exerciseProgress };
        const day = currentProgram.days[currentSession.dayIndex];

        day.exercises.forEach(({ exerciseId, sets: targetSets }) => {
          const loggedSets = currentSession.sets[exerciseId] ?? [];
          if (loggedSets.length === 0) return;

          const ex = exerciseLibrary.find((e) => e.id === exerciseId);
          if (!ex) return;

          const prev = updatedProgress[exerciseId] ?? { currentWeight: ex.defaultWeight, lastReps: [] };
          const lastReps = loggedSets.map((s) => s.reps);
          const allAboveMax =
            loggedSets.length >= targetSets && lastReps.every((r) => r >= ex.repRangeHigh);

          updatedProgress[exerciseId] = {
            currentWeight: allAboveMax
              ? prev.currentWeight + ex.weightIncrement
              : prev.currentWeight,
            lastReps,
          };
        });

        // ── 1RM auto-recalculation + leaderboard auto-submit ──────────────
        const updatedBest1RMs = { ...bestEst1RMs };
        for (const [exerciseId, sets] of Object.entries(currentSession.sets)) {
          if (sets.length === 0) continue;
          const newBest = Math.max(...sets.map((s) => s.weight * (1 + s.reps / 30)));
          const prev = updatedBest1RMs[exerciseId] ?? 0;
          if (newBest > prev) {
            updatedBest1RMs[exerciseId] = newBest;
            // Auto-submit improved 1RM to leaderboard
            if (userProfile) {
              submitScore(
                exerciseId,
                Math.round(newBest),
                userProfile.name || 'Athlete',
                userProfile.username || 'athlete',
                userProfile.weight,
              );
            }
          }
        }

        const log: WorkoutLog = {
          date: new Date().toISOString(),
          dayIndex: currentSession.dayIndex,
          sets: currentSession.sets,
        };

        set({
          workoutLogs: [...workoutLogs, log],
          currentSession: null,
          completedSessionCount: completedSessionCount + 1,
          exerciseProgress: updatedProgress,
          bestEst1RMs: updatedBest1RMs,
        });
      },

      abandonSession: () => set({ currentSession: null }),

      updateMacros: (macros) => {
        const prog = get().currentProgram;
        if (!prog) return;
        set({ currentProgram: { ...prog, macros } });
      },

      updateProgramDays: (days) => {
        const { currentProgram, exerciseProgress } = get();
        if (!currentProgram) return;
        const updated = { ...exerciseProgress };
        days.forEach((day) => {
          day.exercises.forEach(({ exerciseId }) => {
            if (!updated[exerciseId]) {
              const ex = exerciseLibrary.find((e) => e.id === exerciseId);
              updated[exerciseId] = { currentWeight: ex?.defaultWeight ?? 0, lastReps: [] };
            }
          });
        });
        set({ currentProgram: { ...currentProgram, days }, exerciseProgress: updated });
      },

      logFood: (food, grams, slot) => {
        const today = todayKey();
        const macros = scaleMacros(food.per100g, grams);
        const micronutrients = food.micronutrients
          ? scaleMicronutrients(food.micronutrients, grams)
          : undefined;
        const fatBreakdown = food.fatBreakdown
          ? scaleFatBreakdown(food.fatBreakdown, grams)
          : undefined;
        const entry: MealEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          food,
          grams,
          slot,
          macros,
          micronutrients,
          fatBreakdown,
        };

        const foodLogs = [...get().foodLogs];
        const idx = foodLogs.findIndex((l) => l.date === today);
        if (idx >= 0) {
          foodLogs[idx] = { ...foodLogs[idx], meals: [...foodLogs[idx].meals, entry] };
        } else {
          foodLogs.push({ date: today, meals: [entry] });
        }
        set({ foodLogs });
      },

      removeFoodEntry: (date, entryId) => {
        const foodLogs = get().foodLogs.map((log) => {
          if (log.date !== date) return log;
          return { ...log, meals: log.meals.filter((m) => m.id !== entryId) };
        });
        set({ foodLogs });
      },

      saveMeal: (name, entries) => {
        const total = entries.reduce(
          (acc, { food, grams }) => {
            const m = grams / 100;
            return {
              calories: acc.calories + food.per100g.calories * m,
              protein:  acc.protein  + food.per100g.protein  * m,
              carbs:    acc.carbs    + food.per100g.carbs     * m,
              fat:      acc.fat      + food.per100g.fat       * m,
            };
          },
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        );
        const meal: SavedMeal = {
          id: `meal_${Date.now()}`,
          name,
          entries,
          totalMacros: {
            calories: Math.round(total.calories),
            protein:  Math.round(total.protein * 10) / 10,
            carbs:    Math.round(total.carbs   * 10) / 10,
            fat:      Math.round(total.fat     * 10) / 10,
          },
        };
        set({ savedMeals: [...get().savedMeals, meal] });
      },

      deleteSavedMeal: (id) =>
        set({ savedMeals: get().savedMeals.filter((m) => m.id !== id) }),

      updateProfile: (updates) => {
        const profile = get().userProfile;
        if (!profile) return;
        set({ userProfile: { ...profile, ...updates } });
      },

      saveCheckIn: (checkIn) => {
        // TODO: Supabase — upsert to check_ins table on conflict week
        const existing = get().checkIns.filter((c) => c.week !== checkIn.week);
        set({ checkIns: [...existing, checkIn] });
      },

      dismissCheckIn: (week) => {
        // TODO: Supabase — store dismissed week per user
        set({ dismissedCheckInWeek: week });
      },

      addProgressEntry: (entry) => {
        // TODO: Supabase — insert into progress_entries; store photoUri via native storage
        set({ progressEntries: [...get().progressEntries, entry] });
      },

      deleteProgressEntry: (id) => {
        set({ progressEntries: get().progressEntries.filter((e) => e.id !== id) });
      },

      logHydration: (date, glasses, goalGlasses = 12) => {
        // TODO: Supabase — upsert hydration_logs on conflict date
        const existing = get().hydration.filter((h) => h.date !== date);
        set({ hydration: [...existing, { date, glasses, goalGlasses }] });
      },

      addCoachMessage: (msg) => {
        // TODO: Supabase — append to coach_history, keep last 50
        const history = [...get().coachHistory, msg].slice(-50);
        set({ coachHistory: history });
      },

      clearCoachHistory: () => set({ coachHistory: [] }),

      saveCustomProgram: (program) => {
        // TODO: Supabase — upsert to custom_programs table
        const existing = get().customPrograms.filter((p) => p.id !== program.id);
        set({ customPrograms: [...existing, program] });
        get().updateProgramDays(program.days_data);
      },

      updateCustomProgram: (program) => {
        // TODO: Supabase — upsert to custom_programs table
        set({ customPrograms: get().customPrograms.map((p) => p.id === program.id ? program : p) });
        get().updateProgramDays(program.days_data);
      },

      deleteCustomProgram: (id) => {
        // TODO: Supabase — delete from custom_programs
        set({ customPrograms: get().customPrograms.filter((p) => p.id !== id) });
      },

      duplicateCustomProgram: (id) => {
        const original = get().customPrograms.find((p) => p.id === id);
        if (!original) return;
        const copy: CustomProgram = {
          ...original,
          id: `custom_${Date.now()}`,
          name: `${original.name} (Copy)`,
          createdAt: new Date().toISOString(),
        };
        // TODO: Supabase — insert copy into custom_programs
        set({ customPrograms: [...get().customPrograms, copy] });
      },
    }),
    {
      name: STORAGE_KEYS.FITOS_MAIN,
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ─── Selectors ────────────────────────────────────────────
export function useTodayFoodLog(): FoodLog | undefined {
  return useStore((s) => s.foodLogs.find((l) => l.date === todayKey()));
}

export function useTodayWorkoutLog(): WorkoutLog | undefined {
  return useStore((s) => s.workoutLogs.find((l) => l.date.startsWith(todayKey())));
}

export function useTodayHydration() {
  const todayKey = new Date().toISOString().split('T')[0];
  // Return null (stable primitive) when no entry exists — never return inline objects from selectors
  return useStore((s) => s.hydration.find((h) => h.date === todayKey) ?? null);
}

export function useLatestCheckIn() {
  return useStore((s) => {
    const sorted = [...s.checkIns].sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0] ?? null;
  });
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Training 40 + Protein 25 + Carbs 10 + Fat 10 + Check-In 15 = 100
export function useOptimisationScore(): number {
  const program = useStore((s) => s.currentProgram);
  const checkIns = useStore((s) => s.checkIns);
  const todayFood = useTodayFoodLog();
  const todayWorkout = useTodayWorkoutLog();

  if (!program) return 0;
  let score = 0;

  if (todayWorkout) score += 40;

  if (todayFood) {
    const logged = todayFood.meals.reduce(
      (acc, m) => ({
        protein: acc.protein + m.macros.protein,
        carbs: acc.carbs + m.macros.carbs,
        fat: acc.fat + m.macros.fat,
      }),
      { protein: 0, carbs: 0, fat: 0 }
    );
    const { protein, carbs, fat } = program.macros;
    score += Math.round(Math.min(logged.protein / protein, 1) * 25);
    score += Math.round(Math.min(logged.carbs / carbs, 1) * 10);
    score += Math.round(Math.min(logged.fat / fat, 1) * 10);
  }

  const currentWeek = getISOWeek(new Date());
  if (checkIns.some((c) => c.week === currentWeek)) score += 15;

  return Math.min(score, 100);
}

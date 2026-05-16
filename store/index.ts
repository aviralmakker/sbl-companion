import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  UserProfile, TrainingProgram, TrainingDay, ActiveSession, WorkoutLog,
  FoodLog, FoodSection, MealEntry, FoodItem, MealSlot, SetLog,
  ExerciseProgress, Macros, MorningWeight, SavedMeal, CheckIn,
  ProgressEntry, HydrationLog, CoachMessage, CustomProgram,
} from '../types';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { generateProgram, getTrainingDayIndex } from '../utils/programGenerator';
import { scaleMacros, scaleMicronutrients, scaleFatBreakdown } from '../utils/macroCalculator';
import { exerciseLibrary } from '../data/exercises';
import { submitScore } from '../services/leaderboardService';
import {
  syncProfileData, syncWorkoutLog, syncFoodLog, syncMorningWeight,
  syncCheckIn, syncProgressEntry, deleteProgressEntryRemote,
  syncHydration, syncCoachMessage, clearCoachMessagesRemote,
  type RemoteUserData,
} from '../services/syncService';

const DEFAULT_FOOD_SECTIONS: FoodSection[] = [
  { id: 'breakfast',    label: 'Breakfast' },
  { id: 'pre_workout',  label: 'Pre-Workout Meal' },
  { id: 'post_workout', label: 'Post-Workout Meal' },
  { id: 'dinner',       label: 'Dinner' },
];

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

  hydrateFromRemote: (data: RemoteUserData) => void;
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

// Helper: build the profile sync payload from current state
function profilePayload(s: SBLState) {
  if (!s.userProfile) return null;
  return {
    userProfile: s.userProfile,
    currentProgram: s.currentProgram,
    foodSections: s.foodSections,
    exerciseProgress: s.exerciseProgress,
    bestEst1RMs: s.bestEst1RMs,
    customPrograms: s.customPrograms,
    savedMeals: s.savedMeals,
    completedSessionCount: s.completedSessionCount,
    dismissedCheckInWeek: s.dismissedCheckInWeek,
  };
}

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

      // Bulk-load remote data after sign-in (non-destructive: only overwrites if remote has data)
      hydrateFromRemote: (data) => {
        set((s) => ({
          userProfile:            data.userProfile            ?? s.userProfile,
          currentProgram:         data.currentProgram         ?? s.currentProgram,
          foodSections:           data.foodSections           ?? s.foodSections,
          exerciseProgress:       data.exerciseProgress       ?? s.exerciseProgress,
          bestEst1RMs:            data.bestEst1RMs            ?? s.bestEst1RMs,
          customPrograms:         data.customPrograms         ?? s.customPrograms,
          savedMeals:             data.savedMeals             ?? s.savedMeals,
          completedSessionCount:  data.completedSessionCount  || s.completedSessionCount,
          dismissedCheckInWeek:   data.dismissedCheckInWeek   ?? s.dismissedCheckInWeek,
          workoutLogs:            data.workoutLogs.length     ? data.workoutLogs    : s.workoutLogs,
          foodLogs:               data.foodLogs.length        ? data.foodLogs       : s.foodLogs,
          morningWeights:         data.morningWeights.length  ? data.morningWeights : s.morningWeights,
          checkIns:               data.checkIns.length        ? data.checkIns       : s.checkIns,
          progressEntries:        data.progressEntries.length ? data.progressEntries : s.progressEntries,
          hydration:              data.hydration.length       ? data.hydration      : s.hydration,
          coachHistory:           data.coachHistory.length    ? data.coachHistory   : s.coachHistory,
        }));
      },

      completeOnboarding: (profile) => {
        const program = generateProgram(profile);
        const progress: Record<string, ExerciseProgress> = {};
        program.days.forEach((day) => {
          day.exercises.forEach(({ exerciseId }) => {
            if (!progress[exerciseId]) {
              const ex = exerciseLibrary.find((e) => e.id === exerciseId);
              progress[exerciseId] = { currentWeight: ex?.defaultWeight ?? 0, lastReps: [] };
            }
          });
        });
        set({ userProfile: profile, currentProgram: program, exerciseProgress: progress });
        const payload = profilePayload({ ...get(), userProfile: profile, currentProgram: program, exerciseProgress: progress });
        if (payload) syncProfileData(payload);
      },

      resetApp: () =>
        set({
          userProfile: null, currentProgram: null, completedSessionCount: 0,
          currentSession: null, workoutLogs: [], foodLogs: [],
          foodSections: DEFAULT_FOOD_SECTIONS, exerciseProgress: {},
          morningWeights: [], savedMeals: [], bestEst1RMs: {},
          checkIns: [], dismissedCheckInWeek: null, progressEntries: [],
          hydration: [], coachHistory: [], customPrograms: [],
        }),

      addFoodSection: (label) => {
        const id = `section_${Date.now()}`;
        set({ foodSections: [...get().foodSections, { id, label }] });
        const p = profilePayload(get()); if (p) syncProfileData(p);
      },
      renameFoodSection: (id, label) => {
        set({ foodSections: get().foodSections.map((s) => (s.id === id ? { ...s, label } : s)) });
        const p = profilePayload(get()); if (p) syncProfileData(p);
      },
      deleteFoodSection: (id) => {
        set({ foodSections: get().foodSections.filter((s) => s.id !== id) });
        const p = profilePayload(get()); if (p) syncProfileData(p);
      },

      addMorningWeight: (date, weight) => {
        const weights = get().morningWeights.filter((w) => w.date !== date);
        const entry: MorningWeight = { date, weight };
        set({ morningWeights: [...weights, entry] });
        syncMorningWeight(entry);
      },

      startSession: () => {
        const { currentProgram, completedSessionCount } = get();
        if (!currentProgram) return;
        const dayIndex = getTrainingDayIndex(currentProgram.days, completedSessionCount);
        set({ currentSession: { dayIndex, startTime: new Date().toISOString(), sets: {}, completed: false } });
      },

      startSessionWithDay: (dayIndex) => {
        set({ currentSession: { dayIndex, startTime: new Date().toISOString(), sets: {}, completed: false } });
      },

      logSet: (exerciseId, setData) => {
        const session = get().currentSession;
        if (!session) return;
        const existing = session.sets[exerciseId] ?? [];
        set({ currentSession: { ...session, sets: { ...session.sets, [exerciseId]: [...existing, setData] } } });
      },

      removeSet: (exerciseId, setIndex) => {
        const session = get().currentSession;
        if (!session) return;
        const existing = session.sets[exerciseId] ?? [];
        set({
          currentSession: {
            ...session,
            sets: { ...session.sets, [exerciseId]: existing.filter((_, i) => i !== setIndex) },
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
          const allAboveMax = loggedSets.length >= targetSets && lastReps.every((r) => r >= ex.repRangeHigh);
          updatedProgress[exerciseId] = {
            currentWeight: allAboveMax ? prev.currentWeight + ex.weightIncrement : prev.currentWeight,
            lastReps,
          };
        });

        const updatedBest1RMs = { ...bestEst1RMs };
        for (const [exerciseId, sets] of Object.entries(currentSession.sets)) {
          if (sets.length === 0) continue;
          const newBest = Math.max(...sets.map((s) => s.weight * (1 + s.reps / 30)));
          const prev = updatedBest1RMs[exerciseId] ?? 0;
          if (newBest > prev) {
            updatedBest1RMs[exerciseId] = newBest;
            if (userProfile) {
              submitScore(exerciseId, Math.round(newBest), userProfile.name || 'Athlete', userProfile.username || 'athlete', userProfile.weight);
            }
          }
        }

        const log: WorkoutLog = { date: new Date().toISOString(), dayIndex: currentSession.dayIndex, sets: currentSession.sets };
        set({
          workoutLogs: [...workoutLogs, log],
          currentSession: null,
          completedSessionCount: completedSessionCount + 1,
          exerciseProgress: updatedProgress,
          bestEst1RMs: updatedBest1RMs,
        });
        syncWorkoutLog(log);
        const p = profilePayload(get()); if (p) syncProfileData(p);
      },

      abandonSession: () => set({ currentSession: null }),

      updateMacros: (macros) => {
        const prog = get().currentProgram;
        if (!prog) return;
        set({ currentProgram: { ...prog, macros } });
        const p = profilePayload(get()); if (p) syncProfileData(p);
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
        const p = profilePayload(get()); if (p) syncProfileData(p);
      },

      logFood: (food, grams, slot) => {
        const today = todayKey();
        const macros = scaleMacros(food.per100g, grams);
        const micronutrients = food.micronutrients ? scaleMicronutrients(food.micronutrients, grams) : undefined;
        const fatBreakdown = food.fatBreakdown ? scaleFatBreakdown(food.fatBreakdown, grams) : undefined;
        const entry: MealEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          food, grams, slot, macros, micronutrients, fatBreakdown,
        };
        const foodLogs = [...get().foodLogs];
        const idx = foodLogs.findIndex((l) => l.date === today);
        if (idx >= 0) {
          foodLogs[idx] = { ...foodLogs[idx], meals: [...foodLogs[idx].meals, entry] };
        } else {
          foodLogs.push({ date: today, meals: [entry] });
        }
        set({ foodLogs });
        const log = foodLogs.find((l) => l.date === today)!;
        syncFoodLog(log);
      },

      removeFoodEntry: (date, entryId) => {
        const foodLogs = get().foodLogs.map((log) =>
          log.date !== date ? log : { ...log, meals: log.meals.filter((m) => m.id !== entryId) }
        );
        set({ foodLogs });
        const log = foodLogs.find((l) => l.date === date);
        if (log) syncFoodLog(log);
      },

      saveMeal: (name, entries) => {
        const total = entries.reduce(
          (acc, { food, grams }) => {
            const m = grams / 100;
            return { calories: acc.calories + food.per100g.calories * m, protein: acc.protein + food.per100g.protein * m, carbs: acc.carbs + food.per100g.carbs * m, fat: acc.fat + food.per100g.fat * m };
          },
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        );
        const meal: SavedMeal = {
          id: `meal_${Date.now()}`, name, entries,
          totalMacros: { calories: Math.round(total.calories), protein: Math.round(total.protein * 10) / 10, carbs: Math.round(total.carbs * 10) / 10, fat: Math.round(total.fat * 10) / 10 },
        };
        set({ savedMeals: [...get().savedMeals, meal] });
        const p = profilePayload(get()); if (p) syncProfileData(p);
      },

      deleteSavedMeal: (id) => {
        set({ savedMeals: get().savedMeals.filter((m) => m.id !== id) });
        const p = profilePayload(get()); if (p) syncProfileData(p);
      },

      updateProfile: (updates) => {
        const profile = get().userProfile;
        if (!profile) return;
        set({ userProfile: { ...profile, ...updates } });
        const p = profilePayload(get()); if (p) syncProfileData(p);
      },

      saveCheckIn: (checkIn) => {
        const existing = get().checkIns.filter((c) => c.week !== checkIn.week);
        set({ checkIns: [...existing, checkIn] });
        syncCheckIn(checkIn);
      },

      dismissCheckIn: (week) => {
        set({ dismissedCheckInWeek: week });
        const p = profilePayload(get()); if (p) syncProfileData(p);
      },

      addProgressEntry: (entry) => {
        set({ progressEntries: [...get().progressEntries, entry] });
        syncProgressEntry(entry);
      },

      deleteProgressEntry: (id) => {
        set({ progressEntries: get().progressEntries.filter((e) => e.id !== id) });
        deleteProgressEntryRemote(id);
      },

      logHydration: (date, glasses, goalGlasses = 12) => {
        const existing = get().hydration.filter((h) => h.date !== date);
        const entry: HydrationLog = { date, glasses, goalGlasses };
        set({ hydration: [...existing, entry] });
        syncHydration(entry);
      },

      addCoachMessage: (msg) => {
        const history = [...get().coachHistory, msg].slice(-50);
        set({ coachHistory: history });
        syncCoachMessage(msg);
      },

      clearCoachHistory: () => {
        set({ coachHistory: [] });
        clearCoachMessagesRemote();
      },

      saveCustomProgram: (program) => {
        const existing = get().customPrograms.filter((p) => p.id !== program.id);
        set({ customPrograms: [...existing, program] });
        get().updateProgramDays(program.days_data);
        const p = profilePayload(get()); if (p) syncProfileData(p);
      },

      updateCustomProgram: (program) => {
        set({ customPrograms: get().customPrograms.map((p) => p.id === program.id ? program : p) });
        get().updateProgramDays(program.days_data);
        const p = profilePayload(get()); if (p) syncProfileData(p);
      },

      deleteCustomProgram: (id) => {
        set({ customPrograms: get().customPrograms.filter((p) => p.id !== id) });
        const p = profilePayload(get()); if (p) syncProfileData(p);
      },

      duplicateCustomProgram: (id) => {
        const original = get().customPrograms.find((p) => p.id === id);
        if (!original) return;
        const copy: CustomProgram = { ...original, id: `custom_${Date.now()}`, name: `${original.name} (Copy)`, createdAt: new Date().toISOString() };
        set({ customPrograms: [...get().customPrograms, copy] });
        const p = profilePayload(get()); if (p) syncProfileData(p);
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
  const key = new Date().toISOString().split('T')[0];
  return useStore((s) => s.hydration.find((h) => h.date === key) ?? null);
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
      (acc, m) => ({ protein: acc.protein + m.macros.protein, carbs: acc.carbs + m.macros.carbs, fat: acc.fat + m.macros.fat }),
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

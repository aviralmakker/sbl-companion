// syncService.ts — fire-and-forget Supabase sync, called after local store writes
import { supabase } from '../lib/supabase';
import type {
  UserProfile, TrainingProgram, TrainingDay, WorkoutLog, FoodLog,
  MorningWeight, CheckIn, ProgressEntry, HydrationLog, CoachMessage,
  FoodSection, ExerciseProgress, SavedMeal, CustomProgram,
} from '../types';

async function uid(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

// ─── Profile & config ─────────────────────────────────────────────────────────

export interface ProfileSyncData {
  userProfile: UserProfile;
  currentProgram: TrainingProgram | null;
  foodSections: FoodSection[];
  exerciseProgress: Record<string, ExerciseProgress>;
  bestEst1RMs: Record<string, number>;
  customPrograms: CustomProgram[];
  savedMeals: SavedMeal[];
  completedSessionCount: number;
  dismissedCheckInWeek: string | null;
}

export async function syncProfileData(data: ProfileSyncData): Promise<void> {
  const userId = await uid();
  if (!userId) return;
  const p = data.userProfile;
  await supabase.from('profiles').upsert({
    id: userId,
    gender: p.gender,
    training_age: p.trainingAge,
    days_per_week: p.daysPerWeek,
    session_length: p.sessionLength,
    equipment: p.equipment,
    body_fat: p.bodyFatPercent,
    goal: p.goal,
    weight: p.weight,
    height: p.height,
    age: p.age,
    activity_level: p.activityLevel,
    diet_type: p.dietType,
    name: p.name ?? null,
    username: p.username ?? null,
    current_program: data.currentProgram,
    food_sections: data.foodSections,
    exercise_progress: data.exerciseProgress,
    best_est_1rms: data.bestEst1RMs,
    custom_programs: data.customPrograms,
    saved_meals: data.savedMeals,
    completed_session_count: data.completedSessionCount,
    dismissed_checkin_week: data.dismissedCheckInWeek,
    updated_at: new Date().toISOString(),
  });
}

// ─── Workout logs ─────────────────────────────────────────────────────────────

export async function syncWorkoutLog(log: WorkoutLog): Promise<void> {
  const userId = await uid();
  if (!userId) return;
  await supabase.from('workout_logs').upsert({
    id: log.date,
    user_id: userId,
    date: log.date,
    day_index: log.dayIndex,
    sets: log.sets,
  });
}

// ─── Food logs ────────────────────────────────────────────────────────────────

export async function syncFoodLog(log: FoodLog): Promise<void> {
  const userId = await uid();
  if (!userId) return;
  await supabase.from('food_logs').upsert(
    { id: `${userId}_${log.date}`, user_id: userId, date: log.date, meals: log.meals },
    { onConflict: 'user_id,date' },
  );
}

// ─── Morning weights ──────────────────────────────────────────────────────────

export async function syncMorningWeight(w: MorningWeight): Promise<void> {
  const userId = await uid();
  if (!userId) return;
  await supabase.from('morning_weights').upsert(
    { id: `${userId}_${w.date}`, user_id: userId, date: w.date, weight: w.weight },
    { onConflict: 'user_id,date' },
  );
}

// ─── Check-ins ────────────────────────────────────────────────────────────────

export async function syncCheckIn(checkIn: CheckIn): Promise<void> {
  const userId = await uid();
  if (!userId) return;
  await supabase.from('check_ins').upsert(
    { id: `${userId}_${checkIn.week}`, user_id: userId, week: checkIn.week, date: checkIn.date, data: checkIn },
    { onConflict: 'user_id,week' },
  );
}

// ─── Progress entries ─────────────────────────────────────────────────────────

export async function syncProgressEntry(entry: ProgressEntry): Promise<void> {
  const userId = await uid();
  if (!userId) return;
  await supabase.from('progress_entries').upsert({ id: entry.id, user_id: userId, date: entry.date, data: entry });
}

export async function deleteProgressEntryRemote(id: string): Promise<void> {
  const userId = await uid();
  if (!userId) return;
  await supabase.from('progress_entries').delete().eq('id', id).eq('user_id', userId);
}

// ─── Hydration ────────────────────────────────────────────────────────────────

export async function syncHydration(h: HydrationLog): Promise<void> {
  const userId = await uid();
  if (!userId) return;
  await supabase.from('hydration_logs').upsert(
    { id: `${userId}_${h.date}`, user_id: userId, date: h.date, glasses: h.glasses, goal_glasses: h.goalGlasses },
    { onConflict: 'user_id,date' },
  );
}

// ─── Coach messages ───────────────────────────────────────────────────────────

export async function syncCoachMessage(msg: CoachMessage): Promise<void> {
  const userId = await uid();
  if (!userId) return;
  await supabase.from('coach_messages').insert({
    id: `${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    user_id: userId,
    role: msg.role,
    content: msg.content,
  });
}

export async function clearCoachMessagesRemote(): Promise<void> {
  const userId = await uid();
  if (!userId) return;
  await supabase.from('coach_messages').delete().eq('user_id', userId);
}

// ─── Pull all remote data on login ────────────────────────────────────────────

export interface RemoteUserData {
  userProfile: UserProfile | null;
  currentProgram: TrainingProgram | null;
  foodSections: FoodSection[] | null;
  exerciseProgress: Record<string, ExerciseProgress> | null;
  bestEst1RMs: Record<string, number> | null;
  customPrograms: CustomProgram[] | null;
  savedMeals: SavedMeal[] | null;
  completedSessionCount: number;
  dismissedCheckInWeek: string | null;
  workoutLogs: WorkoutLog[];
  foodLogs: FoodLog[];
  morningWeights: MorningWeight[];
  checkIns: CheckIn[];
  progressEntries: ProgressEntry[];
  hydration: HydrationLog[];
  coachHistory: CoachMessage[];
}

export async function pullUserData(): Promise<RemoteUserData | null> {
  const userId = await uid();
  if (!userId) return null;

  const [
    { data: profile },
    { data: workoutLogs },
    { data: foodLogs },
    { data: weights },
    { data: checkIns },
    { data: progress },
    { data: hydration },
    { data: coach },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('workout_logs').select('*').eq('user_id', userId).order('date'),
    supabase.from('food_logs').select('*').eq('user_id', userId).order('date'),
    supabase.from('morning_weights').select('*').eq('user_id', userId).order('date'),
    supabase.from('check_ins').select('*').eq('user_id', userId).order('date'),
    supabase.from('progress_entries').select('*').eq('user_id', userId).order('date'),
    supabase.from('hydration_logs').select('*').eq('user_id', userId).order('date'),
    supabase.from('coach_messages').select('*').eq('user_id', userId).order('created_at').limit(50),
  ]);

  if (!profile) return null;

  const userProfile: UserProfile = {
    gender: profile.gender,
    trainingAge: profile.training_age,
    daysPerWeek: profile.days_per_week,
    sessionLength: profile.session_length,
    equipment: profile.equipment,
    bodyFatPercent: profile.body_fat,
    goal: profile.goal,
    weight: profile.weight,
    height: profile.height,
    age: profile.age,
    activityLevel: profile.activity_level,
    dietType: profile.diet_type,
    name: profile.name,
    username: profile.username,
  };

  return {
    userProfile,
    currentProgram: profile.current_program as TrainingProgram | null,
    foodSections: profile.food_sections as FoodSection[] | null,
    exerciseProgress: profile.exercise_progress as Record<string, ExerciseProgress> | null,
    bestEst1RMs: profile.best_est_1rms as Record<string, number> | null,
    customPrograms: profile.custom_programs as CustomProgram[] | null,
    savedMeals: profile.saved_meals as SavedMeal[] | null,
    completedSessionCount: profile.completed_session_count ?? 0,
    dismissedCheckInWeek: profile.dismissed_checkin_week ?? null,
    workoutLogs: (workoutLogs ?? []).map((r) => ({ date: r.date, dayIndex: r.day_index, sets: r.sets })),
    foodLogs: (foodLogs ?? []).map((r) => ({ date: r.date, meals: r.meals })),
    morningWeights: (weights ?? []).map((r) => ({ date: r.date, weight: r.weight })),
    checkIns: (checkIns ?? []).map((r) => r.data as CheckIn),
    progressEntries: (progress ?? []).map((r) => r.data as ProgressEntry),
    hydration: (hydration ?? []).map((r) => ({ date: r.date, glasses: r.glasses, goalGlasses: r.goal_glasses })),
    coachHistory: (coach ?? []).map((r) => ({ id: r.id, role: r.role as 'user' | 'assistant', content: r.content, timestamp: r.created_at })),
  };
}

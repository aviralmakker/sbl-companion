export type TrainingAge = 'beginner' | 'intermediate' | 'advanced';
export type Goal = 'lean_bulk' | 'recomp' | 'slow_cut' | 'aggressive_cut';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';
export type DietType = 'vegetarian' | 'eggetarian' | 'non_veg';
export type Equipment = 'full_gym' | 'home' | 'minimal';
export type MealSlot = 'breakfast' | 'pre_workout' | 'post_workout' | 'lunch' | 'dinner' | 'snack';
export type SFRRank = 'high' | 'medium' | 'low';
export type Gender = 'male' | 'female';
export type SplitOverride = 'full_body' | 'upper_lower' | 'ppl' | null;

export interface UserProfile {
  gender: Gender;
  trainingAge: TrainingAge;
  daysPerWeek: number;
  sessionLength: number;
  equipment: Equipment;
  bodyFatPercent: number;
  goal: Goal;
  weight: number;
  height: number;
  age: number;
  activityLevel: ActivityLevel;
  dietType: DietType;
  // optional overrides from edit panel
  calorieAdjustment?: number;
  proteinPerKgOverride?: number;
  splitOverride?: SplitOverride;
  // profile display
  name?: string;
  username?: string;
}

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  primaryMuscle: string;
  sfrRank: SFRRank;
  equipment: Equipment[];
  repRangeLow: number;
  repRangeHigh: number;
  defaultWeight: number;
  weightIncrement: number;
  notes?: string;
}

export interface SessionExercise {
  exerciseId: string;
  sets: number;
}

export interface TrainingDay {
  label: string;
  muscleGroups: string[];
  exercises: SessionExercise[];
  isRest: boolean;
}

export interface TrainingProgram {
  splitName: string;
  days: TrainingDay[];
  macros: Macros;
  tdee: number;
}

export interface SetLog {
  reps: number;
  weight: number;
}

export interface ActiveSession {
  dayIndex: number;
  startTime: string;
  sets: Record<string, SetLog[]>;
  completed: boolean;
}

export interface WorkoutLog {
  date: string;
  dayIndex: number;
  sets: Record<string, SetLog[]>;
}

export interface ExerciseProgress {
  currentWeight: number;
  lastReps: number[];
}

export interface FoodItem {
  id: string;
  name: string;
  category: 'protein' | 'carb' | 'fat' | 'mixed';
  per100g: Macros;
  micronutrients?: Micronutrients;
  fatBreakdown?: FatBreakdown;
  commonPortions: { label: string; grams: number }[];
  tags: string[];
}

export interface FoodSection {
  id: string;    // stable key — default sections use MealSlot values, custom ones get timestamp IDs
  label: string; // user-editable display name
}

export interface MealEntry {
  id: string;
  food: FoodItem;
  grams: number;
  slot: string;  // section id — broadened from MealSlot so custom sections work
  macros: Macros;
  micronutrients?: Micronutrients;
  fatBreakdown?: FatBreakdown;
}

export interface FoodLog {
  date: string;
  meals: MealEntry[];
}

export interface MorningWeight {
  date: string; // YYYY-MM-DD
  weight: number;
}

export interface Micronutrients {
  iron?: number;       // mg per 100g
  calcium?: number;    // mg per 100g
  zinc?: number;       // mg per 100g
  vitaminB12?: number; // mcg per 100g
  vitaminD?: number;   // mcg per 100g
}

export interface FatBreakdown {
  saturated?: number;      // g per 100g
  monounsaturated?: number; // g per 100g
  polyunsaturated?: number; // g per 100g
  omega3?: number;          // g per 100g
  omega6?: number;          // g per 100g
}

export interface SavedMeal {
  id: string;
  name: string;
  entries: { food: FoodItem; grams: number }[];
  totalMacros: Macros;
}

export interface CheckInScores {
  energy: number;
  recovery: number;
  hunger: number;
  motivation: number;
  sleep: number;
  gymPerformance: number;
}

export interface CheckIn {
  week: string;         // ISO week key e.g. "2026-W20"
  date: string;         // YYYY-MM-DD
  scores: CheckInScores;
  overallScore: number;
}

export interface BodyMeasurements {
  bodyweight?: number;
  bodyFat?: number;
  chest?: number;
  waist?: number;
  hips?: number;
  leftArm?: number;
  rightArm?: number;
  leftThigh?: number;
  rightThigh?: number;
  shoulders?: number;
  neck?: number;
}

export interface ProgressEntry {
  id: string;
  date: string;          // YYYY-MM-DD
  photoUri?: string;     // blob URL (session-only) — TODO: persist via native storage
  measurements: BodyMeasurements;
}

export interface HydrationLog {
  date: string;          // YYYY-MM-DD
  glasses: number;       // each glass = 250ml
  goalGlasses: number;   // default 12 (3L)
}

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;     // ISO
}

export interface CustomProgram {
  id: string;
  name: string;
  split: string;
  days: number;
  goal: string;
  days_data: TrainingDay[];
  createdAt: string;
}

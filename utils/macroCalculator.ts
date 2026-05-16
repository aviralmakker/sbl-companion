import type { UserProfile, Macros, Micronutrients, FatBreakdown } from '../types';

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

const GOAL_ADJUSTMENTS: Record<string, number> = {
  lean_bulk: 300,
  recomp: 0,
  slow_cut: -350,
  aggressive_cut: -700,
};

export const GOAL_LABELS: Record<string, string> = {
  lean_bulk: 'Lean Bulk',
  recomp: 'Body Recomp',
  slow_cut: 'Slow Cut',
  aggressive_cut: 'Aggressive Cut',
};

export function calculateMacros(profile: UserProfile): Macros & { tdee: number } {
  // Mifflin-St Jeor BMR: male offset +5, female offset -161
  const sexOffset = profile.gender === 'female' ? -161 : 5;
  const bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + sexOffset;
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[profile.activityLevel]);

  const goalAdj = GOAL_ADJUSTMENTS[profile.goal];
  const calorieAdj = profile.calorieAdjustment ?? 0;
  const calories = Math.max(1200, tdee + goalAdj + calorieAdj);

  const proteinPerKg = profile.proteinPerKgOverride ?? 2;
  const protein = Math.round(profile.weight * proteinPerKg);
  const fat = Math.round(profile.weight * 0.9);
  const remainingCals = calories - protein * 4 - fat * 9;
  const carbs = Math.max(0, Math.round(remainingCals / 4));

  return { calories, protein, carbs, fat, tdee };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

export function zeroMacros(): Macros {
  return { calories: 0, protein: 0, carbs: 0, fat: 0 };
}

export function scaleMacros(food: Macros, grams: number): Macros {
  const m = grams / 100;
  return {
    calories: Math.round(food.calories * m),
    protein: Math.round(food.protein * m * 10) / 10,
    carbs: Math.round(food.carbs * m * 10) / 10,
    fat: Math.round(food.fat * m * 10) / 10,
    fiber: food.fiber != null ? Math.round(food.fiber * m * 10) / 10 : undefined,
  };
}

export function scaleFatBreakdown(fb: FatBreakdown, grams: number): FatBreakdown {
  const m = grams / 100;
  const r = (v: number | undefined) => v != null ? Math.round(v * m * 10) / 10 : undefined;
  return {
    saturated:      r(fb.saturated),
    monounsaturated: r(fb.monounsaturated),
    polyunsaturated: r(fb.polyunsaturated),
    omega3: r(fb.omega3),
    omega6: r(fb.omega6),
  };
}

export function scaleMicronutrients(mn: Micronutrients, grams: number): Micronutrients {
  const m = grams / 100;
  return {
    iron:       mn.iron       != null ? Math.round(mn.iron       * m * 10) / 10 : undefined,
    calcium:    mn.calcium    != null ? Math.round(mn.calcium    * m)            : undefined,
    zinc:       mn.zinc       != null ? Math.round(mn.zinc       * m * 10) / 10 : undefined,
    vitaminB12: mn.vitaminB12 != null ? Math.round(mn.vitaminB12 * m * 100) / 100 : undefined,
    vitaminD:   mn.vitaminD   != null ? Math.round(mn.vitaminD   * m * 10) / 10 : undefined,
  };
}

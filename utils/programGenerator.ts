import type { UserProfile, TrainingDay, TrainingProgram } from '../types';
import { calculateMacros } from './macroCalculator';

type SplitTemplate = { label: string; days: TrainingDay[] };

// ─── REST ─────────────────────────────────────────────────
const REST: TrainingDay = { label: 'Rest', muscleGroups: [], isRest: true, exercises: [] };

// ─── PUSH ─────────────────────────────────────────────────
// Same exercises repeated each week to maximise coordination adaptation
// Ref: Calatayud et al. 2015 (JOSPT), Schoenfeld BJ 2010, Nippard/Israetel mesocycle consistency
const PUSH_A: TrainingDay = {
  label: 'Push Day',
  muscleGroups: ['chest', 'shoulders', 'triceps'],
  isRest: false,
  exercises: [
    { exerciseId: 'bench_press_flat', sets: 4 },
    { exerciseId: 'incline_db_press', sets: 3 },
    { exerciseId: 'ohp_db', sets: 3 },
    { exerciseId: 'lateral_raise_cable', sets: 4 },
    { exerciseId: 'rope_pushdown', sets: 3 },
    { exerciseId: 'overhead_tri_ext', sets: 3 },
  ],
};

const PUSH_B: TrainingDay = {
  label: 'Push Day B',
  muscleGroups: ['chest', 'shoulders', 'triceps'],
  isRest: false,
  exercises: [
    { exerciseId: 'incline_db_press', sets: 4 },
    { exerciseId: 'cable_chest_fly', sets: 3 },
    { exerciseId: 'ohp_barbell', sets: 3 },
    { exerciseId: 'lateral_raise_db', sets: 4 },
    { exerciseId: 'skull_crusher', sets: 3 },
    { exerciseId: 'rope_pushdown', sets: 3 },
  ],
};

// ─── PULL ─────────────────────────────────────────────────
const PULL_A: TrainingDay = {
  label: 'Pull Day',
  muscleGroups: ['back', 'biceps'],
  isRest: false,
  exercises: [
    { exerciseId: 'pullup', sets: 4 },
    { exerciseId: 'cable_row_seated', sets: 4 },
    { exerciseId: 'face_pull', sets: 3 },
    { exerciseId: 'cable_curl', sets: 3 },
    { exerciseId: 'hammer_curl', sets: 3 },
  ],
};

const PULL_B: TrainingDay = {
  label: 'Pull Day B',
  muscleGroups: ['back', 'biceps'],
  isRest: false,
  exercises: [
    { exerciseId: 'lat_pulldown', sets: 4 },
    { exerciseId: 'db_row', sets: 4 },
    { exerciseId: 'face_pull', sets: 3 },
    { exerciseId: 'db_curl', sets: 3 },
    { exerciseId: 'hammer_curl', sets: 3 },
  ],
};

// ─── LEGS ─────────────────────────────────────────────────
const LEGS_A: TrainingDay = {
  label: 'Leg Day',
  muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'],
  isRest: false,
  exercises: [
    { exerciseId: 'squat_barbell', sets: 4 },
    { exerciseId: 'rdl', sets: 3 },
    { exerciseId: 'leg_press', sets: 3 },
    { exerciseId: 'leg_curl_lying', sets: 3 },
    { exerciseId: 'calf_raise_seated', sets: 4 },
  ],
};

const LEGS_B: TrainingDay = {
  label: 'Leg Day B',
  muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'],
  isRest: false,
  exercises: [
    { exerciseId: 'hack_squat', sets: 4 },
    { exerciseId: 'hip_thrust', sets: 3 },
    { exerciseId: 'leg_extension', sets: 3 },
    { exerciseId: 'leg_curl_lying', sets: 3 },
    { exerciseId: 'calf_raise_standing', sets: 4 },
  ],
};

// ─── UPPER ────────────────────────────────────────────────
const UPPER_A: TrainingDay = {
  label: 'Upper Body',
  muscleGroups: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
  isRest: false,
  exercises: [
    { exerciseId: 'bench_press_flat', sets: 4 },
    { exerciseId: 'cable_row_seated', sets: 4 },
    { exerciseId: 'incline_db_press', sets: 3 },
    { exerciseId: 'lat_pulldown', sets: 3 },
    { exerciseId: 'lateral_raise_db', sets: 3 },
    { exerciseId: 'cable_curl', sets: 3 },
    { exerciseId: 'rope_pushdown', sets: 3 },
  ],
};

const UPPER_B: TrainingDay = {
  label: 'Upper Body B',
  muscleGroups: ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
  isRest: false,
  exercises: [
    { exerciseId: 'incline_db_press', sets: 4 },
    { exerciseId: 'db_row', sets: 4 },
    { exerciseId: 'cable_chest_fly', sets: 3 },
    { exerciseId: 'face_pull', sets: 3 },
    { exerciseId: 'lateral_raise_cable', sets: 3 },
    { exerciseId: 'hammer_curl', sets: 3 },
    { exerciseId: 'overhead_tri_ext', sets: 3 },
  ],
};

// ─── LOWER ────────────────────────────────────────────────
const LOWER_A: TrainingDay = {
  label: 'Lower Body',
  muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'],
  isRest: false,
  exercises: [
    { exerciseId: 'squat_barbell', sets: 4 },
    { exerciseId: 'rdl', sets: 3 },
    { exerciseId: 'leg_press', sets: 3 },
    { exerciseId: 'leg_curl_lying', sets: 3 },
    { exerciseId: 'calf_raise_seated', sets: 4 },
  ],
};

const LOWER_B: TrainingDay = {
  label: 'Lower Body B',
  muscleGroups: ['quads', 'hamstrings', 'glutes', 'calves'],
  isRest: false,
  exercises: [
    { exerciseId: 'hack_squat', sets: 4 },
    { exerciseId: 'hip_thrust', sets: 3 },
    { exerciseId: 'leg_extension', sets: 3 },
    { exerciseId: 'leg_curl_lying', sets: 3 },
    { exerciseId: 'calf_raise_standing', sets: 4 },
  ],
};

// ─── FULL BODY ─────────────────────────────────────────────
// Full Body uses A/B/C variation to hit different compound patterns each session
const FULL_BODY_A: TrainingDay = {
  label: 'Full Body A',
  muscleGroups: ['quads', 'chest', 'back', 'shoulders', 'biceps', 'triceps'],
  isRest: false,
  exercises: [
    { exerciseId: 'squat_barbell', sets: 3 },
    { exerciseId: 'bench_press_flat', sets: 3 },
    { exerciseId: 'cable_row_seated', sets: 3 },
    { exerciseId: 'ohp_db', sets: 2 },
    { exerciseId: 'db_curl', sets: 2 },
    { exerciseId: 'rope_pushdown', sets: 2 },
  ],
};

const FULL_BODY_B: TrainingDay = {
  label: 'Full Body B',
  muscleGroups: ['hamstrings', 'chest', 'back', 'shoulders', 'biceps', 'triceps'],
  isRest: false,
  exercises: [
    { exerciseId: 'rdl', sets: 3 },
    { exerciseId: 'incline_db_press', sets: 3 },
    { exerciseId: 'lat_pulldown', sets: 3 },
    { exerciseId: 'lateral_raise_db', sets: 3 },
    { exerciseId: 'hammer_curl', sets: 2 },
    { exerciseId: 'overhead_tri_ext', sets: 2 },
  ],
};

const FULL_BODY_C: TrainingDay = {
  label: 'Full Body C',
  muscleGroups: ['quads', 'chest', 'back', 'shoulders', 'calves'],
  isRest: false,
  exercises: [
    { exerciseId: 'leg_press', sets: 3 },
    { exerciseId: 'cable_chest_fly', sets: 3 },
    { exerciseId: 'db_row', sets: 3 },
    { exerciseId: 'face_pull', sets: 3 },
    { exerciseId: 'lateral_raise_cable', sets: 2 },
    { exerciseId: 'calf_raise_standing', sets: 3 },
  ],
};

// ─── SPLIT TEMPLATES ──────────────────────────────────────
// Upper/Lower and PPL repeat the same session within the week.
// Motor learning research (Calatayud et al. 2015; Schmidt & Wrisberg 2008) shows
// identical movement repetition maximises coordination adaptations before pure hypertrophy
// can become the primary driver. Jeff Nippard and Dr. Mike Israetel (RP) both recommend
// exercise consistency within a mesocycle for accurate SFR gauging.

const FULL_BODY_TEMPLATE: SplitTemplate = {
  label: 'Full Body (3×/week)',
  days: [FULL_BODY_A, REST, FULL_BODY_B, REST, FULL_BODY_C, REST, REST],
};

const UPPER_LOWER_TEMPLATE: SplitTemplate = {
  label: 'Upper / Lower (4×/week)',
  days: [UPPER_A, LOWER_A, REST, UPPER_A, LOWER_A, REST, REST],
};

const PPL_TEMPLATE: SplitTemplate = {
  label: 'Push / Pull / Legs (6×/week)',
  days: [PUSH_A, PULL_A, LEGS_A, PUSH_A, PULL_A, LEGS_A, REST],
};

const PPL_5_TEMPLATE: SplitTemplate = {
  label: 'Push / Pull / Legs (5×/week)',
  days: [PUSH_A, PULL_A, LEGS_A, REST, PUSH_A, PULL_A, REST],
};

// B-variants remain available for manual assignment via WorkoutPlanEditor
export const DAY_TEMPLATES: Record<string, TrainingDay> = {
  rest:         REST,
  push_a:       PUSH_A,
  pull_a:       PULL_A,
  legs_a:       LEGS_A,
  push_b:       PUSH_B,
  pull_b:       PULL_B,
  legs_b:       LEGS_B,
  upper_a:      UPPER_A,
  lower_a:      LOWER_A,
  upper_b:      UPPER_B,
  lower_b:      LOWER_B,
  full_body_a:  FULL_BODY_A,
  full_body_b:  FULL_BODY_B,
  full_body_c:  FULL_BODY_C,
};

export const DAY_TYPE_LABELS: Record<string, string> = {
  rest: 'Rest Day',
  push_a: 'Push Day', pull_a: 'Pull Day', legs_a: 'Leg Day',
  push_b: 'Push Day B', pull_b: 'Pull Day B', legs_b: 'Leg Day B',
  upper_a: 'Upper Body', lower_a: 'Lower Body',
  upper_b: 'Upper Body B', lower_b: 'Lower Body B',
  full_body_a: 'Full Body A', full_body_b: 'Full Body B', full_body_c: 'Full Body C',
};

// Beginners receive +1 set per exercise because they cannot generate sufficient effort
// per set to reach failure — each set produces fewer effective reps than an advanced lifter.
// Advanced and intermediate lifters are programmed at the same volume; the variable that
// differentiates them is proximity to failure, not set count.
// Ref: Refalo et al. 2023 (Sports Medicine) · Nippard J · Israetel M (RP)
function applyBeginnerVolume(template: SplitTemplate): SplitTemplate {
  return {
    ...template,
    days: template.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) => ({
        ...ex,
        sets: Math.min(ex.sets + 1, 5),
      })),
    })),
  };
}

export function generateProgram(profile: UserProfile): TrainingProgram {
  let template: SplitTemplate;

  if (profile.splitOverride === 'full_body') {
    template = FULL_BODY_TEMPLATE;
  } else if (profile.splitOverride === 'upper_lower') {
    template = UPPER_LOWER_TEMPLATE;
  } else if (profile.splitOverride === 'ppl') {
    template = profile.daysPerWeek <= 5 ? PPL_5_TEMPLATE : PPL_TEMPLATE;
  } else if (profile.daysPerWeek <= 3) {
    template = FULL_BODY_TEMPLATE;
  } else if (profile.daysPerWeek === 4) {
    template = UPPER_LOWER_TEMPLATE;
  } else if (profile.daysPerWeek === 5) {
    template = PPL_5_TEMPLATE;
  } else {
    template = PPL_TEMPLATE;
  }

  const scaledTemplate = profile.trainingAge === 'beginner'
    ? applyBeginnerVolume(template)
    : template;

  const { tdee, ...macros } = calculateMacros(profile);

  return {
    splitName: scaledTemplate.label,
    days: scaledTemplate.days,
    macros,
    tdee,
  };
}

export function getTrainingDayIndex(
  days: TrainingDay[],
  completedCount: number
): number {
  const trainingDays = days
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => !d.isRest);
  if (trainingDays.length === 0) return 0;
  return trainingDays[completedCount % trainingDays.length].i;
}

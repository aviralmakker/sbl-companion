import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import type { Gender, TrainingAge, ActivityLevel, Equipment, Goal, DietType, UserProfile, TrainingDay, Macros } from '../../types';
import { GOAL_LABELS, calculateMacros } from '../../utils/macroCalculator';
import { generateProgram, DAY_TEMPLATES, DAY_TYPE_LABELS } from '../../utils/programGenerator';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';

type OnboardStep =
  | 'landing' | 'mode'
  | 'gender' | 'calorie_calc' | 'training_age' | 'days'
  | 'session_length' | 'equipment' | 'body_fat' | 'goal' | 'diet'
  | 'plan_ready';

const COACH_SEQUENCE: OnboardStep[] = [
  'gender', 'calorie_calc', 'training_age', 'days',
  'session_length', 'equipment', 'body_fat', 'goal', 'diet', 'plan_ready',
];

interface Draft {
  name: string;
  gender: Gender;
  age: string;
  height: string;
  weight: string;
  activityLevel: ActivityLevel;
  trainingAge: TrainingAge;
  daysPerWeek: number;
  sessionLength: number;
  equipment: Equipment;
  bodyFatPercent: number;
  goal: Goal;
  dietType: DietType;
}

const DEFAULT_DRAFT: Draft = {
  name: '',
  gender: 'male', age: '', height: '', weight: '',
  activityLevel: 'moderate', trainingAge: 'beginner',
  daysPerWeek: 4, sessionLength: 60, equipment: 'full_gym',
  bodyFatPercent: 20, goal: 'lean_bulk', dietType: 'non_veg',
};

function getGoalRec(bf: number, gender: Gender): { goal: Goal; reason: string } {
  if (gender === 'male') {
    if (bf < 12) return { goal: 'lean_bulk', reason: 'Sub-12% is prime lean-bulk territory — anabolic environment is optimal.' };
    if (bf < 17) return { goal: 'lean_bulk', reason: '12–17% is the sweet spot for lean bulking.' };
    if (bf < 22) return { goal: 'recomp', reason: '17–22% responds well to recomposition.' };
    if (bf < 28) return { goal: 'slow_cut', reason: '22–28% warrants a measured cut.' };
    return { goal: 'aggressive_cut', reason: 'At 28%+ body fat, an aggressive cut is recommended.' };
  } else {
    if (bf < 20) return { goal: 'lean_bulk', reason: 'Sub-20% is ideal for lean bulking.' };
    if (bf < 25) return { goal: 'lean_bulk', reason: '20–25% is well-suited for lean bulking.' };
    if (bf < 30) return { goal: 'recomp', reason: '25–30% responds well to recomposition.' };
    if (bf < 36) return { goal: 'slow_cut', reason: '30–36%: a sustainable cut is recommended.' };
    return { goal: 'aggressive_cut', reason: 'Above 36% body fat, an aggressive cut is advised.' };
  }
}

// ─── Macro Editor Sheet ───────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function MacroEditorSheet({
  visible, onClose, weight, tdee, initial, onApply,
}: {
  visible: boolean; onClose: () => void;
  weight: number; tdee: number;
  initial: Macros;
  onApply: (m: Macros) => void;
}) {
  const [calories, setCalories] = useState(initial.calories);
  const [protein, setProtein]   = useState(initial.protein);
  const [fat, setFat]           = useState(initial.fat);

  const proteinMin = Math.round(weight * 1.0); const proteinMax = Math.round(weight * 3.0);
  const fatMin     = Math.round(weight * 0.4); const fatMax     = Math.round(weight * 1.5);
  const calMin = 1200; const calMax = Math.max(tdee + 1000, 4500);
  const carbsCals = calories - protein * 4 - fat * 9;
  const carbs = Math.max(0, Math.round(carbsCals / 4));
  const carbsNeg = carbsCals < 0;
  const calDiff = calories - tdee;
  const calLabel = calDiff < -150 ? 'FAT LOSS' : calDiff > 150 ? 'MUSCLE GAIN' : 'MAINTENANCE';
  const calColor = calDiff < -150 ? Colors.accent3 : calDiff > 150 ? Colors.green : Colors.accent2;
  const proteinRec = { min: Math.round(weight * 1.6), max: Math.round(weight * 2.0) };
  const fatRec     = { min: Math.round(weight * 0.66), max: Math.round(weight * 1.1) };

  function pctFill(val: number, min: number, max: number) {
    return Math.round(((val - min) / (max - min)) * 100);
  }

  function StepSlider({ val, min_, max_, color, step, onChange }: { val: number; min_: number; max_: number; color: string; step: number; onChange: (v: number) => void }) {
    const steps = Math.ceil((max_ - min_) / step);
    const curr = Math.round((val - min_) / step);
    return (
      <View style={{ flexDirection: 'row', gap: 2, marginVertical: 6 }}>
        {Array.from({ length: Math.min(steps + 1, 20) }, (_, i) => {
          const ratio = i / Math.min(steps, 19);
          const v = Math.round(min_ + ratio * (max_ - min_));
          const active = val >= v;
          return (
            <TouchableOpacity
              key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: active ? color : Colors.bg5 }}
              onPress={() => onChange(v)}
            />
          );
        })}
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[sheetStyles.sheet, { paddingTop: 16 }]}>
        <View style={sheetStyles.handle} />
        <View style={sheetStyles.sheetHeader}>
          <View>
            <Text style={sheetStyles.sheetTitle}>EDIT DAILY MACROS</Text>
            <Text style={sheetStyles.sheetSub}>TDEE: {tdee} KCAL</Text>
          </View>
          <TouchableOpacity onPress={onClose}><Text style={sheetStyles.closeBtn}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={sheetStyles.sheetBody} showsVerticalScrollIndicator={false}>
          {/* Calories */}
          <View style={sheetStyles.macroBlock}>
            <View style={sheetStyles.macroRow_}>
              <View>
                <Text style={sheetStyles.macroLabel_}>Daily Calories</Text>
                <Text style={[sheetStyles.macroStatus, { color: calColor }]}>{calLabel} · {calDiff > 0 ? '+' : ''}{calDiff} kcal vs TDEE</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[sheetStyles.macroVal, { color: Colors.accent }]}>{calories}</Text>
                <Text style={sheetStyles.macroUnit}>kcal/day</Text>
              </View>
            </View>
            <StepSlider val={calories} min_={calMin} max_={calMax} color={Colors.accent} step={50} onChange={setCalories} />
            <View style={sheetStyles.sliderLabels_}>
              <Text style={sheetStyles.sliderLabel_}>{calMin}</Text>
              <Text style={sheetStyles.sliderLabel_}>TDEE {tdee}</Text>
              <Text style={sheetStyles.sliderLabel_}>{calMax}</Text>
            </View>
          </View>

          {/* Protein */}
          <View style={sheetStyles.macroBlock}>
            <View style={sheetStyles.macroRow_}>
              <View>
                <Text style={sheetStyles.macroLabel_}>Protein</Text>
                <Text style={[sheetStyles.macroStatus, { color: (protein >= proteinRec.min && protein <= proteinRec.max) ? Colors.green : Colors.accent3 }]}>
                  {protein >= proteinRec.min && protein <= proteinRec.max ? `✓ In range (${proteinRec.min}–${proteinRec.max}g)` : `Optimal: ${proteinRec.min}–${proteinRec.max}g`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[sheetStyles.macroVal, { color: Colors.accent2 }]}>{protein}g</Text>
                <Text style={sheetStyles.macroUnit}>{(protein / weight).toFixed(1)} g/kg</Text>
              </View>
            </View>
            <StepSlider val={protein} min_={proteinMin} max_={proteinMax} color={Colors.accent2} step={1} onChange={(v) => setProtein(clamp(v, proteinMin, proteinMax))} />
          </View>

          {/* Fat */}
          <View style={sheetStyles.macroBlock}>
            <View style={sheetStyles.macroRow_}>
              <View>
                <Text style={sheetStyles.macroLabel_}>Fat</Text>
                <Text style={[sheetStyles.macroStatus, { color: (fat >= fatRec.min && fat <= fatRec.max) ? Colors.green : Colors.accent3 }]}>
                  {fat >= fatRec.min && fat <= fatRec.max ? `✓ In range (${fatRec.min}–${fatRec.max}g)` : `Optimal: ${fatRec.min}–${fatRec.max}g`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[sheetStyles.macroVal, { color: Colors.accent3 }]}>{fat}g</Text>
                <Text style={sheetStyles.macroUnit}>{(fat / weight).toFixed(2)} g/kg</Text>
              </View>
            </View>
            <StepSlider val={fat} min_={fatMin} max_={fatMax} color={Colors.accent3} step={1} onChange={(v) => setFat(clamp(v, fatMin, fatMax))} />
          </View>

          {/* Carbs auto */}
          <View style={sheetStyles.macroBlock}>
            <View style={sheetStyles.macroRow_}>
              <Text style={sheetStyles.macroLabel_}>Carbohydrates</Text>
              <Text style={[sheetStyles.macroVal, { color: carbsNeg ? Colors.red : Colors.accent }]}>{carbsNeg ? '—' : `${carbs}g`}</Text>
            </View>
            <Text style={[sheetStyles.macroUnit, { marginTop: 4 }]}>
              {carbsNeg ? 'Protein + fat exceeds calorie target — reduce one' : 'Fills remaining calories automatically'}
            </Text>
          </View>

          {carbsNeg && (
            <View style={sheetStyles.warnBox}>
              <Text style={sheetStyles.warnText}>⚠ Protein + fat exceeds your calorie target. Reduce protein or fat before applying.</Text>
            </View>
          )}
        </ScrollView>
        <View style={sheetStyles.sheetFooter}>
          <TouchableOpacity style={[sheetStyles.applyBtn, carbsNeg && { opacity: 0.4 }]} onPress={() => { if (!carbsNeg) { onApply({ calories, protein, fat, carbs, fiber: 30 }); onClose(); } }}>
            <Text style={sheetStyles.applyBtnText}>Apply Changes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sheetStyles.resetBtn} onPress={() => { setCalories(initial.calories); setProtein(initial.protein); setFat(initial.fat); }}>
            <Text style={sheetStyles.resetBtnText}>Reset to Recommended</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Plan Editor Sheet ────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_OPTIONS = Object.entries(DAY_TYPE_LABELS).map(([key, label]) => ({ key, label }));

function PlanEditorSheet({
  visible, onClose, currentDays, onApply,
}: {
  visible: boolean; onClose: () => void;
  currentDays: TrainingDay[];
  onApply: (days: TrainingDay[]) => void;
}) {
  function getDayKey(day: TrainingDay): string {
    if (day.isRest) return 'rest';
    for (const [key, template] of Object.entries(DAY_TEMPLATES)) {
      if (key !== 'rest' && template.label === day.label) return key;
    }
    return 'rest';
  }

  const base7 = [...currentDays.slice(0, 7)];
  while (base7.length < 7) base7.push({ label: 'Rest', muscleGroups: [], isRest: true, exercises: [] });
  const [assignments, setAssignments] = useState(base7.map((d) => getDayKey(d)));

  function handleApply() {
    const days: TrainingDay[] = assignments.map((key) => {
      const t = DAY_TEMPLATES[key] ?? DAY_TEMPLATES.rest;
      return { ...t, exercises: [...t.exercises] } as TrainingDay;
    });
    onApply(days);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[sheetStyles.sheet, { paddingTop: 16 }]}>
        <View style={sheetStyles.handle} />
        <View style={sheetStyles.sheetHeader}>
          <View>
            <Text style={sheetStyles.sheetTitle}>EDIT WORKOUT PLAN</Text>
            <Text style={sheetStyles.sheetSub}>ASSIGN A SESSION TO EACH DAY</Text>
          </View>
          <TouchableOpacity onPress={onClose}><Text style={sheetStyles.closeBtn}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={sheetStyles.sheetBody} showsVerticalScrollIndicator={false}>
          {assignments.map((key, i) => {
            const isRest = key === 'rest';
            const template = DAY_TEMPLATES[key];
            return (
              <View key={i} style={[sheetStyles.dayRow, !isRest && sheetStyles.dayRowActive]}>
                <View style={[sheetStyles.dayChip_, isRest ? sheetStyles.dayChipRest : sheetStyles.dayChipActive_]}>
                  <Text style={sheetStyles.dayChipText_}>{DAY_NAMES[i]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {DAY_OPTIONS.map(({ key: k, label }) => (
                      <TouchableOpacity
                        key={k}
                        style={[sheetStyles.dayOption, key === k && sheetStyles.dayOptionActive]}
                        onPress={() => setAssignments((prev) => prev.map((a, idx) => idx === i ? k : a))}
                      >
                        <Text style={[sheetStyles.dayOptionText, key === k && sheetStyles.dayOptionTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {!isRest && template && (
                    <Text style={sheetStyles.dayMeta_}>{template.muscleGroups.join(' · ').toUpperCase()} · {template.exercises.length} exercises</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
        <View style={sheetStyles.sheetFooter}>
          <TouchableOpacity style={sheetStyles.applyBtn} onPress={handleApply}>
            <Text style={sheetStyles.applyBtnText}>Apply Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sheetStyles.resetBtn} onPress={() => setAssignments(base7.map((d) => getDayKey(d)))}>
            <Text style={sheetStyles.resetBtnText}>Reset to Current</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function OptionCard({ title, subtitle, badge, selected, recommended, onPress }: {
  title: string; subtitle: string; badge?: string;
  selected: boolean; recommended?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.optionCard, selected && styles.optionCardSelected]} onPress={onPress} activeOpacity={0.7}>
      {recommended && (
        <View style={styles.recBadge}>
          <Text style={styles.recBadgeText}>RECOMMENDED</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={[styles.optionTitle, { flex: 1 }]}>{title}</Text>
        {badge && <Text style={styles.optionBadge}>{badge}</Text>}
      </View>
      <Text style={styles.optionSub}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Onboarding Screen ───────────────────────────────────────────────────

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const updateMacros = useStore((s) => s.updateMacros);
  const updateProgramDays = useStore((s) => s.updateProgramDays);

  const [step, setStep] = useState<OnboardStep>('landing');
  const [stepIndex, setStepIndex] = useState(-1);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [macroOverrides, setMacroOverrides] = useState<Macros | null>(null);
  const [customDays, setCustomDays] = useState<TrainingDay[] | null>(null);
  const [macroEditorOpen, setMacroEditorOpen] = useState(false);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);

  function goNext() {
    if (step === 'landing') { setStep('mode'); return; }
    const nextIdx = stepIndex + 1;
    if (nextIdx < COACH_SEQUENCE.length) { setStep(COACH_SEQUENCE[nextIdx]); setStepIndex(nextIdx); }
  }

  function goBack() {
    if (step === 'mode') { setStep('landing'); return; }
    if (step === 'plan_ready') { setStep('mode'); setStepIndex(-1); return; }
    if (stepIndex <= 0) { setStep('mode'); setStepIndex(-1); return; }
    setStep(COACH_SEQUENCE[stepIndex - 1]);
    setStepIndex(stepIndex - 1);
  }

  function startCoach() { setStep(COACH_SEQUENCE[0]); setStepIndex(0); }
  function startFreestyle() { setStep('plan_ready'); setStepIndex(COACH_SEQUENCE.length - 1); }

  function buildProfile(): UserProfile {
    return {
      name: draft.name || 'Athlete',
      gender: draft.gender,
      age: Math.max(14, Math.min(70, parseInt(draft.age) || 24)),
      height: Math.max(140, Math.min(220, parseInt(draft.height) || 175)),
      weight: Math.max(30, Math.min(200, parseFloat(draft.weight) || 70)),
      activityLevel: draft.activityLevel,
      trainingAge: draft.trainingAge,
      daysPerWeek: draft.daysPerWeek,
      sessionLength: draft.sessionLength,
      equipment: draft.equipment,
      bodyFatPercent: draft.bodyFatPercent,
      goal: draft.goal,
      dietType: draft.dietType,
    };
  }

  function handleLaunch() {
    const profile = buildProfile();
    completeOnboarding(profile);
    if (macroOverrides) updateMacros(macroOverrides);
    if (customDays) updateProgramDays(customDays);
  }

  function canProceed(): boolean {
    switch (step) {
      case 'gender': case 'training_age': case 'days': case 'session_length':
      case 'equipment': case 'body_fat': case 'goal': case 'diet': return true;
      case 'calorie_calc': {
        const age = parseInt(draft.age), height = parseInt(draft.height), weight = parseFloat(draft.weight);
        return !isNaN(age) && age >= 14 && age <= 70 && !isNaN(height) && height >= 140 && height <= 220 && !isNaN(weight) && weight >= 30 && weight <= 200;
      }
      default: return false;
    }
  }

  const totalCoachSteps = COACH_SEQUENCE.length - 1;
  const progressPct = stepIndex >= 0 ? (stepIndex / totalCoachSteps) : 0;

  // ─── LANDING ────────────────────────────────────────────────────────────────
  if (step === 'landing') {
    return (
      <View style={[styles.shell, { paddingTop: insets.top }]}>
        <View style={styles.landingTop}>
          <Text style={styles.logo}>SBL</Text>
          <Text style={styles.logoSub}>SCIENCE-BASED LIFTING</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.landingBody} showsVerticalScrollIndicator={false}>
          <Text style={styles.headline}>REPLACE YOUR{'\n'}<Text style={{ color: Colors.accent }}>FITNESS</Text>{'\n'}<Text style={{ color: Colors.accent3 }}>STACK.</Text></Text>
          <Text style={styles.landingDesc}>One app for workouts, nutrition, and progressive overload — built for Indian gym-goers with evidence-based science at its core.</Text>
          <View style={{ gap: 20 }}>
            {[
              { icon: '🧬', title: 'Evidence-Based Programming', desc: 'Splits ranked by Stimulus-to-Fatigue Ratio (SFR). Grounded in peer-reviewed hypertrophy research.' },
              { icon: '🍛', title: 'Indian Food Database', desc: 'Log dal, paneer, chicken tikka, and 30+ staples with pre-calculated macros.' },
              { icon: '📈', title: 'Auto Progressive Overload', desc: 'Weight bumps automatically when you hit your rep ceiling. No spreadsheets.' },
              { icon: '⚡', title: 'Peri-Workout Nutrition', desc: 'Pre, intra, and post-workout meal slots timed to your session for maximum MPS.' },
            ].map(({ icon, title, desc }) => (
              <View key={title} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 24, flexShrink: 0 }}>{icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{title}</Text>
                  <Text style={styles.featureDesc}>{desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={[styles.landingFooter, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.btnPrimary} onPress={() => setStep('mode')} activeOpacity={0.8}>
            <Text style={styles.btnPrimaryText}>Get Started →</Text>
          </TouchableOpacity>
          <Text style={styles.landingNote}>ALL DATA LOCAL · NO ACCOUNT NEEDED</Text>
        </View>
      </View>
    );
  }

  // ─── MODE SELECT ─────────────────────────────────────────────────────────────
  if (step === 'mode') {
    return (
      <View style={[styles.shell, { paddingTop: insets.top }]}>
        <View style={styles.onboardHeader}>
          <Text style={styles.logo}>SBL</Text>
          <TouchableOpacity onPress={goBack}><Text style={styles.backBtn}>←</Text></TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.onboardBody, { paddingBottom: 40 }]} showsVerticalScrollIndicator={false}>
          <Text style={styles.stepLabel}>HOW TO START</Text>
          <Text style={styles.stepQ}>Pick your{'\n'}path.</Text>
          <Text style={styles.stepSub}>Build Programme walks you through a coaching assessment. Jump In gives you instant access with a solid default plan.</Text>
          <View style={{ gap: 10 }}>
            <OptionCard title="Build My Programme" subtitle="Answer a science-based questionnaire to get a fully personalised split, TDEE calculation, and daily macro targets." badge="~4 MINUTES" selected={false} recommended onPress={startCoach} />
            <OptionCard title="Use Default Programme" subtitle="Start with an evidence-based 4-day Upper/Lower template and 2,100 kcal baseline. Customise before launching." selected={false} onPress={startFreestyle} />
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─── PLAN READY ──────────────────────────────────────────────────────────────
  if (step === 'plan_ready') {
    const profile = buildProfile();
    const program = generateProgram(profile);
    const { tdee, ...baseMacros } = calculateMacros(profile);
    const displayMacros = macroOverrides ?? baseMacros;
    const displayDays = customDays ?? program.days;

    return (
      <View style={[styles.shell, { paddingTop: insets.top }]}>
        <MacroEditorSheet
          visible={macroEditorOpen}
          onClose={() => setMacroEditorOpen(false)}
          weight={parseFloat(draft.weight) || 70}
          tdee={tdee}
          initial={displayMacros}
          onApply={(m) => setMacroOverrides(m)}
        />
        <PlanEditorSheet
          visible={planEditorOpen}
          onClose={() => setPlanEditorOpen(false)}
          currentDays={displayDays}
          onApply={(days) => setCustomDays(days)}
        />

        <View style={styles.onboardHeader}>
          <Text style={styles.logo}>SBL</Text>
          <TouchableOpacity onPress={goBack}><Text style={styles.backBtn}>←</Text></TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.onboardBody, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
          <Text style={styles.stepLabel}>YOUR PROGRAMME IS READY</Text>
          <Text style={styles.planName}>{program.splitName.split('(')[0].trim()}</Text>
          <Text style={styles.planSub}>STIMULUS-TO-FATIGUE RATIO RANKED · DOUBLE PROGRESSION</Text>

          {/* Macros card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardLabel}>DAILY MACROS</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {macroOverrides && <View style={styles.editedBadge}><Text style={styles.editedBadgeText}>EDITED</Text></View>}
                <Text style={styles.goalTag}>{GOAL_LABELS[draft.goal]}</Text>
              </View>
            </View>
            {[
              { label: 'TDEE', val: `${tdee}`, unit: 'kcal maintenance', color: Colors.text2 },
              { label: 'TARGET CALORIES', val: `${displayMacros.calories}`, unit: 'kcal/day', color: Colors.accent },
              { label: 'PROTEIN', val: `${displayMacros.protein}g`, unit: '1.6–2.0 g/kg', color: Colors.accent2 },
              { label: 'CARBS', val: `${displayMacros.carbs}g`, unit: 'fills remaining', color: Colors.accent },
              { label: 'FAT', val: `${displayMacros.fat}g`, unit: '0.3–0.5 g/lb', color: Colors.accent3 },
            ].map(({ label, val, unit, color }, idx, arr) => (
              <View key={label} style={[styles.planStatRow, idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}>
                <Text style={styles.planStatLabel}>{label}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.planStatVal, { color }]}>{val}</Text>
                  <Text style={styles.planStatUnit}>{unit}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Schedule card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardLabel}>WEEKLY SCHEDULE</Text>
              {customDays && <View style={styles.editedBadge}><Text style={styles.editedBadgeText}>EDITED</Text></View>}
            </View>
            {displayDays.map((day, i) => (
              <View key={i} style={[styles.scheduleRow, i < displayDays.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}>
                <Text style={styles.scheduleDayNum}>D{i + 1}</Text>
                <Text style={[styles.scheduleDayName, day.isRest && { color: Colors.text3 }]}>{day.label}</Text>
                {!day.isRest && <Text style={styles.scheduleMeta}>{day.muscleGroups.slice(0, 2).join(' · ').toUpperCase()}</Text>}
              </View>
            ))}
          </View>

          {/* Edit buttons */}
          <View style={styles.editBtnsRow}>
            <TouchableOpacity style={styles.editBtn} onPress={() => setMacroEditorOpen(true)} activeOpacity={0.7}>
              <Text style={styles.editBtnText}>✎ Edit Macros</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editBtn} onPress={() => setPlanEditorOpen(true)} activeOpacity={0.7}>
              <Text style={styles.editBtnText}>✎ Edit Plan</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={[styles.onboardFooter, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.btnPrimary} onPress={handleLaunch} activeOpacity={0.8}>
            <Text style={styles.btnPrimaryText}>Launch FitOS →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── COACH QUESTIONNAIRE ──────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.shell, { paddingTop: insets.top }]}>
        <View style={styles.onboardHeader}>
          <Text style={styles.logo}>SBL</Text>
          <Text style={styles.stepCount}>{stepIndex + 1} / {totalCoachSteps}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct * 100}%` as any }]} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.onboardBody, { paddingBottom: 110 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {step === 'gender' && (<>
            <Text style={styles.stepLabel}>ABOUT YOU</Text>
            <Text style={styles.stepQ}>Biological sex?</Text>
            <Text style={styles.stepSub}>Used for your BMR calculation via the Mifflin-St Jeor formula.</Text>
            <View style={{ gap: 8 }}>
              {([{ value: 'male' as Gender, label: 'Male', sub: 'BMR offset: +5 kcal' }, { value: 'female' as Gender, label: 'Female', sub: 'BMR offset: −161 kcal' }]).map(({ value, label, sub }) => (
                <OptionCard key={value} title={label} subtitle={sub} selected={draft.gender === value} onPress={() => setDraft((d) => ({ ...d, gender: value }))} />
              ))}
            </View>
          </>)}

          {step === 'calorie_calc' && (<>
            <Text style={styles.stepLabel}>MAINTENANCE CALORIES</Text>
            <Text style={styles.stepQ}>Your body{'\n'}stats.</Text>
            <Text style={styles.stepSub}>Calculates your TDEE using the Mifflin-St Jeor BMR formula.</Text>
            {[
              { label: 'NAME', key: 'name' as keyof Draft, placeholder: 'Your name', kb: 'default' as const },
              { label: 'AGE', key: 'age' as keyof Draft, placeholder: 'e.g. 24', kb: 'numeric' as const },
              { label: 'WEIGHT (kg)', key: 'weight' as keyof Draft, placeholder: 'e.g. 72', kb: 'decimal-pad' as const },
              { label: 'HEIGHT (cm)', key: 'height' as keyof Draft, placeholder: 'e.g. 175', kb: 'numeric' as const },
            ].map(({ label, key, placeholder, kb }) => (
              <View key={key} style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <TextInput style={styles.textInput} placeholder={placeholder} placeholderTextColor={Colors.text3} keyboardType={kb} value={String(draft[key])} onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v }))} />
              </View>
            ))}
            <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>DAILY ACTIVITY LEVEL</Text>
            <View style={{ gap: 8 }}>
              {([
                { value: 'sedentary' as ActivityLevel, label: 'Sedentary', sub: 'Desk job. <5,000 steps/day. ×1.2' },
                { value: 'light' as ActivityLevel, label: 'Lightly Active', sub: '5–7.5k steps/day. ×1.375' },
                { value: 'moderate' as ActivityLevel, label: 'Moderately Active', sub: '7.5–10k steps. ×1.55' },
                { value: 'active' as ActivityLevel, label: 'Very Active', sub: '10k+ steps. ×1.725' },
              ]).map(({ value, label, sub }) => (
                <OptionCard key={value} title={label} subtitle={sub} selected={draft.activityLevel === value} onPress={() => setDraft((d) => ({ ...d, activityLevel: value }))} />
              ))}
            </View>
          </>)}

          {step === 'training_age' && (<>
            <Text style={styles.stepLabel}>TRAINING BACKGROUND</Text>
            <Text style={styles.stepQ}>How long have{'\n'}you been training?</Text>
            <Text style={styles.stepSub}>Training age determines your capacity to generate effort per set.</Text>
            <View style={{ gap: 8 }}>
              {([
                { value: 'beginner' as TrainingAge, label: 'Beginner — Under 1 Year', sub: 'New to structured training. SBL adds extra sets to match effective stimulus.' },
                { value: 'intermediate' as TrainingAge, label: 'Intermediate — 1 to 3 Years', sub: 'Solid base. Periodisation and proximity to failure drive adaptation now.' },
                { value: 'advanced' as TrainingAge, label: 'Advanced — 3+ Years', sub: 'High training age — you push close to true failure on every set.' },
              ]).map(({ value, label, sub }) => (
                <OptionCard key={value} title={label} subtitle={sub} selected={draft.trainingAge === value} onPress={() => setDraft((d) => ({ ...d, trainingAge: value }))} />
              ))}
            </View>
          </>)}

          {step === 'days' && (<>
            <Text style={styles.stepLabel}>TRAINING SCHEDULE</Text>
            <Text style={styles.stepQ}>Days per{'\n'}week?</Text>
            <Text style={styles.stepSub}>Be realistic — consistent 3 days beats sporadic 6.</Text>
            <View style={{ gap: 8 }}>
              {([
                { value: 3, label: '3 Days', sub: 'Full Body — each muscle 3×/week.' },
                { value: 4, label: '4 Days', sub: 'Upper/Lower — most evidence-backed for intermediates.' },
                { value: 5, label: '5 Days', sub: 'PPL variant — strong frequency-volume balance.' },
                { value: 6, label: '6 Days', sub: 'Full PPL — twice per week. Requires great recovery.' },
              ]).map(({ value, label, sub }) => (
                <OptionCard key={value} title={label} subtitle={sub} selected={draft.daysPerWeek === value} onPress={() => setDraft((d) => ({ ...d, daysPerWeek: value }))} />
              ))}
            </View>
          </>)}

          {step === 'session_length' && (<>
            <Text style={styles.stepLabel}>SESSION DURATION</Text>
            <Text style={styles.stepQ}>How long are{'\n'}your sessions?</Text>
            <Text style={styles.stepSub}>Including warm-up. Determines quality sets before cortisol accumulation.</Text>
            <View style={{ gap: 8 }}>
              {([
                { value: 45, label: '45 Min', rec: false, sub: 'High-density. 3–4 exercises per session.' },
                { value: 60, label: '60 Min', rec: true,  sub: 'Consensus sweet spot. Optimal cortisol-to-anabolic window.' },
                { value: 75, label: '75 Min', rec: false, sub: 'Volume accumulation. 7–9 exercises.' },
                { value: 90, label: '90+ Min', rec: false, sub: 'High-volume. Requires excellent recovery.' },
              ]).map(({ value, label, rec, sub }) => (
                <OptionCard key={value} title={label} subtitle={sub} selected={draft.sessionLength === value} recommended={rec} onPress={() => setDraft((d) => ({ ...d, sessionLength: value }))} />
              ))}
            </View>
          </>)}

          {step === 'equipment' && (<>
            <Text style={styles.stepLabel}>TRAINING SETUP</Text>
            <Text style={styles.stepQ}>What equipment{'\n'}do you have?</Text>
            <Text style={styles.stepSub}>Determines which exercises appear. All use highest-SFR movements for your setup.</Text>
            <View style={{ gap: 8 }}>
              {([
                { value: 'full_gym' as Equipment, label: 'Full Commercial Gym', sub: 'Barbells, dumbbells, cables, Smith machine. Highest-SFR exercises.' },
                { value: 'home' as Equipment, label: 'Home Gym', sub: 'Dumbbells, barbell, bench, pull-up bar. Most high-SFR exercises covered.' },
                { value: 'minimal' as Equipment, label: 'Minimal / Bodyweight', sub: 'Bodyweight, resistance bands. Progressive variations only.' },
              ]).map(({ value, label, sub }) => (
                <OptionCard key={value} title={label} subtitle={sub} selected={draft.equipment === value} onPress={() => setDraft((d) => ({ ...d, equipment: value }))} />
              ))}
            </View>
          </>)}

          {step === 'body_fat' && (<>
            <Text style={styles.stepLabel}>BODY COMPOSITION</Text>
            <Text style={styles.stepQ}>Estimate your{'\n'}body fat %.</Text>
            <Text style={styles.stepSub}>Used to recommend the most effective goal for your current physique.</Text>
            <View style={styles.bfDisplay}>
              <Text style={styles.bfValue}>{draft.bodyFatPercent}</Text>
              <Text style={styles.bfUnit}>% BODY FAT</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 2, marginBottom: 8 }}>
              {[5,8,10,12,15,17,20,22,25,28,30,35,40].filter(v => v >= (draft.gender === 'female' ? 12 : 5)).map((v) => (
                <TouchableOpacity key={v} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: draft.bodyFatPercent >= v ? Colors.accent : Colors.bg5 }} onPress={() => setDraft((d) => ({ ...d, bodyFatPercent: v }))} />
              ))}
            </View>
            <View style={styles.bfChips}>
              {[5,10,12,15,17,20,22,25,28,30,35,40].filter(v => v >= (draft.gender === 'female' ? 12 : 5)).map((v) => (
                <Chip key={v} label={`${v}%`} active={draft.bodyFatPercent === v} onPress={() => setDraft((d) => ({ ...d, bodyFatPercent: v }))} />
              ))}
            </View>
          </>)}

          {step === 'goal' && (() => {
            const rec = getGoalRec(draft.bodyFatPercent, draft.gender);
            return (<>
              <Text style={styles.stepLabel}>PRIMARY GOAL</Text>
              <Text style={styles.stepQ}>What's your{'\n'}goal right now?</Text>
              <View style={styles.recBox}>
                <Text style={styles.recBoxLabel}>RECOMMENDATION · {draft.bodyFatPercent}% BF</Text>
                <Text style={styles.recBoxTitle}>{GOAL_LABELS[rec.goal]}</Text>
                <Text style={styles.recBoxSub}>{rec.reason}</Text>
              </View>
              <View style={{ gap: 8 }}>
                {([
                  { value: 'lean_bulk' as Goal, label: 'Lean Bulk', badge: '+300 kcal', sub: 'Controlled surplus. Maximises MPS while minimising fat spillover.' },
                  { value: 'recomp' as Goal, label: 'Body Recomp', badge: 'Maintenance', sub: 'Simultaneously build muscle and lose fat. Best for beginners.' },
                  { value: 'slow_cut' as Goal, label: 'Slow Cut', badge: '−350 kcal', sub: '0.3–0.5 kg fat loss per week. Preserves nearly all muscle.' },
                  { value: 'aggressive_cut' as Goal, label: 'Aggressive Cut', badge: '−700 kcal', sub: '0.7–1 kg fat loss per week. High protein critical.' },
                ]).map(({ value, label, badge, sub }) => (
                  <OptionCard key={value} title={label} subtitle={sub} badge={badge} selected={draft.goal === value} recommended={rec.goal === value} onPress={() => setDraft((d) => ({ ...d, goal: value }))} />
                ))}
              </View>
            </>);
          })()}

          {step === 'diet' && (<>
            <Text style={styles.stepLabel}>DIETARY PREFERENCE</Text>
            <Text style={styles.stepQ}>What do{'\n'}you eat?</Text>
            <Text style={styles.stepSub}>Filters the Indian food database. Only relevant foods appear in search.</Text>
            <View style={{ gap: 8 }}>
              {([
                { value: 'vegetarian' as DietType, label: 'Vegetarian 🥦', sub: 'No meat, poultry, or seafood. Paneer, dal, tofu, milk, curd, lentils.' },
                { value: 'eggetarian' as DietType, label: 'Eggetarian 🥚', sub: 'Vegetarian with eggs. Eggs score 1.0 DIAAS — excellent for MPS.' },
                { value: 'non_veg' as DietType, label: 'Non-Vegetarian 🍗', sub: 'All food groups. Easiest to hit 2 g/kg protein consistently.' },
              ]).map(({ value, label, sub }) => (
                <OptionCard key={value} title={label} subtitle={sub} selected={draft.dietType === value} onPress={() => setDraft((d) => ({ ...d, dietType: value }))} />
              ))}
            </View>
          </>)}

        </ScrollView>

        <View style={[styles.onboardFooter, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.btnSecondary} onPress={goBack} activeOpacity={0.7}>
            <Text style={styles.btnSecondaryText}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }, !canProceed() && styles.btnDisabled]} onPress={goNext} disabled={!canProceed()} activeOpacity={0.8}>
            <Text style={styles.btnPrimaryText}>{step === 'diet' ? 'Generate Programme →' : 'Next →'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Sheet styles ─────────────────────────────────────────────────────────────
const sheetStyles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.bg3 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.bg5, alignSelf: 'center', marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetTitle: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, letterSpacing: 1 },
  sheetSub: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5, marginTop: 2 },
  closeBtn: { fontSize: 18, color: Colors.text3, padding: 4 },
  sheetBody: { padding: 20, gap: 4, paddingBottom: 16 },
  sheetFooter: { padding: 20, gap: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  macroBlock: { marginBottom: 20 },
  macroRow_: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 },
  macroLabel_: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, fontWeight: '700', marginBottom: 2 },
  macroStatus: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.3 },
  macroVal: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 30 },
  macroUnit: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  sliderLabels_: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  sliderLabel_: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  warnBox: { backgroundColor: 'rgba(255,92,92,0.08)', borderWidth: 1, borderColor: 'rgba(255,92,92,0.25)', borderRadius: 8, padding: 12, marginTop: 8 },
  warnText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.red },
  applyBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  applyBtnText: { fontFamily: Fonts.mono, fontSize: 14, color: '#fff', fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
  resetBtn: { backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  resetBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.text2, letterSpacing: 0.5, textAlign: 'center' },
  dayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, marginBottom: 8 },
  dayRowActive: { borderColor: 'rgba(79,142,247,0.3)' },
  dayChip_: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  dayChipRest: { backgroundColor: Colors.text3 },
  dayChipActive_: { backgroundColor: Colors.accent },
  dayChipText_: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.bg, letterSpacing: 0.5, textAlign: 'center' },
  dayOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.bg5, borderWidth: 1, borderColor: Colors.border },
  dayOptionActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dayOptionText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  dayOptionTextActive: { color: '#fff' },
  dayMeta_: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, marginTop: 6, letterSpacing: 0.3 },
});

// ─── Screen styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: Colors.bg3 },
  landingTop: { paddingHorizontal: 24, paddingTop: 36 },
  logo: { fontFamily: Fonts.display, fontSize: 28, color: Colors.accent, letterSpacing: 2 },
  logoSub: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accent3, letterSpacing: 2, marginTop: 2 },
  landingBody: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },
  headline: { fontFamily: Fonts.display, fontSize: 40, color: Colors.text, letterSpacing: 1, lineHeight: 46, marginBottom: 14 },
  landingDesc: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text2, lineHeight: 22, marginBottom: 28 },
  featureTitle: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, fontWeight: '700', marginBottom: 3 },
  featureDesc: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.text2, lineHeight: 17 },
  landingFooter: { padding: 24, borderTopWidth: 1, borderTopColor: Colors.border, gap: 10 },
  landingNote: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, textAlign: 'center', letterSpacing: 0.5 },
  onboardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  stepCount: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3 },
  backBtn: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text2, paddingHorizontal: 4 },
  progressTrack: { height: 3, backgroundColor: Colors.bg5 },
  progressFill: { height: '100%', backgroundColor: Colors.accent },
  onboardBody: { padding: 20, gap: 12 },
  stepLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accent, letterSpacing: 1 },
  stepQ: { fontFamily: Fonts.display, fontSize: 30, color: Colors.text, lineHeight: 34 },
  stepSub: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text2, lineHeight: 19 },
  optionCard: { backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, gap: 6 },
  optionCardSelected: { borderColor: Colors.accent, borderWidth: 2, backgroundColor: 'rgba(79,142,247,0.07)' },
  optionTitle: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, fontWeight: '700' },
  optionBadge: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.3, flexShrink: 0 },
  optionSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.text2, lineHeight: 17 },
  recBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(79,142,247,0.14)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 6 },
  recBadgeText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.accent, letterSpacing: 1, fontWeight: '700' },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },
  textInput: { backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Fonts.sans, fontSize: 16, color: Colors.text },
  bfDisplay: { alignItems: 'center', marginBottom: 16 },
  bfValue: { fontFamily: Fonts.display, fontSize: 72, color: Colors.accent, lineHeight: 78 },
  bfUnit: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.text3, letterSpacing: 1 },
  bfChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3 },
  chipTextActive: { color: '#fff' },
  recBox: { backgroundColor: 'rgba(61,214,140,0.06)', borderWidth: 1, borderColor: 'rgba(61,214,140,0.25)', borderRadius: 12, padding: 14 },
  recBoxLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.green, letterSpacing: 0.5, marginBottom: 4 },
  recBoxTitle: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, fontWeight: '700', marginBottom: 4 },
  recBoxSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.text2, lineHeight: 17 },
  planName: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, letterSpacing: 0.5 },
  planSub: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },
  card: { backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 16 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },
  editedBadge: { backgroundColor: 'rgba(79,142,247,0.12)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  editedBadgeText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.accent, letterSpacing: 0.5 },
  goalTag: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  planStatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  planStatLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.3, flex: 1 },
  planStatVal: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text },
  planStatUnit: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, textAlign: 'right' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  scheduleDayNum: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, minWidth: 24 },
  scheduleDayName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text, fontWeight: '600', flex: 1 },
  scheduleMeta: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  editBtnsRow: { flexDirection: 'row', gap: 10 },
  editBtn: { flex: 1, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  editBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.text2, letterSpacing: 0.5, textAlign: 'center' },
  onboardFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bg3 },
  btnPrimary: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { fontFamily: Fonts.mono, fontSize: 14, color: '#fff', fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
  btnSecondary: { backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { fontFamily: Fonts.sans, fontSize: 20, color: Colors.text2, textAlign: 'center' },
  btnDisabled: { opacity: 0.45 },
});

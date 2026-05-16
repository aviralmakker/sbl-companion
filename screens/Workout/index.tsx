import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, FlatList, Alert, Vibration, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import { getTrainingDayIndex } from '../../utils/programGenerator';
import { getExerciseById, exerciseLibrary } from '../../data/exercises';
import { getDayProgressionFlags } from '../../services/progressionService';
import type { TrainingDay, Exercise, Equipment, CustomProgram } from '../../types';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';

// ─── Types ────────────────────────────────────────────────────────────────────

type SetType = 'normal' | 'warmup' | 'drop' | 'failure';
type SetRow = { weight: string; reps: string; checked: boolean; type: SetType };
type RowsMap = Record<string, SetRow[]>;
type WorkoutView = 'list' | 'session';

const SET_TYPE_CYCLE: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
const SET_TYPE_LABEL: Record<SetType, string> = { normal: 'N', warmup: 'W', drop: 'D', failure: 'F' };
const SET_TYPE_COLOR: Record<SetType, string> = {
  normal: Colors.text3, warmup: Colors.accent, drop: Colors.accent2, failure: Colors.accent3,
};

// ─── Utils ────────────────────────────────────────────────────────────────────

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function estimateDuration(day: TrainingDay) {
  const totalSets = day.exercises.reduce((a, e) => a + e.sets, 0);
  return Math.round((totalSets * 2.5) / 5) * 5;
}

function lastPerformed(logs: { date: string; dayIndex: number }[], dayIndex: number): string | null {
  const matching = logs.filter((l) => l.dayIndex === dayIndex).map((l) => l.date);
  if (!matching.length) return null;
  const latest = matching.sort().at(-1)!;
  const diff = Math.round((Date.now() - new Date(latest + 'T00:00:00').getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return new Date(latest + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ─── Session View ─────────────────────────────────────────────────────────────

function SessionView({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const program = useStore((s) => s.currentProgram);
  const currentSession = useStore((s) => s.currentSession);
  const exerciseProgress = useStore((s) => s.exerciseProgress);
  const logSet = useStore((s) => s.logSet);
  const removeSet = useStore((s) => s.removeSet);
  const completeSession = useStore((s) => s.completeSession);
  const abandonSession = useStore((s) => s.abandonSession);

  const [setRows, setSetRows] = useState<RowsMap>({});
  const [elapsed, setElapsed] = useState(0);
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [restTarget, setRestTarget] = useState(90);
  const [showFinish, setShowFinish] = useState(false);
  const [showAddEx, setShowAddEx] = useState(false);
  const [addExSearch, setAddExSearch] = useState('');
  const [addExFilter, setAddExFilter] = useState<string | null>(null);
  const [exMenuFor, setExMenuFor] = useState<string | null>(null);

  // Init set rows when session starts
  useEffect(() => {
    if (!currentSession || !program) { setSetRows({}); return; }
    const day = program.days[currentSession.dayIndex];
    const rows: RowsMap = {};
    day.exercises.forEach(({ exerciseId, sets }) => {
      const prog = exerciseProgress[exerciseId];
      const ex = getExerciseById(exerciseId);
      const w = prog?.currentWeight ?? ex?.defaultWeight ?? 0;
      rows[exerciseId] = Array.from({ length: sets }, () => ({
        weight: w > 0 ? String(w) : '', reps: '', checked: false, type: 'normal' as SetType,
      }));
    });
    setSetRows(rows);
  }, [currentSession?.dayIndex]);

  // Session timer
  useEffect(() => {
    if (!currentSession) { setElapsed(0); return; }
    const start = new Date(currentSession.startTime).getTime();
    setElapsed(Math.floor((Date.now() - start) / 1000));
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [currentSession?.startTime]);

  // Rest timer countdown
  useEffect(() => {
    if (restTimer === null || restTimer <= 0) { if (restTimer === 0) setRestTimer(null); return; }
    const id = setTimeout(() => setRestTimer((t) => (t ?? 1) - 1), 1000);
    return () => clearTimeout(id);
  }, [restTimer]);

  if (!currentSession || !program) return null;
  const sessionDay = program.days[currentSession.dayIndex];

  function updateRow(exId: string, si: number, field: 'weight' | 'reps', val: string) {
    setSetRows((prev) => ({ ...prev, [exId]: (prev[exId] ?? []).map((r, i) => i === si ? { ...r, [field]: val } : r) }));
  }

  function handleCheck(exId: string, si: number) {
    const row = (setRows[exId] ?? [])[si];
    if (!row || row.checked) return;
    const reps = parseInt(row.reps, 10);
    if (isNaN(reps) || reps <= 0) return;
    const weight = parseFloat(row.weight);
    logSet(exId, { weight: isNaN(weight) ? 0 : weight, reps });
    setSetRows((prev) => ({ ...prev, [exId]: (prev[exId] ?? []).map((r, i) => i === si ? { ...r, checked: true } : r) }));
    setRestTimer(restTarget);
    if (Platform.OS !== 'web') Vibration.vibrate(40);
  }

  function handleUncheck(exId: string, si: number) {
    const rows = setRows[exId] ?? [];
    const storeIdx = rows.slice(0, si).filter((r) => r.checked).length;
    removeSet(exId, storeIdx);
    setSetRows((prev) => ({ ...prev, [exId]: (prev[exId] ?? []).map((r, i) => i === si ? { ...r, checked: false } : r) }));
  }

  function addRow(exId: string) {
    const existing = setRows[exId] ?? [];
    const last = existing[existing.length - 1];
    setSetRows((prev) => ({ ...prev, [exId]: [...(prev[exId] ?? []), { weight: last?.weight ?? '', reps: '', checked: false, type: 'normal' as SetType }] }));
  }

  function deleteRow(exId: string, si: number) {
    setSetRows((prev) => ({ ...prev, [exId]: (prev[exId] ?? []).filter((_, i) => i !== si) }));
  }

  function cycleType(exId: string, si: number) {
    setSetRows((prev) => ({
      ...prev,
      [exId]: (prev[exId] ?? []).map((r, i) => {
        if (i !== si) return r;
        const idx = SET_TYPE_CYCLE.indexOf(r.type);
        return { ...r, type: SET_TYPE_CYCLE[(idx + 1) % SET_TYPE_CYCLE.length] };
      }),
    }));
  }

  function removeExercise(exId: string) {
    setSetRows((prev) => { const n = { ...prev }; delete n[exId]; return n; });
    setExMenuFor(null);
  }

  function addExercise(exId: string) {
    const ex = getExerciseById(exId);
    const w = ex?.defaultWeight ?? 0;
    setSetRows((prev) => ({
      ...prev,
      [exId]: [
        { weight: w > 0 ? String(w) : '', reps: '', checked: false, type: 'normal' },
        { weight: w > 0 ? String(w) : '', reps: '', checked: false, type: 'normal' },
        { weight: w > 0 ? String(w) : '', reps: '', checked: false, type: 'normal' },
      ],
    }));
    setShowAddEx(false);
    setAddExSearch('');
  }

  function confirmAbandon() {
    Alert.alert('Cancel Session', 'All logged sets will be lost.', [
      { text: 'Keep Going', style: 'cancel' },
      { text: 'Cancel Session', style: 'destructive', onPress: () => { abandonSession(); onBack(); } },
    ]);
  }

  function confirmFinish() { setShowFinish(true); }

  const totalChecked = Object.values(setRows).reduce((a, rows) => a + rows.filter((r) => r.checked).length, 0);
  const totalRows = Object.values(setRows).reduce((a, rows) => a + rows.length, 0);
  const progressPct = totalRows > 0 ? totalChecked / totalRows : 0;

  const exerciseIds = Object.keys(setRows);
  const totalVol = Object.values(setRows).reduce((a, rows) => a + rows.filter((r) => r.checked).reduce((b, r) => b + parseFloat(r.weight || '0') * parseInt(r.reps || '0', 10), 0), 0);
  const totalSetsLogged = Object.values(setRows).reduce((a, rows) => a + rows.filter((r) => r.checked).length, 0);
  const exercisesHit = Object.values(setRows).filter((rows) => rows.some((r) => r.checked)).length;

  return (
    <View style={[sv.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={sv.header}>
        <TouchableOpacity onPress={confirmAbandon} style={sv.cancelBtn}>
          <Text style={sv.cancelText}>✕ CANCEL</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={sv.sessionName}>{sessionDay.label.toUpperCase()}</Text>
          <Text style={sv.timerText}>{formatTime(elapsed)}</Text>
        </View>
        <TouchableOpacity onPress={confirmFinish} style={sv.finishBtn}>
          <Text style={sv.finishText}>FINISH ✓</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={sv.progressRow}>
        <Text style={sv.progressLabel}>SETS COMPLETED</Text>
        <Text style={sv.progressCount}>{totalChecked} / {totalRows}</Text>
      </View>
      <View style={sv.progressTrack}>
        <View style={[sv.progressFill, { width: `${progressPct * 100}%` as any }]} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[sv.content, { paddingBottom: 120 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {exerciseIds.map((exerciseId) => {
            const ex = getExerciseById(exerciseId);
            if (!ex) return null;
            const prog = exerciseProgress[exerciseId];
            const rows = setRows[exerciseId] ?? [];
            const targetSets = sessionDay.exercises.find((e) => e.exerciseId === exerciseId)?.sets ?? rows.length;

            return (
              <View key={exerciseId} style={sv.exCard}>
                {/* Exercise header */}
                <TouchableOpacity
                  style={sv.exHeader}
                  onLongPress={() => setExMenuFor(exerciseId === exMenuFor ? null : exerciseId)}
                  delayLongPress={400}
                  activeOpacity={1}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={sv.exName}>{ex.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <View style={sv.muscleTag}>
                        <Text style={sv.muscleTagText}>{ex.muscleGroup.toUpperCase()}</Text>
                      </View>
                      <View style={[sv.sfrTag, ex.sfrRank === 'high' && sv.sfrTagHigh]}>
                        <Text style={[sv.sfrTagText, ex.sfrRank === 'high' && { color: Colors.green }]}>
                          SFR: {ex.sfrRank.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={sv.setTarget}>{targetSets} sets · {ex.repRangeLow}–{ex.repRangeHigh}</Text>
                    {(prog?.currentWeight ?? 0) > 0 && (
                      <Text style={sv.currentWeight}>{prog.currentWeight}kg</Text>
                    )}
                  </View>
                </TouchableOpacity>

                {/* Context menu */}
                {exMenuFor === exerciseId && (
                  <View style={sv.exMenu}>
                    {[
                      { label: 'Remove Exercise', color: Colors.red, action: () => removeExercise(exerciseId) },
                      { label: 'Cancel', color: Colors.text3, action: () => setExMenuFor(null) },
                    ].map(({ label, color, action }) => (
                      <TouchableOpacity key={label} style={sv.exMenuItem} onPress={action}>
                        <Text style={[sv.exMenuText, { color }]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Column headers */}
                <View style={sv.colHeader}>
                  {['SET', 'TYPE', 'PREV', 'KG', 'REPS', ''].map((h, i) => (
                    <Text key={i} style={[sv.colHeaderText, i === 3 && { textAlign: 'center' }, i === 4 && { textAlign: 'center' }]}>{h}</Text>
                  ))}
                </View>

                {/* Set rows */}
                {rows.map((row, si) => {
                  const prevRep = prog?.lastReps?.[si];
                  const prevW = prog?.currentWeight ?? 0;
                  const prevStr = prevRep !== undefined ? `${prevW}×${prevRep}` : '—';
                  const hitMax = row.checked && parseInt(row.reps, 10) >= ex.repRangeHigh;
                  return (
                    <View key={si} style={[sv.setRow, row.checked && sv.setRowChecked]}>
                      {/* Set number */}
                      <View style={[sv.setNumCircle, row.checked && sv.setNumChecked]}>
                        <Text style={[sv.setNumText, row.checked && { color: '#000' }]}>{si + 1}</Text>
                      </View>
                      {/* Type chip */}
                      <TouchableOpacity
                        style={[sv.typeChip]}
                        onPress={() => !row.checked && cycleType(exerciseId, si)}
                        disabled={row.checked}
                      >
                        <Text style={[sv.typeChipText, { color: SET_TYPE_COLOR[row.type] }]}>
                          {SET_TYPE_LABEL[row.type]}
                        </Text>
                      </TouchableOpacity>
                      {/* Previous */}
                      <Text style={sv.prevText} numberOfLines={1}>
                        {prevStr}{hitMax ? ' ↑' : ''}
                      </Text>
                      {/* Weight */}
                      <TextInput
                        style={[sv.numInput, row.checked && sv.numInputDone]}
                        keyboardType="decimal-pad"
                        value={row.weight}
                        onChangeText={(v) => updateRow(exerciseId, si, 'weight', v)}
                        editable={!row.checked}
                        placeholder="0"
                        placeholderTextColor={Colors.text3}
                        selectTextOnFocus
                      />
                      {/* Reps */}
                      <TextInput
                        style={[sv.numInput, row.checked && sv.numInputDone]}
                        keyboardType="numeric"
                        value={row.reps}
                        onChangeText={(v) => updateRow(exerciseId, si, 'reps', v)}
                        editable={!row.checked}
                        placeholder="—"
                        placeholderTextColor={Colors.text3}
                        selectTextOnFocus
                        onSubmitEditing={() => handleCheck(exerciseId, si)}
                      />
                      {/* Check / delete */}
                      <TouchableOpacity
                        style={[sv.checkBtn, row.checked && sv.checkBtnDone]}
                        onPress={() => row.checked ? handleUncheck(exerciseId, si) : handleCheck(exerciseId, si)}
                        onLongPress={() => !row.checked && deleteRow(exerciseId, si)}
                        delayLongPress={600}
                      >
                        <Text style={[sv.checkBtnText, row.checked && { color: '#000' }]}>✓</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {/* Add set */}
                <TouchableOpacity style={sv.addSetBtn} onPress={() => addRow(exerciseId)}>
                  <Text style={sv.addSetText}>+ ADD SET</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Add exercise */}
          <TouchableOpacity style={sv.addExBtn} onPress={() => setShowAddEx(true)}>
            <Text style={sv.addExText}>+ ADD EXERCISE</Text>
          </TouchableOpacity>

          {/* Finish / Cancel */}
          <TouchableOpacity style={sv.finishBtnFull} onPress={confirmFinish}>
            <Text style={sv.finishBtnFullText}>Finish Workout ✓</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sv.abandonBtn} onPress={confirmAbandon}>
            <Text style={sv.abandonText}>Cancel Workout</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Rest Timer */}
      {restTimer !== null && (
        <View style={[sv.restSheet, { paddingBottom: insets.bottom + 8 }]}>
          <View style={{ alignItems: 'center', marginRight: 16 }}>
            <Text style={[sv.restCountdown, restTimer <= 10 && { color: Colors.accent3 }]}>{restTimer}</Text>
            <Text style={sv.restLabel}>REST</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={sv.restTimerLabel}>REST TIMER</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[60, 90, 120, 180].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[sv.restChip, restTarget === t && sv.restChipActive]}
                  onPress={() => { setRestTarget(t); setRestTimer(t); }}
                >
                  <Text style={[sv.restChipText, restTarget === t && { color: '#fff' }]}>{t}s</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity style={sv.restSkip} onPress={() => setRestTimer(null)}>
            <Text style={sv.restSkipText}>SKIP</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add Exercise Modal */}
      <Modal visible={showAddEx} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddEx(false)}>
        <View style={[sv.addExModal, { paddingTop: insets.top }]}>
          <View style={sv.addExModalHeader}>
            <TouchableOpacity onPress={() => setShowAddEx(false)}>
              <Text style={sv.addExBack}>←</Text>
            </TouchableOpacity>
            <Text style={sv.addExTitle}>Add Exercise</Text>
          </View>
          <View style={sv.addExSearchBar}>
            <TextInput
              style={sv.addExSearchInput}
              placeholder="Search exercises…"
              placeholderTextColor={Colors.text3}
              value={addExSearch}
              onChangeText={setAddExSearch}
              autoFocus
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sv.filterRow} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
            {['all', 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves'].map((m) => {
              const active = m === 'all' ? !addExFilter : addExFilter === m;
              return (
                <TouchableOpacity key={m} style={[sv.filterChip, active && sv.filterChipActive]} onPress={() => setAddExFilter(m === 'all' ? null : m)}>
                  <Text style={[sv.filterChipText, active && { color: '#fff' }]}>{m.toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <FlatList
            data={exerciseLibrary.filter((ex) => {
              const addedIds = new Set(Object.keys(setRows));
              return !addedIds.has(ex.id)
                && (!addExFilter || ex.muscleGroup === addExFilter)
                && (!addExSearch || ex.name.toLowerCase().includes(addExSearch.toLowerCase()));
            })}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={sv.addExRow} onPress={() => addExercise(item.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={sv.addExRowName}>{item.name}</Text>
                  <Text style={sv.addExRowMeta}>{item.muscleGroup.toUpperCase()} · {item.repRangeLow}–{item.repRangeHigh} reps</Text>
                </View>
                <Text style={sv.addExRowPlus}>+</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Finish Modal */}
      <Modal visible={showFinish} animationType="fade" transparent onRequestClose={() => setShowFinish(false)}>
        <View style={sv.finishOverlay}>
          <View style={sv.finishModal}>
            <Text style={sv.finishEmoji}>🏋️</Text>
            <Text style={sv.finishTitle}>Session Complete</Text>
            <Text style={sv.finishMeta}>{formatTime(elapsed)} · {sessionDay.label}</Text>
            <View style={sv.finishStats}>
              {[
                { label: 'VOLUME', val: totalVol > 1000 ? `${(totalVol / 1000).toFixed(1)}k` : Math.round(totalVol), unit: 'kg' },
                { label: 'SETS', val: totalSetsLogged, unit: '' },
                { label: 'EXERCISES', val: exercisesHit, unit: '' },
              ].map(({ label, val, unit }, i) => (
                <View key={i} style={[sv.finishStat, i < 2 && { borderRightWidth: 1, borderRightColor: Colors.border }]}>
                  <Text style={sv.finishStatVal}>{val}{unit}</Text>
                  <Text style={sv.finishStatLabel}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={sv.keepGoingBtn} onPress={() => setShowFinish(false)}>
                <Text style={sv.keepGoingText}>KEEP GOING</Text>
              </TouchableOpacity>
              <TouchableOpacity style={sv.saveBtn} onPress={() => { completeSession(); setShowFinish(false); onBack(); }}>
                <Text style={sv.saveBtnText}>SAVE SESSION ✓</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Routines List ─────────────────────────────────────────────────────────────

function RoutinesList({ onStartSession, onOpenExLib, onOpenProgLib }: { onStartSession: () => void; onOpenExLib: () => void; onOpenProgLib: () => void }) {
  const insets = useSafeAreaInsets();
  const program = useStore((s) => s.currentProgram);
  const completedCount = useStore((s) => s.completedSessionCount);
  const currentSession = useStore((s) => s.currentSession);
  const exerciseProgress = useStore((s) => s.exerciseProgress);
  const workoutLogs = useStore((s) => s.workoutLogs);
  const startSessionWithDay = useStore((s) => s.startSessionWithDay);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [previewDay, setPreviewDay] = useState<{ day: TrainingDay; index: number } | null>(null);
  const [editingDay, setEditingDay] = useState<{ day: TrainingDay; index: number } | null>(null);

  if (!program) return null;

  const nextDayIndex = getTrainingDayIndex(program.days, completedCount);
  const sessionActive = currentSession && !currentSession.completed;

  const seen = new Set<string>();
  const uniqueRoutines: { day: TrainingDay; index: number }[] = [];
  program.days.forEach((day, i) => {
    if (!day.isRest && !seen.has(day.label)) { seen.add(day.label); uniqueRoutines.push({ day, index: i }); }
  });

  const allMuscles = Array.from(new Set(uniqueRoutines.flatMap((r) => r.day.muscleGroups)));
  const filtered = activeFilter ? uniqueRoutines.filter((r) => r.day.muscleGroups.includes(activeFilter)) : uniqueRoutines;

  function handleStart(index: number) {
    startSessionWithDay(index);
    onStartSession();
  }

  return (
    <View style={[rl.container, { paddingTop: insets.top }]}>
      <View style={rl.header}>
        <Text style={rl.title}>WORKOUT</Text>
        <Text style={rl.subtitle}>{program.splitName.split('(')[0].trim()}</Text>
        <View style={rl.headerBtnRow}>
          <TouchableOpacity
            style={[rl.startBtn, { flex: 1 }]}
            onPress={() => { startSessionWithDay(nextDayIndex); onStartSession(); }}
            activeOpacity={0.8}
          >
            <Text style={rl.startBtnText}>▶ START WORKOUT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={rl.iconBtn} onPress={onOpenExLib}>
            <Text style={rl.iconBtnText}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={rl.iconBtn} onPress={onOpenProgLib}>
            <Text style={rl.iconBtnText}>📚</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={rl.scroll} contentContainerStyle={[rl.content, { paddingBottom: 40 }]} showsVerticalScrollIndicator={false}>
        {/* Resume chip */}
        {sessionActive && (
          <TouchableOpacity style={rl.resumeChip} onPress={onStartSession} activeOpacity={0.8}>
            <View style={rl.resumeDot} />
            <View style={{ flex: 1 }}>
              <Text style={rl.resumeLabel}>ACTIVE SESSION</Text>
              <Text style={rl.resumeSub}>{program.days[currentSession.dayIndex].label} · Tap to resume →</Text>
            </View>
            <Text style={rl.resumeArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Muscle filter chips */}
        {allMuscles.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
            {['ALL', ...allMuscles].map((m) => {
              const active = m === 'ALL' ? !activeFilter : activeFilter === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[rl.filterChip, active && rl.filterChipActive]}
                  onPress={() => setActiveFilter(m === 'ALL' ? null : m)}
                >
                  <Text style={[rl.filterChipText, active && { color: '#fff' }]}>{m.toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Routine cards */}
        {filtered.map(({ day, index }) => {
          const isNext = index === nextDayIndex;
          const last = lastPerformed(workoutLogs, index);
          const duration = estimateDuration(day);
          const progressionFlags = getDayProgressionFlags(day, workoutLogs, exerciseProgress);

          return (
            <TouchableOpacity
              key={day.label}
              style={[rl.card, isNext && rl.cardNext]}
              onLongPress={() => setPreviewDay({ day, index })}
              delayLongPress={400}
              activeOpacity={0.9}
            >
              <View style={rl.cardTopRow}>
                {isNext && <View style={rl.nextUpBadge}><Text style={rl.nextUpText}>NEXT UP</Text></View>}
                <View style={{ flex: 1 }} />
              </View>

              <Text style={rl.cardName}>{day.label.toUpperCase()}</Text>

              <View style={rl.cardMeta}>
                <Text style={rl.cardMetaText}>{day.muscleGroups.join(' · ').toUpperCase()}</Text>
                <Text style={rl.cardMetaDot}>·</Text>
                <Text style={rl.cardMetaText}>~{duration} MIN</Text>
                {last && <>
                  <Text style={rl.cardMetaDot}>·</Text>
                  <Text style={rl.cardMetaText}>LAST: {last.toUpperCase()}</Text>
                </>}
              </View>

              <View style={{ gap: 4, marginBottom: 14 }}>
                {day.exercises.slice(0, 4).map(({ exerciseId }) => {
                  const ex = getExerciseById(exerciseId);
                  const prog = exerciseProgress[exerciseId];
                  const shouldIncrease = progressionFlags[exerciseId];
                  return (
                    <View key={exerciseId} style={rl.exRow}>
                      <Text style={rl.exName}>· {ex?.name ?? exerciseId}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        {shouldIncrease && (
                          <View style={rl.increaseBadge}><Text style={rl.increaseBadgeText}>↑ INCREASE</Text></View>
                        )}
                        {(prog?.currentWeight ?? 0) > 0 && (
                          <Text style={[rl.exWeight, shouldIncrease && { color: Colors.green }]}>{prog.currentWeight}kg</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
                {day.exercises.length > 4 && (
                  <Text style={rl.exMore}>+{day.exercises.length - 4} more exercises</Text>
                )}
              </View>

              <TouchableOpacity
                style={[rl.startRoutineBtn, isNext && rl.startRoutineBtnNext]}
                onPress={() => handleStart(index)}
                activeOpacity={0.8}
              >
                <Text style={[rl.startRoutineText, isNext && { color: '#fff' }]}>▶ START ROUTINE</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Preview Modal */}
      <Modal visible={!!previewDay} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPreviewDay(null)}>
        {previewDay && (
          <View style={[rl.previewSheet, { paddingTop: insets.top }]}>
            <View style={rl.previewHeader}>
              <View>
                <Text style={rl.previewTitle}>{previewDay.day.label}</Text>
                <Text style={rl.previewMeta}>
                  {previewDay.day.muscleGroups.join(' · ').toUpperCase()} · {previewDay.day.exercises.length} EXERCISES · ~{estimateDuration(previewDay.day)} MIN
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPreviewDay(null)}>
                <Text style={rl.previewClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={previewDay.day.exercises}
              keyExtractor={(item) => item.exerciseId}
              renderItem={({ item, index }) => {
                const ex = getExerciseById(item.exerciseId);
                const prog = exerciseProgress[item.exerciseId];
                return (
                  <View style={rl.previewRow}>
                    <View style={rl.previewNum}><Text style={rl.previewNumText}>{index + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={rl.previewExName}>{ex?.name ?? item.exerciseId}</Text>
                      <Text style={rl.previewExMeta}>
                        {item.sets} sets · {ex?.repRangeLow}–{ex?.repRangeHigh} reps
                        {(prog?.currentWeight ?? 0) > 0 ? ` · ${prog.currentWeight}kg` : ''}
                      </Text>
                    </View>
                    {ex?.sfrRank && (
                      <View style={[rl.sfrBadge, ex.sfrRank === 'high' && rl.sfrBadgeHigh]}>
                        <Text style={[rl.sfrBadgeText, ex.sfrRank === 'high' && { color: Colors.green }]}>{ex.sfrRank.toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                );
              }}
            />
            <View style={[rl.previewFooter, { paddingBottom: insets.bottom + 16, gap: 10 }]}>
              <TouchableOpacity
                style={[rl.previewStartBtn, { backgroundColor: Colors.bg3 }]}
                onPress={() => { setPreviewDay(null); setEditingDay(previewDay); }}
              >
                <Text style={[rl.previewStartText, { color: Colors.accent }]}>✏ EDIT ROUTINE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={rl.previewStartBtn} onPress={() => { setPreviewDay(null); handleStart(previewDay.index); }}>
                <Text style={rl.previewStartText}>▶ START THIS ROUTINE</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>

      {/* Routine Editor */}
      {editingDay && (
        <RoutineEditorScreen
          initialDay={editingDay.day}
          dayIndex={editingDay.index}
          onClose={() => setEditingDay(null)}
        />
      )}
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

// ─── Routine Editor Screen ─────────────────────────────────────────────────────

const ROUTINE_MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full body'];

interface RoutineEditorProps {
  initialDay?: TrainingDay;
  dayIndex?: number;
  onClose: () => void;
}

function RoutineEditorScreen({ initialDay, dayIndex, onClose }: RoutineEditorProps) {
  const insets = useSafeAreaInsets();
  const program = useStore((s) => s.currentProgram);
  const updateProgramDays = useStore((s) => s.updateProgramDays);

  const [label, setLabel] = useState(initialDay?.label ?? 'New Routine');
  const [muscleGroups, setMuscleGroups] = useState<string[]>(initialDay?.muscleGroups ?? []);
  const [exercises, setExercises] = useState<TrainingDay['exercises']>(initialDay?.exercises ?? []);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerFilter, setPickerFilter] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  if (!program) return null;

  const filteredLib = exerciseLibrary.filter((ex) => {
    const matchGroup = !pickerFilter || ex.muscleGroup === pickerFilter;
    const matchSearch = !pickerSearch || ex.name.toLowerCase().includes(pickerSearch.toLowerCase());
    const notAdded = !exercises.find((e) => e.exerciseId === ex.id);
    return matchGroup && matchSearch && notAdded;
  });

  function addExercise(exId: string) {
    setExercises((prev) => [...prev, { exerciseId: exId, sets: 3 }]);
    setShowPicker(false);
    setPickerSearch('');
  }
  function removeExercise(exId: string) {
    setExercises((prev) => prev.filter((e) => e.exerciseId !== exId));
  }
  function updateSets(exId: string, sets: number) {
    setExercises((prev) => prev.map((e) => e.exerciseId === exId ? { ...e, sets: Math.max(1, sets) } : e));
  }
  function moveExercise(idx: number, dir: -1 | 1) {
    const next = [...exercises];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setExercises(next);
  }
  function toggleMuscle(m: string) {
    setMuscleGroups((prev) => prev.includes(m) ? prev.filter((g) => g !== m) : [...prev, m]);
  }
  function save() {
    if (!program || !label.trim() || exercises.length === 0) return;
    const newDay: TrainingDay = { label: label.trim(), muscleGroups, exercises, isRest: false };
    const days = [...program.days];
    if (dayIndex !== undefined) days[dayIndex] = newDay;
    else days.push(newDay);
    updateProgramDays(days);
    onClose();
  }

  if (showPicker) {
    return (
      <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
        <View style={[reStyles.container, { paddingTop: insets.top }]}>
          <View style={reStyles.header}>
            <TouchableOpacity onPress={() => setShowPicker(false)} style={reStyles.backBtn}>
              <Text style={reStyles.backBtnText}>←</Text>
            </TouchableOpacity>
            <Text style={reStyles.title}>Add Exercise</Text>
          </View>
          <View style={reStyles.searchBar}>
            <TextInput
              style={reStyles.searchInput}
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder="Search exercises…"
              placeholderTextColor={Colors.text3}
              autoFocus
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={reStyles.filterRow} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 8 }}>
            {['all', ...ROUTINE_MUSCLE_GROUPS.filter((m) => m !== 'full body')].map((m) => {
              const active = m === 'all' ? !pickerFilter : pickerFilter === m;
              return (
                <TouchableOpacity key={m} style={[reStyles.filterChip, active && reStyles.filterChipActive]} onPress={() => setPickerFilter(m === 'all' ? null : m)}>
                  <Text style={[reStyles.filterChipText, active && reStyles.filterChipTextActive]}>{m.toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ScrollView>
            {filteredLib.length === 0 && (
              <View style={reStyles.empty}><Text style={reStyles.emptyText}>No exercises found</Text></View>
            )}
            {filteredLib.map((ex) => (
              <TouchableOpacity key={ex.id} style={reStyles.pickerRow} onPress={() => addExercise(ex.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={reStyles.pickerExName}>{ex.name}</Text>
                  <Text style={reStyles.pickerExMeta}>{ex.muscleGroup.toUpperCase()} · {ex.repRangeLow}–{ex.repRangeHigh} reps</Text>
                </View>
                <View style={[reStyles.sfrBadge, ex.sfrRank === 'high' && reStyles.sfrBadgeHigh]}>
                  <Text style={[reStyles.sfrText, ex.sfrRank === 'high' && { color: Colors.green }]}>SFR {ex.sfrRank.toUpperCase()}</Text>
                </View>
                <Text style={reStyles.pickerAdd}>+</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={[reStyles.container, { paddingTop: insets.top }]}>
        <View style={reStyles.header}>
          <TouchableOpacity onPress={onClose} style={reStyles.backBtn}>
            <Text style={reStyles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={[reStyles.title, { flex: 1 }]}>{dayIndex !== undefined ? 'Edit Routine' : 'New Routine'}</Text>
          <TouchableOpacity
            style={[reStyles.saveBtn, exercises.length === 0 && reStyles.saveBtnDisabled]}
            onPress={save}
            disabled={exercises.length === 0 || !label.trim()}
          >
            <Text style={reStyles.saveBtnText}>SAVE</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 48 }}>
          <View>
            <Text style={reStyles.fieldLabel}>ROUTINE NAME</Text>
            <TextInput
              style={reStyles.nameInput}
              value={label}
              onChangeText={setLabel}
              placeholder="e.g. Push A"
              placeholderTextColor={Colors.text3}
            />
          </View>

          <View>
            <Text style={reStyles.fieldLabel}>MUSCLE GROUPS</Text>
            <View style={reStyles.muscleGrid}>
              {ROUTINE_MUSCLE_GROUPS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[reStyles.muscleChip, muscleGroups.includes(m) && reStyles.muscleChipActive]}
                  onPress={() => toggleMuscle(m)}
                >
                  <Text style={[reStyles.muscleChipText, muscleGroups.includes(m) && reStyles.muscleChipTextActive]}>{m.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View>
            <Text style={reStyles.fieldLabel}>EXERCISES · {exercises.length}</Text>
            {exercises.length === 0 && (
              <View style={reStyles.exEmpty}><Text style={reStyles.emptyText}>Add exercises below</Text></View>
            )}
            <View style={{ gap: 6, marginBottom: 10 }}>
              {exercises.map((ex, i) => {
                const data = getExerciseById(ex.exerciseId);
                return (
                  <View key={ex.exerciseId} style={reStyles.exCard}>
                    <View style={reStyles.exMoveCol}>
                      <TouchableOpacity onPress={() => moveExercise(i, -1)} disabled={i === 0}>
                        <Text style={[reStyles.moveBtn, i === 0 && reStyles.moveBtnDisabled]}>▲</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => moveExercise(i, 1)} disabled={i === exercises.length - 1}>
                        <Text style={[reStyles.moveBtn, i === exercises.length - 1 && reStyles.moveBtnDisabled]}>▼</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={reStyles.exName} numberOfLines={1}>{data?.name ?? ex.exerciseId}</Text>
                      <Text style={reStyles.exMeta}>{data?.repRangeLow}–{data?.repRangeHigh} reps</Text>
                    </View>
                    <View style={reStyles.stepperRow}>
                      <TouchableOpacity style={reStyles.stepBtn} onPress={() => updateSets(ex.exerciseId, ex.sets - 1)}>
                        <Text style={reStyles.stepBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={reStyles.stepVal}>{ex.sets}</Text>
                      <TouchableOpacity style={reStyles.stepBtn} onPress={() => updateSets(ex.exerciseId, ex.sets + 1)}>
                        <Text style={reStyles.stepBtnText}>+</Text>
                      </TouchableOpacity>
                      <Text style={reStyles.stepUnit}>sets</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeExercise(ex.exerciseId)}>
                      <Text style={reStyles.removeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
            <TouchableOpacity style={reStyles.addExBtn} onPress={() => setShowPicker(true)}>
              <Text style={reStyles.addExBtnText}>+ ADD EXERCISE</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const reStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  backBtnText: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text3, lineHeight: 26 },
  title: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text, letterSpacing: 0.5 },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontFamily: Fonts.mono, fontSize: 11, color: '#fff', letterSpacing: 1 },
  searchBar: { padding: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchInput: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontFamily: Fonts.sans, fontSize: 13, color: Colors.text,
  },
  filterRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 44 },
  filterChip: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12, flexShrink: 0 },
  filterChipActive: { backgroundColor: Colors.accent2, borderColor: Colors.accent2 },
  filterChipText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 0.5, color: Colors.text3 },
  filterChipTextActive: { color: '#fff' },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  pickerExName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text, marginBottom: 3 },
  pickerExMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3 },
  sfrBadge: { backgroundColor: Colors.bg4, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 8 },
  sfrBadgeHigh: { backgroundColor: 'rgba(61,214,140,0.1)' },
  sfrText: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3 },
  pickerAdd: { fontSize: 20, lineHeight: 24, color: Colors.accent, flexShrink: 0 },
  empty: { padding: 40, paddingHorizontal: 20, alignItems: 'center' },
  exEmpty: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3, textAlign: 'center' },
  fieldLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5, marginBottom: 8 },
  nameInput: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: Fonts.display, fontSize: 18, color: Colors.text, letterSpacing: 0.5,
  },
  muscleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  muscleChip: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  muscleChipActive: { backgroundColor: Colors.accent2, borderColor: Colors.accent2 },
  muscleChipText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 0.5, color: Colors.text3 },
  muscleChipTextActive: { color: '#fff' },
  exCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 12, paddingHorizontal: 14,
  },
  exMoveCol: { gap: 2, flexShrink: 0 },
  moveBtn: { fontFamily: Fonts.sans, fontSize: 12, lineHeight: 16, color: Colors.text3, paddingHorizontal: 4 },
  moveBtnDisabled: { opacity: 0.2 },
  exName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text, marginBottom: 2 },
  exMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  stepBtn: { width: 24, height: 24, borderRadius: 6, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text2, lineHeight: 18 },
  stepVal: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.text, minWidth: 16, textAlign: 'center' },
  stepUnit: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  removeBtn: { fontSize: 16, lineHeight: 20, color: Colors.red, paddingHorizontal: 2 },
  addExBtn: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border2,
    borderRadius: 10, padding: 14, alignItems: 'center',
  },
  addExBtnText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.accent, letterSpacing: 1 },
});

// ─── Exercise Library Screen ───────────────────────────────────────────────────

const EX_MUSCLE_GROUPS = ['all', 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves'] as const;

function ExerciseLibraryScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const exerciseProgress = useStore((s) => s.exerciseProgress);
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<Exercise[]>([]);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newMuscle, setNewMuscle] = useState('chest');
  const [newRepLow, setNewRepLow] = useState('8');
  const [newRepHigh, setNewRepHigh] = useState('12');
  const [newDefaultWeight, setNewDefaultWeight] = useState('0');

  const allExercises = [...exerciseLibrary, ...created];
  const filtered = allExercises.filter((ex) => {
    const matchGroup = !filterGroup || ex.muscleGroup === filterGroup;
    const matchSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase());
    return matchGroup && matchSearch;
  });

  function createExercise() {
    if (!newName.trim()) return;
    const ex = {
      id: `custom_${Date.now()}`,
      name: newName.trim(),
      muscleGroup: newMuscle,
      primaryMuscle: newMuscle,
      sfrRank: 'medium' as const,
      equipment: ['full_gym'] as Equipment[],
      repRangeLow: parseInt(newRepLow, 10) || 8,
      repRangeHigh: parseInt(newRepHigh, 10) || 12,
      defaultWeight: parseFloat(newDefaultWeight) || 0,
      weightIncrement: 2.5,
    };
    setCreated((prev) => [...prev, ex]);
    setNewName(''); setShowCreate(false);
  }

  if (showCreate) {
    return (
      <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
        <View style={[exStyles.container, { paddingTop: insets.top }]}>
          <View style={exStyles.header}>
            <TouchableOpacity onPress={() => setShowCreate(false)} style={exStyles.backBtn}>
              <Text style={exStyles.backBtnText}>←</Text>
            </TouchableOpacity>
            <Text style={exStyles.title}>Create Exercise</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 48 }}>
            <View>
              <Text style={exStyles.fieldLabel}>NAME</Text>
              <TextInput
                style={exStyles.fieldInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Cable Pullover"
                placeholderTextColor={Colors.text3}
                autoFocus
              />
            </View>
            <View>
              <Text style={exStyles.fieldLabel}>MUSCLE GROUP</Text>
              <View style={exStyles.muscleGrid}>
                {EX_MUSCLE_GROUPS.filter((m) => m !== 'all').map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[exStyles.muscleChip, newMuscle === m && exStyles.muscleChipActive]}
                    onPress={() => setNewMuscle(m)}
                  >
                    <Text style={[exStyles.muscleChipText, newMuscle === m && exStyles.muscleChipTextActive]}>
                      {m.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View>
              <Text style={exStyles.fieldLabel}>REP RANGE</Text>
              <View style={exStyles.repRange}>
                <TextInput style={exStyles.repInput} value={newRepLow} onChangeText={setNewRepLow} keyboardType="number-pad" />
                <Text style={exStyles.repDash}>–</Text>
                <TextInput style={exStyles.repInput} value={newRepHigh} onChangeText={setNewRepHigh} keyboardType="number-pad" />
                <Text style={exStyles.repUnit}>reps</Text>
              </View>
            </View>
            <View>
              <Text style={exStyles.fieldLabel}>DEFAULT WEIGHT (kg)</Text>
              <TextInput
                style={[exStyles.repInput, { width: 80 }]}
                value={newDefaultWeight}
                onChangeText={setNewDefaultWeight}
                keyboardType="decimal-pad"
              />
            </View>
            <TouchableOpacity style={exStyles.createBtn} onPress={createExercise}>
              <Text style={exStyles.createBtnText}>CREATE EXERCISE</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    );
  }

  if (selected) {
    const prog = exerciseProgress[selected.id];
    return (
      <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
        <View style={[exStyles.container, { paddingTop: insets.top }]}>
          <View style={exStyles.header}>
            <TouchableOpacity onPress={() => setSelected(null)} style={exStyles.backBtn}>
              <Text style={exStyles.backBtnText}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={exStyles.title}>{selected.name}</Text>
              <Text style={exStyles.subtitle}>{selected.muscleGroup.toUpperCase()}</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <View style={exStyles.chips}>
              <View style={[exStyles.chip, selected.sfrRank === 'high' && exStyles.chipGreen]}>
                <Text style={[exStyles.chipText, selected.sfrRank === 'high' && { color: Colors.green }]}>SFR: {selected.sfrRank.toUpperCase()}</Text>
              </View>
              <View style={exStyles.chip}>
                <Text style={exStyles.chipText}>{selected.repRangeLow}–{selected.repRangeHigh} REPS</Text>
              </View>
              {selected.equipment?.length > 0 && (
                <View style={exStyles.chip}>
                  <Text style={exStyles.chipText}>{selected.equipment.join(', ').toUpperCase()}</Text>
                </View>
              )}
            </View>
            {selected.primaryMuscle && (
              <View>
                <Text style={exStyles.detailLabel}>PRIMARY MUSCLE</Text>
                <Text style={exStyles.detailValue}>{selected.primaryMuscle}</Text>
              </View>
            )}
            {selected.notes && (
              <View style={exStyles.noteCard}>
                <Text style={exStyles.detailLabel}>COACHING NOTE</Text>
                <Text style={exStyles.detailValue}>{selected.notes}</Text>
              </View>
            )}
            {prog && (
              <View style={exStyles.progressCard}>
                <Text style={[exStyles.detailLabel, { color: Colors.accent }]}>YOUR PROGRESS</Text>
                <Text style={exStyles.progressWeight}>{prog.currentWeight}kg</Text>
                <Text style={exStyles.detailLabel}>CURRENT WORKING WEIGHT</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={[exStyles.container, { paddingTop: insets.top }]}>
        <View style={exStyles.header}>
          <TouchableOpacity onPress={onClose} style={exStyles.backBtn}>
            <Text style={exStyles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={[exStyles.title, { flex: 1 }]}>Exercise Library</Text>
          <TouchableOpacity style={exStyles.createChip} onPress={() => setShowCreate(true)}>
            <Text style={exStyles.createChipText}>+ CREATE</Text>
          </TouchableOpacity>
        </View>

        <View style={exStyles.searchBar}>
          <TextInput
            style={exStyles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises…"
            placeholderTextColor={Colors.text3}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={exStyles.filterRow} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 8 }}>
          {EX_MUSCLE_GROUPS.map((m) => {
            const active = m === 'all' ? !filterGroup : filterGroup === m;
            return (
              <TouchableOpacity
                key={m}
                style={[exStyles.filterChip, active && exStyles.filterChipActive]}
                onPress={() => setFilterGroup(m === 'all' ? null : m)}
              >
                <Text style={[exStyles.filterChipText, active && exStyles.filterChipTextActive]}>{m.toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView>
          {filtered.map((ex) => {
            const prog = exerciseProgress[ex.id];
            return (
              <TouchableOpacity key={ex.id} style={exStyles.exRow} onPress={() => setSelected(ex)}>
                <View style={{ flex: 1 }}>
                  <Text style={exStyles.exName}>{ex.name}</Text>
                  <Text style={exStyles.exMeta}>
                    {ex.muscleGroup.toUpperCase()} · {ex.repRangeLow}–{ex.repRangeHigh} reps
                    {prog?.currentWeight ? ` · ${prog.currentWeight}kg` : ''}
                  </Text>
                </View>
                <View style={[exStyles.sfrBadge, ex.sfrRank === 'high' && exStyles.sfrBadgeHigh]}>
                  <Text style={[exStyles.sfrText, ex.sfrRank === 'high' && { color: Colors.green }]}>SFR {ex.sfrRank.toUpperCase()}</Text>
                </View>
                <Text style={exStyles.rowChevron}>›</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const exStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  backBtnText: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text3, lineHeight: 26 },
  title: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text, letterSpacing: 0.5 },
  subtitle: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, marginTop: 1 },
  createChip: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  createChipText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accent },
  searchBar: { padding: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchInput: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontFamily: Fonts.sans, fontSize: 13, color: Colors.text,
  },
  filterRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 44 },
  filterChip: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12, flexShrink: 0 },
  filterChipActive: { backgroundColor: Colors.accent2, borderColor: Colors.accent2 },
  filterChipText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 0.5, color: Colors.text3 },
  filterChipTextActive: { color: '#fff' },
  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  exName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text, marginBottom: 2 },
  exMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  sfrBadge: { backgroundColor: Colors.bg4, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 8 },
  sfrBadgeHigh: { backgroundColor: 'rgba(61,214,140,0.1)' },
  sfrText: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3 },
  rowChevron: { fontFamily: Fonts.sans, fontSize: 16, color: Colors.text3 },
  // Detail
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 99, paddingVertical: 4, paddingHorizontal: 12 },
  chipGreen: { backgroundColor: 'rgba(61,214,140,0.1)' },
  chipText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  detailLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5, marginBottom: 4 },
  detailValue: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text2, lineHeight: 20 },
  noteCard: { backgroundColor: Colors.bg3, borderRadius: 10, padding: 12, paddingHorizontal: 14 },
  progressCard: { backgroundColor: 'rgba(79,142,247,0.08)', borderWidth: 1, borderColor: 'rgba(79,142,247,0.2)', borderRadius: 10, padding: 12, paddingHorizontal: 14 },
  progressWeight: { fontFamily: Fonts.display, fontSize: 28, color: Colors.accent, lineHeight: 34 },
  // Create form
  fieldLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5, marginBottom: 8 },
  fieldInput: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: Fonts.sans, fontSize: 14, color: Colors.text,
  },
  muscleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  muscleChip: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  muscleChipActive: { backgroundColor: Colors.accent2, borderColor: Colors.accent2 },
  muscleChipText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  muscleChipTextActive: { color: '#fff' },
  repRange: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  repInput: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 8, padding: 10, width: 60, fontFamily: Fonts.mono, fontSize: 14,
    color: Colors.text, textAlign: 'center',
  },
  repDash: { fontFamily: Fonts.sans, fontSize: 16, color: Colors.text3 },
  repUnit: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3 },
  createBtn: { backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  createBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: '#fff', letterSpacing: 1, fontWeight: '700' },
});

// ─── Program Builder Screen ────────────────────────────────────────────────────

const SET_TYPE_COLORS: Record<SetType, string> = {
  normal: Colors.text3,
  warmup: Colors.accent,
  drop: Colors.accent2,
  failure: Colors.accent3,
};
const PB_REST_OPTIONS = [
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: '90s', value: 90 },
  { label: '2m', value: 120 },
  { label: '3m', value: 180 },
];
const PB_MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'];
const SPLIT_TYPES = ['PPL', 'Upper/Lower', 'Full Body', 'Torso/Limbs', 'Custom'] as const;

interface PBSetConfig {
  type: SetType;
  weight: string;
  repLow: string;
  repHigh: string;
  restSeconds: number;
}
interface PBExercise {
  uid: string;
  exerciseId: string;
  sets: PBSetConfig[];
  notes: string;
  supersetGroup?: string;
}
interface PBDay {
  label: string;
  exercises: PBExercise[];
}

function makePBSet(exId: string): PBSetConfig {
  const ex = getExerciseById(exId);
  return { type: 'normal', weight: String(ex?.defaultWeight ?? 0), repLow: String(ex?.repRangeLow ?? 8), repHigh: String(ex?.repRangeHigh ?? 12), restSeconds: 90 };
}
function makePBExercise(exId: string): PBExercise {
  return { uid: `bex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, exerciseId: exId, sets: [makePBSet(exId), makePBSet(exId), makePBSet(exId)], notes: '' };
}
function pbRestLabel(s: number): string {
  const opt = PB_REST_OPTIONS.find((r) => r.value === s);
  return opt ? opt.label : s >= 60 ? `${Math.round(s / 60)}m` : `${s}s`;
}

interface ProgramBuilderProps { onClose: () => void; editProgram?: CustomProgram; }

function ProgramBuilderScreen({ onClose, editProgram }: ProgramBuilderProps) {
  const insets = useSafeAreaInsets();
  const saveCustomProgram = useStore((s) => s.saveCustomProgram);
  const updateCustomProgram = useStore((s) => s.updateCustomProgram);

  function buildInitialDays(): PBDay[] {
    if (!editProgram) return Array.from({ length: 4 }, (_, i) => ({ label: `Day ${i + 1}`, exercises: [] }));
    return editProgram.days_data.map((d) => ({ label: d.label, exercises: d.exercises.map((ex) => makePBExercise(ex.exerciseId)) }));
  }

  const [programName, setProgramName] = useState(editProgram?.name ?? 'My Program');
  const [splitType, setSplitType] = useState<string>(editProgram?.split ?? 'Custom');
  const [numDays, setNumDays] = useState(editProgram?.days ?? 4);
  const [days, setDays] = useState<PBDay[]>(buildInitialDays);
  const [activeDay, setActiveDay] = useState(0);
  const [saved, setSaved] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerFilter, setPickerFilter] = useState<string | null>(null);
  const [restPickerFor, setRestPickerFor] = useState<{ exUid: string; setIdx: number } | null>(null);
  const [exMenuFor, setExMenuFor] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set());

  function handleSetNumDays(n: number) {
    setNumDays(n);
    setDays((prev) => {
      if (n > prev.length) {
        return [...prev, ...Array.from({ length: n - prev.length }, (_, i) => ({ label: `Day ${prev.length + i + 1}`, exercises: [] }))];
      }
      return prev.slice(0, n);
    });
    if (activeDay >= n) setActiveDay(n - 1);
  }
  function updateDay(dayIdx: number, patch: Partial<PBDay>) {
    setDays((prev) => prev.map((d, i) => i === dayIdx ? { ...d, ...patch } : d));
  }
  function updateExercise(dayIdx: number, exUid: string, patch: Partial<PBExercise>) {
    setDays((prev) => prev.map((d, i) => i !== dayIdx ? d : { ...d, exercises: d.exercises.map((ex) => ex.uid === exUid ? { ...ex, ...patch } : ex) }));
  }
  function updateSet(dayIdx: number, exUid: string, setIdx: number, patch: Partial<PBSetConfig>) {
    setDays((prev) => prev.map((d, i) => i !== dayIdx ? d : { ...d, exercises: d.exercises.map((ex) => ex.uid !== exUid ? ex : { ...ex, sets: ex.sets.map((s, si) => si === setIdx ? { ...s, ...patch } : s) }) }));
  }
  function addSet(dayIdx: number, exUid: string) {
    const day = days[dayIdx];
    const ex = day?.exercises.find((e) => e.uid === exUid);
    if (!ex) return;
    setDays((prev) => prev.map((d, i) => i !== dayIdx ? d : { ...d, exercises: d.exercises.map((e) => e.uid !== exUid ? e : { ...e, sets: [...e.sets, makePBSet(e.exerciseId)] }) }));
  }
  function removeSet(dayIdx: number, exUid: string, setIdx: number) {
    setDays((prev) => prev.map((d, i) => i !== dayIdx ? d : { ...d, exercises: d.exercises.map((ex) => ex.uid !== exUid ? ex : { ...ex, sets: ex.sets.filter((_, si) => si !== setIdx) }) }));
  }
  function removeExercise(dayIdx: number, exUid: string) {
    setDays((prev) => prev.map((d, i) => i !== dayIdx ? d : { ...d, exercises: d.exercises.filter((ex) => ex.uid !== exUid) }));
  }
  function movePBExercise(dayIdx: number, exUid: string, dir: -1 | 1) {
    setDays((prev) => prev.map((d, i) => {
      if (i !== dayIdx) return d;
      const exs = [...d.exercises];
      const idx = exs.findIndex((ex) => ex.uid === exUid);
      const target = idx + dir;
      if (target < 0 || target >= exs.length) return d;
      [exs[idx], exs[target]] = [exs[target], exs[idx]];
      return { ...d, exercises: exs };
    }));
  }
  function addExercise(exId: string) {
    const newEx = makePBExercise(exId);
    updateDay(activeDay, { exercises: [...days[activeDay].exercises, newEx] });
    setShowPicker(false);
    setPickerSearch('');
  }
  function cycleSetType(dayIdx: number, exUid: string, setIdx: number, current: SetType) {
    const next = SET_TYPE_CYCLE[(SET_TYPE_CYCLE.indexOf(current) + 1) % SET_TYPE_CYCLE.length];
    updateSet(dayIdx, exUid, setIdx, { type: next });
  }
  function save() {
    const name = programName.trim() || 'My Program';
    const validDays = days.filter((d) => d.exercises.length > 0);
    if (validDays.length === 0) return;
    const daysData: TrainingDay[] = validDays.map((d) => ({
      label: d.label,
      muscleGroups: [...new Set(d.exercises.flatMap((ex) => { const libEx = getExerciseById(ex.exerciseId); return libEx ? [libEx.muscleGroup] : []; }))],
      exercises: d.exercises.map((ex) => ({ exerciseId: ex.exerciseId, sets: ex.sets.length })),
      isRest: false,
    }));
    const program: CustomProgram = {
      id: editProgram?.id ?? `custom_${Date.now()}`,
      name, split: splitType, days: validDays.length, goal: 'Hypertrophy',
      days_data: daysData, createdAt: editProgram?.createdAt ?? new Date().toISOString(),
    };
    if (editProgram) updateCustomProgram(program); else saveCustomProgram(program);
    setSaved(true);
    setTimeout(onClose, 1000);
  }

  const canSave = programName.trim().length > 0 && days.some((d) => d.exercises.length > 0);
  const currentDay = days[activeDay];
  const filteredLib = exerciseLibrary.filter((ex) => {
    const notAdded = !days[activeDay]?.exercises.find((e) => e.exerciseId === ex.id);
    const matchGroup = !pickerFilter || ex.muscleGroup === pickerFilter;
    const matchSearch = !pickerSearch || ex.name.toLowerCase().includes(pickerSearch.toLowerCase());
    return notAdded && matchGroup && matchSearch;
  });

  if (showPicker) {
    return (
      <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
        <View style={[pb.container, { paddingTop: insets.top }]}>
          <View style={pb.header}>
            <TouchableOpacity onPress={() => { setShowPicker(false); setPickerSearch(''); }} style={pb.backBtn}>
              <Text style={pb.backBtnText}>←</Text>
            </TouchableOpacity>
            <Text style={pb.title}>Add Exercise</Text>
          </View>
          <View style={pb.searchBar}>
            <TextInput style={pb.searchInput} value={pickerSearch} onChangeText={setPickerSearch} placeholder="Search exercises…" placeholderTextColor={Colors.text3} autoFocus />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 8, paddingHorizontal: 16 }} style={{ flexShrink: 0, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            {['all', ...PB_MUSCLE_GROUPS].map((m) => {
              const active = m === 'all' ? !pickerFilter : pickerFilter === m;
              return (
                <TouchableOpacity key={m} style={[pb.filterChip, active && pb.filterChipActive]} onPress={() => setPickerFilter(m === 'all' ? null : m)}>
                  <Text style={[pb.filterChipText, active && { color: '#fff' }]}>{m.toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <FlatList
            data={filteredLib}
            keyExtractor={(item) => item.id}
            renderItem={({ item: ex }) => (
              <TouchableOpacity style={pb.exPickerRow} onPress={() => addExercise(ex.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={pb.exPickerName}>{ex.name}</Text>
                  <Text style={pb.exPickerMeta}>{ex.muscleGroup.toUpperCase()} · {ex.repRangeLow}–{ex.repRangeHigh} reps</Text>
                </View>
                <View style={[pb.sfrBadge, ex.sfrRank === 'high' && pb.sfrBadgeHigh]}>
                  <Text style={[pb.sfrBadgeText, ex.sfrRank === 'high' && { color: Colors.green }]}>SFR {ex.sfrRank.toUpperCase()}</Text>
                </View>
                <Text style={pb.addBtn}>+</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={pb.emptyText}>No exercises found</Text>}
          />
        </View>
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={[pb.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={pb.header}>
          <TouchableOpacity onPress={onClose} style={pb.backBtn}><Text style={pb.backBtnText}>←</Text></TouchableOpacity>
          <TextInput style={pb.nameInput} value={programName} onChangeText={setProgramName} placeholder="My Program" placeholderTextColor={Colors.text3} />
          <TouchableOpacity style={[pb.saveHeaderBtn, !canSave && { opacity: 0.35 }, saved && { backgroundColor: Colors.green }]} onPress={save} disabled={!canSave}>
            <Text style={pb.saveHeaderBtnText}>{saved ? '✓' : 'SAVE'}</Text>
          </TouchableOpacity>
        </View>

        {/* Days/week + Split type */}
        <View style={pb.configRow}>
          <Text style={pb.configLabel}>DAYS</Text>
          {[2, 3, 4, 5, 6].map((n) => (
            <TouchableOpacity key={n} style={[pb.dayNumBtn, n === numDays && pb.dayNumBtnActive]} onPress={() => handleSetNumDays(n)}>
              <Text style={[pb.dayNumText, n === numDays && { color: Colors.bg }]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 8, paddingHorizontal: 16 }} style={{ flexShrink: 0, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
          {SPLIT_TYPES.map((s) => (
            <TouchableOpacity key={s} style={[pb.filterChip, splitType === s && pb.filterChipActive]} onPress={() => setSplitType(s)}>
              <Text style={[pb.filterChipText, splitType === s && { color: '#fff' }]}>{s.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Day tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 0 }} style={{ flexShrink: 0, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
          {days.map((d, i) => (
            <TouchableOpacity key={i} style={[pb.dayTab, i === activeDay && pb.dayTabActive]} onPress={() => setActiveDay(i)}>
              <Text style={[pb.dayTabText, i === activeDay && pb.dayTabTextActive]}>DAY {i + 1}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Day content */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          {/* Day label */}
          <Text style={pb.sectionLabel}>DAY LABEL</Text>
          <TextInput style={pb.dayLabelInput} value={currentDay?.label ?? ''} onChangeText={(t) => updateDay(activeDay, { label: t })} placeholderTextColor={Colors.text3} />

          {/* Exercise count */}
          <Text style={[pb.sectionLabel, { marginTop: 14 }]}>EXERCISES · {currentDay?.exercises.length ?? 0}</Text>

          {/* Exercise cards */}
          {currentDay?.exercises.map((ex, exIdx) => {
            const libEx = getExerciseById(ex.exerciseId);
            const isNotesOpen = notesOpen.has(ex.uid);
            return (
              <View key={ex.uid} style={pb.exCard}>
                {/* Exercise header */}
                <View style={pb.exCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={pb.exCardName}>{libEx?.name ?? ex.exerciseId}</Text>
                    {libEx && <Text style={pb.exCardMuscle}>{libEx.muscleGroup.toUpperCase()}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => setNotesOpen((prev) => { const next = new Set(prev); if (next.has(ex.uid)) next.delete(ex.uid); else next.add(ex.uid); return next; })}>
                    <Text style={[pb.exCardIcon, isNotesOpen && { color: Colors.accent }]}>✎</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => movePBExercise(activeDay, ex.uid, -1)} disabled={exIdx === 0}>
                    <Text style={[pb.exCardIcon, exIdx === 0 && { opacity: 0.2 }]}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => movePBExercise(activeDay, ex.uid, 1)} disabled={exIdx === currentDay.exercises.length - 1}>
                    <Text style={[pb.exCardIcon, exIdx === currentDay.exercises.length - 1 && { opacity: 0.2 }]}>▼</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setExMenuFor(ex.uid); }}>
                    <Text style={pb.exCardIcon}>···</Text>
                  </TouchableOpacity>
                </View>

                {/* Notes */}
                {isNotesOpen && (
                  <View style={pb.notesRow}>
                    <TextInput style={pb.notesInput} value={ex.notes} onChangeText={(t) => updateExercise(activeDay, ex.uid, { notes: t })} placeholder="Add a coaching note…" placeholderTextColor={Colors.text3} />
                  </View>
                )}

                {/* Set header */}
                <View style={pb.setHeaderRow}>
                  {['#', 'TYPE', 'KG', 'REPS', 'REST', ''].map((h) => (
                    <Text key={h} style={pb.setHeaderCell}>{h}</Text>
                  ))}
                </View>

                {/* Set rows */}
                {ex.sets.map((s, si) => (
                  <View key={si} style={pb.setRow}>
                    <Text style={[pb.setCell, pb.setCellNum]}>{si + 1}</Text>
                    <TouchableOpacity style={[pb.setTypeBtn, { borderColor: SET_TYPE_COLORS[s.type] }]} onPress={() => cycleSetType(activeDay, ex.uid, si, s.type)}>
                      <Text style={[pb.setTypeBtnText, { color: SET_TYPE_COLORS[s.type] }]}>{SET_TYPE_LABEL[s.type]}</Text>
                    </TouchableOpacity>
                    <TextInput style={pb.setNumInput} value={s.weight} onChangeText={(t) => updateSet(activeDay, ex.uid, si, { weight: t })} keyboardType="numeric" placeholderTextColor={Colors.text3} />
                    <TextInput style={pb.setNumInput} value={s.repLow} onChangeText={(t) => updateSet(activeDay, ex.uid, si, { repLow: t })} keyboardType="numeric" placeholderTextColor={Colors.text3} />
                    <TouchableOpacity style={pb.restBtn} onPress={() => setRestPickerFor({ exUid: ex.uid, setIdx: si })}>
                      <Text style={pb.restBtnText}>{pbRestLabel(s.restSeconds)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeSet(activeDay, ex.uid, si)} disabled={ex.sets.length <= 1}>
                      <Text style={[pb.removeSetBtn, ex.sets.length <= 1 && { opacity: 0.2 }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Add set */}
                <TouchableOpacity style={pb.addSetBtn} onPress={() => addSet(activeDay, ex.uid)}>
                  <Text style={pb.addSetBtnText}>+ ADD SET</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Empty state */}
          {currentDay?.exercises.length === 0 && (
            <Text style={pb.emptyText}>Add exercises below</Text>
          )}

          {/* Add Exercise button */}
          <TouchableOpacity style={pb.addExBtn} onPress={() => setShowPicker(true)}>
            <Text style={pb.addExBtnText}>+ ADD EXERCISE</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Save footer */}
        <View style={[pb.saveFooter, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={[pb.saveBtn, !canSave && { opacity: 0.35 }, saved && { backgroundColor: Colors.green }]} onPress={save} disabled={!canSave}>
            <Text style={pb.saveBtnText}>{saved ? '✓ PROGRAM SAVED' : 'SAVE PROGRAM'}</Text>
          </TouchableOpacity>
          {!canSave && <Text style={pb.saveBtnHint}>Add at least one exercise to save</Text>}
        </View>

        {/* Rest picker bottom sheet */}
        <Modal visible={!!restPickerFor} transparent animationType="slide" onRequestClose={() => setRestPickerFor(null)}>
          <TouchableOpacity style={pb.sheetBackdrop} activeOpacity={1} onPress={() => setRestPickerFor(null)}>
            <TouchableOpacity activeOpacity={1} style={[pb.sheet, { paddingBottom: insets.bottom + 20 }]}>
              <Text style={pb.sheetTitle}>REST DURATION</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {PB_REST_OPTIONS.map((opt) => {
                  const exUid = restPickerFor?.exUid ?? '';
                  const setIdx = restPickerFor?.setIdx ?? 0;
                  const curEx = days[activeDay]?.exercises.find((e) => e.uid === exUid);
                  const curRest = curEx?.sets[setIdx]?.restSeconds;
                  const active = curRest === opt.value;
                  return (
                    <TouchableOpacity key={opt.value} style={[pb.restOption, active && pb.restOptionActive]} onPress={() => { updateSet(activeDay, exUid, setIdx, { restSeconds: opt.value }); setRestPickerFor(null); }}>
                      <Text style={[pb.restOptionText, active && { color: '#fff' }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Exercise menu bottom sheet */}
        <Modal visible={!!exMenuFor} transparent animationType="slide" onRequestClose={() => setExMenuFor(null)}>
          <TouchableOpacity style={pb.sheetBackdrop} activeOpacity={1} onPress={() => setExMenuFor(null)}>
            <TouchableOpacity activeOpacity={1} style={[pb.sheet, { paddingBottom: insets.bottom + 20, padding: 0 }]}>
              {exMenuFor && [
                { label: 'Move Up', action: () => { movePBExercise(activeDay, exMenuFor, -1); setExMenuFor(null); }, color: Colors.text },
                { label: 'Move Down', action: () => { movePBExercise(activeDay, exMenuFor, 1); setExMenuFor(null); }, color: Colors.text },
                { label: 'Remove Exercise', action: () => { removeExercise(activeDay, exMenuFor); setExMenuFor(null); }, color: Colors.red },
              ].map(({ label, action, color }) => (
                <TouchableOpacity key={label} style={pb.menuItem} onPress={action}>
                  <Text style={[pb.menuItemText, { color }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
}

const pb = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4 },
  backBtnText: { fontFamily: Fonts.sans, fontSize: 20, color: Colors.text3 },
  title: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, flex: 1, letterSpacing: 0.5 },
  nameInput: { flex: 1, fontFamily: Fonts.display, fontSize: 18, color: Colors.text, letterSpacing: 0.5 },
  saveHeaderBtn: { backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  saveHeaderBtnText: { fontFamily: Fonts.mono, fontSize: 11, color: '#fff', letterSpacing: 1, fontWeight: '700' },
  configRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  configLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.6, marginRight: 4 },
  dayNumBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  dayNumBtnActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  dayNumText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3 },
  filterChip: { borderRadius: 20, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: Colors.bg3 },
  filterChipActive: { backgroundColor: Colors.accent2, borderColor: Colors.accent2 },
  filterChipText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5 },
  dayTab: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  dayTabActive: { borderBottomColor: Colors.accent },
  dayTabText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },
  dayTabTextActive: { color: Colors.accent },
  sectionLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.8, marginBottom: 6 },
  dayLabelInput: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: Fonts.display, fontSize: 16, color: Colors.text, letterSpacing: 0.4 },
  exCard: { backgroundColor: Colors.bg2, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  exCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  exCardName: { fontFamily: Fonts.sansMed, fontSize: 13, color: Colors.text },
  exCardMuscle: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3, letterSpacing: 0.3, marginTop: 2 },
  exCardIcon: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text3, paddingHorizontal: 2 },
  notesRow: { padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  notesInput: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontFamily: Fonts.sans, fontSize: 12, color: Colors.text2 },
  setHeaderRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 4 },
  setHeaderCell: { fontFamily: Fonts.mono, fontSize: 7, color: Colors.text3, letterSpacing: 0.8, flex: 1, textAlign: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 4 },
  setCell: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, flex: 1, textAlign: 'center' },
  setCellNum: { flex: 0, width: 20 },
  setTypeBtn: { borderWidth: 1, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 6, flex: 0, minWidth: 24, alignItems: 'center' },
  setTypeBtnText: { fontFamily: Fonts.mono, fontSize: 9 },
  setNumInput: { flex: 1, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 6, fontFamily: Fonts.mono, fontSize: 11, color: Colors.text, textAlign: 'center', paddingVertical: 4 },
  restBtn: { flex: 1, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 5, alignItems: 'center', paddingVertical: 4 },
  restBtnText: { fontFamily: Fonts.mono, fontSize: 7, color: Colors.text3 },
  removeSetBtn: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.red, paddingHorizontal: 4 },
  addSetBtn: { padding: 10, alignItems: 'center' },
  addSetBtnText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accent, letterSpacing: 0.8 },
  addExBtn: { marginTop: 4, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  addExBtnText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.accent, letterSpacing: 1 },
  emptyText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3, textAlign: 'center', paddingVertical: 32 },
  saveFooter: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bg },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  saveBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: '#fff', letterSpacing: 1.2, fontWeight: '700' },
  saveBtnHint: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, textAlign: 'center', marginTop: 8 },
  searchBar: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchInput: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  exPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.border },
  exPickerName: { fontFamily: Fonts.sansMed, fontSize: 13, color: Colors.text, marginBottom: 3 },
  exPickerMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3 },
  sfrBadge: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: Colors.bg4 },
  sfrBadgeHigh: { backgroundColor: 'rgba(61,214,140,0.1)' },
  sfrBadgeText: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3 },
  addBtn: { fontFamily: Fonts.sans, fontSize: 20, color: Colors.accent, lineHeight: 22 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bg2, borderRadius: 20, padding: 20, marginHorizontal: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  sheetTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.8, marginBottom: 16 },
  restOption: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
  restOptionActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  restOptionText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3 },
  menuItem: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 20, paddingVertical: 16 },
  menuItemText: { fontFamily: Fonts.sans, fontSize: 15 },
});

// ─── Program Library Screen ────────────────────────────────────────────────────

type GoalType = 'Hypertrophy' | 'Strength + Size' | 'General Fitness' | 'Maintenance';

interface PLProgram {
  id: string;
  name: string;
  description: string;
  split: string;
  frequency: string;
  days: number;
  goal: GoalType;
  recommended: boolean;
  color: string;
  days_data: TrainingDay[];
}

const GOAL_COLORS: Record<GoalType, string> = {
  'Hypertrophy': Colors.accent2,
  'Strength + Size': Colors.accent,
  'General Fitness': Colors.green,
  'Maintenance': Colors.yellow,
};

const PL_LIBRARY: PLProgram[] = [
  { id: 'ppl_6', name: 'Push Pull Legs 6x', description: 'The most popular science-based split, running Push, Pull, and Legs twice per week. High frequency and volume per muscle group with natural fatigue overlap. Widely endorsed by the SBL community for intermediate to advanced lifters wanting maximum hypertrophy stimulus.', split: 'PPL', frequency: '6 days/week', days: 6, goal: 'Hypertrophy', recommended: true, color: Colors.accent, days_data: [
    { label: 'Push A', muscleGroups: ['chest','shoulders','triceps'], isRest: false, exercises: [{ exerciseId: 'incline_db_press', sets: 4 },{ exerciseId: 'cable_chest_fly', sets: 3 },{ exerciseId: 'lateral_raise_cable', sets: 4 },{ exerciseId: 'ohp_db', sets: 3 },{ exerciseId: 'rope_pushdown', sets: 3 },{ exerciseId: 'overhead_tri_ext', sets: 3 }]},
    { label: 'Pull A', muscleGroups: ['back','biceps'], isRest: false, exercises: [{ exerciseId: 'lat_pulldown', sets: 4 },{ exerciseId: 'cable_row_seated', sets: 4 },{ exerciseId: 'face_pull', sets: 3 },{ exerciseId: 'db_curl', sets: 3 },{ exerciseId: 'hammer_curl', sets: 3 }]},
    { label: 'Legs A', muscleGroups: ['quads','hamstrings','glutes','calves'], isRest: false, exercises: [{ exerciseId: 'leg_press', sets: 4 },{ exerciseId: 'leg_curl_lying', sets: 4 },{ exerciseId: 'bulgarian_split', sets: 3 },{ exerciseId: 'leg_extension', sets: 3 },{ exerciseId: 'calf_raise_standing', sets: 4 }]},
    { label: 'Push B', muscleGroups: ['chest','shoulders','triceps'], isRest: false, exercises: [{ exerciseId: 'bench_press_flat', sets: 4 },{ exerciseId: 'cable_chest_fly', sets: 3 },{ exerciseId: 'lateral_raise_db', sets: 4 },{ exerciseId: 'rope_pushdown', sets: 3 },{ exerciseId: 'overhead_tri_ext', sets: 3 }]},
    { label: 'Pull B', muscleGroups: ['back','biceps'], isRest: false, exercises: [{ exerciseId: 'pullup', sets: 4 },{ exerciseId: 'db_row', sets: 4 },{ exerciseId: 'face_pull', sets: 3 },{ exerciseId: 'cable_curl', sets: 3 },{ exerciseId: 'hammer_curl', sets: 3 }]},
    { label: 'Legs B', muscleGroups: ['quads','hamstrings','glutes','calves'], isRest: false, exercises: [{ exerciseId: 'hack_squat', sets: 4 },{ exerciseId: 'rdl', sets: 4 },{ exerciseId: 'leg_extension', sets: 3 },{ exerciseId: 'leg_curl_lying', sets: 3 },{ exerciseId: 'calf_raise_seated', sets: 4 }]},
  ]},
  { id: 'upper_lower_4', name: 'Upper Lower 4x', description: 'A balanced 4-day split alternating upper and lower body sessions. Trains each muscle group twice per week with a natural mix of strength-focused and hypertrophy-focused sessions. One of the most researched and recommended splits in the SBL community for building strength and size simultaneously.', split: 'Upper/Lower', frequency: '4 days/week', days: 4, goal: 'Strength + Size', recommended: true, color: Colors.accent2, days_data: [
    { label: 'Upper A', muscleGroups: ['chest','back','shoulders'], isRest: false, exercises: [{ exerciseId: 'bench_press_flat', sets: 4 },{ exerciseId: 'lat_pulldown', sets: 4 },{ exerciseId: 'ohp_barbell', sets: 3 },{ exerciseId: 'cable_row_seated', sets: 3 },{ exerciseId: 'lateral_raise_cable', sets: 3 },{ exerciseId: 'face_pull', sets: 3 }]},
    { label: 'Lower A', muscleGroups: ['quads','hamstrings','glutes','calves'], isRest: false, exercises: [{ exerciseId: 'leg_press', sets: 4 },{ exerciseId: 'rdl', sets: 4 },{ exerciseId: 'leg_extension', sets: 3 },{ exerciseId: 'leg_curl_lying', sets: 3 },{ exerciseId: 'calf_raise_standing', sets: 4 }]},
    { label: 'Upper B', muscleGroups: ['chest','back','arms'], isRest: false, exercises: [{ exerciseId: 'incline_db_press', sets: 4 },{ exerciseId: 'pullup', sets: 4 },{ exerciseId: 'cable_chest_fly', sets: 3 },{ exerciseId: 'db_row', sets: 3 },{ exerciseId: 'db_curl', sets: 3 },{ exerciseId: 'rope_pushdown', sets: 3 }]},
    { label: 'Lower B', muscleGroups: ['quads','hamstrings','glutes','calves'], isRest: false, exercises: [{ exerciseId: 'hack_squat', sets: 4 },{ exerciseId: 'bulgarian_split', sets: 4 },{ exerciseId: 'leg_curl_lying', sets: 3 },{ exerciseId: 'leg_extension', sets: 3 },{ exerciseId: 'calf_raise_seated', sets: 4 }]},
  ]},
  { id: 'full_body_3', name: 'Full Body 3x', description: 'Three full body sessions per week, each hitting all major muscle groups. High training frequency per muscle (3×/week) with moderate session volume. Ideal for lifters who want simplicity, reliable recovery, and consistent progress without complex split logistics.', split: 'Full Body', frequency: '3 days/week', days: 3, goal: 'General Fitness', recommended: true, color: Colors.green, days_data: [
    { label: 'Full Body A', muscleGroups: ['chest','back','quads','shoulders'], isRest: false, exercises: [{ exerciseId: 'bench_press_flat', sets: 3 },{ exerciseId: 'lat_pulldown', sets: 3 },{ exerciseId: 'leg_press', sets: 3 },{ exerciseId: 'lateral_raise_db', sets: 3 },{ exerciseId: 'hammer_curl', sets: 2 },{ exerciseId: 'rope_pushdown', sets: 2 }]},
    { label: 'Full Body B', muscleGroups: ['chest','back','hamstrings','shoulders'], isRest: false, exercises: [{ exerciseId: 'incline_db_press', sets: 3 },{ exerciseId: 'cable_row_seated', sets: 3 },{ exerciseId: 'rdl', sets: 3 },{ exerciseId: 'ohp_db', sets: 3 },{ exerciseId: 'db_curl', sets: 2 },{ exerciseId: 'overhead_tri_ext', sets: 2 }]},
    { label: 'Full Body C', muscleGroups: ['chest','back','quads','hamstrings'], isRest: false, exercises: [{ exerciseId: 'cable_chest_fly', sets: 3 },{ exerciseId: 'pullup', sets: 3 },{ exerciseId: 'bulgarian_split', sets: 3 },{ exerciseId: 'leg_curl_lying', sets: 3 },{ exerciseId: 'lateral_raise_cable', sets: 3 },{ exerciseId: 'face_pull', sets: 3 }]},
  ]},
  { id: 'torso_limbs_4', name: 'Torso / Limbs 4x', description: 'Torso day trains chest, back, and shoulders. Limbs day trains arms and legs. Popularised in the SBL community as a fatigue-friendly alternative to Upper/Lower — separating limb fatigue from torso fatigue improves recovery between sessions.', split: 'Torso/Limbs', frequency: '4 days/week', days: 4, goal: 'Hypertrophy', recommended: true, color: Colors.accent2, days_data: [
    { label: 'Torso A', muscleGroups: ['chest','back','shoulders'], isRest: false, exercises: [{ exerciseId: 'bench_press_flat', sets: 4 },{ exerciseId: 'lat_pulldown', sets: 4 },{ exerciseId: 'incline_db_press', sets: 3 },{ exerciseId: 'cable_row_seated', sets: 3 },{ exerciseId: 'lateral_raise_cable', sets: 4 },{ exerciseId: 'face_pull', sets: 3 }]},
    { label: 'Limbs A', muscleGroups: ['biceps','triceps','quads','hamstrings','calves'], isRest: false, exercises: [{ exerciseId: 'db_curl', sets: 3 },{ exerciseId: 'rope_pushdown', sets: 3 },{ exerciseId: 'leg_press', sets: 4 },{ exerciseId: 'rdl', sets: 4 },{ exerciseId: 'leg_extension', sets: 3 },{ exerciseId: 'calf_raise_standing', sets: 3 }]},
    { label: 'Torso B', muscleGroups: ['chest','back','shoulders'], isRest: false, exercises: [{ exerciseId: 'cable_chest_fly', sets: 4 },{ exerciseId: 'pullup', sets: 4 },{ exerciseId: 'ohp_db', sets: 3 },{ exerciseId: 'db_row', sets: 3 },{ exerciseId: 'lateral_raise_db', sets: 4 },{ exerciseId: 'face_pull', sets: 3 }]},
    { label: 'Limbs B', muscleGroups: ['biceps','triceps','quads','hamstrings','calves'], isRest: false, exercises: [{ exerciseId: 'cable_curl', sets: 3 },{ exerciseId: 'overhead_tri_ext', sets: 3 },{ exerciseId: 'hack_squat', sets: 4 },{ exerciseId: 'leg_curl_lying', sets: 4 },{ exerciseId: 'bulgarian_split', sets: 3 },{ exerciseId: 'calf_raise_seated', sets: 3 }]},
  ]},
  { id: 'ant_post_4', name: 'Anterior / Posterior 4x', description: 'Anterior day trains chest, quads, front delts, biceps, and abs. Posterior day trains back, hamstrings, glutes, rear delts, and calves. Ranked S-tier in the SBL community for minimising inter-session fatigue overlap while maximising training frequency per muscle group.', split: 'Anterior/Posterior', frequency: '4 days/week', days: 4, goal: 'Hypertrophy', recommended: true, color: Colors.yellow, days_data: [
    { label: 'Anterior A', muscleGroups: ['chest','quads','shoulders','biceps'], isRest: false, exercises: [{ exerciseId: 'bench_press_flat', sets: 4 },{ exerciseId: 'incline_db_press', sets: 3 },{ exerciseId: 'leg_press', sets: 4 },{ exerciseId: 'leg_extension', sets: 3 },{ exerciseId: 'ohp_barbell', sets: 3 },{ exerciseId: 'db_curl', sets: 3 }]},
    { label: 'Posterior A', muscleGroups: ['back','hamstrings','glutes','shoulders','calves'], isRest: false, exercises: [{ exerciseId: 'pullup', sets: 4 },{ exerciseId: 'cable_row_seated', sets: 4 },{ exerciseId: 'rdl', sets: 4 },{ exerciseId: 'hip_thrust', sets: 3 },{ exerciseId: 'face_pull', sets: 3 },{ exerciseId: 'calf_raise_standing', sets: 4 }]},
    { label: 'Anterior B', muscleGroups: ['chest','quads','shoulders','biceps'], isRest: false, exercises: [{ exerciseId: 'cable_chest_fly', sets: 4 },{ exerciseId: 'incline_db_press', sets: 3 },{ exerciseId: 'hack_squat', sets: 4 },{ exerciseId: 'bulgarian_split', sets: 3 },{ exerciseId: 'lateral_raise_cable', sets: 4 },{ exerciseId: 'cable_curl', sets: 3 }]},
    { label: 'Posterior B', muscleGroups: ['back','hamstrings','glutes','shoulders','calves'], isRest: false, exercises: [{ exerciseId: 'lat_pulldown', sets: 4 },{ exerciseId: 'db_row', sets: 4 },{ exerciseId: 'leg_curl_lying', sets: 4 },{ exerciseId: 'hip_thrust', sets: 3 },{ exerciseId: 'lateral_raise_db', sets: 3 },{ exerciseId: 'calf_raise_seated', sets: 4 }]},
  ]},
  { id: 'bro_split_5', name: 'Classic Bro Split 5x', description: 'One muscle group per day with high isolation volume. Five days per week. Each session goes deep on a single muscle group. Lower weekly frequency per muscle than science-based splits, but proven for volume accumulation and targeted mind-muscle connection.', split: 'Body Part', frequency: '5 days/week', days: 5, goal: 'Hypertrophy', recommended: false, color: Colors.accent3, days_data: [
    { label: 'Chest Day', muscleGroups: ['chest'], isRest: false, exercises: [{ exerciseId: 'bench_press_flat', sets: 4 },{ exerciseId: 'incline_db_press', sets: 4 },{ exerciseId: 'cable_chest_fly', sets: 4 },{ exerciseId: 'pec_deck', sets: 3 }]},
    { label: 'Back Day', muscleGroups: ['back'], isRest: false, exercises: [{ exerciseId: 'pullup', sets: 4 },{ exerciseId: 'cable_row_seated', sets: 4 },{ exerciseId: 'lat_pulldown', sets: 4 },{ exerciseId: 'db_row', sets: 3 },{ exerciseId: 'face_pull', sets: 3 }]},
    { label: 'Shoulders', muscleGroups: ['shoulders'], isRest: false, exercises: [{ exerciseId: 'ohp_db', sets: 4 },{ exerciseId: 'lateral_raise_cable', sets: 4 },{ exerciseId: 'lateral_raise_db', sets: 3 },{ exerciseId: 'ohp_barbell', sets: 3 }]},
    { label: 'Arms Day', muscleGroups: ['biceps','triceps'], isRest: false, exercises: [{ exerciseId: 'db_curl', sets: 4 },{ exerciseId: 'cable_curl', sets: 3 },{ exerciseId: 'hammer_curl', sets: 3 },{ exerciseId: 'rope_pushdown', sets: 4 },{ exerciseId: 'overhead_tri_ext', sets: 3 }]},
    { label: 'Legs Day', muscleGroups: ['quads','hamstrings','glutes','calves'], isRest: false, exercises: [{ exerciseId: 'leg_press', sets: 4 },{ exerciseId: 'hack_squat', sets: 4 },{ exerciseId: 'leg_curl_lying', sets: 4 },{ exerciseId: 'leg_extension', sets: 3 },{ exerciseId: 'calf_raise_standing', sets: 4 }]},
  ]},
  { id: 'minimalist_2', name: 'Minimalist 2x', description: 'Minimum effective dose. Two full body sessions per week. Designed for very busy schedules or as an active maintenance phase. Prioritises compound movements for maximum return per minute of training.', split: 'Full Body', frequency: '2 days/week', days: 2, goal: 'Maintenance', recommended: false, color: Colors.text3, days_data: [
    { label: 'Session A', muscleGroups: ['chest','back','quads','shoulders'], isRest: false, exercises: [{ exerciseId: 'bench_press_flat', sets: 3 },{ exerciseId: 'pullup', sets: 3 },{ exerciseId: 'leg_press', sets: 3 },{ exerciseId: 'lateral_raise_db', sets: 3 }]},
    { label: 'Session B', muscleGroups: ['chest','back','hamstrings','arms'], isRest: false, exercises: [{ exerciseId: 'incline_db_press', sets: 3 },{ exerciseId: 'cable_row_seated', sets: 3 },{ exerciseId: 'rdl', sets: 3 },{ exerciseId: 'db_curl', sets: 3 },{ exerciseId: 'rope_pushdown', sets: 3 }]},
  ]},
];

const PL_DAYS_OPTIONS = [null, 2, 3, 4, 5, 6] as const;
const PL_GOAL_OPTIONS: (GoalType | null)[] = [null, 'Hypertrophy', 'Strength + Size', 'General Fitness', 'Maintenance'];

function ProgramLibraryScreen({ onClose, onOpenBuilder }: { onClose: () => void; onOpenBuilder: (editProgram?: CustomProgram) => void }) {
  const insets = useSafeAreaInsets();
  const updateProgramDays = useStore((s) => s.updateProgramDays);
  const customPrograms = useStore((s) => s.customPrograms);
  const deleteCustomProgram = useStore((s) => s.deleteCustomProgram);
  const duplicateCustomProgram = useStore((s) => s.duplicateCustomProgram);

  const [selected, setSelected] = useState<PLProgram | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const [customMenu, setCustomMenu] = useState<string | null>(null);
  const [filterDays, setFilterDays] = useState<number | null>(null);
  const [filterGoal, setFilterGoal] = useState<GoalType | null>(null);
  const [scienceOnly, setScienceOnly] = useState(false);

  function importProgram(p: PLProgram) {
    updateProgramDays(p.days_data);
    setImported(p.id);
    setTimeout(() => { setImported(null); onClose(); }, 1400);
  }

  const filteredPrograms = PL_LIBRARY.filter((p) => {
    if (filterDays !== null && p.days !== filterDays) return false;
    if (filterGoal !== null && p.goal !== filterGoal) return false;
    if (scienceOnly && !p.recommended) return false;
    return true;
  });

  if (selected) {
    const trainingDays = selected.days_data.filter((d) => !d.isRest);
    const isImported = imported === selected.id;
    return (
      <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
        <View style={[plStyles.container, { paddingTop: insets.top }]}>
          <View style={[plStyles.detailHeader, { borderLeftWidth: 4, borderLeftColor: selected.color }]}>
            <TouchableOpacity onPress={() => setSelected(null)} style={plStyles.backBtn}>
              <Text style={plStyles.backBtnText}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={plStyles.title}>{selected.name}</Text>
              <Text style={plStyles.subtitle}>{selected.split} · {selected.frequency}</Text>
              <View style={plStyles.chips}>
                {selected.recommended && (
                  <View style={plStyles.recChip}><Text style={plStyles.recChipText}>RECOMMENDED</Text></View>
                )}
                <View style={[plStyles.goalChip, { borderColor: GOAL_COLORS[selected.goal] }]}>
                  <Text style={[plStyles.goalChipText, { color: GOAL_COLORS[selected.goal] }]}>{selected.goal.toUpperCase()}</Text>
                </View>
              </View>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
            <View style={plStyles.descPad}>
              <Text style={plStyles.desc}>{selected.description}</Text>
            </View>
            <View style={plStyles.scheduleHeader}>
              <Text style={plStyles.scheduleLabel}>WEEKLY SCHEDULE · {trainingDays.length} TRAINING DAYS</Text>
            </View>
            {trainingDays.map((day, i) => (
              <View key={i} style={plStyles.dayCard}>
                <View style={plStyles.dayHeader}>
                  <View style={[plStyles.dayNumBadge, { borderColor: selected.color }]}>
                    <Text style={[plStyles.dayNumText, { color: selected.color }]}>DAY {i + 1}</Text>
                  </View>
                  <Text style={plStyles.dayLabel}>{day.label}</Text>
                  <Text style={plStyles.dayExCount}>{day.exercises.length} ex</Text>
                </View>
                <View style={plStyles.muscleTags}>
                  {day.muscleGroups.map((mg) => (
                    <View key={mg} style={plStyles.muscleTag}><Text style={plStyles.muscleTagText}>{mg.toUpperCase()}</Text></View>
                  ))}
                </View>
                <View style={plStyles.dayExList}>
                  {day.exercises.map((ex, j) => {
                    const exData = getExerciseById(ex.exerciseId);
                    return (
                      <View key={j} style={plStyles.dayExRow}>
                        <Text style={plStyles.dayExNum}>{j + 1}</Text>
                        <Text style={plStyles.dayExName}>{exData?.name ?? ex.exerciseId.replace(/_/g, ' ')}</Text>
                        <Text style={plStyles.dayExSets}>{ex.sets} sets</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={[plStyles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity
              style={[plStyles.importBtn, { backgroundColor: isImported ? Colors.green : selected.color }]}
              onPress={() => importProgram(selected)}
            >
              <Text style={plStyles.importBtnText}>{isImported ? '✓ ADDED TO MY ROUTINES' : 'ADD TO MY ROUTINES'}</Text>
            </TouchableOpacity>
            <Text style={plStyles.importNote}>Replaces your current routine days</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={[plStyles.container, { paddingTop: insets.top }]}>
        <View style={plStyles.header}>
          <TouchableOpacity onPress={onClose} style={plStyles.backBtn}>
            <Text style={plStyles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={plStyles.title}>Program Library</Text>
          <TouchableOpacity style={plStyles.createBtn} onPress={() => onOpenBuilder()}>
            <Text style={plStyles.createBtnText}>+ CREATE</Text>
          </TouchableOpacity>
        </View>

        {/* Filter row 1: Days + Science toggle */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={plStyles.filterRow} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 10 }}>
          {PL_DAYS_OPTIONS.map((d) => {
            const active = d === filterDays;
            return (
              <TouchableOpacity key={d ?? 'all'} style={[plStyles.filterChip, active && plStyles.filterChipDark]} onPress={() => setFilterDays(d === filterDays ? null : d)}>
                <Text style={[plStyles.filterChipText, active && plStyles.filterChipTextDark]}>{d === null ? 'ALL' : `${d}D`}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={plStyles.filterSep} />
          <TouchableOpacity style={[plStyles.filterChip, scienceOnly && plStyles.filterChipSci]} onPress={() => setScienceOnly(!scienceOnly)}>
            <Text style={[plStyles.filterChipText, scienceOnly && { color: '#fff' }]}>★ SCIENCE</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Filter row 2: Goal */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[plStyles.filterRow, { borderTopWidth: 0 }]} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 8 }}>
          {PL_GOAL_OPTIONS.map((g) => {
            const active = g === filterGoal;
            const ac = g ? GOAL_COLORS[g] : Colors.text;
            return (
              <TouchableOpacity key={g ?? 'all'} style={[plStyles.filterChip, active && { backgroundColor: ac, borderColor: ac }]} onPress={() => setFilterGoal(g === filterGoal ? null : g)}>
                <Text style={[plStyles.filterChipText, active && { color: '#fff' }]}>{g === null ? 'ALL GOALS' : g.toUpperCase()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {customPrograms.length > 0 && (
            <View>
              <Text style={plStyles.sectionLabel}>MY PROGRAMS</Text>
              {customPrograms.map((cp) => (
                <View key={cp.id} style={plStyles.programRow}>
                  <View style={[plStyles.accentBar, { backgroundColor: Colors.accent }]} />
                  <TouchableOpacity
                    style={plStyles.programContent}
                    onPress={() => { updateProgramDays(cp.days_data); setImported(cp.id); setTimeout(() => setImported(null), 1400); }}
                  >
                    <Text style={[plStyles.programName, imported === cp.id && { color: Colors.green }]}>
                      {imported === cp.id ? '✓ ' : ''}{cp.name}
                    </Text>
                    <Text style={plStyles.programMeta}>{cp.split} · {cp.days} days/week</Text>
                  </TouchableOpacity>
                  <View style={plStyles.customBadge}><Text style={plStyles.customBadgeText}>CUSTOM</Text></View>
                  <TouchableOpacity style={plStyles.menuBtn} onPress={() => setCustomMenu(customMenu === cp.id ? null : cp.id)}>
                    <Text style={plStyles.menuBtnText}>···</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <Text style={plStyles.sectionLabel}>PROGRAM LIBRARY</Text>

          {filteredPrograms.length === 0 && (
            <View style={plStyles.empty}>
              <Text style={plStyles.emptyText}>No programs match these filters</Text>
            </View>
          )}

          {filteredPrograms.map((p) => (
            <TouchableOpacity key={p.id} style={plStyles.programRow} onPress={() => setSelected(p)}>
              <View style={[plStyles.accentBar, { backgroundColor: p.color }]} />
              <View style={plStyles.programContent}>
                <Text style={plStyles.programName}>{p.name}</Text>
                <Text style={plStyles.programMeta}>{p.split} · {p.frequency}</Text>
                <View style={plStyles.programChips}>
                  {p.recommended && <View style={plStyles.recChip}><Text style={plStyles.recChipText}>RECOMMENDED</Text></View>}
                  <View style={[plStyles.goalChip, { borderColor: GOAL_COLORS[p.goal] }]}>
                    <Text style={[plStyles.goalChipText, { color: GOAL_COLORS[p.goal] }]}>{p.goal.toUpperCase()}</Text>
                  </View>
                </View>
              </View>
              <Text style={plStyles.programChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Custom program menu */}
        {customMenu && (
          <Modal transparent animationType="fade">
            <TouchableOpacity style={plStyles.menuOverlay} onPress={() => setCustomMenu(null)}>
              <View style={[plStyles.menuSheet, { paddingBottom: insets.bottom + 24 }]}>
                {[
                  { label: 'Edit', action: () => { const cp = customPrograms.find((p) => p.id === customMenu); setCustomMenu(null); if (cp) onOpenBuilder(cp); }, color: Colors.accent },
                  { label: 'Duplicate', action: () => { duplicateCustomProgram(customMenu); setCustomMenu(null); }, color: Colors.text },
                  { label: 'Delete', action: () => { Alert.alert('Delete Program', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { deleteCustomProgram(customMenu); setCustomMenu(null); } }]); }, color: Colors.red },
                ].map(({ label, action, color }) => (
                  <TouchableOpacity key={label} style={plStyles.menuItem} onPress={action}>
                    <Text style={[plStyles.menuItemText, { color }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

const plStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  detailHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 14, paddingHorizontal: 16, paddingLeft: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4, paddingTop: 2 },
  backBtnText: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text3, lineHeight: 26 },
  title: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text, letterSpacing: 0.4, lineHeight: 24, flex: 1 },
  subtitle: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5, marginTop: 3 },
  createBtn: { backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  createBtnText: { fontFamily: Fonts.mono, fontSize: 10, color: '#fff', letterSpacing: 0.8, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 },
  recChip: { backgroundColor: Colors.green, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 },
  recChipText: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 0.8, color: '#fff' },
  goalChip: { backgroundColor: Colors.bg3, borderWidth: 1, borderRadius: 99, paddingVertical: 2, paddingHorizontal: 9 },
  goalChipText: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 0.5 },
  filterRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 48 },
  filterChip: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 13, flexShrink: 0 },
  filterChipDark: { backgroundColor: Colors.text, borderColor: Colors.text },
  filterChipSci: { backgroundColor: Colors.green, borderColor: Colors.green },
  filterChipText: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 0.6, color: Colors.text3 },
  filterChipTextDark: { color: Colors.bg },
  filterSep: { width: 1, height: 16, backgroundColor: Colors.border, alignSelf: 'center', marginHorizontal: 4 },
  sectionLabel: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 0.8, color: Colors.text3, padding: 12, paddingHorizontal: 16, paddingBottom: 8 },
  programRow: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: Colors.border },
  accentBar: { width: 4, flexShrink: 0 },
  programContent: { flex: 1, padding: 14, paddingHorizontal: 14 },
  programName: { fontFamily: Fonts.sans, fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 3, lineHeight: 20 },
  programMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.4, marginBottom: 8 },
  programChips: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  programChevron: { fontFamily: Fonts.sans, fontSize: 18, color: Colors.text3, alignSelf: 'center', paddingRight: 16 },
  customBadge: { backgroundColor: 'rgba(79,142,247,0.1)', borderWidth: 1, borderColor: 'rgba(79,142,247,0.2)', borderRadius: 99, paddingVertical: 2, paddingHorizontal: 9, alignSelf: 'center' },
  customBadgeText: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.accent },
  menuBtn: { paddingHorizontal: 14, justifyContent: 'center' },
  menuBtnText: { fontFamily: Fonts.sans, fontSize: 16, letterSpacing: 2, color: Colors.text3 },
  empty: { padding: 48, paddingHorizontal: 24, alignItems: 'center' },
  emptyText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3 },
  // Detail
  descPad: { padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  desc: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text2, lineHeight: 20 },
  scheduleHeader: { padding: 14, paddingHorizontal: 16, paddingBottom: 6 },
  scheduleLabel: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 0.8, color: Colors.text3 },
  dayCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: Colors.bg2, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, overflow: 'hidden' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dayNumBadge: { backgroundColor: Colors.bg3, borderWidth: 1, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  dayNumText: { fontFamily: Fonts.mono, fontSize: 8, letterSpacing: 0.8 },
  dayLabel: { fontFamily: Fonts.display, fontSize: 15, letterSpacing: 0.3, color: Colors.text, flex: 1 },
  dayExCount: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3 },
  muscleTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 8, paddingHorizontal: 14 },
  muscleTag: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8 },
  muscleTagText: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3 },
  dayExList: { padding: 10, paddingHorizontal: 14, paddingTop: 2, paddingBottom: 12, gap: 6 },
  dayExRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayExNum: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, minWidth: 16, textAlign: 'right' },
  dayExName: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.text, flex: 1 },
  dayExSets: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, flexShrink: 0 },
  // CTA bar
  ctaBar: { padding: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bg },
  importBtn: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  importBtnText: { fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 1.2, color: '#fff', fontWeight: '700' },
  importNote: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, textAlign: 'center', marginTop: 8 },
  // Menu sheet
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center' },
  menuSheet: { width: '100%', maxWidth: 480, backgroundColor: Colors.bg2, borderRadius: 20, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingTop: 8 },
  menuItem: { padding: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuItemText: { fontFamily: Fonts.sans, fontSize: 15 },
});

export default function WorkoutScreen() {
  const [view, setView] = useState<WorkoutView>('list');
  const currentSession = useStore((s) => s.currentSession);
  const [showExLib, setShowExLib] = useState(false);
  const [showProgLib, setShowProgLib] = useState(false);
  const [builderProgram, setBuilderProgram] = useState<CustomProgram | undefined>(undefined);
  const [showBuilder, setShowBuilder] = useState(false);

  useEffect(() => {
    if (currentSession && !currentSession.completed) setView('session');
  }, []);

  if (view === 'session') return <SessionView onBack={() => setView('list')} />;

  return (
    <>
      <RoutinesList
        onStartSession={() => setView('session')}
        onOpenExLib={() => setShowExLib(true)}
        onOpenProgLib={() => setShowProgLib(true)}
      />
      {showExLib && <ExerciseLibraryScreen onClose={() => setShowExLib(false)} />}
      {showProgLib && (
        <ProgramLibraryScreen
          onClose={() => setShowProgLib(false)}
          onOpenBuilder={(ep) => { setBuilderProgram(ep); setShowProgLib(false); setShowBuilder(true); }}
        />
      )}
      {showBuilder && (
        <ProgramBuilderScreen
          onClose={() => { setShowBuilder(false); setBuilderProgram(undefined); setShowProgLib(true); }}
          editProgram={builderProgram}
        />
      )}
    </>
  );
}

// ─── Session View Styles ───────────────────────────────────────────────────────

const sv = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.bg3, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.red, letterSpacing: 0.5 },
  sessionName: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, letterSpacing: 1 },
  timerText: { fontFamily: Fonts.mono, fontSize: 16, color: Colors.accent, letterSpacing: 2 },
  finishBtn: { backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  finishText: { fontFamily: Fonts.mono, fontSize: 11, color: '#fff', letterSpacing: 0.5, fontWeight: '700' },
  progressRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6,
    backgroundColor: Colors.bg3, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  progressLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1 },
  progressCount: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accent },
  progressTrack: { height: 3, backgroundColor: Colors.bg5 },
  progressFill: { height: '100%', backgroundColor: Colors.accent },
  content: { padding: 12, gap: 10 },
  exCard: { backgroundColor: Colors.bg3, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, overflow: 'hidden' },
  exHeader: { padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: 'row', alignItems: 'flex-start' },
  exName: { fontFamily: Fonts.sans, fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  muscleTag: { backgroundColor: Colors.bg5, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  muscleTagText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5 },
  sfrTag: { backgroundColor: Colors.bg5, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  sfrTagHigh: { backgroundColor: 'rgba(61,214,140,0.1)', borderWidth: 1, borderColor: 'rgba(61,214,140,0.3)' },
  sfrTagText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5 },
  setTarget: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3 },
  currentWeight: { fontFamily: Fonts.display, fontSize: 20, color: Colors.accent, lineHeight: 24 },
  exMenu: { backgroundColor: Colors.bg4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  exMenuItem: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.border },
  exMenuText: { fontFamily: Fonts.sans, fontSize: 13 },
  colHeader: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: Colors.bg4, borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 4,
  },
  colHeaderText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5, width: 28 },
  setRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 4, backgroundColor: Colors.bg,
  },
  setRowChecked: { backgroundColor: 'rgba(61,214,140,0.06)' },
  setNumCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.bg5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  setNumChecked: { backgroundColor: Colors.green },
  setNumText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, fontWeight: '700' },
  typeChip: { width: 24, height: 24, borderRadius: 6, backgroundColor: Colors.bg4, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  typeChipText: { fontFamily: Fonts.mono, fontSize: 9, fontWeight: '700' },
  prevText: { flex: 1, fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  numInput: {
    width: 52, height: 34, borderRadius: 6, borderWidth: 1, borderColor: Colors.border2,
    backgroundColor: Colors.bg4, fontFamily: Fonts.mono, fontSize: 13,
    color: Colors.text, textAlign: 'center', paddingHorizontal: 4,
  },
  numInputDone: { backgroundColor: 'transparent', borderColor: 'transparent', color: Colors.text2 },
  checkBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(61,214,140,0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkBtnDone: { backgroundColor: Colors.green },
  checkBtnText: { fontSize: 16, color: Colors.green },
  addSetBtn: { padding: 10, alignItems: 'center' },
  addSetText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.accent, letterSpacing: 0.5 },
  addExBtn: {
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border2,
    borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4,
  },
  addExText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.accent, letterSpacing: 0.5 },
  finishBtnFull: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  finishBtnFullText: { fontFamily: Fonts.mono, fontSize: 14, color: '#fff', fontWeight: '700', letterSpacing: 0.5 },
  abandonBtn: { borderWidth: 1, borderColor: Colors.red, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  abandonText: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.red, letterSpacing: 0.5 },
  restSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.bg2, borderTopWidth: 1, borderTopColor: Colors.border2,
    borderRadius: 16, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 12,
    elevation: 20,
  },
  restCountdown: { fontFamily: Fonts.display, fontSize: 40, color: Colors.text, lineHeight: 44 },
  restLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5 },
  restTimerLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },
  restChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: Colors.bg4 },
  restChipActive: { backgroundColor: Colors.accent2 },
  restChipText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  restSkip: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  restSkipText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },
  addExModal: { flex: 1, backgroundColor: Colors.bg },
  addExModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  addExBack: { fontSize: 22, color: Colors.text3 },
  addExTitle: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text, letterSpacing: 0.5 },
  addExSearchBar: { margin: 16, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 12, paddingHorizontal: 14 },
  addExSearchInput: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.text, paddingVertical: 12 },
  filterRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10, flexGrow: 0 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, flexShrink: 0 },
  filterChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterChipText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5 },
  addExRow: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12 },
  addExRowName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  addExRowMeta: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, marginTop: 2 },
  addExRowPlus: { fontSize: 22, color: Colors.accent },
  finishOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  finishModal: { backgroundColor: Colors.bg2, borderRadius: 20, padding: 28, width: '100%', maxWidth: 440 },
  finishEmoji: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
  finishTitle: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, textAlign: 'center', letterSpacing: 0.5, marginBottom: 4 },
  finishMeta: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, textAlign: 'center', letterSpacing: 0.5, marginBottom: 20 },
  finishStats: { flexDirection: 'row', marginBottom: 24 },
  finishStat: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  finishStatVal: { fontFamily: Fonts.display, fontSize: 28, color: Colors.accent, lineHeight: 32 },
  finishStatLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5, marginTop: 4 },
  keepGoingBtn: { flex: 1, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  keepGoingText: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.text3, letterSpacing: 0.5 },
  saveBtn: { flex: 2, backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: '#fff', fontWeight: '700', letterSpacing: 0.5 },
});

// ─── Routines List Styles ─────────────────────────────────────────────────────

const rl = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8 },
  title: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, letterSpacing: 1 },
  subtitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },
  headerBtnRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  startBtn: { backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  startBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: '#fff', letterSpacing: 1, fontWeight: '700' },
  iconBtn: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 18 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 10 },
  resumeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(79,142,247,0.1)', borderWidth: 1.5, borderColor: 'rgba(79,142,247,0.35)',
    borderRadius: 12, padding: 14,
  },
  resumeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent, flexShrink: 0 },
  resumeLabel: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.accent, letterSpacing: 0.5 },
  resumeSub: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text, marginTop: 2 },
  resumeArrow: { fontSize: 20, color: Colors.accent },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, flexShrink: 0 },
  filterChipActive: { backgroundColor: Colors.accent2, borderColor: Colors.accent2 },
  filterChipText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },
  card: {
    backgroundColor: Colors.bg3, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 14, overflow: 'hidden',
  },
  cardNext: { borderColor: Colors.accent, shadowColor: Colors.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.15, shadowRadius: 8 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 4 },
  nextUpBadge: { backgroundColor: 'rgba(79,142,247,0.12)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  nextUpText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.accent, letterSpacing: 1 },
  cardName: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, letterSpacing: 1, paddingHorizontal: 14, marginBottom: 4 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 14, marginBottom: 12 },
  cardMetaText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5 },
  cardMetaDot: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.border2 },
  exRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14 },
  exName: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.text2, flex: 1 },
  exWeight: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.accent },
  exMore: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, paddingHorizontal: 14, marginTop: 2 },
  increaseBadge: { backgroundColor: 'rgba(61,214,140,0.1)', borderWidth: 1, borderColor: 'rgba(61,214,140,0.25)', borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1 },
  increaseBadgeText: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.green, letterSpacing: 0.5 },
  startRoutineBtn: {
    margin: 14, marginTop: 0,
    backgroundColor: Colors.bg5, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 8, paddingVertical: 10, alignItems: 'center',
  },
  startRoutineBtnNext: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  startRoutineText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text2, letterSpacing: 1, fontWeight: '700' },
  previewSheet: { flex: 1, backgroundColor: Colors.bg2 },
  previewHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  previewTitle: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, letterSpacing: 0.5, marginBottom: 4 },
  previewMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5 },
  previewClose: { fontSize: 20, color: Colors.text3, padding: 4 },
  previewRow: {
    flexDirection: 'row', alignItems: 'center', padding: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12,
  },
  previewNum: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.bg4, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  previewNumText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3 },
  previewExName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  previewExMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, marginTop: 2 },
  sfrBadge: { backgroundColor: Colors.bg4, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  sfrBadgeHigh: { backgroundColor: 'rgba(61,214,140,0.1)' },
  sfrBadgeText: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3, letterSpacing: 0.5 },
  previewFooter: { padding: 20, borderTopWidth: 1, borderTopColor: Colors.border },
  previewStartBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  previewStartText: { fontFamily: Fonts.mono, fontSize: 13, color: '#fff', fontWeight: '700', letterSpacing: 0.5 },
});

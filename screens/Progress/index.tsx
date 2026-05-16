import { useState, useMemo } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, TextInput, StyleSheet,
  Modal, FlatList, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import Svg, { Path, Circle, Line, Rect, Ellipse, Polygon, G, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../store';
import { getExerciseById } from '../../data/exercises';
import type { WorkoutLog, BodyMeasurements, ProgressEntry } from '../../types';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { getLeaderboard, submitScore } from '../../services/leaderboardService';
import type { TimeRange } from '../../services/leaderboardService';

// ─── Constants ────────────────────────────────────────────

const MUSCLE_COLORS: Record<string, string> = {
  chest:      Colors.accent,
  back:       Colors.accent2,
  shoulders:  Colors.accent3,
  quads:      Colors.green,
  hamstrings: Colors.red,
  biceps:     '#F7D44F',
  triceps:    '#4FD4E8',
  glutes:     '#F74FA3',
  calves:     '#8EF74F',
  core:       Colors.yellow,
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_INITIALS = ['M','T','W','T','F','S','S'];

// ─── Helpers ──────────────────────────────────────────────

function toDS(iso: string) { return iso.split('T')[0]; }

function fmtVolume(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${Math.round(vol / 1_000)}K`;
  return String(Math.round(vol));
}

function calcStreaks(logs: WorkoutLog[]): { current: number; best: number } {
  const dates = [...new Set(logs.map((l) => toDS(l.date)))].sort();
  if (dates.length === 0) return { current: 0, best: 0 };
  let best = 1, run = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000;
    run = diff === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  const dateSet = new Set(dates);
  const todayDs = toDS(new Date().toISOString());
  const yestDs  = toDS(new Date(Date.now() - 86400000).toISOString());
  let current = 0;
  const startDs = dateSet.has(todayDs) ? todayDs : dateSet.has(yestDs) ? yestDs : null;
  if (startDs) {
    const d = new Date(startDs);
    while (dateSet.has(toDS(d.toISOString()))) { current++; d.setDate(d.getDate() - 1); }
  }
  return { current, best: Math.max(best, current) };
}

// ─── SVG Charts ───────────────────────────────────────────

function LineChart({ data, color = Colors.accent, unit = 'kg' }: { data: { label: string; value: number }[]; color?: string; unit?: string }) {
  if (data.length < 2) {
    return <Text style={chartStyles.empty}>Complete more sessions to see your progress curve</Text>;
  }
  const W = 320, H = 130, PX = 30, PY = 14;
  const vals = data.map((d) => d.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const rangeV = maxV - minV || 1;
  const N = data.length;
  const sx = (i: number) => PX + (i / (N - 1)) * (W - PX * 2);
  const sy = (v: number) => PY + (1 - (v - minV) / rangeV) * (H - PY * 2);
  const pts = data.map((d, i) => ({ x: sx(i), y: sy(d.value), ...d }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length-1].x.toFixed(1)} ${(H-PY).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(H-PY).toFixed(1)} Z`;
  const labelIdxs = N <= 3 ? [...Array(N).keys()] : [0, Math.floor((N-1)/2), N-1];
  return (
    <Svg width="100%" height={H + 16} viewBox={`0 0 ${W} ${H + 16}`}>
      {[0, 0.5, 1].map((t, i) => (
        <G key={i}>
          <Line x1={PX} y1={PY + t*(H-PY*2)} x2={W-PX} y2={PY + t*(H-PY*2)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          <SvgText x={PX-4} y={PY + t*(H-PY*2) + 4} fontSize={8} fill="rgba(255,255,255,0.25)" textAnchor="end">{Math.round(minV + (1-t)*rangeV)}{unit}</SvgText>
        </G>
      ))}
      <Path d={areaPath} fill={color} opacity={0.12} />
      <Path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={i === pts.length-1 ? 4 : 2.5} fill={color} />)}
      {labelIdxs.map((i) => (
        <SvgText key={i} x={sx(i)} y={H+12} fontSize={8} fill="rgba(255,255,255,0.3)" textAnchor="middle">{data[i].label}</SvgText>
      ))}
    </Svg>
  );
}

function BodyDiagram({ muscleCounts }: { muscleCounts: Record<string, number> }) {
  const maxC = Math.max(...Object.values(muscleCounts), 1);
  const opa = (mg: string) => Math.max(0.15, (muscleCounts[mg] ?? 0) / maxC);
  const fc  = (mg: string) => MUSCLE_COLORS[mg] ?? Colors.text3;
  const bodyColor = Colors.bg5;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
      {/* Front */}
      <View style={{ alignItems: 'center' }}>
        <Text style={chartStyles.diagramLabel}>FRONT</Text>
        <Svg viewBox="0 0 80 188" width={88} height={207}>
          <Circle cx={40} cy={13} r={12} fill={bodyColor} />
          <Rect x={36} y={25} width={8} height={8} rx={2} fill={bodyColor} />
          <Rect x={22} y={33} width={36} height={62} rx={8} fill={bodyColor} />
          <Rect x={11} y={35} width={13} height={55} rx={6} fill={bodyColor} />
          <Rect x={56} y={35} width={13} height={55} rx={6} fill={bodyColor} />
          <Rect x={24} y={94} width={32} height={15} rx={6} fill={bodyColor} />
          <Rect x={23} y={108} width={14} height={66} rx={6} fill={bodyColor} />
          <Rect x={43} y={108} width={14} height={66} rx={6} fill={bodyColor} />
          <Ellipse cx={33} cy={52} rx={9} ry={11} fill={fc('chest')} opacity={opa('chest')} />
          <Ellipse cx={47} cy={52} rx={9} ry={11} fill={fc('chest')} opacity={opa('chest')} />
          <Ellipse cx={20} cy={41} rx={7} ry={10} fill={fc('shoulders')} opacity={opa('shoulders')} />
          <Ellipse cx={60} cy={41} rx={7} ry={10} fill={fc('shoulders')} opacity={opa('shoulders')} />
          <Rect x={12} y={47} width={11} height={23} rx={4} fill={fc('biceps')} opacity={opa('biceps')} />
          <Rect x={57} y={47} width={11} height={23} rx={4} fill={fc('biceps')} opacity={opa('biceps')} />
          <Rect x={29} y={66} width={22} height={28} rx={4} fill={fc('core')} opacity={opa('core')} />
          <Rect x={24} y={108} width={12} height={34} rx={4} fill={fc('quads')} opacity={opa('quads')} />
          <Rect x={44} y={108} width={12} height={34} rx={4} fill={fc('quads')} opacity={opa('quads')} />
          <Rect x={25} y={145} width={10} height={27} rx={4} fill={fc('calves')} opacity={opa('calves')} />
          <Rect x={45} y={145} width={10} height={27} rx={4} fill={fc('calves')} opacity={opa('calves')} />
        </Svg>
      </View>
      {/* Back */}
      <View style={{ alignItems: 'center' }}>
        <Text style={chartStyles.diagramLabel}>BACK</Text>
        <Svg viewBox="0 0 80 188" width={88} height={207}>
          <Circle cx={40} cy={13} r={12} fill={bodyColor} />
          <Rect x={36} y={25} width={8} height={8} rx={2} fill={bodyColor} />
          <Rect x={22} y={33} width={36} height={62} rx={8} fill={bodyColor} />
          <Rect x={11} y={35} width={13} height={55} rx={6} fill={bodyColor} />
          <Rect x={56} y={35} width={13} height={55} rx={6} fill={bodyColor} />
          <Rect x={24} y={94} width={32} height={15} rx={6} fill={bodyColor} />
          <Rect x={23} y={108} width={14} height={66} rx={6} fill={bodyColor} />
          <Rect x={43} y={108} width={14} height={66} rx={6} fill={bodyColor} />
          <Rect x={24} y={35} width={32} height={44} rx={6} fill={fc('back')} opacity={opa('back')} />
          <Ellipse cx={20} cy={41} rx={7} ry={10} fill={fc('shoulders')} opacity={opa('shoulders')} />
          <Ellipse cx={60} cy={41} rx={7} ry={10} fill={fc('shoulders')} opacity={opa('shoulders')} />
          <Rect x={12} y={47} width={11} height={23} rx={4} fill={fc('triceps')} opacity={opa('triceps')} />
          <Rect x={57} y={47} width={11} height={23} rx={4} fill={fc('triceps')} opacity={opa('triceps')} />
          <Rect x={24} y={95} width={32} height={15} rx={5} fill={fc('glutes')} opacity={opa('glutes')} />
          <Rect x={24} y={108} width={12} height={34} rx={4} fill={fc('hamstrings')} opacity={opa('hamstrings')} />
          <Rect x={44} y={108} width={12} height={34} rx={4} fill={fc('hamstrings')} opacity={opa('hamstrings')} />
          <Rect x={25} y={145} width={10} height={27} rx={4} fill={fc('calves')} opacity={opa('calves')} />
          <Rect x={45} y={145} width={10} height={27} rx={4} fill={fc('calves')} opacity={opa('calves')} />
        </Svg>
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  empty: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, textAlign: 'center', paddingVertical: 28 },
  diagramLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3, letterSpacing: 1, marginBottom: 6 },
});

// ─── Consistency Grid ─────────────────────────────────────

function ConsistencyGrid({ workoutLogs }: { workoutLogs: WorkoutLog[] }) {
  const logDates = useMemo(() => new Set(workoutLogs.map((l) => toDS(l.date))), [workoutLogs]);
  const grid = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const todayDs = toDS(today.toISOString());
    const dow = (today.getDay() + 6) % 7;
    const startDay = new Date(today);
    startDay.setDate(startDay.getDate() - dow - 7*11);
    return Array.from({ length: 84 }, (_, i) => {
      const d = new Date(startDay); d.setDate(d.getDate() + i);
      const ds = toDS(d.toISOString());
      return { date: ds, hasWorkout: logDates.has(ds), isFuture: d > today, isToday: ds === todayDs };
    });
  }, [logDates]);

  const trained     = grid.filter((c) => !c.isFuture && c.hasWorkout).length;
  const total       = grid.filter((c) => !c.isFuture).length || 1;
  const consistency = Math.round((trained / total) * 100);
  const conColor    = consistency >= 60 ? Colors.green : consistency >= 35 ? Colors.yellow : Colors.accent3;

  return (
    <View style={cgStyles.card}>
      <View style={cgStyles.header}>
        <Text style={cgStyles.title}>CONSISTENCY</Text>
        <Text style={cgStyles.subtitle}>12 WEEKS</Text>
      </View>
      <View style={cgStyles.dayLabels}>
        {DAY_INITIALS.map((d, i) => <Text key={i} style={cgStyles.dayLabel}>{d}</Text>)}
      </View>
      <View style={cgStyles.grid}>
        {grid.map((cell, i) => (
          <View key={i} style={[
            cgStyles.cell,
            cell.isFuture ? { opacity: 0 } : cell.hasWorkout ? { backgroundColor: Colors.accent } : { backgroundColor: Colors.bg5 },
            cell.isToday && cgStyles.cellToday,
          ]} />
        ))}
      </View>
      <View style={cgStyles.statsRow}>
        <View>
          <Text style={cgStyles.statLabel}>DAYS TRAINED</Text>
          <Text style={cgStyles.statVal}><Text style={{ color: Colors.accent }}>{trained}</Text><Text style={cgStyles.statUnit}> / {total}</Text></Text>
        </View>
        <View>
          <Text style={cgStyles.statLabel}>CONSISTENCY</Text>
          <Text style={[cgStyles.statVal, { color: conColor }]}>{consistency}%</Text>
        </View>
      </View>
    </View>
  );
}

const cgStyles = StyleSheet.create({
  card: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 16, marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 1.5 },
  subtitle: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1 },
  dayLabels: { flexDirection: 'row', marginBottom: 4 },
  dayLabel: { flex: 1, fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100/7}%` as any, aspectRatio: 1, borderRadius: 3, borderWidth: 1.5, borderColor: 'transparent', padding: 1.5 },
  cellToday: { borderColor: 'rgba(79,142,247,0.7)' },
  statsRow: { flexDirection: 'row', gap: 28, marginTop: 14 },
  statLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1, marginBottom: 4 },
  statVal: { fontFamily: Fonts.display, fontSize: 24, color: Colors.text, lineHeight: 28 },
  statUnit: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3 },
});

// ─── Strength Curve Card ──────────────────────────────────

function StrengthCurveCard({ workoutLogs }: { workoutLogs: WorkoutLog[] }) {
  const loggedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of workoutLogs) for (const [id, sets] of Object.entries(l.sets)) if (sets.length > 0) ids.add(id);
    return [...ids];
  }, [workoutLogs]);

  const [selectedId, setSelectedId] = useState('');
  const effectiveId = selectedId || loggedIds[0] || '';

  const strengthData = useMemo(() => {
    if (!effectiveId) return [];
    return workoutLogs
      .filter((l) => (l.sets[effectiveId]?.length ?? 0) > 0)
      .map((l) => ({ label: toDS(l.date).slice(5), value: Math.max(...l.sets[effectiveId].map((s) => s.weight)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [workoutLogs, effectiveId]);

  const statData = useMemo(() => {
    if (!effectiveId) return null;
    let best = 0, best1RM = 0;
    for (const l of workoutLogs) for (const s of (l.sets[effectiveId] ?? [])) {
      if (s.weight > best) best = s.weight;
      const est = s.weight * (1 + s.reps/30);
      if (est > best1RM) best1RM = est;
    }
    return best > 0 ? { best, est1RM: Math.round(best1RM) } : null;
  }, [workoutLogs, effectiveId]);

  if (loggedIds.length === 0) {
    return (
      <View style={scStyles.card}>
        <Text style={scStyles.title}>STRENGTH PROGRESS</Text>
        <Text style={scStyles.empty}>Complete your first session to see strength curves.</Text>
      </View>
    );
  }

  return (
    <View style={scStyles.card}>
      <Text style={scStyles.title}>STRENGTH PROGRESS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={scStyles.chips}>
        {loggedIds.map((id) => (
          <TouchableOpacity key={id} style={[scStyles.chip, effectiveId === id && scStyles.chipActive]} onPress={() => setSelectedId(id)}>
            <Text style={[scStyles.chipText, effectiveId === id && scStyles.chipTextActive]} numberOfLines={1}>
              {getExerciseById(id)?.name ?? id}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <LineChart data={strengthData} color={Colors.accent} unit="kg" />
      {statData && (
        <View style={scStyles.statRow}>
          {[
            { label: 'CURRENT BEST', value: `${statData.best}kg`, color: Colors.accent },
            { label: 'EST. 1RM (EPLEY)', value: `${statData.est1RM}kg`, color: Colors.accent2 },
          ].map(({ label, value, color }) => (
            <View key={label} style={scStyles.statCard}>
              <Text style={scStyles.statLabel}>{label}</Text>
              <Text style={[scStyles.statValue, { color }]}>{value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const scStyles = StyleSheet.create({
  card: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 16, marginBottom: 12 },
  title: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 1.5, marginBottom: 12 },
  empty: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3, lineHeight: 18 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text2, letterSpacing: 0.3 },
  chipTextActive: { color: '#fff' },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  statCard: { flex: 1, backgroundColor: Colors.bg4, borderRadius: 10, padding: 12 },
  statLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1, marginBottom: 6 },
  statValue: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 26 },
});

// ─── Edit Profile Sheet ────────────────────────────────────

function EditProfileSheet({ name, username, onSave, onClose }: { name: string; username: string; onSave: (n: string, u: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [n, setN] = useState(name);
  const [u, setU] = useState(username);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[epStyles.container, { paddingBottom: insets.bottom + 16 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={epStyles.handle} />
        <View style={epStyles.header}>
          <Text style={epStyles.title}>EDIT PROFILE</Text>
          <TouchableOpacity onPress={onClose}><Text style={epStyles.close}>✕</Text></TouchableOpacity>
        </View>
        <Text style={epStyles.label}>NAME</Text>
        <TextInput style={epStyles.input} value={n} onChangeText={setN} placeholder="Your name" placeholderTextColor={Colors.text3} />
        <Text style={epStyles.label}>USERNAME</Text>
        <View style={epStyles.usernameRow}>
          <Text style={epStyles.at}>@</Text>
          <TextInput style={epStyles.usernameInput} value={u} onChangeText={(v) => setU(v.replace(/[^a-z0-9_.]/gi, ''))} placeholder="username" placeholderTextColor={Colors.text3} autoCapitalize="none" />
        </View>
        <TouchableOpacity style={epStyles.saveBtn} onPress={() => { onSave(n.trim() || 'Athlete', u.trim() || 'athlete'); onClose(); }}>
          <Text style={epStyles.saveBtnText}>SAVE CHANGES</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const epStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg2, padding: 20 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border2, alignSelf: 'center', marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3, letterSpacing: 1 },
  close: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text3, padding: 4 },
  label: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 2, marginBottom: 8 },
  input: {
    backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, fontFamily: Fonts.sans, fontSize: 15, color: Colors.text, marginBottom: 20,
  },
  usernameRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10, marginBottom: 28, overflow: 'hidden' },
  at: { fontFamily: Fonts.mono, fontSize: 15, color: Colors.text2, paddingLeft: 14, paddingRight: 4 },
  usernameInput: { flex: 1, fontFamily: Fonts.mono, fontSize: 13, color: Colors.text, paddingHorizontal: 8, paddingVertical: 14 },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { fontFamily: Fonts.mono, fontSize: 13, color: '#fff', letterSpacing: 1, fontWeight: '700' },
});

// ─── Body Measurements Screen ─────────────────────────────

const MEASUREMENT_FIELDS: { key: keyof BodyMeasurements; label: string; unit: string }[] = [
  { key: 'bodyweight',  label: 'Bodyweight',  unit: 'kg' },
  { key: 'bodyFat',     label: 'Body Fat',     unit: '%'  },
  { key: 'chest',       label: 'Chest',        unit: 'cm' },
  { key: 'waist',       label: 'Waist',        unit: 'cm' },
  { key: 'hips',        label: 'Hips',         unit: 'cm' },
  { key: 'shoulders',   label: 'Shoulders',    unit: 'cm' },
  { key: 'leftArm',     label: 'Left Arm',     unit: 'cm' },
  { key: 'rightArm',    label: 'Right Arm',    unit: 'cm' },
  { key: 'leftThigh',   label: 'Left Thigh',   unit: 'cm' },
  { key: 'rightThigh',  label: 'Right Thigh',  unit: 'cm' },
  { key: 'neck',        label: 'Neck',         unit: 'cm' },
];

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const W = 56, H = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - ((v - min) / range) * H * 0.75 - H * 0.125,
  }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <Svg width={W} height={H}>
      <Path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last.x} cy={last.y} r={2.5} fill={color} />
    </Svg>
  );
}

function MeasurementsScreen({ onBack }: { onBack: () => void }) {
  const progressEntries = useStore((s) => s.progressEntries);
  const addProgressEntry = useStore((s) => s.addProgressEntry);
  const deleteProgressEntry = useStore((s) => s.deleteProgressEntry);
  const morningWeights = useStore((s) => s.morningWeights);

  const [showForm, setShowForm] = useState(false);
  const [formValues, setFormValues] = useState<BodyMeasurements>({});
  const [selectedEntry, setSelectedEntry] = useState<ProgressEntry | null>(null);

  const sorted = useMemo(() => [...progressEntries].sort((a, b) => b.date.localeCompare(a.date)), [progressEntries]);

  function submit() {
    const entry: ProgressEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      measurements: formValues,
    };
    addProgressEntry(entry);
    setFormValues({});
    setShowForm(false);
  }

  // Trend data for each field across all entries
  function getFieldValues(key: keyof BodyMeasurements) {
    const vals = [...progressEntries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => e.measurements[key])
      .filter((v): v is number => v !== undefined);
    return vals;
  }

  if (selectedEntry) {
    return (
      <View style={{ flex: 1 }}>
        <SubHeader title={new Date(selectedEntry.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} onBack={() => setSelectedEntry(null)} />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {MEASUREMENT_FIELDS.filter((f) => selectedEntry.measurements[f.key] !== undefined).map((f) => (
            <View key={f.key} style={mStyles.detailRow}>
              <Text style={mStyles.detailLabel}>{f.label}</Text>
              <Text style={mStyles.detailValue}>{selectedEntry.measurements[f.key]}{f.unit}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={mStyles.deleteBtn}
            onPress={() => Alert.alert('Delete Entry', 'This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => { deleteProgressEntry(selectedEntry.id); setSelectedEntry(null); } },
            ])}
          >
            <Text style={mStyles.deleteBtnText}>Delete Entry</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (showForm) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SubHeader title="Log Measurements" onBack={() => setShowForm(false)} />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}>
          {MEASUREMENT_FIELDS.map((f) => (
            <View key={f.key} style={mStyles.formRow}>
              <Text style={mStyles.formLabel}>{f.label} ({f.unit})</Text>
              <TextInput
                style={mStyles.formInput}
                value={formValues[f.key] !== undefined ? String(formValues[f.key]) : ''}
                onChangeText={(v) => setFormValues((prev) => ({ ...prev, [f.key]: v === '' ? undefined : parseFloat(v) }))}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={Colors.text3}
              />
            </View>
          ))}
          <TouchableOpacity style={mStyles.submitBtn} onPress={submit}>
            <Text style={mStyles.submitBtnText}>LOG MEASUREMENTS</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={mStyles.headerRow}>
        <SubHeader title="Body Measurements" onBack={onBack} />
      </View>

      {/* Current stats summary */}
      {sorted.length > 0 && (
        <View style={mStyles.summaryGrid}>
          {MEASUREMENT_FIELDS.filter((f) => sorted[0].measurements[f.key] !== undefined).slice(0, 4).map((f) => {
            const vals = getFieldValues(f.key);
            const latest = sorted[0].measurements[f.key]!;
            const prev = vals.length > 1 ? vals[vals.length - 2] : undefined;
            const diff = prev !== undefined ? latest - prev : undefined;
            return (
              <View key={f.key} style={mStyles.summaryCard}>
                <Text style={mStyles.summaryLabel}>{f.label.toUpperCase()}</Text>
                <Text style={mStyles.summaryValue}>{latest}{f.unit}</Text>
                {diff !== undefined && (
                  <Text style={[mStyles.summaryDiff, { color: diff < 0 ? Colors.green : diff > 0 ? Colors.accent3 : Colors.text3 }]}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(1)}{f.unit}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Trend sparklines */}
      {sorted.length >= 2 && (
        <View style={mStyles.sparkGrid}>
          {MEASUREMENT_FIELDS.filter((f) => getFieldValues(f.key).length >= 2).map((f, i) => {
            const vals = getFieldValues(f.key);
            const colors = [Colors.accent, Colors.accent2, Colors.accent3, Colors.green, Colors.yellow, Colors.red];
            const color = colors[i % colors.length];
            return (
              <View key={f.key} style={mStyles.sparkCard}>
                <Text style={mStyles.sparkLabel}>{f.label}</Text>
                <MiniSparkline values={vals} color={color} />
                <Text style={[mStyles.sparkValue, { color }]}>{vals[vals.length - 1]}{f.unit}</Text>
              </View>
            );
          })}
        </View>
      )}

      <TouchableOpacity style={mStyles.logBtn} onPress={() => setShowForm(true)}>
        <Text style={mStyles.logBtnText}>+ LOG MEASUREMENTS</Text>
      </TouchableOpacity>

      <ScrollView>
        {sorted.length === 0 && (
          <View style={mStyles.empty}>
            <Text style={mStyles.emptyText}>No entries yet — log your first measurements</Text>
          </View>
        )}
        {sorted.map((entry) => {
          const d = new Date(entry.date + 'T00:00:00');
          const dateStr = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
          const fieldCount = Object.values(entry.measurements).filter((v) => v !== undefined).length;
          return (
            <TouchableOpacity key={entry.id} style={mStyles.entryRow} onPress={() => setSelectedEntry(entry)}>
              <View style={{ flex: 1 }}>
                <Text style={mStyles.entryDate}>{dateStr}</Text>
                <Text style={mStyles.entryMeta}>{fieldCount} measurements logged</Text>
              </View>
              {entry.measurements.bodyweight !== undefined && (
                <Text style={mStyles.entryWeight}>{entry.measurements.bodyweight}kg</Text>
              )}
              <Text style={mStyles.entryChevron}>›</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const mStyles = StyleSheet.create({
  headerRow: { },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 8, paddingHorizontal: 16 },
  summaryCard: { flex: 1, minWidth: '45%', backgroundColor: Colors.bg3, borderRadius: 10, padding: 12 },
  summaryLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5, marginBottom: 4 },
  summaryValue: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, lineHeight: 26 },
  summaryDiff: { fontFamily: Fonts.mono, fontSize: 9, marginTop: 2 },
  sparkGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, paddingHorizontal: 16, gap: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 16 },
  sparkCard: { backgroundColor: Colors.bg3, borderRadius: 10, padding: 10, alignItems: 'flex-start', gap: 4 },
  sparkLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3, letterSpacing: 0.5 },
  sparkValue: { fontFamily: Fonts.display, fontSize: 14 },
  logBtn: {
    marginHorizontal: 16, marginVertical: 12,
    backgroundColor: Colors.accent2, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  logBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: '#fff', letterSpacing: 0.8, fontWeight: '700' },
  empty: { padding: 60, alignItems: 'center' },
  emptyText: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.text3, textAlign: 'center' },
  entryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  entryDate: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text, marginBottom: 2 },
  entryMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  entryWeight: { fontFamily: Fonts.display, fontSize: 18, color: Colors.accent3, flexShrink: 0 },
  entryChevron: { fontFamily: Fonts.sans, fontSize: 16, color: Colors.text3 },
  // Detail
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  detailLabel: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },
  detailValue: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.accent3 },
  deleteBtn: { marginTop: 8, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.red, borderRadius: 10 },
  deleteBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.red, letterSpacing: 0.5 },
  // Form
  formRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  formLabel: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, flex: 1 },
  formInput: {
    width: 90, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10,
    fontFamily: Fonts.mono, fontSize: 14, color: Colors.text, textAlign: 'right',
  },
  submitBtn: { backgroundColor: Colors.accent2, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  submitBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: '#fff', letterSpacing: 1, fontWeight: '700' },
});

// ─── Workout History Screen ────────────────────────────────

function WorkoutHistoryScreen({ onBack }: { onBack: () => void }) {
  const workoutLogs = useStore((s) => s.workoutLogs);
  const program = useStore((s) => s.currentProgram);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const logs = useMemo(() =>
    [...workoutLogs].sort((a, b) => b.date.localeCompare(a.date)),
    [workoutLogs]
  );

  if (selectedDate) {
    const log = workoutLogs.find((l) => l.date === selectedDate);
    if (!log) { setSelectedDate(null); return null; }
    const dayLabel = program?.days[log.dayIndex]?.label ?? `Day ${log.dayIndex + 1}`;
    const totalVol = Object.values(log.sets).reduce(
      (a, sets) => a + sets.reduce((b, s) => b + s.weight * s.reps, 0), 0
    );
    return (
      <View style={{ flex: 1 }}>
        <SubHeader title={dayLabel} onBack={() => setSelectedDate(null)} />
        <View style={whStyles.detailVolRow}>
          <Text style={whStyles.detailDate}>
            {new Date(log.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text style={whStyles.detailVol}>
            {totalVol > 1000 ? `${(totalVol / 1000).toFixed(1)}k` : Math.round(totalVol)} kg
          </Text>
        </View>
        <ScrollView>
          {Object.entries(log.sets).map(([exId, sets]) => {
            const ex = getExerciseById(exId);
            const vol = sets.reduce((a, s) => a + s.weight * s.reps, 0);
            const best1rm = Math.max(...sets.map((s) => s.weight * (1 + s.reps / 30)));
            return (
              <View key={exId} style={whStyles.exBlock}>
                <View style={whStyles.exRow}>
                  <Text style={whStyles.exName}>{ex?.name ?? exId}</Text>
                  <Text style={whStyles.ex1rm}>1RM: {best1rm.toFixed(1)}kg</Text>
                </View>
                {sets.map((s, i) => (
                  <View key={i} style={whStyles.setRow}>
                    <Text style={whStyles.setNum}>S{i + 1}</Text>
                    <Text style={whStyles.setWeight}>{s.weight}kg × {s.reps}</Text>
                    <Text style={whStyles.setVol}>= {Math.round(s.weight * s.reps)}kg vol</Text>
                  </View>
                ))}
                <Text style={whStyles.exTotalVol}>TOTAL VOL: {Math.round(vol)}kg</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="Workout History" onBack={onBack} />
      <View style={whStyles.countRow}>
        <Text style={whStyles.countText}>{logs.length} sessions</Text>
      </View>
      <ScrollView>
        {logs.length === 0 && (
          <View style={whStyles.empty}>
            <Text style={whStyles.emptyText}>No sessions logged yet</Text>
          </View>
        )}
        {logs.map((log) => {
          const dayLabel = program?.days[log.dayIndex]?.label ?? `Day ${log.dayIndex + 1}`;
          const totalVol = Object.values(log.sets).reduce(
            (a, sets) => a + sets.reduce((b, s) => b + s.weight * s.reps, 0), 0
          );
          const totalSets = Object.values(log.sets).reduce((a, s) => a + s.length, 0);
          const exCount = Object.keys(log.sets).length;
          const d = new Date(log.date + 'T00:00:00');
          const dateStr = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
          return (
            <TouchableOpacity key={log.date} style={whStyles.logRow} onPress={() => setSelectedDate(log.date)}>
              <View style={whStyles.logBadge}>
                <Text style={whStyles.logBadgeText}>{totalSets}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={whStyles.logLabel}>{dayLabel}</Text>
                <Text style={whStyles.logMeta}>
                  {exCount} exercises · {totalVol > 1000 ? `${(totalVol / 1000).toFixed(1)}k` : Math.round(totalVol)}kg vol
                </Text>
              </View>
              <Text style={whStyles.logDate}>{dateStr}</Text>
              <Text style={whStyles.logChevron}>›</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const whStyles = StyleSheet.create({
  countRow: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  countText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  empty: { padding: 60, paddingHorizontal: 20, alignItems: 'center' },
  emptyText: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.text3 },
  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  logBadge: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: 'rgba(79,142,247,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  logBadgeText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.accent },
  logLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text, marginBottom: 2 },
  logMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  logDate: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, flexShrink: 0 },
  logChevron: { fontFamily: Fonts.sans, fontSize: 16, color: Colors.text3 },
  // Detail
  detailVolRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  detailDate: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  detailVol: { fontFamily: Fonts.display, fontSize: 20, color: Colors.accent },
  exBlock: { padding: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  exRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  exName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text, fontWeight: '500' },
  ex1rm: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  setRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  setNum: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3, minWidth: 20 },
  setWeight: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text },
  setVol: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3 },
  exTotalVol: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, marginTop: 6 },
});

// ─── Sub-Screens ──────────────────────────────────────────

type SubView = null | 'statistics' | 'weight' | 'calendar' | 'exercises' | 'leaderboard' | 'measurements';

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={subStyles.header}>
      <TouchableOpacity onPress={onBack} style={subStyles.backBtn}>
        <Text style={subStyles.backBtnText}>←</Text>
      </TouchableOpacity>
      <Text style={subStyles.title}>{title}</Text>
    </View>
  );
}
const subStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  backBtn: { padding: 4 },
  backBtnText: { fontFamily: Fonts.sans, fontSize: 24, color: Colors.text2 },
  title: { fontFamily: Fonts.display, fontSize: 26, color: Colors.text, letterSpacing: 1 },
});

function StatisticsScreen({ onBack }: { onBack: () => void }) {
  const workoutLogs = useStore((s) => s.workoutLogs);
  const totalSets   = useMemo(() => workoutLogs.reduce((s, l) => s + Object.values(l.sets).flat().length, 0), [workoutLogs]);
  const totalReps   = useMemo(() => workoutLogs.reduce((s, l) => s + Object.values(l.sets).flat().reduce((r, set) => r + set.reps, 0), 0), [workoutLogs]);
  const totalVolume = useMemo(() => workoutLogs.reduce((s, l) => s + Object.values(l.sets).flat().reduce((v, set) => v + set.weight*set.reps, 0), 0), [workoutLogs]);

  const muscleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of workoutLogs) for (const [exId, sets] of Object.entries(log.sets)) {
      const ex = getExerciseById(exId);
      if (!ex) continue;
      counts[ex.muscleGroup] = (counts[ex.muscleGroup] ?? 0) + sets.length;
    }
    return counts;
  }, [workoutLogs]);

  const mgList     = useMemo(() => Object.entries(muscleCounts).sort((a, b) => b[1]-a[1]), [muscleCounts]);
  const maxMg      = mgList[0]?.[1] ?? 1;
  const totalMgSets = mgList.reduce((s, [,c]) => s+c, 0) || 1;

  const monthlyWorkouts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of workoutLogs) {
      const key = toDS(log.date).slice(0, 7);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`;
      return { label: MONTHS[d.getMonth()], count: counts[key] ?? 0 };
    });
  }, [workoutLogs]);
  const maxMonthly = Math.max(...monthlyWorkouts.map((m) => m.count), 1);
  const thisMonth  = monthlyWorkouts[5];
  const lastMonth  = monthlyWorkouts[4];
  const diff       = thisMonth.count - lastMonth.count;
  const insets     = useSafeAreaInsets();

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[stStyles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
      <SubHeader title="STATISTICS" onBack={onBack} />
      <View style={stStyles.statsGrid}>
        {[
          { label: 'SESSIONS',   value: String(workoutLogs.length), color: Colors.accent  },
          { label: 'TOTAL SETS', value: String(totalSets),          color: Colors.accent2 },
          { label: 'TOTAL REPS', value: fmtVolume(totalReps),       color: Colors.accent3 },
          { label: 'VOLUME',     value: `${fmtVolume(totalVolume)}kg`, color: Colors.green },
        ].map(({ label, value, color }) => (
          <View key={label} style={stStyles.statCard}>
            <Text style={stStyles.statLabel}>{label}</Text>
            <Text style={[stStyles.statValue, { color }]}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={stStyles.card}>
        <Text style={stStyles.sectionLabel}>MUSCLE MAP</Text>
        {workoutLogs.length === 0 ? <Text style={stStyles.emptyText}>Complete a workout to see your muscle activation map.</Text> : <BodyDiagram muscleCounts={muscleCounts} />}
      </View>

      {mgList.length > 0 && (
        <View style={stStyles.card}>
          <Text style={stStyles.sectionLabel}>SETS PER MUSCLE GROUP</Text>
          <View style={{ gap: 10 }}>
            {mgList.slice(0, 10).map(([mg, count]) => (
              <View key={mg} style={stStyles.mgRow}>
                <Text style={stStyles.mgLabel}>{mg}</Text>
                <View style={stStyles.mgTrack}>
                  <View style={[stStyles.mgFill, { width: `${(count/maxMg)*100}%` as any, backgroundColor: MUSCLE_COLORS[mg] ?? Colors.accent }]} />
                </View>
                <Text style={stStyles.mgCount}>{count}</Text>
              </View>
            ))}
          </View>
          <View style={[stStyles.mgLegend]}>
            {mgList.slice(0, 8).map(([mg, count]) => (
              <View key={mg} style={stStyles.legendItem}>
                <View style={[stStyles.legendDot, { backgroundColor: MUSCLE_COLORS[mg] ?? Colors.accent }]} />
                <Text style={stStyles.legendLabel}>{mg}</Text>
                <Text style={stStyles.legendPct}>{Math.round((count/totalMgSets)*100)}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={stStyles.card}>
        <Text style={stStyles.sectionLabel}>MONTHLY WORKOUTS</Text>
        <View style={stStyles.barChart}>
          {monthlyWorkouts.map(({ label, count }) => (
            <View key={label} style={stStyles.barCol}>
              {count > 0 && <Text style={stStyles.barCount}>{count}</Text>}
              <View style={[stStyles.bar, { height: count > 0 ? Math.max(4, (count/maxMonthly)*70) : 3, backgroundColor: count > 0 ? Colors.accent : Colors.bg5 }]} />
              <Text style={stStyles.barLabel}>{label}</Text>
            </View>
          ))}
        </View>
        {workoutLogs.length > 0 && (
          <View style={stStyles.monthCompare}>
            <View>
              <Text style={stStyles.mcLabel}>THIS MONTH</Text>
              <Text style={[stStyles.mcValue, { color: Colors.accent }]}>{thisMonth.count} sessions</Text>
            </View>
            {lastMonth.count > 0 && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={stStyles.mcLabel}>VS LAST MONTH</Text>
                <Text style={[stStyles.mcValue, { color: diff >= 0 ? Colors.green : Colors.accent3 }]}>
                  {diff >= 0 ? '+' : ''}{diff}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const stStyles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statCard: { width: '48%', backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14 },
  statLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1, marginBottom: 6 },
  statValue: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 32 },
  card: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 16, marginBottom: 12 },
  sectionLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 1.5, marginBottom: 16 },
  emptyText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3 },
  mgRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mgLabel: { width: 80, fontFamily: Fonts.mono, fontSize: 10, color: Colors.text2, textTransform: 'capitalize' },
  mgTrack: { flex: 1, height: 7, backgroundColor: Colors.bg5, borderRadius: 99, overflow: 'hidden' },
  mgFill: { height: '100%', borderRadius: 99 },
  mgCount: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, width: 26, textAlign: 'right' },
  mgLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text2, textTransform: 'capitalize' },
  legendPct: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 6, marginBottom: 14 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  barCount: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  bar: { width: '100%', borderRadius: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 3 },
  barLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  monthCompare: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Colors.bg4, borderRadius: 10, padding: 14 },
  mcLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1, marginBottom: 4 },
  mcValue: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 26 },
});

function WeightTrendScreen({ onBack }: { onBack: () => void }) {
  const morningWeights   = useStore((s) => s.morningWeights);
  const addMorningWeight = useStore((s) => s.addMorningWeight);
  const insets           = useSafeAreaInsets();
  const [logOpen, setLogOpen]     = useState(false);
  const [logWeight, setLogWeight] = useState('');
  const today = toDS(new Date().toISOString());

  const chartData = useMemo(
    () => [...morningWeights].sort((a,b) => a.date.localeCompare(b.date)).slice(-30).map((w) => ({ label: w.date.slice(5), value: w.weight })),
    [morningWeights]
  );
  const currentEntry = useMemo(() => [...morningWeights].sort((a,b) => b.date.localeCompare(a.date))[0] ?? null, [morningWeights]);
  const lowestWeight = useMemo(() => morningWeights.length > 0 ? Math.min(...morningWeights.map((w) => w.weight)) : null, [morningWeights]);
  const weeklyAvg    = useMemo(() => {
    const result: { label: string; avg: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const end = new Date(); end.setDate(end.getDate() - i*7);
      const start = new Date(end); start.setDate(start.getDate() - 7);
      const ws = morningWeights.filter((w) => w.date >= toDS(start.toISOString()) && w.date < toDS(end.toISOString()));
      if (ws.length > 0) result.push({ label: `W${4-i}`, avg: Math.round((ws.reduce((s,w) => s+w.weight, 0) / ws.length) * 10) / 10 });
    }
    return result;
  }, [morningWeights]);

  function saveLog() {
    const w = parseFloat(logWeight);
    if (!isNaN(w) && w > 0) { addMorningWeight(today, w); setLogOpen(false); setLogWeight(''); }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[stStyles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
      <SubHeader title="WEIGHT TREND" onBack={onBack} />

      <View style={[stStyles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <View>
          <Text style={stStyles.statLabel}>CURRENT</Text>
          {currentEntry ? (
            <Text style={[stStyles.statValue, { color: Colors.accent3, fontSize: 38 }]}>{currentEntry.weight}<Text style={{ fontSize: 16, color: Colors.text3 }}>kg</Text></Text>
          ) : (
            <Text style={stStyles.emptyText}>Not logged</Text>
          )}
          {lowestWeight != null && <Text style={[stStyles.statLabel, { marginTop: 4 }]}>LOWEST: {lowestWeight}kg</Text>}
        </View>
        <TouchableOpacity style={wtStyles.logBtn} onPress={() => { setLogWeight(''); setLogOpen(true); }}>
          <Text style={wtStyles.logBtnText}>+ LOG WEIGHT</Text>
        </TouchableOpacity>
      </View>

      {chartData.length >= 2 && (
        <View style={stStyles.card}>
          <Text style={stStyles.sectionLabel}>30-DAY TREND</Text>
          <LineChart data={chartData} color={Colors.accent3} unit="kg" />
        </View>
      )}

      {weeklyAvg.length > 0 && (
        <View style={stStyles.card}>
          <Text style={stStyles.sectionLabel}>WEEKLY AVERAGES</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {weeklyAvg.map(({ label, avg }) => (
              <View key={label} style={[stStyles.statCard, { flex: 1, width: 'auto' as any }]}>
                <Text style={stStyles.statLabel}>{label}</Text>
                <Text style={[stStyles.statValue, { fontSize: 20, color: Colors.accent3 }]}>{avg}kg</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {morningWeights.length === 0 && (
        <View style={stStyles.card}>
          <Text style={stStyles.emptyText}>Log your morning weight daily to track body composition trends.</Text>
        </View>
      )}

      {/* Log modal */}
      <Modal visible={logOpen} animationType="slide" presentationStyle="pageSheet" transparent onRequestClose={() => setLogOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[wtStyles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={wtStyles.handle} />
            <Text style={wtStyles.sheetTitle}>LOG MORNING WEIGHT</Text>
            <View style={wtStyles.inputRow}>
              <TextInput style={wtStyles.input} keyboardType="decimal-pad" placeholder="e.g. 72.5" placeholderTextColor={Colors.text3} value={logWeight} onChangeText={setLogWeight} autoFocus onSubmitEditing={saveLog} />
              <Text style={wtStyles.unit}>kg</Text>
            </View>
            <TouchableOpacity style={wtStyles.saveBtn} onPress={saveLog}>
              <Text style={wtStyles.saveBtnText}>LOG WEIGHT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={wtStyles.cancelBtn} onPress={() => setLogOpen(false)}>
              <Text style={wtStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const wtStyles = StyleSheet.create({
  logBtn: { backgroundColor: Colors.accent3, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  logBtnText: { fontFamily: Fonts.mono, fontSize: 11, color: '#fff', letterSpacing: 1, fontWeight: '700' },
  sheet: { backgroundColor: Colors.bg2, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.accent3, letterSpacing: 1, marginBottom: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  input: { flex: 1, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontFamily: Fonts.mono, fontSize: 28, color: Colors.text },
  unit: { fontFamily: Fonts.mono, fontSize: 18, color: Colors.text3 },
  saveBtn: { backgroundColor: Colors.accent3, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  saveBtnText: { fontFamily: Fonts.mono, fontSize: 13, color: '#fff', letterSpacing: 0.5, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text3 },
});

function ExercisesScreen({ onBack }: { onBack: () => void }) {
  const workoutLogs  = useStore((s) => s.workoutLogs);
  const bestEst1RMs  = useStore((s) => s.bestEst1RMs);
  const insets       = useSafeAreaInsets();

  const topPRs = Object.entries(bestEst1RMs).sort(([,a],[,b]) => b-a).slice(0, 10);

  const exStats = useMemo(() => {
    const stats: Record<string, { sessions: number; totalSets: number; bestWeight: number; est1RM: number }> = {};
    for (const log of workoutLogs) {
      for (const [exId, sets] of Object.entries(log.sets)) {
        if (!stats[exId]) stats[exId] = { sessions: 0, totalSets: 0, bestWeight: 0, est1RM: 0 };
        stats[exId].sessions++;
        stats[exId].totalSets += sets.length;
        for (const s of sets) {
          if (s.weight > stats[exId].bestWeight) stats[exId].bestWeight = s.weight;
          const est = s.weight * (1 + s.reps/30);
          if (est > stats[exId].est1RM) stats[exId].est1RM = est;
        }
      }
    }
    return stats;
  }, [workoutLogs]);

  const sortedExIds = Object.keys(exStats).sort((a,b) => exStats[b].totalSets - exStats[a].totalSets);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[stStyles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
      <SubHeader title="EXERCISES" onBack={onBack} />

      {topPRs.length > 0 && (
        <View style={stStyles.card}>
          <Text style={stStyles.sectionLabel}>TOP ESTIMATED 1-RMs</Text>
          {topPRs.map(([exId, rm], i) => {
            const ex = getExerciseById(exId);
            return (
              <View key={exId} style={[exStyles.prRow, i < topPRs.length-1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}>
                <Text style={exStyles.prRank}>#{i+1}</Text>
                <Text style={exStyles.prName}>{ex?.name ?? exId}</Text>
                <Text style={exStyles.prValue}>{Math.round(rm)}kg</Text>
              </View>
            );
          })}
        </View>
      )}

      {sortedExIds.length > 0 && (
        <View style={stStyles.card}>
          <Text style={stStyles.sectionLabel}>EXERCISE LOG</Text>
          {sortedExIds.map((exId) => {
            const ex  = getExerciseById(exId);
            const stat = exStats[exId];
            return (
              <View key={exId} style={exStyles.exRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={exStyles.exName} numberOfLines={1}>{ex?.name ?? exId}</Text>
                  <Text style={exStyles.exMeta}>{stat.sessions} sessions · {stat.totalSets} sets · best {stat.bestWeight}kg</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={exStyles.exEst}>{Math.round(stat.est1RM)}kg</Text>
                  <Text style={exStyles.exEstLabel}>est 1RM</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {workoutLogs.length === 0 && (
        <View style={stStyles.card}><Text style={stStyles.emptyText}>Log your first workout to see exercise stats.</Text></View>
      )}
    </ScrollView>
  );
}

const exStyles = StyleSheet.create({
  prRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  prRank: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3, minWidth: 24 },
  prName: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  prValue: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.accent, fontWeight: '700' },
  exRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
  exName: { fontFamily: Fonts.sansMed, fontSize: 13, color: Colors.text, marginBottom: 2 },
  exMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3 },
  exEst: { fontFamily: Fonts.display, fontSize: 20, color: Colors.accent2, lineHeight: 24 },
  exEstLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3 },
});

// ─── Leaderboard Screen ───────────────────────────────────

const LEADERBOARD_EXERCISES = [
  { id: 'bench_press_flat', label: 'Bench Press' },
  { id: 'squat_barbell',    label: 'Barbell Squat' },
  { id: 'rdl',              label: 'Romanian Deadlift' },
  { id: 'ohp_barbell',      label: 'Overhead Press' },
  { id: 'lat_pulldown',     label: 'Lat Pulldown' },
  { id: 'leg_press',        label: 'Leg Press' },
  { id: 'pullup',           label: 'Pull-Up' },
];

function LeaderboardScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const workoutLogs = useStore((s) => s.workoutLogs);
  const userProfile = useStore((s) => s.userProfile);

  const [exerciseId, setExerciseId] = useState(LEADERBOARD_EXERCISES[0].id);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [submitted, setSubmitted] = useState(false);
  const [showExPicker, setShowExPicker] = useState(false);

  const entries = useMemo(() => getLeaderboard(exerciseId, timeRange), [exerciseId, timeRange]);

  const userEst1RM = useMemo(() => {
    let best = 0;
    for (const log of workoutLogs) {
      for (const s of (log.sets[exerciseId] ?? [])) {
        const e = s.weight * (1 + s.reps / 30);
        if (e > best) best = e;
      }
    }
    return best > 0 ? Math.round(best) : null;
  }, [workoutLogs, exerciseId]);

  const userRank = useMemo(() => {
    if (!userEst1RM) return null;
    return entries.filter((e) => e.est1RM > userEst1RM).length + 1;
  }, [entries, userEst1RM]);

  const podium = entries.slice(0, 3);
  const rest   = entries.slice(3, 10);
  const name   = userProfile?.name ?? 'Athlete';
  const uname  = userProfile?.username ?? 'athlete';

  const exerciseLabel = LEADERBOARD_EXERCISES.find((e) => e.id === exerciseId)?.label ?? exerciseId;

  return (
    <View style={[lb.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={lb.header}>
        <TouchableOpacity onPress={onBack} style={lb.backBtn}><Text style={lb.backBtnText}>←</Text></TouchableOpacity>
        <Text style={lb.title}>LEADERBOARD</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
        {/* Exercise picker */}
        <TouchableOpacity style={lb.exPicker} onPress={() => setShowExPicker(true)}>
          <Text style={lb.exPickerText}>{exerciseLabel}</Text>
          <Text style={lb.exPickerArrow}>▾</Text>
        </TouchableOpacity>

        {/* Time range */}
        <View style={lb.timeRow}>
          {(['all', 'month', 'week'] as TimeRange[]).map((t, i) => (
            <TouchableOpacity
              key={t}
              style={[lb.timeBtn, timeRange === t && lb.timeBtnActive, i === 0 && lb.timeBtnFirst, i === 2 && lb.timeBtnLast]}
              onPress={() => setTimeRange(t)}
            >
              <Text style={[lb.timeBtnText, timeRange === t && lb.timeBtnTextActive]}>
                {t === 'all' ? 'ALL TIME' : t === 'month' ? 'MONTH' : 'WEEK'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {entries.length === 0 ? (
          <View style={lb.emptyCard}><Text style={lb.emptyText}>No entries for this time range yet.</Text></View>
        ) : (
          <>
            {/* Podium */}
            {podium.length >= 3 && (
              <View style={lb.card}>
                <Text style={lb.sectionLabel}>TOP 3</Text>
                <View style={lb.podiumRow}>
                  {/* 2nd */}
                  <View style={lb.podiumCol}>
                    <Text style={lb.podiumCountry}>{podium[1].country}</Text>
                    <View style={[lb.podiumAvatar, { borderColor: Colors.accent2 }]}>
                      <Text style={[lb.podiumAvatarText, { color: Colors.accent2 }]}>{podium[1].displayName.charAt(0)}</Text>
                    </View>
                    <Text style={lb.podiumName}>{podium[1].displayName.split(' ')[0]}</Text>
                    <Text style={[lb.podiumKg, { color: Colors.accent2 }]}>{podium[1].est1RM}kg</Text>
                    <View style={[lb.podiumBar, { height: 48, backgroundColor: Colors.bg4 }]}>
                      <Text style={[lb.podiumRank, { color: Colors.accent2 }]}>2</Text>
                    </View>
                  </View>
                  {/* 1st */}
                  <View style={lb.podiumCol}>
                    <Text style={{ fontSize: 20 }}>👑</Text>
                    <View style={[lb.podiumAvatar, { width: 48, height: 48, borderColor: Colors.yellow }]}>
                      <Text style={[lb.podiumAvatarText, { fontSize: 16, color: Colors.yellow }]}>{podium[0].displayName.charAt(0)}</Text>
                    </View>
                    <Text style={lb.podiumName}>{podium[0].displayName.split(' ')[0]}</Text>
                    <Text style={[lb.podiumKg, { fontSize: 22, color: Colors.yellow }]}>{podium[0].est1RM}kg</Text>
                    <View style={[lb.podiumBar, { height: 64, backgroundColor: 'rgba(245,197,66,0.1)', borderWidth: 1, borderColor: 'rgba(245,197,66,0.3)' }]}>
                      <Text style={[lb.podiumRank, { fontSize: 28, color: Colors.yellow }]}>1</Text>
                    </View>
                  </View>
                  {/* 3rd */}
                  <View style={lb.podiumCol}>
                    <Text style={lb.podiumCountry}>{podium[2].country}</Text>
                    <View style={[lb.podiumAvatar, { borderColor: Colors.accent3 }]}>
                      <Text style={[lb.podiumAvatarText, { color: Colors.accent3 }]}>{podium[2].displayName.charAt(0)}</Text>
                    </View>
                    <Text style={lb.podiumName}>{podium[2].displayName.split(' ')[0]}</Text>
                    <Text style={[lb.podiumKg, { color: Colors.accent3 }]}>{podium[2].est1RM}kg</Text>
                    <View style={[lb.podiumBar, { height: 34, backgroundColor: Colors.bg4 }]}>
                      <Text style={[lb.podiumRank, { color: Colors.accent3 }]}>3</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Ranked list 4–10 */}
            {rest.length > 0 && (
              <View style={lb.card}>
                {rest.map((entry, i) => (
                  <View key={entry.userId} style={[lb.rankRow, i < rest.length - 1 && lb.rankRowBorder]}>
                    <Text style={lb.rankNum}>{entry.rank}</Text>
                    <View style={lb.rankAvatar}><Text style={lb.rankAvatarText}>{entry.displayName.charAt(0)}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={lb.rankName}>{entry.displayName}</Text>
                      <Text style={lb.rankMeta}>{entry.country} · @{entry.username}</Text>
                    </View>
                    <Text style={lb.rankKg}>{entry.est1RM}kg</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Your rank card */}
        {userEst1RM ? (
          <View style={lb.youCard}>
            <View style={lb.youAvatar}><Text style={lb.youAvatarText}>{name.charAt(0).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={lb.youLabel}>YOUR RANK</Text>
              <Text style={lb.youRank}>#{userRank} · {userEst1RM}kg est. 1RM</Text>
            </View>
            {!submitted ? (
              <TouchableOpacity style={lb.submitBtn} onPress={() => { submitScore(exerciseId, userEst1RM, name, uname, userProfile?.weight); setSubmitted(true); }}>
                <Text style={lb.submitBtnText}>SUBMIT</Text>
              </TouchableOpacity>
            ) : (
              <Text style={lb.submittedText}>SUBMITTED ✓</Text>
            )}
          </View>
        ) : (
          <View style={lb.emptyCard}>
            <Text style={lb.emptyText}>Log {exerciseLabel} in a workout to get ranked.</Text>
          </View>
        )}
      </ScrollView>

      {/* Exercise picker modal */}
      <Modal visible={showExPicker} transparent animationType="slide" onRequestClose={() => setShowExPicker(false)}>
        <TouchableOpacity style={lb.sheetBackdrop} activeOpacity={1} onPress={() => setShowExPicker(false)}>
          <TouchableOpacity activeOpacity={1} style={[lb.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={lb.sheetTitle}>SELECT EXERCISE</Text>
            {LEADERBOARD_EXERCISES.map(({ id, label }) => (
              <TouchableOpacity key={id} style={lb.sheetRow} onPress={() => { setExerciseId(id); setSubmitted(false); setShowExPicker(false); }}>
                <Text style={[lb.sheetRowText, id === exerciseId && { color: Colors.accent }]}>{label}</Text>
                {id === exerciseId && <Text style={{ color: Colors.accent }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const lb = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4 },
  backBtnText: { fontFamily: Fonts.sans, fontSize: 20, color: Colors.text3 },
  title: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text, letterSpacing: 0.5 },
  exPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: 16, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  exPickerText: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.text, letterSpacing: 0.5 },
  exPickerArrow: { fontFamily: Fonts.sans, fontSize: 16, color: Colors.text3 },
  timeRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16 },
  timeBtn: { flex: 1, paddingVertical: 8, backgroundColor: Colors.bg4, alignItems: 'center' },
  timeBtnActive: { backgroundColor: Colors.accent },
  timeBtnFirst: { borderRadius: 8, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  timeBtnLast: { borderRadius: 8, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  timeBtnText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 1 },
  timeBtnTextActive: { color: '#fff' },
  card: { marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.bg2, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14 },
  sectionLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.8, marginBottom: 14 },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8 },
  podiumCol: { flex: 1, alignItems: 'center', gap: 6 },
  podiumCountry: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  podiumAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, backgroundColor: Colors.bg3, alignItems: 'center', justifyContent: 'center' },
  podiumAvatarText: { fontFamily: Fonts.display, fontSize: 14 },
  podiumName: { fontFamily: Fonts.sansMed, fontSize: 11, color: Colors.text, textAlign: 'center' },
  podiumKg: { fontFamily: Fonts.display, fontSize: 18, lineHeight: 20 },
  podiumBar: { width: '100%', borderRadius: 6, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, alignItems: 'center', justifyContent: 'center' },
  podiumRank: { fontFamily: Fonts.display, fontSize: 24 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rankRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rankNum: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text3, width: 28, textAlign: 'right' },
  rankAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, alignItems: 'center', justifyContent: 'center' },
  rankAvatarText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text2 },
  rankName: { fontFamily: Fonts.sansMed, fontSize: 13, color: Colors.text },
  rankMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  rankKg: { fontFamily: Fonts.display, fontSize: 20, color: Colors.accent },
  youCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.bg2, borderWidth: 1, borderColor: Colors.accent, borderRadius: 12, padding: 14 },
  youAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(79,142,247,0.2)', borderWidth: 2, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  youAvatarText: { fontFamily: Fonts.display, fontSize: 13, color: Colors.accent },
  youLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1 },
  youRank: { fontFamily: Fonts.sansMed, fontSize: 13, color: Colors.text },
  submitBtn: { backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  submitBtnText: { fontFamily: Fonts.mono, fontSize: 10, color: '#fff', letterSpacing: 0.8, fontWeight: '700' },
  submittedText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.green, letterSpacing: 1 },
  emptyCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.bg2, borderRadius: 12, padding: 20 },
  emptyText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bg2, borderRadius: 20, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 20 },
  sheetTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.8, marginBottom: 16 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetRowText: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.text },
});

// ─── Main Progress Screen ─────────────────────────────────

export default function ProgressScreen() {
  const insets      = useSafeAreaInsets();
  const userProfile = useStore((s) => s.userProfile);
  const updateProfile = useStore((s) => s.updateProfile);
  const workoutLogs = useStore((s) => s.workoutLogs);

  const [subView, setSubView] = useState<SubView>(null);
  const [editOpen, setEditOpen] = useState(false);

  const name     = userProfile?.name ?? 'Athlete';
  const username = userProfile?.username ?? 'athlete';
  const totalSets   = useMemo(() => workoutLogs.reduce((s, l) => s + Object.values(l.sets).flat().length, 0), [workoutLogs]);
  const totalVolume = useMemo(() => workoutLogs.reduce((s, l) => s + Object.values(l.sets).flat().reduce((v, set) => v + set.weight*set.reps, 0), 0), [workoutLogs]);
  const streaks     = useMemo(() => calcStreaks(workoutLogs), [workoutLogs]);
  const initials    = name.split(' ').filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || 'AT';

  const last7Days = useMemo(() => {
    const logDates = new Set(workoutLogs.map((l) => toDS(l.date)));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6-i));
      const ds = toDS(d.toISOString());
      return { date: ds, dayLabel: DAY_INITIALS[(d.getDay() + 6) % 7], trained: logDates.has(ds), isToday: i === 6 };
    });
  }, [workoutLogs]);

  const weeklyConsistency = useMemo(() => {
    const trained = last7Days.filter((d) => d.trained && !d.isToday).length;
    const total   = last7Days.filter((d) => !d.isToday).length || 1;
    return Math.round((trained / total) * 100);
  }, [last7Days]);
  const conColor = weeklyConsistency >= 80 ? Colors.green : weeklyConsistency >= 50 ? Colors.yellow : Colors.accent3;

  const NAV_SECTIONS = [
    { view: 'statistics' as SubView,   label: 'Statistics',    sub: 'Muscle groups · Sets · Monthly report', color: Colors.accent,  icon: '📊' },
    { view: 'weight' as SubView,       label: 'Weight Trend',  sub: 'Body weight history · Weekly averages', color: Colors.accent3, icon: '⚖️' },
    { view: 'calendar' as SubView,     label: 'History',       sub: 'Past sessions · Volume · Exercise log', color: Colors.accent2, icon: '📅' },
    { view: 'exercises' as SubView,    label: 'Exercises',     sub: 'PRs · Strength levels · Session log',   color: Colors.green,   icon: '🏋️' },
    { view: 'measurements' as SubView, label: 'Measurements',  sub: 'Body measurements · Trend tracking',    color: Colors.yellow,  icon: '📏' },
    { view: 'leaderboard' as SubView,  label: 'Leaderboard',  sub: 'Global rankings · Your rank',           color: Colors.yellow,  icon: '🏆' },
  ];

  if (subView === 'statistics')   return <View style={[styles.container, { paddingTop: insets.top }]}><StatisticsScreen onBack={() => setSubView(null)} /></View>;
  if (subView === 'weight')       return <View style={[styles.container, { paddingTop: insets.top }]}><WeightTrendScreen onBack={() => setSubView(null)} /></View>;
  if (subView === 'calendar')     return <View style={[styles.container, { paddingTop: insets.top }]}><WorkoutHistoryScreen onBack={() => setSubView(null)} /></View>;
  if (subView === 'exercises')    return <View style={[styles.container, { paddingTop: insets.top }]}><ExercisesScreen onBack={() => setSubView(null)} /></View>;
  if (subView === 'measurements') return <View style={[styles.container, { paddingTop: insets.top }]}><MeasurementsScreen onBack={() => setSubView(null)} /></View>;
  if (subView === 'leaderboard')  return <LeaderboardScreen onBack={() => setSubView(null)} />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>PROGRESS</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 32 }]} showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{name}</Text>
              <Text style={styles.profileUsername}>@{username}</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditOpen(true)}>
              <Text style={styles.editBtnText}>EDIT</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.profileStats}>
            {[
              { label: 'WORKOUTS', value: String(workoutLogs.length), color: Colors.accent  },
              { label: 'SETS',     value: String(totalSets),          color: Colors.accent2 },
              { label: 'VOLUME',   value: `${fmtVolume(totalVolume)}kg`, color: Colors.accent3 },
            ].map(({ label, value, color }) => (
              <View key={label} style={styles.profileStat}>
                <Text style={styles.profileStatLabel}>{label}</Text>
                <Text style={[styles.profileStatValue, { color }]}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Activity (last 7 days + streaks) */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>ACTIVITY</Text>
          <View style={styles.bubbleRow}>
            {last7Days.map((day, i) => (
              <View key={i} style={styles.bubbleCol}>
                <View style={[styles.bubble, day.trained && styles.bubbleTrained, day.isToday && !day.trained && styles.bubbleToday]}>
                  {day.trained && <View style={styles.bubbleDot} />}
                  {!day.trained && day.isToday && <View style={styles.bubbleTodayDot} />}
                </View>
                <Text style={[styles.bubbleDayLabel, day.isToday && { color: Colors.accent }]}>{day.dayLabel}</Text>
              </View>
            ))}
          </View>
          <View style={styles.streakRow}>
            <View style={styles.streakCard}>
              <Text style={styles.streakLabel}>CURRENT STREAK</Text>
              <View style={styles.streakValueRow}>
                <Text style={{ fontSize: 16 }}>🔥</Text>
                <Text style={[styles.streakValue, { color: streaks.current > 0 ? Colors.accent3 : Colors.text3 }]}>{streaks.current}</Text>
                <Text style={styles.streakUnit}>day{streaks.current !== 1 ? 's' : ''}</Text>
              </View>
            </View>
            <View style={styles.streakCard}>
              <Text style={styles.streakLabel}>BEST STREAK</Text>
              <View style={styles.streakValueRow}>
                <Text style={{ fontSize: 16 }}>🏆</Text>
                <Text style={[styles.streakValue, { color: Colors.accent2 }]}>{streaks.best}</Text>
                <Text style={styles.streakUnit}>day{streaks.best !== 1 ? 's' : ''}</Text>
              </View>
            </View>
          </View>
          <View style={{ marginTop: 14 }}>
            <View style={styles.conHeader}>
              <Text style={styles.streakLabel}>WEEKLY CONSISTENCY</Text>
              <Text style={[styles.streakValue, { fontSize: 18, color: conColor, lineHeight: 22 }]}>{weeklyConsistency}%</Text>
            </View>
            <View style={styles.conBar}>
              <View style={[styles.conFill, { width: `${weeklyConsistency}%` as any, backgroundColor: conColor }]} />
            </View>
          </View>
        </View>

        {/* Consistency grid */}
        <ConsistencyGrid workoutLogs={workoutLogs} />

        {/* Strength curve */}
        <StrengthCurveCard workoutLogs={workoutLogs} />

        {/* Navigation cards */}
        <Text style={styles.sectionLabel}>EXPLORE</Text>
        {NAV_SECTIONS.map(({ view, label, sub, color, icon }) => (
          <TouchableOpacity key={view as string} style={styles.navCard} onPress={() => setSubView(view)}>
            <View style={[styles.navAccentBar, { backgroundColor: color }]} />
            <Text style={{ fontSize: 20, lineHeight: 24, flexShrink: 0 }}>{icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.navLabel}>{label}</Text>
              <Text style={styles.navSub}>{sub}</Text>
            </View>
            <Text style={styles.navChevron}>›</Text>
          </TouchableOpacity>
        ))}

        {workoutLogs.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No workouts yet</Text>
            <Text style={styles.emptySub}>Start a session in the Workout tab to begin tracking your progress.</Text>
          </View>
        )}
      </ScrollView>

      {editOpen && (
        <EditProfileSheet
          name={name}
          username={username}
          onSave={(n, u) => updateProfile({ name: n, username: u })}
          onClose={() => setEditOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontFamily: Fonts.display, fontSize: 28, color: Colors.text, letterSpacing: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  sectionLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 1.5, marginBottom: 8 },
  card: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 16 },

  // Profile
  profileCard: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 16 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatar: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(79,142,247,0.12)',
    borderWidth: 2, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontFamily: Fonts.display, fontSize: 20, color: Colors.accent, letterSpacing: 2 },
  profileName: { fontFamily: Fonts.sansMed, fontSize: 18, color: Colors.text, marginBottom: 3 },
  profileUsername: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3, letterSpacing: 1 },
  editBtn: { backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  editBtnText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text2, letterSpacing: 1 },
  profileStats: { flexDirection: 'row', gap: 8 },
  profileStat: { flex: 1, backgroundColor: Colors.bg4, borderRadius: 10, padding: 12, alignItems: 'center' },
  profileStatLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3, letterSpacing: 1, marginBottom: 4 },
  profileStatValue: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 26 },

  // Activity
  bubbleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  bubbleCol: { flex: 1, alignItems: 'center', gap: 6 },
  bubble: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: Colors.bg5, alignItems: 'center', justifyContent: 'center' },
  bubbleTrained: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  bubbleToday: { borderColor: 'rgba(79,142,247,0.5)' },
  bubbleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.85)' },
  bubbleTodayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.accent, opacity: 0.7 },
  bubbleDayLabel: { fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: Colors.text3 },
  streakRow: { flexDirection: 'row', gap: 10, marginBottom: 0 },
  streakCard: { flex: 1, backgroundColor: Colors.bg4, borderRadius: 10, padding: 12 },
  streakLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1, marginBottom: 6 },
  streakValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  streakValue: { fontFamily: Fonts.display, fontSize: 30, lineHeight: 34 },
  streakUnit: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  conHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  conBar: { height: 5, backgroundColor: Colors.bg5, borderRadius: 99, overflow: 'hidden' },
  conFill: { height: '100%', borderRadius: 99 },

  // Nav cards
  navCard: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  navAccentBar: { width: 3, height: 38, borderRadius: 99, flexShrink: 0 },
  navLabel: { fontFamily: Fonts.sansMed, fontSize: 14, color: Colors.text, lineHeight: 18, marginBottom: 2 },
  navSub: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3 },
  navChevron: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text3, flexShrink: 0 },

  emptyState: { alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text3 },
  emptySub: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3, textAlign: 'center', lineHeight: 18 },
});

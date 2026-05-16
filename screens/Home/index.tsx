import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  ScrollView, View, Text, TouchableOpacity, TextInput, StyleSheet,
  Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import Svg, { Circle as SvgCircle, Path as SvgPath, Rect as SvgRect, Text as SvgText } from 'react-native-svg';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useOptimisationScore, useLatestCheckIn, useTodayHydration } from '../../store';
import { getTrainingDayIndex } from '../../utils/programGenerator';
import { getProactiveInsight } from '../../utils/coachInsights';
import { sendCoachMessage } from '../../services/coachService';
import type { CheckInScores, CheckIn, CoachMessage } from '../../types';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';

// ─── Utilities ────────────────────────────────────────────

const MOTD = [
  'Progress is built in sessions, not streaks.',
  'The muscle you built yesterday only grows if you recover today.',
  'Consistency beats intensity. Show up.',
  'Every rep is a vote for the athlete you\'re becoming.',
  'Science says protein timing matters. Your effort matters more.',
  'Double progression: add reps before weight. Trust the process.',
  'Eat to fuel. Train to build. Sleep to grow.',
  'Progressive overload is the only law of muscle growth.',
  'Rest days are where the gains live.',
  'Train like it matters. Because it does.',
  'Creatine, sleep, and protein. The evidence is clear.',
  'One bad session doesn\'t derail a good programme.',
  'Indian food is surprisingly macro-friendly. Use it.',
  'The scale lies. Measurements tell the truth.',
  'Form before load. Always.',
];

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function initials(name?: string): string {
  if (!name) return 'U';
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function calcCurrentStreak(logs: { date: string }[]): number {
  const logDates = new Set(logs.map((l) => l.date.split('T')[0]));
  const d = new Date();
  let streak = 0;
  while (true) {
    const key = d.toISOString().split('T')[0];
    if (logDates.has(key)) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function workoutsThisMonth(logs: { date: string }[]): number {
  const prefix = new Date().toISOString().slice(0, 7);
  return logs.filter((l) => l.date.startsWith(prefix)).length;
}

function prsThisMonth(logs: { date: string; sets: Record<string, { reps: number; weight: number }[]> }[]): number {
  const prefix = new Date().toISOString().slice(0, 7);
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const allMax: Record<string, number> = {};
  let count = 0;
  for (const log of sorted) {
    const isMonth = log.date.startsWith(prefix);
    for (const [exId, sets] of Object.entries(log.sets)) {
      if (!sets.length) continue;
      const best = Math.max(...sets.map((s) => s.weight * (1 + s.reps / 30)));
      const prev = allMax[exId] ?? 0;
      if (best > prev) { if (isMonth) count++; allMax[exId] = best; }
    }
  }
  return count;
}

// ─── Weight Log Sheet ─────────────────────────────────────

function WeightLogSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const addMorningWeight = useStore((s) => s.addMorningWeight);
  const today = new Date().toISOString().split('T')[0];

  function save() {
    const w = parseFloat(input);
    if (w > 0) { addMorningWeight(today, w); onClose(); }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[wStyles.container, { paddingBottom: insets.bottom + 16 }]}>
        <View style={wStyles.handle} />
        <Text style={wStyles.title}>LOG MORNING WEIGHT</Text>
        <View style={wStyles.row}>
          <TextInput
            style={wStyles.input}
            keyboardType="decimal-pad"
            placeholder="e.g. 72.5"
            placeholderTextColor={Colors.text3}
            value={input}
            onChangeText={setInput}
            autoFocus
            onSubmitEditing={save}
          />
          <Text style={wStyles.unit}>kg</Text>
        </View>
        <TouchableOpacity style={wStyles.btn} onPress={save}>
          <Text style={wStyles.btnText}>LOG WEIGHT</Text>
        </TouchableOpacity>
        <TouchableOpacity style={wStyles.cancelBtn} onPress={onClose}>
          <Text style={wStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const wStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg2, padding: 24, alignItems: 'stretch' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border2, alignSelf: 'center', marginBottom: 24 },
  title: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.accent, letterSpacing: 1, marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  input: {
    flex: 1, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: Fonts.mono, fontSize: 26, color: Colors.text,
  },
  unit: { fontFamily: Fonts.mono, fontSize: 18, color: Colors.text3 },
  btn: {
    backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginBottom: 10,
  },
  btnText: { fontFamily: Fonts.mono, fontSize: 13, color: '#fff', letterSpacing: 1, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text3 },
});

// ─── Check-In Modal ───────────────────────────────────────

const CHECK_IN_QUESTIONS: { key: keyof CheckInScores; label: string; icon: string; hint: string }[] = [
  { key: 'energy',         label: 'Energy',         icon: '⚡', hint: 'How energetic do you feel today?' },
  { key: 'recovery',       label: 'Recovery',        icon: '🔄', hint: 'How well have your muscles recovered?' },
  { key: 'hunger',         label: 'Hunger',          icon: '🍽️', hint: 'How is your appetite / diet adherence?' },
  { key: 'motivation',     label: 'Motivation',      icon: '🎯', hint: 'How motivated are you to train?' },
  { key: 'sleep',          label: 'Sleep',           icon: '🌙', hint: 'How was sleep quality last night?' },
  { key: 'gymPerformance', label: 'Gym Performance', icon: '💪', hint: 'How did you perform in your last session?' },
];

function CheckInModal({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<CheckInScores>({
    energy: 5, recovery: 5, hunger: 5, motivation: 5, sleep: 5, gymPerformance: 5,
  });
  const saveCheckIn = useStore((s) => s.saveCheckIn);
  const isSummary = step === CHECK_IN_QUESTIONS.length;
  const q = !isSummary ? CHECK_IN_QUESTIONS[step] : null;

  function handleComplete() {
    const overallScore = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / 6) * 10) / 10;
    const now = new Date();
    const checkIn: CheckIn = {
      week: getISOWeek(now),
      date: now.toISOString().split('T')[0],
      scores,
      overallScore,
    };
    saveCheckIn(checkIn);
    onClose();
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[ciStyles.container, { paddingBottom: insets.bottom + 16 }]}>
        <View style={ciStyles.handle} />
        <View style={ciStyles.topRow}>
          <Text style={ciStyles.titleLabel}>WEEKLY CHECK-IN</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={ciStyles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Progress dots */}
        <View style={ciStyles.dotsRow}>
          {CHECK_IN_QUESTIONS.map((_, i) => (
            <View key={i} style={[ciStyles.dot, i <= step && ciStyles.dotActive]} />
          ))}
        </View>

        {!isSummary && q && (
          <View style={ciStyles.stepContainer}>
            <Text style={ciStyles.qIcon}>{q.icon}</Text>
            <Text style={ciStyles.qLabel}>{q.label}</Text>
            <Text style={ciStyles.qHint}>{q.hint}</Text>
            <Text style={ciStyles.scoreDisplay}>
              {scores[q.key]}<Text style={ciStyles.scoreOf}>/10</Text>
            </Text>
            <Slider
              style={ciStyles.slider}
              minimumValue={1}
              maximumValue={10}
              step={1}
              value={scores[q.key]}
              onValueChange={(v) => setScores((prev) => ({ ...prev, [q.key]: Math.round(v) }))}
              minimumTrackTintColor={Colors.accent}
              maximumTrackTintColor={Colors.bg5}
              thumbTintColor={Colors.accent}
            />
            <View style={ciStyles.navRow}>
              {step > 0 && (
                <TouchableOpacity style={ciStyles.backBtn} onPress={() => setStep((s) => s - 1)}>
                  <Text style={ciStyles.backBtnText}>← Back</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[ciStyles.nextBtn, step > 0 && { flex: 2 }]} onPress={() => setStep((s) => s + 1)}>
                <Text style={ciStyles.nextBtnText}>
                  {step === CHECK_IN_QUESTIONS.length - 1 ? 'Review →' : 'Next →'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isSummary && (
          <View style={ciStyles.stepContainer}>
            <Text style={ciStyles.summaryTitle}>YOUR WEEKLY SNAPSHOT</Text>
            <View style={ciStyles.summaryGrid}>
              {CHECK_IN_QUESTIONS.map((q2) => (
                <View key={q2.key} style={ciStyles.summaryChip}>
                  <Text style={ciStyles.summaryChipIcon}>{q2.icon}</Text>
                  <Text style={ciStyles.summaryChipLabel}>{q2.label.toUpperCase()}</Text>
                  <Text style={ciStyles.summaryChipScore}>{scores[q2.key]}</Text>
                </View>
              ))}
            </View>
            <View style={ciStyles.navRow}>
              <TouchableOpacity style={ciStyles.backBtn} onPress={() => setStep(CHECK_IN_QUESTIONS.length - 1)}>
                <Text style={ciStyles.backBtnText}>← Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ciStyles.nextBtn, { flex: 2 }]} onPress={handleComplete}>
                <Text style={ciStyles.nextBtnText}>Save Check-In ✓</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const ciStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg2, padding: 20 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border2, alignSelf: 'center', marginBottom: 20 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  titleLabel: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.accent, letterSpacing: 1 },
  closeBtn: { fontFamily: Fonts.sans, fontSize: 20, color: Colors.text3, padding: 4 },
  dotsRow: { flexDirection: 'row', gap: 4, marginBottom: 28 },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.bg5 },
  dotActive: { backgroundColor: Colors.accent },
  stepContainer: { flex: 1 },
  qIcon: { fontSize: 36, textAlign: 'center', marginBottom: 8 },
  qLabel: { fontFamily: Fonts.display, fontSize: 26, color: Colors.text, textAlign: 'center', marginBottom: 6, letterSpacing: 0.5 },
  qHint: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3, textAlign: 'center', marginBottom: 24, lineHeight: 18 },
  scoreDisplay: { fontFamily: Fonts.display, fontSize: 52, color: Colors.accent, textAlign: 'center', lineHeight: 58, marginBottom: 12 },
  scoreOf: { fontFamily: Fonts.mono, fontSize: 18, color: Colors.text3 },
  slider: { width: '100%', height: 40, marginBottom: 32 },
  navRow: { flexDirection: 'row', gap: 10 },
  backBtn: {
    flex: 1, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  backBtnText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },
  nextBtn: {
    flex: 2, backgroundColor: Colors.accent, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
  },
  nextBtnText: { fontFamily: Fonts.mono, fontSize: 13, color: '#fff', letterSpacing: 0.5, fontWeight: '700' },
  summaryTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 1, textAlign: 'center', marginBottom: 20 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 28 },
  summaryChip: {
    backgroundColor: Colors.bg3, borderRadius: 10, padding: '8px 12px' as any,
    paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', gap: 6, alignItems: 'center',
  },
  summaryChipIcon: { fontSize: 16 },
  summaryChipLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text2, letterSpacing: 0.3 },
  summaryChipScore: { fontFamily: Fonts.display, fontSize: 18, color: Colors.accent, lineHeight: 20 },
});

// ─── Coach Chat Screen ────────────────────────────────────

function CoachChatScreen({ onClose, initialMessage }: { onClose: () => void; initialMessage?: string }) {
  const insets = useSafeAreaInsets();
  const userProfile = useStore((s) => s.userProfile);
  const workoutLogs = useStore((s) => s.workoutLogs);
  const coachHistory = useStore((s) => s.coachHistory);
  const addCoachMessage = useStore((s) => s.addCoachMessage);
  const clearCoachHistory = useStore((s) => s.clearCoachHistory);
  const latestCheckIn = useLatestCheckIn();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sentInitial = useRef(false);

  const display = coachHistory.slice(-50);

  useEffect(() => {
    if (initialMessage && !sentInitial.current) {
      sentInitial.current = true;
      setInput(initialMessage);
    }
  }, [initialMessage]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [coachHistory.length, loading]);

  async function handleSend(msg?: string) {
    const text = (msg ?? input).trim();
    if (!text || loading) return;
    setInput('');
    setError(null);
    const userMsg: CoachMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    addCoachMessage(userMsg);
    setLoading(true);
    try {
      const reply = await sendCoachMessage(text, coachHistory, userProfile, latestCheckIn, workoutLogs);
      addCoachMessage({
        id: `${Date.now()}-a`,
        role: 'assistant',
        content: reply,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const SUGGESTIONS = [
    'Why does my bench stall?',
    'How much protein do I really need?',
    'Explain double progression',
  ];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[ccStyles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={ccStyles.header}>
          <TouchableOpacity onPress={onClose} style={ccStyles.backBtn}>
            <Text style={ccStyles.backBtnText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={ccStyles.title}>SBL Coach</Text>
            <Text style={ccStyles.subtitle}>Powered by Claude · Science-backed</Text>
          </View>
          <TouchableOpacity onPress={clearCoachHistory}>
            <Text style={ccStyles.clearBtn}>CLEAR</Text>
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={ccStyles.messages}
          contentContainerStyle={[ccStyles.messagesContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {display.length === 0 && (
            <View style={ccStyles.emptyState}>
              <Text style={ccStyles.emptyIcon}>🤖</Text>
              <Text style={ccStyles.emptyTitle}>SBL Coach</Text>
              <Text style={ccStyles.emptySubtitle}>
                Ask me anything about training, nutrition, recovery, or your programme.
              </Text>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity key={s} style={ccStyles.suggestionBtn} onPress={() => setInput(s)}>
                  <Text style={ccStyles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {display.map((msg) => (
            <View key={msg.id} style={[ccStyles.msgRow, msg.role === 'user' && ccStyles.msgRowUser]}>
              {msg.role === 'assistant' && (
                <View style={ccStyles.avatar}>
                  <Text style={{ fontSize: 14 }}>🤖</Text>
                </View>
              )}
              <View style={[
                ccStyles.bubble,
                msg.role === 'user' ? ccStyles.bubbleUser : ccStyles.bubbleAssistant,
              ]}>
                <Text style={ccStyles.bubbleText}>{msg.content}</Text>
              </View>
            </View>
          ))}

          {loading && (
            <View style={ccStyles.msgRow}>
              <View style={ccStyles.avatar}>
                <Text style={{ fontSize: 14 }}>🤖</Text>
              </View>
              <View style={ccStyles.bubbleAssistant}>
                <ActivityIndicator size="small" color={Colors.accent} />
              </View>
            </View>
          )}

          {error && (
            <View style={ccStyles.errorBox}>
              <Text style={ccStyles.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={[ccStyles.inputBar, { paddingBottom: insets.bottom + 12 }]}>
            <TextInput
              style={ccStyles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask your coach…"
              placeholderTextColor={Colors.text3}
              multiline
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
            />
            <TouchableOpacity
              style={[ccStyles.sendBtn, (!input.trim() || loading) && ccStyles.sendBtnDisabled]}
              onPress={() => handleSend()}
              disabled={!input.trim() || loading}
            >
              <Text style={ccStyles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const ccStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  backBtnText: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text3 },
  title: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text, letterSpacing: 0.5 },
  subtitle: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.4, marginTop: 1 },
  clearBtn: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },
  messages: { flex: 1 },
  messagesContent: { padding: 16, gap: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 0 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, marginBottom: 8 },
  emptySubtitle: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  suggestionBtn: {
    width: '100%', backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  suggestionText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text2 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser: { justifyContent: 'flex-end' },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(79,142,247,0.15)',
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.3)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  bubble: { maxWidth: '78%', padding: 12, borderRadius: 14 },
  bubbleUser: {
    backgroundColor: 'rgba(79,142,247,0.18)',
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.25)',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border,
    borderBottomLeftRadius: 4, paddingVertical: 14,
  },
  bubbleText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, lineHeight: 21 },
  errorBox: {
    backgroundColor: 'rgba(255,80,80,0.1)', borderWidth: 1, borderColor: 'rgba(255,80,80,0.25)',
    borderRadius: 10, padding: 12,
  },
  errorText: { fontFamily: Fonts.sans, fontSize: 13, color: '#ff5050', lineHeight: 18 },
  inputBar: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-end',
    padding: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, minHeight: 44, maxHeight: 120,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
  sendBtnText: { fontFamily: Fonts.sans, fontSize: 20, color: '#fff', fontWeight: '700' },
});

// ─── Box Breathing Screen ─────────────────────────────────

const BB_DURATION = 4;
const BB_PHASE_LABELS = ['INHALE', 'HOLD', 'EXHALE', 'HOLD'] as const;
const BB_SZ = 200, BB_PAD = 36;
const BB_BX = BB_PAD, BB_BY = BB_PAD, BB_BW = BB_SZ - 2 * BB_PAD, BB_BH = BB_SZ - 2 * BB_PAD;
const BB_CORNERS: [number, number][] = [
  [BB_BX, BB_BY], [BB_BX + BB_BW, BB_BY],
  [BB_BX + BB_BW, BB_BY + BB_BH], [BB_BX, BB_BY + BB_BH],
];
const BB_SIDE_TEXT = [
  { label: 'INHALE', x: BB_SZ / 2,        y: BB_BY - 14,       anchor: 'middle' as const },
  { label: 'HOLD',   x: BB_BX + BB_BW + 14, y: BB_SZ / 2,      anchor: 'start' as const },
  { label: 'EXHALE', x: BB_SZ / 2,        y: BB_BY + BB_BH + 18, anchor: 'middle' as const },
  { label: 'HOLD',   x: BB_BX - 14,       y: BB_SZ / 2,        anchor: 'end' as const },
];

function bbDotPos(phase: number, progress: number): [number, number] {
  const [sx, sy] = BB_CORNERS[phase];
  const [ex, ey] = BB_CORNERS[(phase + 1) % 4];
  return [sx + (ex - sx) * progress, sy + (ey - sy) * progress];
}

function bbTracePath(phase: number, progress: number): string {
  const pts: [number, number][] = [BB_CORNERS[0]];
  for (let i = 0; i < phase; i++) pts.push(BB_CORNERS[(i + 1) % 4]);
  pts.push(bbDotPos(phase, progress));
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
}

function BoxBreathingScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);
  const [timeLeft, setTimeLeft] = useState(BB_DURATION);
  const [cycles, setCycles] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    setRunning(false);
    setPhase(0);
    setTimeLeft(BB_DURATION);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setPhase((p) => {
            const next = (p + 1) % 4;
            if (next === 0) setCycles((c) => c + 1);
            return next;
          });
          return BB_DURATION;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const progress = 1 - timeLeft / BB_DURATION;
  const [dotX, dotY] = bbDotPos(phase, progress);
  const tracePath = bbTracePath(phase, progress);

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={[bbStyles.container, { paddingTop: insets.top }]}>
        <View style={bbStyles.header}>
          <TouchableOpacity onPress={onClose} style={bbStyles.backBtn}>
            <Text style={bbStyles.backBtnText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={bbStyles.title}>Box Breathing</Text>
            <Text style={bbStyles.subtitle}>4 · 4 · 4 · 4 · Lowers cortisol, improves HRV</Text>
          </View>
          {running && (
            <View style={bbStyles.cyclesBadge}>
              <Text style={bbStyles.cyclesText}>{cycles} {cycles === 1 ? 'cycle' : 'cycles'}</Text>
            </View>
          )}
        </View>

        <View style={bbStyles.content}>
          <Svg width={BB_SZ} height={BB_SZ} viewBox={`0 0 ${BB_SZ} ${BB_SZ}`} style={{ overflow: 'visible', marginBottom: 24 }}>
            {BB_SIDE_TEXT.map((s, i) => (
              <SvgText key={i} x={s.x} y={s.y} textAnchor={s.anchor}
                fill={i === phase ? Colors.accent2 : Colors.text3}
                fontSize={9} fontFamily={Fonts.mono} letterSpacing={0.8}>
                {s.label}
              </SvgText>
            ))}
            <SvgRect x={BB_BX} y={BB_BY} width={BB_BW} height={BB_BH}
              fill="none" stroke={Colors.border2} strokeWidth={1.5} rx={2} />
            {BB_CORNERS.map(([cx, cy], i) => (
              <SvgCircle key={i} cx={cx} cy={cy} r={3}
                fill={i <= phase ? 'rgba(177,151,252,0.5)' : Colors.bg4}
                stroke={Colors.border2} strokeWidth={1} />
            ))}
            {running && (
              <SvgPath d={tracePath} fill="none"
                stroke={Colors.accent2} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                opacity={0.7} />
            )}
            <SvgCircle cx={dotX} cy={dotY} r={8} fill={Colors.accent2} opacity={0.25} />
            <SvgCircle cx={dotX} cy={dotY} r={5} fill={Colors.accent2} />
            <SvgText x={BB_SZ / 2} y={BB_SZ / 2 - 8} textAnchor="middle" fill={Colors.text}
              fontSize={28} fontFamily={Fonts.display} letterSpacing={1}>
              {timeLeft}
            </SvgText>
            <SvgText x={BB_SZ / 2} y={BB_SZ / 2 + 10} textAnchor="middle" fill={Colors.accent2}
              fontSize={9} fontFamily={Fonts.mono} letterSpacing={1.2}>
              {BB_PHASE_LABELS[phase]}
            </SvgText>
          </Svg>

          {!running && (
            <Text style={bbStyles.instruction}>
              Inhale 4s → hold 4s → exhale 4s → hold 4s. Repeat to activate the parasympathetic nervous system.
            </Text>
          )}

          <View style={bbStyles.controls}>
            {running ? (
              <TouchableOpacity style={bbStyles.stopBtn} onPress={stop}>
                <Text style={bbStyles.stopBtnText}>STOP</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={bbStyles.startBtn} onPress={() => setRunning(true)}>
                <Text style={bbStyles.startBtnText}>START</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={bbStyles.citation}>
            <Text style={bbStyles.citationText}>
              📄 Zaccaro et al. (2018). "How Breath-Control Can Change Your Life: A Systematic Review on Psycho-Physiological Correlates of Slow Breathing." Frontiers in Human Neuroscience.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const bbStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  backBtnText: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text3, lineHeight: 26 },
  title: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text, letterSpacing: 0.5 },
  subtitle: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3, marginTop: 1 },
  cyclesBadge: { backgroundColor: Colors.bg3, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12 },
  cyclesText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.accent2 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  instruction: {
    fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3, textAlign: 'center',
    maxWidth: 260, marginBottom: 24, lineHeight: 20,
  },
  controls: { flexDirection: 'row', gap: 12 },
  startBtn: {
    backgroundColor: 'rgba(177,151,252,0.15)', borderWidth: 1,
    borderColor: 'rgba(177,151,252,0.35)', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 40,
  },
  startBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.accent2, letterSpacing: 1 },
  stopBtn: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 32,
  },
  stopBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.text3, letterSpacing: 1 },
  citation: {
    marginTop: 32, padding: 10, paddingHorizontal: 16,
    backgroundColor: Colors.bg3, borderRadius: 10, maxWidth: 320,
  },
  citationText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3, lineHeight: 16 },
});

// ─── Mobility Screen ──────────────────────────────────────

const MOBILITY_MOVES = [
  { name: 'Cat-Cow', duration: 45, cue: 'On all-fours. Arch spine up (cat), then drop belly down (cow). Slow and controlled.', target: 'Thoracic spine · Lumbar' },
  { name: 'Hip Flexor Stretch', duration: 60, cue: 'Low lunge: back knee on floor, drive hips forward gently. Switch sides at halfway.', target: 'Psoas · Rectus femoris' },
  { name: 'Thoracic Rotation', duration: 45, cue: 'Seated, hands behind head. Rotate upper back left then right. Keep hips still.', target: 'Thoracic spine · Lats' },
  { name: "World's Greatest Stretch", duration: 60, cue: 'Lunge forward, place same-side elbow to floor, then rotate arm to ceiling.', target: 'Hip flexors · T-spine · Hamstrings' },
  { name: "Child's Pose", duration: 30, cue: 'Arms extended, push hips back to heels. Breathe deeply into the back.', target: 'Lats · Glutes · Lower back' },
];
const MOBILITY_TOTAL = MOBILITY_MOVES.reduce((a, m) => a + m.duration, 0);

function MobilityScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [moveIdx, setMoveIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(MOBILITY_MOVES[0].duration);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(intervalRef.current!);
          const next = moveIdx + 1;
          if (next < MOBILITY_MOVES.length) {
            setMoveIdx(next);
            setTimeLeft(MOBILITY_MOVES[next].duration);
            setRunning(false);
          } else {
            setDone(true);
            setRunning(false);
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, moveIdx]);

  function restart() {
    setMoveIdx(0);
    setTimeLeft(MOBILITY_MOVES[0].duration);
    setRunning(false);
    setDone(false);
  }

  const move = MOBILITY_MOVES[moveIdx];
  const pct = done ? 1 : 1 - timeLeft / move.duration;
  const overallElapsed = MOBILITY_MOVES.slice(0, moveIdx).reduce((a, m) => a + m.duration, 0) + (done ? move.duration : move.duration - timeLeft);
  const overallPct = overallElapsed / MOBILITY_TOTAL;
  const R = 56, CC = 64;
  const circ = 2 * Math.PI * R;

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={[mobStyles.container, { paddingTop: insets.top }]}>
        <View style={mobStyles.header}>
          <TouchableOpacity onPress={onClose} style={mobStyles.backBtn}>
            <Text style={mobStyles.backBtnText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={mobStyles.title}>Mobility Routine</Text>
            <Text style={mobStyles.subtitle}>{Math.round(MOBILITY_TOTAL / 60)} min · 5 movements</Text>
          </View>
        </View>

        <View style={mobStyles.progressBar}>
          <View style={mobStyles.progressBarRow}>
            <Text style={mobStyles.progressLabel}>OVERALL</Text>
            <Text style={mobStyles.progressCount}>{moveIdx + (done ? 1 : 0)} / {MOBILITY_MOVES.length} moves</Text>
          </View>
          <View style={mobStyles.progressTrack}>
            <View style={[mobStyles.progressFill, { width: `${overallPct * 100}%` }]} />
          </View>
        </View>

        <ScrollView contentContainerStyle={mobStyles.content}>
          {done ? (
            <View style={mobStyles.doneContainer}>
              <Text style={mobStyles.doneIcon}>🧘</Text>
              <Text style={mobStyles.doneTitle}>Routine Complete</Text>
              <Text style={mobStyles.doneSub}>Well done. Improved ROM supports long-term training performance and injury resilience.</Text>
              <View style={mobStyles.doneCitation}>
                <Text style={mobStyles.citationText}>📄 Behm et al. (2016). Appl Physiol Nutr Metab, 41(1), 1–11.</Text>
              </View>
              <View style={mobStyles.doneActions}>
                <TouchableOpacity style={mobStyles.primaryBtn} onPress={restart}>
                  <Text style={mobStyles.primaryBtnText}>Repeat</Text>
                </TouchableOpacity>
                <TouchableOpacity style={mobStyles.secondaryBtn} onPress={onClose}>
                  <Text style={mobStyles.secondaryBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={mobStyles.dots}>
                {MOBILITY_MOVES.map((_, i) => (
                  <View key={i} style={[
                    mobStyles.dot,
                    i === moveIdx && mobStyles.dotActive,
                    i < moveIdx && mobStyles.dotDone,
                  ]} />
                ))}
              </View>

              <View style={mobStyles.timerWrap}>
                <Svg width={CC * 2} height={CC * 2} viewBox={`0 0 ${CC * 2} ${CC * 2}`}
                  style={{ transform: [{ rotate: '-90deg' }] }}>
                  <SvgCircle cx={CC} cy={CC} r={R} fill="none" stroke={Colors.bg4} strokeWidth={8} />
                  <SvgCircle cx={CC} cy={CC} r={R} fill="none"
                    stroke={Colors.accent2} strokeWidth={8}
                    strokeDasharray={`${circ} ${circ}`}
                    strokeDashoffset={circ * (1 - pct)}
                    strokeLinecap="round" />
                </Svg>
                <View style={mobStyles.timerCenter}>
                  <Text style={[mobStyles.timerNum, timeLeft <= 5 && { color: Colors.accent3 }]}>{timeLeft}</Text>
                  <Text style={mobStyles.timerSec}>SEC</Text>
                </View>
              </View>

              <Text style={mobStyles.moveName}>{move.name}</Text>
              <Text style={mobStyles.moveTarget}>{move.target.toUpperCase()}</Text>
              <Text style={mobStyles.moveCue}>{move.cue}</Text>

              <View style={mobStyles.controls}>
                {moveIdx > 0 && (
                  <TouchableOpacity style={mobStyles.secondaryBtn}
                    onPress={() => { setMoveIdx(moveIdx - 1); setTimeLeft(MOBILITY_MOVES[moveIdx - 1].duration); setRunning(false); }}>
                    <Text style={mobStyles.secondaryBtnText}>← Prev</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={mobStyles.primaryBtn} onPress={() => setRunning((r) => !r)}>
                  <Text style={mobStyles.primaryBtnText}>
                    {running ? '⏸ Pause' : timeLeft === move.duration ? '▶ Start' : '▶ Resume'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={mobStyles.secondaryBtn}
                  onPress={() => { const next = moveIdx + 1; if (next < MOBILITY_MOVES.length) { setMoveIdx(next); setTimeLeft(MOBILITY_MOVES[next].duration); setRunning(false); } else setDone(true); }}>
                  <Text style={mobStyles.secondaryBtnText}>Skip →</Text>
                </TouchableOpacity>
              </View>

              {moveIdx < MOBILITY_MOVES.length - 1 && (
                <View style={mobStyles.nextUp}>
                  <Text style={mobStyles.nextLabel}>NEXT</Text>
                  <View>
                    <Text style={mobStyles.nextName}>{MOBILITY_MOVES[moveIdx + 1].name}</Text>
                    <Text style={mobStyles.nextDur}>{MOBILITY_MOVES[moveIdx + 1].duration}s</Text>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const mobStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  backBtnText: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text3, lineHeight: 26 },
  title: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text, letterSpacing: 0.5 },
  subtitle: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3, marginTop: 1 },
  progressBar: {
    padding: 10, paddingHorizontal: 16,
    backgroundColor: Colors.bg2, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  progressBarRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  progressLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  progressCount: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.accent2 },
  progressTrack: { height: 3, backgroundColor: Colors.bg4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.accent2, borderRadius: 2 },
  content: { padding: 24, alignItems: 'center', paddingBottom: 48 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.bg4 },
  dotActive: { width: 20, backgroundColor: Colors.accent2 },
  dotDone: { backgroundColor: Colors.accent2, opacity: 0.4 },
  timerWrap: { position: 'relative', width: 128, height: 128, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  timerCenter: { position: 'absolute', alignItems: 'center' },
  timerNum: { fontFamily: Fonts.display, fontSize: 36, lineHeight: 40, color: Colors.text },
  timerSec: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  moveName: { fontFamily: Fonts.display, fontSize: 26, letterSpacing: 0.5, color: Colors.text, textAlign: 'center', marginBottom: 6 },
  moveTarget: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accent2, marginBottom: 12, letterSpacing: 0.5 },
  moveCue: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3, textAlign: 'center', lineHeight: 20, maxWidth: 300, marginBottom: 24 },
  controls: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 24 },
  primaryBtn: {
    backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 24, minWidth: 120, alignItems: 'center',
  },
  primaryBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: '#fff', letterSpacing: 0.5 },
  secondaryBtn: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingVertical: 11, paddingHorizontal: 20, alignItems: 'center',
  },
  secondaryBtnText: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.text3 },
  nextUp: {
    flexDirection: 'row', gap: 10, padding: 10, paddingHorizontal: 14,
    backgroundColor: Colors.bg3, borderRadius: 10, alignSelf: 'stretch',
  },
  nextLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, paddingTop: 2, flexShrink: 0 },
  nextName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text2 },
  nextDur: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, marginTop: 2 },
  doneContainer: { alignItems: 'center', paddingTop: 40 },
  doneIcon: { fontSize: 48, marginBottom: 16 },
  doneTitle: { fontFamily: Fonts.display, fontSize: 32, letterSpacing: 0.5, color: Colors.text, marginBottom: 8 },
  doneSub: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3, textAlign: 'center', lineHeight: 20, marginBottom: 32, maxWidth: 300 },
  doneCitation: { padding: 10, paddingHorizontal: 16, backgroundColor: Colors.bg3, borderRadius: 10, marginBottom: 32, maxWidth: 320 },
  citationText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3, lineHeight: 16 },
  doneActions: { flexDirection: 'row', gap: 10 },
});

// ─── Sleep Optimisation Screen ────────────────────────────

const SLEEP_TIPS = [
  {
    icon: '⏰',
    title: '7–9 Hours Per Night',
    detail: 'Chronic short sleep (<7h) reduces testosterone, growth hormone, and IGF-1 — the hormones that drive muscle growth and repair. Adults aged 18–64 need 7–9 hours for full recovery.',
    citation: 'Hirshkowitz et al. (2015). National Sleep Foundation sleep time duration recommendations. Sleep Health, 1(1), 40–43.',
  },
  {
    icon: '📅',
    title: 'Consistent Sleep Schedule',
    detail: 'Going to sleep and waking at the same time every day — including weekends — anchors your circadian rhythm. Irregular sleep schedules are associated with poorer mood, cognitive performance, and delayed melatonin onset.',
    citation: 'Phillips et al. (2017). Irregular sleep/wake patterns associated with poorer academic performance and delayed circadian timing. Scientific Reports, 7, 3216.',
  },
  {
    icon: '🌡️',
    title: 'Cool Your Room to 18–19°C',
    detail: 'Core body temperature must drop ~1°C to initiate and maintain deep sleep. A cool room (18–19°C / 65–67°F) accelerates this drop. Sleeping too warm reduces slow-wave sleep duration and increases waking.',
    citation: 'Okamoto-Mizuno & Mizuno (2012). Effects of thermal environment on sleep and circadian rhythm. J Physiol Anthropol, 31(1), 14.',
  },
  {
    icon: '📱',
    title: 'No Screens 90 Min Before Bed',
    detail: 'Blue-light-emitting devices suppress melatonin production by up to 55% and delay circadian phase. Using an e-reader before sleep takes ~10 extra minutes to fall asleep and reduces REM duration the next night.',
    citation: 'Chang et al. (2015). Evening use of light-emitting eReaders negatively affects sleep, circadian timing, and next-morning alertness. PNAS, 112(4), 1232–1237.',
  },
  {
    icon: '☕',
    title: 'Cut Caffeine 6+ Hours Before Sleep',
    detail: 'Caffeine has a half-life of ~5–6 hours. Consuming it 6 hours before bedtime still significantly disrupts sleep architecture, reducing total sleep time by more than 1 hour even when you feel like you fell asleep normally.',
    citation: 'Drake et al. (2013). Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed. J Clin Sleep Med, 9(11), 1195–1200.',
  },
  {
    icon: '🍺',
    title: 'Avoid Alcohol as a Sleep Aid',
    detail: 'While alcohol accelerates sleep onset, it fragments REM sleep in the second half of the night — the phase most critical for motor learning and memory consolidation. Even moderate drinking significantly reduces sleep quality.',
    citation: 'Ebrahim et al. (2013). Alcohol and sleep I: Effects on normal sleep. Alcohol Clin Exp Res, 37(4), 539–549.',
  },
];

function SleepOptimisationScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={[slStyles.container, { paddingTop: insets.top }]}>
        <View style={slStyles.header}>
          <TouchableOpacity onPress={onClose} style={slStyles.backBtn}>
            <Text style={slStyles.backBtnText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={slStyles.title}>Sleep Optimisation</Text>
            <Text style={slStyles.subtitle}>6 evidence-based strategies · Tap each to expand</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View style={slStyles.intro}>
            <Text style={slStyles.introText}>
              Sleep is the most underrated recovery tool. GH secretion peaks during slow-wave sleep, muscle protein synthesis continues overnight, and skill consolidation happens during REM. Every tip below is supported by peer-reviewed evidence.
            </Text>
          </View>

          {SLEEP_TIPS.map((tip, i) => (
            <View key={i} style={slStyles.tipRow}>
              <TouchableOpacity
                style={[slStyles.tipHeader, expanded === i && slStyles.tipHeaderExpanded]}
                onPress={() => setExpanded(expanded === i ? null : i)}
                activeOpacity={0.8}
              >
                <Text style={slStyles.tipIcon}>{tip.icon}</Text>
                <Text style={slStyles.tipTitle}>{tip.title}</Text>
                <Text style={[slStyles.tipChevron, expanded === i && slStyles.tipChevronOpen]}>›</Text>
              </TouchableOpacity>

              {expanded === i && (
                <View style={slStyles.tipBody}>
                  <Text style={slStyles.tipDetail}>{tip.detail}</Text>
                  <View style={slStyles.tipCitation}>
                    <Text style={slStyles.tipCitationText}>📄 {tip.citation}</Text>
                  </View>
                </View>
              )}
            </View>
          ))}

          <View style={slStyles.footer}>
            <Text style={slStyles.footerText}>
              For a comprehensive review of sleep and athletic performance, see: Dattilo et al. (2011). Sleep and muscle recovery: Endocrinological and molecular basis. Medical Hypotheses, 77(2), 220–222. Walker, M. (2017). Why We Sleep. Scribner.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const slStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  backBtnText: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text3, lineHeight: 26 },
  title: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text, letterSpacing: 0.5 },
  subtitle: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3, marginTop: 1 },
  intro: { padding: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bg2 },
  introText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3, lineHeight: 20 },
  tipRow: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tipHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, paddingHorizontal: 16, backgroundColor: Colors.bg,
  },
  tipHeaderExpanded: { backgroundColor: Colors.bg2 },
  tipIcon: { fontSize: 24, lineHeight: 28, flexShrink: 0 },
  tipTitle: { flex: 1, fontFamily: Fonts.sans, fontSize: 15, color: Colors.text, fontWeight: '500' },
  tipChevron: { fontFamily: Fonts.sans, fontSize: 20, color: Colors.text3, flexShrink: 0 },
  tipChevronOpen: { transform: [{ rotate: '90deg' }] },
  tipBody: { paddingBottom: 16, paddingHorizontal: 16, paddingLeft: 52 },
  tipDetail: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text3, lineHeight: 20, marginBottom: 10 },
  tipCitation: { backgroundColor: Colors.bg3, borderRadius: 8, padding: 8, paddingHorizontal: 12 },
  tipCitationText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3, lineHeight: 16 },
  footer: { padding: 16 },
  footerText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3, lineHeight: 17 },
});

// ─── Home Date Strip ─────────────────────────────────────

const HOME_DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
function buildHomeDates(daysBack = 30): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}
const HOME_DATES = buildHomeDates(30);

function HomeDateStrip({ selectedDate, onSelectDate }: { selectedDate: string; onSelectDate: (d: string) => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const todayKey = new Date().toISOString().split('T')[0];
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 60);
  }, []);
  return (
    <View style={hdStyles.row}>
      <TouchableOpacity
        style={[hdStyles.todayPill, selectedDate === todayKey && hdStyles.todayPillActive]}
        onPress={() => { onSelectDate(todayKey); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }}
      >
        <Text style={[hdStyles.todayText, selectedDate === todayKey && { color: '#fff' }]}>Today</Text>
      </TouchableOpacity>
      <View style={hdStyles.divider} />
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 4, paddingVertical: 4, paddingHorizontal: 6 }}>
        {HOME_DATES.map((dateStr) => {
          const d = new Date(dateStr + 'T00:00:00');
          const isToday = dateStr === todayKey;
          const isSelected = dateStr === selectedDate;
          return (
            <TouchableOpacity key={dateStr} style={[hdStyles.datePill, isSelected && hdStyles.datePillActive, !isSelected && isToday && hdStyles.datePillToday]} onPress={() => onSelectDate(dateStr)}>
              <Text style={[hdStyles.dayAbbr, isSelected && { color: 'rgba(255,255,255,0.8)' }]}>{HOME_DAY_ABBR[d.getDay()]}</Text>
              <Text style={[hdStyles.dayNum, isSelected ? { color: '#fff' } : isToday ? { color: Colors.accent } : {}]}>{d.getDate()}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
const hdStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border, height: 52 },
  todayPill: { flexShrink: 0, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 20, marginHorizontal: 4 },
  todayPillActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  todayText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },
  divider: { width: 1, height: 24, backgroundColor: Colors.border },
  datePill: { flexShrink: 0, alignItems: 'center', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 18, minWidth: 38 },
  datePillActive: { backgroundColor: Colors.accent },
  datePillToday: { backgroundColor: 'rgba(79,142,247,0.12)' },
  dayAbbr: { fontFamily: Fonts.mono, fontSize: 7, color: Colors.text3, letterSpacing: 0.5 },
  dayNum: { fontFamily: Fonts.display, fontSize: 15, color: Colors.text2, lineHeight: 17 },
});

// ─── Main Screen ──────────────────────────────────────────

type Overlay = 'none' | 'weight' | 'checkin' | 'coach' | 'breathing' | 'mobility' | 'sleep';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const program = useStore((s) => s.currentProgram);
  const userProfile = useStore((s) => s.userProfile);
  const completedCount = useStore((s) => s.completedSessionCount);
  const currentSession = useStore((s) => s.currentSession);
  const workoutLogs = useStore((s) => s.workoutLogs);
  const foodLogs = useStore((s) => s.foodLogs);
  const morningWeights = useStore((s) => s.morningWeights);
  const checkIns = useStore((s) => s.checkIns);
  const dismissedCheckInWeek = useStore((s) => s.dismissedCheckInWeek);
  const dismissCheckIn = useStore((s) => s.dismissCheckIn);
  const logHydration = useStore((s) => s.logHydration);
  const hydrationEntry = useTodayHydration();
  const score = useOptimisationScore();
  const latestCheckIn = useLatestCheckIn();

  const [overlay, setOverlay] = useState<Overlay>('none');
  const [coachInitialMsg, setCoachInitialMsg] = useState<string | undefined>();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = getGreeting(hour);
  const firstName = userProfile?.name?.split(' ')[0] ?? 'Athlete';
  const motd = MOTD[dayOfYear(now) % MOTD.length];
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const todayKey = now.toISOString().split('T')[0];
  const isToday = selectedDate === todayKey;

  if (!program) return null;

  const dayIndex = getTrainingDayIndex(program.days, completedCount);
  const today = program.days[dayIndex];
  const sessionActive = currentSession && !currentSession.completed;

  // Streaks
  const streak = calcCurrentStreak(workoutLogs);
  const monthWorkouts = workoutsThisMonth(workoutLogs);
  const monthPRs = prsThisMonth(workoutLogs);

  // Morning weight
  const currentWeek = getISOWeek(now);
  const todayWeight = morningWeights.find((w) => w.date === selectedDate);

  // Weekly check-in visibility (show every day it's not done, not just Monday, for mobile)
  const hasCheckInThisWeek = checkIns.some((c) => c.week === currentWeek);
  const isDismissed = dismissedCheckInWeek === currentWeek;
  const showCheckInBanner = !hasCheckInThisWeek && !isDismissed && isToday;

  // Nutrition
  const todayFood = foodLogs.find((l) => l.date === selectedDate);
  const logged = todayFood?.meals.reduce(
    (acc, m) => ({
      protein: acc.protein + m.macros.protein,
      carbs: acc.carbs + m.macros.carbs,
      fat: acc.fat + m.macros.fat,
      calories: acc.calories + m.macros.calories,
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 }
  ) ?? { protein: 0, carbs: 0, fat: 0, calories: 0 };
  const { protein: tP, carbs: tC, fat: tF, calories: tKcal } = program.macros;

  // Recent workouts
  const recentWorkouts = [...workoutLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  // Proactive insight
  const insight = useMemo(() => getProactiveInsight(latestCheckIn, currentWeek), [latestCheckIn, currentWeek]);

  function openCoach(msg?: string) {
    setCoachInitialMsg(msg);
    setOverlay('coach');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting}, {firstName}</Text>
          <Text style={styles.dateLabel}>
            {dateStr.toUpperCase()} · {program.splitName.split('(')[0].trim().toUpperCase()}
          </Text>
          <Text style={styles.motd}>{motd}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(userProfile?.name)}</Text>
        </View>
      </View>

      {/* Date strip */}
      <HomeDateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Past-date banner */}
        {!isToday && (
          <View style={styles.pastDateBanner}>
            <Text style={styles.pastDateText}>
              📅 VIEWING {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()} · READ-ONLY
            </Text>
          </View>
        )}

        {/* Morning weight card */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => isToday && !todayWeight && setOverlay('weight')}
          activeOpacity={(isToday && !todayWeight) ? 0.7 : 1}
        >
          <View style={styles.weightRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionLabel}>MORNING WEIGHT</Text>
              {todayWeight ? (
                <View style={styles.weightValRow}>
                  <Text style={styles.weightVal}>{todayWeight.weight}</Text>
                  <Text style={styles.weightUnit}> kg</Text>
                </View>
              ) : (
                <Text style={styles.weightPrompt}>Tap to log →</Text>
              )}
            </View>
            {todayWeight && isToday && (
              <TouchableOpacity onPress={() => setOverlay('weight')} style={styles.editWeightBtn}>
                <Text style={styles.editWeightText}>✎ EDIT</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>

        {/* Streak row */}
        <View style={styles.statsRow}>
          {[
            { label: 'DAY STREAK', value: streak },
            { label: 'SESSIONS / MO', value: monthWorkouts },
            { label: 'PRs THIS MONTH', value: monthPRs },
          ].map(({ label, value }, i) => (
            <View key={i} style={[styles.statCell, i < 2 && styles.statCellBorder]}>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Check-in banner */}
        {showCheckInBanner && (
          <View style={styles.checkInBanner}>
            <Text style={{ fontSize: 24 }}>📋</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.checkInTitle}>WEEKLY CHECK-IN</Text>
              <Text style={styles.checkInSub}>How did this week go? Takes 60 seconds.</Text>
            </View>
            <View style={styles.checkInActions}>
              <TouchableOpacity style={styles.checkInBtn} onPress={() => setOverlay('checkin')}>
                <Text style={styles.checkInBtnText}>Start</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => dismissCheckIn(currentWeek)}>
                <Text style={styles.checkInDismiss}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Recovery module */}
        <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
          <View style={styles.recoveryHeader}>
            <Text style={[styles.sectionLabel, { marginBottom: 0, color: Colors.accent2 }]}>RECOVERY</Text>
          </View>
          {[
            { icon: '🧘', label: 'Mobility Routine', meta: '5 moves · ~4 min · Behm et al. (2016)', key: 'mobility' as Overlay },
            { icon: '🫁', label: 'Box Breathing', meta: '4-4-4-4 · Lowers cortisol · Zaccaro et al. (2018)', key: 'breathing' as Overlay },
            { icon: '😴', label: 'Sleep Optimisation', meta: '6 evidence-based strategies · Walker (2017)', key: 'sleep' as Overlay },
          ].map((row, i) => (
            <TouchableOpacity key={row.label} style={[styles.recoveryRow, i < 2 && styles.recoveryRowBorder]} onPress={() => setOverlay(row.key)}>
              <Text style={styles.recoveryIcon}>{row.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.recoveryLabel}>{row.label}</Text>
                <Text style={styles.recoveryMeta}>{row.meta}</Text>
              </View>
              <Text style={styles.recoveryChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Today's session card */}
        <View style={styles.sessionCard}>
          <Text style={styles.sessionCardLabel}>
            {sessionActive ? '● ACTIVE SESSION' : today.isRest ? 'TODAY' : 'NEXT SESSION'}
          </Text>
          {today.isRest ? (
            <>
              <Text style={styles.sessionName}>Rest Day</Text>
              <Text style={styles.sessionMeta}>Recovery is training. Prioritise sleep and nutrition.</Text>
            </>
          ) : (
            <>
              <Text style={[styles.sessionName, sessionActive && { color: Colors.accent }]}>
                {today.label}
              </Text>
              <Text style={styles.sessionMeta}>
                {today.muscleGroups.join(' · ').toUpperCase()} · {today.exercises.length} exercises
                {sessionActive ? ' · Go to Workout tab →' : ''}
              </Text>
            </>
          )}
        </View>

        {/* Optimisation score */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>OPTIMISATION SCORE</Text>
          <Text style={styles.scoreValue}>
            {score}<Text style={styles.scoreUnit}> / 100</Text>
          </Text>
          <Text style={styles.scoreSub}>
            {score === 0 && 'Log a workout, meals, and complete your check-in.'}
            {score > 0 && score < 40 && 'Log your workout and meals to raise your score.'}
            {score >= 40 && score < 70 && 'Good start — hit your protein target to push higher.'}
            {score >= 70 && score < 90 && 'Strong session. Close out your nutrition to reach 90+.'}
            {score >= 90 && 'Outstanding. You\'re operating at peak.'}
          </Text>
          <Text style={styles.scoreBreakdown}>TRAINING 40 · PROTEIN 25 · CARBS 10 · FAT 10 · CHECK-IN 15</Text>
        </View>

        {/* Proactive insight */}
        {insight && (
          <View style={[styles.insightCard, {
            borderColor: insight.type === 'peak'
              ? 'rgba(61,214,140,0.25)'
              : insight.type === 'no_checkin'
              ? 'rgba(79,142,247,0.25)'
              : 'rgba(255,140,66,0.25)',
            backgroundColor: insight.type === 'peak'
              ? 'rgba(61,214,140,0.05)'
              : insight.type === 'no_checkin'
              ? 'rgba(79,142,247,0.05)'
              : 'rgba(255,140,66,0.05)',
          }]}>
            <Text style={styles.insightIcon}>
              {insight.type === 'peak' ? '🏆' : insight.type === 'no_checkin' ? '📋' : insight.type === 'recovery' ? '🔄' : '🌙'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.insightType, {
                color: insight.type === 'peak' ? Colors.green : insight.type === 'no_checkin' ? Colors.accent : Colors.accent3,
              }]}>
                {insight.type === 'peak' ? 'PEAK STATE' : insight.type === 'no_checkin' ? 'WEEKLY CHECK-IN' : 'COACH ALERT'}
              </Text>
              <Text style={styles.insightMessage}>{insight.message}</Text>
              <TouchableOpacity
                style={[styles.insightCta, {
                  borderColor: insight.type === 'peak' ? 'rgba(61,214,140,0.3)' : 'rgba(79,142,247,0.3)',
                }]}
                onPress={() => {
                  if (insight.type === 'no_checkin') setOverlay('checkin');
                  else openCoach(`Coach, ${insight.message}`);
                }}
              >
                <Text style={[styles.insightCtaText, {
                  color: insight.type === 'peak' ? Colors.green : Colors.accent,
                }]}>
                  {insight.cta.toUpperCase()} →
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* AI Coach entry */}
        <TouchableOpacity style={styles.coachCard} onPress={() => openCoach()}>
          <View style={styles.coachAvatar}>
            <Text style={{ fontSize: 16 }}>🤖</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.coachPrompt}>Ask SBL Coach…</Text>
            <Text style={styles.coachSub}>POWERED BY CLAUDE · SCIENCE-BACKED</Text>
          </View>
          <Text style={styles.coachChevron}>›</Text>
        </TouchableOpacity>

        {/* Nutrition card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>TODAY'S NUTRITION</Text>
          <View style={styles.calRow}>
            <View>
              <Text style={styles.calValue}>{Math.round(logged.calories)}</Text>
              <Text style={styles.calUnit}>kcal / {tKcal} target</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.calRemLabel}>REMAINING</Text>
              <Text style={styles.calRemValue}>{Math.max(0, tKcal - Math.round(logged.calories))}</Text>
              <Text style={styles.calUnit}>kcal</Text>
            </View>
          </View>
          {[
            { label: 'Protein', val: logged.protein, target: tP, color: Colors.accent2 },
            { label: 'Carbs',   val: logged.carbs,   target: tC, color: Colors.accent },
            { label: 'Fat',     val: logged.fat,     target: tF, color: Colors.accent3 },
          ].map(({ label, val, target, color }) => (
            <View key={label} style={styles.macroRow}>
              <View style={styles.macroLabelRow}>
                <Text style={[styles.macroLabel, { color }]}>{label}</Text>
                <Text style={styles.macroGrams}>{Math.round(val)}g / {target}g</Text>
              </View>
              <View style={styles.macroTrack}>
                <View style={[styles.macroFill, { width: `${Math.min((val / target) * 100, 100)}%` as any, backgroundColor: color }]} />
              </View>
            </View>
          ))}
        </View>

        {/* Hydration */}
        <View style={styles.card}>
          <View style={styles.hydrationHeader}>
            <Text style={[styles.sectionLabel, { marginBottom: 0, color: Colors.accent }]}>HYDRATION</Text>
            <Text style={styles.hydrationMl}>
              {(hydrationEntry?.glasses ?? 0) * 250}ml / {(hydrationEntry?.goalGlasses ?? 12) * 250}ml
            </Text>
          </View>
          <View style={styles.hydrationGrid}>
            {Array.from({ length: hydrationEntry?.goalGlasses ?? 12 }, (_, i) => {
              const filled = i < (hydrationEntry?.glasses ?? 0);
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.glassBtn, filled && styles.glassBtnFilled]}
                  onPress={() => {
                    const glasses = hydrationEntry?.glasses ?? 0;
                    const goal = hydrationEntry?.goalGlasses ?? 12;
                    logHydration(todayKey, filled ? glasses - 1 : glasses + 1, goal);
                  }}
                >
                  <Text style={styles.glassEmoji}>{filled ? '💧' : '○'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.hydrationTrack}>
            <View style={[styles.hydrationFill, {
              width: `${Math.min(((hydrationEntry?.glasses ?? 0) / (hydrationEntry?.goalGlasses ?? 12)) * 100, 100)}%` as any,
              backgroundColor: (hydrationEntry?.glasses ?? 0) >= (hydrationEntry?.goalGlasses ?? 12) ? Colors.green : Colors.accent,
            }]} />
          </View>
          {(hydrationEntry?.glasses ?? 0) >= (hydrationEntry?.goalGlasses ?? 12) && (
            <Text style={styles.hydrationGoalText}>✓ GOAL REACHED — excellent hydration</Text>
          )}
        </View>

        {/* Recent workouts */}
        {recentWorkouts.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>RECENT WORKOUTS</Text>
            {recentWorkouts.map((log, i) => {
              const dayLabel = program.days[log.dayIndex]?.label ?? `Day ${log.dayIndex + 1}`;
              const setCount = Object.values(log.sets).reduce((a, s) => a + s.length, 0);
              const vol = Object.values(log.sets).reduce(
                (a, sets) => a + sets.reduce((b, s) => b + s.weight * s.reps, 0), 0
              );
              const logDate = new Date(log.date);
              const isLogToday = log.date.startsWith(todayKey);
              const dayStr = isLogToday
                ? 'Today'
                : logDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
              return (
                <View key={i} style={[styles.logRow, i < recentWorkouts.length - 1 && styles.logRowBorder]}>
                  <View style={styles.logIcon}>
                    <Text style={styles.logIconText}>{setCount}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logName}>{dayLabel}</Text>
                    <Text style={styles.logMeta}>
                      {Object.keys(log.sets).length} exercises · {Math.round(vol / 1000 * 10) / 10}k kg vol
                    </Text>
                  </View>
                  <Text style={styles.logDate}>{dayStr}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Progress Photos / Body Tracking card */}
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Progress')} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 24, lineHeight: 28 }}>📸</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionLabel, { marginBottom: 2 }]}>PROGRESS TRACKING</Text>
              <Text style={styles.recoveryMeta}>PHOTOS · MEASUREMENTS · COMPARISON</Text>
            </View>
            <Text style={styles.recoveryChevron}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Pre-workout nutrition tip */}
        {!today.isRest && !sessionActive && (
          <View style={styles.preworkoutCard}>
            <Text style={styles.preworkoutLabel}>PRE-WORKOUT NUTRITION</Text>
            <Text style={styles.preworkoutText}>
              <Text style={styles.preworkoutBold}>30–90 min before training:</Text>
              {' '}fast-digesting carbs, minimal fat, moderate protein. Best options:{' '}
              <Text style={{ color: Colors.accent }}>
                banana + honey, mango, white rice, rice cakes, white bread + jam, Chocos / cornflakes with skim milk.
              </Text>
              {' '}Avoid fat-heavy foods — fat delays gastric emptying and slows glucose delivery to working muscle.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Modals */}
      {overlay === 'weight' && <WeightLogSheet onClose={() => setOverlay('none')} />}
      {overlay === 'checkin' && <CheckInModal onClose={() => setOverlay('none')} />}
      {overlay === 'coach' && (
        <CoachChatScreen onClose={() => { setOverlay('none'); setCoachInitialMsg(undefined); }} initialMessage={coachInitialMsg} />
      )}
      {overlay === 'breathing' && <BoxBreathingScreen onClose={() => setOverlay('none')} />}
      {overlay === 'mobility' && <MobilityScreen onClose={() => setOverlay('none')} />}
      {overlay === 'sleep' && <SleepOptimisationScreen onClose={() => setOverlay('none')} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  greeting: { fontFamily: Fonts.display, fontSize: 26, color: Colors.text, letterSpacing: 0.5 },
  dateLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5, marginTop: 3 },
  motd: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.text3, marginTop: 6, lineHeight: 17, maxWidth: 260, fontStyle: 'italic' },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(79,142,247,0.2)', borderWidth: 1.5, borderColor: 'rgba(79,142,247,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.accent },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  pastDateBanner: { backgroundColor: 'rgba(177,151,252,0.08)', borderWidth: 1, borderColor: 'rgba(177,151,252,0.2)', borderRadius: 10, padding: 10, paddingHorizontal: 14 },
  pastDateText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accent2, letterSpacing: 0.4 },
  card: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, padding: 16,
  },
  sectionLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5, marginBottom: 10 },

  // Morning weight
  weightRow: { flexDirection: 'row', alignItems: 'center' },
  weightValRow: { flexDirection: 'row', alignItems: 'baseline' },
  weightVal: { fontFamily: Fonts.display, fontSize: 34, color: Colors.accent3, lineHeight: 38 },
  weightUnit: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.text3 },
  weightPrompt: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.text3, marginTop: 4 },
  editWeightBtn: { padding: 4 },
  editWeightText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },

  // Stats row
  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.bg3,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 14, overflow: 'hidden',
  },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8 },
  statCellBorder: { borderRightWidth: 1, borderRightColor: Colors.border },
  statValue: { fontFamily: Fonts.display, fontSize: 26, color: Colors.text, lineHeight: 30 },
  statLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3, textAlign: 'center', marginTop: 4 },

  // Check-in banner
  checkInBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.35)',
    backgroundColor: 'rgba(79,142,247,0.06)', borderRadius: 14, padding: 14,
  },
  checkInTitle: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accent, letterSpacing: 0.5, marginBottom: 3 },
  checkInSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.text3, lineHeight: 16 },
  checkInActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  checkInBtn: { backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  checkInBtnText: { fontFamily: Fonts.mono, fontSize: 11, color: '#fff', letterSpacing: 0.5, fontWeight: '700' },
  checkInDismiss: { fontFamily: Fonts.sans, fontSize: 18, color: Colors.text3 },

  // Recovery module
  recoveryHeader: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  recoveryRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, paddingHorizontal: 16 },
  recoveryRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  recoveryIcon: { fontSize: 22, lineHeight: 26, flexShrink: 0 },
  recoveryLabel: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, marginBottom: 2 },
  recoveryMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3 },
  recoveryChevron: { fontFamily: Fonts.sans, fontSize: 20, color: Colors.accent2, flexShrink: 0 },

  // Session card
  sessionCard: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 14, padding: 16,
  },
  sessionCardLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5, marginBottom: 6 },
  sessionName: { fontFamily: Fonts.display, fontSize: 24, color: Colors.text, letterSpacing: 0.5, marginBottom: 4 },
  sessionMeta: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text2, letterSpacing: 0.3 },

  // Score
  scoreValue: { fontFamily: Fonts.display, fontSize: 40, color: Colors.accent, lineHeight: 44 },
  scoreUnit: { fontFamily: Fonts.display, fontSize: 20, color: Colors.text2 },
  scoreSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.text2, marginTop: 6, lineHeight: 17 },
  scoreBreakdown: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.4, marginTop: 8 },

  // Insight card
  insightCard: {
    flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'flex-start',
  },
  insightIcon: { fontSize: 22, marginTop: 2 },
  insightType: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.5, marginBottom: 6 },
  insightMessage: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text2, lineHeight: 18, marginBottom: 10 },
  insightCta: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  insightCtaText: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 0.5 },

  // Coach card
  coachCard: {
    backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  coachAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(79,142,247,0.12)', borderWidth: 1, borderColor: 'rgba(79,142,247,0.25)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  coachPrompt: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text2, marginBottom: 2 },
  coachSub: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.4 },
  coachChevron: { fontFamily: Fonts.sans, fontSize: 20, color: Colors.text3 },

  // Nutrition
  calRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 },
  calValue: { fontFamily: Fonts.display, fontSize: 34, color: Colors.accent, lineHeight: 38 },
  calUnit: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, marginTop: 2 },
  calRemLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.4, marginBottom: 2 },
  calRemValue: { fontFamily: Fonts.display, fontSize: 26, color: Colors.text2, lineHeight: 30 },
  macroRow: { marginBottom: 10 },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  macroLabel: { fontFamily: Fonts.sans, fontSize: 12 },
  macroGrams: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3 },
  macroTrack: { height: 5, backgroundColor: Colors.bg5, borderRadius: 3, overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 3 },

  // Recent workouts
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  logRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  logIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(79,142,247,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  logIconText: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.accent },
  logName: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  logMeta: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, marginTop: 1 },
  logDate: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },

  // Hydration
  hydrationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  hydrationMl: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  hydrationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  glassBtn: {
    width: 32, height: 36, borderRadius: 6,
    backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  glassBtnFilled: { backgroundColor: 'rgba(79,142,247,0.25)', borderColor: 'rgba(79,142,247,0.5)' },
  glassEmoji: { fontSize: 14 },
  hydrationTrack: { height: 4, backgroundColor: Colors.bg5, borderRadius: 2, overflow: 'hidden' },
  hydrationFill: { height: '100%', borderRadius: 2 },
  hydrationGoalText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.green, marginTop: 8, letterSpacing: 0.3 },

  // Pre-workout tip
  preworkoutCard: {
    borderWidth: 1, borderColor: 'rgba(177,151,252,0.2)',
    backgroundColor: 'rgba(177,151,252,0.05)', borderRadius: 14, padding: 14,
  },
  preworkoutLabel: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accent2, letterSpacing: 0.5, marginBottom: 8 },
  preworkoutText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.text3, lineHeight: 18 },
  preworkoutBold: { fontFamily: Fonts.sansMed, fontSize: 12, color: Colors.text },
});

import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet,
  Modal, FlatList, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useTodayFoodLog } from '../../store';
import { searchFoods } from '../../data/foods';
import type { FoodItem, MealEntry, FoodSection, Macros, Micronutrients, FatBreakdown, SavedMeal } from '../../types';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';

// ─── Constants ────────────────────────────────────────────

const MICRO_TARGETS = { iron: 17, calcium: 1000, zinc: 12, vitaminB12: 2.4, vitaminD: 15 };
const MICRO_META: { key: keyof Micronutrients; label: string; unit: string; color: string }[] = [
  { key: 'iron',       label: 'Iron',        unit: 'mg',  color: Colors.accent3 },
  { key: 'calcium',    label: 'Calcium',     unit: 'mg',  color: Colors.accent2 },
  { key: 'zinc',       label: 'Zinc',        unit: 'mg',  color: Colors.accent  },
  { key: 'vitaminB12', label: 'Vitamin B12', unit: 'mcg', color: Colors.green   },
  { key: 'vitaminD',   label: 'Vitamin D',   unit: 'mcg', color: Colors.yellow  },
];

const SERVING_UNITS: { label: string; multiplier: number | null }[] = [
  { label: 'g',     multiplier: 1   },
  { label: 'ml',    multiplier: 1   },
  { label: 'cup',   multiplier: 240 },
  { label: 'tbsp',  multiplier: 15  },
  { label: 'tsp',   multiplier: 5   },
  { label: 'piece', multiplier: null },
  { label: 'scoop', multiplier: 30  },
  { label: 'bowl',  multiplier: 300 },
  { label: 'slice', multiplier: 35  },
];

function toGrams(qty: string, unit: string, food: FoodItem): number {
  const q = parseFloat(qty);
  if (isNaN(q) || q <= 0) return 0;
  const u = SERVING_UNITS.find((u2) => u2.label === unit);
  if (!u) return q;
  const mult = u.multiplier ?? (food.commonPortions[0]?.grams ?? 100);
  return q * mult;
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

// ─── Macro Editor Modal ───────────────────────────────────

interface MacroEditorProps {
  visible: boolean;
  onClose: () => void;
  weight: number;
  tdee: number;
  initialCalories: number;
  initialProtein: number;
  initialFat: number;
  initialFiber?: number;
  onApply: (macros: Macros) => void;
}

function MacroEditorModal({ visible, onClose, weight, tdee, initialCalories, initialProtein, initialFat, initialFiber, onApply }: MacroEditorProps) {
  const insets = useSafeAreaInsets();
  const [calories, setCalories] = useState(initialCalories);
  const [protein, setProtein]   = useState(initialProtein);
  const [fat, setFat]           = useState(initialFat);
  const [fiber, setFiber]       = useState(initialFiber ?? 30);

  useEffect(() => {
    if (visible) {
      setCalories(initialCalories);
      setProtein(initialProtein);
      setFat(initialFat);
      setFiber(initialFiber ?? 30);
    }
  }, [visible, initialCalories, initialProtein, initialFat, initialFiber]);

  const calMin = 1200;
  const calMax = Math.max(tdee + 1000, 4500);
  const calDiff = calories - tdee;
  const calLabel = calDiff < -150 ? 'FAT LOSS' : calDiff > 150 ? 'MUSCLE GAIN' : 'MAINTENANCE';
  const calLabelColor = calDiff < -150 ? Colors.accent3 : calDiff > 150 ? Colors.green : Colors.accent2;

  const proteinMin = Math.round(weight * 1.0), proteinMax = Math.round(weight * 3.0);
  const proteinRec = { min: Math.round(weight * 1.6), max: Math.round(weight * 2.0) };
  const fatMin = Math.round(weight * 0.4), fatMax = Math.round(weight * 1.5);
  const fatRec = { min: Math.round(weight * 0.66), max: Math.round(weight * 1.1) };

  const carbsCals = calories - protein * 4 - fat * 9;
  const carbs = Math.max(0, Math.round(carbsCals / 4));
  const carbsNegative = carbsCals < 0;

  const proteinPct = Math.round((protein * 4 / calories) * 100);
  const fatPct = Math.round((fat * 9 / calories) * 100);
  const carbsPct = Math.max(0, 100 - proteinPct - fatPct);
  const fiberInRange = fiber >= 25 && fiber <= 38;
  const proteinInRange = protein >= proteinRec.min && protein <= proteinRec.max;
  const fatInRange = fat >= fatRec.min && fat <= fatRec.max;

  function handleReset() {
    setCalories(tdee);
    setProtein(proteinRec.max);
    setFat(Math.round(weight * 0.9));
    setFiber(30);
  }

  function handleApply() {
    onApply({ calories, protein, fat, carbs, fiber });
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={[meStyles.container, { paddingTop: insets.top > 0 ? insets.top : 20 }]} contentContainerStyle={meStyles.content} showsVerticalScrollIndicator={false}>
        <View style={meStyles.handle} />
        <View style={meStyles.titleRow}>
          <View>
            <Text style={meStyles.title}>EDIT DAILY MACROS</Text>
            <Text style={meStyles.tdeeLabel}>TDEE: {tdee} KCAL</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Text style={meStyles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Calories */}
        <View style={meStyles.section}>
          <View style={meStyles.sliderHeader}>
            <View>
              <Text style={meStyles.sliderLabel}>Daily Calories</Text>
              <Text style={[meStyles.sliderNote, { color: calLabelColor }]}>{calLabel} · {calDiff > 0 ? '+' : ''}{calDiff} kcal</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[meStyles.sliderValue, { color: Colors.accent }]}>{calories}</Text>
              <Text style={meStyles.sliderUnit}>kcal/day</Text>
            </View>
          </View>
          <Slider style={meStyles.slider} minimumValue={calMin} maximumValue={calMax} step={50} value={calories} onValueChange={(v) => setCalories(Math.round(v))} minimumTrackTintColor={Colors.accent} maximumTrackTintColor={Colors.bg5} thumbTintColor={Colors.accent} />
          <View style={meStyles.sliderRange}>
            <Text style={meStyles.sliderRangeText}>{calMin} kcal</Text>
            <Text style={meStyles.sliderRangeText}>{calMax} kcal</Text>
          </View>
        </View>

        {/* Macro split bar */}
        <View style={meStyles.section}>
          <View style={meStyles.splitBar}>
            <View style={[meStyles.splitSegment, { flex: proteinPct, backgroundColor: Colors.accent2 }]} />
            <View style={[meStyles.splitSegment, { flex: carbsPct, backgroundColor: Colors.accent }]} />
            <View style={[meStyles.splitSegment, { flex: fatPct, backgroundColor: Colors.accent3 }]} />
          </View>
          <View style={meStyles.splitLabels}>
            <Text style={[meStyles.splitLabel, { color: Colors.accent2 }]}>P {proteinPct}%</Text>
            <Text style={[meStyles.splitLabel, { color: Colors.accent }]}>C {carbsPct}%</Text>
            <Text style={[meStyles.splitLabel, { color: Colors.accent3 }]}>F {fatPct}%</Text>
          </View>
        </View>

        {/* Protein */}
        <View style={meStyles.section}>
          <View style={meStyles.sliderHeader}>
            <View>
              <Text style={meStyles.sliderLabel}>Protein</Text>
              <Text style={[meStyles.sliderNote, { color: proteinInRange ? Colors.green : Colors.accent3 }]}>
                {proteinInRange ? `✓ In range (${proteinRec.min}–${proteinRec.max}g)` : `Optimal: ${proteinRec.min}–${proteinRec.max}g`}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[meStyles.sliderValue, { color: Colors.accent2 }]}>{protein}g</Text>
              <Text style={meStyles.sliderUnit}>{(protein / weight).toFixed(1)} g/kg</Text>
            </View>
          </View>
          <Slider style={meStyles.slider} minimumValue={proteinMin} maximumValue={proteinMax} step={1} value={protein} onValueChange={(v) => setProtein(clamp(Math.round(v), proteinMin, proteinMax))} minimumTrackTintColor={Colors.accent2} maximumTrackTintColor={Colors.bg5} thumbTintColor={Colors.accent2} />
          <Text style={meStyles.citation}>1.6–2.0 g/kg · Morton et al. 2018 (n=1,863)</Text>
        </View>

        {/* Fat */}
        <View style={meStyles.section}>
          <View style={meStyles.sliderHeader}>
            <View>
              <Text style={meStyles.sliderLabel}>Fat</Text>
              <Text style={[meStyles.sliderNote, { color: fatInRange ? Colors.green : Colors.accent3 }]}>
                {fatInRange ? `✓ In range (${fatRec.min}–${fatRec.max}g)` : `Optimal: ${fatRec.min}–${fatRec.max}g`}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[meStyles.sliderValue, { color: Colors.accent3 }]}>{fat}g</Text>
              <Text style={meStyles.sliderUnit}>{(fat / weight).toFixed(2)} g/kg</Text>
            </View>
          </View>
          <Slider style={meStyles.slider} minimumValue={fatMin} maximumValue={fatMax} step={1} value={fat} onValueChange={(v) => setFat(clamp(Math.round(v), fatMin, fatMax))} minimumTrackTintColor={Colors.accent3} maximumTrackTintColor={Colors.bg5} thumbTintColor={Colors.accent3} />
          <Text style={meStyles.citation}>0.3–0.5 g/lb · ISSN Position Stand</Text>
        </View>

        {/* Carbs (auto) */}
        <View style={meStyles.section}>
          <View style={meStyles.sliderHeader}>
            <Text style={meStyles.sliderLabel}>Carbohydrates</Text>
            <Text style={[meStyles.sliderValue, { color: carbsNegative ? '#ff5050' : Colors.accent }]}>
              {carbsNegative ? '—' : `${carbs}g`}
            </Text>
          </View>
          <View style={meStyles.carbsBar}>
            <View style={[meStyles.carbsFill, { width: carbsNegative ? '0%' : `${Math.min((carbs / 400) * 100, 100)}%` as any }]} />
          </View>
          <Text style={[meStyles.sliderNote, { color: carbsNegative ? '#ff5050' : Colors.text3, marginTop: 4 }]}>
            {carbsNegative ? '⚠ Reduce protein or fat to free up calories for carbs' : 'Fills remaining calories automatically'}
          </Text>
        </View>

        {/* Fiber */}
        <View style={meStyles.section}>
          <View style={meStyles.sliderHeader}>
            <View>
              <Text style={meStyles.sliderLabel}>Daily Fibre</Text>
              <Text style={[meStyles.sliderNote, { color: fiberInRange ? Colors.green : Colors.accent3 }]}>
                {fiberInRange ? '✓ In optimal range (25–38g)' : 'Optimal: 25–38g/day · WHO / ICMR'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[meStyles.sliderValue, { color: Colors.green }]}>{fiber}g</Text>
              <Text style={meStyles.sliderUnit}>target/day</Text>
            </View>
          </View>
          <Slider style={meStyles.slider} minimumValue={10} maximumValue={60} step={1} value={fiber} onValueChange={(v) => setFiber(Math.round(v))} minimumTrackTintColor={Colors.green} maximumTrackTintColor={Colors.bg5} thumbTintColor={Colors.green} />
        </View>

        {carbsNegative && (
          <View style={meStyles.warningBox}>
            <Text style={meStyles.warningText}>⚠ Protein + fat exceeds calorie target. Reduce one before applying.</Text>
          </View>
        )}

        <TouchableOpacity style={[meStyles.applyBtn, carbsNegative && { opacity: 0.4 }]} onPress={handleApply} disabled={carbsNegative}>
          <Text style={meStyles.applyBtnText}>Apply Changes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={meStyles.resetBtn} onPress={handleReset}>
          <Text style={meStyles.resetBtnText}>Reset to TDEE · Recommended Macros</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

const meStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg3 },
  content: { padding: 20, paddingBottom: 40 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.bg5, alignSelf: 'center', marginBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  title: { fontFamily: Fonts.display, fontSize: 22, color: Colors.text, letterSpacing: 1 },
  tdeeLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1, marginTop: 3 },
  closeBtn: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text3, padding: 4 },
  section: { marginBottom: 24 },
  sliderHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 },
  sliderLabel: { fontFamily: Fonts.sansMed, fontSize: 14, color: Colors.text },
  sliderNote: { fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 0.5, marginTop: 2 },
  sliderValue: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 32 },
  sliderUnit: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  slider: { width: '100%', height: 40 },
  sliderRange: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  sliderRangeText: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  citation: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3, marginTop: 2 },
  splitBar: { flexDirection: 'row', height: 8, borderRadius: 99, overflow: 'hidden', gap: 1 },
  splitSegment: { height: '100%' },
  splitLabels: { flexDirection: 'row', gap: 16, marginTop: 6 },
  splitLabel: { fontFamily: Fonts.mono, fontSize: 10 },
  carbsBar: { height: 7, borderRadius: 99, backgroundColor: Colors.bg5, overflow: 'hidden' },
  carbsFill: { height: '100%', borderRadius: 99, backgroundColor: Colors.accent },
  warningBox: {
    backgroundColor: 'rgba(255,92,92,0.08)', borderWidth: 1, borderColor: 'rgba(255,92,92,0.25)',
    borderRadius: 8, padding: 12, marginBottom: 12,
  },
  warningText: { fontFamily: Fonts.mono, fontSize: 11, color: '#ff5050' },
  applyBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  applyBtnText: { fontFamily: Fonts.mono, fontSize: 13, color: '#fff', letterSpacing: 0.5, fontWeight: '700' },
  resetBtn: { backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  resetBtnText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text2, letterSpacing: 0.3 },
});

// ─── Add Food Sheet ───────────────────────────────────────

function AddFoodSheet({
  section, onClose, onAdd, savedMeals, onDeleteSavedMeal, onAddSavedMeal,
}: {
  section: FoodSection;
  onClose: () => void;
  onAdd: (food: FoodItem, grams: number) => void;
  savedMeals: SavedMeal[];
  onDeleteSavedMeal: (id: string) => void;
  onAddSavedMeal: (meal: SavedMeal) => void;
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab]         = useState<'search' | 'saved'>('search');
  const [query, setQuery]     = useState('');
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [qty, setQty]         = useState('100');
  const [unit, setUnit]       = useState('g');

  const results = query.length >= 1 ? searchFoods(query).slice(0, 14) : [];
  const grams = selected ? toGrams(qty, unit, selected) : 0;

  const preview = selected && grams > 0 ? {
    calories: Math.round(selected.per100g.calories * grams / 100),
    protein:  Math.round(selected.per100g.protein  * grams / 100 * 10) / 10,
    carbs:    Math.round(selected.per100g.carbs    * grams / 100 * 10) / 10,
    fat:      Math.round(selected.per100g.fat      * grams / 100 * 10) / 10,
  } : null;

  function selectFood(food: FoodItem) {
    setSelected(food);
    setQty(String(food.commonPortions[0]?.grams ?? 100));
    setUnit('g');
  }

  function handleAdd() {
    if (!selected || grams <= 0) return;
    onAdd(selected, grams);
    onClose();
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[afsStyles.container, { paddingBottom: insets.bottom }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Handle + header */}
        <View style={afsStyles.handle} />
        <View style={afsStyles.sheetHeader}>
          <View>
            <Text style={afsStyles.addingTo}>ADDING TO</Text>
            <Text style={afsStyles.sectionName}>{section.label}</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Text style={afsStyles.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Food detail view */}
        {selected ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={afsStyles.detailContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TouchableOpacity onPress={() => { setSelected(null); setQty('100'); setUnit('g'); }}>
              <Text style={afsStyles.backBtn}>← BACK TO SEARCH</Text>
            </TouchableOpacity>
            <Text style={afsStyles.foodTitle}>{selected.name}</Text>
            <Text style={afsStyles.foodPer100}>
              Per 100g — {selected.per100g.calories} kcal · P {selected.per100g.protein}g · C {selected.per100g.carbs}g · F {selected.per100g.fat}g
            </Text>

            {selected.commonPortions.length > 0 && (
              <>
                <Text style={afsStyles.portionLabel}>QUICK PORTIONS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                  {selected.commonPortions.map((p) => {
                    const active = qty === String(p.grams) && unit === 'g';
                    return (
                      <TouchableOpacity key={p.label} style={[afsStyles.portionChip, active && afsStyles.portionChipActive]} onPress={() => { setQty(String(p.grams)); setUnit('g'); }}>
                        <Text style={[afsStyles.portionChipText, active && afsStyles.portionChipTextActive]}>{p.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <Text style={afsStyles.portionLabel}>SERVING SIZE</Text>
            <View style={afsStyles.servingRow}>
              <TextInput
                style={afsStyles.qtyInput}
                keyboardType="decimal-pad"
                value={qty}
                onChangeText={setQty}
                selectTextOnFocus
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {SERVING_UNITS.map((u2) => (
                  <TouchableOpacity key={u2.label} style={[afsStyles.unitChip, unit === u2.label && afsStyles.unitChipActive]} onPress={() => setUnit(u2.label)}>
                    <Text style={[afsStyles.unitChipText, unit === u2.label && afsStyles.unitChipTextActive]}>{u2.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {unit !== 'g' && unit !== 'ml' && grams > 0 && (
              <Text style={afsStyles.gramsApprox}>≈ {Math.round(grams)}g</Text>
            )}

            {preview && (
              <View style={afsStyles.previewCard}>
                <View style={afsStyles.previewCalRow}>
                  <Text style={afsStyles.previewCal}>{preview.calories}</Text>
                  <Text style={afsStyles.previewCalUnit}> kcal</Text>
                </View>
                <View style={afsStyles.previewMacros}>
                  {[
                    { label: 'PROTEIN', val: `${preview.protein}g`, color: Colors.accent2 },
                    { label: 'CARBS',   val: `${preview.carbs}g`,   color: Colors.accent  },
                    { label: 'FAT',     val: `${preview.fat}g`,     color: Colors.accent3 },
                  ].map(({ label, val, color }, i) => (
                    <View key={label} style={[afsStyles.previewMacroCell, i < 2 && { borderRightWidth: 1, borderRightColor: Colors.border }]}>
                      <Text style={afsStyles.previewMacroLabel}>{label}</Text>
                      <Text style={[afsStyles.previewMacroVal, { color }]}>{val}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity style={[afsStyles.addBtn, grams <= 0 && { opacity: 0.4 }]} onPress={handleAdd} disabled={grams <= 0}>
              <Text style={afsStyles.addBtnText}>Add to {section.label}</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <>
            {/* Tab bar */}
            <View style={afsStyles.tabBar}>
              {(['search', 'saved'] as const).map((t) => (
                <TouchableOpacity key={t} style={[afsStyles.tab, tab === t && afsStyles.tabActive]} onPress={() => setTab(t)}>
                  <Text style={[afsStyles.tabText, tab === t && afsStyles.tabTextActive]}>
                    {t === 'search' ? 'SEARCH' : `SAVED MEALS${savedMeals.length > 0 ? ` (${savedMeals.length})` : ''}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {tab === 'search' ? (
              <>
                <View style={afsStyles.searchBarWrap}>
                  <TextInput
                    style={afsStyles.searchInput}
                    placeholder="Search foods… dal, paneer, chicken, roti…"
                    placeholderTextColor={Colors.text3}
                    value={query}
                    onChangeText={setQuery}
                    autoFocus
                    clearButtonMode="while-editing"
                  />
                </View>
                <FlatList
                  data={results}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={afsStyles.resultsList}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    <View style={afsStyles.emptySearch}>
                      <Text style={afsStyles.emptySearchText}>
                        {query.length === 0 ? 'TYPE TO SEARCH · 80+ INDIAN FOODS' : 'No results — try "paneer", "dal", "roti"'}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity style={afsStyles.resultRow} onPress={() => selectFood(item)}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={afsStyles.resultName} numberOfLines={1}>{item.name}</Text>
                        <Text style={afsStyles.resultMeta}>P {item.per100g.protein}g · C {item.per100g.carbs}g · F {item.per100g.fat}g · per 100g</Text>
                      </View>
                      <Text style={afsStyles.resultCal}>{item.per100g.calories}</Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            ) : (
              <FlatList
                data={savedMeals}
                keyExtractor={(item) => item.id}
                contentContainerStyle={afsStyles.savedList}
                ListEmptyComponent={
                  <View style={afsStyles.emptySearch}>
                    <Text style={afsStyles.emptySearchText}>NO SAVED MEALS YET{'\n'}Use ⋮ → Save as Meal on any section</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <View style={afsStyles.savedMealCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={afsStyles.savedMealName}>{item.name}</Text>
                      <Text style={afsStyles.savedMealMeta}>
                        {item.entries.length} item{item.entries.length !== 1 ? 's' : ''} · P {item.totalMacros.protein}g · C {item.totalMacros.carbs}g · F {item.totalMacros.fat}g
                      </Text>
                      <Text style={afsStyles.savedMealCal}>{item.totalMacros.calories}<Text style={afsStyles.savedMealCalUnit}> kcal</Text></Text>
                    </View>
                    <View style={afsStyles.savedMealActions}>
                      <TouchableOpacity style={afsStyles.addAllBtn} onPress={() => { onAddSavedMeal(item); onClose(); }}>
                        <Text style={afsStyles.addAllBtnText}>ADD ALL</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={afsStyles.deleteSavedBtn} onPress={() => onDeleteSavedMeal(item.id)}>
                        <Text style={afsStyles.deleteSavedBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const afsStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg3 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.bg5, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 8 },
  addingTo: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 2, marginBottom: 2 },
  sectionName: { fontFamily: Fonts.sansMed, fontSize: 15, color: Colors.text },
  closeBtn: { fontFamily: Fonts.sans, fontSize: 22, color: Colors.text3, padding: 4 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabActive: { borderBottomColor: Colors.accent },
  tabText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 1 },
  tabTextActive: { color: Colors.accent },
  searchBarWrap: {
    margin: 12, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 10, paddingHorizontal: 14,
  },
  searchInput: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, paddingVertical: 12 },
  resultsList: { paddingHorizontal: 12, paddingBottom: 24 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: Colors.bg4, borderRadius: 8, marginBottom: 6,
  },
  resultName: { fontFamily: Fonts.sansMed, fontSize: 13, color: Colors.text, marginBottom: 3 },
  resultMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3 },
  resultCal: { fontFamily: Fonts.display, fontSize: 20, color: Colors.accent, marginLeft: 12 },
  emptySearch: { padding: 32, alignItems: 'center' },
  emptySearchText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 1, textAlign: 'center', lineHeight: 18 },
  savedList: { padding: 12, paddingBottom: 24, gap: 8 },
  savedMealCard: {
    backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  savedMealName: { fontFamily: Fonts.sansMed, fontSize: 14, color: Colors.text, marginBottom: 3 },
  savedMealMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5, marginBottom: 4 },
  savedMealCal: { fontFamily: Fonts.display, fontSize: 18, color: Colors.accent, lineHeight: 22 },
  savedMealCalUnit: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  savedMealActions: { gap: 6, flexShrink: 0 },
  addAllBtn: { backgroundColor: Colors.accent, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  addAllBtnText: { fontFamily: Fonts.mono, fontSize: 9, color: '#fff', letterSpacing: 1, fontWeight: '700' },
  deleteSavedBtn: { borderWidth: 1, borderColor: Colors.border2, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center' },
  deleteSavedBtnText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text3 },
  // Food detail
  detailContent: { padding: 16, paddingBottom: 32 },
  backBtn: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.accent, letterSpacing: 1.5, marginBottom: 16 },
  foodTitle: { fontFamily: Fonts.sansMed, fontSize: 16, color: Colors.text, marginBottom: 4 },
  foodPer100: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.5, marginBottom: 20, lineHeight: 16 },
  portionLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1.5, marginBottom: 10 },
  portionChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border,
  },
  portionChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  portionChipText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text2 },
  portionChipTextActive: { color: '#fff' },
  servingRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8 },
  qtyInput: {
    width: 90, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10,
    fontFamily: Fonts.mono, fontSize: 22, color: Colors.text, textAlign: 'center', fontWeight: '700',
  },
  unitChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border,
  },
  unitChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  unitChipText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  unitChipTextActive: { color: '#fff' },
  gramsApprox: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, marginBottom: 12 },
  previewCard: {
    backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, overflow: 'hidden', marginBottom: 20,
  },
  previewCalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  previewCal: { fontFamily: Fonts.display, fontSize: 36, color: Colors.accent, lineHeight: 40 },
  previewCalUnit: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  previewMacros: { flexDirection: 'row' },
  previewMacroCell: { flex: 1, alignItems: 'center', padding: 10 },
  previewMacroLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3, letterSpacing: 1, marginBottom: 3 },
  previewMacroVal: { fontFamily: Fonts.display, fontSize: 20, lineHeight: 24 },
  addBtn: { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  addBtnText: { fontFamily: Fonts.mono, fontSize: 13, color: '#fff', letterSpacing: 0.5, fontWeight: '700' },
});

// ─── Section Options Sheet ────────────────────────────────

function SectionOptionsSheet({
  section, hasEntries, onRename, onSaveAsMeal, onDelete, onClose,
}: {
  section: FoodSection;
  hasEntries: boolean;
  onRename: () => void;
  onSaveAsMeal: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent>
      <TouchableOpacity style={sosStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[sosStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={sosStyles.handle} />
        <Text style={sosStyles.sectionName}>{section.label}</Text>
        <TouchableOpacity style={sosStyles.optionRow} onPress={() => { onClose(); onRename(); }}>
          <Text style={sosStyles.optionText}>✎  Rename Section</Text>
        </TouchableOpacity>
        {hasEntries && (
          <TouchableOpacity style={sosStyles.optionRow} onPress={() => { onClose(); onSaveAsMeal(); }}>
            <Text style={[sosStyles.optionText, { color: Colors.accent2 }]}>⊕  Save as Meal Template</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[sosStyles.optionRow, { borderTopWidth: 1, borderTopColor: Colors.border }]} onPress={() => { onClose(); onDelete(); }}>
          <Text style={[sosStyles.optionText, { color: '#ff5050' }]}>✕  Delete Section</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sosStyles.cancelBtn} onPress={onClose}>
          <Text style={sosStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const sosStyles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.bg2, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border2, alignSelf: 'center', marginBottom: 16 },
  sectionName: { fontFamily: Fonts.sansMed, fontSize: 16, color: Colors.text, marginBottom: 12 },
  optionRow: { paddingVertical: 14 },
  optionText: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.text },
  cancelBtn: { marginTop: 8, backgroundColor: Colors.bg4, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontFamily: Fonts.sansMed, fontSize: 15, color: Colors.text2 },
});

// ─── Rename Modal ─────────────────────────────────────────

function RenameModal({ currentLabel, onConfirm, onClose }: { currentLabel: string; onConfirm: (v: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(currentLabel);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[renStyles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={renStyles.handle} />
          <Text style={renStyles.title}>RENAME SECTION</Text>
          <TextInput
            style={renStyles.input}
            value={value}
            onChangeText={setValue}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => { if (value.trim()) { onConfirm(value.trim()); onClose(); } }}
          />
          <View style={renStyles.btnRow}>
            <TouchableOpacity style={renStyles.cancelBtn} onPress={onClose}>
              <Text style={renStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[renStyles.saveBtn, !value.trim() && { opacity: 0.4 }]} onPress={() => { if (value.trim()) { onConfirm(value.trim()); onClose(); } }} disabled={!value.trim()}>
              <Text style={renStyles.saveBtnText}>SAVE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const renStyles = StyleSheet.create({
  sheet: { backgroundColor: Colors.bg2, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border2, alignSelf: 'center', marginBottom: 20 },
  title: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 1.5, marginBottom: 12 },
  input: {
    backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, fontFamily: Fonts.sans, fontSize: 16, color: Colors.text, marginBottom: 16,
  },
  btnRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text2 },
  saveBtn: { flex: 2, backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontFamily: Fonts.mono, fontSize: 13, color: '#fff', letterSpacing: 0.5, fontWeight: '700' },
});

// ─── Save as Meal Modal ───────────────────────────────────

function SaveAsMealModal({ defaultName, onConfirm, onClose }: { defaultName: string; onConfirm: (name: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(defaultName);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[renStyles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={renStyles.handle} />
          <Text style={renStyles.title}>SAVE AS MEAL TEMPLATE</Text>
          <TextInput
            style={renStyles.input}
            value={name}
            onChangeText={setName}
            autoFocus
            placeholder="Meal name…"
            placeholderTextColor={Colors.text3}
            returnKeyType="done"
            onSubmitEditing={() => { if (name.trim()) { onConfirm(name.trim()); onClose(); } }}
          />
          <View style={renStyles.btnRow}>
            <TouchableOpacity style={renStyles.cancelBtn} onPress={onClose}>
              <Text style={renStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[renStyles.saveBtn, { backgroundColor: Colors.accent2 }, !name.trim() && { opacity: 0.4 }]} onPress={() => { if (name.trim()) { onConfirm(name.trim()); onClose(); } }} disabled={!name.trim()}>
              <Text style={renStyles.saveBtnText}>SAVE MEAL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add Meal Section Row ─────────────────────────────────

function AddSectionRow({ onAdd }: { onAdd: (label: string) => void }) {
  const [open, setOpen]   = useState(false);
  const [label, setLabel] = useState('');

  if (!open) {
    return (
      <TouchableOpacity style={addSecStyles.dashedBtn} onPress={() => setOpen(true)}>
        <Text style={addSecStyles.dashedBtnText}>+ ADD MEAL SECTION</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={addSecStyles.inputCard}>
      <Text style={addSecStyles.newSectionLabel}>NEW SECTION</Text>
      <View style={addSecStyles.inputRow}>
        <TextInput
          style={addSecStyles.input}
          placeholder="e.g. Evening Snack"
          placeholderTextColor={Colors.text3}
          value={label}
          onChangeText={setLabel}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => { if (label.trim()) { onAdd(label.trim()); setLabel(''); setOpen(false); } }}
        />
        <TouchableOpacity style={[addSecStyles.addBtn, !label.trim() && { opacity: 0.4 }]} onPress={() => { if (label.trim()) { onAdd(label.trim()); setLabel(''); setOpen(false); } }} disabled={!label.trim()}>
          <Text style={addSecStyles.addBtnText}>ADD</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setOpen(false); setLabel(''); }}>
          <Text style={addSecStyles.cancelText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const addSecStyles = StyleSheet.create({
  dashedBtn: {
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border2, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginBottom: 16,
  },
  dashedBtnText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3, letterSpacing: 1.5 },
  inputCard: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, marginBottom: 16 },
  newSectionLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 2, marginBottom: 10 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1, backgroundColor: Colors.bg4, borderWidth: 1, borderColor: Colors.border2, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontFamily: Fonts.sans, fontSize: 14, color: Colors.text,
  },
  addBtn: { backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  addBtnText: { fontFamily: Fonts.mono, fontSize: 11, color: '#fff', letterSpacing: 1, fontWeight: '700' },
  cancelText: { fontFamily: Fonts.sans, fontSize: 20, color: Colors.text3, paddingHorizontal: 4 },
});

// ─── Meal Section Card ────────────────────────────────────

type SectionAction = { type: 'options'; section: FoodSection } | { type: 'rename'; section: FoodSection } | { type: 'saveMeal'; section: FoodSection } | null;

function MealSectionCard({
  section, entries, todayKey, onAddFood, onRemoveEntry, onActionSelect,
}: {
  section: FoodSection;
  entries: MealEntry[];
  todayKey: string;
  onAddFood?: () => void;
  onRemoveEntry?: (id: string) => void;
  onActionSelect?: (action: SectionAction) => void;
}) {
  const totalCal  = entries.reduce((s, e) => s + e.macros.calories, 0);
  const totalProt = entries.reduce((s, e) => s + e.macros.protein,  0);
  const totalCarb = entries.reduce((s, e) => s + e.macros.carbs,    0);
  const totalFat  = entries.reduce((s, e) => s + e.macros.fat,      0);

  return (
    <View style={mscStyles.card}>
      {/* Header */}
      <View style={[mscStyles.header, (entries.length > 0) && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={mscStyles.sectionLabel}>{section.label}</Text>
          {entries.length > 0 && (
            <Text style={mscStyles.sectionMeta}>P {Math.round(totalProt)}g · C {Math.round(totalCarb)}g · F {Math.round(totalFat)}g</Text>
          )}
        </View>
        {entries.length > 0 && (
          <View style={mscStyles.calBadge}>
            <Text style={mscStyles.calBadgeNum}>{Math.round(totalCal)}</Text>
            <Text style={mscStyles.calBadgeUnit}> kcal</Text>
          </View>
        )}
        {onActionSelect && (
          <TouchableOpacity onPress={() => onActionSelect({ type: 'options', section })} style={mscStyles.menuBtn}>
            <Text style={mscStyles.menuBtnText}>⋮</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Food entries */}
      {entries.map((entry, i) => (
        <View key={entry.id} style={[mscStyles.entryRow, i < entries.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={mscStyles.entryName} numberOfLines={1}>{entry.food.name}</Text>
            <Text style={mscStyles.entryMeta}>{entry.grams}g · P {Math.round(entry.macros.protein)}g · C {Math.round(entry.macros.carbs)}g · F {Math.round(entry.macros.fat)}g</Text>
          </View>
          <Text style={mscStyles.entryCal}>{Math.round(entry.macros.calories)}</Text>
          {onRemoveEntry && (
            <TouchableOpacity onPress={() => onRemoveEntry(entry.id)} style={mscStyles.removeBtn}>
              <Text style={mscStyles.removeBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* Empty hint */}
      {entries.length === 0 && (
        <Text style={mscStyles.emptyHint}>Nothing logged yet</Text>
      )}

      {/* Add food button */}
      {onAddFood && (
        <TouchableOpacity style={[mscStyles.addFoodBtn, entries.length > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]} onPress={onAddFood}>
          <Text style={mscStyles.addFoodBtnText}>+ Add Food</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const mscStyles = StyleSheet.create({
  card: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  sectionLabel: { fontFamily: Fonts.sansMed, fontSize: 14, color: Colors.text, lineHeight: 18 },
  sectionMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, marginTop: 3, letterSpacing: 0.3 },
  calBadge: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 0, marginLeft: 8 },
  calBadgeNum: { fontFamily: Fonts.display, fontSize: 22, color: Colors.accent, lineHeight: 26 },
  calBadgeUnit: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3 },
  menuBtn: { padding: 8, paddingLeft: 4, flexShrink: 0 },
  menuBtnText: { fontFamily: Fonts.sans, fontSize: 20, color: Colors.text3 },
  entryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, gap: 10 },
  entryName: { fontFamily: Fonts.sansMed, fontSize: 13, color: Colors.text, marginBottom: 2 },
  entryMeta: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 0.3 },
  entryCal: { fontFamily: Fonts.display, fontSize: 18, color: Colors.text2, flexShrink: 0 },
  removeBtn: { padding: 4, flexShrink: 0 },
  removeBtnText: { fontFamily: Fonts.sans, fontSize: 18, color: Colors.text3 },
  emptyHint: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, padding: 14, paddingTop: 10 },
  addFoodBtn: { paddingVertical: 12, alignItems: 'center' },
  addFoodBtnText: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.accent, letterSpacing: 1.5 },
});

// ─── Macro Summary Card ───────────────────────────────────

function MacroSummaryCard({ logged, targets, loggedMicros, loggedFat, onEditGoals }: {
  logged: Macros;
  targets: Macros;
  loggedMicros: Micronutrients;
  loggedFat: FatBreakdown;
  onEditGoals: () => void;
}) {
  const [microOpen, setMicroOpen] = useState(false);
  const [fatOpen, setFatOpen]     = useState(false);

  const calPct    = targets.calories > 0 ? Math.min((logged.calories / targets.calories) * 100, 100) : 0;
  const remaining = Math.max(0, targets.calories - Math.round(logged.calories));
  const over      = Math.round(logged.calories) > targets.calories;

  const hasMicros = Object.values(loggedMicros).some((v) => (v ?? 0) > 0);
  const hasFat    = (loggedFat.saturated ?? 0) + (loggedFat.monounsaturated ?? 0) + (loggedFat.polyunsaturated ?? 0) > 0;

  const totalFat  = logged.fat || 1;
  const sat       = loggedFat.saturated      ?? 0;
  const mono      = loggedFat.monounsaturated ?? 0;
  const poly      = loggedFat.polyunsaturated ?? 0;
  const o3        = loggedFat.omega3          ?? 0;
  const o6        = loggedFat.omega6          ?? 0;
  const satPct    = Math.round((sat  / totalFat) * 100);
  const monoPct   = Math.round((mono / totalFat) * 100);
  const polyPct   = Math.min(100 - satPct - monoPct, Math.round((poly / totalFat) * 100));
  const omegaRatio = o3 > 0 ? Math.round((o6 / o3) * 10) / 10 : null;
  const ratioGood  = omegaRatio != null && omegaRatio <= 4;

  return (
    <View style={msStyles.card}>
      <View style={msStyles.cardHeader}>
        <Text style={msStyles.label}>TODAY'S MACROS</Text>
        <TouchableOpacity onPress={onEditGoals}>
          <Text style={msStyles.editGoalsBtn}>✎ GOALS</Text>
        </TouchableOpacity>
      </View>

      <View style={msStyles.calRow}>
        <View>
          <Text style={msStyles.calVal}>{Math.round(logged.calories)}</Text>
          <Text style={msStyles.calUnit}>KCAL LOGGED</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[msStyles.remVal, { color: over ? '#ff5050' : remaining === 0 ? Colors.green : Colors.text2 }]}>
            {over ? `+${Math.round(logged.calories) - targets.calories}` : remaining}
          </Text>
          <Text style={msStyles.calUnit}>{over ? 'OVER' : 'REMAINING'}</Text>
          <Text style={[msStyles.calUnit, { fontSize: 8, marginTop: 1 }]}>of {targets.calories} target</Text>
        </View>
      </View>

      <View style={msStyles.overallBar}>
        <View style={[msStyles.overallFill, {
          width: `${calPct}%` as any,
          backgroundColor: over ? '#ff5050' : calPct >= 95 ? Colors.green : Colors.accent,
        }]} />
      </View>

      {/* P/C/F mini bars */}
      <View style={msStyles.macroMinis}>
        {[
          { label: 'PROTEIN', val: logged.protein, target: targets.protein, color: Colors.accent2 },
          { label: 'CARBS',   val: logged.carbs,   target: targets.carbs,   color: Colors.accent  },
          { label: 'FAT',     val: logged.fat,     target: targets.fat,     color: Colors.accent3 },
        ].map(({ label, val, target, color }) => {
          const pct = target > 0 ? Math.min((val / target) * 100, 100) : 0;
          return (
            <View key={label} style={{ flex: 1 }}>
              <View style={msStyles.miniHeader}>
                <Text style={msStyles.miniLabel}>{label}</Text>
                <Text style={msStyles.miniVal}>{Math.round(val)}g</Text>
              </View>
              <View style={msStyles.miniTrack}>
                <View style={[msStyles.miniFill, { width: `${pct}%` as any, backgroundColor: color }]} />
              </View>
              <Text style={msStyles.miniTarget}>{target}g</Text>
            </View>
          );
        })}
      </View>

      {/* Fiber bar (if target set) */}
      {targets.fiber && targets.fiber > 0 && (
        <View style={msStyles.fiberRow}>
          <View style={msStyles.miniHeader}>
            <Text style={[msStyles.miniLabel, { color: Colors.green }]}>FIBRE</Text>
            <Text style={msStyles.miniVal}>{Math.round(logged.fiber ?? 0)}g / {targets.fiber}g</Text>
          </View>
          <View style={msStyles.miniTrack}>
            <View style={[msStyles.miniFill, { width: `${Math.min(((logged.fiber ?? 0) / targets.fiber) * 100, 100)}%` as any, backgroundColor: Colors.green }]} />
          </View>
        </View>
      )}

      {/* Micronutrients */}
      {hasMicros && (
        <>
          <TouchableOpacity style={msStyles.expandBtn} onPress={() => setMicroOpen((o) => !o)}>
            <Text style={msStyles.expandLabel}>MICRONUTRIENTS</Text>
            <Text style={msStyles.expandArrow}>{microOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {microOpen && (
            <View style={msStyles.expandContent}>
              {MICRO_META.map(({ key, label, unit, color }) => {
                const val = loggedMicros[key] ?? 0;
                const target = MICRO_TARGETS[key];
                const pct = Math.min((val / target) * 100, 100);
                const valStr = unit === 'mcg' ? val.toFixed(2) : val.toFixed(1);
                return (
                  <View key={key} style={msStyles.microRow}>
                    <View style={msStyles.miniHeader}>
                      <Text style={[msStyles.miniLabel, { color: Colors.text2 }]}>{label}</Text>
                      <Text style={[msStyles.miniVal, { color: pct >= 80 ? Colors.green : Colors.text3 }]}>
                        {valStr}{unit} / {target}{unit}
                      </Text>
                    </View>
                    <View style={msStyles.miniTrack}>
                      <View style={[msStyles.miniFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                    </View>
                  </View>
                );
              })}
              <Text style={msStyles.microRef}>Reference: ICMR / WHO daily values for Indian adults</Text>
            </View>
          )}
        </>
      )}

      {/* Fat breakdown */}
      {hasFat && (
        <>
          <TouchableOpacity style={msStyles.expandBtn} onPress={() => setFatOpen((o) => !o)}>
            <Text style={msStyles.expandLabel}>FAT BREAKDOWN</Text>
            <Text style={msStyles.expandArrow}>{fatOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {fatOpen && (
            <View style={msStyles.expandContent}>
              <View style={msStyles.fatBar}>
                <View style={[msStyles.fatSeg, { flex: satPct,  backgroundColor: Colors.accent3 }]} />
                <View style={[msStyles.fatSeg, { flex: monoPct, backgroundColor: Colors.accent2 }]} />
                <View style={[msStyles.fatSeg, { flex: polyPct, backgroundColor: Colors.green   }]} />
              </View>
              <View style={msStyles.fatLegend}>
                {[
                  { label: 'SATURATED', val: sat,  pct: satPct,  color: Colors.accent3 },
                  { label: 'MONO',      val: mono, pct: monoPct, color: Colors.accent2 },
                  { label: 'POLY',      val: poly, pct: polyPct, color: Colors.green   },
                ].map(({ label, val, pct, color }) => (
                  <View key={label} style={{ flex: 1 }}>
                    <Text style={[msStyles.miniLabel, { color: Colors.text3, marginBottom: 2 }]}>{label}</Text>
                    <Text style={[msStyles.miniVal, { color, fontFamily: Fonts.display, fontSize: 16 }]}>{val.toFixed(1)}g</Text>
                    <Text style={[msStyles.miniLabel, { color: Colors.text3 }]}>{pct}%</Text>
                  </View>
                ))}
              </View>
              {omegaRatio != null && (
                <View style={msStyles.omegaRow}>
                  <View>
                    <Text style={msStyles.miniLabel}>OMEGA-3</Text>
                    <Text style={[msStyles.miniVal, { color: Colors.green, fontFamily: Fonts.mono, fontSize: 13 }]}>{o3.toFixed(2)}g</Text>
                  </View>
                  <View>
                    <Text style={msStyles.miniLabel}>OMEGA-6</Text>
                    <Text style={[msStyles.miniVal, { color: Colors.accent3, fontFamily: Fonts.mono, fontSize: 13 }]}>{o6.toFixed(1)}g</Text>
                  </View>
                  <View>
                    <Text style={msStyles.miniLabel}>ω6:ω3 RATIO</Text>
                    <Text style={[msStyles.miniVal, { color: ratioGood ? Colors.green : Colors.accent3, fontFamily: Fonts.mono, fontSize: 13 }]}>
                      {omegaRatio}:1 {ratioGood ? '✓' : '↑'}
                    </Text>
                  </View>
                  <Text style={[msStyles.miniLabel, { alignSelf: 'flex-end', paddingBottom: 2 }]}>target &lt; 4:1</Text>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const msStyles = StyleSheet.create({
  card: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, paddingBottom: 10 },
  label: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 2 },
  editGoalsBtn: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1 },
  calRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 14, marginBottom: 10 },
  calVal: { fontFamily: Fonts.display, fontSize: 46, color: Colors.accent, lineHeight: 50 },
  calUnit: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1.5, marginTop: 2 },
  remVal: { fontFamily: Fonts.display, fontSize: 30, lineHeight: 34 },
  overallBar: { height: 5, backgroundColor: Colors.bg5, marginHorizontal: 14, borderRadius: 99, overflow: 'hidden', marginBottom: 14 },
  overallFill: { height: '100%', borderRadius: 99 },
  macroMinis: { flexDirection: 'row', gap: 14, paddingHorizontal: 14, marginBottom: 14 },
  miniHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  miniLabel: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3, letterSpacing: 1 },
  miniVal: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3 },
  miniTrack: { height: 4, backgroundColor: Colors.bg5, borderRadius: 99, overflow: 'hidden' },
  miniFill: { height: '100%', borderRadius: 99 },
  miniTarget: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3, marginTop: 2 },
  fiberRow: { paddingHorizontal: 14, marginBottom: 14 },
  expandBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  expandLabel: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 2 },
  expandArrow: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3 },
  expandContent: { padding: 14, paddingTop: 0, gap: 10 },
  microRow: { gap: 4 },
  microRef: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3, lineHeight: 14, marginTop: 4 },
  fatBar: { flexDirection: 'row', height: 10, borderRadius: 99, overflow: 'hidden', gap: 1, marginBottom: 10 },
  fatSeg: { height: '100%' },
  fatLegend: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  omegaRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-end' },
});

// ─── Date Strip ──────────────────────────────────────────

const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
function buildRecentDates(daysBack = 90): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}
const RECENT_DATES = buildRecentDates(90);

function DateStrip({ selectedDate, onSelectDate }: { selectedDate: string; onSelectDate: (d: string) => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const todayKey = new Date().toISOString().split('T')[0];

  useEffect(() => {
    // scroll to end (today) after mount
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
  }, []);

  return (
    <View style={ds.row}>
      <TouchableOpacity
        style={[ds.todayPill, selectedDate === todayKey && ds.todayPillActive]}
        onPress={() => { onSelectDate(todayKey); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }}
      >
        <Text style={[ds.todayPillText, selectedDate === todayKey && { color: '#fff' }]}>Today</Text>
      </TouchableOpacity>
      <View style={ds.divider} />
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 5, paddingVertical: 4, paddingHorizontal: 8 }}>
        {RECENT_DATES.map((dateStr) => {
          const d = new Date(dateStr + 'T00:00:00');
          const isToday = dateStr === todayKey;
          const isSelected = dateStr === selectedDate;
          return (
            <TouchableOpacity key={dateStr} style={[ds.datePill, isSelected && ds.datePillActive, !isSelected && isToday && ds.datePillToday]} onPress={() => onSelectDate(dateStr)}>
              <Text style={[ds.dayAbbr, isSelected && { color: 'rgba(255,255,255,0.8)' }]}>{DAY_ABBR[d.getDay()]}</Text>
              <Text style={[ds.dayNum, isSelected ? { color: '#fff' } : isToday ? { color: Colors.accent } : {}]}>{d.getDate()}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const ds = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border, height: 52 },
  todayPill: { flexShrink: 0, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 20, marginHorizontal: 4 },
  todayPillActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  todayPillText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },
  divider: { width: 1, height: 24, backgroundColor: Colors.border },
  datePill: { flexShrink: 0, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, minWidth: 40 },
  datePillActive: { backgroundColor: Colors.accent },
  datePillToday: { backgroundColor: 'rgba(79,142,247,0.12)' },
  dayAbbr: { fontFamily: Fonts.mono, fontSize: 8, color: Colors.text3, letterSpacing: 0.5 },
  dayNum: { fontFamily: Fonts.display, fontSize: 16, color: Colors.text2, lineHeight: 18 },
});

// ─── Main Screen ──────────────────────────────────────────

export default function FoodScreen() {
  const insets = useSafeAreaInsets();
  const program           = useStore((s) => s.currentProgram);
  const userProfile       = useStore((s) => s.userProfile);
  const logFood           = useStore((s) => s.logFood);
  const removeFoodEntry   = useStore((s) => s.removeFoodEntry);
  const updateMacros      = useStore((s) => s.updateMacros);
  const foodSections      = useStore((s) => s.foodSections);
  const addFoodSection    = useStore((s) => s.addFoodSection);
  const renameFoodSection = useStore((s) => s.renameFoodSection);
  const deleteFoodSection = useStore((s) => s.deleteFoodSection);
  const savedMeals        = useStore((s) => s.savedMeals);
  const saveMeal          = useStore((s) => s.saveMeal);
  const deleteSavedMeal   = useStore((s) => s.deleteSavedMeal);
  const todayFood         = useTodayFoodLog();
  const foodLogs          = useStore((s) => s.foodLogs);

  const [addingToSection, setAddingToSection]   = useState<FoodSection | null>(null);
  const [macroEditorOpen, setMacroEditorOpen]   = useState(false);
  const [sectionAction, setSectionAction]        = useState<SectionAction>(null);
  const [renameTarget, setRenameTarget]          = useState<FoodSection | null>(null);
  const [saveMealTarget, setSaveMealTarget]      = useState<FoodSection | null>(null);
  const [selectedDate, setSelectedDate]          = useState(() => new Date().toISOString().split('T')[0]);

  const today   = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === today;
  const selectedLog = isToday ? todayFood : foodLogs.find((l) => l.date === selectedDate);
  const targets = program?.macros ?? { protein: 165, carbs: 220, fat: 60, calories: 2100 };
  const entries = selectedLog?.meals ?? [];

  const logged: Macros = {
    calories: entries.reduce((s, m) => s + m.macros.calories, 0),
    protein:  entries.reduce((s, m) => s + m.macros.protein,  0),
    carbs:    entries.reduce((s, m) => s + m.macros.carbs,    0),
    fat:      entries.reduce((s, m) => s + m.macros.fat,      0),
    fiber:    entries.reduce((s, m) => s + (m.macros.fiber ?? 0), 0),
  };
  const loggedMicros: Micronutrients = {
    iron:       entries.reduce((s, m) => s + (m.micronutrients?.iron       ?? 0), 0),
    calcium:    entries.reduce((s, m) => s + (m.micronutrients?.calcium    ?? 0), 0),
    zinc:       entries.reduce((s, m) => s + (m.micronutrients?.zinc       ?? 0), 0),
    vitaminB12: entries.reduce((s, m) => s + (m.micronutrients?.vitaminB12 ?? 0), 0),
    vitaminD:   entries.reduce((s, m) => s + (m.micronutrients?.vitaminD   ?? 0), 0),
  };
  const loggedFat: FatBreakdown = {
    saturated:       entries.reduce((s, m) => s + (m.fatBreakdown?.saturated       ?? 0), 0),
    monounsaturated: entries.reduce((s, m) => s + (m.fatBreakdown?.monounsaturated ?? 0), 0),
    polyunsaturated: entries.reduce((s, m) => s + (m.fatBreakdown?.polyunsaturated ?? 0), 0),
    omega3:          entries.reduce((s, m) => s + (m.fatBreakdown?.omega3          ?? 0), 0),
    omega6:          entries.reduce((s, m) => s + (m.fatBreakdown?.omega6          ?? 0), 0),
  };

  const dateStr = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();

  function handleSectionAction(action: SectionAction) {
    if (!action) return;
    if (action.type === 'options') {
      setSectionAction(action);
    } else if (action.type === 'rename') {
      setRenameTarget(action.section);
    } else if (action.type === 'saveMeal') {
      setSaveMealTarget(action.section);
    }
  }

  function handleDeleteSection(section: FoodSection) {
    const sectionEntries = entries.filter((e) => e.slot === section.id);
    if (sectionEntries.length > 0) {
      Alert.alert(
        'Delete Section',
        `Delete "${section.label}" with ${sectionEntries.length} item${sectionEntries.length !== 1 ? 's' : ''}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteFoodSection(section.id) },
        ]
      );
    } else {
      deleteFoodSection(section.id);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>{isToday ? "TODAY'S NUTRITION" : dateStr}</Text>
          <Text style={styles.title}>FOOD LOG</Text>
        </View>
        {!isToday && (
          <TouchableOpacity onPress={() => setSelectedDate(today)} style={styles.todayBtn}>
            <Text style={styles.todayBtnText}>TODAY</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Date strip */}
      <DateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: 32 }]} showsVerticalScrollIndicator={false}>
        {!program && (
          <View style={styles.noProgramBanner}>
            <Text style={styles.noProgramText}>ℹ Targets shown are generic defaults — complete onboarding for personalised macros.</Text>
          </View>
        )}

        <MacroSummaryCard
          logged={logged}
          targets={targets}
          loggedMicros={loggedMicros}
          loggedFat={loggedFat}
          onEditGoals={() => setMacroEditorOpen(true)}
        />

        {foodSections.map((section) => (
          <MealSectionCard
            key={section.id}
            section={section}
            entries={entries.filter((e) => e.slot === section.id)}
            todayKey={today}
            onAddFood={isToday ? () => setAddingToSection(section) : undefined}
            onRemoveEntry={isToday ? (id) => removeFoodEntry(selectedDate, id) : undefined}
            onActionSelect={isToday ? handleSectionAction : undefined}
          />
        ))}

        {isToday && <AddSectionRow onAdd={(label) => addFoodSection(label)} />}
        {!isToday && entries.length === 0 && (
          <Text style={{ fontFamily: Fonts.mono, fontSize: 11, color: Colors.text3, textAlign: 'center', paddingVertical: 32 }}>No food logged on this day</Text>
        )}
      </ScrollView>

      {/* Add Food Sheet */}
      {addingToSection && (
        <AddFoodSheet
          section={addingToSection}
          onClose={() => setAddingToSection(null)}
          onAdd={(food, grams) => logFood(food, grams, addingToSection.id)}
          savedMeals={savedMeals}
          onDeleteSavedMeal={deleteSavedMeal}
          onAddSavedMeal={(meal) => meal.entries.forEach(({ food, grams }) => logFood(food, grams, addingToSection.id))}
        />
      )}

      {/* Section Options Sheet */}
      {sectionAction?.type === 'options' && (
        <SectionOptionsSheet
          section={sectionAction.section}
          hasEntries={entries.some((e) => e.slot === sectionAction.section.id)}
          onRename={() => setRenameTarget(sectionAction.section)}
          onSaveAsMeal={() => setSaveMealTarget(sectionAction.section)}
          onDelete={() => handleDeleteSection(sectionAction.section)}
          onClose={() => setSectionAction(null)}
        />
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <RenameModal
          currentLabel={renameTarget.label}
          onConfirm={(v) => renameFoodSection(renameTarget.id, v)}
          onClose={() => setRenameTarget(null)}
        />
      )}

      {/* Save as Meal Modal */}
      {saveMealTarget && (
        <SaveAsMealModal
          defaultName={saveMealTarget.label}
          onConfirm={(name) => {
            const sectionEntries = entries
              .filter((e) => e.slot === saveMealTarget.id)
              .map(({ food, grams }) => ({ food, grams }));
            saveMeal(name, sectionEntries);
          }}
          onClose={() => setSaveMealTarget(null)}
        />
      )}

      {/* Macro Editor */}
      <MacroEditorModal
        visible={macroEditorOpen}
        onClose={() => setMacroEditorOpen(false)}
        weight={userProfile?.weight ?? 70}
        tdee={program?.tdee ?? 2000}
        initialCalories={targets.calories}
        initialProtein={targets.protein}
        initialFat={targets.fat}
        initialFiber={targets.fiber}
        onApply={updateMacros}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerSub: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.accent, letterSpacing: 1.5, marginBottom: 3 },
  title: { fontFamily: Fonts.display, fontSize: 30, color: Colors.text, letterSpacing: 1, lineHeight: 34 },
  dateStr: { fontFamily: Fonts.mono, fontSize: 9, color: Colors.text3, letterSpacing: 1, paddingBottom: 4 },
  todayBtn: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  todayBtnText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accent, letterSpacing: 0.5 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 0 },
  noProgramBanner: {
    backgroundColor: 'rgba(79,142,247,0.08)', borderWidth: 1, borderColor: 'rgba(79,142,247,0.25)',
    borderRadius: 8, padding: 12, marginBottom: 12,
  },
  noProgramText: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.accent, letterSpacing: 0.5, lineHeight: 16 },
});

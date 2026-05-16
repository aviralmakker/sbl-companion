import { useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type FoodEntry = { id: string; name: string; calories: number };

const DAILY_GOAL = 2000;

export default function CalorieLogger() {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');

  const total = entries.reduce((sum, e) => sum + e.calories, 0);
  const remaining = DAILY_GOAL - total;

  const addEntry = () => {
    const cal = parseInt(calories, 10);
    if (!foodName.trim() || isNaN(cal) || cal <= 0) {
      Alert.alert('Invalid input', 'Enter a food name and a positive calorie count.');
      return;
    }
    setEntries(prev => [{ id: Date.now().toString(), name: foodName.trim(), calories: cal }, ...prev]);
    setFoodName('');
    setCalories('');
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{total}</Text>
          <Text style={styles.summaryLabel}>Consumed</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, remaining < 0 && styles.over]}>
            {remaining < 0 ? `+${Math.abs(remaining)}` : remaining}
          </Text>
          <Text style={styles.summaryLabel}>{remaining < 0 ? 'Over goal' : 'Remaining'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{DAILY_GOAL}</Text>
          <Text style={styles.summaryLabel}>Goal</Text>
        </View>
      </View>

      <View style={styles.form}>
        <TextInput
          style={[styles.input, styles.inputFlex]}
          placeholder="Food name"
          placeholderTextColor="#aaa"
          value={foodName}
          onChangeText={setFoodName}
          returnKeyType="next"
        />
        <TextInput
          style={[styles.input, styles.inputSmall]}
          placeholder="kcal"
          placeholderTextColor="#aaa"
          value={calories}
          onChangeText={setCalories}
          keyboardType="numeric"
          returnKeyType="done"
          onSubmitEditing={addEntry}
        />
        <TouchableOpacity style={styles.addBtn} onPress={addEntry}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={entries}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No entries yet. Add a meal above.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowName}>{item.name}</Text>
            <Text style={styles.rowCal}>{item.calories} kcal</Text>
            <TouchableOpacity onPress={() => setEntries(prev => prev.filter(e => e.id !== item.id))}>
              <Text style={styles.remove}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const GREEN = '#4CAF50';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  summary: {
    flexDirection: 'row',
    backgroundColor: GREEN,
    paddingVertical: 22,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  summaryItem: { alignItems: 'center' },
  summaryValue: { fontSize: 30, fontWeight: '700', color: '#fff' },
  summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  over: { color: '#ffeb3b' },
  divider: { width: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.3)' },
  form: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    backgroundColor: '#fafafa',
    color: '#222',
  },
  inputFlex: { flex: 1 },
  inputSmall: { width: 72 },
  addBtn: { backgroundColor: GREEN, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  list: { padding: 12, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  rowName: { flex: 1, fontSize: 15, color: '#222' },
  rowCal: { fontSize: 15, fontWeight: '600', color: '#555', marginRight: 14 },
  remove: { fontSize: 13, color: '#e53935' },
  empty: { textAlign: 'center', color: '#bbb', marginTop: 48, fontSize: 14 },
});

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

type WorkoutEntry = { id: string; exercise: string; sets: number; reps: number };

export default function WorkoutTracker() {
  const [entries, setEntries] = useState<WorkoutEntry[]>([]);
  const [exercise, setExercise] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');

  const totalSets = entries.reduce((sum, e) => sum + e.sets, 0);

  const addEntry = () => {
    const s = parseInt(sets, 10);
    const r = parseInt(reps, 10);
    if (!exercise.trim() || isNaN(s) || isNaN(r) || s <= 0 || r <= 0) {
      Alert.alert('Invalid input', 'Enter an exercise name, sets, and reps.');
      return;
    }
    setEntries(prev => [{ id: Date.now().toString(), exercise: exercise.trim(), sets: s, reps: r }, ...prev]);
    setExercise('');
    setSets('');
    setReps('');
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{entries.length}</Text>
          <Text style={styles.summaryLabel}>Exercises</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalSets}</Text>
          <Text style={styles.summaryLabel}>Total Sets</Text>
        </View>
      </View>

      <View style={styles.form}>
        <TextInput
          style={[styles.input, styles.inputFlex]}
          placeholder="Exercise"
          placeholderTextColor="#aaa"
          value={exercise}
          onChangeText={setExercise}
          returnKeyType="next"
        />
        <TextInput
          style={[styles.input, styles.inputSmall]}
          placeholder="Sets"
          placeholderTextColor="#aaa"
          value={sets}
          onChangeText={setSets}
          keyboardType="numeric"
          returnKeyType="next"
        />
        <TextInput
          style={[styles.input, styles.inputSmall]}
          placeholder="Reps"
          placeholderTextColor="#aaa"
          value={reps}
          onChangeText={setReps}
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
        ListEmptyComponent={<Text style={styles.empty}>No exercises yet. Log a set above.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowExercise}>{item.exercise}</Text>
              <Text style={styles.rowDetail}>{item.sets} sets × {item.reps} reps</Text>
            </View>
            <TouchableOpacity onPress={() => setEntries(prev => prev.filter(e => e.id !== item.id))}>
              <Text style={styles.remove}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const BLUE = '#2196F3';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  summary: {
    flexDirection: 'row',
    backgroundColor: BLUE,
    paddingVertical: 22,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  summaryItem: { alignItems: 'center' },
  summaryValue: { fontSize: 30, fontWeight: '700', color: '#fff' },
  summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
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
  inputSmall: { width: 62 },
  addBtn: { backgroundColor: BLUE, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 },
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
  rowInfo: { flex: 1 },
  rowExercise: { fontSize: 15, fontWeight: '600', color: '#222' },
  rowDetail: { fontSize: 13, color: '#777', marginTop: 2 },
  remove: { fontSize: 13, color: '#e53935' },
  empty: { textAlign: 'center', color: '#bbb', marginTop: 48, fontSize: 14 },
});

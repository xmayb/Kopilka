import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Bump the version suffix if the stored data shape ever changes,
// otherwise old installs will try to parse a format they don't understand.
const STORAGE_KEY = 'kopilka:v1';
const DEFAULT_BUDGET = 3000;
const CURRENCY = 'zł';

const COLORS = {
  bg: '#EEF1F6',
  card: '#FFFFFF',
  ink: '#1C2340',
  muted: '#7A8199',
  line: '#E3E7EF',
  accent: '#3B5BDB',
  ok: '#2B8A3E',
  warn: '#E8590C',
  over: '#C92A2A',
};

// TODO: let users create their own categories (needs a settings screen + migration).
const CATEGORIES = [
  { id: 'food', name: 'Food', icon: '🍲', color: '#F08C00' },
  { id: 'transport', name: 'Transport', icon: '🚋', color: '#1C7ED6' },
  { id: 'home', name: 'Home', icon: '🏠', color: '#7048E8' },
  { id: 'health', name: 'Health', icon: '💊', color: '#2B8A3E' },
  { id: 'fun', name: 'Fun', icon: '🎧', color: '#D6336C' },
  { id: 'other', name: 'Other', icon: '📦', color: '#868E96' },
];
const categoryById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// Not using Intl/toLocaleString on purpose: locale support in Hermes is
// inconsistent across versions, and a regex gives the same result everywhere.
const formatMoney = (n) =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + CURRENCY;

// Accept both "12.50" and "12,50" — Polish keyboards default to a comma.
const parseAmount = (text) => parseFloat((text ?? '').replace(',', '.'));

const isSameMonth = (date, ref) =>
  date.getMonth() === ref.getMonth() && date.getFullYear() === ref.getFullYear();

export default function App() {
  const [expenses, setExpenses] = useState([]);
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('food');

  // Guards the save effect below. Without it, the first render would
  // overwrite stored data with empty defaults before the load finishes.
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const data = JSON.parse(raw);
        setExpenses(data.expenses ?? []);
        setBudget(data.budget ?? DEFAULT_BUDGET);
      })
      .catch((err) => console.warn('Failed to load data:', err))
      .finally(() => setIsHydrated(true));
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    // Fine for an MVP. If the list grows to thousands of items, switch to
    // SQLite (expo-sqlite) instead of rewriting one big JSON blob every time.
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ expenses, budget }))
      .catch((err) => console.warn('Failed to save data:', err));
  }, [expenses, budget, isHydrated]);

  const now = new Date();

  const monthExpenses = useMemo(
    () => expenses.filter((e) => isSameMonth(new Date(e.date), now)),
    // `now` is intentionally left out: recomputing on every render defeats the memo.
    // Edge case: the list won't roll over at midnight on the 1st until the next change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses]
  );

  const spent = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const remaining = budget - spent;
  const usedRatio = budget > 0 ? spent / budget : 0;
  const progressColor =
    usedRatio < 0.7 ? COLORS.ok : usedRatio < 1 ? COLORS.warn : COLORS.over;

  // +1 so today still counts as a day you can spend money on.
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
  const dailyAllowance = remaining > 0 ? remaining / daysLeft : 0;

  const totalsByCategory = CATEGORIES
    .map((c) => ({
      ...c,
      total: monthExpenses
        .filter((e) => e.category === c.id)
        .reduce((sum, e) => sum + e.amount, 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const handleAddExpense = () => {
    const value = parseAmount(amount);
    if (!value || value <= 0) {
      Alert.alert('Enter an amount', 'The amount must be greater than zero.');
      return;
    }

    const expense = {
      // Date.now() is unique enough for a single-user local app.
      // Replace with a real UUID once we add sync between devices.
      id: Date.now().toString(),
      amount: value,
      category,
      note: note.trim(),
      date: new Date().toISOString(),
    };

    // Newest first, so the history list doesn't need to sort on render.
    setExpenses((prev) => [expense, ...prev]);
    setAmount('');
    setNote('');
  };

  const handleDeleteExpense = (id) =>
    Alert.alert('Delete this expense?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => setExpenses((prev) => prev.filter((e) => e.id !== id)),
      },
    ]);

  // Alert.prompt only exists on iOS. Good enough while we target iPhone only.
  // FIXME: replace with a custom modal before shipping an Android build.
  const handleEditBudget = () =>
    Alert.prompt(
      'Monthly budget',
      `Amount in ${CURRENCY}`,
      (text) => {
        const value = parseAmount(text);
        if (value > 0) setBudget(value);
      },
      'plain-text',
      String(budget),
      'numeric'
    );

  // Passed as an element, not a component. If this were `() => <View/>`,
  // FlatList would remount it on every render and the TextInputs would lose focus.
  const listHeader = (
    <View>
      <Text style={styles.month}>{MONTHS[now.getMonth()]} {now.getFullYear()}</Text>
      <Text style={styles.title}>Kopilka</Text>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>
          {remaining >= 0 ? 'Left this month' : 'Over budget'}
        </Text>
        <Text style={[styles.heroValue, remaining < 0 && { color: COLORS.over }]}>
          {formatMoney(Math.abs(remaining))}
        </Text>
        <View style={styles.track}>
          {/* Clamp to 100% — the bar shouldn't overflow when over budget. */}
          <View
            style={[
              styles.fill,
              { width: `${Math.min(usedRatio, 1) * 100}%`, backgroundColor: progressColor },
            ]}
          />
        </View>
        <View style={styles.heroRow}>
          <Text style={styles.heroMeta}>Spent {formatMoney(spent)}</Text>
          <Pressable onPress={handleEditBudget} hitSlop={10}>
            <Text style={styles.link}>of {formatMoney(budget)}</Text>
          </Pressable>
        </View>
        {remaining > 0 && (
          <Text style={styles.allowance}>
            You can spend {formatMoney(dailyAllowance)} a day for the next {daysLeft} days
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="0"
            placeholderTextColor={COLORS.muted}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <Text style={styles.currency}>{CURRENCY}</Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="What was it for? (optional)"
          placeholderTextColor={COLORS.muted}
          value={note}
          onChangeText={setNote}
          returnKeyType="done"
          onSubmitEditing={handleAddExpense}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
        >
          {CATEGORIES.map((c) => {
            const isActive = c.id === category;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategory(c.id)}
                style={[
                  styles.chip,
                  isActive && { backgroundColor: c.color, borderColor: c.color },
                ]}
              >
                <Text style={[styles.chipText, isActive && { color: '#fff' }]}>
                  {c.icon} {c.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
          onPress={handleAddExpense}
        >
          <Text style={styles.buttonText}>Add expense</Text>
        </Pressable>
      </View>

      {totalsByCategory.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Where the money goes</Text>
          {totalsByCategory.map((c) => (
            <View key={c.id} style={styles.categoryRow}>
              <View style={styles.rowBetween}>
                <Text style={styles.categoryName}>{c.icon} {c.name}</Text>
                <Text style={styles.categoryTotal}>{formatMoney(c.total)}</Text>
              </View>
              <View style={styles.thinTrack}>
                <View
                  style={[
                    styles.thinFill,
                    { width: `${(c.total / spent) * 100}%`, backgroundColor: c.color },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={[styles.sectionTitle, styles.historyTitle]}>History</Text>
    </View>
  );

  const renderExpense = ({ item }) => {
    // Fallback in case a category gets removed in a future version.
    const c = categoryById[item.category] ?? categoryById.other;
    const date = new Date(item.date);

    return (
      <Pressable onLongPress={() => handleDeleteExpense(item.id)} style={styles.item}>
        {/* Appending "22" to a 6-digit hex gives ~13% opacity — cheap tinted background. */}
        <View style={[styles.iconBox, { backgroundColor: c.color + '22' }]}>
          <Text style={styles.icon}>{c.icon}</Text>
        </View>
        <View style={styles.itemBody}>
          <Text style={styles.itemTitle}>{item.note || c.name}</Text>
          <Text style={styles.itemMeta}>
            {MONTHS[date.getMonth()].slice(0, 3)} {date.getDate()} · {c.name}
          </Text>
        </View>
        <Text style={styles.itemAmount}>−{formatMoney(item.amount)}</Text>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={monthExpenses}
        keyExtractor={(e) => e.id}
        renderItem={renderExpense}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <Text style={styles.empty}>No expenses yet. Add your first one above.</Text>
        }
        contentContainerStyle={styles.content}
        // Lets the "Add expense" button receive taps while the keyboard is open.
        keyboardShouldPersistTaps="handled"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  // Hardcoded top padding instead of safe-area-context to keep dependencies minimal.
  // TODO: switch to react-native-safe-area-context to handle every notch properly.
  content: { paddingTop: 64, paddingHorizontal: 18, paddingBottom: 40 },

  month: { color: COLORS.muted, fontSize: 15 },
  title: {
    color: COLORS.ink, fontSize: 34, fontWeight: '800',
    letterSpacing: -0.5, marginBottom: 16,
  },

  hero: { backgroundColor: COLORS.ink, borderRadius: 24, padding: 22, marginBottom: 14 },
  heroLabel: { color: '#AEB6D0', fontSize: 15 },
  heroValue: {
    color: '#FFFFFF', fontSize: 44, fontWeight: '800',
    letterSpacing: -1, marginVertical: 6,
  },
  track: {
    height: 12, borderRadius: 6, backgroundColor: '#2E3760',
    overflow: 'hidden', marginTop: 6,
  },
  fill: { height: '100%', borderRadius: 6 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  heroMeta: { color: '#AEB6D0', fontSize: 14 },
  link: { color: '#8FA8FF', fontSize: 14, fontWeight: '600' },
  allowance: { color: '#FFFFFF', fontSize: 14, marginTop: 14, opacity: 0.9 },

  card: { backgroundColor: COLORS.card, borderRadius: 18, padding: 16, marginBottom: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    backgroundColor: COLORS.bg, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 16, color: COLORS.ink,
    marginBottom: 10, flexGrow: 1,
  },
  amountInput: { fontSize: 28, fontWeight: '700' },
  currency: { fontSize: 22, color: COLORS.muted, marginLeft: 10, marginBottom: 10 },
  chips: { marginVertical: 12 },
  chip: {
    borderWidth: 1, borderColor: COLORS.line, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
  },
  chipText: { color: COLORS.ink, fontSize: 14, fontWeight: '600' },
  button: {
    backgroundColor: COLORS.accent, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  sectionTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  historyTitle: { marginTop: 8, marginLeft: 4 },
  categoryRow: { marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  categoryName: { color: COLORS.ink, fontSize: 15 },
  categoryTotal: { color: COLORS.ink, fontSize: 15, fontWeight: '600' },
  thinTrack: { height: 6, borderRadius: 3, backgroundColor: COLORS.bg, overflow: 'hidden' },
  thinFill: { height: '100%', borderRadius: 3 },

  item: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: 16, padding: 14, marginBottom: 8,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  icon: { fontSize: 18 },
  itemBody: { flex: 1 },
  itemTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '600' },
  itemMeta: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  itemAmount: { color: COLORS.ink, fontSize: 16, fontWeight: '700' },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 20 },
});

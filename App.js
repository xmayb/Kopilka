import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'kopilka:v1';

const C = {
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

const CATEGORIES = [
  { id: 'food', name: 'Еда', icon: '🍲', color: '#F08C00' },
  { id: 'transport', name: 'Транспорт', icon: '🚋', color: '#1C7ED6' },
  { id: 'home', name: 'Дом', icon: '🏠', color: '#7048E8' },
  { id: 'health', name: 'Здоровье', icon: '💊', color: '#2B8A3E' },
  { id: 'fun', name: 'Отдых', icon: '🎧', color: '#D6336C' },
  { id: 'other', name: 'Другое', icon: '📦', color: '#868E96' },
];
const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const money = (n) =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' zł';

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

export default function App() {
  const [expenses, setExpenses] = useState([]);
  const [budget, setBudget] = useState(3000);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('food');
  const [loaded, setLoaded] = useState(false);

  // Загрузка данных с устройства
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const data = JSON.parse(raw);
          setExpenses(data.expenses ?? []);
          setBudget(data.budget ?? 3000);
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  // Сохранение при каждом изменении
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ expenses, budget }));
  }, [expenses, budget, loaded]);

  const now = new Date();
  const thisMonth = useMemo(
    () => expenses.filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }),
    [expenses]
  );

  const spent = thisMonth.reduce((s, e) => s + e.amount, 0);
  const left = budget - spent;
  const ratio = budget > 0 ? spent / budget : 0;
  const barColor = ratio < 0.7 ? C.ok : ratio < 1 ? C.warn : C.over;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
  const perDay = left > 0 ? left / daysLeft : 0;

  const byCategory = CATEGORIES
    .map((c) => ({ ...c, total: thisMonth.filter((e) => e.category === c.id).reduce((s, e) => s + e.amount, 0) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const addExpense = () => {
    const value = parseFloat(amount.replace(',', '.'));
    if (!value || value <= 0) {
      Alert.alert('Введите сумму', 'Сумма должна быть больше нуля.');
      return;
    }
    setExpenses((prev) => [
      { id: Date.now().toString(), amount: value, category, note: note.trim(), date: new Date().toISOString() },
      ...prev,
    ]);
    setAmount('');
    setNote('');
  };

  const removeExpense = (id) =>
    Alert.alert('Удалить трату?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => setExpenses((p) => p.filter((e) => e.id !== id)) },
    ]);

  const editBudget = () =>
    Alert.prompt('Бюджет на месяц', 'Сумма в злотых', (text) => {
      const v = parseFloat((text ?? '').replace(',', '.'));
      if (v > 0) setBudget(v);
    }, 'plain-text', String(budget), 'numeric');

  const header = (
    <View>
      <Text style={s.month}>{MONTHS[now.getMonth()]} {now.getFullYear()}</Text>
      <Text style={s.title}>Копилка</Text>

      {/* Главная карточка: сколько осталось */}
      <View style={s.hero}>
        <Text style={s.heroLabel}>{left >= 0 ? 'Осталось в этом месяце' : 'Перерасход'}</Text>
        <Text style={[s.heroValue, left < 0 && { color: C.over }]}>{money(Math.abs(left))}</Text>
        <View style={s.track}>
          <View style={[s.fill, { width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: barColor }]} />
        </View>
        <View style={s.heroRow}>
          <Text style={s.heroMeta}>Потрачено {money(spent)}</Text>
          <Pressable onPress={editBudget} hitSlop={10}>
            <Text style={s.link}>из {money(budget)}</Text>
          </Pressable>
        </View>
        {left > 0 && (
          <Text style={s.perDay}>Можно тратить {money(perDay)} в день ещё {daysLeft} дн.</Text>
        )}
      </View>

      {/* Форма добавления */}
      <View style={s.card}>
        <View style={s.inputRow}>
          <TextInput
            style={[s.input, s.amountInput]}
            placeholder="0"
            placeholderTextColor={C.muted}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <Text style={s.currency}>zł</Text>
        </View>
        <TextInput
          style={s.input}
          placeholder="На что (необязательно)"
          placeholderTextColor={C.muted}
          value={note}
          onChangeText={setNote}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 12 }}>
          {CATEGORIES.map((c) => {
            const active = c.id === category;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategory(c.id)}
                style={[s.chip, active && { backgroundColor: c.color, borderColor: c.color }]}
              >
                <Text style={[s.chipText, active && { color: '#fff' }]}>{c.icon} {c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable style={({ pressed }) => [s.button, pressed && { opacity: 0.85 }]} onPress={addExpense}>
          <Text style={s.buttonText}>Добавить трату</Text>
        </Pressable>
      </View>

      {/* Разбивка по категориям */}
      {byCategory.length > 0 && (
        <View style={s.card}>
          <Text style={s.section}>Куда уходят деньги</Text>
          {byCategory.map((c) => (
            <View key={c.id} style={{ marginBottom: 10 }}>
              <View style={s.rowBetween}>
                <Text style={s.catName}>{c.icon} {c.name}</Text>
                <Text style={s.catSum}>{money(c.total)}</Text>
              </View>
              <View style={s.thinTrack}>
                <View style={[s.thinFill, { width: `${(c.total / spent) * 100}%`, backgroundColor: c.color }]} />
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={[s.section, { marginTop: 8, marginLeft: 4 }]}>История</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={thisMonth}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={header}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={s.empty}>Пока пусто. Добавьте первую трату выше.</Text>}
        renderItem={({ item }) => {
          const c = catById[item.category];
          const d = new Date(item.date);
          return (
            <Pressable onLongPress={() => removeExpense(item.id)} style={s.item}>
              <View style={[s.dot, { backgroundColor: c.color + '22' }]}>
                <Text style={{ fontSize: 18 }}>{c.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{item.note || c.name}</Text>
                <Text style={s.itemMeta}>{d.getDate()} {MONTHS[d.getMonth()].slice(0, 3)}, {c.name}</Text>
              </View>
              <Text style={s.itemSum}>−{money(item.amount)}</Text>
            </Pressable>
          );
        }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { paddingTop: 64, paddingHorizontal: 18, paddingBottom: 40 },
  month: { color: C.muted, fontSize: 15, textTransform: 'capitalize' },
  title: { color: C.ink, fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginBottom: 16 },

  hero: { backgroundColor: C.ink, borderRadius: 24, padding: 22, marginBottom: 14 },
  heroLabel: { color: '#AEB6D0', fontSize: 15 },
  heroValue: { color: '#FFFFFF', fontSize: 44, fontWeight: '800', letterSpacing: -1, marginVertical: 6 },
  track: { height: 12, borderRadius: 6, backgroundColor: '#2E3760', overflow: 'hidden', marginTop: 6 },
  fill: { height: '100%', borderRadius: 6 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  heroMeta: { color: '#AEB6D0', fontSize: 14 },
  link: { color: '#8FA8FF', fontSize: 14, fontWeight: '600' },
  perDay: { color: '#FFFFFF', fontSize: 14, marginTop: 14, opacity: 0.9 },

  card: { backgroundColor: C.card, borderRadius: 18, padding: 16, marginBottom: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: C.ink, marginBottom: 10, flexGrow: 1,
  },
  amountInput: { fontSize: 28, fontWeight: '700' },
  currency: { fontSize: 22, color: C.muted, marginLeft: 10, marginBottom: 10 },
  chip: {
    borderWidth: 1, borderColor: C.line, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
  },
  chipText: { color: C.ink, fontSize: 14, fontWeight: '600' },
  button: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  section: { color: C.ink, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catName: { color: C.ink, fontSize: 15 },
  catSum: { color: C.ink, fontSize: 15, fontWeight: '600' },
  thinTrack: { height: 6, borderRadius: 3, backgroundColor: C.bg, overflow: 'hidden' },
  thinFill: { height: '100%', borderRadius: 3 },

  item: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
    borderRadius: 16, padding: 14, marginBottom: 8,
  },
  dot: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  itemTitle: { color: C.ink, fontSize: 16, fontWeight: '600' },
  itemMeta: { color: C.muted, fontSize: 13, marginTop: 2 },
  itemSum: { color: C.ink, fontSize: 16, fontWeight: '700' },
  empty: { color: C.muted, textAlign: 'center', marginTop: 20 },
});

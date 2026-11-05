import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, StatusBar, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'kopilka:v2';
// Старый формат (до появления цели накоплений) хранил один "budget".
// Читаем его один раз, чтобы не терять данные у тех, кто уже пользовался приложением.
const OLD_STORAGE_KEY = 'kopilka:v1';

// Палитра в духе 70-х: олива + терракота, тёплая бумага вместо белого,
// без ярко-жёлтого и золотого.
const C = {
  bg: '#F3E9D2',
  card: '#FBF3E0',
  ink: '#332919',
  muted: '#8C7A5B',
  line: '#E4D7B8',
  accent: '#B9542A',
  heroLink: '#E08A54',
  heroMuted: '#C9B48B',
  heroTrack: '#4A3B24',
  ok: '#7E9B52',
  warn: '#C98B4A',
  over: '#C1503A',
};

const CATEGORIES = [
  { id: 'food', name: 'Еда', icon: '🍲', color: '#B9542A' },
  { id: 'transport', name: 'Транспорт', icon: '🚋', color: '#3E6258' },
  { id: 'home', name: 'Дом', icon: '🏠', color: '#6B7A3A' },
  { id: 'health', name: 'Здоровье', icon: '💊', color: '#7A4B32' },
  { id: 'fun', name: 'Отдых', icon: '🎧', color: '#8C3F57' },
  { id: 'other', name: 'Другое', icon: '📦', color: '#8A7355' },
];
const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const money = (n) =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' zł';

// Польская клавиатура по умолчанию ставит запятую вместо точки.
const parseNum = (text) => parseFloat(String(text ?? '').replace(',', '.'));

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

export default function App() {
  const [expenses, setExpenses] = useState([]);
  const [monthlyIncome, setMonthlyIncome] = useState(3000);
  const [savingsGoal, setSavingsGoal] = useState(0);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState('food');
  const [loaded, setLoaded] = useState(false);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [incomeText, setIncomeText] = useState('');
  const [savingsText, setSavingsText] = useState('');
  const [overspendVisible, setOverspendVisible] = useState(false);

  // Загрузка данных с устройства
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const data = JSON.parse(raw);
          setExpenses(data.expenses ?? []);
          setMonthlyIncome(data.monthlyIncome ?? 3000);
          setSavingsGoal(data.savingsGoal ?? 0);
          return null;
        }
        // Переносим данные из старого формата (единый "budget"), если он есть.
        return AsyncStorage.getItem(OLD_STORAGE_KEY).then((oldRaw) => {
          if (!oldRaw) return;
          const old = JSON.parse(oldRaw);
          setExpenses(old.expenses ?? []);
          setMonthlyIncome(old.budget ?? 3000);
          setSavingsGoal(0);
        });
      })
      .finally(() => setLoaded(true));
  }, []);

  // Сохранение при каждом изменении
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ expenses, monthlyIncome, savingsGoal }));
  }, [expenses, monthlyIncome, savingsGoal, loaded]);

  const now = new Date();
  const thisMonth = expenses.filter((e) => {
    const d = new Date(e.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const spent = thisMonth.reduce((s, e) => s + e.amount, 0);
  // Сколько можно потратить за месяц, чтобы отложенная сумма всё же накопилась.
  const spendable = monthlyIncome - savingsGoal;
  const left = spendable - spent;
  const ratio = spendable > 0 ? spent / spendable : (spent > 0 ? 1 : 0);
  const barColor = ratio < 0.7 ? C.ok : ratio < 1 ? C.warn : C.over;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;
  // Среднее арифметическое: сколько можно тратить в день до конца месяца,
  // чтобы не залезть в сумму, которую хочешь отложить.
  const perDay = left > 0 ? left / daysLeft : 0;

  const byCategory = CATEGORIES
    .map((c) => ({ ...c, total: thisMonth.filter((e) => e.category === c.id).reduce((s, e) => s + e.amount, 0) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const addExpense = () => {
    const value = parseNum(amount);
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

    // Проверяем темп трат: сколько должно было быть потрачено к сегодняшнему
    // дню, если тратить равномерно весь месяц и всё-таки накопить цель.
    if (spendable > 0) {
      const spentAfter = spent + value;
      const paceTarget = spendable * (now.getDate() / daysInMonth);
      if (spentAfter > paceTarget) {
        setOverspendVisible(true);
      }
    }
  };

  const removeExpense = (id) =>
    Alert.alert('Удалить трату?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => setExpenses((p) => p.filter((e) => e.id !== id)) },
    ]);

  const openSettings = () => {
    setIncomeText(String(monthlyIncome));
    setSavingsText(String(savingsGoal));
    setSettingsVisible(true);
  };

  const saveSettings = () => {
    const income = parseNum(incomeText);
    if (!income || income <= 0) {
      Alert.alert('Введите доход', 'Сумма дохода за месяц должна быть больше нуля.');
      return;
    }
    let goal = parseNum(savingsText);
    if (!goal || goal < 0) goal = 0;
    if (goal > income) {
      Alert.alert('Слишком большая цель', 'Нельзя накопить больше, чем весь доход за месяц — цель уменьшена.');
      goal = income;
    }
    setMonthlyIncome(income);
    setSavingsGoal(goal);
    setSettingsVisible(false);
  };

  const header = (
    <View>
      <Text style={s.month}>{MONTHS[now.getMonth()]} {now.getFullYear()}</Text>
      <Text style={s.title}>Копилка</Text>
      <View style={s.rule} />

      {/* Главная карточка: сколько осталось на траты */}
      <View style={s.hero}>
        <Text style={s.heroLabel}>{left >= 0 ? 'Можно потратить' : 'Перерасход'}</Text>
        <Text style={[s.heroValue, left < 0 && { color: C.over }]}>{money(Math.abs(left))}</Text>
        <View style={s.track}>
          <View style={[s.fill, { width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: barColor }]} />
        </View>
        <View style={s.heroRow}>
          <Text style={s.heroMeta}>Потрачено {money(spent)}</Text>
          <Pressable onPress={openSettings} hitSlop={10}>
            <Text style={s.link}>из {money(spendable)}</Text>
          </Pressable>
        </View>
        <Pressable onPress={openSettings} style={s.goalRow} hitSlop={6}>
          <Text style={s.goalText}>
            Доход {money(monthlyIncome)} · Цель накоплений {money(savingsGoal)} ✎
          </Text>
        </Pressable>
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

      {/* Доход за месяц и цель накоплений */}
      <Modal visible={settingsVisible} transparent animationType="fade" onRequestClose={() => setSettingsVisible(false)}>
        <View style={s.overlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Настройки месяца</Text>

            <Text style={s.fieldLabel}>Доход за месяц</Text>
            <View style={s.inputRow}>
              <TextInput
                style={[s.input, s.modalInput]}
                keyboardType="decimal-pad"
                value={incomeText}
                onChangeText={setIncomeText}
                placeholder="0"
                placeholderTextColor={C.muted}
              />
              <Text style={s.currency}>zł</Text>
            </View>

            <Text style={s.fieldLabel}>Хочу накопить</Text>
            <View style={s.inputRow}>
              <TextInput
                style={[s.input, s.modalInput]}
                keyboardType="decimal-pad"
                value={savingsText}
                onChangeText={setSavingsText}
                placeholder="0"
                placeholderTextColor={C.muted}
              />
              <Text style={s.currency}>zł</Text>
            </View>

            <View style={s.modalButtons}>
              <Pressable style={s.modalCancel} onPress={() => setSettingsVisible(false)}>
                <Text style={s.modalCancelText}>Отмена</Text>
              </Pressable>
              <Pressable style={s.button} onPress={saveSettings}>
                <Text style={s.buttonText}>Сохранить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Предупреждение: темп трат обгоняет план накоплений */}
      <Modal visible={overspendVisible} transparent animationType="fade" onRequestClose={() => setOverspendVisible(false)}>
        <View style={s.overlay}>
          <View style={s.modalCard}>
            <Text style={s.warnIcon}>📉</Text>
            <Text style={s.modalTitle}>Не укладываешься в план</Text>
            <Text style={s.warnText}>
              Чтобы накопить {money(savingsGoal)} к концу месяца, нужно тратить в среднем
              не больше {money(perDay)} в день. Сейчас трат за месяц уже больше, чем
              планировалось на сегодня — иначе отложить нужную сумму не получится.
            </Text>
            <Pressable style={s.button} onPress={() => setOverspendVisible(false)}>
              <Text style={s.buttonText}>Понятно</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { paddingTop: 64, paddingHorizontal: 18, paddingBottom: 40 },
  month: {
    color: C.muted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5,
  },
  title: { color: C.ink, fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
  rule: { width: 36, height: 3, backgroundColor: C.accent, borderRadius: 2, marginTop: 8, marginBottom: 16 },

  hero: {
    backgroundColor: C.ink, borderRadius: 14, padding: 22, marginBottom: 14,
    borderWidth: 1, borderColor: '#5A4A30',
  },
  heroLabel: { color: C.heroMuted, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  heroValue: { color: '#F6ECD6', fontSize: 44, fontWeight: '800', letterSpacing: -1, marginVertical: 6 },
  track: { height: 12, borderRadius: 4, backgroundColor: C.heroTrack, overflow: 'hidden', marginTop: 6 },
  fill: { height: '100%', borderRadius: 4 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  heroMeta: { color: C.heroMuted, fontSize: 14 },
  link: { color: C.heroLink, fontSize: 14, fontWeight: '600' },
  goalRow: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#4A3B24' },
  goalText: { color: C.heroMuted, fontSize: 13 },
  perDay: { color: '#F3E7CC', fontSize: 14, marginTop: 10, opacity: 0.95 },

  card: { backgroundColor: C.card, borderRadius: 10, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.line },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    backgroundColor: C.bg, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: C.ink, marginBottom: 10, flexGrow: 1,
    borderWidth: 1, borderColor: C.line,
  },
  amountInput: { fontSize: 28, fontWeight: '700' },
  currency: { fontSize: 22, color: C.muted, marginLeft: 10, marginBottom: 10 },
  chip: {
    borderWidth: 1, borderColor: C.line, borderRadius: 999, backgroundColor: C.card,
    paddingHorizontal: 14, paddingVertical: 8, marginRight: 8,
  },
  chipText: { color: C.ink, fontSize: 14, fontWeight: '600' },
  button: { backgroundColor: C.accent, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  section: { color: C.ink, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  catName: { color: C.ink, fontSize: 15 },
  catSum: { color: C.ink, fontSize: 15, fontWeight: '600' },
  thinTrack: { height: 6, borderRadius: 3, backgroundColor: C.bg, overflow: 'hidden' },
  thinFill: { height: '100%', borderRadius: 3 },

  item: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card,
    borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.line,
  },
  dot: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  itemTitle: { color: C.ink, fontSize: 16, fontWeight: '600' },
  itemMeta: { color: C.muted, fontSize: 13, marginTop: 2 },
  itemSum: { color: C.ink, fontSize: 16, fontWeight: '700' },
  empty: { color: C.muted, textAlign: 'center', marginTop: 20 },

  overlay: { flex: 1, backgroundColor: 'rgba(51,41,25,0.55)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: C.card, borderRadius: 14, padding: 22, borderWidth: 1, borderColor: C.line },
  modalTitle: { color: C.ink, fontSize: 19, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  fieldLabel: { color: C.muted, fontSize: 13, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalInput: { fontSize: 20, fontWeight: '700' },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalCancel: { flex: 1, paddingVertical: 15, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: C.line },
  modalCancelText: { color: C.muted, fontSize: 16, fontWeight: '600' },
  warnIcon: { fontSize: 32, textAlign: 'center', marginBottom: 4 },
  warnText: { color: C.ink, fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 18 },
});

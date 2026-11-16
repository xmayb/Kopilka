# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kopilka — a single-screen Expo / React Native expense tracker. Plain JavaScript (no
TypeScript anywhere), Expo SDK 58, React Native 0.88, React 19.3. Local-only: there is no
backend, no auth, and no network calls. Money is formatted in Polish złoty (`zł`).

`npm install` has not been run in this checkout (`node_modules/` is absent) — install before
trying to start the dev server.

## Commands

```bash
npx expo install <package>   # ALWAYS use instead of npm/yarn add — resolves SDK-compatible versions
npm start                    # expo start (or: npm run ios / android / web)
npx expo lint                # no eslint config exists yet; this offers to create one
npx expo-doctor              # diagnose dependency/config issues
npx expo install --fix       # repair incompatible package versions
```

There is no test suite and no typecheck step (`tsc --noEmit` does not apply — the project has
no `tsconfig.json` and no `.ts`/`.tsx` files).

## Expo has changed — do not trust training data

Expo ships breaking changes every SDK release. Before writing code that touches an Expo, EAS,
or React Native API, read the `expo` major version in `package.json` and fetch the matching
versioned docs (`https://docs.expo.dev/versions/v58.0.0/`). For anything else, fetch
`https://docs.expo.dev/llms.txt` — an index of all Expo docs with corrections to common LLM
misconceptions — and follow its links. Never answer from memory.

## Architecture

The whole app is one file. `index.js` calls `registerRootComponent(App)` on `./App.js`; there
is no router, no navigator, and no component or screen directory. `App.js` holds module-level
config constants, the single `App` component, and one `StyleSheet.create` block at the bottom.

**State and persistence.** All state is `useState` inside `App`. On mount, one effect reads
`{ expenses, monthlyIncome, savingsGoal }` from AsyncStorage under the key `kopilka:v2`; a
second effect rewrites the whole JSON blob on every change. That save effect is gated behind
`loaded` — without it the first render would clobber stored data with empty defaults. If no
`v2` record exists, the load effect falls back once to the old `kopilka:v1` shape (`{ expenses,
budget }`) and maps `budget` → `monthlyIncome` with `savingsGoal: 0`, so upgrading doesn't lose
existing data. Bump the version suffix again if the stored shape changes further.

**Budget model.** The user sets two numbers (via the settings modal, not the hero card
directly): `monthlyIncome` and `savingsGoal`. `spendable = monthlyIncome - savingsGoal` is what
the rest of the app budgets against — not raw income. `perDay` (the daily allowance shown in
the hero card) is the arithmetic mean of `spendable - spent` over the days remaining in the
month. `addExpense` also checks pace: after adding an expense it compares total spend-to-date
against `spendable * (dayOfMonth / daysInMonth)` — the proportional amount that should have
been spent by today to stay on track for the savings goal — and if spend-to-date has overtaken
that, shows the overspend modal. This is a *pace* check against cumulative spending, not a
per-expense cap, so it won't fire on every large single purchase, only when the running total
has drifted ahead of plan.

**Derived values** (month filter, total spent, remaining, per-category totals, daily
allowance) are recomputed from `expenses` on each render rather than stored or memoized — there
is no `useMemo` in `App.js`. The month filter is naturally pinned to `now` captured at the top
of the render, so it can't drift mid-render; it just means the list rolls over at midnight on
the 1st only on the next state change, like before.

**Layout.** A single `FlatList` of the current month's expenses. Everything above the history
(the hero budget card, the add-expense form, the per-category breakdown) is the
`ListHeaderComponent`, passed as an *element*, not a function — a function would remount the
header each render and the `TextInput`s would lose focus. Categories are a hardcoded
`CATEGORIES` array (id, name, emoji icon, color) with a `categoryById` lookup; adding an
expense prepends it so the list never needs sorting. Long-press a row to delete.

## Two copies of the app

`App.js` is the live one and has a Russian UI. `AppKopilka.js` is an unreferenced English
variant of the same screen, with heavier comments and small fixes (missing-category fallback,
`catch` handlers on the AsyncStorage calls, submit-on-return). Nothing imports it. When
changing behavior, confirm which file the user means — editing `AppKopilka.js` alone changes
nothing the app runs.

## Design

`App.js` uses a muted "70s ledger" palette (olive/terracotta on warm cream/paper, defined in
the `C` object) instead of bright colors — deliberately avoids saturated yellow/gold. Editing
the monthly income and savings goal happens through a custom `Modal` (`settingsVisible`),
opened by tapping the "из … · Доход … · Цель …" rows in the hero card — there is no native
`Alert.prompt` left in `App.js`. A second `Modal` (`overspendVisible`) is the pace-overspend
warning described above.

## Known constraints in the current code

- Top inset is a hardcoded `paddingTop: 64`, not `react-native-safe-area-context`.
- Expense ids are `Date.now().toString()` — fine for one local user, not for sync.
- The whole expense list is rewritten as one JSON string on every change; `expo-sqlite` is the
  escape hatch if the list grows large.
- `AppKopilka.js` (see below) was not updated alongside this — it still has the old single
  `budget` model and `Alert.prompt` editing, and remains iOS-only in that respect if it's ever
  wired up.

## Native projects

`ios/` and `android/` are gitignored and generated (Continuous Native Generation). Never create
or edit them by hand — configure native behavior in `app.json` and config plugins. Expo Go only
bundles its own native modules, so after adding a library with native code the app needs a
development build (`npx expo run:ios|android`, or `eas build --profile development`).

## Note on AGENTS.md

`AGENTS.md` carries generic Expo guidance, some of which does not match this repo: it assumes
Expo Router with routes in `src/app/` and a TypeScript setup. This project has neither. Its
Expo-docs rule, `npx expo install` rule, and CNG rule do apply, and are repeated above.

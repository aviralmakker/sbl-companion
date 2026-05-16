# CLAUDE.md — FitOS (MyApp)

This file provides guidance to Claude Code when working with code in this repository.

## Commands

```bash
npm start                  # Start Expo dev server (LAN mode)
npx expo start --tunnel    # Start with ngrok tunnel (use when phone is not on same Wi-Fi)
npm run android            # Open directly on Android emulator/device
npm run ios                # Open directly on iOS simulator (macOS only)
npm run web                # Open in browser (for local testing only)
npx tsc --noEmit           # Type-check without building
```

No test runner or linter is configured yet.

## What This Is

FitOS is a science-based lifting and nutrition OS built with **Expo SDK 54 + React Native 0.81.5**. It was migrated from a Vite/React web app (`z:\work\projects\FitOS`) into this Expo project. The web app is kept for reference during migration.

## Architecture

**Entry point:** `index.ts` → registers `App.tsx` as the root component.

**Navigation:** React Navigation — `NavigationContainer` + `createStackNavigator` (root) + `createBottomTabNavigator` (main tabs).

- Root stack shows `Onboarding` when `userProfile` is null, else `Main` (bottom tabs).
- Bottom tabs: **Home**, **Workout**, **Food**, **Progress**.

**Screens** (`screens/`):
- `screens/Onboarding/index.tsx` — Multi-step coaching questionnaire → generates personalised split + macros on launch.
- `screens/Home/index.tsx` — Dashboard: greeting, today's session card, optimisation score, nutrition summary, recent workouts.
- `screens/Workout/index.tsx` — Routine list with next session highlighted; day cards with exercise previews.
- `screens/Food/index.tsx` — Macro tracker + food search/log (Indian food database).
- `screens/Progress/index.tsx` — Streaks, total volume, morning weight, top estimated 1RMs.
- `screens/CalorieLogger.tsx`, `screens/WorkoutTracker.tsx` — Legacy standalone screens, not wired into navigation; kept for reference.

**State:** Zustand v5 with `persist` middleware → `AsyncStorage` (via `@react-native-async-storage/async-storage`). All state in `store/index.ts`.

**Design tokens:**
- `constants/colors.ts` — `Colors` object (dark theme)
- `constants/fonts.ts` — `Fonts` object: `display: 'BebasNeue'`, `mono: 'DMMono'`, `sans: 'DMSans'`, `sansMed: 'DMSans-Medium'`
- Fonts loaded in `App.tsx` via `useFonts` from `expo-font`
- **Never use inline color strings** — always reference `Colors.*`
- **Never use inline font strings** — always reference `Fonts.*`

**Styling:** All styles in `StyleSheet.create` co-located at the bottom of each file. No shared theme file.

**Data:**
- `data/exercises.ts` — `exerciseLibrary: Exercise[]` + `getExerciseById(id)` + `getExercisesByMuscle(muscle)`
- `data/foods.ts` — `indianFoods: FoodItem[]` + `searchFoods(query)`
- `types/index.ts` — All shared TypeScript interfaces

**Services:**
- `services/coachService.ts` — Claude AI integration. API key from `process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY` — **never hardcode**.
- `services/progressionService.ts` — Double progression: detects when to increase weight.
- `services/leaderboardService.ts` — Global leaderboard (Supabase, stubbed for now).

**Utils:**
- `utils/macroCalculator.ts` — TDEE/macro calculation from user profile
- `utils/programGenerator.ts` — Generates `TrainingProgram` from `UserProfile`
- `utils/coachInsights.ts` — Proactive coach insight generation

## Key config

- `app.json`: name `FitOS`, slug `fitos`, dark theme, `newArchEnabled: true`, edge-to-edge Android.
- `tsconfig.json`: extends `expo/tsconfig.base` with `strict: true`.
- No Babel config — uses Expo's default transformer.

## Native dependencies (already installed)

- `@react-navigation/native`, `@react-navigation/bottom-tabs`, `@react-navigation/stack`
- `react-native-screens`, `react-native-safe-area-context`, `react-native-gesture-handler`
- `react-native-reanimated`, `@gorhom/bottom-sheet`
- `react-native-draggable-flatlist`, `react-native-svg`
- `@expo-google-fonts/bebas-neue`, `@expo-google-fonts/dm-mono`, `@expo-google-fonts/dm-sans`
- `expo-font`, `expo-splash-screen`, `expo-haptics`, `expo-linear-gradient`
- `@react-native-async-storage/async-storage`, `@react-native-community/slider`

## Recurring UI patterns

These patterns appear throughout the codebase — follow them for consistency.

**Full-screen overlay modal** (used for sub-screens launched from a tab):
```tsx
<Modal visible animationType="slide" presentationStyle="fullScreen">
  <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
    {/* screen content */}
  </SafeAreaView>
</Modal>
```

**SubView** (inline sub-navigation within Progress tab): `useState<'leaderboard' | 'measurements' | ... | null>(null)` — `null` renders the hub, a non-null value renders the sub-screen inline with an `onBack` prop.

**DateStrip** (horizontal date scroll): `ScrollView` horizontal with a `useRef<ScrollView>` + `useEffect` that calls `ref.current.scrollToEnd({ animated: false })` after mount to auto-scroll to today.

**`SetType`** (used in Workout screen): `'normal' | 'warmup' | 'drop' | 'failure'` — defined once at file scope, reused by both the session view and the program builder.

## React Native rules (MUST follow)

- **No HTML elements** — never use `div`, `span`, `button`, `input`, `img`, `a`, `p`. Use `View`, `Text`, `TouchableOpacity`, `TextInput`, `Image`, `ScrollView`, `FlatList`, `Pressable`.
- **No CSS** — never use `className`, `style` strings, or CSS variables. All styling via `StyleSheet.create`.
- **No `import.meta.env`** — use `process.env.EXPO_PUBLIC_*` for environment variables.
- **No `useNavigate`/`useLocation`** — use React Navigation hooks: `useNavigation()`, `useRoute()`.
- **No SVG JSX** — use `react-native-svg` (`Svg`, `Path`, `Circle`, etc.) instead of raw `<svg>`.
- **`width`/`height` percentages** — allowed in StyleSheet as strings: `'100%'`, `'50%'`.
- **Safe area** — use `useSafeAreaInsets()` from `react-native-safe-area-context` in each screen; don't rely on padding in the tab bar alone.
- **Keyboard** — use `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` when text inputs are involved.

# SBL Companion

A science-based lifting companion app for serious gym-goers. Tracks workouts, nutrition, and progress with AI coaching built in.

Built with Expo (React Native) — runs on iOS and Android via Expo Go or a native build.

---

## Features

### Workout
- Auto-generated training split from your profile (PPL, Upper/Lower, Full Body, etc.)
- Live session tracker with set logging, rest timers, and double-progression cues
- Routine editor — edit any training day's exercises, sets, and rep ranges
- Program library — browse, activate, and edit science-based programs
- Custom program builder — build your own split from scratch with exercise picker and set configuration

### Nutrition
- Daily macro tracker (calories, protein, carbs, fat)
- Food search with an Indian food database
- Meal sections (Breakfast, Pre-Workout, Post-Workout, Dinner) — add, rename, or delete
- Save and quick-log favourite meals
- Date strip — browse and review past food logs

### Progress
- Morning weight log with trend graph
- Weekly check-ins with muscle measurements
- Estimated 1RM tracker per exercise
- Workout streaks and volume history
- Global leaderboard — submit and compare lifts by exercise

### Home Dashboard
- Daily overview: next session, nutrition summary, optimisation score
- Hydration tracker
- AI coach chat (Claude-powered)
- Date strip — browse any past day's data in read-only mode
- Quick-navigate to Progress tracking

### Onboarding
- Multi-step questionnaire: goal, training age, days/week, equipment, body stats, diet type
- Generates a personalised program and macro targets on first launch

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK 54 + React Native 0.81.5 |
| Language | TypeScript 5.9 (strict) |
| State | Zustand v5 + AsyncStorage (persisted) |
| Navigation | React Navigation (Stack + Bottom Tabs) |
| UI | StyleSheet.create, dark theme throughout |
| Fonts | Bebas Neue (display), DM Mono, DM Sans |
| AI | Claude API via `EXPO_PUBLIC_ANTHROPIC_API_KEY` |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your phone (for quick testing)

### Install

```bash
git clone https://github.com/aviralmakker/sbl-companion.git
cd sbl-companion
npm install
```

### Environment

Create a `.env.local` file (or set in your shell):

```
EXPO_PUBLIC_ANTHROPIC_API_KEY=your_key_here
```

The AI Coach tab won't work without this key. All other features function without it.

### Run

```bash
# LAN (phone must be on same Wi-Fi)
npm start

# Cross-network tunnel (ngrok)
npx expo start --tunnel

# Android emulator
npm run android

# iOS simulator (macOS only)
npm run ios
```

Scan the QR code with Expo Go on your phone.

---

## Project Structure

```
screens/
  Onboarding/   — profile questionnaire
  Home/         — dashboard
  Workout/      — session tracker, program library, builder
  Food/         — macro log
  Progress/     — stats, measurements, leaderboard
store/          — Zustand store (all app state)
services/       — Claude AI coach, progression logic, leaderboard
utils/          — macro calculator, program generator, coach insights
data/           — exercise library, Indian food database
constants/      — Colors, Fonts design tokens
types/          — shared TypeScript interfaces
```

---

## License

MIT

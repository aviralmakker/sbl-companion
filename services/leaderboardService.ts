// leaderboardService.ts — mock layer, Supabase-ready

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  username: string;
  est1RM: number;      // kg
  bodyweight?: number; // kg
  country: string;
  postedAt: string;    // ISO date
}

// Mock 1RM multipliers per exercise relative to a "standard" (bench = 1.0)
const EXERCISE_SCALE: Record<string, number> = {
  bench_press_flat: 1.0,
  squat_barbell:    1.6,
  rdl:              1.7,
  ohp_barbell:      0.65,
  lat_pulldown:     0.7,
  leg_press:        2.8,
  pullup:           0.6,
  db_row:           0.55,
};

const ATHLETES: Omit<LeaderboardEntry, 'rank' | 'est1RM' | 'postedAt'>[] = [
  { userId: 'u1',  displayName: 'Akira Tanaka',     username: 'akira_lifts',  bodyweight: 82,  country: '🇯🇵' },
  { userId: 'u2',  displayName: 'Marcus Webb',       username: 'mwebb_iron',   bodyweight: 95,  country: '🇺🇸' },
  { userId: 'u3',  displayName: 'Sofia Petrov',      username: 'sofia_strong', bodyweight: 62,  country: '🇷🇺' },
  { userId: 'u4',  displayName: 'Diego Reyes',       username: 'diegorx',      bodyweight: 88,  country: '🇲🇽' },
  { userId: 'u5',  displayName: 'Lena Müller',       username: 'lena_fit',     bodyweight: 67,  country: '🇩🇪' },
  { userId: 'u6',  displayName: 'Kwame Asante',      username: 'kwame_power',  bodyweight: 91,  country: '🇬🇭' },
  { userId: 'u7',  displayName: 'Priya Sharma',      username: 'priya_s',      bodyweight: 58,  country: '🇮🇳' },
  { userId: 'u8',  displayName: 'Tomas Novak',       username: 'tomas_n',      bodyweight: 85,  country: '🇨🇿' },
  { userId: 'u9',  displayName: 'Amara Diallo',      username: 'amara_d',      bodyweight: 75,  country: '🇸🇳' },
  { userId: 'u10', displayName: 'Ryan Choi',         username: 'ryanchoi',     bodyweight: 78,  country: '🇰🇷' },
  { userId: 'u11', displayName: 'Valentina Cruz',    username: 'val_lifts',    bodyweight: 64,  country: '🇨🇴' },
  { userId: 'u12', displayName: 'Ibrahim Al-Hassan', username: 'ibrahim_h',    bodyweight: 92,  country: '🇸🇦' },
  { userId: 'u13', displayName: 'Chloe Dubois',      username: 'chloedub',     bodyweight: 60,  country: '🇫🇷' },
  { userId: 'u14', displayName: 'Oluwaseun Adeyemi', username: 'seun_iron',    bodyweight: 87,  country: '🇳🇬' },
  { userId: 'u15', displayName: 'Mei Lin',           username: 'meilin',       bodyweight: 55,  country: '🇨🇳' },
  { userId: 'u16', displayName: 'Arjun Kapoor',      username: 'arjunfit',     bodyweight: 80,  country: '🇮🇳' },
  { userId: 'u17', displayName: 'Zara Khan',         username: 'zara_k',       bodyweight: 63,  country: '🇵🇰' },
  { userId: 'u18', displayName: 'Elias Johansson',   username: 'elias_j',      bodyweight: 90,  country: '🇸🇪' },
  { userId: 'u19', displayName: 'Nadia Okafor',      username: 'nadia_o',      bodyweight: 70,  country: '🇳🇬' },
  { userId: 'u20', displayName: 'Lukas Bauer',       username: 'lukas_b',      bodyweight: 83,  country: '🇦🇹' },
];

// Mock 1RM scores (bench-equivalent) for each athlete — seeded so they're deterministic
const BASE_1RMS = [185, 172, 168, 160, 155, 149, 142, 138, 132, 127, 122, 118, 112, 108, 104, 100, 96, 91, 87, 82];

// Mock post dates spread over the last 90 days
function mockDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

const MOCK_POST_DAYS = [0, 1, 2, 3, 5, 7, 8, 10, 12, 14, 18, 21, 25, 28, 32, 38, 45, 52, 60, 75];

export type TimeRange = 'all' | 'month' | 'week';

export function getLeaderboard(exerciseId: string, timeRange: TimeRange): LeaderboardEntry[] {
  // TODO: Supabase — replace body with:
  // const { data } = await supabase
  //   .from('leaderboard_scores')
  //   .select('*, profiles(display_name, username, country, bodyweight)')
  //   .eq('exercise_id', exerciseId)
  //   .order('est1rm', { ascending: false })
  //   .limit(50);
  // Apply timeRange filter: .gte('posted_at', cutoffDate)

  const scale = EXERCISE_SCALE[exerciseId] ?? 1.0;
  const cutoff = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : Infinity;

  return ATHLETES
    .map((a, i) => ({
      ...a,
      rank: 0,
      est1RM: Math.round(BASE_1RMS[i] * scale),
      postedAt: mockDate(MOCK_POST_DAYS[i]),
    }))
    .filter((e) => {
      if (cutoff === Infinity) return true;
      const daysAgo = (Date.now() - new Date(e.postedAt).getTime()) / 86400000;
      return daysAgo <= cutoff;
    })
    .sort((a, b) => b.est1RM - a.est1RM)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

export function submitScore(
  exerciseId: string,
  est1RM: number,
  displayName: string,
  username: string,
  bodyweight?: number,
): void {
  // TODO: Supabase — replace body with:
  // await supabase.from('leaderboard_scores').upsert({
  //   exercise_id: exerciseId,
  //   est1rm: est1RM,
  //   display_name: displayName,
  //   username,
  //   bodyweight,
  //   posted_at: new Date().toISOString(),
  // }, { onConflict: 'user_id,exercise_id' });

  console.log('[LeaderboardService] submitScore mock:', { exerciseId, est1RM, displayName, username, bodyweight });
}

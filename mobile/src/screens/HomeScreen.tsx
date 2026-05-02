import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from '@florida-lotto/shared';
import { trpc } from '../lib/trpc';
import { useDashboardState } from '../lib/DashboardStateProvider';
import { getRecentEventCount, gameLabel, isGameType } from '../lib/dashboardActivity';
import { colors, radii, space } from '../theme';
import type { MainTabParamList } from '../navigation/types';

const ACTIVE_GAMES = GAME_TYPES.filter((gt) => !FLORIDA_GAMES[gt].schedule.ended);

function formatShortDate(ms: number) {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function formatRelative(iso: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatShortDate(t);
}

type Nav = BottomTabNavigationProp<MainTabParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { state: dash, ready, refresh: refreshDash, recordResultCheck } = useDashboardState();
  const [refreshing, setRefreshing] = useState(false);

  const schedule = trpc.schedule.all.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  const dataHealth = trpc.schedule.dataHealth.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  const latestDraws = trpc.draws.latest.useQuery({ limit: 5 }, { refetchOnWindowFocus: true });
  const me = trpc.auth.me.useQuery(undefined, { retry: false });

  const defaultGame: GameType = dash.lastGamePicked ?? ACTIVE_GAMES[0];
  const recentPred = trpc.predictions.recent.useQuery(
    { gameType: defaultGame, limit: 3 },
    { refetchOnWindowFocus: true, enabled: ready },
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        schedule.refetch(),
        dataHealth.refetch(),
        latestDraws.refetch(),
        recentPred.refetch(),
        me.refetch(),
        refreshDash(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [schedule, dataHealth, latestDraws, recentPred, me, refreshDash]);

  const sessions7d = useMemo(() => {
    const min = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return dash.appSessions.filter((s) => new Date(s.at).getTime() >= min).length;
  }, [dash.appSessions]);

  const totalDrawRows = useMemo(() => {
    if (!dataHealth.data) return 0;
    return dataHealth.data.reduce((a, h) => a + (h.drawCount ?? 0), 0);
  }, [dataHealth.data]);

  const mostPickedGame = useMemo((): { game: GameType; n: number } | null => {
    let best: { game: GameType; n: number } | null = null;
    for (const [g, n] of Object.entries(dash.gamePickedCounts)) {
      if (!isGameType(g)) continue;
      const c = n ?? 0;
      if (!best || c > best.n) best = { game: g, n: c };
    }
    return best;
  }, [dash.gamePickedCounts]);

  const recentEvents = useMemo(
    () => [...dash.events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8),
    [dash.events],
  );

  const activity7d = getRecentEventCount(dash, 7 * 24 * 60 * 60 * 1000);

  const continueTarget = useMemo((): { tab: keyof MainTabParamList; params?: MainTabParamList['Analyze'] } => {
    const times: Array<{ t: number; target: { tab: keyof MainTabParamList; params?: MainTabParamList['Analyze'] } }> = [];
    if (dash.lastAnalyzeGenerateAt) {
      times.push({
        t: new Date(dash.lastAnalyzeGenerateAt).getTime(),
        target: { tab: 'Analyze', params: { focusGame: dash.lastGamePicked ?? undefined } },
      });
    }
    if (dash.lastResultCheckAt) {
      times.push({ t: new Date(dash.lastResultCheckAt).getTime(), target: { tab: 'Analyze' } });
    }
    if (dash.lastAnalysisAt) {
      times.push({
        t: new Date(dash.lastAnalysisAt).getTime(),
        target: { tab: 'Analyze', params: { focusGame: dash.lastGamePicked ?? undefined } },
      });
    }
    if (dash.lastGenerateAt) {
      times.push({ t: new Date(dash.lastGenerateAt).getTime(), target: { tab: 'Generate' } });
    }
    if (dash.lastTrackAt) {
      times.push({ t: new Date(dash.lastTrackAt).getTime(), target: { tab: 'Track' } });
    }
    if (times.length === 0) return { tab: 'Analyze' };
    times.sort((a, b) => b.t - a.t);
    return times[0]!.target;
  }, [dash]);

  const userLabel = me.isLoading
    ? 'Session…'
    : me.data
      ? (me.data.name || me.data.email || 'Signed in')
      : 'Not signed in';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Command center</Text>
          <Text style={styles.subtitle}>
            Florida forecasting workspace — live schedule, draws, and your session activity.
          </Text>
          <View style={styles.sessionRow}>
            <Ionicons name="person-circle-outline" size={16} color={colors.textSubtle} />
            <Text style={styles.sessionText}>{userLabel}</Text>
          </View>
        </View>

        {/* Summary tiles */}
        <Text style={styles.sectionLabel}>Session & data</Text>
        <View style={styles.tileGrid}>
          <StatCard
            label="Opens (7d)"
            value={String(sessions7d)}
            hint="App sessions on this device"
          />
          <StatCard
            label="Predictions run"
            value={String(dash.analyzeGenerateCount)}
            hint="Generate taps in Analyze"
          />
          <StatCard
            label="Result checks"
            value={String(dash.resultCheckCount)}
            hint="From this dashboard"
          />
          <StatCard
            label="Draw rows"
            value={dataHealth.isLoading ? '—' : String(totalDrawRows)}
            hint="Historical draws in data"
          />
        </View>

        <View style={styles.hairline} />

        {/* Quick actions */}
        <Text style={styles.sectionLabel}>Actions</Text>
        <View style={styles.actionCol}>
          <ActionRow
            icon="bar-chart"
            title="Analyze now"
            subtitle="Models, next draw, top predictions"
            onPress={() => navigation.navigate('Analyze', { focusGame: defaultGame })}
          />
          <ActionRow
            icon="list"
            title="Open Track"
            subtitle={dash.trackOpens === 0 ? 'No session history in Track yet' : 'Your tracking workspace'}
            onPress={() => {
              navigation.navigate('Track');
            }}
          />
          <ActionRow
            icon="color-wand"
            title="Generate"
            subtitle="Number selections (when available)"
            onPress={() => {
              navigation.navigate('Generate');
            }}
          />
          <ActionRow
            icon="arrow-redo"
            title="Continue latest activity"
            subtitle={`${continueTarget.tab}${continueTarget.params?.focusGame ? ' · ' + gameLabel(continueTarget.params.focusGame) : ''}`}
            onPress={() => {
              const t = continueTarget.tab;
              if (t === 'Analyze') {
                navigation.navigate('Analyze', continueTarget.params);
              } else if (t === 'Home') {
                navigation.navigate('Home');
              } else {
                navigation.navigate(t);
              }
            }}
          />
          <ActionRow
            icon="checkmark-done"
            title="Check results"
            subtitle="Open Analyze for schedule and model output"
            onPress={() => {
              recordResultCheck();
              navigation.navigate('Analyze', { focusGame: defaultGame });
            }}
          />
        </View>

        {/* Recent activity */}
        <View style={styles.hairline} />
        <Text style={styles.sectionLabel}>Recent activity</Text>
        {recentEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Your recent activity will appear here</Text>
            <Text style={styles.emptyBody}>
              Start in Analyze, run predictions, or open Track. Tab visits are summarized above; key actions
              are logged on this device.
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {recentEvents.map((e) => (
              <View key={e.id} style={styles.activityRow}>
                <View style={styles.activityText}>
                  <Text style={styles.activityLabel}>{e.label}</Text>
                  {e.detail ? <Text style={styles.activityDetail}>{e.detail}</Text> : null}
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    {e.source === 'result_check' ? 'Results' : e.source === 'analysis' ? 'Analysis' : 'Event'}
                  </Text>
                </View>
                <Text style={styles.activityTime}>{formatRelative(e.at)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Game / data snapshot */}
        <View style={styles.hairline} />
        <Text style={styles.sectionLabel}>Workspace snapshot</Text>
        <View style={styles.snapshotCard}>
          {mostPickedGame && mostPickedGame.n > 0 ? (
            <Text style={styles.snapshotLine}>
              <Text style={styles.snapshotKey}>Game focus: </Text>
              {FLORIDA_GAMES[mostPickedGame.game].name} · {mostPickedGame.n} game switches in Analyze
            </Text>
          ) : (
            <Text style={styles.snapshotLineMuted}>No game focus yet — select a game in Analyze.</Text>
          )}
          <Text style={styles.snapshotLine}>
            <Text style={styles.snapshotKey}>Last 7 days: </Text>
            {activity7d} recorded actions
          </Text>
          {recentPred.isLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.snapshotLineMuted}>Loading recent public predictions…</Text>
            </View>
          ) : recentPred.data && recentPred.data.length > 0 ? (
            <View style={styles.predBlock}>
              <Text style={styles.snapshotKey}>Recent system predictions · {FLORIDA_GAMES[defaultGame].name}</Text>
              {recentPred.data.map((p) => (
                <Text key={p.id} style={styles.predItem}>
                  {p.modelName}: {(p.mainNumbers as number[]).join(' · ')}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.snapshotLineMuted}>No on-server prediction rows to show for this game.</Text>
          )}
        </View>

        {/* Market data */}
        <View style={styles.hairline} />
        <Text style={styles.sectionLabel}>Data feed</Text>
        {latestDraws.isLoading ? (
          <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 12 }} />
        ) : latestDraws.isError ? (
          <Text style={styles.error}>Could not load latest draws.</Text>
        ) : (
          <View style={styles.listCard}>
            {(latestDraws.data ?? []).map((d) => (
              <View key={d.id} style={styles.drawRow}>
                <View>
                  <Text style={styles.drawGame}>{FLORIDA_GAMES[d.gameType as GameType]?.name ?? d.gameType}</Text>
                  <Text style={styles.drawNums}>
                    {(d.mainNumbers as number[]).join(' · ')}
                    {d.specialNumbers && (d.specialNumbers as number[]).length > 0
                      ? ' · ' + (d.specialNumbers as number[]).join(' · ')
                      : ''}
                  </Text>
                </View>
                <Text style={styles.drawDate}>{formatShortDate(d.drawDate)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.hairline} />
        <Text style={styles.sectionLabel}>Next draws</Text>
        {schedule.isLoading ? (
          <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 12 }} />
        ) : schedule.isError ? (
          <Text style={styles.error}>Could not load schedule.</Text>
        ) : (
          <View style={styles.scheduleCard}>
            {(schedule.data ?? [])
              .filter((r) => !r.schedule.ended)
              .slice(0, 5)
              .map((r) => (
                <View key={r.gameType} style={styles.schRow}>
                  <Text style={styles.schName}>{r.gameName}</Text>
                  <Text style={styles.schCount}>{r.countdown}</Text>
                </View>
              ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statHint}>{hint}</Text>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.75 }]}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl },

  header: { marginBottom: space.lg, marginTop: space.sm },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: 0.3 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  sessionText: { color: colors.textSubtle, fontSize: 13 },

  sectionLabel: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: space.md,
  },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.lg },
  statCard: {
    width: '47%',
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  statLabel: { color: colors.textSubtle, fontSize: 12, marginBottom: 4 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '700' },
  statHint: { color: colors.textSubtle, fontSize: 11, marginTop: 4, lineHeight: 14 },

  hairline: { height: 1, backgroundColor: colors.border, marginVertical: space.lg, opacity: 0.6 },

  actionCol: { gap: 0 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    gap: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  actionSub: { color: colors.textSubtle, fontSize: 13, marginTop: 2 },

  emptyCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
  },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyBody: { color: colors.textSubtle, fontSize: 14, lineHeight: 20 },

  listCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  activityText: { flex: 1, minWidth: 0 },
  activityLabel: { color: colors.text, fontSize: 14, fontWeight: '500' },
  activityDetail: { color: colors.textSubtle, fontSize: 12, marginTop: 2 },
  activityTime: { color: colors.textSubtle, fontSize: 12, width: 48, textAlign: 'right' },
  pill: {
    backgroundColor: colors.warningDim,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  pillText: { color: colors.warning, fontSize: 10, fontWeight: '600' },

  snapshotCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: 8,
  },
  snapshotLine: { color: colors.text, fontSize: 14, lineHeight: 20 },
  snapshotLineMuted: { color: colors.textSubtle, fontSize: 14, lineHeight: 20 },
  snapshotKey: { color: colors.textSubtle, fontWeight: '600' },
  inlineLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  predBlock: { marginTop: 4, gap: 4 },
  predItem: { color: colors.textMuted, fontSize: 13, fontFamily: 'System' },

  drawRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  drawGame: { color: colors.text, fontSize: 14, fontWeight: '600' },
  drawNums: { color: colors.textMuted, fontSize: 13, marginTop: 4, maxWidth: 220 },
  drawDate: { color: colors.textSubtle, fontSize: 12 },

  scheduleCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: 10,
  },
  schRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  schName: { color: colors.text, fontSize: 14, fontWeight: '500', flex: 1, paddingRight: 8 },
  schCount: { color: colors.accent, fontSize: 14, fontWeight: '600' },

  error: { color: colors.danger, fontSize: 14, marginVertical: 8 },
});

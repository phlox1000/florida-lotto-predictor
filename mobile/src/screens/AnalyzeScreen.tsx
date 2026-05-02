import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from '@florida-lotto/shared';
import { trpc } from '../lib/trpc';
import { useDashboardState } from '../lib/DashboardStateProvider';
import type { MainTabParamList } from '../navigation/types';

const ACTIVE_GAMES = GAME_TYPES.filter(gt => !FLORIDA_GAMES[gt].schedule.ended);

export default function AnalyzeScreen() {
  const route = useRoute<RouteProp<MainTabParamList, 'Analyze'>>();
  const { recordTabOpen, recordGamePicked, recordAnalyzeGenerate } = useDashboardState();
  const [selectedGame, setSelectedGame] = useState<GameType>(
    () => (route.params?.focusGame && ACTIVE_GAMES.includes(route.params.focusGame)
      ? route.params.focusGame
      : ACTIVE_GAMES[0]),
  );
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  const selectedGameRef = useRef(selectedGame);
  selectedGameRef.current = selectedGame;

  const schedule = trpc.schedule.next.useQuery(
    { gameType: selectedGame },
    { refetchOnWindowFocus: false },
  );

  const perfStats = trpc.performance.stats.useQuery(
    { gameType: selectedGame },
    { refetchOnWindowFocus: false },
  );

  const generate = trpc.predictions.generate.useMutation();

  const generateErrorCopy = useMemo(
    () =>
      generate.isError && generate.error ? getGenerateErrorCopy(generate.error) : null,
    [generate.isError, generate.error],
  );

  useEffect(() => {
    if (!schedule.isLoading) {
      setShowSlowWarning(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowWarning(true), 3000);
    return () => clearTimeout(timer);
  }, [schedule.isLoading]);

  useEffect(() => {
    const g = route.params?.focusGame;
    if (g && ACTIVE_GAMES.includes(g)) {
      setSelectedGame(g);
    }
  }, [route.params?.focusGame]);

  useFocusEffect(
    useCallback(() => {
      recordTabOpen('analyze', selectedGameRef.current);
    }, [recordTabOpen]),
  );

  // --- Predictions ---
  const generate = trpc.predictions.generate.useMutation();

  function handleGenerate() {
    generate.mutate(
      { gameType: selectedGame },
      {
        onSuccess: () => {
          recordAnalyzeGenerate(selectedGame);
        },
      },
    );
  }

  function handleSavePick(prediction: PredictionRow, sourceContext: string) {
    const input = createPickInput(prediction, sourceContext);
    const alreadySaved = isSaved(input);
    savePick(input);
    setActionMessage(alreadySaved
      ? 'This pick is already in your local ledger.'
      : 'Saved to your local ledger. Track can check it against available draw results.');
  }

  async function handleSharePick(prediction: PredictionRow) {
    const input = createPickInput(prediction, 'Analyze share');
    const score = formatScore(input.confidenceScore);
    const message = [
      `Florida Lotto Predictor - ${input.gameName}`,
      `Model: ${input.modelName}`,
      `Pick: ${formatPick(input.mainNumbers, input.specialNumbers)}`,
      score ? `Score: ${score}` : null,
      input.drawLabel ? `Draw context: ${input.drawLabel}` : null,
      'Generated from the current model response.',
    ].filter(Boolean).join('\n');

    try {
      await Share.share({ message });
      setActionMessage('Share sheet opened for the selected pick.');
    } catch {
      setActionMessage('Share was not completed.');
    }
  }

  // All predictions sorted by confidence descending
  const allSorted = useMemo(() =>
    generate.data?.predictions
      .slice()
      .sort((a, b) => b.confidenceScore - a.confidenceScore) ?? null,
    [generate.data?.predictions],
  );

  const signals = derivePredictionSignals(generate.data?.predictions);
  const topPick = signals.topPrediction;
  const topPickInput = topPick ? createPickInput(topPick, 'Analyze top pick') : null;
  const topPickSaved = topPickInput ? isSaved(topPickInput) : false;

  const maxScore = allSorted ? Math.max(...allSorted.map(p => p.confidenceScore), 1) : 100;
  const featuredPick = useMemo(() => {
    if (!allSorted || allSorted.length === 0) return null;
    const withAi = allSorted.filter(p => typeof p.aiScore === 'number' && Number.isFinite(p.aiScore));
    if (withAi.length > 0) {
      return withAi.slice().sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0))[0] ?? allSorted[0];
    }
    return allSorted[0];
  }, [allSorted]);

  // Build performance map keyed by modelName
  const perfMap = useMemo(() => {
    const map = new Map<string, {
      recentAccuracy: number | null;
      totalPredictions: number | null;
      winRate: number | null;
      trend: 'up' | 'down' | 'neutral' | null;
    }>();

    const weights = generate.data?.modelWeights ?? {};
    for (const stat of perfStats.data ?? []) {
      const w = weights[stat.modelName] ?? 0.5;
      map.set(stat.modelName, {
        recentAccuracy: typeof stat.avgMainHits === 'number' ? Number(stat.avgMainHits) : null,
        totalPredictions: typeof stat.totalPredictions === 'number' ? Number(stat.totalPredictions) : null,
        winRate: null,
        trend: w > 0.6 ? 'up' : w < 0.4 ? 'down' : 'neutral',
      });
    }
    return map;
  }, [perfStats.data, generate.data?.modelWeights]);

  // Top 3 are always visible; models 4+ fade in via showAllModels
  const top3 = allSorted?.slice(0, 3) ?? null;
  const rest = allSorted && allSorted.length > 3 ? allSorted.slice(3) : null;

  return (
    <Screen
      eyebrow="Florida Forecasting"
      title="Analyze"
      subtitle="Live draw context, model output, and signal summary."
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.selectorRow}
        contentContainerStyle={styles.selectorContent}
      >
        {ACTIVE_GAMES.map((gt, index) => (
          <InstrumentTab
            key={gt}
            label={FLORIDA_GAMES[gt].name}
            selected={selectedGame === gt}
            isLast={index === ACTIVE_GAMES.length - 1}
            onPress={() => {
              setSelectedGame(gt);
              recordGamePicked(gt);
              generate.reset();
            }}
          />
        ))}
      </ScrollView>

      {storageError ? (
        <StateBlock tone="warning" title="Local ledger warning" body={storageError} />
      ) : null}

      {/* Next Draw */}
      <Card>
        <SectionHeader
          eyebrow="Live schedule"
          title="Next Draw"
          caption={selectedGameName}
          right={<StatusPill label={schedule.isFetching && !schedule.isLoading ? 'Refresh' : 'Live'} tone="success" />}
        />

        {schedule.isLoading ? (
          <View style={{ gap: ui.spacing.md }}>
            <SkeletonCard />
          </View>
        ) : schedule.isError ? (
          <StateBlock
            tone="danger"
            title="Schedule unavailable"
            body={showSlowWarning ? 'Server connection is slow. Check your network.' : 'Could not load the draw schedule.'}
          />
        ) : (
          <>
            <View style={styles.countdownPanel}>
              <Text style={styles.countdownLabel}>Time to draw</Text>
              <Text style={styles.countdown}>{schedule.data?.countdown ?? 'Pending'}</Text>
            </View>
            <MetricRow label="Game" value={schedule.data?.gameName ?? selectedGameName} />
            <MetricRow label="Saved locally" value={`${savedPicks.length}`} />
          </>
        )}
      </Card>

      {/* Signal Summary */}
      <Card>
        <SectionHeader
          eyebrow="Current signal"
          title="Signal Summary"
          caption="Computed from the latest model output."
          right={<StatusPill label={topPick ? 'Current' : 'Awaiting'} tone={topPick ? 'accent' : 'neutral'} />}
        />

        {topPick ? (
          <>
            <View style={styles.signalHero}>
              <View style={styles.signalDot} />
              <View style={styles.signalText}>
                <Text style={styles.signalLabel}>Top-ranked signal</Text>
                <Text style={styles.signalModel}>{getModelDisplayName(topPick.modelName)}</Text>
              </View>
              {signals.topScoreLabel ? (
                <Text style={styles.signalScore}>{signals.topScoreLabel}</Text>
              ) : null}
            </View>

            <TerminalLabel>Main numbers</TerminalLabel>
            <View style={styles.numberRow}>
              {topPick.mainNumbers.map(number => (
                <NumberChip key={`signal-main-${number}`} value={number} large />
              ))}
            </View>

            {topPick.specialNumbers.length > 0 ? (
              <>
                <TerminalLabel style={{ marginTop: ui.spacing.md }}>Special</TerminalLabel>
                <View style={styles.numberRowCompact}>
                  {topPick.specialNumbers.map(number => (
                    <NumberChip key={`signal-special-${number}`} value={number} muted />
                  ))}
                </View>
              </>
            ) : null}

            <MetricRow label="Lead over #2" value={signals.leadLabel} />
            <MetricRow label="Consensus" value={signals.consensusLabel} />

            {signals.repeatedMainNumbers.length > 0 ? (
              <>
                <TerminalLabel style={{ marginTop: ui.spacing.md }}>Repeated across top 3</TerminalLabel>
                <View style={styles.repeatedRow}>
                  {signals.repeatedMainNumbers.slice(0, 5).map(item => (
                    <View key={`repeat-${item.number}`} style={styles.repeatedItem}>
                      <NumberChip value={item.number} />
                      <Text style={styles.repeatedCount}>{item.count}×</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {signals.repeatedSpecialNumbers.length > 0 ? (
              <MetricRow
                label="Special repeat"
                value={signals.repeatedSpecialNumbers
                  .slice(0, 3)
                  .map(item => `${item.number} (${item.count}×)`)
                  .join(', ')}
              />
            ) : null}
          </>
        ) : (
          <EmptyState
            icon="pulse-outline"
            headline="No signal data"
            description="Generate model output to reveal the top-ranked pick, lead, and repeated numbers."
          />
        )}
      </Card>

      {/* Ranked Signals — all models with top-3 default + expand */}
      <Card>
        <SectionHeader
          eyebrow="Model output"
          title="Ranked Signals"
          caption="All models ranked by confidence. Tap a row to expand."
          right={
            generate.data ? (
              <StatusPill label={generate.data.weightsUsed ? 'Weighted' : 'Generated'} tone="accent" />
            ) : (
              <StatusPill label="Ready" tone="neutral" />
            )
          }
        />

        <PrimaryButton
          label="Generate Analysis"
          onPress={handleGenerate}
          loading={generate.isPending}
          disabled={generate.isPending}
          style={styles.generateButton}
        />

        {generate.isError ? (
          <>
            {__DEV__ ? (
              <Text style={styles.debugStrip} selectable>
                {[
                  `code=${getTrpcErrorCode(generate.error) ?? 'n/a'}`,
                  `http=${getTrpcHttpStatus(generate.error) ?? 'n/a'}`,
                  generate.error?.message ?? '',
                ].join('\n')}
              </Text>
            ) : null}
            <StateBlock
              tone="danger"
              title={generateErrorCopy?.title ?? GENERATE_ERROR_FALLBACK.title}
              body={generateErrorCopy?.body ?? GENERATE_ERROR_FALLBACK.body}
            />
          </>
        ) : null}

        {!generate.isPending && !generate.isError && !allSorted ? (
          <EmptyState
            icon="bar-chart-outline"
            headline="No analysis run yet"
            description="Select a game and generate picks to review all 18 model outputs."
          />
        ) : null}

        {generate.isPending ? (
          <View style={styles.loadingStack}>
            <Text style={styles.loadingLabel}>Refreshing model outputs…</Text>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}

        {top3 && !generate.isPending ? (
          <>
            <Animated.View style={[styles.rankedHeaderWrap, { opacity: rankedFadeAnim }]}>
              <TerminalLabel>Ranked signals</TerminalLabel>
              <Text style={styles.rankedCaption}>Top 3 are shown first. Expand to review all models.</Text>
            </Animated.View>

            {/* Top 3 — always visible */}
            {top3.map((pred, index) => {
              const rank = index + 1;
              const input = createPickInput(pred, `Analyze rank ${rank}`);
              const perf = perfMap.get(pred.modelName) ?? null;
              return (
                <View style={styles.modelCardWrap}>
                <ModelSignalCard
                  key={`${pred.modelName}-${index}`}
                  rank={rank}
                  modelId={getModelDisplayName(pred.modelName)}
                  modelDescription={getModelDescription(pred.modelName)}
                  picks={pred.mainNumbers}
                  specialNumbers={pred.specialNumbers.length > 0 ? pred.specialNumbers : undefined}
                  confidenceScore={pred.confidenceScore}
                  maxScore={maxScore}
                  performance={perf}
                  isSaved={isSaved(input)}
                  isExpanded={expandedModelId === pred.modelName}
                  onToggleExpand={() =>
                    setExpandedModelId(prev => prev === pred.modelName ? null : pred.modelName)
                  }
                  onSave={() => handleSavePick(pred, `Analyze rank ${rank}`)}
                  onShare={() => handleSharePick(pred)}
                />
                </View>
              );
            })}

            {/* Models 4–N: fade in on expand */}
            {rest && rest.length > 0 ? (
              <>
                {showAllModels ? (
                  <Animated.View style={{ opacity: extraFadeAnim, gap: 0 }}>
                    {rest.map((pred, idx) => {
                      const rank = idx + 4;
                      const input = createPickInput(pred, `Analyze rank ${rank}`);
                      const perf = perfMap.get(pred.modelName) ?? null;
                      return (
                        <View style={styles.modelCardWrap}>
                        <ModelSignalCard
                          key={`${pred.modelName}-${idx}`}
                          rank={rank}
                          modelId={getModelDisplayName(pred.modelName)}
                          modelDescription={getModelDescription(pred.modelName)}
                          picks={pred.mainNumbers}
                          specialNumbers={pred.specialNumbers.length > 0 ? pred.specialNumbers : undefined}
                          confidenceScore={pred.confidenceScore}
                          maxScore={maxScore}
                          performance={perf}
                          isSaved={isSaved(input)}
                          isExpanded={expandedModelId === pred.modelName}
                          onToggleExpand={() =>
                            setExpandedModelId(prev => prev === pred.modelName ? null : pred.modelName)
                          }
                          onSave={() => handleSavePick(pred, `Analyze rank ${rank}`)}
                          onShare={() => handleSharePick(pred)}
                        />
                        </View>
                      );
                    })}
                  </Animated.View>
                ) : null}

                {/* Show All / Show Less toggle */}
                <PrimaryButton
                  label={showAllModels
                    ? 'Show Less ▲'
                    : `Show All ${allSorted!.length} Models ▼`}
                  onPress={toggleShowAll}
                  variant="secondary"
                  size="compact"
                  style={styles.showAllButton}
                />
              </>
            ) : null}

            {/* Ticket prep */}
            <View style={styles.actionPanel}>
              <TerminalLabel>Ticket prep</TerminalLabel>
              <View style={styles.actionRow}>
                <PrimaryButton
                  label={topPickSaved ? 'Top Pick Saved' : 'Save Top Pick'}
                  onPress={() => topPick ? handleSavePick(topPick, 'Analyze top pick') : undefined}
                  disabled={!topPickInput || topPickSaved}
                  size="compact"
                  style={styles.actionButton}
                />
                <PrimaryButton
                  label="View Track"
                  onPress={() => navigation?.navigate('Track')}
                  disabled={!navigation}
                  size="compact"
                  variant="secondary"
                  style={styles.actionButton}
                />
                <PrimaryButton
                  label="Share"
                  onPress={() => topPick ? handleSharePick(topPick) : undefined}
                  disabled={!topPickInput}
                  size="compact"
                  variant="secondary"
                  style={styles.actionButton}
                />
              </View>
              {actionMessage ? (
                <StateBlock title={actionMessage} tone={topPickSaved ? 'success' : 'neutral'} />
              ) : (
                <Text style={styles.localNote}>
                  Picks persist locally. Results are checked against fetched draw records.
                </Text>
              )}
            </View>
          </>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  selectorRow: {
    borderBottomWidth: 1,
    borderBottomColor: ui.colors.border,
    marginBottom: ui.spacing.lg,
    marginHorizontal: -ui.spacing.lg,
  },
  selectorContent: {},

  // Countdown — monospace + cyan, terminal data style
  countdownPanel: {
    backgroundColor: ui.colors.surfaceRaised,
    borderColor: ui.colors.border,
    borderRadius: ui.radii.md,
    borderWidth: 1,
    padding: ui.spacing.lg,
  },
  countdownLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: ui.colors.textSubtle,
    marginBottom: ui.spacing.xs,
  },
  countdown: {
    color: ui.colors.accent,
    fontSize: 36,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: -0.5,
  },

  // Signal hero
  signalHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ui.colors.surfaceRaised,
    borderColor: ui.colors.border,
    borderRadius: ui.radii.md,
    borderWidth: 1,
    gap: ui.spacing.md,
    marginBottom: ui.spacing.md,
    padding: ui.spacing.lg,
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ui.colors.success,
  },
  signalText: {
    flex: 1,
  },
  signalLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: ui.colors.textSubtle,
    marginBottom: ui.spacing.xs,
  },
  signalModel: {
    color: ui.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  signalScore: {
    color: ui.colors.accent,
    fontSize: 22,
    fontFamily: 'monospace',
    fontWeight: '900',
  },

  featuredCard: {
    backgroundColor: ui.colors.surfaceRaised,
    borderColor: ui.colors.success,
    borderWidth: 1,
    borderRadius: ui.radii.lg,
    padding: ui.spacing.lg,
    marginBottom: ui.spacing.xl,
    gap: ui.spacing.md,
    shadowColor: ui.colors.success,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  featuredHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  featuredEyebrow: {
    color: ui.colors.textSubtle,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  featuredModel: {
    color: ui.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  featuredReason: {
    color: ui.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  featuredExplanation: {
    color: ui.colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  featuredDisclaimer: {
    color: ui.colors.textSubtle,
    fontSize: 11,
    lineHeight: 16,
    marginTop: ui.spacing.xs,
  },

  generateButton: {
    marginBottom: ui.spacing.xl,
  },

  debugStrip: {
    fontFamily: 'monospace',
    fontSize: 10,
    lineHeight: 14,
    color: ui.colors.textMuted,
    marginBottom: ui.spacing.sm,
    padding: ui.spacing.sm,
    backgroundColor: ui.colors.surfaceRaised,
    borderRadius: ui.radii.sm,
    borderWidth: 1,
    borderColor: ui.colors.border,
  },

  numberRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.sm,
  },
  numberRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.sm,
  },
  repeatedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.md,
  },
  repeatedItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: ui.spacing.xs,
  },
  repeatedCount: {
    color: ui.colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },

  trustPanel: {
    backgroundColor: ui.colors.surfaceRaised,
    borderColor: ui.colors.border,
    borderWidth: 1,
    borderRadius: ui.radii.md,
    padding: ui.spacing.md,
    marginTop: -ui.spacing.xs,
    marginBottom: ui.spacing.lg,
    gap: ui.spacing.md,
  },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.xs,
  },
  trustExplanation: {
    color: ui.colors.text,
    fontSize: 12,
    lineHeight: 17,
  },
  trustFallback: {
    color: ui.colors.textSubtle,
    fontSize: 11,
    lineHeight: 16,
  },
  factorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.sm,
    marginTop: ui.spacing.xs,
  },
  factorItem: {
    color: ui.colors.accent,
    backgroundColor: ui.colors.accentSoft,
    borderColor: ui.colors.accent,
    borderWidth: 1,
    borderRadius: ui.radii.pill,
    overflow: 'hidden',
    paddingHorizontal: ui.spacing.sm,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: '700',
  },

  showAllButton: {
    marginTop: ui.spacing.lg,
    borderColor: '#2a2a3a',
    backgroundColor: 'transparent',
  },

  actionPanel: {
    borderTopWidth: 1,
    borderTopColor: ui.colors.border,
    marginTop: ui.spacing.lg,
    paddingTop: ui.spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    gap: ui.spacing.md,
    marginBottom: ui.spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  localNote: {
    color: ui.colors.textSubtle,
    fontSize: 11,
    lineHeight: 16,
  },
  loadingStack: {
    gap: ui.spacing.md,
    marginTop: ui.spacing.sm,
  },
  loadingLabel: {
    color: ui.colors.textSubtle,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  rankedHeaderWrap: {
    gap: ui.spacing.xs,
    marginBottom: ui.spacing.sm,
  },
  rankedCaption: {
    color: ui.colors.textSubtle,
    fontSize: 11,
    lineHeight: 16,
  },
  modelCardWrap: {
    marginBottom: ui.spacing.sm,
  },
});

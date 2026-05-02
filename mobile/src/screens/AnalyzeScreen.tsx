import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { FLORIDA_GAMES, GAME_TYPES, getModelDisplayName, type GameType } from '@florida-lotto/shared';
import {
  Card,
  EmptyState,
  InstrumentTab,
  MetricRow,
  ModelSignalCard,
  NumberChip,
  PrimaryButton,
  Screen,
  SectionHeader,
  SkeletonCard,
  StateBlock,
  StatusPill,
  TerminalLabel,
  ui,
} from '../components/ui';
import { formatBuildIdentity, getBuildIdentity } from '../lib/buildIdentity';
import { getModelDescription } from '../lib/modelDescriptions';
import { derivePredictionSignals } from '../lib/predictionSignals';
import { useSavedPicks, type SavePickInput } from '../lib/SavedPicksProvider';
import { trpc } from '../lib/trpc';

// Snapshot once at module load — runtimeVersion / updateId / commitSha are
// fixed for the lifetime of the JS bundle, no need to recompute per render.
const BUILD_IDENTITY_LINE = formatBuildIdentity(getBuildIdentity());

function extractTrpcErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  // @trpc/client TRPCClientError exposes the server-side code on .data.code.
  const data = (error as { data?: { code?: unknown } }).data;
  if (data && typeof data.code === 'string' && data.code.length > 0) {
    return data.code;
  }
  // Fallback for shape-mismatched / network errors that never reached tRPC.
  const shape = (error as { shape?: { data?: { code?: unknown } } }).shape;
  if (shape?.data && typeof shape.data.code === 'string' && shape.data.code.length > 0) {
    return shape.data.code;
  }
  return null;
}

const ACTIVE_GAMES = GAME_TYPES.filter(gt => !FLORIDA_GAMES[gt].schedule.ended);

type PredictionRow = {
  modelName: string;
  mainNumbers: number[];
  specialNumbers: number[];
  confidenceScore: number;
  aiScore?: number;
  confidenceLabel?: string;
  explanationSummary?: string;
  topSupportingFactors?: Array<{ key?: string; note?: string; contribution?: number }>;
  riskLevel?: string;
  modelAgreement?: number;
  tableLearningUsed?: boolean;
  learningWindowLabel?: string | null;
};

type AnalyzeScreenProps = {
  navigation?: {
    navigate: (screen: 'Track') => void;
  };
};

function formatScore(score: number | null | undefined) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return null;
  }
  return score >= 10 ? score.toFixed(0) : score.toFixed(1);
}

function formatPick(mainNumbers: number[], specialNumbers: number[]) {
  const main = mainNumbers.join(' - ');
  return specialNumbers.length > 0
    ? `${main} | Special ${specialNumbers.join(' - ')}`
    : main;
}

export default function AnalyzeScreen({ navigation }: AnalyzeScreenProps) {
  const [selectedGame, setSelectedGame] = useState<GameType>(ACTIVE_GAMES[0]);
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [showAllModels, setShowAllModels] = useState(false);
  const extraFadeAnim = useRef(new Animated.Value(0)).current;

  const selectedGameName = FLORIDA_GAMES[selectedGame].name;
  const { isSaved, savePick, savedPicks, storageError } = useSavedPicks();

  const schedule = trpc.schedule.next.useQuery(
    { gameType: selectedGame },
    { refetchOnWindowFocus: false },
  );

  const perfStats = trpc.performance.stats.useQuery(
    { gameType: selectedGame },
    { refetchOnWindowFocus: false },
  );

  useEffect(() => {
    if (!schedule.isLoading) {
      setShowSlowWarning(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowWarning(true), 3000);
    return () => clearTimeout(timer);
  }, [schedule.isLoading]);

  const generate = trpc.predictions.generate.useMutation();

  // Reset expanded/show-all state when game changes or new generation runs
  useEffect(() => {
    setExpandedModelId(null);
    setShowAllModels(false);
    extraFadeAnim.setValue(0);
  }, [selectedGame, extraFadeAnim]);

  useEffect(() => {
    if (generate.isSuccess) {
      setExpandedModelId(null);
      setShowAllModels(false);
      extraFadeAnim.setValue(0);
    }
  }, [generate.isSuccess, extraFadeAnim]);

  const toggleShowAll = useCallback(() => {
    if (!showAllModels) {
      setShowAllModels(true);
      Animated.timing(extraFadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(extraFadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => setShowAllModels(false));
    }
  }, [showAllModels, extraFadeAnim]);

  function createPickInput(prediction: PredictionRow, sourceContext: string): SavePickInput {
    const drawDate = schedule.data?.nextDraw ?? null;
    const drawLabel = schedule.data?.countdown
      ? `${schedule.data.gameName ?? selectedGameName}: ${schedule.data.countdown}`
      : schedule.data?.gameName ?? selectedGameName;

    return {
      gameType: selectedGame,
      gameName: generate.data?.gameName ?? schedule.data?.gameName ?? selectedGameName,
      modelName: prediction.modelName,
      mainNumbers: prediction.mainNumbers,
      specialNumbers: prediction.specialNumbers,
      confidenceScore: prediction.confidenceScore,
      notes: '',
      sourceContext,
      drawDate,
      drawLabel,
    };
  }

  function handleGenerate() {
    setActionMessage(null);
    generate.mutate({ gameType: selectedGame });
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
      <Text
        style={styles.buildIdentity}
        numberOfLines={1}
        accessibilityLabel="Build identity"
      >
        {BUILD_IDENTITY_LINE}
      </Text>

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
              setActionMessage(null);
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
            <StateBlock
              tone="danger"
              title={generate.error?.message?.includes('Too many') ? 'Rate limit active' : 'Generation failed'}
              body={
                generate.error?.message?.includes('Too many')
                  ? 'Wait a moment, then run the model set again.'
                  : 'The request did not complete. Check your connection and try again.'
              }
            />
            {/* Production-safe diagnostic: surface only the tRPC code (no
                message body, stack, or PII) so the user can read it back
                to support if Generate Analysis keeps failing. */}
            <Text style={styles.errorCode} numberOfLines={1}>
              {`code: ${extractTrpcErrorCode(generate.error) ?? 'UNKNOWN'}`}
            </Text>
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
          <View style={{ gap: ui.spacing.md, marginTop: ui.spacing.sm }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}

        {top3 && !generate.isPending ? (
          <>
            {featuredPick ? (
              <View style={styles.featuredCard}>
                <View style={styles.featuredHeader}>
                  <Text style={styles.featuredEyebrow}>Featured pick</Text>
                  <StatusPill label={typeof featuredPick.aiScore === 'number' ? `AI ${featuredPick.aiScore}` : 'Top-ranked'} tone="success" />
                </View>
                <Text style={styles.featuredModel}>{getModelDisplayName(featuredPick.modelName)}</Text>
                <Text style={styles.featuredReason}>
                  {typeof featuredPick.aiScore === 'number'
                    ? `Chosen for the highest aiScore in the current model set.`
                    : `Chosen as the highest-ranked available model output.`}
                </Text>
                <View style={styles.numberRow}>
                  {featuredPick.mainNumbers.map(number => (
                    <NumberChip key={`featured-main-${number}`} value={number} large />
                  ))}
                </View>
                {featuredPick.explanationSummary ? (
                  <Text style={styles.featuredExplanation} numberOfLines={3}>
                    {featuredPick.explanationSummary}
                  </Text>
                ) : (
                  <Text style={styles.trustFallback}>Explanation pending from API response.</Text>
                )}
                <Text style={styles.featuredDisclaimer}>
                  Lottery outcomes are random. Signals are informational only and do not guarantee results.
                </Text>
              </View>
            ) : null}

            <TerminalLabel>Ranked signals</TerminalLabel>

            {/* Top 3 — always visible */}
            {top3.map((pred, index) => {
              const rank = index + 1;
              const input = createPickInput(pred, `Analyze rank ${rank}`);
              const perf = perfMap.get(pred.modelName) ?? null;
              return (
                <View key={`${pred.modelName}-${index}`}>
                  <ModelSignalCard
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
                  <View style={styles.trustPanel}>
                    <View style={styles.trustRow}>
                      <StatusPill
                        label={typeof pred.aiScore === 'number' ? `AI ${pred.aiScore}` : 'AI score —'}
                        tone={typeof pred.aiScore === 'number' ? 'accent' : 'neutral'}
                      />
                      <StatusPill label={`Confidence ${pred.confidenceLabel ?? 'Pending'}`} tone="neutral" />
                      <StatusPill label={`Risk ${pred.riskLevel ?? 'Pending'}`} tone="warning" />
                    </View>
                    <MetricRow
                      label="Model agreement"
                      value={typeof pred.modelAgreement === 'number' ? `${(pred.modelAgreement * 100).toFixed(0)}%` : 'Pending'}
                    />
                    <MetricRow
                      label="Learning window"
                      value={pred.learningWindowLabel ?? (pred.tableLearningUsed ? 'Table-backed' : 'Event fallback')}
                    />
                    {pred.explanationSummary ? (
                      <Text style={styles.trustExplanation} numberOfLines={3}>{pred.explanationSummary}</Text>
                    ) : (
                      <Text style={styles.trustFallback}>Explanation pending from API response.</Text>
                    )}
                    <View style={styles.factorRow}>
                      {(pred.topSupportingFactors ?? []).slice(0, 3).map((factor, factorIdx) => (
                        <Text key={`${pred.modelName}-factor-${factorIdx}`} style={styles.factorItem}>
                          {(factor.note || factor.key || 'Signal').slice(0, 26)}
                        </Text>
                      ))}
                      {(!pred.topSupportingFactors || pred.topSupportingFactors.length === 0) ? (
                        <Text style={styles.trustFallback}>Supporting factors pending.</Text>
                      ) : null}
                    </View>
                  </View>
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
                        <View key={`${pred.modelName}-${idx}`}>
                          <ModelSignalCard
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
                          <View style={styles.trustPanel}>
                            <View style={styles.trustRow}>
                              <StatusPill
                                label={typeof pred.aiScore === 'number' ? `AI ${pred.aiScore}` : 'AI score —'}
                                tone={typeof pred.aiScore === 'number' ? 'accent' : 'neutral'}
                              />
                              <StatusPill label={`Confidence ${pred.confidenceLabel ?? 'Pending'}`} tone="neutral" />
                            </View>
                            {pred.explanationSummary ? (
                              <Text style={styles.trustExplanation} numberOfLines={2}>{pred.explanationSummary}</Text>
                            ) : (
                              <Text style={styles.trustFallback}>Explanation pending from API response.</Text>
                            )}
                          </View>
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
  buildIdentity: {
    color: ui.colors.textSubtle,
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 0.3,
    textAlign: 'left',
    marginTop: -ui.spacing.md,
    marginBottom: ui.spacing.md,
  },
  errorCode: {
    color: ui.colors.textSubtle,
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: ui.spacing.xs,
  },

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
    borderRadius: ui.radii.md,
    padding: ui.spacing.lg,
    marginBottom: ui.spacing.lg,
    gap: ui.spacing.sm,
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
    fontSize: 16,
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
    marginBottom: ui.spacing.lg,
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
    marginTop: -ui.spacing.sm,
    marginBottom: ui.spacing.md,
    gap: ui.spacing.sm,
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
    gap: ui.spacing.xs,
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
    gap: ui.spacing.sm,
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
});

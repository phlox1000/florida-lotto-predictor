import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from '@florida-lotto/shared';
import {
  AllocationBar,
  Card,
  EmptyState,
  InstrumentTab,
  MetricRow,
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
import { derivePredictionSignals } from '../lib/predictionSignals';
import { useSavedPicks, type SavePickInput } from '../lib/SavedPicksProvider';
import { trpc } from '../lib/trpc';

const ACTIVE_GAMES = GAME_TYPES.filter(gt => !FLORIDA_GAMES[gt].schedule.ended);

// Rank → color mapping for model performance dots
const RANK_COLORS = [ui.colors.success, ui.colors.accent, ui.colors.textMuted];

type PredictionRow = {
  modelName: string;
  mainNumbers: number[];
  specialNumbers: number[];
  confidenceScore: number;
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
  const selectedGameName = FLORIDA_GAMES[selectedGame].name;
  const { isSaved, savePick, savedPicks, storageError } = useSavedPicks();

  const schedule = trpc.schedule.next.useQuery(
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

  const top3 = generate.data?.predictions
    .slice()
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 3);
  const signals = derivePredictionSignals(generate.data?.predictions);
  const topPick = signals.topPrediction;
  const topPickInput = topPick ? createPickInput(topPick, 'Analyze top pick') : null;
  const topPickSaved = topPickInput ? isSaved(topPickInput) : false;

  // Max score for allocation bar scale
  const maxScore = top3 ? Math.max(...top3.map(p => p.confidenceScore), 1) : 100;

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
                <Text style={styles.signalModel}>{topPick.modelName}</Text>
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

      {/* Top Predictions */}
      <Card>
        <SectionHeader
          eyebrow="Model output"
          title="Top Predictions"
          caption="Ranked by confidence score."
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
          <StateBlock
            tone="danger"
            title={generate.error?.message?.includes('Too many') ? 'Rate limit active' : 'Generation failed'}
            body={
              generate.error?.message?.includes('Too many')
                ? 'Wait a moment, then run the model set again.'
                : 'The request did not complete. Check your connection and try again.'
            }
          />
        ) : null}

        {!generate.isPending && !generate.isError && !top3 ? (
          <EmptyState
            icon="bar-chart-outline"
            headline="No analysis run yet"
            description="Select a game and generate picks to review model outputs."
          />
        ) : null}

        {generate.isPending ? (
          <View style={{ gap: ui.spacing.md, marginTop: ui.spacing.sm }}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}

        {top3 && !generate.isPending ? (
          <>
            <TerminalLabel>Ranked signals</TerminalLabel>
            <View style={styles.predictionList}>
              {top3.map((pred, index) => {
                const input = createPickInput(pred, `Analyze rank ${index + 1}`);
                const saved = isSaved(input);
                const dotColor = RANK_COLORS[index] ?? ui.colors.textMuted;

                return (
                  <View key={`${pred.modelName}-${index}`} style={styles.predictionRow}>
                    <View style={styles.predictionHeader}>
                      <View style={styles.modelTitleGroup}>
                        <View style={[styles.modelDot, { backgroundColor: dotColor }]} />
                        <Text style={styles.rank}>#{index + 1}</Text>
                        <Text style={styles.modelName}>{pred.modelName}</Text>
                      </View>
                    </View>

                    <View style={styles.numberRow}>
                      {pred.mainNumbers.map(number => (
                        <NumberChip key={`${pred.modelName}-main-${number}`} value={number} />
                      ))}
                    </View>

                    {pred.specialNumbers.length > 0 ? (
                      <View style={styles.specialRow}>
                        <Text style={styles.specialLabel}>Special</Text>
                        <View style={styles.numberRowCompact}>
                          {pred.specialNumbers.map(number => (
                            <NumberChip key={`${pred.modelName}-special-${number}`} value={number} muted />
                          ))}
                        </View>
                      </View>
                    ) : null}

                    <AllocationBar
                      score={pred.confidenceScore}
                      maxScore={maxScore}
                      label="Confidence"
                    />

                    <View style={styles.rowActions}>
                      <PrimaryButton
                        label={saved ? 'Saved' : 'Save'}
                        onPress={() => handleSavePick(pred, `Analyze rank ${index + 1}`)}
                        disabled={saved}
                        size="compact"
                        style={styles.rowAction}
                      />
                      <PrimaryButton
                        label="Share"
                        onPress={() => handleSharePick(pred)}
                        size="compact"
                        variant="secondary"
                        style={styles.rowAction}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

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

  generateButton: {
    marginBottom: ui.spacing.lg,
  },

  predictionList: {
    gap: ui.spacing.lg,
  },
  predictionRow: {
    borderTopWidth: 1,
    borderTopColor: ui.colors.border,
    paddingTop: ui.spacing.lg,
  },
  predictionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: ui.spacing.md,
    marginBottom: ui.spacing.md,
  },
  modelTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ui.spacing.sm,
  },
  modelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rank: {
    color: ui.colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  modelName: {
    color: ui.colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
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
  specialRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: ui.spacing.md,
    marginTop: ui.spacing.md,
  },
  specialLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: ui.colors.textSubtle,
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
  rowActions: {
    flexDirection: 'row',
    gap: ui.spacing.sm,
    marginTop: ui.spacing.md,
  },
  rowAction: {
    flex: 1,
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

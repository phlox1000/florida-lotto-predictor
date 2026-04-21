import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from '@florida-lotto/shared';
import {
  Card,
  Chip,
  MetricRow,
  NumberChip,
  PrimaryButton,
  Screen,
  SectionHeader,
  StateBlock,
  StatusPill,
  ui,
} from '../components/ui';
import { derivePredictionSignals } from '../lib/predictionSignals';
import { useSavedPicks, type SavePickInput } from '../lib/SavedPicksProvider';
import { trpc } from '../lib/trpc';

const ACTIVE_GAMES = GAME_TYPES.filter(gt => !FLORIDA_GAMES[gt].schedule.ended);

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

  return (
    <Screen
      eyebrow="Florida Forecasting"
      title="Analyze"
      subtitle="A daily decision dashboard for live draw context, model output, and saved ticket prep."
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.selectorRow}
        contentContainerStyle={styles.selectorContent}
      >
        {ACTIVE_GAMES.map(gt => (
          <Chip
            key={gt}
            label={FLORIDA_GAMES[gt].name}
            selected={selectedGame === gt}
            onPress={() => {
              setSelectedGame(gt);
              setActionMessage(null);
              generate.reset();
            }}
          />
        ))}
      </ScrollView>

      {storageError ? (
        <StateBlock
          tone="warning"
          title="Local ledger warning"
          body={storageError}
        />
      ) : null}

      <Card>
        <SectionHeader
          eyebrow="Live schedule"
          title="Next Draw"
          caption={selectedGameName}
          right={<StatusPill label={schedule.isFetching && !schedule.isLoading ? 'Refresh' : 'Live'} tone="success" />}
        />

        {schedule.isLoading ? (
          <StateBlock
            loading
            tone="accent"
            title={showSlowWarning ? 'Connecting to server' : 'Loading schedule'}
            body="Retrieving the latest draw window."
          />
        ) : schedule.isError ? (
          <StateBlock
            tone="danger"
            title="Schedule unavailable"
            body="Could not load the draw schedule. Check your connection and try again."
          />
        ) : (
          <>
            <View style={styles.countdownPanel}>
              <Text style={styles.countdownLabel}>Countdown</Text>
              <Text style={styles.countdown}>{schedule.data?.countdown ?? 'Pending'}</Text>
            </View>
            <MetricRow label="Game" value={schedule.data?.gameName ?? selectedGameName} />
            <MetricRow label="Saved locally" value={`${savedPicks.length} pick${savedPicks.length === 1 ? '' : 's'}`} />
          </>
        )}
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Current signal"
          title="Signal Summary"
          caption="Computed locally from the latest generated model output."
          right={<StatusPill label={topPick ? 'Current' : 'Awaiting'} tone={topPick ? 'accent' : 'neutral'} />}
        />

        {topPick ? (
          <>
            <View style={styles.signalHero}>
              <View style={styles.signalText}>
                <Text style={styles.signalLabel}>Top-ranked pick</Text>
                <Text style={styles.signalModel}>{topPick.modelName}</Text>
              </View>
              {signals.topScoreLabel ? (
                <StatusPill label={`Score ${signals.topScoreLabel}`} tone="accent" />
              ) : null}
            </View>

            <View style={styles.numberRow}>
              {topPick.mainNumbers.map(number => (
                <NumberChip key={`signal-main-${number}`} value={number} />
              ))}
            </View>

            {topPick.specialNumbers.length > 0 ? (
              <View style={styles.specialRow}>
                <Text style={styles.specialLabel}>Special</Text>
                <View style={styles.numberRowCompact}>
                  {topPick.specialNumbers.map(number => (
                    <NumberChip key={`signal-special-${number}`} value={number} muted />
                  ))}
                </View>
              </View>
            ) : null}

            <MetricRow label="Lead over next model" value={signals.leadLabel} />
            <MetricRow label="Consensus read" value={signals.consensusLabel} />

            {signals.repeatedMainNumbers.length > 0 ? (
              <View style={styles.repeatedBlock}>
                <Text style={styles.repeatedLabel}>Repeated across top 3</Text>
                <View style={styles.repeatedRow}>
                  {signals.repeatedMainNumbers.slice(0, 5).map(item => (
                    <View key={`repeat-${item.number}`} style={styles.repeatedItem}>
                      <NumberChip value={item.number} />
                      <Text style={styles.repeatedCount}>{item.count}x</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {signals.repeatedSpecialNumbers.length > 0 ? (
              <MetricRow
                label="Special repeat"
                value={signals.repeatedSpecialNumbers
                  .slice(0, 3)
                  .map(item => `${item.number} (${item.count}x)`)
                  .join(', ')}
              />
            ) : null}
          </>
        ) : (
          <StateBlock
            title="Generate to reveal the current signal"
            body="The summary will highlight the top-ranked pick, model lead, and repeated numbers using only the returned model output."
          />
        )}
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Model output"
          title="Top Predictions"
          caption="Ranked from the current server response."
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
          <StateBlock
            title="No analysis run yet"
            body="Generate model picks for the selected game to review the top-ranked outputs."
          />
        ) : null}

        {top3 ? (
          <>
            <View style={styles.predictionList}>
              {top3.map((pred, index) => {
                const score = formatScore(pred.confidenceScore);
                const input = createPickInput(pred, `Analyze rank ${index + 1}`);
                const saved = isSaved(input);

                return (
                  <View key={`${pred.modelName}-${index}`} style={styles.predictionRow}>
                    <View style={styles.predictionHeader}>
                      <View style={styles.modelTitleGroup}>
                        <Text style={styles.rank}>#{index + 1}</Text>
                        <Text style={styles.modelName}>{pred.modelName}</Text>
                      </View>
                      {score ? <StatusPill label={`Score ${score}`} tone="neutral" /> : null}
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
              <SectionHeader
                eyebrow="Ticket prep"
                title="Next action"
                caption="Save selected model output into your private local ledger, then check outcomes in Track."
              />
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
                  Saved picks persist locally on this device. Result checks compare against fetched draw records when available.
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
    marginHorizontal: -ui.spacing.lg,
  },
  selectorContent: {
    gap: ui.spacing.sm,
    paddingHorizontal: ui.spacing.lg,
  },
  countdownPanel: {
    backgroundColor: ui.colors.backgroundRaised,
    borderColor: ui.colors.borderMuted,
    borderRadius: ui.radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: ui.spacing.lg,
  },
  countdownLabel: {
    color: ui.colors.textSubtle,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: ui.spacing.xs,
  },
  countdown: {
    color: ui.colors.text,
    fontSize: 34,
    fontWeight: '900',
  },
  signalHero: {
    alignItems: 'flex-start',
    backgroundColor: ui.colors.backgroundRaised,
    borderColor: ui.colors.borderMuted,
    borderRadius: ui.radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: ui.spacing.md,
    justifyContent: 'space-between',
    marginBottom: ui.spacing.md,
    padding: ui.spacing.lg,
  },
  signalText: {
    flex: 1,
  },
  signalLabel: {
    color: ui.colors.textSubtle,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: ui.spacing.xs,
    textTransform: 'uppercase',
  },
  signalModel: {
    color: ui.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  generateButton: {
    marginBottom: ui.spacing.lg,
  },
  predictionList: {
    gap: ui.spacing.md,
  },
  predictionRow: {
    borderTopColor: ui.colors.borderMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: ui.spacing.md,
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
  rank: {
    color: ui.colors.accentStrong,
    fontSize: 12,
    fontWeight: '900',
  },
  modelName: {
    color: ui.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
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
    color: ui.colors.textSubtle,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  repeatedBlock: {
    borderTopColor: ui.colors.borderMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: ui.spacing.md,
    paddingTop: ui.spacing.md,
  },
  repeatedLabel: {
    color: ui.colors.textSubtle,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: ui.spacing.sm,
    textTransform: 'uppercase',
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
    fontSize: 12,
    fontWeight: '800',
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
    borderTopColor: ui.colors.borderMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
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
    fontSize: 12,
    lineHeight: 17,
  },
});

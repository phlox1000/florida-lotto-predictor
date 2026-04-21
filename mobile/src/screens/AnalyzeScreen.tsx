import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { trpc } from '../lib/trpc';

const ACTIVE_GAMES = GAME_TYPES.filter(gt => !FLORIDA_GAMES[gt].schedule.ended);

function formatScore(score: number | null | undefined) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return null;
  }

  return score >= 10 ? score.toFixed(0) : score.toFixed(1);
}

export default function AnalyzeScreen() {
  const [selectedGame, setSelectedGame] = useState<GameType>(ACTIVE_GAMES[0]);
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  const selectedGameName = FLORIDA_GAMES[selectedGame].name;

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

  function handleGenerate() {
    generate.mutate({ gameType: selectedGame });
  }

  const top3 = generate.data?.predictions
    .slice()
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 3);

  return (
    <Screen
      eyebrow="Florida Forecasting"
      title="Analyze"
      subtitle="Live draw context and model-ranked picks for the selected game."
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
              generate.reset();
            }}
          />
        ))}
      </ScrollView>

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
          </>
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
          <View style={styles.predictionList}>
            {top3.map((pred, index) => {
              const score = formatScore(pred.confidenceScore);

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
                </View>
              );
            })}
          </View>
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
});

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from '@florida-lotto/shared';
import {
  Card,
  Chip,
  FeatureRow,
  MetricRow,
  PrimaryButton,
  Screen,
  SectionHeader,
  StateBlock,
  StatusPill,
  ui,
} from '../components/ui';
import { useSavedPicks } from '../lib/SavedPicksProvider';
import { deriveLedgerStats } from '../lib/ticketGrading';

const ACTIVE_GAMES = GAME_TYPES.filter(gt => !FLORIDA_GAMES[gt].schedule.ended);

type GenerateScreenProps = {
  navigation?: {
    navigate: (screen: 'Analyze' | 'Track') => void;
  };
};

function formatSavedDate(savedAt: string) {
  const parsed = new Date(savedAt);

  if (Number.isNaN(parsed.getTime())) {
    return 'Saved locally';
  }

  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function GenerateScreen({ navigation }: GenerateScreenProps) {
  const [selectedGame, setSelectedGame] = useState<GameType>(ACTIVE_GAMES[0]);
  const { isLoaded, savedPicks } = useSavedPicks();
  const selectedGameName = FLORIDA_GAMES[selectedGame].name;
  const savedForGame = savedPicks.filter(pick => pick.gameType === selectedGame);
  const latestForGame = savedForGame[0] ?? null;
  const stats = useMemo(() => deriveLedgerStats(savedPicks), [savedPicks]);
  const selectedGameStats = stats.byGame.find(item => item.key === selectedGame);

  const modelCountForGame = useMemo(() => {
    const models = new Set(savedForGame.map(pick => pick.modelName));
    return models.size;
  }, [savedForGame]);

  return (
    <Screen
      eyebrow="Generation"
      title="Generate"
      subtitle="A staging surface for repeatable pick generation and ticket preparation."
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
            onPress={() => setSelectedGame(gt)}
          />
        ))}
      </ScrollView>

      <Card>
        <SectionHeader
          eyebrow="Game context"
          title={selectedGameName}
          caption="Analyze remains the live generation path. This screen prepares the durable workflow around it."
          right={<StatusPill label={isLoaded ? 'Local' : 'Loading'} tone={isLoaded ? 'accent' : 'neutral'} />}
        />

        <View style={styles.summaryGrid}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{savedForGame.length}</Text>
            <Text style={styles.summaryLabel}>Saved</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{selectedGameStats?.checked ?? 0}</Text>
            <Text style={styles.summaryLabel}>Checked</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{selectedGameStats?.pending ?? 0}</Text>
            <Text style={styles.summaryLabel}>Pending</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{savedForGame.filter(pick => pick.sourceType !== 'generated').length}</Text>
            <Text style={styles.summaryLabel}>Imported</Text>
          </View>
        </View>

        {latestForGame ? (
          <>
            <MetricRow label="Latest saved model" value={latestForGame.modelName} />
            <MetricRow label="Latest save" value={formatSavedDate(latestForGame.savedAt)} />
            <MetricRow label="Model sources" value={`${modelCountForGame}`} />
          </>
        ) : (
          <StateBlock
            title="No saved picks for this game yet"
            body="Use Analyze to generate and save a pick. It will appear here as local generation context."
          />
        )}
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Control layers"
          title="Generation workflow"
          caption="Real controls will graduate here as each action is connected."
        />

        <FeatureRow
          title="Analyze live output"
          detail="Current working path for API-backed predictions, signal summary, and local save."
          meta="Live"
        />
        <FeatureRow
          title="Review local picks"
          detail="Use Track to inspect saved picks, check official results, add notes, and update status."
          meta={savedPicks.length > 0 ? 'Active' : 'Ready'}
        />
        <FeatureRow
          title="Ticket set builder"
          detail="Future control surface after local result review and ticket prep mature."
          meta="Next"
        />

        <View style={styles.actionArea}>
          <View style={styles.actionRow}>
            <PrimaryButton
              label="Open Analyze"
              onPress={() => navigation?.navigate('Analyze')}
              disabled={!navigation}
              style={styles.actionButton}
            />
            <PrimaryButton
              label="Review Track"
              onPress={() => navigation?.navigate('Track')}
              disabled={!navigation}
              variant="secondary"
              style={styles.actionButton}
            />
          </View>
        </View>
      </Card>

      <Text style={styles.note}>
        This screen summarizes real local ledger activity and routes into live generation. It does not fabricate generated output.
      </Text>
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
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ui.spacing.md,
    marginBottom: ui.spacing.md,
  },
  summaryTile: {
    backgroundColor: ui.colors.backgroundRaised,
    borderColor: ui.colors.borderMuted,
    borderRadius: ui.radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '46%',
    flexGrow: 1,
    padding: ui.spacing.lg,
  },
  summaryValue: {
    color: ui.colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  summaryLabel: {
    color: ui.colors.textSubtle,
    fontSize: 12,
    fontWeight: '800',
    marginTop: ui.spacing.xs,
    textTransform: 'uppercase',
  },
  actionArea: {
    marginTop: ui.spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    gap: ui.spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  note: {
    color: ui.colors.textSubtle,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: ui.spacing.xs,
  },
});

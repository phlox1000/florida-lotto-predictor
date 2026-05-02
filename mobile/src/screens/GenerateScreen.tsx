import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useDashboardState } from '../lib/DashboardStateProvider';
import { colors } from '../theme';

export default function GenerateScreen() {
  const { recordTabOpen } = useDashboardState();
  useFocusEffect(
    useCallback(() => {
      recordTabOpen('generate', null);
    }, [recordTabOpen]),
  );
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
        {ACTIVE_GAMES.map((gt, index) => (
          <InstrumentTab
            key={gt}
            label={FLORIDA_GAMES[gt].name}
            selected={selectedGame === gt}
            isLast={index === ACTIVE_GAMES.length - 1}
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

        <TerminalLabel>Ledger snapshot</TerminalLabel>
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
          <EmptyState
            icon="bar-chart-outline"
            headline="No saved picks for this game"
            description="Use Analyze to generate and save a pick. It will appear here as local generation context."
            action="Open Analyze"
            onAction={() => navigation?.navigate('Analyze')}
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
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  title: { fontSize: 24, fontWeight: '600', color: colors.text },
});

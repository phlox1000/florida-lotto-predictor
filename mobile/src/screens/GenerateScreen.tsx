import { StyleSheet, Text, View } from 'react-native';
import {
  Card,
  FeatureRow,
  PrimaryButton,
  Screen,
  SectionHeader,
  StateBlock,
  StatusPill,
  ui,
} from '../components/ui';

export default function GenerateScreen() {
  return (
    <Screen
      eyebrow="Generation"
      title="Generate"
      subtitle="A dedicated workspace for building picks and ticket sets from live model output."
    >
      <Card>
        <SectionHeader
          eyebrow="Workspace"
          title="Pick generation"
          caption="Dedicated controls are staged here without inventing unavailable results."
          right={<StatusPill label="Starter" tone="warning" />}
        />

        <StateBlock
          tone="accent"
          title="Use Analyze for live model picks today"
          body="This tab is prepared for a fuller generation workflow. The working prediction mutation remains available from Analyze."
        />

        <View style={styles.actionArea}>
          <PrimaryButton label="Controls pending" disabled />
        </View>
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Planned surfaces"
          title="Generation tools"
          caption="These sections are product placeholders until wired to real actions."
        />

        <FeatureRow
          title="Smart picks"
          detail="Model-ranked picks for the selected Florida game."
          meta="Queued"
        />
        <FeatureRow
          title="Quick picks"
          detail="Randomized picks from the existing API surface when connected."
          meta="Queued"
        />
        <FeatureRow
          title="Budget tickets"
          detail="Ticket set generation with cost controls and ranked outputs."
          meta="Queued"
        />
      </Card>

      <Text style={styles.note}>
        No sample picks are shown here until this screen is connected to real responses.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionArea: {
    marginTop: ui.spacing.lg,
  },
  note: {
    color: ui.colors.textSubtle,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: ui.spacing.xs,
  },
});

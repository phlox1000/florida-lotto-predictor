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

export default function TrackScreen() {
  return (
    <Screen
      eyebrow="Results"
      title="Track"
      subtitle="Ticket tracking and outcome review will live here once saved tickets are connected."
    >
      <Card>
        <SectionHeader
          eyebrow="Ticket ledger"
          title="No saved tickets yet"
          caption="The ledger is intentionally empty until ticket capture is implemented."
          right={<StatusPill label="Empty" tone="neutral" />}
        />

        <StateBlock
          title="Generate picks to start tracking results"
          body="Saved ticket history, outcomes, and ROI summaries will appear here when real ticket data is available."
        />

        <View style={styles.actionArea}>
          <PrimaryButton label="Ticket logging pending" disabled variant="secondary" />
        </View>
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Dashboard slots"
          title="Tracking foundation"
          caption="Reserved areas for real ticket data. No estimated winnings or synthetic history are displayed."
        />

        <FeatureRow
          title="Open tickets"
          detail="Purchased entries awaiting a draw result."
          meta="Empty"
        />
        <FeatureRow
          title="Outcome review"
          detail="Win/loss status and result notes after draws are settled."
          meta="Pending"
        />
        <FeatureRow
          title="ROI summary"
          detail="Spend and return totals once real tracked tickets exist."
          meta="Pending"
        />
      </Card>

      <Text style={styles.note}>
        Tracking remains data-honest: this screen will stay empty until tickets are saved.
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

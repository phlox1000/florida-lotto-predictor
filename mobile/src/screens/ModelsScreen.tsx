import {
  Card,
  FeatureRow,
  Screen,
  SectionHeader,
  StateBlock,
  StatusPill,
} from '../components/ui';
import { MOBILE_BUILD_LABEL } from '../lib/version';

export default function ModelsScreen() {
  return (
    <Screen
      eyebrow="Intelligence"
      title="Models"
      subtitle="Model performance and product diagnostics for the forecasting prototype."
    >
      <Card>
        <SectionHeader
          eyebrow="Model insights"
          title="Performance view"
          caption="Model detail surfaces are reserved for real leaderboard and performance data."
          right={<StatusPill label="Prototype" tone="accent" />}
        />

        <StateBlock
          tone="accent"
          title="Model insights coming soon"
          body="Leaderboard, summary, and trend sections will show real backend data when connected."
        />
      </Card>

      <Card>
        <SectionHeader
          eyebrow="System"
          title="Prototype status"
          caption="Stable identity and version metadata are visible for device testing."
        />

        <FeatureRow
          title="Build identity"
          detail={MOBILE_BUILD_LABEL}
          meta="Active"
        />
        <FeatureRow
          title="Model leaderboard"
          detail="Ranked performance by game once the screen is wired to live data."
          meta="Queued"
        />
        <FeatureRow
          title="Performance summary"
          detail="Compact model health and historical outcome summaries."
          meta="Queued"
        />
      </Card>
    </Screen>
  );
}

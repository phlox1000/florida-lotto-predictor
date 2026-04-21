import { useMemo } from 'react';
import {
  Card,
  FeatureRow,
  MetricRow,
  Screen,
  SectionHeader,
  StateBlock,
  StatusPill,
} from '../components/ui';
import { useSavedPicks } from '../lib/SavedPicksProvider';
import { deriveLedgerStats } from '../lib/ticketGrading';
import { MOBILE_BUILD_LABEL } from '../lib/version';

export default function ModelsScreen() {
  const { isLoaded, savedPicks } = useSavedPicks();

  const stats = useMemo(() => deriveLedgerStats(savedPicks), [savedPicks]);
  const modelCounts = stats.byModel;
  const gameCounts = stats.byGame;
  const topModel = modelCounts[0] ?? null;
  const topGame = gameCounts[0] ?? null;

  return (
    <Screen
      eyebrow="Intelligence"
      title="Models"
      subtitle="Local diagnostics and model activity from saved picks on this device."
    >
      <Card>
        <SectionHeader
          eyebrow="Local prototype diagnostics"
          title="Model activity"
          caption="Counts are derived only from picks saved locally on this device."
          right={<StatusPill label={isLoaded ? 'Local' : 'Loading'} tone={isLoaded ? 'accent' : 'neutral'} />}
        />

        <MetricRow label="Saved picks" value={`${savedPicks.length}`} />
        <MetricRow label="Pending result" value={`${stats.pending}`} />
        <MetricRow label="Checked locally" value={`${stats.checked}`} />
        <MetricRow label="Generated / imported" value={`${stats.generated}/${stats.imported}`} />
        <MetricRow label="Marked won/lost" value={`${stats.won}/${stats.lost}`} />
        <MetricRow label="Build" value={MOBILE_BUILD_LABEL} />
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Saved output"
          title="Local model usage"
          caption="This is usage activity, not performance or accuracy."
        />

        {topModel ? (
          <>
            <FeatureRow
              title="Most saved model"
              detail={`${topModel.label} appears in ${topModel.count} saved pick${topModel.count === 1 ? '' : 's'} with ${topModel.checked} checked locally.`}
              meta="Local"
            />
            {modelCounts.slice(1, 4).map(item => (
              <FeatureRow
                key={item.label}
                title={item.label}
                detail={`${item.count} saved pick${item.count === 1 ? '' : 's'}; ${item.won} marked won and ${item.lost} marked lost locally.`}
                meta="Count"
              />
            ))}
          </>
        ) : (
          <StateBlock
            title="No saved model activity yet"
            body="Save generated picks from Analyze to build local diagnostics without inventing leaderboard data."
          />
        )}
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Game coverage"
          title="Saved picks by game"
          caption="Coverage comes from your local ledger only."
        />

        {topGame ? (
          gameCounts.slice(0, 5).map(item => (
            <FeatureRow
              key={item.label}
              title={item.label}
              detail={`${item.count} saved pick${item.count === 1 ? '' : 's'}; ${item.checked} checked against available draw results.`}
              meta="Local"
            />
          ))
        ) : (
          <StateBlock
            title="No game coverage yet"
            body="Saved picks will populate this diagnostic view."
          />
        )}
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Ingestion"
          title="Local source mix"
          caption="Sources identify how tickets entered the ledger; they are not performance claims."
        />

        {stats.bySource.length > 0 ? (
          stats.bySource.map(item => (
            <FeatureRow
              key={item.key}
              title={item.label}
              detail={`${item.count} ticket${item.count === 1 ? '' : 's'} with ${item.checked} checked against available draw results.`}
              meta="Local"
            />
          ))
        ) : (
          <StateBlock
            title="No source activity yet"
            body="Generated and manually entered tickets will populate this diagnostic view."
          />
        )}
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Match tiers"
          title="Local tier labels"
          caption="Tier labels come from match counts only. Payout amounts are not estimated."
        />

        {stats.prizeTiers.length > 0 ? (
          stats.prizeTiers.slice(0, 5).map(item => (
            <FeatureRow
              key={item.label}
              title={item.label}
              detail={`${item.count} checked ticket${item.count === 1 ? '' : 's'} in the local ledger.`}
              meta="Derived"
            />
          ))
        ) : (
          <StateBlock
            title="No checked tier labels yet"
            body="Run Check Results in Track after saved tickets have matching draw results."
          />
        )}
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Guardrail"
          title="Performance data not shown yet"
          caption="No fake accuracy, ROI, or win-rate metrics are displayed."
        />

        <FeatureRow
          title="Leaderboard"
          detail="Requires real model history and outcome data before it appears."
          meta="Future"
        />
        <FeatureRow
          title="Result quality"
          detail="Match summaries now come from local saved picks compared with fetched draw results."
          meta="Local"
        />
        <FeatureRow
          title="ROI"
          detail="Not shown until ticket cost and payout rules are fully reliable for saved entries."
          meta="Hidden"
        />
      </Card>
    </Screen>
  );
}

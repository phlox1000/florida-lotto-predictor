type PredictionLike = {
  modelName: string;
  mainNumbers: number[];
  specialNumbers: number[];
  confidenceScore: number;
};

export type PredictionSignalSummary = {
  topPrediction: PredictionLike | null;
  topScoreLabel: string | null;
  leadLabel: string;
  repeatedMainNumbers: Array<{ number: number; count: number }>;
  repeatedSpecialNumbers: Array<{ number: number; count: number }>;
  mostRepeatedMain: { number: number; count: number } | null;
  consensusLabel: string;
};

function formatScore(score: number | null | undefined) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return null;
  }

  return score >= 10 ? score.toFixed(0) : score.toFixed(1);
}

function countNumbers(numbers: number[]) {
  const counts = new Map<number, number>();

  numbers.forEach(number => {
    counts.set(number, (counts.get(number) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([number, count]) => ({ number, count }))
    .sort((a, b) => b.count - a.count || a.number - b.number);
}

export function derivePredictionSignals(predictions: PredictionLike[] | undefined): PredictionSignalSummary {
  if (!predictions || predictions.length === 0) {
    return {
      topPrediction: null,
      topScoreLabel: null,
      leadLabel: 'No generated output yet',
      repeatedMainNumbers: [],
      repeatedSpecialNumbers: [],
      mostRepeatedMain: null,
      consensusLabel: 'Generate picks to calculate a current signal.',
    };
  }

  const ranked = predictions.slice().sort((a, b) => b.confidenceScore - a.confidenceScore);
  const topPrediction = ranked[0] ?? null;
  const secondPrediction = ranked[1] ?? null;
  const topScoreLabel = formatScore(topPrediction?.confidenceScore);
  const leadScore = topPrediction && secondPrediction
    ? topPrediction.confidenceScore - secondPrediction.confidenceScore
    : null;
  const leadLabel = typeof leadScore === 'number' && Number.isFinite(leadScore)
    ? `${formatScore(leadScore) ?? '0'} over #2`
    : 'Only one model result available';
  const topThree = ranked.slice(0, 3);
  const repeatedMainNumbers = countNumbers(topThree.flatMap(prediction => prediction.mainNumbers))
    .filter(item => item.count > 1);
  const repeatedSpecialNumbers = countNumbers(topThree.flatMap(prediction => prediction.specialNumbers))
    .filter(item => item.count > 1);
  const mostRepeatedMain = repeatedMainNumbers[0] ?? null;

  return {
    topPrediction,
    topScoreLabel,
    leadLabel,
    repeatedMainNumbers,
    repeatedSpecialNumbers,
    mostRepeatedMain,
    consensusLabel: mostRepeatedMain
      ? `${mostRepeatedMain.number} appears in ${mostRepeatedMain.count} of the top 3 picks.`
      : 'No repeated main number across the top 3 picks.',
  };
}

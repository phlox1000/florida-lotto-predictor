import type { GameConfig, PredictionResult } from "../../shared/lottery";
import type { HistoryDraw } from "./types";

/**
 * Post-processing filter that validates predictions against historically observed
 * sum ranges. Predictions whose number sums fall outside the common range are
 * adjusted by swapping outlier numbers to bring the sum into range.
 *
 * This is NOT a standalone model — it's applied on top of existing predictions.
 * Can be toggled on/off by the user.
 */
export function applySumRangeFilter(
  predictions: PredictionResult[],
  cfg: GameConfig,
  history: HistoryDraw[]
): PredictionResult[] {
  if (history.length < 50 || cfg.isDigitGame) return predictions;

  const sums = history.map(d => d.mainNumbers.reduce((a, b) => a + b, 0));
  sums.sort((a, b) => a - b);

  const p10Index = Math.floor(sums.length * 0.10);
  const p90Index = Math.floor(sums.length * 0.90);
  const sumMin = sums[p10Index];
  const sumMax = sums[p90Index];
  const sumMean = sums.reduce((a, b) => a + b, 0) / sums.length;

  const midpoint = Math.ceil(cfg.mainMax / 2);

  return predictions.map(pred => {
    if (pred.mainNumbers.length === 0 || pred.metadata?.insufficient_data) {
      return pred;
    }

    const currentSum = pred.mainNumbers.reduce((a, b) => a + b, 0);
    let adjustedNumbers = [...pred.mainNumbers];
    let wasFiltered = false;
    let filterNotes: string[] = [];

    if (currentSum < sumMin || currentSum > sumMax) {
      wasFiltered = true;
      filterNotes.push(`Sum ${currentSum} outside range [${sumMin}-${sumMax}]`);

      const targetSum = sumMean;
      const diff = currentSum - targetSum;

      if (diff > 0) {
        adjustedNumbers.sort((a, b) => b - a);
        const largest = adjustedNumbers[0];
        const replacement = Math.max(1, largest - Math.round(diff));
        if (replacement >= 1 && replacement <= cfg.mainMax && !adjustedNumbers.includes(replacement)) {
          adjustedNumbers[0] = replacement;
        }
      } else {
        adjustedNumbers.sort((a, b) => a - b);
        const smallest = adjustedNumbers[0];
        const replacement = Math.min(cfg.mainMax, smallest + Math.round(Math.abs(diff)));
        if (replacement >= 1 && replacement <= cfg.mainMax && !adjustedNumbers.includes(replacement)) {
          adjustedNumbers[0] = replacement;
        }
      }
    }

    const oddCount = adjustedNumbers.filter(n => n % 2 !== 0).length;
    const idealOdd = Math.round(cfg.mainCount / 2);
    if (Math.abs(oddCount - idealOdd) > Math.ceil(cfg.mainCount / 3)) {
      filterNotes.push(`Odd/even imbalance: ${oddCount}/${cfg.mainCount - oddCount}`);
    }

    const highCount = adjustedNumbers.filter(n => n > midpoint).length;
    if (Math.abs(highCount - idealOdd) > Math.ceil(cfg.mainCount / 3)) {
      filterNotes.push(`High/low imbalance: ${highCount}/${cfg.mainCount - highCount}`);
    }

    adjustedNumbers.sort((a, b) => a - b);

    return {
      ...pred,
      mainNumbers: adjustedNumbers,
      metadata: {
        ...pred.metadata,
        sumRangeFilter: {
          applied: true,
          wasAdjusted: wasFiltered,
          originalSum: currentSum,
          adjustedSum: adjustedNumbers.reduce((a, b) => a + b, 0),
          acceptableRange: [sumMin, sumMax],
          historicalMean: Math.round(sumMean),
          notes: filterNotes,
        },
      },
    };
  });
}

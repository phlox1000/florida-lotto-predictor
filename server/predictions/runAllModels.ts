import type { GameConfig, PredictionResult } from "../../shared/lottery";
import type { HistoryDraw } from "./types";
import { frequencyBaselineModel, poissonModel } from "./models/frequencyPoisson";
import { hotColdModel, balancedHotColdModel, gapAnalysisModel, deltaModel } from "./models/hotColdGapDelta";
import { coOccurrenceModel, markovChainModel, quantumEntanglementModel } from "./models/cooccurrenceMarkovQuantum";
import { temporalEchoModel, monteCarloModel, bayesianModel } from "./models/temporalMonteCarloBayesian";
import { cdmModel, chiSquareModel } from "./models/cdmChiSquare";
import { aiOracleModel } from "./models/aiOracle";

/**
 * Run all 18 models. When modelWeights are provided (from historical accuracy tracking),
 * the AI Oracle ensemble uses them to weight models proportionally to their past performance.
 *
 * Models that lack sufficient historical data will return empty numbers with an
 * "insufficient_data" flag instead of generating fake random numbers.
 */
export function runAllModels(
  cfg: GameConfig,
  history: HistoryDraw[],
  modelWeights?: Record<string, number>
): PredictionResult[] {
  const siblingResults: PredictionResult[] = [
    frequencyBaselineModel(cfg, history),
    poissonModel(cfg, history, 50, "poisson_standard"),
    poissonModel(cfg, history, 20, "poisson_short"),
    poissonModel(cfg, history, 100, "poisson_long"),
    hotColdModel(cfg, history, 0.7, "hot_cold_70"),
    hotColdModel(cfg, history, 0.5, "hot_cold_50"),
    balancedHotColdModel(cfg, history),
    gapAnalysisModel(cfg, history),
    coOccurrenceModel(cfg, history),
    deltaModel(cfg, history),
    temporalEchoModel(cfg, history),
    monteCarloModel(cfg, history),
    markovChainModel(cfg, history),
    bayesianModel(cfg, history),
    quantumEntanglementModel(cfg, history),
    cdmModel(cfg, history),
    chiSquareModel(cfg, history),
  ];
  siblingResults.push(aiOracleModel(cfg, history, siblingResults, modelWeights));
  return siblingResults;
}

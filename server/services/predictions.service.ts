import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { runAllModels, applySumRangeFilter } from "../predictions";
import { getDrawResults, insertPredictions, getModelWeights } from "../db";

export async function generatePredictions(
  gameType: GameType,
  sumRangeFilter: boolean,
  userId?: number,
) {
  const cfg = FLORIDA_GAMES[gameType];
  const historyRows = await getDrawResults(gameType, 200);
  const history = historyRows.map(r => ({
    mainNumbers: r.mainNumbers as number[],
    specialNumbers: (r.specialNumbers as number[]) || [],
    drawDate: r.drawDate,
  }));

  const modelWeights = await getModelWeights(gameType);
  let allPredictions = runAllModels(cfg, history, Object.keys(modelWeights).length > 0 ? modelWeights : undefined);

  if (sumRangeFilter) {
    allPredictions = applySumRangeFilter(allPredictions, cfg, history);
  }

  if (userId) {
    try {
      await insertPredictions(allPredictions.map(p => ({
        userId,
        gameType,
        modelName: p.modelName,
        mainNumbers: p.mainNumbers,
        specialNumbers: p.specialNumbers,
        confidenceScore: p.confidenceScore,
        metadata: p.metadata,
      })));
    } catch (e) {
      console.warn("[Predictions] Failed to persist:", e);
    }
  }

  return {
    predictions: allPredictions,
    gameType,
    gameName: cfg.name,
    weightsUsed: Object.keys(modelWeights).length > 0,
    sumRangeFilterApplied: sumRangeFilter,
  };
}

interface GameConfig {
  mainCount: number;
  mainMax: number;
  specialCount: number;
  specialMax: number;
  isDigitGame: boolean;
}

export function generateQuickPicks(cfg: GameConfig, count: number) {
  const picks: Array<{ mainNumbers: number[]; specialNumbers: number[] }> = [];

  for (let i = 0; i < count; i++) {
    let mainNumbers: number[];
    if (cfg.isDigitGame) {
      mainNumbers = Array.from({ length: cfg.mainCount }, () => Math.floor(Math.random() * 10));
    } else {
      const pool = Array.from({ length: cfg.mainMax }, (_, j) => j + 1);
      mainNumbers = [];
      for (let j = 0; j < cfg.mainCount; j++) {
        const idx = Math.floor(Math.random() * pool.length);
        mainNumbers.push(pool[idx]);
        pool.splice(idx, 1);
      }
      mainNumbers.sort((a, b) => a - b);
    }

    let specialNumbers: number[] = [];
    if (cfg.specialCount > 0) {
      const specPool = Array.from({ length: cfg.specialMax }, (_, j) => j + 1);
      for (let j = 0; j < cfg.specialCount; j++) {
        const idx = Math.floor(Math.random() * specPool.length);
        specialNumbers.push(specPool[idx]);
        specPool.splice(idx, 1);
      }
      specialNumbers.sort((a, b) => a - b);
    }

    picks.push({ mainNumbers, specialNumbers });
  }

  return picks;
}

import { eq } from "drizzle-orm";
import { modelPerformance, drawResults, predictions } from "../../drizzle/schema";
import { getDb, getDrawResults, getModelPerformanceStats } from "../db";

export async function getCompareResults(gameType: string, limit: number) {
  const drawRows = await getDrawResults(gameType, limit);
  const perfStats = await getModelPerformanceStats(gameType);

  const comparisons = drawRows.map(draw => ({
    drawId: draw.id,
    gameType: draw.gameType,
    drawDate: draw.drawDate,
    drawTime: draw.drawTime,
    mainNumbers: draw.mainNumbers as number[],
    specialNumbers: (draw.specialNumbers as number[]) || [],
  }));

  const modelSummary = perfStats.map(s => ({
    modelName: s.modelName,
    totalEvaluated: Number(s.totalPredictions) || 0,
    avgMainHits: Number(Number(s.avgMainHits).toFixed(2)),
    avgSpecialHits: Number(Number(s.avgSpecialHits).toFixed(2)),
    maxMainHits: Number(s.maxMainHits) || 0,
  }));

  return { comparisons, modelSummary, gameType };
}

export async function getDrawDetail(drawId: number) {
  const db = await getDb();
  if (!db) return { draw: null, modelResults: [] };

  const drawRow = await db.select().from(drawResults).where(eq(drawResults.id, drawId)).limit(1);
  if (drawRow.length === 0) return { draw: null, modelResults: [] };
  const draw = drawRow[0];

  const perfRows = await db.select({
    modelName: modelPerformance.modelName,
    mainHits: modelPerformance.mainHits,
    specialHits: modelPerformance.specialHits,
    predictionId: modelPerformance.predictionId,
  }).from(modelPerformance)
    .where(eq(modelPerformance.drawResultId, drawId));

  const modelResults = await Promise.all(perfRows.map(async (perf) => {
    let predNumbers: { main: number[]; special: number[] } = { main: [], special: [] };
    if (perf.predictionId) {
      const predRow = await db.select().from(predictions).where(eq(predictions.id, perf.predictionId)).limit(1);
      if (predRow.length > 0) {
        predNumbers = {
          main: predRow[0].mainNumbers as number[],
          special: (predRow[0].specialNumbers as number[]) || [],
        };
      }
    }
    return {
      modelName: perf.modelName,
      mainHits: perf.mainHits,
      specialHits: perf.specialHits,
      predictedMain: predNumbers.main,
      predictedSpecial: predNumbers.special,
    };
  }));

  return {
    draw: {
      id: draw.id,
      gameType: draw.gameType,
      drawDate: draw.drawDate,
      mainNumbers: draw.mainNumbers as number[],
      specialNumbers: (draw.specialNumbers as number[]) || [],
    },
    modelResults: modelResults.sort((a, b) => b.mainHits - a.mainHits),
  };
}

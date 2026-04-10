import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { notifyOwner } from "../_core/notification";
import { insertDrawResult, evaluatePredictionsAgainstDraw } from "../db";

export async function addManualDraw(input: {
  gameType: GameType;
  drawDate: number;
  mainNumbers: number[];
  specialNumbers: number[];
  drawTime?: string;
}) {
  const result = await insertDrawResult({
    gameType: input.gameType,
    drawDate: input.drawDate,
    mainNumbers: input.mainNumbers,
    specialNumbers: input.specialNumbers,
    drawTime: input.drawTime,
    source: "manual",
  });

  const drawId = (result as any)?.[0]?.insertId ?? 0;
  try {
    const evalResult = await evaluatePredictionsAgainstDraw(
      drawId,
      input.gameType,
      input.mainNumbers,
      input.specialNumbers,
    );

    if (evalResult.highAccuracy > 3) {
      await notifyOwner({
        title: "High Prediction Accuracy Detected",
        content: `${evalResult.highAccuracy} predictions matched 60%+ of the latest ${FLORIDA_GAMES[input.gameType].name} draw (${input.mainNumbers.join(", ")}). ${evalResult.evaluated} total predictions evaluated.`,
      });
    }
  } catch (e) {
    console.warn("[Draws] Auto-evaluation failed:", e);
  }

  return { success: true };
}

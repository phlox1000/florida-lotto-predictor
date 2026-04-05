import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { runAllModels, selectBudgetTickets } from "../predictions";
import { scorePlayTonightTickets } from "../play-tonight";
import { getDrawResults, getModelWeights, insertTicketSelection } from "../db";

export async function generateTickets(
  gameType: GameType,
  budget: number,
  maxTickets: number,
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
  const allPredictions = runAllModels(cfg, history, Object.keys(modelWeights).length > 0 ? modelWeights : undefined);
  const selection = selectBudgetTickets(cfg, allPredictions, budget, maxTickets);

  const scoredTickets = scorePlayTonightTickets(
    selection.tickets,
    allPredictions,
    modelWeights,
    cfg,
    history.map(h => ({ mainNumbers: h.mainNumbers })),
  );

  if (userId) {
    try {
      await insertTicketSelection({
        userId,
        gameType,
        budget,
        ticketCount: selection.tickets.length,
        tickets: selection.tickets,
      });
    } catch (e) {
      console.warn("[Tickets] Failed to persist:", e);
    }
  }

  return {
    tickets: scoredTickets,
    totalCost: selection.totalCost,
    gameType,
    gameName: cfg.name,
    ticketPrice: cfg.ticketPrice,
  };
}

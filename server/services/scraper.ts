import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { drawsTable } from '../drizzle/schema';
import { retry } from 'radash';
import { Agent } from 'https';

const officialEndpoints: Record<string, string> = {
  'Florida Lotto': 'https://www.flalottery.com/floridalotto/officialdraws',
  'Powerball': 'https://powerball.com/officialdraws',
  // Add other games as needed
};

export const fetchOfficialDraws = async (game: string) => {
  const endpoint = officialEndpoints[game];
  if (!endpoint) throw new Error('Endpoint not found');

  return retry(
    async () => {
      const response = await fetch(endpoint, {
        headers: { 'User-Agent': 'Florida-Lotto-Predictor/1.0' },
        agent: new Agent({ keepAlive: true }),
      });
      if (!response.ok) throw new Error(`Rate limited: ${response.status}`);
      const draws = await response.json();
      return draws;
    },
    { backoff: 'exponential', retries: 3 },
  );
};

export const updateDraws = async (game: string) => {
  const draws = await fetchOfficialDraws(game);
  await db.transaction(async (tx) => {
    await tx.insert(drawsTable).values(draws);
    // Add indexing here if needed
  });
  return { success: true, draws: draws.length };
};

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '10 s'),
});

export const checkRateLimit = async (identifier: string) => {
  const { success } = await ratelimit.limit(identifier);
  if (!success) throw new Error('Rate limit exceeded');
  return true;
};
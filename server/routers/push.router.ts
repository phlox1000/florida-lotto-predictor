import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { upsertPushSubscription, getUserPushSubscription, updatePushPreferences } from "../db";

export const pushRouter = router({
  /** Get current push subscription status */
  status: protectedProcedure
    .query(async ({ ctx }) => {
      const sub = await getUserPushSubscription(ctx.user.id);
      return {
        subscribed: !!sub,
        enabled: sub?.enabled === 1,
        notifyDrawResults: sub?.notifyDrawResults === 1,
        notifyHighAccuracy: sub?.notifyHighAccuracy === 1,
      };
    }),

  /** Subscribe to push notifications */
  subscribe: protectedProcedure
    .input(z.object({
      endpoint: z.string(),
      p256dh: z.string(),
      auth: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertPushSubscription({
        userId: ctx.user.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        enabled: 1,
        notifyDrawResults: 1,
        notifyHighAccuracy: 1,
      });
      return { success: true };
    }),

  /** Update notification preferences */
  updatePreferences: protectedProcedure
    .input(z.object({
      enabled: z.boolean().optional(),
      notifyDrawResults: z.boolean().optional(),
      notifyHighAccuracy: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const prefs: Record<string, number> = {};
      if (input.enabled !== undefined) prefs.enabled = input.enabled ? 1 : 0;
      if (input.notifyDrawResults !== undefined) prefs.notifyDrawResults = input.notifyDrawResults ? 1 : 0;
      if (input.notifyHighAccuracy !== undefined) prefs.notifyHighAccuracy = input.notifyHighAccuracy ? 1 : 0;
      await updatePushPreferences(ctx.user.id, prefs);
      return { success: true };
    }),

  /** Unsubscribe from push notifications */
  unsubscribe: protectedProcedure
    .mutation(async ({ ctx }) => {
      await updatePushPreferences(ctx.user.id, { enabled: 0 });
      return { success: true };
    }),
});

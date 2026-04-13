import { z } from 'zod';
import { protectedProcedure } from '../trpc';
import { db } from '../../db';
import { drawsTable } from '../../drizzle/schema';
import { TRPCError } from '@trpc/server';
import { rm } from 'fs/promises';
import { join } from 'path';

export const drawRouter = {
  uploadDraws: protectedProcedure
    .input(z.object({ file: z.instanceof(File) }))
    .mutation(async ({ input }) => {
      const filename = `${Date.now()}-${input.file.name}`;
      const tempPath = join(process.cwd(), 'tmp', filename);

      const buffer = await input.file.arrayBuffer();
      await Bun.write(tempPath, new Uint8Array(buffer));

      try {
        const draws = await parseDraws(tempPath);

        await db.transaction(async (tx) => {
          await tx.insert(drawsTable).values(draws);
          return { success: true };
        });

        await rm(tempPath, { force: true });
        return { success: true, draws };
      } catch (error) {
        await db.rollback();
        await rm(tempPath, { force: true });
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'PDF upload failed' });
      }
    }),
};

// Helper function to parse draws from PDF
export const parseDraws = async (filePath: string) => {
  // TODO: Implement parsing logic for Fantasy 5 and Powerball PDFs
  // Example: Use a library like pdf-parse or pdftotext
  return [];
};

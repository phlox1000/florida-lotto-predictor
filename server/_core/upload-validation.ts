import { TRPCError } from '@trpc/server';

export const validateUpload = (file: File) => {
  if (!file) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No file provided' });
  if (file.size > 5 * 1024 * 1024) throw new TRPCError({ code: 'BAD_REQUEST', message: 'File too large (max 5MB)' });
  if (!file.name.endsWith('.pdf')) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only PDF files are allowed' });
  return true;
};
import { validateUpload } from './_core/upload-validation';
import { checkRateLimit } from './_core/rate-limit';

// Use the functions in your upload logic
export const uploadHandler = async (file: File) => {
  await checkRateLimit('upload');
  await validateUpload(file);
  // ... rest of upload logic
};
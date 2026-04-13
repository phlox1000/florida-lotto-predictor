-- Add tempDir to draws table for tracking PDF upload temp files
ALTER TABLE draws
ADD COLUMN tempDir VARCHAR(255) NULL;

-- Add index for tempDir if needed
CREATE INDEX IF NOT EXISTS idx_draws_tempdir ON draws(tempDir);
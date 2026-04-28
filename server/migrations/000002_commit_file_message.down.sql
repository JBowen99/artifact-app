-- +migrate Down
ALTER TABLE commit_files DROP COLUMN IF EXISTS message;

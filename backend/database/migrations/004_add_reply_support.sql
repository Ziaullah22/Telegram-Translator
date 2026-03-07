-- Migration: Add reply support to messages table
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_telegram_id BIGINT,
  ADD COLUMN IF NOT EXISTS reply_to_text TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_sender TEXT;

ALTER TABLE com_calagopus_chat_messages
    ADD COLUMN input_tokens BIGINT CHECK (input_tokens IS NULL OR input_tokens >= 0),
    ADD COLUMN output_tokens BIGINT CHECK (output_tokens IS NULL OR output_tokens >= 0);

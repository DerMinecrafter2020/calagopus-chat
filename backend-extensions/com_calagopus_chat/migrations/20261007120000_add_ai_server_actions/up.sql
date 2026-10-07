ALTER TABLE com_calagopus_chat_messages
    ADD COLUMN ai_action_server_uuid UUID,
    ADD COLUMN ai_action_server_name TEXT,
    ADD COLUMN ai_action_type VARCHAR(16),
    ADD COLUMN ai_action_status VARCHAR(16),
    ADD COLUMN ai_action_expires_at TIMESTAMPTZ,
    ADD CONSTRAINT com_calagopus_chat_messages_ai_action_check CHECK (
        (
            ai_action_server_uuid IS NULL
            AND ai_action_server_name IS NULL
            AND ai_action_type IS NULL
            AND ai_action_status IS NULL
            AND ai_action_expires_at IS NULL
        )
        OR (
            ai_action_server_uuid IS NOT NULL
            AND ai_action_server_name IS NOT NULL
            AND ai_action_type IS NOT NULL
            AND ai_action_type IN ('start', 'stop', 'restart')
            AND ai_action_status IS NOT NULL
            AND ai_action_status IN ('pending', 'executing', 'confirmed', 'cancelled', 'failed', 'expired')
            AND ai_action_expires_at IS NOT NULL
        )
    );

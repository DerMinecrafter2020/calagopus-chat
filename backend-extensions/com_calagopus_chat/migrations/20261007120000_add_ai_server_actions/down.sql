ALTER TABLE com_calagopus_chat_messages
    DROP CONSTRAINT com_calagopus_chat_messages_ai_action_check,
    DROP COLUMN ai_action_expires_at,
    DROP COLUMN ai_action_status,
    DROP COLUMN ai_action_type,
    DROP COLUMN ai_action_server_name,
    DROP COLUMN ai_action_server_uuid;

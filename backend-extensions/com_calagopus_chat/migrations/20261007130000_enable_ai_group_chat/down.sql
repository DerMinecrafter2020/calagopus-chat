ALTER TABLE com_calagopus_chat_messages
    DROP COLUMN ai_action_owner_uuid;

ALTER TABLE com_calagopus_chat_conversations
    DROP CONSTRAINT com_calagopus_chat_conversations_ai_enabled_check,
    DROP COLUMN ai_enabled;

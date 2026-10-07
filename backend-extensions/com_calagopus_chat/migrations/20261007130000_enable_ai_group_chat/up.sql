ALTER TABLE com_calagopus_chat_conversations
    ADD COLUMN ai_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT com_calagopus_chat_conversations_ai_enabled_check CHECK (
        NOT ai_enabled OR kind IN ('group', 'ai')
    );

UPDATE com_calagopus_chat_conversations
SET ai_enabled = true
WHERE kind = 'ai';

ALTER TABLE com_calagopus_chat_messages
    ADD COLUMN ai_action_owner_uuid UUID;

UPDATE com_calagopus_chat_messages AS messages
SET ai_action_owner_uuid = conversations.created_by
FROM com_calagopus_chat_conversations AS conversations
WHERE conversations.uuid = messages.conversation_uuid
  AND conversations.kind = 'ai'
  AND messages.ai_action_status IS NOT NULL
  AND conversations.created_by IS NOT NULL;

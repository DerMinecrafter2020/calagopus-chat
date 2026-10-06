CREATE TABLE IF NOT EXISTS com_calagopus_chat_conversations (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('direct', 'group', 'ai')),
    title VARCHAR(80),
    direct_key VARCHAR(80),
    created_by UUID REFERENCES users(uuid) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (kind = 'direct' AND direct_key IS NOT NULL)
        OR (kind <> 'direct' AND direct_key IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS com_calagopus_chat_direct_key_unique
    ON com_calagopus_chat_conversations (direct_key)
    WHERE kind = 'direct';

CREATE TABLE IF NOT EXISTS com_calagopus_chat_members (
    conversation_uuid UUID NOT NULL REFERENCES com_calagopus_chat_conversations(uuid) ON DELETE CASCADE,
    user_uuid UUID NOT NULL REFERENCES users(uuid) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_uuid, user_uuid)
);

CREATE INDEX IF NOT EXISTS com_calagopus_chat_members_user_idx
    ON com_calagopus_chat_members (user_uuid, conversation_uuid);

CREATE TABLE IF NOT EXISTS com_calagopus_chat_messages (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_uuid UUID NOT NULL REFERENCES com_calagopus_chat_conversations(uuid) ON DELETE CASCADE,
    sender_uuid UUID REFERENCES users(uuid) ON DELETE SET NULL,
    sender_kind VARCHAR(16) NOT NULL CHECK (sender_kind IN ('user', 'ai')),
    content TEXT NOT NULL CHECK (char_length(content) <= 8000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS com_calagopus_chat_messages_conversation_created_idx
    ON com_calagopus_chat_messages (conversation_uuid, created_at DESC, uuid DESC);

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConversationKind {
    Direct,
    Group,
    Ai,
}

impl ConversationKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Direct => "direct",
            Self::Group => "group",
            Self::Ai => "ai",
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct ConversationSummary {
    pub uuid: uuid::Uuid,
    pub kind: String,
    pub ai_enabled: bool,
    pub title: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_message: Option<String>,
    pub last_message_at: Option<DateTime<Utc>>,
    pub last_action_status: Option<String>,
    pub unread_count: i64,
    pub participants: Vec<String>,
}

#[derive(Serialize, ToSchema)]
pub struct MessageSummary {
    pub uuid: uuid::Uuid,
    pub conversation_uuid: uuid::Uuid,
    pub sender_uuid: Option<uuid::Uuid>,
    pub sender_username: String,
    pub is_ai: bool,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub pending_action: Option<PendingActionSummary>,
}

#[derive(Serialize, ToSchema)]
pub struct PendingActionSummary {
    pub action_type: String,
    pub server_name: String,
    pub status: String,
    pub expires_at: DateTime<Utc>,
    pub can_confirm: bool,
}

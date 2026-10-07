use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use shared::{
    GetState, Payload,
    models::{user::GetPermissionManager, user_activity::GetUserActivityLogger, user::GetUser},
    response::{ApiResponse, ApiResponseResult},
};
use sqlx::Row;
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};

use super::{conversation, models::ConversationKind};

mod get {
    use super::*;
    use crate::routes::client::models::ConversationSummary;

    #[derive(ToSchema, Serialize)]
    struct Response {
        conversations: Vec<ConversationSummary>,
        ai_available: bool,
        floating_widget_enabled: bool,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
    ))]
    pub async fn route(
        state: GetState,
        user: GetUser,
        permissions: GetPermissionManager,
    ) -> ApiResponseResult {
        permissions.has_user_permission("chat.read")?;

        let rows = sqlx::query(
            r#"
            SELECT
                conversations.uuid,
                conversations.kind,
                conversations.ai_enabled,
                conversations.title,
                conversations.created_at,
                latest.content AS last_message,
                latest.created_at AS last_message_at,
                latest.ai_action_status AS last_action_status,
                (
                    SELECT COUNT(*)
                    FROM com_calagopus_chat_messages AS unread
                    WHERE unread.conversation_uuid = conversations.uuid
                      AND unread.created_at > current_member.last_read_at
                      AND (
                          unread.sender_uuid IS DISTINCT FROM $1
                          OR unread.sender_kind = 'ai'
                      )
                ) AS unread_count,
                COALESCE(
                    (
                        SELECT array_agg(other_users.username::text ORDER BY other_users.username)
                        FROM com_calagopus_chat_members AS other_members
                        JOIN users AS other_users ON other_users.uuid = other_members.user_uuid
                        WHERE other_members.conversation_uuid = conversations.uuid
                          AND other_members.user_uuid <> $1
                    ),
                    ARRAY[]::text[]
                ) AS participants
            FROM com_calagopus_chat_conversations AS conversations
            JOIN com_calagopus_chat_members AS current_member
              ON current_member.conversation_uuid = conversations.uuid
             AND current_member.user_uuid = $1
            LEFT JOIN LATERAL (
                SELECT
                    messages.content,
                    messages.created_at,
                    CASE
                        WHEN messages.ai_action_status = 'pending'
                          AND messages.ai_action_expires_at <= now() THEN 'expired'
                        ELSE messages.ai_action_status
                    END AS ai_action_status
                FROM com_calagopus_chat_messages AS messages
                WHERE messages.conversation_uuid = conversations.uuid
                ORDER BY messages.created_at DESC, messages.uuid DESC
                LIMIT 1
            ) AS latest ON true
            WHERE current_member.hidden_at IS NULL
               OR latest.created_at > current_member.hidden_at
            ORDER BY COALESCE(latest.created_at, conversations.created_at) DESC,
                     conversations.uuid DESC
            LIMIT 100
            "#,
        )
        .bind(user.uuid)
        .fetch_all(state.database.read())
        .await?;

        let mut conversations = Vec::with_capacity(rows.len());
        for row in rows {
            conversations.push(ConversationSummary {
                uuid: row.try_get("uuid")?,
                kind: row.try_get("kind")?,
                ai_enabled: row.try_get("ai_enabled")?,
                title: row.try_get("title")?,
                created_at: row.try_get("created_at")?,
                last_message: row.try_get("last_message")?,
                last_message_at: row.try_get("last_message_at")?,
                last_action_status: row.try_get("last_action_status")?,
                unread_count: row.try_get("unread_count")?,
                participants: row.try_get("participants")?,
            });
        }

        let settings = crate::settings::load(&state.0).await?;
        ApiResponse::new_serialized(Response {
            conversations,
            ai_available: settings.ai_available(),
            floating_widget_enabled: settings.floating_widget_enabled,
        })
        .ok()
    }
}

mod post {
    use super::*;

    #[derive(ToSchema, Deserialize)]
    pub struct PayloadData {
        kind: ConversationKind,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        participant_uuids: Vec<uuid::Uuid>,
        #[serde(default)]
        ai_enabled: bool,
    }

    #[derive(ToSchema, Serialize)]
    struct CreatedConversation {
        uuid: uuid::Uuid,
        kind: String,
        title: Option<String>,
        ai_enabled: bool,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        conversation: CreatedConversation,
    }

    #[utoipa::path(post, path = "/", responses(
        (status = OK, body = inline(Response)),
    ), request_body = inline(PayloadData))]
    pub async fn route(
        state: GetState,
        user: GetUser,
        permissions: GetPermissionManager,
        activity_logger: GetUserActivityLogger,
        Payload(data): Payload<PayloadData>,
    ) -> ApiResponseResult {
        permissions.has_user_permission("chat.send")?;

        let actor_uuid = user.uuid;
        let mut participant_uuids = data.participant_uuids;
        participant_uuids.retain(|participant| *participant != actor_uuid);
        participant_uuids.sort_unstable();
        participant_uuids.dedup();

        match data.kind {
            ConversationKind::Direct if participant_uuids.len() != 1 => {
                return Err(ApiResponse::error("Choose exactly one person for a direct chat.")
                    .with_status(StatusCode::BAD_REQUEST));
            }
            ConversationKind::Group
                if participant_uuids.len() < 2 || participant_uuids.len() > 50 =>
            {
                return Err(ApiResponse::error(
                    "A group chat must include between two and fifty other people.",
                )
                .with_status(StatusCode::BAD_REQUEST));
            }
            ConversationKind::Ai if !participant_uuids.is_empty() => {
                return Err(ApiResponse::error("AI chats do not accept other participants.")
                    .with_status(StatusCode::BAD_REQUEST));
            }
            _ => {}
        }

        if data.ai_enabled && data.kind != ConversationKind::Group {
            return Err(ApiResponse::error("Only group chats can include the AI assistant.")
                .with_status(StatusCode::BAD_REQUEST));
        }

        if data.kind == ConversationKind::Ai || data.ai_enabled {
            let settings = crate::settings::load(&state.0).await?;
            if !settings.ai_available() {
                return Err(ApiResponse::error(
                    "AI chat is not available. Ask an administrator to configure it.",
                )
                .with_status(StatusCode::SERVICE_UNAVAILABLE));
            }
        }

        if !participant_uuids.is_empty() {
            let available_users: Vec<uuid::Uuid> = sqlx::query_scalar(
                r#"
                SELECT users.uuid
                FROM users
                WHERE users.uuid = ANY($1)
                  AND users.frozen = false
                  AND users.suspended = false
                "#,
            )
            .bind(&participant_uuids)
            .fetch_all(state.database.read())
            .await?;

            if available_users.len() != participant_uuids.len() {
                return Err(ApiResponse::error("One or more selected users are unavailable.")
                    .with_status(StatusCode::BAD_REQUEST));
            }
        }

        let title = match data.kind {
            ConversationKind::Group => {
                let title = data.title.as_deref().unwrap_or_default().trim();
                if title.chars().count() > 80 {
                    return Err(ApiResponse::error("Group names must be 80 characters or fewer.")
                        .with_status(StatusCode::BAD_REQUEST));
                }
                Some(if title.is_empty() {
                    "Group chat".to_string()
                } else {
                    title.to_string()
                })
            }
            ConversationKind::Ai => Some("Calagopus AI".to_string()),
            ConversationKind::Direct => None,
        };

        let mut transaction = state.database.write().begin().await?;
        let conversation_uuid = match data.kind {
            ConversationKind::Direct => {
                let mut pair = [actor_uuid, participant_uuids[0]];
                pair.sort_unstable();
                let direct_key = format!("{}:{}", pair[0], pair[1]);

                sqlx::query_scalar::<_, uuid::Uuid>(
                    r#"
                    INSERT INTO com_calagopus_chat_conversations
                        (kind, direct_key, created_by)
                    VALUES ('direct', $1, $2)
                    ON CONFLICT (direct_key) WHERE kind = 'direct'
                    DO UPDATE SET direct_key = EXCLUDED.direct_key
                    RETURNING uuid
                    "#,
                )
                .bind(direct_key)
                .bind(actor_uuid)
                .fetch_one(&mut *transaction)
                .await?
            }
            ConversationKind::Group => {
                sqlx::query_scalar::<_, uuid::Uuid>(
                    r#"
                    INSERT INTO com_calagopus_chat_conversations
                        (kind, title, created_by, ai_enabled)
                    VALUES ('group', $1, $2, $3)
                    RETURNING uuid
                    "#,
                )
                .bind(title.as_deref())
                .bind(actor_uuid)
                .bind(data.ai_enabled)
                .fetch_one(&mut *transaction)
                .await?
            }
            ConversationKind::Ai => {
                sqlx::query_scalar::<_, uuid::Uuid>(
                    r#"
                    INSERT INTO com_calagopus_chat_conversations
                        (kind, title, created_by, ai_enabled)
                    VALUES ('ai', $1, $2, true)
                    RETURNING uuid
                    "#,
                )
                .bind(title.as_deref())
                .bind(actor_uuid)
                .fetch_one(&mut *transaction)
                .await?
            }
        };

        for member_uuid in std::iter::once(actor_uuid).chain(participant_uuids.iter().copied()) {
            sqlx::query(
                r#"
                INSERT INTO com_calagopus_chat_members (conversation_uuid, user_uuid)
                VALUES ($1, $2)
                ON CONFLICT (conversation_uuid, user_uuid) DO NOTHING
                "#,
            )
            .bind(conversation_uuid)
            .bind(member_uuid)
            .execute(&mut *transaction)
            .await?;
        }

        sqlx::query(
            r#"
            UPDATE com_calagopus_chat_members
            SET hidden_at = NULL, last_read_at = now()
            WHERE conversation_uuid = $1 AND user_uuid = $2
            "#,
        )
        .bind(conversation_uuid)
        .bind(actor_uuid)
        .execute(&mut *transaction)
        .await?;

        transaction.commit().await?;

        activity_logger
            .log(
                "user:chat.conversation.create",
                serde_json::json!({
                    "conversation_uuid": conversation_uuid,
                    "kind": data.kind.as_str(),
                    "ai_enabled": data.kind == ConversationKind::Ai || data.ai_enabled,
                }),
            )
            .await;

        ApiResponse::new_serialized(Response {
            conversation: CreatedConversation {
                uuid: conversation_uuid,
                kind: data.kind.as_str().to_string(),
                title,
                ai_enabled: data.kind == ConversationKind::Ai || data.ai_enabled,
            },
        })
        .ok()
    }
}

pub fn router(state: &shared::State) -> OpenApiRouter<shared::State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .routes(routes!(post::route))
        .nest("/{conversation}", conversation::router(state))
        .with_state(state.clone())
}

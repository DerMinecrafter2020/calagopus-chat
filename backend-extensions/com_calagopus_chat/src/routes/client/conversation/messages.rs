use axum::{extract::Path, http::StatusCode};
use serde::{Deserialize, Serialize};
use shared::{
    GetState, Payload,
    models::{user::GetPermissionManager, user_activity::GetUserActivityLogger, user::GetUser},
    response::{ApiResponse, ApiResponseResult},
};
use sqlx::Row;
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::routes::client::models::MessageSummary;

mod get {
    use super::*;

    #[derive(ToSchema, Serialize)]
    struct Response {
        messages: Vec<MessageSummary>,
    }

    #[utoipa::path(get, path = "/", params(
        ("conversation" = uuid::Uuid, Path, description = "The conversation ID."),
    ), responses(
        (status = OK, body = inline(Response)),
    ))]
    pub async fn route(
        state: GetState,
        user: GetUser,
        permissions: GetPermissionManager,
        Path(conversation_uuid): Path<uuid::Uuid>,
    ) -> ApiResponseResult {
        permissions.has_user_permission("chat.read")?;

        if !super::super::is_member(&state.0, conversation_uuid, user.uuid).await? {
            return Err(ApiResponse::error("Conversation not found.")
                .with_status(StatusCode::NOT_FOUND));
        }

        let rows = sqlx::query(
            r#"
            SELECT
                messages.uuid,
                messages.conversation_uuid,
                messages.sender_uuid,
                COALESCE(
                    users.username::text,
                    CASE
                        WHEN messages.sender_kind = 'ai' THEN 'Calagopus AI'
                        ELSE 'Former user'
                    END
                ) AS sender_username,
                messages.sender_kind = 'ai' AS is_ai,
                messages.content,
                messages.created_at
            FROM com_calagopus_chat_messages AS messages
            LEFT JOIN users ON users.uuid = messages.sender_uuid
            WHERE messages.conversation_uuid = $1
              AND EXISTS (
                  SELECT 1
                  FROM com_calagopus_chat_members AS members
                  WHERE members.conversation_uuid = messages.conversation_uuid
                    AND members.user_uuid = $2
              )
            ORDER BY messages.created_at DESC, messages.uuid DESC
            LIMIT 100
            "#,
        )
        .bind(conversation_uuid)
        .bind(user.uuid)
        .fetch_all(state.database.read())
        .await?;

        let mut messages = rows
            .into_iter()
            .map(|row| {
                Ok(MessageSummary {
                    uuid: row.try_get("uuid")?,
                    conversation_uuid: row.try_get("conversation_uuid")?,
                    sender_uuid: row.try_get("sender_uuid")?,
                    sender_username: row.try_get("sender_username")?,
                    is_ai: row.try_get("is_ai")?,
                    content: row.try_get("content")?,
                    created_at: row.try_get("created_at")?,
                })
            })
            .collect::<Result<Vec<_>, sqlx::Error>>()?;
        messages.reverse();

        ApiResponse::new_serialized(Response { messages }).ok()
    }
}

mod post {
    use super::*;

    #[derive(ToSchema, Deserialize)]
    struct PayloadData {
        content: String,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        message_uuid: uuid::Uuid,
        ai_message_uuid: Option<uuid::Uuid>,
    }

    #[derive(Deserialize)]
    struct ProviderResponse {
        choices: Vec<ProviderChoice>,
    }

    #[derive(Deserialize)]
    struct ProviderChoice {
        message: ProviderMessage,
    }

    #[derive(Deserialize)]
    struct ProviderMessage {
        content: String,
    }

    #[utoipa::path(post, path = "/", params(
        ("conversation" = uuid::Uuid, Path, description = "The conversation ID."),
    ), responses(
        (status = OK, body = inline(Response)),
    ), request_body = inline(PayloadData))]
    pub async fn route(
        state: GetState,
        user: GetUser,
        permissions: GetPermissionManager,
        activity_logger: GetUserActivityLogger,
        Path(conversation_uuid): Path<uuid::Uuid>,
        Payload(data): Payload<PayloadData>,
    ) -> ApiResponseResult {
        permissions.has_user_permission("chat.send")?;

        let content = data.content.trim();
        if content.is_empty() || content.chars().count() > 4000 {
            return Err(ApiResponse::error(
                "Messages must contain between 1 and 4000 characters.",
            )
            .with_status(StatusCode::BAD_REQUEST));
        }

        let Some(kind) = super::super::conversation_kind(&state.0, conversation_uuid, user.uuid)
            .await?
        else {
            return Err(ApiResponse::error("Conversation not found.")
                .with_status(StatusCode::NOT_FOUND));
        };

        let ai_settings = if kind == "ai" {
            let settings = crate::settings::load(&state.0).await?;
            if !settings.ai_available() {
                return Err(ApiResponse::error(
                    "AI chat is not available. Ask an administrator to configure it.",
                )
                .with_status(StatusCode::SERVICE_UNAVAILABLE));
            }
            Some(settings)
        } else {
            None
        };

        let message_uuid = uuid::Uuid::new_v4();
        sqlx::query(
            r#"
            INSERT INTO com_calagopus_chat_messages
                (uuid, conversation_uuid, sender_uuid, sender_kind, content)
            VALUES ($1, $2, $3, 'user', $4)
            "#,
        )
        .bind(message_uuid)
        .bind(conversation_uuid)
        .bind(user.uuid)
        .bind(content)
        .execute(state.database.write())
        .await?;

        activity_logger
            .log(
                "user:chat.message.create",
                serde_json::json!({
                    "conversation_uuid": conversation_uuid,
                    "message_uuid": message_uuid,
                    "ai_chat": kind == "ai",
                }),
            )
            .await;

        let ai_message_uuid = if let Some(settings) = ai_settings {
            let answer = match generate_ai_reply(
                &state.0,
                &settings,
                conversation_uuid,
            )
            .await
            {
                Ok(answer) => answer,
                Err(error) => {
                    tracing::warn!(
                        conversation_uuid = %conversation_uuid,
                        "Calagopus Chat AI request failed: {error:#}"
                    );
                    return Err(ApiResponse::error(
                        "The AI provider could not complete the request. Check the chat settings and try again.",
                    )
                    .with_status(StatusCode::BAD_GATEWAY));
                }
            };

            let ai_message_uuid = uuid::Uuid::new_v4();
            sqlx::query(
                r#"
                INSERT INTO com_calagopus_chat_messages
                    (uuid, conversation_uuid, sender_uuid, sender_kind, content)
                VALUES ($1, $2, NULL, 'ai', $3)
                "#,
            )
            .bind(ai_message_uuid)
            .bind(conversation_uuid)
            .bind(answer)
            .execute(state.database.write())
            .await?;

            Some(ai_message_uuid)
        } else {
            None
        };

        sqlx::query(
            r#"
            UPDATE com_calagopus_chat_members
            SET last_read_at = now()
            WHERE conversation_uuid = $1 AND user_uuid = $2
            "#,
        )
        .bind(conversation_uuid)
        .bind(user.uuid)
        .execute(state.database.write())
        .await?;

        ApiResponse::new_serialized(Response {
            message_uuid,
            ai_message_uuid,
        })
        .ok()
    }

    async fn generate_ai_reply(
        state: &shared::State,
        settings: &crate::settings::ExtensionSettingsData,
        conversation_uuid: uuid::Uuid,
    ) -> Result<String, anyhow::Error> {
        let rows = sqlx::query(
            r#"
            SELECT sender_kind, content
            FROM com_calagopus_chat_messages
            WHERE conversation_uuid = $1
            ORDER BY created_at DESC, uuid DESC
            LIMIT 20
            "#,
        )
        .bind(conversation_uuid)
        .fetch_all(state.database.read())
        .await?;

        let mut history = rows
            .into_iter()
            .map(|row| {
                Ok((
                    row.try_get::<String, _>("sender_kind")?,
                    row.try_get::<String, _>("content")?,
                ))
            })
            .collect::<Result<Vec<_>, sqlx::Error>>()?;
        history.reverse();

        let mut messages = vec![serde_json::json!({
            "role": "system",
            "content": settings.ai_system_prompt.as_str(),
        })];
        for (sender_kind, content) in history {
            messages.push(serde_json::json!({
                "role": if sender_kind == "ai" { "assistant" } else { "user" },
                "content": content,
            }));
        }

        let endpoint = format!(
            "{}/chat/completions",
            settings.ai_base_url.trim_end_matches('/')
        );
        let response = state
            .client
            .post(endpoint)
            .bearer_auth(settings.ai_api_key.as_str())
            .json(&serde_json::json!({
                "model": settings.ai_model.as_str(),
                "messages": messages,
            }))
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            return Err(anyhow::anyhow!("AI provider returned HTTP {status}"));
        }

        let response: ProviderResponse = response.json().await?;
        let answer = response
            .choices
            .into_iter()
            .next()
            .map(|choice| choice.message.content)
            .unwrap_or_default();
        let answer = answer.trim();
        if answer.is_empty() {
            return Err(anyhow::anyhow!("AI provider returned an empty answer"));
        }

        Ok(answer.chars().take(8000).collect())
    }
}

pub fn router(state: &shared::State) -> OpenApiRouter<shared::State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .routes(routes!(post::route))
        .with_state(state.clone())
}

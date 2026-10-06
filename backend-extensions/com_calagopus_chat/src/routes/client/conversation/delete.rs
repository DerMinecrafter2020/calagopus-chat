use axum::{extract::Path, http::StatusCode};
use serde::Serialize;
use shared::{
    GetState,
    models::{user::GetPermissionManager, user_activity::GetUserActivityLogger, user::GetUser},
    response::{ApiResponse, ApiResponseResult},
};
use utoipa::ToSchema;

#[derive(ToSchema, Serialize)]
struct Response {}

#[utoipa::path(delete, path = "/", params(
    ("conversation" = uuid::Uuid, Path, description = "The conversation ID."),
), responses(
    (status = OK, body = inline(Response)),
))]
pub async fn route(
    state: GetState,
    user: GetUser,
    permissions: GetPermissionManager,
    activity_logger: GetUserActivityLogger,
    Path(conversation_uuid): Path<uuid::Uuid>,
) -> ApiResponseResult {
    permissions.has_user_permission("chat.read")?;

    let hidden: Option<uuid::Uuid> = sqlx::query_scalar(
        r#"
        UPDATE com_calagopus_chat_members
        SET hidden_at = now(), last_read_at = now()
        WHERE conversation_uuid = $1 AND user_uuid = $2
        RETURNING conversation_uuid
        "#,
    )
    .bind(conversation_uuid)
    .bind(user.uuid)
    .fetch_optional(state.database.write())
    .await?;

    if hidden.is_none() {
        return Err(ApiResponse::error("Conversation not found.")
            .with_status(StatusCode::NOT_FOUND));
    }

    activity_logger
        .log(
            "user:chat.conversation.delete",
            serde_json::json!({
                "conversation_uuid": conversation_uuid,
                "removed_from_current_user": true,
            }),
        )
        .await;

    ApiResponse::new_serialized(Response {}).ok()
}

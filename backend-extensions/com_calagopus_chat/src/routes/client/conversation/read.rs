use axum::{extract::Path, http::StatusCode};
use serde::Serialize;
use shared::{
    GetState,
    models::user::{GetPermissionManager, GetUser},
    response::{ApiResponse, ApiResponseResult},
};
use utoipa::ToSchema;

#[derive(ToSchema, Serialize)]
struct Response {}

#[utoipa::path(put, path = "/read", params(
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

    let result = sqlx::query(
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

    if result.rows_affected() == 0 {
        return Err(ApiResponse::error("Conversation not found.")
            .with_status(StatusCode::NOT_FOUND));
    }

    ApiResponse::new_serialized(Response {}).ok()
}

use sqlx::Row;
use shared::State;
use utoipa_axum::router::OpenApiRouter;

mod delete;
mod ai_tools;
mod ai_actions;
mod messages;
mod read;

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(utoipa_axum::routes!(read::route))
        .routes(utoipa_axum::routes!(delete::route))
        .nest("/actions", ai_actions::router(state))
        .nest("/messages", messages::router(state))
        .with_state(state.clone())
}

async fn is_member(
    state: &State,
    conversation_uuid: uuid::Uuid,
    user_uuid: uuid::Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM com_calagopus_chat_members
            WHERE conversation_uuid = $1 AND user_uuid = $2
        )
        "#,
    )
    .bind(conversation_uuid)
    .bind(user_uuid)
    .fetch_one(state.database.read())
    .await
}

async fn conversation_info(
    state: &State,
    conversation_uuid: uuid::Uuid,
    user_uuid: uuid::Uuid,
) -> Result<Option<(String, bool)>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT conversations.kind, conversations.ai_enabled
        FROM com_calagopus_chat_conversations AS conversations
        JOIN com_calagopus_chat_members AS members
          ON members.conversation_uuid = conversations.uuid
        WHERE conversations.uuid = $1 AND members.user_uuid = $2
        "#,
    )
    .bind(conversation_uuid)
    .bind(user_uuid)
    .fetch_optional(state.database.read())
    .await?;

    row.map(|row| {
        Ok((
            row.try_get("kind")?,
            row.try_get("ai_enabled")?,
        ))
    })
    .transpose()
}

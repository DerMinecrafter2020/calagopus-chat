use axum::extract::Query;
use serde::{Deserialize, Serialize};
use shared::{
    GetState,
    models::user::{GetPermissionManager, GetUser},
    response::{ApiResponse, ApiResponseResult},
};
use sqlx::Row;
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};

mod get {
    use super::*;

    #[derive(Deserialize)]
    pub struct SearchQuery {
        search: Option<String>,
    }

    #[derive(ToSchema, Serialize)]
    struct UserSummary {
        uuid: uuid::Uuid,
        username: String,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        users: Vec<UserSummary>,
    }

    #[utoipa::path(get, path = "/", params(
        ("search" = Option<String>, Query, description = "Filter active users by username."),
    ), responses(
        (status = OK, body = inline(Response)),
    ))]
    pub async fn route(
        state: GetState,
        user: GetUser,
        permissions: GetPermissionManager,
        Query(query): Query<SearchQuery>,
    ) -> ApiResponseResult {
        permissions.has_user_permission("chat.read")?;

        let search = query
            .search
            .unwrap_or_default()
            .trim()
            .chars()
            .take(80)
            .collect::<String>();
        let rows = sqlx::query(
            r#"
            SELECT users.uuid, users.username::text AS username
            FROM users
            WHERE users.uuid <> $1
              AND users.frozen = false
              AND users.suspended = false
              AND ($2 = '' OR position(lower($2) in lower(users.username::text)) > 0)
            ORDER BY users.username
            LIMIT 25
            "#,
        )
        .bind(user.uuid)
        .bind(search)
        .fetch_all(state.database.read())
        .await?;

        let users = rows
            .into_iter()
            .map(|row| {
                Ok(UserSummary {
                    uuid: row.try_get("uuid")?,
                    username: row.try_get("username")?,
                })
            })
            .collect::<Result<Vec<_>, sqlx::Error>>()?;

        ApiResponse::new_serialized(Response { users }).ok()
    }
}

pub fn router(state: &shared::State) -> OpenApiRouter<shared::State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .with_state(state.clone())
}

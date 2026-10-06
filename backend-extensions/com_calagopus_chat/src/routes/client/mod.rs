use shared::State;
use utoipa_axum::router::OpenApiRouter;

mod conversation;
mod conversations;
mod models;
mod users;

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .nest("/users", users::router(state))
        .nest("/conversations", conversations::router(state))
        .with_state(state.clone())
}

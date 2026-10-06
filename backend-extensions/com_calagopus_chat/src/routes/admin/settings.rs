use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use shared::{
    GetState, Payload,
    models::{admin_activity::GetAdminActivityLogger, user::GetPermissionManager},
    response::{ApiResponse, ApiResponseResult},
};
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};

mod get {
    use super::*;

    #[derive(ToSchema, Serialize)]
    struct SettingsResponse {
        ai_enabled: bool,
        ai_provider: String,
        ai_base_url: String,
        ai_model: String,
        ai_system_prompt: String,
        api_key_configured: bool,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        #[schema(inline)]
        settings: SettingsResponse,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
    ))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
    ) -> ApiResponseResult {
        permissions.has_admin_permission("extensions.manage")?;

        let settings = crate::settings::load(&state.0).await?;

        ApiResponse::new_serialized(Response {
            settings: SettingsResponse {
                ai_enabled: settings.ai_enabled,
                ai_provider: settings.ai_provider.to_string(),
                ai_base_url: settings.ai_base_url.to_string(),
                ai_model: settings.ai_model.to_string(),
                ai_system_prompt: settings.ai_system_prompt.to_string(),
                api_key_configured: !settings.ai_api_key.trim().is_empty(),
            },
        })
        .ok()
    }
}

mod put {
    use super::*;
    use url::Url;

    #[derive(ToSchema, Deserialize)]
    pub struct PayloadData {
        ai_enabled: bool,
        ai_provider: String,
        ai_base_url: String,
        ai_model: String,
        ai_system_prompt: String,
        ai_api_key: Option<String>,
        #[serde(default)]
        clear_api_key: bool,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {}

    #[utoipa::path(put, path = "/", responses(
        (status = OK, body = inline(Response)),
    ), request_body = inline(PayloadData))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        activity_logger: GetAdminActivityLogger,
        Payload(data): Payload<PayloadData>,
    ) -> ApiResponseResult {
        permissions.has_admin_permission("extensions.manage")?;

        let ai_base_url = data.ai_base_url.trim();
        let Ok(parsed_url) = Url::parse(ai_base_url) else {
            return Err(ApiResponse::error("Enter a valid AI provider URL.")
                .with_status(StatusCode::BAD_REQUEST));
        };

        if !matches!(parsed_url.scheme(), "http" | "https") || parsed_url.host_str().is_none() {
            return Err(ApiResponse::error("The AI provider URL must use HTTP or HTTPS.")
                .with_status(StatusCode::BAD_REQUEST));
        }

        let ai_model = data.ai_model.trim();
        let ai_system_prompt = data.ai_system_prompt.trim();
        let api_key = data.ai_api_key.as_deref().unwrap_or_default().trim();
        let ai_provider = data.ai_provider.trim();

        if !matches!(
            ai_provider,
            "openai_compatible" | "openrouter" | "anthropic" | "google_gemini" | "ollama"
        )
            || ai_base_url.len() > 512
            || ai_model.is_empty()
            || ai_model.len() > 128
            || ai_system_prompt.is_empty()
            || ai_system_prompt.chars().count() > 4000
            || api_key.chars().count() > 4096
        {
            return Err(ApiResponse::error("One or more AI settings are outside the allowed limits.")
                .with_status(StatusCode::BAD_REQUEST));
        }

        let api_key_updated = data.clear_api_key || !api_key.is_empty();
        let mut settings = state.settings.get_mut().await?;
        {
            let extension_settings: &mut crate::settings::ExtensionSettingsData =
                settings.find_mut_extension_settings()?;

            extension_settings.ai_enabled = data.ai_enabled;
            extension_settings.ai_provider = ai_provider.into();
            extension_settings.ai_base_url = ai_base_url.into();
            extension_settings.ai_model = ai_model.into();
            extension_settings.ai_system_prompt = ai_system_prompt.into();

            if data.clear_api_key {
                extension_settings.ai_api_key = compact_str::CompactString::default();
            } else if !api_key.is_empty() {
                extension_settings.ai_api_key = api_key.into();
            }
        }

        settings.save().await?;

        activity_logger
            .log(
                "settings:extensions:update",
                serde_json::json!({
                    "extension": "com.calagopus.chat",
                    "ai_enabled": data.ai_enabled,
                    "ai_provider": ai_provider,
                    "api_key_updated": api_key_updated,
                }),
            )
            .await;

        ApiResponse::new_serialized(Response {}).ok()
    }
}

pub fn router(state: &shared::State) -> OpenApiRouter<shared::State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .routes(routes!(put::route))
        .with_state(state.clone())
}

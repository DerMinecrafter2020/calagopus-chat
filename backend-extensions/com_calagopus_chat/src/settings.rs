use serde::{Deserialize, Serialize};
use compact_str::ToCompactString;
use shared::{
    State,
    extensions::settings::{
        ExtensionSettings, SettingsDeserializeExt, SettingsDeserializer, SettingsSerializeExt,
        SettingsSerializer,
    },
};
use utoipa::ToSchema;

#[derive(Clone, ToSchema, Serialize, Deserialize)]
#[serde(default)]
pub struct ExtensionSettingsData {
    pub ai_enabled: bool,
    pub ai_provider: compact_str::CompactString,
    pub ai_base_url: compact_str::CompactString,
    pub ai_model: compact_str::CompactString,
    pub ai_api_key: compact_str::CompactString,
    pub ai_server_control_api_key: compact_str::CompactString,
    pub ai_system_prompt: compact_str::CompactString,
    pub ai_server_info_enabled: bool,
    pub ai_server_power_enabled: bool,
    pub floating_widget_enabled: bool,
}

impl Default for ExtensionSettingsData {
    fn default() -> Self {
        Self {
            ai_enabled: false,
            ai_provider: "openai_compatible".into(),
            ai_base_url: "https://api.openai.com/v1".into(),
            ai_model: "gpt-4o-mini".into(),
            ai_api_key: compact_str::CompactString::default(),
            ai_server_control_api_key: compact_str::CompactString::default(),
            ai_system_prompt: "You are the Calagopus Chat assistant. Be helpful, clear, and concise."
                .into(),
            ai_server_info_enabled: false,
            ai_server_power_enabled: false,
            floating_widget_enabled: true,
        }
    }
}

impl ExtensionSettingsData {
    pub fn ai_available(&self) -> bool {
        let supported_provider = matches!(
            self.ai_provider.as_str(),
            "openai_compatible" | "openrouter" | "anthropic" | "google_gemini" | "ollama"
        );
        let key_configured =
            self.ai_provider.as_str() == "ollama" || !self.ai_api_key.trim().is_empty();

        self.ai_enabled
            && supported_provider
            && key_configured
            && !self.ai_model.trim().is_empty()
            && !self.ai_base_url.trim().is_empty()
    }
}

#[async_trait::async_trait]
impl SettingsSerializeExt for ExtensionSettingsData {
    async fn serialize(
        &self,
        serializer: SettingsSerializer,
    ) -> Result<SettingsSerializer, anyhow::Error> {
        let serializer = serializer
            .write_raw_setting("ai_enabled", self.ai_enabled.to_compact_string())
            .write_raw_setting("ai_provider", self.ai_provider.clone())
            .write_raw_setting("ai_base_url", self.ai_base_url.clone())
            .write_raw_setting("ai_model", self.ai_model.clone())
            .write_raw_setting("ai_system_prompt", self.ai_system_prompt.clone())
            .write_raw_setting(
                "ai_server_info_enabled",
                self.ai_server_info_enabled.to_compact_string(),
            )
            .write_raw_setting(
                "ai_server_power_enabled",
                self.ai_server_power_enabled.to_compact_string(),
            )
            .write_raw_setting(
                "floating_widget_enabled",
                self.floating_widget_enabled.to_compact_string(),
            );

        let serializer = serializer
            .write_raw_encrypted_setting("ai_api_key", self.ai_api_key.clone())
            .await?;

        Ok(serializer
            .write_raw_encrypted_setting(
                "ai_server_control_api_key",
                self.ai_server_control_api_key.clone(),
            )
            .await?)
    }
}

pub struct ExtensionSettingsDataDeserializer;

#[async_trait::async_trait]
impl SettingsDeserializeExt for ExtensionSettingsDataDeserializer {
    async fn deserialize_boxed(
        &self,
        mut deserializer: SettingsDeserializer<'_>,
    ) -> Result<ExtensionSettings, anyhow::Error> {
        let ai_api_key = deserializer
            .read_raw_encrypted_setting("ai_api_key")
            .await?
            .unwrap_or_default();
        let ai_server_control_api_key = deserializer
            .read_raw_encrypted_setting("ai_server_control_api_key")
            .await?
            .unwrap_or_default();

        Ok(Box::new(ExtensionSettingsData {
            ai_enabled: deserializer
                .take_raw_setting("ai_enabled")
                .and_then(|value| value.parse().ok())
                .unwrap_or(false),
            ai_provider: deserializer
                .take_raw_setting("ai_provider")
                .unwrap_or_else(|| "openai_compatible".into()),
            ai_base_url: deserializer
                .take_raw_setting("ai_base_url")
                .unwrap_or_else(|| "https://api.openai.com/v1".into()),
            ai_model: deserializer
                .take_raw_setting("ai_model")
                .unwrap_or_else(|| "gpt-4o-mini".into()),
            ai_api_key,
            ai_server_control_api_key,
            ai_system_prompt: deserializer
                .take_raw_setting("ai_system_prompt")
                .unwrap_or_else(|| {
                    "You are the Calagopus Chat assistant. Be helpful, clear, and concise.".into()
                }),
            ai_server_info_enabled: deserializer
                .take_raw_setting("ai_server_info_enabled")
                .and_then(|value| value.parse().ok())
                .unwrap_or(false),
            ai_server_power_enabled: deserializer
                .take_raw_setting("ai_server_power_enabled")
                .and_then(|value| value.parse().ok())
                .unwrap_or(false),
            floating_widget_enabled: deserializer
                .take_raw_setting("floating_widget_enabled")
                .and_then(|value| value.parse().ok())
                .unwrap_or(true),
        }))
    }
}

pub async fn load(state: &State) -> Result<ExtensionSettingsData, anyhow::Error> {
    let settings = state.settings.get().await?;
    Ok(settings
        .find_extension_settings::<ExtensionSettingsData>()?
        .clone())
}

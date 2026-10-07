use axum::{
    body::{Body, to_bytes},
    http::{HeaderValue, Method, Request, header},
};
use serde_json::{Value, json};
use shared::models::{
    server::Server,
    user::{AuthMethod, PermissionManager, User},
};
use std::{net::IpAddr, str::FromStr};

#[derive(Clone)]
pub(super) struct ToolDefinition {
    pub name: &'static str,
    pub description: &'static str,
    pub parameters: Value,
}

#[derive(Clone, Copy)]
pub(super) enum PowerAction {
    Start,
    Stop,
    Restart,
}

impl PowerAction {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Start => "start",
            Self::Stop => "stop",
            Self::Restart => "restart",
        }
    }

    fn permission(self) -> &'static str {
        match self {
            Self::Start => "control.start",
            Self::Stop => "control.stop",
            Self::Restart => "control.restart",
        }
    }
}

pub(super) struct PendingPowerAction {
    pub server_uuid: uuid::Uuid,
    pub server_name: String,
    pub action: PowerAction,
}

pub(super) enum ToolExecution {
    Result(Value),
    Pending(PendingPowerAction),
}

pub(super) struct ToolContext<'a> {
    pub state: &'a shared::State,
    pub user: &'a User,
    pub auth_method: &'a AuthMethod,
    pub impersonator: Option<&'a User>,
    pub permissions: &'a PermissionManager,
    pub ip: IpAddr,
    pub server_info_enabled: bool,
    pub server_power_enabled: bool,
}

pub(super) fn definitions(
    server_info_enabled: bool,
    server_power_enabled: bool,
) -> Vec<ToolDefinition> {
    let mut definitions = Vec::new();

    if server_info_enabled {
        definitions.push(ToolDefinition {
            name: "list_my_servers",
            description: "List up to 50 servers the current Panel user can access. Requires the user's servers.read permission. Use search to narrow the list and a returned UUID or short identifier for the other tools.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": "Optional text to narrow the server list by name or identifier."
                    }
                },
                "additionalProperties": false
            }),
        });
        definitions.push(ToolDefinition {
            name: "get_server_status",
            description: "Get the live power state, resource usage, and uptime of a server the current Panel user can access. Requires servers.read. The identifier must come from list_my_servers.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "server_identifier": {
                        "type": "string",
                        "description": "The server UUID or short identifier returned by list_my_servers."
                    }
                },
                "required": ["server_identifier"],
                "additionalProperties": false
            }),
        });
    }

    if server_info_enabled && server_power_enabled {
        definitions.push(ToolDefinition {
            name: "request_server_power_action",
            description: "Prepare a start, stop, or restart request for an accessible server. Requires the corresponding control.start, control.stop, or control.restart permission. The user must confirm the request in chat before it is submitted.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "server_identifier": {
                        "type": "string",
                        "description": "The server UUID or short identifier returned by list_my_servers."
                    },
                    "action": {
                        "type": "string",
                        "enum": ["start", "stop", "restart"],
                        "description": "The requested power action."
                    }
                },
                "required": ["server_identifier", "action"],
                "additionalProperties": false
            }),
        });
    }

    definitions
}

pub(super) fn openai_definitions(definitions: &[ToolDefinition]) -> Vec<Value> {
    definitions
        .iter()
        .map(|definition| {
            json!({
                "type": "function",
                "function": {
                    "name": definition.name,
                    "description": definition.description,
                    "parameters": definition.parameters.clone(),
                }
            })
        })
        .collect()
}

pub(super) fn anthropic_definitions(definitions: &[ToolDefinition]) -> Vec<Value> {
    definitions
        .iter()
        .map(|definition| {
            json!({
                "name": definition.name,
                "description": definition.description,
                "input_schema": definition.parameters.clone(),
            })
        })
        .collect()
}

pub(super) fn gemini_definitions(definitions: &[ToolDefinition]) -> Vec<Value> {
    let function_declarations = definitions
        .iter()
        .map(|definition| {
            let mut parameters = definition.parameters.clone();
            normalize_gemini_schema(&mut parameters);

            json!({
                "name": definition.name,
                "description": definition.description,
                "parameters": parameters,
            })
        })
        .collect::<Vec<_>>();

    vec![json!({
        "functionDeclarations": function_declarations,
    })]
}

fn normalize_gemini_schema(schema: &mut Value) {
    match schema {
        Value::Object(properties) => {
            properties.remove("additionalProperties");
            if let Some(Value::String(schema_type)) = properties.get_mut("type") {
                *schema_type = schema_type.to_ascii_uppercase();
            }
            for property in properties.values_mut() {
                normalize_gemini_schema(property);
            }
        }
        Value::Array(items) => {
            for item in items {
                normalize_gemini_schema(item);
            }
        }
        _ => {}
    }
}

pub(super) async fn execute(
    context: &ToolContext<'_>,
    name: &str,
    arguments: &Value,
) -> Result<ToolExecution, anyhow::Error> {
    match name {
        "list_my_servers" if context.server_info_enabled => {
            let search = arguments
                .get("search")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|search| !search.is_empty());
            if search.is_some_and(|search| search.chars().count() > 128) {
                return Err(anyhow::anyhow!("Search terms must be 128 characters or fewer."));
            }
            let query = match search {
                Some(search) => format!("&search={}", urlencoding::encode(search)),
                None => String::new(),
            };
            let response = client_api_json(
                context,
                Method::GET,
                &format!("/api/client/servers?page=1&per_page=50{query}"),
                None,
            )
            .await?;
            let servers = response
                .pointer("/servers/data")
                .and_then(Value::as_array)
                .ok_or_else(|| anyhow::anyhow!("Panel returned an invalid server list"))?;
            let result = servers
                .iter()
                .map(|server| {
                    json!({
                        "identifier": server.get("uuid_short"),
                        "name": server.get("name"),
                        "install_status": server.get("status"),
                        "suspended": server.get("is_suspended"),
                    })
                })
                .collect::<Vec<_>>();
            let total = response
                .pointer("/servers/total")
                .and_then(Value::as_i64)
                .unwrap_or(result.len() as i64);
            let truncated = total > result.len() as i64;

            Ok(ToolExecution::Result(json!({
                "servers": result,
                "total": total,
                "truncated": truncated,
            })))
        }
        "get_server_status" if context.server_info_enabled => {
            if context
                .permissions
                .has_user_permission("servers.read")
                .is_err()
            {
                return Err(anyhow::anyhow!(
                    "The current user does not have the Panel servers.read permission."
                ));
            }
            let identifier = required_string(arguments, "server_identifier")?;
            let server = accessible_server(context, identifier).await?;
            let response = client_api_json(
                context,
                Method::GET,
                &format!("/api/client/servers/{}/resources", server.uuid),
                None,
            )
            .await?;
            let resources = response
                .get("resources")
                .ok_or_else(|| anyhow::anyhow!("Panel returned no server resource data"))?;

            Ok(ToolExecution::Result(json!({
                "server": server.name,
                "state": resources.get("state"),
                "cpu_absolute": resources.get("cpu_absolute"),
                "cpu_limit_absolute": resources.get("cpu_limit_absolute"),
                "memory_bytes": resources.get("memory_bytes"),
                "memory_limit_bytes": resources.get("memory_limit_bytes"),
                "disk_bytes": resources.get("disk_bytes"),
                "uptime_seconds": resources.get("uptime"),
            })))
        }
        "request_server_power_action"
            if context.server_info_enabled && context.server_power_enabled =>
        {
            let identifier = required_string(arguments, "server_identifier")?;
            let action = match required_string(arguments, "action")? {
                "start" => PowerAction::Start,
                "stop" => PowerAction::Stop,
                "restart" => PowerAction::Restart,
                _ => return Err(anyhow::anyhow!("Only start, stop, and restart are available.")),
            };
            let server = accessible_server(context, identifier).await?;
            if context
                .permissions
                .for_server(&server)
                .has_server_permission(action.permission())
                .is_err()
            {
                return Err(anyhow::anyhow!(
                    "The current user does not have permission to perform that server action."
                ));
            }

            Ok(ToolExecution::Pending(PendingPowerAction {
                server_uuid: server.uuid,
                server_name: server.name.to_string(),
                action,
            }))
        }
        _ => Err(anyhow::anyhow!("That server tool is not enabled in extension settings.")),
    }
}

async fn accessible_server(
    context: &ToolContext<'_>,
    identifier: &str,
) -> Result<Server, anyhow::Error> {
    Server::by_user_identifier(&context.state.database, context.user, identifier)
        .await
        .map_err(|_| anyhow::anyhow!("Could not check access to that server."))?
        .ok_or_else(|| anyhow::anyhow!("Server not found or not accessible to the current user."))
}

fn required_string<'a>(arguments: &'a Value, key: &str) -> Result<&'a str, anyhow::Error> {
    arguments
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow::anyhow!("Missing required tool argument `{key}`."))
}

pub(super) async fn client_api_json(
    context: &ToolContext<'_>,
    method: Method,
    uri: &str,
    body: Option<Value>,
) -> Result<Value, anyhow::Error> {
    let body = match body {
        Some(body) => Body::from(serde_json::to_vec(&body)?),
        None => Body::empty(),
    };
    let mut request = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::ACCEPT, "application/json")
        .header(header::CONTENT_TYPE, "application/json")
        .body(body)?;

    request.extensions_mut().insert(context.ip);
    if context.impersonator.is_some() {
        request.headers_mut().insert(
            "Calagopus-User",
            HeaderValue::from_str(&context.user.uuid.to_string())?,
        );
    }

    let authenticated_user = (*context.impersonator.unwrap_or(context.user)).clone();
    let response = context
        .state
        .send_authenticated_router_oneshot(
            request,
            authenticated_user,
            (*context.auth_method).clone(),
        )
        .await?;
    let status = response.status();
    let body = to_bytes(response.into_body(), 1024 * 1024).await?;
    if body.is_empty() {
        if status.is_success() {
            return Ok(Value::Null);
        }
        return Err(anyhow::anyhow!("Panel server request failed with HTTP {status}."));
    }

    let response: Value = serde_json::from_slice(&body)?;
    if !status.is_success() {
        let error = response
            .get("errors")
            .and_then(Value::as_array)
            .and_then(|errors| errors.first())
            .and_then(Value::as_str)
            .unwrap_or("Panel server request failed.");
        return Err(anyhow::anyhow!("{error}"));
    }

    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::definitions;

    #[test]
    fn admin_settings_gate_each_server_tool_group() {
        assert!(definitions(false, false).is_empty());
        assert!(definitions(false, true).is_empty());

        let read_only = definitions(true, false);
        assert_eq!(
            read_only.iter().map(|tool| tool.name).collect::<Vec<_>>(),
            vec!["list_my_servers", "get_server_status"]
        );

        let read_and_power = definitions(true, true);
        assert_eq!(read_and_power.len(), 3);
        assert_eq!(
            read_and_power.last().map(|tool| tool.name),
            Some("request_server_power_action")
        );
    }

    #[test]
    fn gemini_function_schema_uses_gemini_type_names() {
        let tools = definitions(true, true);
        let declarations = super::gemini_definitions(&tools);
        let list_schema = &declarations[0]["functionDeclarations"][0]["parameters"];

        assert_eq!(list_schema["type"], "OBJECT");
        assert_eq!(list_schema["properties"]["search"]["type"], "STRING");
        assert!(list_schema.get("additionalProperties").is_none());
    }
}

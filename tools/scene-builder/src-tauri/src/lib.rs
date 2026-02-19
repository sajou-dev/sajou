/// Read the OpenClaw gateway auth token from ~/.openclaw/openclaw.json.
/// Returns the token string or an error if the file is missing/malformed.
#[tauri::command]
fn read_openclaw_token() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("cannot resolve home directory")?;
    let path = home.join(".openclaw").join("openclaw.json");
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("cannot read {}: {}", path.display(), e))?;
    let json: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("invalid JSON: {e}"))?;
    json.pointer("/gateway/auth/token")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| "gateway.auth.token not found in openclaw.json".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![read_openclaw_token])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

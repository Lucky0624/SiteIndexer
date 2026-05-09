use crate::error::AppError;
use crate::types::*;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

pub struct Config {
    pub dir: PathBuf,
    pub config_file: PathBuf,
    pub credentials_dir: PathBuf,
    pub quotas_file: PathBuf,
}

impl Config {
    pub fn new() -> Result<Self, AppError> {
        let dir = dirs::data_local_dir()
            .ok_or_else(|| AppError::Other("无法获取数据目录".into()))?
            .join("SmartIndexer");

        fs::create_dir_all(&dir)?;
        fs::create_dir_all(dir.join("credentials"))?;

        Ok(Config {
            config_file: dir.join("config.json"),
            credentials_dir: dir.join("credentials"),
            quotas_file: dir.join("quota.json"),
            dir,
        })
    }
}

pub fn load_config(config: &Config) -> Result<Vec<SiteConfig>, AppError> {
    if !config.config_file.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&config.config_file)?;
    let sites: Vec<SiteConfig> = serde_json::from_str(&content)?;
    Ok(sites)
}

pub fn save_config(config: &Config, sites: &[SiteConfig]) -> Result<(), AppError> {
    let content = serde_json::to_string_pretty(sites)?;
    fs::write(&config.config_file, content)?;
    Ok(())
}

pub fn load_urls(config: &Config, urls_file: &str) -> Result<UrlStore, AppError> {
    let path = config.dir.join(urls_file);
    if !path.exists() {
        return Ok(UrlStore(HashMap::new()));
    }
    let content = fs::read_to_string(&path)?;
    let urls: HashMap<String, UrlEntry> = serde_json::from_str(&content)?;
    Ok(UrlStore(urls))
}

pub fn save_urls(config: &Config, urls_file: &str, urls: &UrlStore) -> Result<(), AppError> {
    let path = config.dir.join(urls_file);
    let content = serde_json::to_string_pretty(&urls.0)?;
    fs::write(&path, content)?;
    Ok(())
}

pub fn load_quotas(config: &Config) -> Result<QuotaStore, AppError> {
    if !config.quotas_file.exists() {
        return Ok(QuotaStore::new());
    }
    let content = fs::read_to_string(&config.quotas_file)?;
    let quotas: QuotaStore = serde_json::from_str(&content)?;
    Ok(quotas)
}

pub fn save_quotas(config: &Config, quotas: &QuotaStore) -> Result<(), AppError> {
    let content = serde_json::to_string_pretty(quotas)?;
    fs::write(&config.quotas_file, content)?;
    Ok(())
}

pub fn load_credentials(config: &Config) -> Result<Vec<Credential>, AppError> {
    let mut creds = Vec::new();
    if let Ok(entries) = fs::read_dir(&config.credentials_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        if json.get("type").and_then(|t| t.as_str()) == Some("service_account") {
                            let filename = path.file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("unknown")
                                .to_string();
                            creds.push(Credential {
                                filename,
                                client_email: json.get("client_email")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                project_id: json.get("project_id")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                            });
                        }
                    }
                }
            }
        }
    }
    Ok(creds)
}

pub fn save_credential(config: &Config, filename: &str, content: &[u8]) -> Result<Credential, AppError> {
    let path = config.credentials_dir.join(filename);
    fs::write(&path, content)?;

    let json: serde_json::Value = serde_json::from_slice(content)
        .map_err(|_| AppError::InvalidServiceAccount)?;

    if json.get("type").and_then(|t| t.as_str()) != Some("service_account") {
        fs::remove_file(&path).ok();
        return Err(AppError::InvalidServiceAccount);
    }

    Ok(Credential {
        filename: filename.to_string(),
        client_email: json.get("client_email")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        project_id: json.get("project_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

pub fn delete_credential(config: &Config, filename: &str) -> Result<(), AppError> {
    let path = config.credentials_dir.join(filename);
    if !path.exists() {
        return Err(AppError::CredentialNotFound(filename.to_string()));
    }
    fs::remove_file(&path)?;
    Ok(())
}

pub fn get_credential_path(config: &Config, filename: &str) -> PathBuf {
    config.credentials_dir.join(filename)
}

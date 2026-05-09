use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub name: String,
    pub sitemap_url: String,
    #[serde(default)]
    pub site_url: String,
    #[serde(default)]
    pub track_lastmod: bool,
    #[serde(default)]
    pub credentials: Vec<String>,
    #[serde(default)]
    pub skip_extensions: Vec<String>,
    #[serde(default)]
    pub exclude_patterns: Vec<String>,
    #[serde(default)]
    pub include_patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteConfig {
    pub name: String,
    pub sitemap_url: String,
    pub site_url: Option<String>,
    pub track_lastmod: bool,
    pub credentials: Vec<String>,
    pub skip_extensions: Vec<String>,
    pub exclude_patterns: Vec<String>,
    pub include_patterns: Vec<String>,
    pub urls_file: String,
}

impl From<&Site> for SiteConfig {
    fn from(site: &Site) -> Self {
        SiteConfig {
            name: site.name.clone(),
            sitemap_url: site.sitemap_url.clone(),
            site_url: Some(site.site_url.clone()),
            track_lastmod: site.track_lastmod,
            credentials: site.credentials.clone(),
            skip_extensions: site.skip_extensions.clone(),
            exclude_patterns: site.exclude_patterns.clone(),
            include_patterns: site.include_patterns.clone(),
            urls_file: format!("urls_{}.json", site.name),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteStats {
    pub urls_total: usize,
    pub urls_indexed: usize,
    pub urls_pending: usize,
    pub urls_gsc_indexed: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteWithStats {
    #[serde(flatten)]
    pub site: Site,
    pub urls_total: usize,
    pub urls_indexed: usize,
    pub urls_pending: usize,
    pub urls_gsc_indexed: usize,
    pub quota: Vec<QuotaEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaEntry {
    pub credentials_file: String,
    pub credentials_name: String,
    pub used: usize,
    pub limit: usize,
    pub remaining: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Credential {
    pub filename: String,
    pub client_email: String,
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlEntry {
    pub url: String,
    pub indexed: bool,
    pub indexed_at: Option<String>,
    pub lastmod: Option<String>,
    pub sc_synced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UrlStore(pub std::collections::HashMap<String, UrlEntry>);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaRecord {
    pub date: String,
    pub used: usize,
}

pub type QuotaStore = std::collections::HashMap<String, QuotaRecord>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlPage {
    pub data: Vec<UrlEntry>,
    pub total: usize,
    pub page: usize,
    pub page_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
    pub found: usize,
    pub added: usize,
    pub removed: usize,
    pub reset: usize,
}

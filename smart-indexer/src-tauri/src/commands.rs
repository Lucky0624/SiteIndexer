use crate::config::{
    delete_credential as delete_cred, get_credential_path, load_config, load_credentials,
    load_urls, save_config, save_credential, save_urls, Config,
};
use crate::error::AppError;
use crate::google_api;
use crate::quota;
use crate::sitemap::{fetch_sitemap, filter_urls, merge_urls};
use crate::types::*;

fn with_config<F, T>(f: F) -> Result<T, AppError>
where
    F: FnOnce(&Config) -> Result<T, AppError>,
{
    let config = Config::new()?;
    f(&config)
}

#[tauri::command]
pub fn get_sites() -> Result<Vec<SiteWithStats>, AppError> {
    with_config(|config| {
        let sites = load_config(config)?;
        let mut result = Vec::new();

        for site in sites {
            let urls = load_urls(config, &site.urls_file)?;
            let urls_indexed = urls.0.values().filter(|u| u.indexed).count();
            let urls_pending = urls.0.values().filter(|u| !u.indexed).count();
            let urls_gsc_indexed = urls.0.values().filter(|u| u.sc_synced_at.is_some()).count();

            let mut quota_entries = Vec::new();
            for cred_file in &site.credentials {
                if let Ok((used, limit)) = quota::get_quota(cred_file, config) {
                    let creds = load_credentials(config)?;
                    let cred_name = creds
                        .iter()
                        .find(|c| &c.filename == cred_file)
                        .map(|c| c.client_email.clone())
                        .unwrap_or_else(|| cred_file.clone());

                    quota_entries.push(QuotaEntry {
                        credentials_file: cred_file.clone(),
                        credentials_name: cred_name,
                        used,
                        limit,
                        remaining: limit.saturating_sub(used),
                    });
                }
            }

            result.push(SiteWithStats {
                site: Site {
                    name: site.name.clone(),
                    sitemap_url: site.sitemap_url.clone(),
                    site_url: site.site_url.unwrap_or_default(),
                    track_lastmod: site.track_lastmod,
                    credentials: site.credentials.clone(),
                    skip_extensions: site.skip_extensions.clone(),
                    exclude_patterns: site.exclude_patterns.clone(),
                    include_patterns: site.include_patterns.clone(),
                },
                urls_total: urls.0.len(),
                urls_indexed,
                urls_pending,
                urls_gsc_indexed,
                quota: quota_entries,
            });
        }

        Ok(result)
    })
}

#[tauri::command]
pub fn get_site(name: String) -> Result<SiteWithStats, AppError> {
    with_config(|config| {
        let sites = load_config(config)?;
        let site = sites
            .into_iter()
            .find(|s| s.name == name)
            .ok_or_else(|| AppError::SiteNotFound(name.clone()))?;

        let urls = load_urls(config, &site.urls_file)?;
        let urls_indexed = urls.0.values().filter(|u| u.indexed).count();
        let urls_pending = urls.0.values().filter(|u| !u.indexed).count();
        let urls_gsc_indexed = urls.0.values().filter(|u| u.sc_synced_at.is_some()).count();

        let mut quota_entries = Vec::new();
        for cred_file in &site.credentials {
            if let Ok((used, limit)) = quota::get_quota(cred_file, config) {
                let creds = load_credentials(config)?;
                let cred_name = creds
                    .iter()
                    .find(|c| &c.filename == cred_file)
                    .map(|c| c.client_email.clone())
                    .unwrap_or_else(|| cred_file.clone());

                quota_entries.push(QuotaEntry {
                    credentials_file: cred_file.clone(),
                    credentials_name: cred_name,
                    used,
                    limit,
                    remaining: limit.saturating_sub(used),
                });
            }
        }

        Ok(SiteWithStats {
            site: Site {
                name: site.name.clone(),
                sitemap_url: site.sitemap_url.clone(),
                site_url: site.site_url.unwrap_or_default(),
                track_lastmod: site.track_lastmod,
                credentials: site.credentials.clone(),
                skip_extensions: site.skip_extensions.clone(),
                exclude_patterns: site.exclude_patterns.clone(),
                include_patterns: site.include_patterns.clone(),
            },
            urls_total: urls.0.len(),
            urls_indexed,
            urls_pending,
            urls_gsc_indexed,
            quota: quota_entries,
        })
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteCreate {
    pub name: String,
    pub sitemap_url: String,
    pub site_url: Option<String>,
    pub track_lastmod: Option<bool>,
    pub credentials: Option<Vec<String>>,
    pub skip_extensions: Option<Vec<String>>,
    pub exclude_patterns: Option<Vec<String>>,
    pub include_patterns: Option<Vec<String>>,
}

#[tauri::command]
pub fn create_site(site: SiteCreate) -> Result<SiteWithStats, AppError> {
    with_config(|config| {
        let sites = load_config(config)?;
        if sites.iter().any(|s| s.name == site.name) {
            return Err(AppError::SiteExists(site.name.clone()));
        }

        let urls_file = format!("urls_{}.json", site.name);

        let site_config = SiteConfig {
            name: site.name.clone(),
            sitemap_url: site.sitemap_url.clone(),
            site_url: site.site_url.clone(),
            track_lastmod: site.track_lastmod.unwrap_or(false),
            credentials: site.credentials.unwrap_or_default(),
            skip_extensions: site.skip_extensions.unwrap_or_else(|| vec![
                ".pdf".into(), ".jpg".into(), ".png".into(),
                ".gif".into(), ".svg".into(), ".webp".into(),
            ]),
            exclude_patterns: site.exclude_patterns.unwrap_or_default(),
            include_patterns: site.include_patterns.unwrap_or_default(),
            urls_file,
        };

        save_config(config, &[&sites, &[site_config.clone()]].concat())?;
        save_urls(config, &site_config.urls_file, &UrlStore(Default::default()))?;

        drop(sites);

        get_site(site.name)
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteUpdate {
    pub sitemap_url: Option<String>,
    pub site_url: Option<String>,
    pub track_lastmod: Option<bool>,
    pub credentials: Option<Vec<String>>,
    pub skip_extensions: Option<Vec<String>>,
    pub exclude_patterns: Option<Vec<String>>,
    pub include_patterns: Option<Vec<String>>,
}

#[tauri::command]
pub fn update_site(name: String, site: SiteUpdate) -> Result<SiteWithStats, AppError> {
    with_config(|config| {
        let mut sites = load_config(config)?;
        let site_config = sites
            .iter_mut()
            .find(|s| s.name == name)
            .ok_or_else(|| AppError::SiteNotFound(name.clone()))?;

        if let Some(v) = site.sitemap_url {
            site_config.sitemap_url = v;
        }
        if let Some(v) = site.site_url {
            site_config.site_url = Some(v);
        }
        if let Some(v) = site.track_lastmod {
            site_config.track_lastmod = v;
        }
        if let Some(v) = site.credentials {
            site_config.credentials = v;
        }
        if let Some(v) = site.skip_extensions {
            site_config.skip_extensions = v;
        }
        if let Some(v) = site.exclude_patterns {
            site_config.exclude_patterns = v;
        }
        if let Some(v) = site.include_patterns {
            site_config.include_patterns = v;
        }

        save_config(config, &sites)?;
        get_site(name)
    })
}

#[tauri::command]
pub fn delete_site(name: String) -> Result<bool, AppError> {
    with_config(|config| {
        let sites = load_config(config)?;
        let site = sites
            .iter()
            .find(|s| s.name == name)
            .ok_or_else(|| AppError::SiteNotFound(name.clone()))?;

        let urls_path = config.dir.join(&site.urls_file);
        if urls_path.exists() {
            std::fs::remove_file(urls_path)?;
        }

        let sites: Vec<_> = sites.into_iter().filter(|s| s.name != name).collect();
        save_config(config, &sites)?;

        Ok(true)
    })
}

#[tauri::command]
pub fn get_urls(
    site: String,
    filter: String,
    page: usize,
    page_size: usize,
    search: String,
) -> Result<UrlPage, AppError> {
    with_config(|config| {
        let sites = load_config(config)?;
        let site_config = sites
            .iter()
            .find(|s| s.name == site)
            .ok_or_else(|| AppError::SiteNotFound(site.clone()))?;

        let urls = load_urls(config, &site_config.urls_file)?;

        let mut filtered: Vec<_> = urls
            .0
            .into_values()
            .filter(|u| {
                let matches_filter = match filter.as_str() {
                    "pending" => !u.indexed,
                    "indexed" => u.indexed,
                    _ => true,
                };
                let matches_search = search.is_empty() || u.url.contains(&search);
                matches_filter && matches_search
            })
            .collect();

        filtered.sort_by(|a, b| b.url.cmp(&a.url));
        let total = filtered.len();

        let start = (page - 1) * page_size;
        let end = start + page_size;
        let data: Vec<_> = filtered.into_iter().skip(start).take(end).collect();

        Ok(UrlPage {
            data,
            total,
            page,
            page_size,
        })
    })
}

#[tauri::command]
pub fn fetch_urls(site: String) -> Result<FetchResult, AppError> {
    with_config(|config| {
        let sites = load_config(config)?;
        let site_config = sites
            .iter()
            .find(|s| s.name == site)
            .ok_or_else(|| AppError::SiteNotFound(site.clone()))?;

        let raw_urls = fetch_sitemap(&site_config.sitemap_url)?;
        let filtered_urls =
            filter_urls(raw_urls, &site_config.skip_extensions, &site_config.exclude_patterns, &site_config.include_patterns);

        let mut urls = load_urls(config, &site_config.urls_file)?;
        let result = merge_urls(&mut urls, filtered_urls, site_config.track_lastmod);
        save_urls(config, &site_config.urls_file, &urls)?;

        Ok(result)
    })
}

#[tauri::command]
pub fn reset_urls(site: String, urls: Vec<String>) -> Result<bool, AppError> {
    with_config(|config| {
        let sites = load_config(config)?;
        let site_config = sites
            .iter()
            .find(|s| s.name == site)
            .ok_or_else(|| AppError::SiteNotFound(site.clone()))?;

        let mut url_store = load_urls(config, &site_config.urls_file)?;

        if urls.is_empty() {
            for entry in url_store.0.values_mut() {
                entry.indexed = false;
                entry.indexed_at = None;
            }
        } else {
            for url in urls {
                if let Some(entry) = url_store.0.get_mut(&url) {
                    entry.indexed = false;
                    entry.indexed_at = None;
                }
            }
        }

        save_urls(config, &site_config.urls_file, &url_store)?;
        Ok(true)
    })
}

#[tauri::command]
pub fn mark_indexed(site: String, urls: Vec<String>) -> Result<bool, AppError> {
    with_config(|config| {
        let sites = load_config(config)?;
        let site_config = sites
            .iter()
            .find(|s| s.name == site)
            .ok_or_else(|| AppError::SiteNotFound(site.clone()))?;

        let mut url_store = load_urls(config, &site_config.urls_file)?;
        let now = chrono::Utc::now().to_rfc3339();

        for url in urls {
            if let Some(entry) = url_store.0.get_mut(&url) {
                entry.indexed = true;
                entry.indexed_at = Some(now.clone());
            }
        }

        save_urls(config, &site_config.urls_file, &url_store)?;
        Ok(true)
    })
}

#[tauri::command]
pub fn get_credentials() -> Result<Vec<Credential>, AppError> {
    with_config(|config| load_credentials(config))
}

#[tauri::command]
pub fn delete_credential(filename: String) -> Result<bool, AppError> {
    with_config(|config| {
        delete_cred(config, &filename)?;
        Ok(true)
    })
}

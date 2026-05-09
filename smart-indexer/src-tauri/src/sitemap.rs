use crate::error::AppError;
use crate::types::{FetchResult, UrlEntry, UrlStore};
use quick_xml::events::Event;
use quick_xml::Reader;
use regex::Regex;
use std::collections::HashSet;

pub fn fetch_sitemap(url: &str) -> Result<Vec<(String, Option<String>)>, AppError> {
    let response = reqwest::blocking::Client::new()
        .get(url)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .map_err(|e| AppError::SitemapParse(format!("请求失败: {}", e)))?;

    if !response.status().is_success() {
        return Err(AppError::SitemapParse(format!(
            "HTTP 错误: {}",
            response.status()
        )));
    }

    let body = response
        .text()
        .map_err(|e| AppError::SitemapParse(format!("读取响应失败: {}", e)))?;

    if body.contains("<sitemapindex") {
        parse_sitemap_index(&body)
    } else if body.contains("<urlset") {
        parse_url_set(&body)
    } else {
        Err(AppError::SitemapParse("未知的 sitemap 格式".into()))
    }
}

fn parse_sitemap_index(body: &str) -> Result<Vec<(String, Option<String>)>, AppError> {
    let mut reader = Reader::from_str(body);
    reader.config_mut().trim_text(true);

    let mut urls = Vec::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) if e.name().as_ref() == b"sitemap" => {
                let mut loc = None;
                for attr in e.attributes().filter_map(|a| a.ok()) {
                    if attr.key.as_ref() == b"loc" {
                        loc = Some(String::from_utf8_lossy(&attr.value).to_string());
                    }
                }
                if let Some(loc_url) = loc {
                    urls.push((loc_url, None));
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(AppError::SitemapParse(format!("XML 解析错误: {}", e))),
            _ => {}
        }
        buf.clear();
    }

    let mut all_urls = Vec::new();
    for (sitemap_url, _) in &urls {
        match fetch_sitemap(sitemap_url) {
            Ok(child_urls) => all_urls.extend(child_urls),
            Err(e) => log::warn!("解析子 sitemap 失败 {}: {}", sitemap_url, e),
        }
    }

    Ok(all_urls)
}

fn parse_url_set(body: &str) -> Result<Vec<(String, Option<String>)>, AppError> {
    let mut reader = Reader::from_str(body);
    reader.config_mut().trim_text(true);

    let mut urls = Vec::new();
    let mut buf = Vec::new();
    let mut in_url = false;
    let mut current_url = String::new();
    let mut current_lastmod: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) if e.name().as_ref() == b"url" => {
                in_url = true;
                current_url.clear();
                current_lastmod = None;
            }
            Ok(Event::End(ref e)) if e.name().as_ref() == b"url" => {
                if !current_url.is_empty() {
                    urls.push((current_url.clone(), current_lastmod.clone()));
                }
                in_url = false;
            }
            Ok(Event::Start(ref e)) if in_url => {
                let tag_name = e.name().as_ref();
                if tag_name == b"loc" {
                    if let Ok(Event::Text(t)) = reader.read_event_into(&mut buf) {
                        current_url = t.unescape().unwrap_or_default().to_string();
                    }
                } else if tag_name == b"lastmod" {
                    if let Ok(Event::Text(t)) = reader.read_event_into(&mut buf) {
                        let text = t.unescape().unwrap_or_default().to_string();
                        if !text.is_empty() {
                            current_lastmod = Some(text);
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(AppError::SitemapParse(format!("XML 解析错误: {}", e))),
            _ => {}
        }
        buf.clear();
    }

    Ok(urls)
}

pub fn filter_urls(
    urls: Vec<(String, Option<String>)>,
    skip_extensions: &[String],
    exclude_patterns: &[String],
    include_patterns: &[String],
) -> Vec<(String, Option<String>)> {
    let skip_exts: HashSet<String> = skip_extensions.iter().map(|s| s.to_lowercase()).collect();
    let exclude_regexes: Vec<Regex> = exclude_patterns
        .iter()
        .filter_map(|p| Regex::new(p).ok())
        .collect();
    let include_regexes: Vec<Regex> = include_patterns
        .iter()
        .filter_map(|p| Regex::new(p).ok())
        .collect();

    let has_include = !include_patterns.is_empty();

    urls.into_iter()
        .filter(|(url, _)| {
            if let Some(ext) = url.split('?').next().and_then(|u| u.rsplit('.').next()) {
                if skip_exts.contains(&format!(".{}", ext.to_lowercase())) {
                    return false;
                }
            }

            for pattern in &exclude_regexes {
                if pattern.is_match(url) {
                    return false;
                }
            }

            if has_include {
                return include_regexes.iter().any(|pattern| pattern.is_match(url));
            }

            true
        })
        .collect()
}

pub fn merge_urls(
    old_urls: &mut UrlStore,
    new_urls: Vec<(String, Option<String>)>,
    track_lastmod: bool,
) -> FetchResult {
    let mut result = FetchResult {
        found: new_urls.len(),
        added: 0,
        removed: 0,
        reset: 0,
    };

    let new_set: HashSet<String> = new_urls.iter().map(|(u, _)| u.clone()).collect();
    let old_keys: Vec<String> = old_urls.0.keys().cloned().collect();

    for key in old_keys {
        if !new_set.contains(&key) {
            old_urls.0.remove(&key);
            result.removed += 1;
        }
    }

    for (url, lastmod) in new_urls {
        if let Some(entry) = old_urls.0.get_mut(&url) {
            if track_lastmod {
                if let (Some(new_mod), Some(old_lastmod)) = (&lastmod, &entry.lastmod) {
                    if new_mod != old_lastmod {
                        entry.indexed = false;
                        entry.indexed_at = None;
                        result.reset += 1;
                    }
                }
            }
            entry.lastmod = lastmod;
        } else {
            old_urls.0.insert(
                url,
                UrlEntry {
                    url: url.clone(),
                    indexed: false,
                    indexed_at: None,
                    lastmod,
                    sc_synced_at: None,
                },
            );
            result.added += 1;
        }
    }

    result
}

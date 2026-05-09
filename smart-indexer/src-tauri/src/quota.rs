use crate::config::{load_quotas, save_quotas};
use crate::error::AppError;
use crate::types::{QuotaRecord, QuotaStore};

pub fn get_quota(credentials_file: &str, config: &crate::config::Config) -> Result<(usize, usize), AppError> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let quotas = load_quotas(config)?;

    if let Some(record) = quotas.get(credentials_file) {
        if record.date == today {
            return Ok((record.used, crate::google_api::quota_limit()));
        }
    }

    Ok((0, crate::google_api::quota_limit()))
}

pub fn increment_quota(credentials_file: &str, config: &crate::config::Config) -> Result<(), AppError> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut quotas = load_quotas(config)?;

    let record = quotas.entry(credentials_file.to_string()).or_insert(QuotaRecord {
        date: today.clone(),
        used: 0,
    });

    if record.date != today {
        record.date = today;
        record.used = 0;
    }

    record.used += 1;
    save_quotas(config, &quotas)?;

    Ok(())
}

pub fn reset_quotas(config: &crate::config::Config) -> Result<(), AppError> {
    let quotas = QuotaStore::new();
    save_quotas(config, &quotas)?;
    Ok(())
}

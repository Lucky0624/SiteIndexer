use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("网络请求错误: {0}")]
    Request(#[from] reqwest::Error),

    #[error("站点 '{0}' 不存在")]
    SiteNotFound(String),

    #[error("站点 '{0}' 已存在")]
    SiteExists(String),

    #[error("无效的 JSON 文件")]
    InvalidJson,

    #[error("凭据 '{0}' 不存在")]
    CredentialNotFound(String),

    #[error("无效的服务账户 JSON")]
    InvalidServiceAccount,

    #[error("Sitemap 解析错误: {0}")]
    SitemapParse(String),

    #[error("Google API 错误: {0}")]
    GoogleApi(String),

    #[error("配额已用尽")]
    QuotaExhausted,

    #[error("请求频率限制")]
    RateLimit,

    #[error("其他错误: {0}")]
    Other(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

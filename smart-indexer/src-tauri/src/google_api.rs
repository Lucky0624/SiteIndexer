use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const QUOTA_LIMIT: usize = 200;
const INDEXING_API_URL: &str = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

#[derive(Debug, Serialize, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: i64,
}

pub fn get_access_token(credential_path: &std::path::Path) -> Result<(String, i64), AppError> {
    let content = std::fs::read_to_string(credential_path)?;
    let cred_json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|_| AppError::InvalidServiceAccount)?;

    let jwt = create_jwt(&cred_json)?;

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::GoogleApi(format!("创建客户端失败: {}", e)))?;

    let params = [
        ("grant_type", "urn:ietf:params:oauth2:grant-type:jwt-bearer"),
        ("assertion", &jwt),
    ];

    let response = retry_request(|| {
        client
            .post(TOKEN_URL)
            .form(&params)
            .send()
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        return Err(AppError::GoogleApi(format!(
            "Token 请求失败 ({}): {}",
            status, body
        )));
    }

    let token_resp: TokenResponse = response
        .json()
        .map_err(|e| AppError::GoogleApi(format!("解析 Token 失败: {}", e)))?;

    Ok((token_resp.access_token, token_resp.expires_in))
}

fn retry_request<F, R>(mut f: F) -> Result<R, AppError>
where
    F: FnMut() -> Result<R, reqwest::Error>,
{
    let mut attempts = 0;
    let max_attempts = 3;
    let mut delay = Duration::from_secs(1);

    loop {
        match f() {
            Ok(result) => return Ok(result),
            Err(e) => {
                attempts += 1;
                if attempts >= max_attempts {
                    let err_msg = if e.is_timeout() {
                        "请求超时，请检查网络连接"
                    } else if e.is_connect() {
                        "无法连接到服务器，请检查网络或代理设置"
                    } else if e.to_string().contains("SSL") || e.to_string().contains("ssl") {
                        format!("SSL 连接错误: {} - 请检查网络或代理设置", e)
                    } else {
                        format!("请求失败: {}", e)
                    };
                    return Err(AppError::GoogleApi(err_msg));
                }
                std::thread::sleep(delay);
                delay *= 2;
            }
        }
    }
}

fn retry_request_with_body<F, R>(mut f: F) -> Result<R, AppError>
where
    F: FnMut() -> Result<R, reqwest::Error>,
{
    let mut attempts = 0;
    let max_attempts = 3;
    let mut delay = Duration::from_secs(1);

    loop {
        match f() {
            Ok(result) => return Ok(result),
            Err(e) => {
                attempts += 1;
                if attempts >= max_attempts {
                    let err_msg = if e.is_timeout() {
                        "请求超时，请检查网络连接"
                    } else if e.is_connect() {
                        "无法连接到服务器，请检查网络或代理设置"
                    } else if e.to_string().contains("SSL") || e.to_string().contains("ssl") {
                        format!("SSL 连接错误: {} - 请检查网络或代理设置", e)
                    } else {
                        format!("请求失败: {}", e)
                    };
                    return Err(AppError::GoogleApi(err_msg));
                }
                std::thread::sleep(delay);
                delay *= 2;
            }
        }
    }
}

fn create_jwt(cred_json: &serde_json::Value) -> Result<String, AppError> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let client_email = cred_json["client_id"]
        .as_str()
        .ok_or(AppError::InvalidServiceAccount)?
        .split('@')
        .next()
        .ok_or(AppError::InvalidServiceAccount)?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| AppError::Other("系统时间错误".into()))?
        .as_secs();

    let header = base64_encode(b"{\"alg\":\"RS256\",\"typ\":\"JWT\"}");
    let claims = format!(
        "{{\"iss\":\"{}.iam.gserviceaccount.com\",\"scope\":\"https://www.googleapis.com/auth/indexing\",\"aud\":\"https://oauth2.googleapis.com/token\",\"iat\":{},\"exp\":{}}}",
        client_email,
        now,
        now + 3600
    );
    let payload = base64_encode(claims.as_bytes());

    let signing_input = format!("{}.{}", header, payload);

    let private_key_pem = cred_json["private_key"]
        .as_str()
        .ok_or(AppError::InvalidServiceAccount)?
        .replace("\\n", "\n");

    let key = openssl::pkey::PKey::private_key_from_pem(private_key_pem.as_bytes())
        .map_err(|_| AppError::Other("无法解析私钥".into()))?;

    let signer = openssl::sign::Signer::new(
        openssl::hash::MessageDigest::sha256(),
        &key,
    ).map_err(|_| AppError::Other("签名失败".into()))?;

    let signature = signer
        .sign_oneshot(signing_input.as_bytes())
        .map_err(|_| AppError::Other("签名失败".into()))?;

    let signature_b64 = base64_encode(&signature);

    Ok(format!("{}.{}", signing_input, signature_b64))
}

fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b = (chunk[0] as usize) << 16;
        let b = if chunk.len() > 1 { b | (chunk[1] as usize) << 8 } else { b };
        let b = if chunk.len() > 2 { b | (chunk[2] as usize) } else { b };
        result.push(ALPHABET[(b >> 18 & 63) as usize] as char);
        result.push(ALPHABET[(b >> 12 & 63) as usize] as char);
        if chunk.len() > 1 {
            result.push(ALPHABET[(b >> 6 & 63) as usize] as char);
        }
        if chunk.len() > 2 {
            result.push(ALPHABET[(b & 63) as usize] as char);
        }
    }
    result
}

pub fn submit_url(url: &str, access_token: &str) -> Result<(), AppError> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::GoogleApi(format!("创建客户端失败: {}", e)))?;

    #[derive(Serialize)]
    struct PublishRequest<'a> {
        url: &'a str,
    }

    let body = PublishRequest { url };

    let response = retry_request_with_body(|| {
        client
            .post(INDEXING_API_URL)
            .bearer_auth(access_token)
            .json(&body)
            .send()
    })?;

    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(AppError::RateLimit);
    }

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        if status == 403 {
            return Err(AppError::GoogleApi("权限不足 (403) - 请确保服务账户已添加到 Google Search Console".into()));
        }
        return Err(AppError::GoogleApi(format!("API 错误 ({}): {}", status, body)));
    }

    Ok(())
}

pub const fn quota_limit() -> usize {
    QUOTA_LIMIT
}

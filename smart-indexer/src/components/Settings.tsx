import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";
import type { Credential } from "../types";

export default function Settings() {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const data = await api.getCredentials();
      setCreds(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      const cred = await api.uploadCredential(file);
      setCreds((prev) => [...prev, cred]);
      setUploadSuccess(`已成功上传：${cred.client_email}`);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(filename: string) {
    if (!confirm(`确定要删除凭据 "${filename}" 吗？`)) return;
    await api.deleteCredential(filename);
    load();
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">设置</h1>

      <section className="rounded-xl border p-5 mb-6 bg-navy-card border-rim">
        <h2 className="font-semibold mb-1">Google 服务账户</h2>
        <p className="text-sm mb-4 text-muted">
          上传您的 Google 服务账户 JSON 文件以使用 Google Indexing API 进行身份验证。
          每个服务账户每天最多允许 200 个 URL 提交。
        </p>

        <label
          className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors border-rim hover:border-accent"
        >
          <span className="text-2xl">⬆</span>
          <span className="text-sm font-medium">
            {uploading ? "上传中…" : "点击上传服务账户 JSON"}
          </span>
          <span className="text-xs text-muted">
            必须是 Google 服务账户密钥文件
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>

        {uploadError && (
          <p className="mt-3 text-sm text-danger">{uploadError}</p>
        )}
        {uploadSuccess && (
          <p className="mt-3 text-sm text-success">✓ {uploadSuccess}</p>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-3">已存储的凭据</h2>

        {loading ? (
          <p className="text-muted">加载中…</p>
        ) : creds.length === 0 ? (
          <div className="border border-dashed rounded-lg p-8 text-center text-muted border-rim">
            暂无存储的凭据。
          </div>
        ) : (
          <div className="space-y-2">
            {creds.map((c) => (
              <div
                key={c.filename}
                className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 bg-navy-card border-rim"
              >
                <div className="min-w-0">
                  <p className="text-sm font-mono truncate">{c.client_email}</p>
                  <p className="text-xs text-muted">
                    {c.project_id} · {c.filename}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(c.filename)}
                  className="shrink-0 text-xs px-3 py-1.5 rounded border border-danger text-danger hover:bg-danger/10 transition-colors"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border p-5 bg-navy-card border-rim">
        <h2 className="font-semibold mb-2">关于配额</h2>
        <p className="text-sm text-muted">
          Google Indexing API 每个 GCP 项目每天允许{" "}
          <strong className="text-white">200 个 URL 提交</strong>。
          请注意，配额是按项目计算的，而不是按服务账户计算的——同一项目下的多个服务账户共享相同的每日限制。
          添加来自不同 GCP 项目的服务账户以增加您的每日容量。
        </p>
      </section>
    </div>
  );
}

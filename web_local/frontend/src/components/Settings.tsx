import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";

interface Credential {
  filename: string;
  client_email: string;
  project_id: string;
}

export default function Settings() {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const data = await api.getCredentials();
      setCreds(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function doUpload(file: File) {
    if (!file.name.endsWith(".json")) {
      setUploadError("只能上传 .json 格式的服务账户密钥文件。");
      return;
    }
    setUploading(true);
    setUploadError("");
    setUploadSuccess("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("http://localhost:7842/api/credentials/upload", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? res.statusText);
      }
      const data = await res.json();
      setUploadSuccess(`✓ 上传成功：${data.client_email}`);
      load();
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    doUpload(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) doUpload(file);
  }

  async function handleDelete(filename: string) {
    if (!confirm(`确定要删除凭据 "${filename}" 吗？`)) return;
    await api.deleteCredential(filename);
    load();
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">设置</h1>
        <p className="text-sm text-slate-500 mt-1">管理 Google 服务账户凭据</p>
      </div>

      {/* Upload Section */}
      <section className="rounded-2xl border border-white/10 p-6 mb-6 bg-slate-900/50 backdrop-blur-xl shadow-xl">
        <h2 className="font-semibold text-white mb-1">Google 服务账户</h2>
        <p className="text-sm text-slate-400 mb-5">
          上传您的 Google 服务账户 JSON 密钥文件以调用 Google Indexing API。
          每个 GCP 项目每天最多允许提交 <strong className="text-white">200 个 URL</strong>。
        </p>

        <label
          className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all duration-300 ${
            dragging
              ? "border-violet-500 bg-violet-500/10"
              : "border-white/10 hover:border-violet-500/50 hover:bg-white/5"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all ${dragging ? "bg-violet-500/20" : "bg-white/5"}`}>
            {uploading ? "⏳" : "📄"}
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white">
              {uploading ? "上传中…" : "点击或拖拽上传服务账户 JSON"}
            </p>
            <p className="text-xs text-slate-500 mt-1">仅支持 Google 服务账户密钥文件 (.json)</p>
          </div>
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
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
            <span className="text-red-400 text-lg shrink-0">✗</span>
            <p className="text-sm text-red-400">{uploadError}</p>
          </div>
        )}
        {uploadSuccess && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <span className="text-emerald-400 text-lg shrink-0">✓</span>
            <p className="text-sm text-emerald-400">{uploadSuccess}</p>
          </div>
        )}
      </section>

      {/* Credentials List */}
      <section className="mb-6">
        <h2 className="font-semibold text-white mb-4">已存储的凭据</h2>
        {loading ? (
          <div className="flex items-center gap-3 text-sm text-slate-500 p-4">
            <div className="w-4 h-4 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
            加载中…
          </div>
        ) : creds.length === 0 ? (
          <div className="border border-dashed border-white/10 rounded-2xl p-10 text-center bg-slate-900/30">
            <p className="text-slate-500 text-sm">暂无存储的凭据。请上传一个服务账户 JSON 文件。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {creds.map((c) => (
              <div
                key={c.filename}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/10 px-5 py-4 bg-slate-900/50 backdrop-blur-xl"
              >
                <div className="min-w-0">
                  <p className="text-sm font-mono text-violet-300 truncate">{c.client_email}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    项目: {c.project_id} · <span className="text-slate-600">{c.filename}</span>
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(c.filename)}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quota Info Card */}
      <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <h2 className="font-semibold text-white mb-2">关于配额限制</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Google Indexing API 每个 GCP 项目每天允许{" "}
              <strong className="text-amber-400">200 个 URL 提交</strong>。
              配额是按<strong className="text-white">项目</strong>计算的，而非按服务账户 ——
              同一项目下的多个服务账户共享同一配额。
            </p>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              通过添加来自<strong className="text-white">不同 GCP 项目</strong>的服务账户，
              可以叠加配额（例如 3 个项目 = 每天 600 个 URL）。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

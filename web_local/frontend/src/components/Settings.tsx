import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";

interface Credential {
  filename: string;
  client_email: string;
  project_id: string;
}

export default function Settings() {
  const { t } = useI18n();
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [indexNowKey, setIndexNowKey] = useState("");
  const [indexNowKeyLocation, setIndexNowKeyLocation] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [savedKey, setSavedKey] = useState(false);

  async function load() {
    try {
      const data = await api.getCredentials();
      setCreds(data);
      const conf = await api.getIndexNowConfig();
      setIndexNowKey(conf.key || "");
      setIndexNowKeyLocation(conf.keyLocation || "");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function doUpload(file: File) {
    if (!file.name.endsWith(".json")) {
      setUploadError("只能上传 .json 格式的服务账户密钥文件。 / Only .json files allowed.");
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
      setUploadSuccess(`✓ ${data.client_email}`);
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
    if (!confirm(`${t("common.delete")} "${filename}" ?`)) return;
    await api.deleteCredential(filename);
    load();
  }

  async function handleSaveIndexNow() {
    setSavingKey(true);
    setSavedKey(false);
    try {
      await api.saveIndexNowConfig(indexNowKey, indexNowKeyLocation);
      setSavedKey(true);
      setTimeout(() => setSavedKey(false), 3000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingKey(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{t("settings.title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("settings.subtitle")}</p>
      </div>

      {/* Upload Section */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/10 p-6 mb-6 bg-white/80 dark:bg-slate-900/50 backdrop-blur-xl shadow-xl">
        <h2 className="font-semibold text-slate-800 dark:text-white mb-1">{t("settings.google_sa")}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          {t("settings.upload_desc")}<br/>
          {t("settings.quota_per_day")} <strong className="text-slate-800 dark:text-white">{t("settings.urls_per_day")}</strong>。
        </p>

        <label
          className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all duration-300 ${
            dragging
              ? "border-violet-500 bg-violet-500/10"
              : "border-slate-300 dark:border-white/10 hover:border-violet-500/50 hover:bg-slate-50 dark:hover:bg-white/5"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all ${dragging ? "bg-violet-500/20" : "bg-slate-100 dark:bg-white/5"}`}>
            {uploading ? "⏳" : "📄"}
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-800 dark:text-white">
              {uploading ? t("settings.uploading") : t("settings.upload_drag")}
            </p>
            <p className="text-xs text-slate-500 mt-1">{t("settings.upload_hint")}</p>
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

      {/* Bing IndexNow Section */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/10 p-6 mb-6 bg-white/80 dark:bg-slate-900/50 backdrop-blur-xl shadow-xl">
        <h2 className="font-semibold text-slate-800 dark:text-white mb-1">{t("settings.bing_title")}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          {t("settings.bing_desc")}
        </p>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-300">{t("settings.bing_key")}</label>
            <input
              type="text"
              value={indexNowKey}
              onChange={(e) => setIndexNowKey(e.target.value)}
              placeholder={t("settings.bing_key_hint")}
              className="w-full px-4 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-300">{t("settings.bing_keyloc")}</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={indexNowKeyLocation}
                onChange={(e) => setIndexNowKeyLocation(e.target.value)}
                placeholder={t("settings.bing_keyloc_hint")}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
              />
              <button
                onClick={handleSaveIndexNow}
                disabled={savingKey}
                className="px-6 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-all disabled:opacity-50"
              >
                {savingKey ? "..." : savedKey ? t("settings.saved") : t("settings.save")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Credentials List */}
      <section className="mb-6">
        <h2 className="font-semibold text-slate-800 dark:text-white mb-4">{t("settings.stored")}</h2>
        {loading ? (
          <div className="flex items-center gap-3 text-sm text-slate-500 p-4">
            <div className="w-4 h-4 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
            {t("sites.loading")}
          </div>
        ) : creds.length === 0 ? (
          <div className="border border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-10 text-center bg-white/60 dark:bg-slate-900/30">
            <p className="text-slate-500 text-sm">{t("settings.no_creds")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {creds.map((c) => (
              <div
                key={c.filename}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-white/10 px-5 py-4 bg-white/80 dark:bg-slate-900/50 backdrop-blur-xl"
              >
                <div className="min-w-0">
                  <p className="text-sm font-mono text-violet-300 truncate">{c.client_email}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t("settings.project")}: {c.project_id} · <span className="text-slate-600">{c.filename}</span>
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(c.filename)}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                >
                  {t("common.delete")}
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
            <h2 className="font-semibold text-slate-800 dark:text-white mb-2">{t("settings.quota_title")}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {t("settings.quota_desc")} <strong className="text-amber-400">200</strong> URL。
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
              {t("settings.quota_tip")}。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

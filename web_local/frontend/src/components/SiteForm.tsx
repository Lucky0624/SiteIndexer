import { useState, useEffect } from "react";
import { api } from "../lib/api";

interface Site {
  name: string;
  sitemap_url: string;
  site_url: string;
  track_lastmod: boolean;
  credentials: string[];
  credential_proxies?: Record<string, string>;
  skip_extensions: string[];
  exclude_patterns: string[];
  include_patterns: string[];
}

interface Props {
  site: Site | null;
  onClose: () => void;
  onSaved: () => void;
}

const DEFAULT_SKIP = [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".zip", ".mp4", ".mp3"];

export default function SiteForm({ site, onClose, onSaved }: Props) {
  const [name, setName] = useState(site?.name ?? "");
  const [sitemapUrl, setSitemapUrl] = useState(site?.sitemap_url ?? "");
  const [siteUrl, setSiteUrl] = useState(site?.site_url ?? "");
  const [trackLastmod, setTrackLastmod] = useState(site?.track_lastmod ?? false);
  const [credentials, setCredentials] = useState<string[]>(site?.credentials ?? []);
  const [credentialProxies, setCredentialProxies] = useState<Record<string, string>>(site?.credential_proxies ?? {});
  const [skipExtensions, setSkipExtensions] = useState(
    (site?.skip_extensions ?? DEFAULT_SKIP).join(", ")
  );
  const [excludePatterns, setExcludePatterns] = useState(
    (site?.exclude_patterns ?? []).join("\n")
  );
  const [includePatterns, setIncludePatterns] = useState(
    (site?.include_patterns ?? []).join("\n")
  );
  const [availableCreds, setAvailableCreds] = useState<{ filename: string; client_email: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getCredentials().then(setAvailableCreds).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        name,
        sitemap_url: sitemapUrl,
        site_url: siteUrl,
        track_lastmod: trackLastmod,
        credentials,
        credential_proxies: credentialProxies,
        skip_extensions: skipExtensions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        exclude_patterns: excludePatterns.split("\n").map((s) => s.trim()).filter(Boolean),
        include_patterns: includePatterns.split("\n").map((s) => s.trim()).filter(Boolean),
      };
      if (site) {
        await api.updateSite(site.name, payload);
      } else {
        await api.createSite(payload);
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleCred(filename: string) {
    setCredentials((prev) =>
      prev.includes(filename)
        ? prev.filter((c) => c !== filename)
        : [...prev, filename]
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden bg-white dark:bg-slate-900/80 backdrop-blur-xl"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5"
        >
          <h2 className="font-semibold text-slate-800 dark:text-white">
            {site ? "编辑站点" : "新建站点"}
          </h2>
          <button
            onClick={onClose}
            className="text-xl leading-none text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {error && (
            <p className="text-sm p-3 rounded-md bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <Field label="站点名称" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!site}
              required
              placeholder="my-site"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-all"
            />
          </Field>

          <Field label="Sitemap URL" required>
            <input
              value={sitemapUrl}
              onChange={(e) => setSitemapUrl(e.target.value)}
              required
              placeholder="https://example.com/sitemap.xml"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-all"
            />
          </Field>

          <Field label="Search Console 属性 (可选)">
            <input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://example.com/"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-all"
            />
          </Field>

          <Field label="凭据">
            {availableCreds.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                暂无可用凭据。请在设置中上传服务账户 JSON 文件。
              </p>
            ) : (
              <div className="space-y-2">
                {availableCreds.map((c) => (
                  <div key={c.filename}>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
                      <input
                        type="checkbox"
                        checked={credentials.includes(c.filename)}
                        onChange={() => toggleCred(c.filename)}
                        className="rounded bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-white/10 accent-violet-500"
                      />
                      <span className="font-mono text-xs truncate">{c.client_email}</span>
                    </label>
                    {credentials.includes(c.filename) && (
                      <div className="pl-6 mt-1.5 mb-1">
                        <input
                          type="text"
                          placeholder="特定代理 (如: socks5://127.0.0.1:1080) [留空则用全局]"
                          value={credentialProxies[c.filename] || ""}
                          onChange={(e) => setCredentialProxies({ ...credentialProxies, [c.filename]: e.target.value })}
                          className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-300 focus:border-violet-500 focus:outline-none transition-colors"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Field>

          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={trackLastmod}
              onChange={(e) => setTrackLastmod(e.target.checked)}
              className="rounded accent-violet-500"
            />
            <span>跟踪 lastmod (当 sitemap lastmod 变化时重新索引)</span>
          </label>

          <Field label="跳过扩展名 (逗号分隔)">
            <input
              value={skipExtensions}
              onChange={(e) => setSkipExtensions(e.target.value)}
              placeholder=".pdf, .jpg, .png"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-all"
            />
          </Field>

          <Field label="排除模式 (每行一个正则)">
            <textarea
              value={excludePatterns}
              onChange={(e) => setExcludePatterns(e.target.value)}
              rows={3}
              placeholder="/admin/.*\n/tag/.*"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 text-xs font-mono outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-all resize-none"
            />
          </Field>

          <Field label="包含模式 (每行一个正则, 空=全部)">
            <textarea
              value={includePatterns}
              onChange={(e) => setIncludePatterns(e.target.value)}
              rows={3}
              placeholder="/blog/.*"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 text-xs font-mono outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 transition-all resize-none"
            />
          </Field>

          <div className="flex gap-3 pt-4 pb-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium shadow-[0_0_15px_rgba(139,92,246,0.3)] bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-all hover:scale-[1.02]"
            >
              {saving ? "保存中…" : site ? "保存更改" : "创建站点"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-all"
            >
              取消
            </button>
          </div>
        </form>
      </div>


    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
        {required && <span className="text-red-500 dark:text-red-400"> *</span>}
      </label>
      {children}
    </div>
  );
}

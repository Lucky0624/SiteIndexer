import { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { SiteCreate, SiteUpdate, Site } from "../types";

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
  const [skipExtensions, setSkipExtensions] = useState(DEFAULT_SKIP.join(", "));
  const [excludePatterns, setExcludePatterns] = useState("");
  const [includePatterns, setIncludePatterns] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (site) {
      setSkipExtensions(site.urls_total > 0 ? DEFAULT_SKIP.join(", ") : DEFAULT_SKIP.join(", "));
    }
  }, [site]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload: SiteCreate | SiteUpdate = {
        sitemap_url: sitemapUrl,
        site_url: siteUrl,
        track_lastmod: trackLastmod,
        skip_extensions: skipExtensions.split(",").map((s) => s.trim()).filter(Boolean),
        exclude_patterns: excludePatterns.split("\n").map((s) => s.trim()).filter(Boolean),
        include_patterns: includePatterns.split("\n").map((s) => s.trim()).filter(Boolean),
      };

      if (site) {
        await api.updateSite(site.name, payload as SiteUpdate);
      } else {
        await api.createSite({ name, ...payload } as SiteCreate);
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl border bg-navy-mid border-rim overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-rim">
          <h2 className="font-semibold">{site ? "编辑站点" : "新建站点"}</h2>
          <button onClick={onClose} className="text-xl leading-none text-muted hover:text-gray-200">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {error && (
            <p className="text-sm p-3 rounded-md bg-danger/10 text-danger">{error}</p>
          )}

          <Field label="站点名称" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!site}
              required
              placeholder="my-site"
              className="input"
            />
          </Field>

          <Field label="Sitemap URL" required>
            <input
              value={sitemapUrl}
              onChange={(e) => setSitemapUrl(e.target.value)}
              required
              placeholder="https://example.com/sitemap.xml"
              className="input"
            />
          </Field>

          <Field label="Search Console 属性 (可选)">
            <input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://example.com/"
              className="input"
            />
          </Field>

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={trackLastmod}
              onChange={(e) => setTrackLastmod(e.target.checked)}
              className="rounded"
            />
            <span>跟踪 lastmod (sitemap 变化时重新索引)</span>
          </label>

          <Field label="跳过扩展名 (逗号分隔)">
            <input
              value={skipExtensions}
              onChange={(e) => setSkipExtensions(e.target.value)}
              placeholder=".pdf, .jpg, .png"
              className="input"
            />
          </Field>

          <Field label="排除模式 (每行一个正则)">
            <textarea
              value={excludePatterns}
              onChange={(e) => setExcludePatterns(e.target.value)}
              rows={3}
              placeholder="/admin/\n/tag/"
              className="input resize-none font-mono text-xs"
            />
          </Field>

          <Field label="包含模式 (每行一个正则, 空=全部)">
            <textarea
              value={includePatterns}
              onChange={(e) => setIncludePatterns(e.target.value)}
              rows={3}
              placeholder="/blog/"
              className="input resize-none font-mono text-xs"
            />
          </Field>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "保存中…" : site ? "保存更改" : "创建站点"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-md text-sm border border-rim text-muted hover:text-gray-200"
            >
              取消
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          border: 1px solid var(--rim);
          background: var(--navy-card);
          color: #e6edf3;
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          border-color: var(--accent);
        }
        .input:disabled {
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
    </div>
  );
}

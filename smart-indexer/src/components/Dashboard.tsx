import { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { View, Site } from "../types";
import SiteForm from "./SiteForm";

interface Props {
  navigate: (v: View) => void;
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg p-3 bg-white/[0.03] border border-rim">
      <div className="text-xs mb-1 text-muted">{label}</div>
      <div className="text-xl font-semibold font-mono" style={{ color: color || "#e6edf3" }}>
        {value}
      </div>
    </div>
  );
}

export default function Dashboard({ navigate }: Props) {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);

  async function load() {
    try {
      const data = await api.getSites();
      setSites(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(name: string) {
    if (!confirm(`确定要删除站点 "${name}" 吗？`)) return;
    await api.deleteSite(name);
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        加载中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-danger">{error}</p>
        <button onClick={load} className="mt-2 text-sm underline text-accent">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">站点</h1>
        <button
          onClick={() => { setEditSite(null); setShowForm(true); }}
          className="px-4 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          + 新建站点
        </button>
      </div>

      {sites.length === 0 && (
        <div className="border border-dashed border-rim rounded-xl p-12 text-center text-muted">
          <p className="text-lg mb-1">暂无站点</p>
          <p className="text-sm">添加站点以开始索引。</p>
        </div>
      )}

      <div className="space-y-4">
        {sites.map((site) => {
          const totalQuotaRemaining = site.quota.reduce((sum, q) => sum + q.remaining, 0);

          return (
            <div
              key={site.name}
              className="rounded-xl border p-5 bg-navy-card border-rim"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <h2 className="font-semibold text-base truncate">{site.name}</h2>
                  <a
                    href={site.sitemap_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs truncate block text-muted hover:text-accent-hover"
                  >
                    {site.sitemap_url}
                  </a>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => navigate({ name: "site", site: site.name })}
                    className="px-3 py-1.5 rounded-md text-xs border border-rim text-muted hover:text-gray-200 transition-colors"
                  >
                    网址
                  </button>
                  <button
                    onClick={() => { setEditSite(site); setShowForm(true); }}
                    className="px-3 py-1.5 rounded-md text-xs border border-rim text-muted hover:text-gray-200 transition-colors"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(site.name)}
                    className="px-3 py-1.5 rounded-md text-xs border border-danger text-danger hover:bg-danger/10 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-4">
                <StatCard label="总网址数" value={site.urls_total} />
                <StatCard label="已索引" value={site.urls_indexed} color="var(--success)" />
                <StatCard label="待处理" value={site.urls_pending} color={site.urls_pending > 0 ? "var(--warn)" : undefined} />
                <StatCard label="剩余配额" value={totalQuotaRemaining} color={totalQuotaRemaining === 0 ? "var(--danger)" : undefined} />
              </div>

              {site.quota.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {site.quota.map((q) => (
                    <div
                      key={q.credentials_file}
                      className="px-2 py-1 rounded text-xs flex gap-2 items-center bg-white/[0.04] text-muted"
                    >
                      <span className="font-mono truncate max-w-32">{q.credentials_name}</span>
                      <span
                        style={{
                          color:
                            q.remaining === 0
                              ? "var(--danger)"
                              : q.remaining < 50
                              ? "var(--warn)"
                              : "var(--success)",
                        }}
                      >
                        {q.remaining}/{q.limit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showForm && (
        <SiteForm
          site={editSite}
          onClose={() => { setShowForm(false); setEditSite(null); }}
          onSaved={() => { setShowForm(false); setEditSite(null); load(); }}
        />
      )}
    </div>
  );
}

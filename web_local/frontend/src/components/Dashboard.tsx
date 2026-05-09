import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";
import type { View } from "./App";
import SiteForm from "./SiteForm";

interface Props {
  navigate: (v: View) => void;
}

interface QuotaEntry {
  credentials_file: string;
  credentials_name: string;
  used: number;
  limit: number;
  remaining: number;
}

interface Site {
  name: string;
  sitemap_url: string;
  site_url: string;
  urls_total: number;
  urls_indexed: number;
  urls_pending: number;
  quota: QuotaEntry[];
  credentials: string[];
}

interface LogLine {
  type: string;
  message?: string;
  url?: string;
  done?: number;
  total?: number;
  count?: number;
  pending?: number;
  capacity?: number;
  indexed?: number;
}

export default function Dashboard({ navigate }: Props) {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);

  // Per-site run state
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({});
  const esSources = useRef<Record<string, EventSource>>({});

  async function load() {
    try {
      const data = await api.getSites();
      setSites(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return () => {
      Object.values(esSources.current).forEach((es) => es.close());
    };
  }, []);

  async function handleDelete(name: string) {
    if (!confirm(`Delete site "${name}"?`)) return;
    await api.deleteSite(name);
    load();
  }

  function startRun(name: string) {
    if (esSources.current[name]) {
      esSources.current[name].close();
    }
    setRunning((r) => ({ ...r, [name]: true }));
    setLogs((l) => ({ ...l, [name]: [] }));

    const es = new EventSource(api.runStreamUrl(name));
    esSources.current[name] = es;

    es.onmessage = (e) => {
      const event: LogLine = JSON.parse(e.data);
      setLogs((l) => ({ ...l, [name]: [...(l[name] || []), event] }));
      if (event.type === "done" || event.type === "error") {
        es.close();
        setRunning((r) => ({ ...r, [name]: false }));
        load();
      }
    };

    es.onerror = () => {
        es.close();
        setRunning((r) => ({ ...r, [name]: false }));
        setLogs((l) => ({
          ...l,
          [name]: [...(l[name] || []), { type: "error", message: "连接丢失" }],
        }));
      };
  }

  function stopRun(name: string) {
    esSources.current[name]?.close();
    setRunning((r) => ({ ...r, [name]: false }));
  }

  function logSummary(name: string): string {
    const lines = logs[name] || [];
    const last = lines[lines.length - 1];
    if (!last) return "";
    if (last.type === "done")
      return `完成: ${last.indexed} 已索引, ${last.pending} 待处理`;
    if (last.type === "indexed") return `索引中… ${last.done}/${last.total}`;
    if (last.type === "quota_exhausted") return "配额已用尽";
    if (last.type === "error") return `错误: ${last.message}`;
    if (last.type === "status") return last.message || "";
    if (last.type === "plan")
      return `计划: ${last.pending} 待处理, ${last.capacity} 容量`;
    return last.type;
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "var(--color-muted)" }}>
        加载中…
      </div>
    );

  if (error)
    return (
      <div className="p-8">
        <p style={{ color: "var(--color-danger)" }}>{error}</p>
        <button
          onClick={load}
          className="mt-2 text-sm underline"
          style={{ color: "var(--color-accent)" }}
        >
          重试
        </button>
      </div>
    );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">站点</h1>
        <button
          onClick={() => { setEditSite(null); setShowForm(true); }}
          className="px-5 py-2.5 rounded-lg text-sm font-medium shadow-[0_0_15px_rgba(139,92,246,0.3)] bg-violet-600 hover:bg-violet-500 text-white transition-all hover:-translate-y-0.5"
        >
          + 新建站点
        </button>
      </div>

      {sites.length === 0 && (
        <div className="border border-dashed border-white/10 rounded-2xl p-16 text-center bg-slate-900/40 backdrop-blur-xl shadow-xl">
          <p className="text-xl mb-2 text-slate-400 font-medium">暂无站点</p>
          <p className="text-sm text-slate-500">添加站点以开始索引。</p>
        </div>
      )}

      <div className="space-y-4">
        {sites.map((site) => {
          const isRunning = running[site.name];
          const siteLogs = logs[site.name] || [];
          const progress =
            siteLogs.find((l) => l.type === "indexed");
          const totalQuotaRemaining = site.quota.reduce(
            (sum, q) => sum + q.remaining,
            0
          );

          return (
            <div
              key={site.name}
              className="rounded-2xl border border-white/10 p-6 bg-slate-900/60 backdrop-blur-xl shadow-xl transition-all hover:shadow-2xl hover:border-white/20"
            >
              {/* Site header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <h2 className="font-semibold text-base truncate">{site.name}</h2>
                  <a
                    href={site.sitemap_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs truncate block"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {site.sitemap_url}
                  </a>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => navigate({ name: "urls", site: site.name })}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors"
                  >
                    网址
                  </button>
                  <button
                    onClick={() => { setEditSite(site); setShowForm(true); }}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium border border-white/10 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(site.name)}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <Stat label="总网址数" value={site.urls_total} />
                <Stat label="已索引" value={site.urls_indexed} color="var(--color-success)" />
                <Stat label="待处理" value={site.urls_pending} color={site.urls_pending > 0 ? "var(--color-warn)" : undefined} />
                <Stat label="剩余配额" value={totalQuotaRemaining} color={totalQuotaRemaining === 0 ? "var(--color-danger)" : undefined} />
              </div>

              {/* Quota details */}
              {site.quota.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {site.quota.map((q) => (
                    <div
                      key={q.credentials_file}
                      className="px-2.5 py-1.5 rounded-md text-xs flex gap-2 items-center bg-white/5 border border-white/5 text-slate-300"
                    >
                      <span className="font-mono truncate max-w-32">{q.credentials_name}</span>
                      <span
                        style={{
                          color:
                            q.remaining === 0
                              ? "var(--color-danger)"
                              : q.remaining < 50
                              ? "var(--color-warn)"
                              : "var(--color-success)",
                        }}
                      >
                        {q.remaining}/{q.limit}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Run button + log */}
              <div className="flex items-center gap-3">
                {isRunning ? (
                  <button
                    onClick={() => stopRun(site.name)}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    停止
                  </button>
                ) : (
                  <button
                    onClick={() => startRun(site.name)}
                    disabled={site.credentials.length === 0}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium shadow-[0_0_10px_rgba(139,92,246,0.2)] bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 transition-all hover:-translate-y-0.5"
                    title={site.credentials.length === 0 ? "未配置凭据" : ""}
                  >
                    ▶ 运行索引
                  </button>
                )}
                {siteLogs.length > 0 && (
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {logSummary(site.name)}
                  </span>
                )}
              </div>

              {/* SSE log lines */}
              {siteLogs.length > 0 && (
                <LogPanel lines={siteLogs} />
              )}
            </div>
          );
        })}
      </div>

      {/* Site form modal */}
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

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-xl p-4 bg-slate-900/40 border border-white/10 shadow-inner">
      <div className="text-xs mb-1.5 text-slate-400">{label}</div>
      <div className="text-2xl font-bold font-mono" style={{ color: color || "#f1f5f9" }}>
        {value}
      </div>
    </div>
  );
}

function LogPanel({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={ref}
      className="mt-4 rounded-xl p-4 text-xs font-mono overflow-y-auto max-h-40 space-y-1 bg-black/40 border border-white/10 shadow-inner"
    >
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            color:
              l.type === "error"
                ? "var(--color-danger)"
                : l.type === "quota_exhausted"
                ? "var(--color-warn)"
                : l.type === "indexed"
                ? "var(--color-success)"
                : l.type === "done"
                ? "var(--color-success)"
                : "var(--color-muted)",
          }}
        >
          {l.type === "indexed"
            ? `[${l.done}/${l.total}] ${l.url}`
            : l.type === "done"
            ? `✓ 完成 — 已索引: ${l.indexed}, 待处理: ${l.pending}`
            : l.type === "plan"
            ? `计划: ${l.pending} 待处理, ${l.capacity} 容量`
            : l.type === "urls_found"
            ? `在 sitemap 中找到 ${l.count} 个网址`
            : l.message || l.type}
        </div>
      ))}
    </div>
  );
}

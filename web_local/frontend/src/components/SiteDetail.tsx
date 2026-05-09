import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { View } from "./App";
import SiteForm from "./SiteForm";
import AnalyticsCharts from "./AnalyticsCharts";

interface Props {
  site: string;
  navigate: (v: View) => void;
}

type InlineLog = { text: string; kind: "info" | "ok" | "error" | "url" };

export default function SiteDetail({ site: siteName, navigate }: Props) {
  const [site, setSite] = useState<any>(null);
  const [urls, setUrls] = useState<any[]>([]);
  const [urlFilter, setUrlFilter] = useState<"all" | "pending" | "indexed">("all");
  const [urlSearch, setUrlSearch] = useState("");
  const [urlPage, setUrlPage] = useState(1);
  const [urlTotal, setUrlTotal] = useState(0);
  const PAGE_SIZE = 100;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [urlAction, setUrlAction] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const [panel, setPanel] = useState<{
    visible: boolean;
    running: boolean;
    title: string;
    log: InlineLog[];
    progress: { done: number; total: number } | null;
  }>({ visible: false, running: false, title: "", log: [], progress: null });

  const logRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  function addLog(text: string, kind: InlineLog["kind"] = "info") {
    setPanel((p) => ({ ...p, log: [...p.log, { text, kind }] }));
  }

  function loadSite() {
    api.getSiteStats(siteName).then(setSite);
  }

  function loadUrls(filter = urlFilter, page = urlPage, search = urlSearch) {
    api.getUrls(siteName, filter, page, PAGE_SIZE, search).then((r) => {
      setUrls(r.data);
      setUrlTotal(r.total);
    });
  }

  useEffect(() => {
    loadSite();
    loadUrls();
    return () => esRef.current?.close();
  }, [siteName]);

  useEffect(() => {
    loadUrls(urlFilter, urlPage, urlSearch);
  }, [urlFilter, urlPage, urlSearch]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [panel.log]);

  // --- Run indexing ---
  function handleRun() {
    if (esRef.current) esRef.current.close();
    setPanel({ visible: true, running: true, title: "Run Indexing", log: [], progress: null });

    const es = new EventSource(api.runStreamUrl(siteName));
    esRef.current = es;

    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === "connected") addLog("已连接…");
      if (ev.type === "status") addLog(ev.message);
      if (ev.type === "urls_found") addLog(`在 sitemap 中找到 ${ev.count} 个网址`);
      if (ev.type === "plan") addLog(`${ev.pending} 待处理 · ${ev.capacity} 容量`);
      if (ev.type === "quota_exhausted") addLog(`⚠ ${ev.message}`, "error");
      if (ev.type === "indexed") {
        setPanel((p) => ({
          ...p,
          log: [...p.log, { text: ev.url, kind: "url" }],
          progress: { done: ev.done, total: ev.total },
        }));
        setUrls((prev) =>
          prev.map((u) =>
            u.url === ev.url ? { ...u, indexed: true, indexed_at: new Date().toISOString() } : u
          )
        );
      }
      if (ev.type === "done") {
        addLog(`✓ ${ev.indexed} 已索引 · ${ev.pending} 待处理`, "ok");
        setPanel((p) => ({ ...p, running: false }));
        es.close();
        esRef.current = null;
        loadSite();
        loadUrls();
      }
      if (ev.type === "error") {
        addLog(`✗ ${ev.message}`, "error");
        setPanel((p) => ({ ...p, running: false }));
        es.close();
        esRef.current = null;
      }
    };
    es.onerror = () => {
      addLog("连接丢失", "error");
      setPanel((p) => ({ ...p, running: false }));
      es.close();
      esRef.current = null;
    };
  }

  function handleStop() {
    esRef.current?.close();
    esRef.current = null;
    addLog("用户已停止", "error");
    setPanel((p) => ({ ...p, running: false }));
  }

  // --- Sync GSC ---
  function handleSyncGsc() {
    if (esRef.current) esRef.current.close();
    setPanel({ visible: true, running: true, title: "从 Google Search Console 同步", log: [], progress: null });

    const es = new EventSource(api.syncGscStreamUrl(siteName));
    esRef.current = es;

    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === "status") addLog(ev.message);
      if (ev.type === "done") {
        addLog(`✓ ${ev.synced} 个新网址已标记 · GSC 中共 ${ev.total} 个`, "ok");
        setPanel((p) => ({ ...p, running: false }));
        es.close();
        esRef.current = null;
        loadSite();
        loadUrls();
      }
      if (ev.type === "error") {
        addLog(`✗ ${ev.message}`, "error");
        setPanel((p) => ({ ...p, running: false }));
        es.close();
        esRef.current = null;
      }
    };
    es.onerror = () => {
      addLog("连接丢失", "error");
      setPanel((p) => ({ ...p, running: false }));
      es.close();
      esRef.current = null;
    };
  }

  // --- Fetch URLs ---
  async function handleFetchUrls() {
    setUrlAction(true);
    try {
      const r = await api.fetchUrls(siteName);
      const parts = [`${r.found} found`, `${r.added} added`, `${r.removed} removed`];
      if (r.reset > 0) parts.push(`${r.reset} reset`);
      addLog(parts.join(" · "), "ok");
      setPanel((p) => ({ ...p, visible: true }));
      loadSite();
      loadUrls();
    } catch (e: any) {
      addLog(`✗ ${e.message}`, "error");
      setPanel((p) => ({ ...p, visible: true }));
    } finally {
      setUrlAction(false);
    }
  }

  // --- URL actions ---
  async function handleMarkIndexed() {
    setUrlAction(true);
    try {
      await api.markIndexed(siteName, [...selected]);
      const now = new Date().toISOString();
      setUrls((prev) =>
        prev.map((u) => selected.has(u.url) ? { ...u, indexed: true, indexed_at: now } : u)
      );
      setSelected(new Set());
      loadSite();
    } catch (e: any) { alert(e.message); }
    finally { setUrlAction(false); }
  }

  async function handleResetSelected() {
    setUrlAction(true);
    try {
      await api.resetUrls(siteName, [...selected]);
      setUrls((prev) =>
        prev.map((u) => selected.has(u.url) ? { ...u, indexed: false, indexed_at: null } : u)
      );
      setSelected(new Set());
      loadSite();
    } catch (e: any) { alert(e.message); }
    finally { setUrlAction(false); }
  }

  async function handleResetAll() {
    if (!confirm("Reset all URLs to pending?")) return;
    setUrlAction(true);
    try {
      await api.resetUrls(siteName, []);
      setUrls((prev) => prev.map((u) => ({ ...u, indexed: false, indexed_at: null })));
      setSelected(new Set());
      loadSite();
    } catch (e: any) { alert(e.message); }
    finally { setUrlAction(false); }
  }

  function toggleSelect(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === urls.length) setSelected(new Set());
    else setSelected(new Set(urls.map((u) => u.url)));
  }

  if (!site) return (
    <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--color-muted)" }}>
      加载中…
    </div>
  );

  const pct = panel.progress && panel.progress.total > 0
    ? Math.round((panel.progress.done / panel.progress.total) * 100)
    : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate({ name: "sites" })}
            className="text-xs mb-1 block"
            style={{ color: "var(--color-muted)" }}
          >
            ← 站点
          </button>
          <h1 className="text-xl font-semibold">{site.name}</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{site.sitemap_url}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-5">
          <button
            onClick={() => setShowEdit(true)}
            className="px-4 py-2 rounded-lg text-sm border"
            style={{ borderColor: "var(--color-rim)", color: "var(--color-muted)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#e6edf3")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--color-muted)")}
          >
            编辑
          </button>
          {panel.running ? (
            <button
              onClick={handleStop}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--color-danger)", color: "#fff" }}
            >
              停止
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={site.credentials?.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--color-accent)", color: "#fff" }}
              onMouseEnter={(e) => {
                if (site.credentials?.length > 0)
                  (e.currentTarget as HTMLElement).style.background = "var(--color-accent-hover)";
              }}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--color-accent)")}
              title={site.credentials?.length === 0 ? "未配置凭据" : ""}
            >
              ▶ 运行索引
            </button>
          )}
        </div>
      </div>

      {/* Stats and Charts */}
      <AnalyticsCharts 
        total={site.urls_total} 
        indexed={site.urls_indexed} 
        pending={site.urls_pending} 
        gscIndexed={site.urls_gsc_indexed ?? 0}
      />

      {/* Quota bars */}
      {site.quota?.length > 0 && (
        <div
          className="rounded-2xl border border-white/10 p-5 space-y-4 bg-slate-900/60 backdrop-blur-xl shadow-xl"
        >
          <p className="text-sm font-medium">今日配额</p>
          {site.quota.map((q: any) => (
            <div key={q.credentials_file}>
              <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--color-muted)" }}>
                <span className="font-mono">{q.credentials_name}</span>
                <span style={{
                  color: q.remaining === 0 ? "var(--color-danger)" :
                    q.remaining < 50 ? "var(--color-warn)" : "var(--color-success)"
                }}>
                  {q.used} / {q.limit} 已使用 · {q.remaining} 剩余
                </span>
              </div>
              <div className="rounded-full h-1.5" style={{ background: "var(--color-rim)" }}>
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (q.used / q.limit) * 100)}%`,
                    background: q.remaining === 0 ? "var(--color-danger)" :
                      q.remaining < 50 ? "var(--color-warn)" : "var(--color-accent)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions bar */}
      <div
        className="flex flex-wrap gap-3 rounded-2xl border border-white/10 p-4 bg-slate-900/60 backdrop-blur-xl shadow-xl"
      >
        <Btn onClick={handleFetchUrls} disabled={urlAction || panel.running} variant="dark">
          获取网址
        </Btn>
        <Btn onClick={handleSyncGsc} disabled={urlAction || panel.running} variant="purple">
          从 GSC 同步
        </Btn>
        <div className="w-px mx-1" style={{ background: "var(--color-rim)" }} />
        <Btn onClick={handleResetAll} disabled={urlAction || panel.running} variant="ghost">
          重置全部
        </Btn>
        {selected.size > 0 && (
          <>
            <div className="w-px mx-1" style={{ background: "var(--color-rim)" }} />
            <span className="self-center text-sm" style={{ color: "var(--color-muted)" }}>
              已选择 {selected.size} 个
            </span>
            <Btn onClick={handleMarkIndexed} disabled={urlAction} variant="green">
              标记已发送
            </Btn>
            <Btn onClick={handleResetSelected} disabled={urlAction} variant="warn">
              重置选中项
            </Btn>
          </>
        )}
      </div>

      {/* Progress panel */}
      {panel.visible && (
        <div
          className="rounded-2xl border border-white/10 overflow-hidden bg-slate-900/80 backdrop-blur-2xl shadow-2xl"
        >
          <div
            className="flex items-center justify-between px-4 py-2.5 border-b"
            style={{ background: "rgba(0,0,0,0.2)", borderColor: "var(--color-rim)" }}
          >
            <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{panel.title}</span>
            {!panel.running && (
              <button
                onClick={() => setPanel((p) => ({ ...p, visible: false }))}
                className="text-xs"
                style={{ color: "var(--color-muted)" }}
              >
                关闭
              </button>
            )}
          </div>
          {panel.progress && (
            <div className="px-4 pt-3 pb-1">
              <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--color-muted)" }}>
                <span>{panel.progress.done} / {panel.progress.total} 网址</span>
                <span>{pct}%</span>
              </div>
              <div className="rounded-full h-1.5" style={{ background: "var(--color-rim)" }}>
                <div
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, background: "var(--color-accent)" }}
                />
              </div>
            </div>
          )}
          <div ref={logRef} className="px-4 py-3 max-h-44 overflow-y-auto space-y-0.5 font-mono text-xs">
            {panel.log.map((entry, i) => (
              <p
                key={i}
                style={{
                  color:
                    entry.kind === "error" ? "var(--color-danger)" :
                    entry.kind === "ok" ? "var(--color-success)" :
                    entry.kind === "url" ? "var(--color-muted)" :
                    "#e6edf3",
                }}
              >
                {entry.kind === "url" ? `✓ ${entry.text}` : entry.text}
              </p>
            ))}
            {panel.running && <p className="animate-pulse" style={{ color: "var(--color-rim)" }}>…</p>}
          </div>
        </div>
      )}

      {/* URL table */}
      <div>
        {/* Search + Filter tabs */}
        <div className="flex items-center gap-3 mb-3">
          <input
            type="text"
            value={urlSearch}
            onChange={(e) => { setUrlSearch(e.target.value); setUrlPage(1); setSelected(new Set()); }}
            placeholder="搜索网址…"
            className="flex-1 px-4 py-2 rounded-xl text-sm border border-white/10 bg-slate-900/50 text-slate-200 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all"
          />
          <div className="flex gap-1 shrink-0">
          {(["all", "pending", "indexed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setUrlFilter(f); setUrlPage(1); setSelected(new Set()); }}
              className="text-sm px-3 py-1.5 rounded-full capitalize transition-colors"
              style={{
                background: urlFilter === f ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
                color: urlFilter === f ? "#fff" : "var(--color-muted)",
              }}
            >
              {f === "all" ? "全部" : f === "pending" ? "待处理" : "已索引"}
            </button>
          ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 overflow-hidden bg-slate-900/60 backdrop-blur-xl shadow-xl">
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="bg-slate-900/80 border-b border-white/10">
                <th className="px-4 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={urls.length > 0 && selected.size === urls.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: "var(--color-muted)" }}>网址</th>
                <th className="text-left px-4 py-2.5 font-medium w-24" style={{ color: "var(--color-muted)" }}>状态</th>
                <th className="text-left px-4 py-2.5 font-medium w-28" style={{ color: "var(--color-muted)" }}>发送时间</th>
                <th className="text-left px-4 py-2.5 font-medium w-24" style={{ color: "var(--color-muted)" }}>最后修改</th>
                <th className="text-left px-4 py-2.5 font-medium w-28" style={{ color: "var(--color-muted)" }}>GSC</th>
              </tr>
            </thead>
            <tbody>
              {urls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                    暂无网址
                  </td>
                </tr>
              ) : urls.map((u, i) => (
                <tr
                  key={u.url}
                  style={{
                    background: selected.has(u.url)
                      ? "var(--color-accent-dim)"
                      : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    borderTop: "1px solid var(--color-rim)",
                  }}
                >
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={selected.has(u.url)} onChange={() => toggleSelect(u.url)} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs truncate max-w-xs">
                    <a href={u.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent-hover)" }}>
                      {u.url}
                    </a>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: u.indexed ? "rgba(31,111,235,0.15)" : "rgba(210,153,34,0.15)",
                        color: u.indexed ? "var(--color-accent-hover)" : "var(--color-warn)",
                      }}
                    >
                      {u.indexed ? "已发送" : "待处理"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: "var(--color-muted)" }}>
                    {u.indexed_at ? new Date(u.indexed_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: "var(--color-muted)" }}>
                    {u.lastmod ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {u.sc_synced_at
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: "rgba(63,185,80,0.15)", color: "var(--color-success)" }}>已索引</span>
                      : <span className="text-xs" style={{ color: "var(--color-rim)" }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {urlTotal > PAGE_SIZE && (
        <div className="flex items-center justify-between px-1 py-3 mt-1">
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            {(urlPage - 1) * PAGE_SIZE + 1}–{Math.min(urlPage * PAGE_SIZE, urlTotal)} / {urlTotal} 个网址
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setUrlPage((p) => Math.max(1, p - 1))}
              disabled={urlPage === 1}
              className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40"
              style={{ borderColor: "var(--color-rim)", color: "var(--color-muted)" }}
            >
              ← 上一页
            </button>
            <button
              onClick={() => setUrlPage((p) => p + 1)}
              disabled={urlPage * PAGE_SIZE >= urlTotal}
              className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40"
              style={{ borderColor: "var(--color-rim)", color: "var(--color-muted)" }}
            >
              下一页 →
            </button>
          </div>
        </div>
      )}
      </div>

      {/* Edit modal */}
      {showEdit && (
        <SiteForm
          site={site}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); loadSite(); }}
        />
      )}
    </div>
  );
}

// --- Small button helper ---
function Btn({
  children,
  onClick,
  disabled,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant: "dark" | "purple" | "ghost" | "green" | "warn";
}) {
  const styles: Record<string, string> = {
    dark: "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10",
    purple: "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_10px_rgba(139,92,246,0.3)] border border-violet-500/50",
    ghost: "bg-transparent hover:bg-white/5 text-slate-400 border border-white/10",
    green: "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    warn: "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40 transition-all hover:-translate-y-0.5 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";
import type { View, Site, UrlEntry, UrlFilter } from "../types";
import SiteForm from "./SiteForm";

interface Props {
  site: string;
  navigate: (v: View) => void;
}

type InlineLog = { text: string; kind: "info" | "ok" | "error" | "url" };

export default function SiteDetail({ site: siteName, navigate }: Props) {
  const [site, setSite] = useState<Site | null>(null);
  const [urls, setUrls] = useState<UrlEntry[]>([]);
  const [urlFilter, setUrlFilter] = useState<UrlFilter>("all");
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
    api.getSite(siteName).then(setSite);
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

  function handleRun() {
    if (esRef.current) esRef.current.close();
    setPanel({ visible: true, running: true, title: "运行索引", log: [], progress: null });

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

  async function handleFetchUrls() {
    setUrlAction(true);
    try {
      const r = await api.fetchUrls(siteName);
      addLog(`找到 ${r.found} · 新增 ${r.added} · 删除 ${r.removed}`, "ok");
      setPanel((p) => ({ ...p, visible: true }));
      loadSite();
      loadUrls();
    } catch (e: unknown) {
      addLog(`✗ ${e instanceof Error ? e.message : "失败"}`, "error");
      setPanel((p) => ({ ...p, visible: true }));
    } finally {
      setUrlAction(false);
    }
  }

  async function handleResetAll() {
    if (!confirm("将所有网址重置为待处理状态？")) return;
    setUrlAction(true);
    try {
      await api.resetUrls(siteName, []);
      setUrls((prev) => prev.map((u) => ({ ...u, indexed: false, indexed_at: null })));
      loadSite();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "失败");
    } finally {
      setUrlAction(false);
    }
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
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "失败");
    } finally {
      setUrlAction(false);
    }
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

  if (!site) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted">
        加载中…
      </div>
    );
  }

  const pct = panel.progress && panel.progress.total > 0
    ? Math.round((panel.progress.done / panel.progress.total) * 100)
    : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate({ name: "sites" })}
            className="text-xs mb-1 block text-muted hover:text-gray-200"
          >
            ← 站点
          </button>
          <h1 className="text-xl font-semibold">{site.name}</h1>
          <p className="text-xs mt-0.5 text-muted">{site.sitemap_url}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-5">
          <button
            onClick={() => setShowEdit(true)}
            className="px-4 py-2 rounded-lg text-sm border border-rim text-muted hover:text-gray-200"
          >
            编辑
          </button>
          {panel.running ? (
            <button
              onClick={handleStop}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-danger text-white"
            >
              停止
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={site.credentials.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
              title={site.credentials.length === 0 ? "未配置凭据" : ""}
            >
              ▶ 运行索引
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "总网址数", value: site.urls_total, color: "#e6edf3" },
          { label: "已发送", value: site.urls_indexed, color: "var(--accent-hover)" },
          { label: "GSC 已索引", value: site.urls_gsc_indexed ?? 0, color: "var(--success)" },
          { label: "待处理", value: site.urls_pending, color: site.urls_pending > 0 ? "var(--warn)" : "var(--muted)" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border p-4 text-center bg-navy-card border-rim">
            <p className="text-3xl font-bold font-mono" style={{ color: s.color }}>{s.value ?? "—"}</p>
            <p className="text-xs mt-1 text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {site.quota.length > 0 && (
        <div className="rounded-xl border p-4 space-y-3 bg-navy-card border-rim">
          <p className="text-sm font-medium">今日配额</p>
          {site.quota.map((q) => (
            <div key={q.credentials_file}>
              <div className="flex justify-between text-xs mb-1.5 text-muted">
                <span className="font-mono">{q.credentials_name}</span>
                <span style={{ color: q.remaining === 0 ? "var(--danger)" : q.remaining < 50 ? "var(--warn)" : "var(--success)" }}>
                  {q.used}/{q.limit} 已使用 · {q.remaining} 剩余
                </span>
              </div>
              <div className="rounded-full h-1.5 bg-rim">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (q.used / q.limit) * 100)}%`,
                    background: q.remaining === 0 ? "var(--danger)" : q.remaining < 50 ? "var(--warn)" : "var(--accent)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 rounded-xl border p-3 bg-navy-card border-rim">
        <Btn onClick={handleFetchUrls} disabled={urlAction || panel.running} variant="dark">
          获取网址
        </Btn>
        <div className="w-px mx-1 bg-rim" />
        <Btn onClick={handleResetAll} disabled={urlAction || panel.running} variant="ghost">
          重置全部
        </Btn>
        {selected.size > 0 && (
          <>
            <div className="w-px mx-1 bg-rim" />
            <span className="self-center text-sm text-muted">已选择 {selected.size} 个</span>
            <Btn onClick={handleResetSelected} disabled={urlAction} variant="warn">
              重置选中项
            </Btn>
          </>
        )}
      </div>

      {panel.visible && (
        <div className="rounded-xl border overflow-hidden bg-navy-card border-rim">
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-black/20 border-rim">
            <span className="text-xs font-medium text-muted">{panel.title}</span>
            {!panel.running && (
              <button
                onClick={() => setPanel((p) => ({ ...p, visible: false }))}
                className="text-xs text-muted hover:text-gray-200"
              >
                关闭
              </button>
            )}
          </div>
          {panel.progress && (
            <div className="px-4 pt-3 pb-1">
              <div className="flex justify-between text-xs mb-1.5 text-muted">
                <span>{panel.progress.done}/{panel.progress.total} 网址</span>
                <span>{pct}%</span>
              </div>
              <div className="rounded-full h-1.5 bg-rim">
                <div className="h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: "var(--accent)" }} />
              </div>
            </div>
          )}
          <div ref={logRef} className="px-4 py-3 max-h-44 overflow-y-auto space-y-0.5 font-mono text-xs">
            {panel.log.map((entry, i) => (
              <p key={i} style={{ color: entry.kind === "error" ? "var(--danger)" : entry.kind === "ok" ? "var(--success)" : entry.kind === "url" ? "var(--muted)" : "#e6edf3" }}>
                {entry.kind === "url" ? `✓ ${entry.text}` : entry.text}
              </p>
            ))}
            {panel.running && <p className="animate-pulse" style={{ color: "var(--rim)" }}>…</p>}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-3 mb-3">
          <input
            type="text"
            value={urlSearch}
            onChange={(e) => { setUrlSearch(e.target.value); setUrlPage(1); setSelected(new Set()); }}
            placeholder="搜索网址…"
            className="flex-1 px-3 py-1.5 rounded-lg text-sm border outline-none bg-navy-card border-rim text-gray-200"
          />
          <div className="flex gap-1 shrink-0">
            {(["all", "pending", "indexed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setUrlFilter(f); setUrlPage(1); setSelected(new Set()); }}
                className="text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{
                  background: urlFilter === f ? "var(--accent)" : "rgba(255,255,255,0.05)",
                  color: urlFilter === f ? "#fff" : "var(--muted)",
                }}
              >
                {f === "all" ? "全部" : f === "pending" ? "待处理" : "已索引"}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden border-rim">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy-card border-b border-rim">
                <th className="px-4 py-2.5 w-8">
                  <input type="checkbox" checked={urls.length > 0 && selected.size === urls.length} onChange={toggleSelectAll} />
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted">网址</th>
                <th className="text-left px-4 py-2.5 font-medium w-24 text-muted">状态</th>
                <th className="text-left px-4 py-2.5 font-medium w-28 text-muted">发送时间</th>
                <th className="text-left px-4 py-2.5 font-medium w-28 text-muted">GSC</th>
              </tr>
            </thead>
            <tbody>
              {urls.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                    暂无网址
                  </td>
                </tr>
              ) : urls.map((u, i) => (
                <tr
                  key={u.url}
                  style={{
                    background: selected.has(u.url) ? "var(--accent-dim)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    borderTop: "1px solid var(--rim)",
                  }}
                >
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={selected.has(u.url)} onChange={() => toggleSelect(u.url)} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs truncate max-w-xs">
                    <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-accent-hover hover:underline">
                      {u.url}
                    </a>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: u.indexed ? "rgba(31,111,235,0.15)" : "rgba(210,153,34,0.15)",
                        color: u.indexed ? "var(--accent-hover)" : "var(--warn)",
                      }}
                    >
                      {u.indexed ? "已发送" : "待处理"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {u.indexed_at ? new Date(u.indexed_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {u.sc_synced_at
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">已索引</span>
                      : <span className="text-xs" style={{ color: "var(--rim)" }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {urlTotal > PAGE_SIZE && (
          <div className="flex items-center justify-between px-1 py-3 mt-1">
            <span className="text-xs text-muted">
              {(urlPage - 1) * PAGE_SIZE + 1}–{Math.min(urlPage * PAGE_SIZE, urlTotal)} / {urlTotal} 个网址
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setUrlPage((p) => Math.max(1, p - 1))}
                disabled={urlPage === 1}
                className="px-3 py-1 text-sm rounded-lg border border-rim disabled:opacity-40 text-muted"
              >
                ← 上一页
              </button>
              <button
                onClick={() => setUrlPage((p) => p + 1)}
                disabled={urlPage * PAGE_SIZE >= urlTotal}
                className="px-3 py-1 text-sm rounded-lg border border-rim disabled:opacity-40 text-muted"
              >
                下一页 →
              </button>
            </div>
          </div>
        )}
      </div>

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

function Btn({ children, onClick, disabled, variant }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; variant: "dark" | "ghost" | "warn" | "green" }) {
  const styles: Record<string, React.CSSProperties> = {
    dark: { background: "#21262d", color: "#e6edf3", border: "1px solid var(--rim)" },
    ghost: { background: "transparent", color: "var(--muted)", border: "1px solid var(--rim)" },
    green: { background: "rgba(63,185,80,0.1)", color: "var(--success)", border: "1px solid rgba(63,185,80,0.3)" },
    warn: { background: "rgba(210,153,34,0.1)", color: "var(--warn)", border: "1px solid rgba(210,153,34,0.3)" },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-opacity"
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

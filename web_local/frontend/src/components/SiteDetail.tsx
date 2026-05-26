import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { View } from "./App";
import SiteForm from "./SiteForm";
import AnalyticsCharts from "./AnalyticsCharts";
import { useI18n } from "../lib/i18n";

interface Props {
  site: string;
  navigate: (v: View) => void;
}

type InlineLog = { text: string; kind: "info" | "ok" | "error" | "url" };

type SortKey = "url" | "category" | "status" | "priority" | "indexed_at" | "lastmod" | "gsc_status" | "coverage_state";
type SortDir = "asc" | "desc";

const COVERAGE_STATE_MAP: Record<string, string> = {
  "Submitted and indexed": "已提交且已收录",
  "Crawled - currently not indexed": "已抓取 - 尚未编入索引",
  "Discovered - currently not indexed": "已发现 - 当前未编入索引",
  "URL is not indexed": "未编入索引",
  "Submitted URL seems to be a Soft 404": "疑似 Soft 404",
  "Blocked by robots.txt": "被 robots.txt 阻止",
  "Blocked due to unauthorized request (403)": "被 403 阻止",
  "Not found (404)": "404 未找到",
  "Server error (5XX)": "服务器错误 (5XX)",
  "Indexed": "已收录",
};

export default function SiteDetail({ site: siteName, navigate }: Props) {
  const { t } = useI18n();
  const [site, setSite] = useState<any>(null);
  const [urls, setUrls] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [urlFilter, setUrlFilter] = useState<"all" | "pending" | "indexed">("all");
  const [urlCategory, setUrlCategory] = useState<string>("all");
  const [urlSearch, setUrlSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"google" | "bing">("google");
  const [urlPage, setUrlPage] = useState(1);
  const [urlTotal, setUrlTotal] = useState(0);
  const PAGE_SIZE = 100;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [urlAction, setUrlAction] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("url");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [panel, setPanel] = useState<{
    visible: boolean;
    running: boolean;
    title: string;
    log: InlineLog[];
    progress: { done: number; total: number } | null;
  }>({ visible: false, running: false, title: "", log: [], progress: null });

  const logRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  function addLog(text: string, kind: InlineLog["kind"] = "info") {
    setPanel((p) => ({ ...p, log: [...p.log, { text, kind }] }));
  }

  function loadSite() {
    api.getSiteStats(siteName).then(setSite);
  }

  function loadUrls(filter = urlFilter, page = urlPage, search = urlSearch, category = urlCategory) {
    api.getUrls(siteName, filter, page, PAGE_SIZE, search, category, activeTab).then((r) => {
      setUrls(r.data);
      setUrlTotal(r.total);
    });
    api.getCategories(siteName).then((r) => {
      setCategories(r.categories);
    });
  }

  useEffect(() => {
    loadSite();
    loadUrls();
    return () => {
      esRef.current?.close();
      fetchAbortRef.current?.abort();
    };
  }, [siteName]);

  useEffect(() => {
    loadUrls(urlFilter, urlPage, debouncedSearch, urlCategory);
  }, [urlFilter, urlPage, debouncedSearch, urlCategory, activeTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(urlSearch);
      setUrlPage(1);
      setSelected(new Set());
    }, 300);
    return () => clearTimeout(timer);
  }, [urlSearch]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [panel.log]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortedUrls(list: any[]): any[] {
    const sorted = [...list].sort((a, b) => {
      let va: string | number | boolean = "";
      let vb: string | number | boolean = "";
      switch (sortKey) {
        case "url": va = a.url; vb = b.url; break;
        case "category": va = a.category || ""; vb = b.category || ""; break;
        case "status": va = a.indexed ? 1 : 0; vb = b.indexed ? 1 : 0; break;
        case "priority": { const po: Record<string, number> = { high: 3, normal: 2, low: 1 }; va = po[a.priority] || 2; vb = po[b.priority] || 2; break; }
        case "indexed_at": va = a.indexed_at || ""; vb = b.indexed_at || ""; break;
        case "lastmod": va = a.lastmod || ""; vb = b.lastmod || ""; break;
        case "gsc_status": va = a.sc_synced_at ? 1 : 0; vb = b.sc_synced_at ? 1 : 0; break;
        case "coverage_state": va = a.coverage_state || ""; vb = b.coverage_state || ""; break;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }

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
        addLog(`✓ ${ev.indexed} 已提交 · ${ev.pending} 待处理`, "ok");
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
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = null;
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
        addLog(`✓ ${ev.synced} 个网址存在搜索表现 · GSC 查询共 ${ev.total} 个`, "ok");
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

  // --- Submit to Bing ---
  function handleSubmitBing() {
    if (esRef.current) esRef.current.close();
    setPanel({ visible: true, running: true, title: t("detail.submit_bing"), log: [], progress: null });

    const es = new EventSource(api.submitBingStreamUrl(siteName));
    esRef.current = es;

    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === "status") addLog(ev.message);
      if (ev.type === "progress") {
        setPanel((p) => ({ ...p, progress: { done: ev.submitted, total: ev.total } }));
      }
      if (ev.type === "done") {
        addLog(`✓ ${ev.message}`, "ok");
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

  function formatInspectionError(msg: string): string {
    if (msg.includes("403") && (msg.includes("not own") || msg.includes("not part"))) {
      return `⚠ 403 权限错误：服务账户无权检测此 URL。\n\n` +
        `可能原因及解决方法：\n` +
        `1. site_url 配置与 GSC 属性不匹配 — 请在站点设置中检查「GSC 属性」字段\n` +
        `   • 域名属性格式：sc-domain:example.com\n` +
        `   • URL 前缀属性格式：https://example.com/\n` +
        `2. 服务账户未被添加为 GSC 属性的所有者 — 请在 Google Search Console 中添加服务账户邮箱为所有者\n` +
        `3. URL 不属于配置的 GSC 属性范围 — 请确保所有 URL 都在 site_url 指定的属性下`;
    }
    return msg;
  }

  // --- Inspect Selected ---
  async function handleInspect() {
    if (selected.size === 0) return;
    const urlsList = Array.from(selected);
    setPanel({ visible: true, running: true, title: t("detail.inspect"), log: [], progress: null });

    try {
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      const response = await api.inspectStream(siteName, urlsList, controller.signal);
      if (!response.ok) {
        addLog("无法启动检测", "error");
        setPanel((p) => ({ ...p, running: false }));
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const ev: any = JSON.parse(dataLine.slice(6));

          if (ev.type === "inspected") {
            const statusIcon = ev.status_category === "indexed" ? "✅" :
              ev.status_category === "crawled_not_indexed" ? "🔄" :
              ev.status_category === "pending_crawl" ? "⏳" :
              ev.status_category === "blocked" ? "🚫" :
              ev.status_category === "error" ? "❌" : "❓";
            const coverageCn = COVERAGE_STATE_MAP[ev.category] || ev.category;
            addLog(`${statusIcon} ${coverageCn} — ${ev.url}`, ev.is_indexed ? "ok" : "url");
            setUrls((prev) =>
              prev.map((u) =>
                u.url === ev.url ? {
                  ...u,
                  category: ev.category,
                  coverage_state: ev.category,
                  status_category: ev.status_category,
                  verdict: ev.verdict,
                  indexed: ev.is_indexed || u.indexed,
                  inspected_at: new Date().toISOString().slice(0, 10),
                } : u
              )
            );
          }
          if (ev.type === "done") {
            addLog(`✓ 完成 — 已检测 ${ev.count} 个网址，${ev.indexed ?? 0} 个已收录`, "ok");
            setPanel((p) => ({ ...p, running: false }));
            loadSite();
            loadUrls();
          }
          if (ev.type === "error") {
            addLog(`✗ ${formatInspectionError(ev.message)}`, "error");
            setPanel((p) => ({ ...p, running: false }));
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") addLog(`✗ ${e.message}`, "error");
      setPanel((p) => ({ ...p, running: false }));
    } finally {
      fetchAbortRef.current = null;
    }
  }

  // --- Inspect All Pending ---
  function handleInspectPending() {
    if (esRef.current) esRef.current.close();
    setPanel({ visible: true, running: true, title: "深度检测所有待处理 URL", log: [], progress: null });

    const es = new EventSource(api.inspectPendingStreamUrl(siteName));
    esRef.current = es;

    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === "status") addLog(ev.message);
      if (ev.type === "inspected") {
        const statusIcon = ev.status_category === "indexed" ? "✅" :
          ev.status_category === "crawled_not_indexed" ? "🔄" :
          ev.status_category === "pending_crawl" ? "⏳" :
          ev.status_category === "blocked" ? "🚫" :
          ev.status_category === "error" ? "❌" : "❓";
        const coverageCn = COVERAGE_STATE_MAP[ev.category] || ev.category;
        setPanel((p) => ({
          ...p,
          log: [...p.log, { text: `${statusIcon} ${coverageCn} — ${ev.url}`, kind: ev.is_indexed ? "ok" : "url" as const }],
          progress: { done: ev.done, total: ev.total },
        }));
        setUrls((prev) =>
          prev.map((u) =>
            u.url === ev.url ? {
              ...u,
              category: ev.category,
              coverage_state: ev.category,
              status_category: ev.status_category,
              verdict: ev.verdict,
              indexed: ev.is_indexed || u.indexed,
              inspected_at: new Date().toISOString().slice(0, 10),
            } : u
          )
        );
      }
      if (ev.type === "done") {
        addLog(`✓ 完成 — 已检测 ${ev.count} 个，${ev.indexed ?? 0} 个已收录`, "ok");
        setPanel((p) => ({ ...p, running: false }));
        es.close();
        esRef.current = null;
        loadSite();
        loadUrls();
      }
      if (ev.type === "error") {
        addLog(`✗ ${formatInspectionError(ev.message)}`, "error");
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
    if (!confirm(t("detail.confirm_reset_all"))) return;
    setUrlAction(true);
    try {
      await api.resetUrls(siteName, []);
      setUrls((prev) => prev.map((u) => ({ ...u, indexed: false, indexed_at: null })));
      setSelected(new Set());
      loadSite();
    } catch (e: any) { alert(e.message); }
    finally { setUrlAction(false); }
  }

  async function handleSetPriority(priority: string) {
    if (selected.size === 0) return;
    setUrlAction(true);
    try {
      await api.setPriority(siteName, [...selected], priority);
      setUrls((prev) =>
        prev.map((u) => selected.has(u.url) ? { ...u, priority } : u)
      );
      setSelected(new Set());
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
    <div className="flex items-center justify-center h-full text-sm text-slate-500 dark:text-slate-400">
      {t("sites.loading")}
    </div>
  );

  const pct = panel.progress && panel.progress.total > 0
    ? Math.round((panel.progress.done / panel.progress.total) * 100)
    : 0;

  function SortHeader({ label, field, className = "" }: { label: string; field: SortKey; className?: string }) {
    const active = sortKey === field;
    return (
      <th
        className={`text-left px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400 cursor-pointer select-none hover:text-slate-800 dark:hover:text-white transition-colors ${className}`}
        onClick={() => handleSort(field)}
      >
        {label}
        {active && <span className="ml-1 text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </th>
    );
  }

  const displayUrls = sortedUrls(urls);

  return (
    <div className="p-6 max-w-[90rem] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate({ name: "sites" })}
            className="text-xs mb-1 block text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            {t("detail.back")}
          </button>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-white">{site.name}</h1>
          <p className="text-xs mt-0.5 text-slate-500 dark:text-slate-400">{site.sitemap_url}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-5">
          <button onClick={() => setShowEdit(true)} className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-white transition-all" title={t("detail.edit")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex space-x-1 rounded-xl bg-slate-100 dark:bg-slate-900/40 p-1 backdrop-blur-md border border-slate-200 dark:border-white/5 w-max shadow-sm">
        <button
          onClick={() => setActiveTab("google")}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
            activeTab === "google" ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-md border border-slate-200 dark:border-white/10" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/5"
          }`}
        >
          {t("detail.tab_google")}
        </button>
        <button
          onClick={() => setActiveTab("bing")}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
            activeTab === "bing" ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-md border border-slate-200 dark:border-white/10" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/5"
          }`}
        >
          {t("detail.tab_bing")}
        </button>
      </div>

      {activeTab === "google" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <AnalyticsCharts
            total={site.urls_total}
            indexed={site.urls_submitted ?? site.urls_indexed}
            pending={Math.max(0, site.urls_total - (site.urls_submitted ?? site.urls_indexed))}
            gscIndexed={site.urls_inspection_indexed ?? 0}
            crawledNotIndexed={site.urls_crawled_not_indexed ?? 0}
            pendingCrawl={site.urls_pending_crawl ?? 0}
            blocked={site.urls_blocked ?? 0}
            inspected={site.urls_inspected ?? 0}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Google Actions */}
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-5 space-y-4 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl">
              <h2 className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-2">{t("detail.google_title")}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{t("detail.google_desc")}</p>
              <div className="flex flex-wrap gap-3">
                {panel.running ? (
                  <button
                    onClick={handleStop}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
                  >
                    {t("detail.stop")}
                  </button>
                ) : (
                  <button
                    onClick={handleRun}
                    disabled={site.credentials?.length === 0 || urlAction}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                  >
                    {t("detail.run")}
                  </button>
                )}
                <Btn onClick={handleSyncGsc} disabled={urlAction || panel.running} variant="purple">
                  {t("detail.sync_gsc")}
                </Btn>
                <Btn onClick={handleInspectPending} disabled={urlAction || panel.running} variant="green">
                  深度检测
                </Btn>
              </div>
            </div>

            {/* Quota bars */}
            {site.quota?.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-5 space-y-4 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl">
                <p className="text-sm font-medium text-slate-800 dark:text-white">{t("detail.quota_today")}</p>
                <div className="space-y-4 max-h-32 overflow-y-auto pr-2">
                  {site.quota.map((q: any) => (
                    <div key={q.credentials_file}>
                      <div className="flex justify-between text-xs mb-1.5 text-slate-500 dark:text-slate-400">
                        <span className="font-mono truncate mr-2 text-slate-600 dark:text-slate-300" title={q.credentials_name}>{q.credentials_name}</span>
                        <span className="shrink-0" style={{
                          color: q.remaining === 0 ? "var(--color-danger)" :
                            q.remaining < 50 ? "var(--color-warn)" : "var(--color-success)"
                        }}>
                          {q.used} / {q.limit} · {q.remaining} 剩余
                        </span>
                      </div>
                      <div className="rounded-full h-1.5 bg-slate-200 dark:bg-white/10">
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
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "bing" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-5 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl flex flex-col justify-between">
              <div>
                <h2 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2">{t("detail.tab_bing")}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                  {t("detail.bing_help_p1")}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {panel.running ? (
                  <button
                    onClick={handleStop}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
                  >
                    {t("detail.stop")}
                  </button>
                ) : (
                  <Btn onClick={handleSubmitBing} disabled={urlAction || panel.running} variant="purple">
                    {t("detail.submit_bing")}
                  </Btn>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-800/40 p-5 shadow-inner">
              <p className="font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                <span className="text-amber-500 dark:text-amber-400 text-lg">💡</span>
                {t("detail.bing_help_title")}
              </p>
              <div className="space-y-2.5 text-sm text-slate-600 dark:text-slate-400">
                <p className="flex gap-2"><span>1.</span><span>{t("detail.bing_help_s1")}</span></p>
                <p className="flex gap-2">
                  <span>2.</span>
                  <span>{t("detail.bing_help_s2")} <code className="text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 px-1.5 py-0.5 rounded ml-1 font-mono text-xs">yourkey.txt</code></span>
                </p>
                <p className="flex gap-2"><span>3.</span><span>{t("detail.bing_help_s3")}</span></p>
                <p className="flex gap-2">
                  <span>4.</span>
                  <span>{t("detail.bing_help_s4")} <code className="text-violet-600 dark:text-violet-400 font-mono text-xs mx-1">https://yourdomain.com/yourkey.txt</code> {t("detail.bing_help_s5")}</span>
                </p>
                <p className="flex gap-2 text-slate-500 dark:text-slate-300"><span>5.</span><span>{t("detail.bing_help_s6")}</span></p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* General URL Management Actions */}
      <div
        className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 dark:border-white/10 p-4 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl items-center"
      >
        <Btn onClick={handleFetchUrls} disabled={urlAction || panel.running} variant="dark">
          {t("detail.fetch")}
        </Btn>
        <Btn onClick={handleResetAll} disabled={urlAction || panel.running} variant="ghost">
          {t("detail.reset_all")}
        </Btn>
        {selected.size > 0 && (
          <>
            <div className="w-px h-6 mx-1 bg-slate-200 dark:bg-white/10" />
            <span className="self-center text-sm text-slate-500 dark:text-slate-400">
              {t("detail.selected")} {selected.size} {t("detail.items")}
            </span>
            <Btn onClick={handleInspect} disabled={urlAction || panel.running} variant="purple">
              {t("detail.inspect")}
            </Btn>
            <Btn onClick={handleMarkIndexed} disabled={urlAction} variant="green">
              {t("detail.mark_sent")}
            </Btn>
            <Btn onClick={handleResetSelected} disabled={urlAction} variant="warn">
              {t("detail.reset_selected")}
            </Btn>
            <div className="w-px h-6 mx-1 bg-slate-200 dark:bg-white/10" />
            <span className="self-center text-xs text-slate-400 dark:text-slate-500">{t("detail.priority")}</span>
            <Btn onClick={() => handleSetPriority("high")} disabled={urlAction} variant="warn">
              🔴 {t("detail.priority_high")}
            </Btn>
            <Btn onClick={() => handleSetPriority("normal")} disabled={urlAction} variant="ghost">
              {t("detail.priority_normal")}
            </Btn>
            <Btn onClick={() => handleSetPriority("low")} disabled={urlAction} variant="ghost">
              {t("detail.priority_low")}
            </Btn>
          </>
        )}
      </div>

      {/* Progress panel */}
      {panel.visible && (
        <div
          className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white/90 dark:bg-slate-900/80 backdrop-blur-2xl shadow-2xl"
        >
          <div
            className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20"
          >
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{panel.title}</span>
            {!panel.running && (
              <button
                onClick={() => setPanel((p) => ({ ...p, visible: false }))}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
              >
                {t("detail.close")}
              </button>
            )}
          </div>
          {panel.progress && (
            <div className="px-4 pt-3 pb-1">
              <div className="flex justify-between text-xs mb-1.5 text-slate-500 dark:text-slate-400">
                <span>{panel.progress.done} / {panel.progress.total} {t("detail.urls")}</span>
                <span>{pct}%</span>
              </div>
              <div className="rounded-full h-1.5 bg-slate-200 dark:bg-white/10">
                <div
                  className="h-1.5 rounded-full transition-all duration-300 bg-violet-600 dark:bg-violet-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
          <div ref={logRef} className="px-4 py-3 max-h-44 overflow-y-auto space-y-0.5 font-mono text-xs">
            {panel.log.map((entry, i) => (
              <p
                key={i}
                className={
                  entry.kind === "error" ? "text-red-500 dark:text-red-400 whitespace-pre-wrap" :
                  entry.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" :
                  entry.kind === "url" ? "text-slate-500 dark:text-slate-400" :
                  "text-slate-800 dark:text-slate-200"
                }
              >
                {entry.kind === "url" ? `✓ ${entry.text}` : entry.text}
              </p>
            ))}
            {panel.running && <p className="animate-pulse text-slate-400 dark:text-slate-500">…</p>}
          </div>
        </div>
      )}

      {/* URL table */}
      <div>
        {activeTab === "bing" && (
          <div className="mb-4 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-500/20 flex items-center gap-2">
            <span>ℹ️</span>
            <p><strong>注意：</strong>此页签显示 Bing IndexNow 的提交记录；切换回 Google 页签可查看 Google 通知与 Inspection 状态。</p>
          </div>
        )}

        {/* Search + Filter tabs */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <input
            type="text"
            value={urlSearch}
            onChange={(e) => setUrlSearch(e.target.value)}
            placeholder={t("detail.search")}
            className="flex-1 px-4 py-2 rounded-xl text-sm border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all min-w-[200px]"
          />
          <select
            value={urlCategory}
            onChange={(e) => { setUrlCategory(e.target.value); setUrlPage(1); setSelected(new Set()); }}
            className="px-4 py-2 rounded-xl text-sm border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 outline-none focus:border-violet-500 transition-all"
          >
            <option value="all">{t("detail.all_categories")}</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="flex gap-1 shrink-0">
          {(["all", "pending", "indexed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setUrlFilter(f); setUrlPage(1); setSelected(new Set()); }}
              className={`text-sm px-3 py-1.5 rounded-full transition-colors ${
                urlFilter === f
                  ? "bg-violet-600 text-white"
                  : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
              }`}
            >
              {f === "all" ? t("detail.all") : f === "pending" ? t("detail.pending_count") : t("detail.indexed")}
            </button>
          ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl">
          <table className="w-full text-sm text-slate-600 dark:text-slate-300">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-white/10">
                <th className="px-4 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={urls.length > 0 && selected.size === urls.length}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 dark:border-white/20"
                  />
                </th>
                <SortHeader label={t("detail.url")} field="url" />
                <SortHeader label="Inspection 状态" field="coverage_state" className="w-44" />
                <SortHeader label={t("detail.status")} field="status" className="w-24" />
                <SortHeader label={t("detail.priority_label")} field="priority" className="w-20" />
                <SortHeader label={t("detail.sent_time")} field="indexed_at" className="w-28" />
                <SortHeader label={t("detail.lastmod")} field="lastmod" className="w-24" />
                {activeTab === "google" && <SortHeader label="搜索表现" field="gsc_status" className="w-28" />}
              </tr>
            </thead>
            <tbody>
              {displayUrls.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === "google" ? 8 : 7} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    {t("detail.no_urls")}
                  </td>
                </tr>
              ) : displayUrls.map((u, i) => {
                const coverageCn = u.coverage_state ? (COVERAGE_STATE_MAP[u.coverage_state] || u.coverage_state) : null;
                return (
                <tr
                  key={u.url}
                  className={`border-t border-slate-100 dark:border-white/5 ${
                    selected.has(u.url)
                      ? "bg-violet-50 dark:bg-violet-500/10"
                      : i % 2 === 0 ? "bg-transparent" : "bg-slate-50 dark:bg-white/[0.015]"
                  }`}
                >
                  <td className="px-4 py-2">
                    <input type="checkbox" className="rounded border-slate-300 dark:border-white/20" checked={selected.has(u.url)} onChange={() => toggleSelect(u.url)} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs truncate max-w-xs">
                    <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 hover:underline">
                      {u.url}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {u.status_category ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.status_category === "indexed" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" :
                        u.status_category === "crawled_not_indexed" ? "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400" :
                        u.status_category === "pending_crawl" ? "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" :
                        u.status_category === "blocked" ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400" :
                        u.status_category === "error" ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400" :
                        "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"
                      }`} title={u.coverage_state || u.category || ""}>
                        {coverageCn || (u.status_category === "indexed" ? "已收录" :
                         u.status_category === "crawled_not_indexed" ? "已抓取 - 尚未编入索引" :
                         u.status_category === "pending_crawl" ? "已发现 - 当前未编入索引" :
                         u.status_category === "blocked" ? "被阻止" :
                         u.status_category === "error" ? "错误" : u.category || "—")}
                      </span>
                    ) : (
                      <span title={u.category || ""}>{u.category || "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                         (activeTab === "bing" ? u.bing_submitted : u.indexed)
                          ? "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
                          : "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                      }`}
                    >
                       {activeTab === "bing"
                         ? (u.bing_submitted ? "已提交" : t("sites.pending"))
                         : u.completed_via === "inspection"
                           ? "已验证收录"
                           : u.completed_via === "gsc_performance"
                             ? "已有搜索表现"
                             : u.indexed ? t("detail.sent") : t("sites.pending")}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.priority === "high" ? "bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400" :
                      u.priority === "low" ? "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400" :
                      "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-500"
                    }`}>
                      {u.priority === "high" ? t("detail.priority_high") : u.priority === "low" ? t("detail.priority_low") : t("detail.priority_normal")}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                     {(activeTab === "bing" ? u.bing_submitted : u.indexed_at)
                       ? new Date(activeTab === "bing" ? u.bing_submitted : u.indexed_at).toLocaleDateString()
                       : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {u.lastmod ?? "—"}
                  </td>
                  {activeTab === "google" && (
                  <td className="px-4 py-2">
                    {u.sc_synced_at
                       ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">已出现</span>
                      : <span className="text-xs text-slate-300 dark:text-white/20">—</span>
                    }
                  </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {urlTotal > PAGE_SIZE && (
        <div className="flex items-center justify-between px-1 py-3 mt-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {(urlPage - 1) * PAGE_SIZE + 1}–{Math.min(urlPage * PAGE_SIZE, urlTotal)} / {urlTotal} {t("detail.urls")}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setUrlPage((p) => Math.max(1, p - 1))}
              disabled={urlPage === 1}
              className="px-3 py-1 text-sm rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              {t("detail.prev")}
            </button>
            <button
              onClick={() => setUrlPage((p) => p + 1)}
              disabled={urlPage * PAGE_SIZE >= urlTotal}
              className="px-3 py-1 text-sm rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              {t("detail.next")}
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
    dark: "bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-white/10",
    purple: "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_10px_rgba(139,92,246,0.3)] border border-violet-500/50",
    ghost: "bg-transparent hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-white/10",
    green: "bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30",
    warn: "bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30",
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

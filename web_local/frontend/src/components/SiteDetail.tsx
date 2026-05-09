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

  function loadUrls(filter = urlFilter, page = urlPage, search = urlSearch, category = urlCategory) {
    api.getUrls(siteName, filter, page, PAGE_SIZE, search, category).then((r) => {
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
    return () => esRef.current?.close();
  }, [siteName]);

  useEffect(() => {
    loadUrls(urlFilter, urlPage, debouncedSearch, urlCategory);
  }, [urlFilter, urlPage, debouncedSearch, urlCategory]);

  // Debounce search input by 300ms
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
          {/* Stats and Charts */}
          <AnalyticsCharts 
            total={site.urls_total} 
            indexed={site.urls_indexed} 
            pending={site.urls_pending} 
            gscIndexed={site.urls_gsc_indexed ?? 0}
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
                          {q.used} / {q.limit} {t("settings.urls_per_day").replace("200 个 URL", "").replace("200 URLs per day", "used")} · {q.remaining} {t("detail.urls")} 剩余
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
            {/* Bing Actions */}
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

            {/* Bing Help Guide */}
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
                  entry.kind === "error" ? "text-red-500 dark:text-red-400" :
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
        {/* Bing Table Note */}
        {activeTab === "bing" && (
          <div className="mb-4 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-500/20 flex items-center gap-2">
            <span>ℹ️</span> 
            <p><strong>注意：</strong>下面显示的 URL“已发送”状态主要反映 Google 的提交记录。Bing IndexNow 的提交是独立的且不会单独追踪此列表中的每一项的缓存记录。</p>
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
                <th className="text-left px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">{t("detail.url")}</th>
                <th className="text-left px-4 py-2.5 font-medium w-24 text-slate-500 dark:text-slate-400">{t("detail.category")}</th>
                <th className="text-left px-4 py-2.5 font-medium w-24 text-slate-500 dark:text-slate-400">{t("detail.status")}</th>
                <th className="text-left px-4 py-2.5 font-medium w-20 text-slate-500 dark:text-slate-400">{t("detail.priority_label")}</th>
                <th className="text-left px-4 py-2.5 font-medium w-28 text-slate-500 dark:text-slate-400">{t("detail.sent_time")}</th>
                <th className="text-left px-4 py-2.5 font-medium w-24 text-slate-500 dark:text-slate-400">{t("detail.lastmod")}</th>
                {activeTab === "google" && <th className="text-left px-4 py-2.5 font-medium w-28 text-slate-500 dark:text-slate-400">GSC</th>}
              </tr>
            </thead>
            <tbody>
              {urls.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === "google" ? 8 : 7} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    {t("detail.no_urls")}
                  </td>
                </tr>
              ) : urls.map((u, i) => (
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
                    {u.category}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.indexed 
                          ? "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400" 
                          : "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                      }`}
                    >
                      {activeTab === "bing" && u.indexed ? "已缓存/发送" : u.indexed ? t("detail.sent") : t("sites.pending")}
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
                    {u.indexed_at ? new Date(u.indexed_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {u.lastmod ?? "—"}
                  </td>
                  {activeTab === "google" && (
                  <td className="px-4 py-2">
                    {u.sc_synced_at
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">{t("detail.indexed")}</span>
                      : <span className="text-xs text-slate-300 dark:text-white/20">—</span>
                    }
                  </td>
                  )}
                </tr>
              ))}
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

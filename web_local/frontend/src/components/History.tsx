import { Fragment, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";

interface HistoryDetail {
  url: string;
  action: string;
  source?: string;
  status?: string;
  detail?: string;
}

interface HistoryEntry {
  id?: string;
  site: string;
  operation?: string;
  date: string;
  time: string;
  indexed: number;
  synced?: number;
  checked?: number;
  skipped?: number;
  errors: number;
  duration_s: number;
  details?: HistoryDetail[];
}

function operationLabel(operation = "google_submit") {
  switch (operation) {
    case "selected_submit": return "选中提交";
    case "gsc_sync": return "GSC 同步";
    case "inspection": return "深度检测";
    case "inspection_pending": return "待处理检测";
    default: return "Google 提交";
  }
}

function detailLabel(detail: HistoryDetail) {
  switch (detail.action) {
    case "submitted": return "已提交";
    case "skipped_indexed": return "已收录，跳过";
    case "gsc_synced": return "已有搜索表现";
    case "inspection_indexed": return "Inspection 已收录";
    case "inspection_checked": return "Inspection 已检查";
    case "error": return "错误";
    default: return detail.action;
  }
}

function detailClass(detail: HistoryDetail) {
  switch (detail.action) {
    case "submitted": return "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400";
    case "skipped_indexed":
    case "gsc_synced":
    case "inspection_indexed":
      return "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400";
    case "error": return "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400";
    default: return "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300";
  }
}

export default function History() {
  const { t } = useI18n();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getHistory("", 100);
      setHistory(data.reverse()); // newest first
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleClear() {
    if (!confirm(t("history.confirm_clear"))) return;
    await api.clearHistory();
    setHistory([]);
    setExpanded(null);
  }

  const totalSubmitted = history.reduce((s, h) => s + (h.indexed || 0), 0);
  const totalErrors = history.reduce((s, h) => s + (h.errors || 0), 0);
  const totalRuns = history.length;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{t("history.title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("history.subtitle")}</p>
        </div>
        {history.length > 0 && (
          <button
            onClick={handleClear}
            className="px-4 py-2 rounded-lg text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
          >
            {t("history.clear")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-4 bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 shadow-inner text-center">
          <p className="text-2xl font-bold font-mono text-violet-500 dark:text-violet-400">{totalRuns}</p>
          <p className="text-xs text-slate-500 mt-1">{t("history.runs")}</p>
        </div>
        <div className="rounded-xl p-4 bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 shadow-inner text-center">
          <p className="text-2xl font-bold font-mono text-emerald-500 dark:text-emerald-400">{totalSubmitted}</p>
          <p className="text-xs text-slate-500 mt-1">{t("history.total_indexed")}</p>
        </div>
        <div className="rounded-xl p-4 bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 shadow-inner text-center">
          <p className="text-2xl font-bold font-mono text-red-500 dark:text-red-400">{totalErrors}</p>
          <p className="text-xs text-slate-500 mt-1">{t("history.total_errors")}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-slate-500 justify-center p-8">
          <div className="w-4 h-4 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
          {t("sites.loading")}
        </div>
      ) : history.length === 0 ? (
        <div className="border border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-16 text-center bg-white/60 dark:bg-slate-900/30">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-slate-500 dark:text-slate-400 font-medium mb-1">{t("history.no_records")}</p>
          <p className="text-sm text-slate-400 dark:text-slate-500">{t("history.no_records_hint")}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl">
          <table className="w-full text-sm text-slate-600 dark:text-slate-300">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900/80 border-b border-slate-200 dark:border-white/10">
                <th className="text-left px-4 py-3 font-medium text-slate-500">操作</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">{t("history.site")}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">{t("history.date")}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">{t("history.time")}</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">{t("history.indexed")}</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">同步/检测</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">{t("history.errors")}</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">{t("history.duration")}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => {
                const key = h.id ?? `${h.date}-${h.time}-${i}`;
                const isOpen = expanded === key;
                const details = h.details ?? [];
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className={`cursor-pointer border-t border-slate-100 dark:border-white/5 hover:bg-violet-50/60 dark:hover:bg-violet-500/5 ${i % 2 === 0 ? "bg-transparent" : "bg-slate-50/50 dark:bg-white/[0.015]"}`}
                    >
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300">
                          {operationLabel(h.operation)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-white">{h.site}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{h.date}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{h.time}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-emerald-500 dark:text-emerald-400 font-mono">{h.indexed || 0}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400 font-mono">
                        {(h.synced || h.checked || h.skipped)
                          ? `${h.synced || 0}/${h.checked || 0}/${h.skipped || 0}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {h.errors > 0 ? (
                          <span className="text-red-500 dark:text-red-400 font-mono">{h.errors}</span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">0</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400 font-mono">
                        {h.duration_s}s
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-black/20">
                        <td colSpan={8} className="px-4 py-4">
                          {details.length === 0 ? (
                            <p className="text-xs text-slate-400">这条旧记录没有逐 URL 明细。</p>
                          ) : (
                            <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                              {details.map((d, idx) => (
                                <div key={`${d.url}-${idx}`} className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-slate-900/50 px-3 py-2">
                                  <span className={`mt-0.5 shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${detailClass(d)}`}>
                                    {detailLabel(d)}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="block font-mono text-xs text-violet-600 dark:text-violet-400 truncate hover:underline">
                                      {d.url}
                                    </a>
                                    {(d.detail || d.status || d.source) && (
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 break-words">
                                        {[d.detail, d.status, d.source].filter(Boolean).join(" · ")}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100 dark:border-white/5">
            点击任意记录可展开查看逐 URL 明细。同步/检测列依次为 GSC 同步数 / Inspection 检测数 / 已收录跳过数。
          </p>
        </div>
      )}
    </div>
  );
}

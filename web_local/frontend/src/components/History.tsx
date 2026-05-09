import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";

interface HistoryEntry {
  site: string;
  date: string;
  time: string;
  indexed: number;
  errors: number;
  duration_s: number;
}

export default function History() {
  const { t } = useI18n();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
  }

  const totalIndexed = history.reduce((s, h) => s + h.indexed, 0);
  const totalErrors = history.reduce((s, h) => s + h.errors, 0);
  const totalRuns = history.length;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("history.title")}</h1>
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

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-4 bg-slate-900/50 border border-white/10 shadow-inner text-center">
          <p className="text-2xl font-bold font-mono text-violet-400">{totalRuns}</p>
          <p className="text-xs text-slate-500 mt-1">{t("history.runs")}</p>
        </div>
        <div className="rounded-xl p-4 bg-slate-900/50 border border-white/10 shadow-inner text-center">
          <p className="text-2xl font-bold font-mono text-emerald-400">{totalIndexed}</p>
          <p className="text-xs text-slate-500 mt-1">{t("history.total_indexed")}</p>
        </div>
        <div className="rounded-xl p-4 bg-slate-900/50 border border-white/10 shadow-inner text-center">
          <p className="text-2xl font-bold font-mono text-red-400">{totalErrors}</p>
          <p className="text-xs text-slate-500 mt-1">{t("history.total_errors")}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-slate-500 justify-center p-8">
          <div className="w-4 h-4 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
          {t("sites.loading")}
        </div>
      ) : history.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-2xl p-16 text-center bg-slate-900/30">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-slate-400 font-medium mb-1">{t("history.no_records")}</p>
          <p className="text-sm text-slate-500">{t("history.no_records_hint")}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden bg-slate-900/60 backdrop-blur-xl shadow-xl">
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="bg-slate-900/80 border-b border-white/10">
                <th className="text-left px-4 py-3 font-medium text-slate-500">{t("history.site")}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">{t("history.date")}</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">{t("history.time")}</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">{t("history.indexed")}</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">{t("history.errors")}</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">{t("history.duration")}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr
                  key={i}
                  className={`border-t border-white/5 ${i % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"}`}
                >
                  <td className="px-4 py-2.5 font-medium text-white">{h.site}</td>
                  <td className="px-4 py-2.5 text-slate-400">{h.date}</td>
                  <td className="px-4 py-2.5 text-slate-400">{h.time}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-emerald-400 font-mono">{h.indexed}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {h.errors > 0 ? (
                      <span className="text-red-400 font-mono">{h.errors}</span>
                    ) : (
                      <span className="text-slate-600">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-400 font-mono">
                    {h.duration_s}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

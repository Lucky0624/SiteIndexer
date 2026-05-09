import { useState, useEffect } from "react";
import { api } from "../lib/api";

interface HistoryEntry {
  site: string;
  date: string;
  time: string;
  indexed: number;
  errors: number;
  duration_s: number;
}

export default function History() {
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
    if (!confirm("确定要清空所有索引历史记录吗？")) return;
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
          <h1 className="text-2xl font-bold text-white">索引历史</h1>
          <p className="text-sm text-slate-500 mt-1">查看每次索引运行的详细记录</p>
        </div>
        {history.length > 0 && (
          <button
            onClick={handleClear}
            className="px-4 py-2 rounded-lg text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
          >
            清空记录
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-4 bg-slate-900/50 border border-white/10 shadow-inner text-center">
          <p className="text-2xl font-bold font-mono text-violet-400">{totalRuns}</p>
          <p className="text-xs text-slate-500 mt-1">总运行次数</p>
        </div>
        <div className="rounded-xl p-4 bg-slate-900/50 border border-white/10 shadow-inner text-center">
          <p className="text-2xl font-bold font-mono text-emerald-400">{totalIndexed}</p>
          <p className="text-xs text-slate-500 mt-1">累计索引数</p>
        </div>
        <div className="rounded-xl p-4 bg-slate-900/50 border border-white/10 shadow-inner text-center">
          <p className="text-2xl font-bold font-mono text-red-400">{totalErrors}</p>
          <p className="text-xs text-slate-500 mt-1">累计错误数</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-slate-500 justify-center p-8">
          <div className="w-4 h-4 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
          加载中…
        </div>
      ) : history.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-2xl p-16 text-center bg-slate-900/30">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-slate-400 font-medium mb-1">暂无记录</p>
          <p className="text-sm text-slate-500">运行一次索引后，这里将自动出现历史记录。</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 overflow-hidden bg-slate-900/60 backdrop-blur-xl shadow-xl">
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="bg-slate-900/80 border-b border-white/10">
                <th className="text-left px-4 py-3 font-medium text-slate-500">站点</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">日期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-500">时间</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">已索引</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">错误</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500">耗时</th>
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

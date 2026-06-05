import { PieChart, Pie, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  total: number;
  indexed: number;
  pending: number;
  gscIndexed: number;
  gscSeen?: number;
  crawledNotIndexed?: number;
  pendingCrawl?: number;
  blocked?: number;
  inspected?: number;
}

export default function AnalyticsCharts({ total, indexed, pending, gscIndexed, gscSeen = 0, crawledNotIndexed = 0, pendingCrawl = 0, blocked = 0, inspected = 0 }: Props) {
  const submitData = [
    { name: '已提交 / 已确认', value: indexed, fill: '#8b5cf6' },
    { name: '未知 / 待提交', value: pending, fill: '#334155' },
  ];

  const gscData = [
    { name: 'Inspection 已确认收录', value: gscIndexed, fill: '#10b981' },
    { name: '已抓取 - 尚未编入索引', value: crawledNotIndexed, fill: '#3b82f6' },
    { name: '已发现 - 当前未编入索引', value: pendingCrawl, fill: '#f59e0b' },
    { name: '被阻止 / 错误', value: blocked, fill: '#ef4444' },
    { name: '未检测', value: Math.max(0, total - gscIndexed - crawledNotIndexed - pendingCrawl - blocked), fill: '#64748b' },
  ].filter(d => d.value > 0);

  if (total === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        暂无数据，请先获取网址
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div className="flex-1 h-64 bg-white/80 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xl">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-300 mb-2">处理状态分布</h3>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={submitData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
              itemStyle={{ color: '#e2e8f0' }}
            />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex-1 h-64 bg-white/80 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xl">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-300 mb-2">
          URL Inspection 状态分布
          {inspected > 0 && <span className="text-xs text-slate-400 ml-2">({inspected} 已检测)</span>}
        </h3>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={gscData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
              itemStyle={{ color: '#e2e8f0' }}
            />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col gap-3 w-full md:w-48">
        <div className="bg-white/80 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-xl flex-1 flex flex-col justify-center relative overflow-hidden">
          <p className="text-3xl font-bold font-mono text-slate-800 dark:text-white mb-1">{((indexed / total) * 100).toFixed(1)}%</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">已处理比例</p>
        </div>
        <div className="bg-white/80 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-xl flex-1 flex flex-col justify-center relative overflow-hidden">
          <p className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mb-1">{gscIndexed}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Inspection 已收录</p>
        </div>
        <div className="bg-white/80 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-xl flex-1 flex flex-col justify-center relative overflow-hidden">
          <p className="text-3xl font-bold font-mono text-blue-600 dark:text-blue-400 mb-1">{gscSeen}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">GSC 已出现</p>
        </div>
      </div>
    </div>
  );
}

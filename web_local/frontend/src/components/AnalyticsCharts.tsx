import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  total: number;
  indexed: number;
  pending: number;
  gscIndexed: number;
  crawledNotIndexed?: number;
  pendingCrawl?: number;
  blocked?: number;
  inspected?: number;
}

export default function AnalyticsCharts({ total, indexed, pending, gscIndexed, crawledNotIndexed = 0, pendingCrawl = 0, blocked = 0, inspected = 0 }: Props) {
  const submitData = [
    { name: '已发送到 Google', value: indexed },
    { name: '未发送 / 待处理', value: pending },
  ];

  const submitColors = ['#8b5cf6', '#334155'];

  const gscData = [
    { name: '已收录', value: gscIndexed },
    { name: '已抓取 - 尚未编入索引', value: crawledNotIndexed },
    { name: '已发现 - 当前未编入索引', value: pendingCrawl },
    { name: '被阻止 / 错误', value: blocked },
    { name: '未检测', value: Math.max(0, total - gscIndexed - crawledNotIndexed - pendingCrawl - blocked) },
  ].filter(d => d.value > 0);

  const gscColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#64748b'];

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
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-300 mb-2">提交状态分布</h3>
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
            >
              {submitData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={submitColors[index % submitColors.length]} />
              ))}
            </Pie>
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
          Google 索引状态分布
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
            >
              {gscData.map((_, index) => (
                <Cell key={`gsc-cell-${index}`} fill={gscColors[index % gscColors.length]} />
              ))}
            </Pie>
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
          <p className="text-sm text-slate-500 dark:text-slate-400">已提交比例</p>
        </div>
        <div className="bg-white/80 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-xl flex-1 flex flex-col justify-center relative overflow-hidden">
          <p className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mb-1">{gscIndexed}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">GSC 已收录</p>
        </div>
      </div>
    </div>
  );
}

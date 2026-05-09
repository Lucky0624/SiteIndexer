import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  total: number;
  indexed: number;
  pending: number;
  gscIndexed: number;
}

export default function AnalyticsCharts({ total, indexed, pending, gscIndexed }: Props) {
  const data = [
    { name: '已发送到 Google', value: indexed },
    { name: '未发送 / 待处理', value: pending },
  ];
  
  // Violet for indexed, Slate for pending
  const COLORS = ['#8b5cf6', '#334155'];

  if (total === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        暂无数据，请先获取网址
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div className="flex-1 h-64 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-xl">
        <h3 className="text-sm font-medium text-slate-300 mb-2">收录状态分布</h3>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
              itemStyle={{ color: '#e2e8f0' }}
            />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }}/>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex-1 flex flex-col gap-3">
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl flex-1 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <svg className="w-16 h-16 text-violet-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
          </div>
          <p className="text-3xl font-bold font-mono text-white mb-1">{((indexed / total) * 100).toFixed(1)}%</p>
          <p className="text-sm text-slate-400">已提交比例</p>
        </div>
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl flex-1 flex flex-col justify-center relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
            <svg className="w-16 h-16 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          </div>
          <p className="text-3xl font-bold font-mono text-emerald-400 mb-1">{gscIndexed}</p>
          <p className="text-sm text-slate-400">Google Search Console 已收录</p>
        </div>
      </div>
    </div>
  );
}

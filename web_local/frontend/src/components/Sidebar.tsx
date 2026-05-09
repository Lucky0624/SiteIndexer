import type { View } from "./App";

interface Props {
  view: View;
  navigate: (v: View) => void;
}

const NAV = [
  { name: "sites" as const, label: "站点" },
  { name: "history" as const, label: "历史" },
  { name: "settings" as const, label: "设置" },
  { name: "help" as const, label: "帮助" },
];

export default function Sidebar({ view, navigate }: Props) {
  const active = view.name === "site" ? "sites" : view.name;

  return (
    <aside
      className="flex flex-col w-52 shrink-0 border-r border-white/10 bg-slate-900/60 backdrop-blur-xl"
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <img src="/android-chrome-192x192.png" alt="SiteIndexer" className="w-7 h-7 rounded-md shrink-0" />
          <span className="font-semibold text-sm">SiteIndexer</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 text-sm">
        {NAV.map((item) => {
          const isActive = active === item.name;
          return (
            <button
              key={item.name}
              onClick={() => navigate({ name: item.name })}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-300 ease-out flex items-center ${
                isActive
                  ? "bg-violet-500/20 text-violet-400 font-medium shadow-[inset_0_0_10px_rgba(139,92,246,0.2)]"
                  : "text-slate-400 hover:text-white hover:bg-white/10"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-white/5 text-xs text-slate-500">
        local
      </div>
    </aside>
  );
}

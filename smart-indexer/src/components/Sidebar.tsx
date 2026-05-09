import type { View } from "../types";

interface Props {
  view: View;
  navigate: (v: View) => void;
}

const NAV = [
  { name: "sites" as const, label: "站点" },
  { name: "settings" as const, label: "设置" },
  { name: "help" as const, label: "帮助" },
];

export default function Sidebar({ view, navigate }: Props) {
  const active = view.name === "site" ? "sites" : view.name;

  return (
    <aside className="flex flex-col w-52 shrink-0 border-r border-rim bg-navy-mid">
      <div className="px-4 py-4 border-b border-rim">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-white font-bold text-sm">
            SI
          </div>
          <span className="font-semibold text-sm">SmartIndexer</span>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 text-sm">
        {NAV.map((item) => {
          const isActive = active === item.name;
          return (
            <button
              key={item.name}
              onClick={() => navigate({ name: item.name })}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                isActive ? "font-medium" : ""
              }`}
              style={{
                background: isActive ? "var(--accent-dim)" : "transparent",
                color: isActive ? "var(--accent-hover)" : "var(--muted)",
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-rim text-xs text-muted">
        v1.0.0
      </div>
    </aside>
  );
}

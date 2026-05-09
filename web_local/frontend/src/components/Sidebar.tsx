import type { View } from "./App";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";

interface Props {
  view: View;
  navigate: (v: View) => void;
}

const NAV_KEYS = [
  { name: "sites" as const, key: "nav.sites" as const },
  { name: "history" as const, key: "nav.history" as const },
  { name: "settings" as const, key: "nav.settings" as const },
  { name: "help" as const, key: "nav.help" as const },
];

export default function Sidebar({ view, navigate }: Props) {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
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
        {NAV_KEYS.map((item) => {
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
              {t(item.key)}
            </button>
          );
        })}
      </nav>

      {/* Toggles */}
      <div className="px-4 py-3 border-t border-white/5 text-xs text-slate-500 flex justify-between items-center">
        <div className="flex gap-2">
          <button
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            className="hover:text-slate-300 transition-colors"
          >
            {lang === "zh" ? "EN" : "中"}
          </button>
          <button
            onClick={toggle}
            className="hover:text-slate-300 transition-colors"
          >
            {theme === "dark" ? "☀️ " + t("theme.light") : "🌙 " + t("theme.dark")}
          </button>
        </div>
      </div>
    </aside>
  );
}

import type { View } from "./App";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";

interface Props {
  view: View;
  navigate: (v: View) => void;
}

const NAV_KEYS = [
  { 
    name: "sites" as const, 
    key: "nav.sites" as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="9" y1="21" x2="9" y2="9"></line>
      </svg>
    )
  },
  { 
    name: "history" as const, 
    key: "nav.history" as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
    )
  },
  { 
    name: "settings" as const, 
    key: "nav.settings" as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    )
  },
  { 
    name: "help" as const, 
    key: "nav.help" as const,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    )
  },
];

export default function Sidebar({ view, navigate }: Props) {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const active = view.name === "site" ? "sites" : view.name;

  return (
    <aside
      className="flex flex-col w-56 shrink-0 m-4 rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl z-20"
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-3">
          <img src="/android-chrome-192x192.png" alt="智能快速收录" className="w-8 h-8 rounded-lg shrink-0 shadow-sm" />
          <span className="font-bold text-base text-slate-800 dark:text-slate-100 tracking-tight">智能快速收录</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 text-sm font-medium">
        {NAV_KEYS.map((item) => {
          const isActive = active === item.name;
          return (
            <button
              key={item.name}
              onClick={() => navigate({ name: item.name })}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-300 ease-out flex items-center gap-3 ${
                isActive
                  ? "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400 shadow-sm dark:shadow-[inset_0_0_10px_rgba(139,92,246,0.2)]"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10"
              }`}
            >
              <span className={isActive ? "opacity-100" : "opacity-70"}>{item.icon}</span>
              {t(item.key)}
            </button>
          );
        })}
      </nav>

      {/* Toggles */}
      <div className="p-4 border-t border-slate-200 dark:border-white/5">
        <div className="flex bg-slate-100 dark:bg-slate-800/50 rounded-xl p-1 gap-1 border border-slate-200 dark:border-white/5 shadow-inner">
          <button
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            className="flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm flex items-center justify-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>
            {lang === "zh" ? "EN" : "中文"}
          </button>
          <div className="w-px bg-slate-300 dark:bg-slate-700 my-1"></div>
          <button
            onClick={toggle}
            className="flex-1 py-1.5 text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm flex items-center justify-center gap-1.5"
          >
            {theme === "dark" ? (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> {t("theme.light")}</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> {t("theme.dark")}</>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}

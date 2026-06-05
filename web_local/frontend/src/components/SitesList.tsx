import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { View } from "./App";
import SiteForm from "./SiteForm";
import { useI18n } from "../lib/i18n";

interface Site {
  name: string;
  sitemap_url: string;
  urls_total: number;
  urls_indexed: number;
  urls_pending: number;
}

interface Props {
  navigate: (v: View) => void;
}

export default function SitesList({ navigate }: Props) {
  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setSites(await api.getSites());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(e: React.MouseEvent, name: string) {
    e.stopPropagation();
    if (!confirm(`${t("sites.confirm_delete")} "${name}" ?`)) return;
    await api.deleteSite(name);
    load();
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full text-sm text-slate-500">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
        {t("sites.loading")}
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{t("sites.title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("sites.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all hover:-translate-y-0.5 active:translate-y-0"
        >
          {t("sites.new")}
        </button>
      </div>

      {sites.length === 0 ? (
        <div className="border border-dashed border-slate-300 dark:border-white/10 rounded-2xl p-20 text-center bg-white/60 dark:bg-slate-900/30 backdrop-blur-xl">
          <div className="text-5xl mb-4 text-violet-500">▦</div>
          <p className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">{t("sites.empty")}</p>
          <p className="text-sm text-slate-500">{t("sites.empty_hint")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sites.map((site) => {
            const pct = site.urls_total > 0 ? Math.round((site.urls_indexed / site.urls_total) * 100) : 0;
            return (
              <div
                key={site.name}
                onClick={() => navigate({ name: "site", site: site.name })}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-white/10 px-6 py-5 cursor-pointer bg-white/80 dark:bg-slate-900/50 backdrop-blur-xl shadow-lg hover:shadow-violet-500/10 hover:border-violet-500/40 hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-all duration-300"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="font-semibold text-slate-800 dark:text-white text-base truncate">{site.name}</p>
                    {site.urls_pending === 0 && site.urls_total > 0 && (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        {t("sites.all_done")}
                      </span>
                    )}
                    {site.urls_pending > 0 && (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                        {site.urls_pending} {t("sites.pending")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate mb-3">{site.sitemap_url}</p>

                  {/* Progress bar */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 shrink-0 font-mono">{site.urls_indexed}/{site.urls_total}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={(e) => handleDelete(e, site.name)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-white/10 bg-transparent text-slate-500 hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                  >
                    {t("sites.delete")}
                  </button>
                  <span className="text-slate-400 dark:text-slate-600 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors text-lg">→</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <SiteForm
          site={null}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

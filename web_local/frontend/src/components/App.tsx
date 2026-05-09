import { useState } from "react";
import Sidebar from "./Sidebar";
import SitesList from "./SitesList";
import SiteDetail from "./SiteDetail";
import Settings from "./Settings";
import Help from "./Help";
import History from "./History";

export type View =
  | { name: "sites" }
  | { name: "site"; site: string }
  | { name: "settings" }
  | { name: "history" }
  | { name: "help" };

export default function App() {
  const [view, setView] = useState<View>({ name: "sites" });
  const [lastSite, setLastSite] = useState<string | null>(null);

  if (view.name === "site" && view.site !== lastSite) {
    setLastSite(view.site);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f172a] text-slate-200">
      <Sidebar view={view} navigate={setView} />
      <main className="flex-1 overflow-auto relative z-10">
        <div className={view.name === "sites" ? "block h-full" : "hidden"}>
          <SitesList navigate={setView} />
        </div>
        <div className={view.name === "site" ? "block h-full" : "hidden"}>
          {lastSite && <SiteDetail site={lastSite} navigate={setView} />}
        </div>
        <div className={view.name === "settings" ? "block h-full" : "hidden"}>
          <Settings />
        </div>
        <div className={view.name === "help" ? "block h-full" : "hidden"}>
          <Help />
        </div>
        <div className={view.name === "history" ? "block h-full" : "hidden"}>
          <History />
        </div>
      </main>
    </div>
  );
}

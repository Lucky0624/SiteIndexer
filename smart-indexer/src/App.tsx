import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import SiteDetail from "./components/SiteDetail";
import Settings from "./components/Settings";
import Help from "./components/Help";
import type { View } from "./types";

export default function App() {
  const [view, setView] = useState<View>({ name: "sites" });

  return (
    <div className="flex h-screen overflow-hidden bg-navy-dark text-gray-200">
      <Sidebar view={view} navigate={setView} />
      <main className="flex-1 overflow-auto">
        {view.name === "sites" && <Dashboard navigate={setView} />}
        {view.name === "site" && <SiteDetail site={view.site} navigate={setView} />}
        {view.name === "settings" && <Settings />}
        {view.name === "help" && <Help />}
      </main>
    </div>
  );
}

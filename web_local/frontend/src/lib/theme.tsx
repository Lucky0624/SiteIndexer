import { createContext, useContext, useState, useEffect } from "react";

type Theme = "dark" | "light";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "dark",
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem("siteindexer_theme") as Theme) || "dark"; }
    catch { return "dark"; }
  });

  useEffect(() => {
    try { localStorage.setItem("siteindexer_theme", theme); } catch {}
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

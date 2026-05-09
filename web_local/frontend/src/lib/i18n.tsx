import { createContext, useContext, useState, useEffect } from "react";

type Lang = "zh" | "en";

const translations = {
  // Sidebar
  "nav.sites": { zh: "站点", en: "Sites" },
  "nav.history": { zh: "历史", en: "History" },
  "form.credentials": { zh: "使用的凭据", en: "Credentials Used" },
  "form.edit_site": { zh: "编辑站点", en: "Edit Site" },
  "form.new_site": { zh: "新建站点", en: "New Site" },
  "form.saving": { zh: "保存中...", en: "Saving..." },
  "form.cancel": { zh: "取消", en: "Cancel" },
  "form.site_name": { zh: "站点名称", en: "Site Name" },
  "form.track_lastmod": { zh: "跟踪 lastmod", en: "Track lastmod" },
  "nav.help": { zh: "帮助", en: "Help" },

  // SitesList
  "sites.title": { zh: "我的站点", en: "My Sites" },
  "sites.subtitle": { zh: "管理你的网站并批量提交索引请求", en: "Manage your websites and submit indexing requests" },
  "sites.new": { zh: "+ 新建站点", en: "+ New Site" },
  "sites.empty": { zh: "还没有站点", en: "No sites yet" },
  "sites.empty_hint": { zh: "点击右上角\"新建站点\"，添加你的第一个网站开始索引。", en: "Click \"New Site\" above to add your first website." },
  "sites.all_done": { zh: "全部完成", en: "All done" },
  "sites.pending": { zh: "待处理", en: "Pending" },
  "sites.delete": { zh: "删除", en: "Delete" },
  "sites.confirm_delete": { zh: "确定要删除站点", en: "Delete site" },
  "sites.loading": { zh: "加载中…", en: "Loading…" },

  // SiteDetail
  "detail.back": { zh: "← 返回", en: "← Back" },
  "detail.edit": { zh: "编辑", en: "Edit" },
  "detail.run": { zh: "▶ 运行索引", en: "▶ Run Indexing" },
  "detail.stop": { zh: "⏹ 停止", en: "⏹ Stop" },
  "detail.fetch": { zh: "获取网址", en: "Fetch URLs" },
  "detail.sync_gsc": { zh: "从 GSC 同步", en: "Sync from GSC" },
  "detail.submit_bing": { zh: "提交到 Bing", en: "Submit to Bing" },
  "detail.reset_all": { zh: "重置全部", en: "Reset All" },
  "detail.mark_sent": { zh: "标记已发送", en: "Mark Sent" },
  "detail.reset_selected": { zh: "重置选中项", en: "Reset Selected" },
  "detail.selected": { zh: "已选择", en: "Selected" },
  "detail.items": { zh: "个", en: "" },
  "detail.search": { zh: "搜索网址…", en: "Search URLs…" },
  "detail.all": { zh: "全部", en: "All" },
  "detail.status": { zh: "状态", en: "Status" },
  "detail.priority_label": { zh: "优先级", en: "Priority" },
  "detail.category": { zh: "分类", en: "Category" },
  "detail.sent_time": { zh: "发送时间", en: "Sent At" },
  "detail.lastmod": { zh: "最后修改", en: "Lastmod" },
  "detail.url": { zh: "网址", en: "URL" },
  "detail.sent": { zh: "已发送", en: "Sent" },
  "detail.no_urls": { zh: "暂无网址", en: "No URLs" },
  "detail.indexed": { zh: "已索引", en: "Indexed" },
  "detail.priority_high": { zh: "高", en: "High" },
  "detail.priority_normal": { zh: "正常", en: "Normal" },
  "detail.priority_low": { zh: "低", en: "Low" },
  "detail.priority": { zh: "优先级:", en: "Priority:" },
  "detail.confirm_reset_all": { zh: "确定要重置所有 URL 为待处理吗？", en: "Reset all URLs to pending?" },
  "detail.total": { zh: "总网址", en: "Total URLs" },
  "detail.sent_to_google": { zh: "已提交", en: "Submitted" },
  "detail.gsc_indexed": { zh: "GSC 已收录", en: "GSC Indexed" },
  "detail.pending_count": { zh: "待处理", en: "Pending" },
  "detail.all_categories": { zh: "全部分类", en: "All Categories" },
  "detail.tab_google": { zh: "Google 索引", en: "Google Indexing" },
  "detail.tab_bing": { zh: "Bing IndexNow", en: "Bing IndexNow" },
  "detail.bing_help_title": { zh: "如何验证 Bing IndexNow？", en: "How to verify Bing IndexNow?" },
  "detail.edit": { zh: "编辑", en: "Edit" },
  "detail.stop": { zh: "停止", en: "Stop" },
  "detail.google_title": { zh: "Google API 提交与同步", en: "Google API Submit & Sync" },
  "detail.google_desc": { zh: "通过 Google Indexing API 快速提交网页，或从 Search Console 同步真实的收录状态。", en: "Submit pages quickly via Google Indexing API, or sync real index status from Search Console." },
  "detail.quota_today": { zh: "今日配额", en: "Today's Quota" },
  "detail.close": { zh: "关闭", en: "Close" },
  "detail.urls": { zh: "网址", en: "URLs" },
  "detail.prev": { zh: "← 上一页", en: "← Prev" },
  "detail.next": { zh: "下一页 →", en: "Next →" },
  "detail.bing_help_p1": { zh: "如果点击提交后出现 403 错误，说明 Bing 需要验证你的网站所有权。只需完成以下步骤：", en: "If you get a 403 error, Bing needs to verify site ownership. Follow these steps:" },
  "detail.bing_help_s1": { zh: "1. 复制你的 API Key", en: "1. Copy your API Key" },
  "detail.bing_help_s2": { zh: "2. 在电脑上创建一个以该 Key 命名的纯文本文件，例如", en: "2. Create a text file named after the Key, e.g." },
  "detail.bing_help_s3": { zh: "3. 在这个文件里面只写入一行内容，也就是你的 Key 本身，不要有空格或换行。", en: "3. Write only your Key inside the file, with no spaces or newlines." },
  "detail.bing_help_s4": { zh: "4. 将这个文件上传到你的网站根目录，确保通过浏览器访问", en: "4. Upload this file to your website's root directory, ensuring it's accessible via" },
  "detail.bing_help_s5": { zh: "能正常打开。", en: "can be opened normally." },
  "detail.bing_help_s6": { zh: "5. 完成后，再次点击提交，403 错误就会消失啦！", en: "5. Once done, click submit again, and the 403 error will disappear!" },

  // Settings
  "settings.title": { zh: "设置", en: "Settings" },
  "settings.subtitle": { zh: "管理 Google 服务账户凭据", en: "Manage Google service account credentials" },
  "settings.google_sa": { zh: "Google 服务账户", en: "Google Service Account" },
  "settings.upload_desc": { zh: "上传您的 Google 服务账户 JSON 密钥文件以调用 Google Indexing API。", en: "Upload your Google service account JSON key file to use the Google Indexing API." },
  "settings.quota_per_day": { zh: "每个 GCP 项目每天最多允许提交", en: "Each GCP project allows up to" },
  "settings.urls_per_day": { zh: "200 个 URL", en: "200 URLs per day" },
  "settings.upload_drag": { zh: "点击或拖拽上传服务账户 JSON", en: "Click or drag to upload service account JSON" },
  "settings.upload_hint": { zh: "仅支持 Google 服务账户密钥文件 (.json)", en: "Only Google service account key files (.json)" },
  "settings.uploading": { zh: "上传中…", en: "Uploading…" },
  "settings.stored": { zh: "已存储的凭据", en: "Stored Credentials" },
  "settings.no_creds": { zh: "暂无存储的凭据。请上传一个服务账户 JSON 文件。", en: "No credentials stored. Upload a service account JSON file." },
  "settings.project": { zh: "项目", en: "Project" },
  "settings.quota_title": { zh: "关于配额限制", en: "About Quota Limits" },
  "settings.quota_desc": { zh: "Google Indexing API 每个 GCP 项目每天允许", en: "Google Indexing API allows" },
  "settings.quota_tip": { zh: "通过添加来自不同 GCP 项目的服务账户，可以叠加配额", en: "Add service accounts from different GCP projects to stack quotas" },
  "settings.bing_title": { zh: "Bing IndexNow", en: "Bing IndexNow" },
  "settings.bing_desc": { zh: "配置 IndexNow API Key 以支持一键提交 URL 到 Bing 搜索引擎。", en: "Configure IndexNow API Key to submit URLs to Bing search engine." },
  "settings.bing_key": { zh: "IndexNow API Key", en: "IndexNow API Key" },
  "settings.bing_key_hint": { zh: "在 indexnow.org 注册获取，或使用自定义 key", en: "Get from indexnow.org or use a custom key" },
  "settings.bing_keyloc": { zh: "Key 存放路径 (可选)", en: "Key Location (Optional)" },
  "settings.bing_keyloc_hint": { zh: "默认根目录。若放在子目录，请填完整 URL，如 https://.../key.txt", en: "Leave blank for root. If in subfolder, enter full URL." },
  "settings.save": { zh: "保存", en: "Save" },
  "settings.saved": { zh: "已保存", en: "Saved" },

  // History
  "history.title": { zh: "索引历史", en: "Indexing History" },
  "history.subtitle": { zh: "查看每次索引运行的详细记录", en: "View details of each indexing run" },
  "history.clear": { zh: "清空记录", en: "Clear All" },
  "history.confirm_clear": { zh: "确定要清空所有索引历史记录吗？", en: "Clear all indexing history?" },
  "history.runs": { zh: "总运行次数", en: "Total Runs" },
  "history.total_indexed": { zh: "累计索引数", en: "Total Indexed" },
  "history.total_errors": { zh: "累计错误数", en: "Total Errors" },
  "history.no_records": { zh: "暂无记录", en: "No records" },
  "history.no_records_hint": { zh: "运行一次索引后，这里将自动出现历史记录。", en: "Run indexing once and history will appear here." },
  "history.site": { zh: "站点", en: "Site" },
  "history.date": { zh: "日期", en: "Date" },
  "history.time": { zh: "时间", en: "Time" },
  "history.indexed": { zh: "已索引", en: "Indexed" },
  "history.errors": { zh: "错误", en: "Errors" },
  "history.duration": { zh: "耗时", en: "Duration" },

  // Theme
  "theme.dark": { zh: "深色", en: "Dark" },
  "theme.light": { zh: "浅色", en: "Light" },

  // Misc
  "common.delete": { zh: "删除", en: "Delete" },
  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.confirm": { zh: "确认", en: "Confirm" },
} as const;

type TransKey = keyof typeof translations;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TransKey) => string;
}

const I18nContext = createContext<I18nCtx>({
  lang: "zh",
  setLang: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem("siteindexer_lang") as Lang) || "zh"; }
    catch { return "zh"; }
  });

  useEffect(() => {
    try { localStorage.setItem("siteindexer_lang", lang); } catch {}
  }, [lang]);

  const t = (key: TransKey): string => {
    const entry = translations[key];
    return entry ? entry[lang] : key;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

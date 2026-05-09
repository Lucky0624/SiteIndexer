export type View =
  | { name: "sites" }
  | { name: "site"; site: string }
  | { name: "settings" }
  | { name: "help" };

export interface Site {
  name: string;
  sitemap_url: string;
  site_url: string;
  track_lastmod: boolean;
  credentials: string[];
  urls_total: number;
  urls_indexed: number;
  urls_pending: number;
  urls_gsc_indexed: number;
  quota: QuotaEntry[];
}

export interface QuotaEntry {
  credentials_file: string;
  credentials_name: string;
  used: number;
  limit: number;
  remaining: number;
}

export interface Credential {
  filename: string;
  client_email: string;
  project_id: string;
}

export interface UrlEntry {
  url: string;
  indexed: boolean;
  indexed_at: string | null;
  lastmod: string | null;
  sc_synced_at: string | null;
}

export interface UrlPage {
  data: UrlEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface FetchResult {
  found: number;
  added: number;
  removed: number;
  reset: number;
}

export interface SiteCreate {
  name: string;
  sitemap_url: string;
  site_url?: string;
  track_lastmod?: boolean;
  credentials?: string[];
  skip_extensions?: string[];
  exclude_patterns?: string[];
  include_patterns?: string[];
}

export interface SiteUpdate {
  sitemap_url?: string;
  site_url?: string;
  track_lastmod?: boolean;
  credentials?: string[];
  skip_extensions?: string[];
  exclude_patterns?: string[];
  include_patterns?: string[];
}

export type UrlFilter = "all" | "pending" | "indexed";

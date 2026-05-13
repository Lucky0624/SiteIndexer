from siteindexer.sitemaps import fetch_urls_from_sitemap_recursive
from siteindexer.utils import (
    load_json, save_urls_to_file, APP_LOGGER,
    normalize_config, migrate_urls, filter_urls, sync_urls,
    update_quota_batch, build_indexing_plan,
)
from siteindexer.indexing import index_url

config = normalize_config(load_json("config.json"))
sites = config["sites"]
proxy = config.get("proxy")

for site in sites:
    APP_LOGGER.info(f"Processing site: {site['name']} — {site['sitemap_url']}")

    site_proxy = site.get("proxy", proxy)
    raw_urls = fetch_urls_from_sitemap_recursive(site["sitemap_url"], proxy=site_proxy)
    sitemap_urls = filter_urls(raw_urls, site)
    APP_LOGGER.info(f"Total URLs after filtering: {len(sitemap_urls)}")

    existing_urls = migrate_urls(load_json(site["urls_file"]))

    result = sync_urls(existing_urls, sitemap_urls, raw_urls, site)
    save_urls_to_file(existing_urls, site["urls_file"])

    if result["new_count"]:
        APP_LOGGER.info(f"New URLs added: {result['new_count']}")
    if result["del_count"]:
        APP_LOGGER.info(f"Deleted URLs: {result['del_count']}")
    if result["reset_count"]:
        APP_LOGGER.info(f"Lastmod reset URLs: {result['reset_count']}")

    plan = build_indexing_plan(site["credentials"])
    total_capacity = sum(cap for _, cap in plan)
    pending_urls = [url for url, entry in existing_urls.items() if not entry["indexed"]]
    urls_to_index = pending_urls[:total_capacity]
    APP_LOGGER.info(f"Total URLs to index: {len(urls_to_index)} (capacity: {total_capacity})")

    indexed_tally = {}
    url_cursor = 0
    global_index = 1

    for creds_file, capacity in plan:
        batch = urls_to_index[url_cursor: url_cursor + capacity]
        if not batch:
            break
        batch_indexed = 0
        quota_exhausted = False
        for url in batch:
            try:
                result = index_url(url, creds_file, global_index, proxy=site_proxy)
                if result:
                    existing_urls[url]["indexed"] = True
                    batch_indexed += 1
                    global_index += 1
            except Exception as e:
                APP_LOGGER.warning(f"Error indexing {url}: {e}")
                save_urls_to_file(existing_urls, site["urls_file"])
                if "Rate limit" in str(e) or "429" in str(e):
                    APP_LOGGER.info(f"Quota exhausted for {creds_file}, switching to next credential.")
                    quota_exhausted = True
                    break
                indexed_tally[creds_file] = indexed_tally.get(creds_file, 0) + batch_indexed
                raise
        url_cursor += batch_indexed
        indexed_tally[creds_file] = indexed_tally.get(creds_file, 0) + batch_indexed
        if quota_exhausted:
            continue

    save_urls_to_file(existing_urls, site["urls_file"])
    for creds_file, count in indexed_tally.items():
        if count:
            update_quota_batch(creds_file, count)
            APP_LOGGER.info(f"  {creds_file}: {count} URLs indexed")

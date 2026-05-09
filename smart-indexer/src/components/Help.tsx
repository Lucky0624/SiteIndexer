function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5 bg-navy-card border-rim">
      <h2 className="font-semibold mb-3 text-base">{title}</h2>
      {children}
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-medium mt-0.5">
        {n}
      </span>
      <div>
        <p className="font-medium text-white">{title}</p>
        <div className="text-muted mt-1">{children}</div>
      </div>
    </li>
  );
}

export default function Help() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">帮助</h1>

      <div className="space-y-6">
        <Card title="① 快速开始">
          <ol className="list-decimal list-inside space-y-3 text-sm text-muted">
            <li>
              <strong className="text-white">上传凭据</strong> — 进入{" "}
              <strong className="text-white">设置</strong>页面并上传您的 Google 服务账户 JSON 文件。
            </li>
            <li>
              <strong className="text-white">添加站点</strong> — 在站点页面点击{" "}
              <strong className="text-white">新建站点</strong>。输入名称和 sitemap URL。
            </li>
            <li>
              <strong className="text-white">获取网址</strong> — 打开站点并点击{" "}
              <strong className="text-white">获取网址</strong>。
            </li>
            <li>
              <strong className="text-white">运行索引</strong> — 点击{" "}
              <strong className="text-white">▶ 运行索引</strong>。
            </li>
          </ol>
        </Card>

        <Card title="② Google 凭据 — 分步指南">
          <div className="text-sm space-y-4 text-muted">
            <Step n="1" title="创建 Google Cloud 项目">
              访问{" "}
              <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-accent-hover underline">
                console.cloud.google.com
              </a>
              ，创建新项目。
            </Step>

            <Step n="2" title="启用 Web Search Indexing API">
              搜索 <em>Web Search Indexing API</em>，选择您的项目，点击 <strong className="text-white">ENABLE</strong>。
            </Step>

            <Step n="3" title="创建服务账户并下载密钥">
              <p>IAM &amp; Admin → Service Accounts → 创建服务账户。</p>
              <p className="mt-1">创建完成后，点击账户 → Keys → Add Key → JSON → Create。</p>
            </Step>

            <Step n="4" title="将服务账户添加到 Search Console">
              <p>复制服务账户邮箱，访问 Google Search Console。</p>
              <p className="mt-1">选择您的属性 → 设置 → 用户和权限 → 添加用户 → 粘贴邮箱 → 设置为<strong className="text-white">所有者</strong>。</p>
            </Step>

            <Step n="5" title="在应用中上传凭据">
              进入 <strong className="text-white">设置</strong> → 上传 JSON 文件，然后为站点分配凭据。
            </Step>

            <div className="rounded-lg p-3 mt-2 border border-rim bg-white/[0.03]">
              <p className="font-medium text-white mb-2">可选 — GSC 同步功能</p>
              <p className="mb-2">
                此功能会检查 Google 在 Search Console 中确认已索引的 URL。
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>启用 <strong className="text-white">Google Search Console API</strong></li>
                <li>在站点设置中填写 <strong className="text-white">Search Console 属性 URL</strong></li>
              </ol>
            </div>
          </div>
        </Card>

        <Card title="③ 功能说明">
          <div className="text-sm space-y-3 text-muted">
            <div>
              <p className="font-medium text-white mb-1">▶ 运行索引</p>
              <p>获取 sitemap，同步 URL，将待处理的 URL 提交到 Google Indexing API。</p>
            </div>
            <div>
              <p className="font-medium text-white mb-1">获取网址</p>
              <p>读取 sitemap 并更新 URL 列表，不提交到 Google。</p>
            </div>
            <div>
              <p className="font-medium text-white mb-1">重置全部</p>
              <p>将所有 URL 标记为待处理，强制 Google 重新索引。</p>
            </div>
            <div>
              <p className="font-medium text-white mb-1">增加配额</p>
              <p>为同一站点分配来自不同 GCP 项目的凭据，可以突破每日 200 的限制。</p>
            </div>
          </div>
        </Card>

        <Card title="常见问题">
          <div className="text-sm space-y-3 text-muted">
            <div>
              <p className="font-medium text-white mb-1">Q: 配额用完了怎么办？</p>
              <p>A: 等待配额重置（每天）或添加更多 GCP 项目的凭据。</p>
            </div>
            <div>
              <p className="font-medium text-white mb-1">Q: 为什么某些 URL 没有被提交？</p>
              <p>A: 检查是否配置了排除模式或包含模式。</p>
            </div>
            <div>
              <p className="font-medium text-white mb-1">Q: GSC 同步显示"—"怎么办？</p>
              <p>A: 确保已启用 Search Console API 并正确配置属性 URL。</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

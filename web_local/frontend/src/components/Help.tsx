export default function Help() {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">帮助</h1>
        <p className="text-sm text-slate-500 mt-1">了解如何使用 SiteIndexer 提交索引</p>
      </div>

      <div className="space-y-6">

        {/* ① 快速开始 */}
        <Card title="① 快速开始">
          <ol className="list-decimal list-inside space-y-3 text-sm" style={{ color: "var(--color-muted)" }}>
            <li>
              <strong className="text-white">上传凭据</strong> — 进入{" "}
              <strong className="text-white">设置</strong>页面并上传您的 Google 服务账户
              JSON 文件。请参阅下面的第 ② 节了解如何创建服务账户。
            </li>
            <li>
              <strong className="text-white">添加站点</strong> — 在站点页面点击{" "}
              <strong className="text-white">新建站点</strong>。输入名称、
              您的 sitemap URL，并分配您刚上传的凭据。
            </li>
            <li>
              <strong className="text-white">获取网址</strong> — 打开站点并点击{" "}
              <strong className="text-white">获取网址</strong>。这将读取您的 sitemap 并
              填充网址列表。
            </li>
            <li>
              <strong className="text-white">运行索引</strong> — 点击{" "}
              <strong className="text-white">▶ 运行索引</strong>。SiteIndexer 会将待处理的
              URL 提交给 Google，最多达到每日配额（每个 GCP 项目 200 个）。
            </li>
          </ol>
        </Card>

        {/* ② Google 凭据 */}
        <Card title="② Google 凭据 — 分步指南">
          <div className="text-sm space-y-4" style={{ color: "var(--color-muted)" }}>
            <Step n="1" title="创建 Google Cloud 项目">
              访问{" "}
              <strong className="text-white">https://console.cloud.google.com</strong>，点击顶部的
              项目选择器 → <em>New Project</em>，输入名称并点击{" "}
              <em>Create</em>。
            </Step>

            <Step n="2" title="启用 Web Search Indexing API">
              在搜索栏中输入 <em>Web Search Indexing API</em>。确保您刚创建的项目显示在左上角的方框中 — 如果没有，点击它并选择。
              然后点击 API → <strong className="text-white">ENABLE</strong>。
            </Step>

            <Step n="3" title="创建服务账户并下载密钥">
              <p>点击菜单 → <em>IAM &amp; Admin</em> → <em>Service Accounts</em> → <em>+ Create Service Account</em>。</p>
              <p className="mt-1">输入任意名称 → <em>Create and Continue</em> → <em>Done</em>。</p>
              <p className="mt-1">点击您刚创建的账户 → <em>Keys</em> 标签 → <em>Add Key</em> → <em>Create new key</em> → JSON → <em>Create</em>。</p>
              <p className="mt-1">一个 <code className="text-xs" style={{ color: "#e6edf3" }}>.json</code> 文件将被下载。妥善保存 — 您将在设置中上传它。</p>
            </Step>

            <Step n="4" title="将服务账户添加到 Google Search Console">
              <p>复制服务账户邮箱（格式类似{" "}
                <code className="text-xs" style={{ color: "#e6edf3" }}>name@project.iam.gserviceaccount.com</code>）。
              </p>
              <p className="mt-1">访问{" "}
                <strong className="text-white">https://search.google.com/search-console</strong>，
                选择您的属性 → <em>Settings</em> → <em>Users and permissions</em> →{" "}
                <em>Add user</em> → 粘贴邮箱 → 设置角色为 <strong className="text-white">Owner</strong> → Add。
              </p>
            </Step>

            <Step n="5" title="在 SiteIndexer 中上传密钥">
              进入 <strong className="text-white">设置</strong> → 上传 JSON 文件。
              然后打开您的站点 → <em>编辑</em> → 分配这些凭据。
            </Step>

            <div
              className="rounded-lg p-3 mt-2 border"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: "var(--color-rim)" }}
            >
              <p className="font-medium text-white mb-2">可选 — 启用"从 GSC 同步"</p>
              <p className="mb-2">
                此功能会检查 Google 在 Search Console 中确认已索引的 URL，并自动标记它们。需要额外一步：
              </p>
              <p className="mb-1">
                1. 在 Google Cloud Console 中，同样启用{" "}
                <strong className="text-white">Google Search Console API</strong>（步骤同上，搜索 <em>Google Search Console API</em>）。
              </p>
              <p className="mb-2">
                2. 在站点设置中，填写{" "}
                <strong className="text-white">Search Console Property URL</strong>。该值必须
                与您的站点在 Search Console 中显示的完全一致：
              </p>
              <ul className="space-y-1 ml-2">
                <li>
                  <strong className="text-white">域名属性</strong> →{" "}
                  <code className="text-xs" style={{ color: "#e6edf3" }}>sc-domain:example.com</code>{" "}
                  <span>（通过 DNS 验证 — 最常见）</span>
                </li>
                <li>
                  <strong className="text-white">URL 前缀属性</strong> →{" "}
                  <code className="text-xs" style={{ color: "#e6edf3" }}>https://example.com/</code>{" "}
                  <span>（通过 HTML 文件或 meta 标签验证）</span>
                </li>
              </ul>
              <p className="mt-2">
                要检查您的类型：打开 Search Console 并查看左侧的属性列表 —
                域名属性显示地球图标，URL 前缀属性显示链接图标。
              </p>
            </div>
          </div>
        </Card>

        {/* ③ 站点详情 */}
        <Card title="③ 站点详情">
          <div className="text-sm space-y-3" style={{ color: "var(--color-muted)" }}>
            <p>从站点页面打开一个站点以查看其完整的详情面板。</p>

            <p className="font-medium text-white">统计卡片</p>
            <ul className="space-y-1 ml-2">
              <li><strong className="text-white">总网址数</strong> — 在您的 sitemap 中找到的 URL 数量。</li>
              <li><strong className="text-white">已发送到 Google</strong> — 已提交到 Indexing API 的 URL。</li>
              <li><strong className="text-white">GSC 中已索引</strong> — Google Search Console 确认已索引的 URL（由"从 GSC 同步"更新）。</li>
              <li><strong className="text-white">待处理</strong> — 尚未提交的 URL；它们将在下次运行时发送。</li>
            </ul>

            <p className="font-medium text-white mt-2">配额条</p>
            <p>
              如果您分配了多个凭据，每个凭据都会显示一个进度条，显示其每日 200 个 URL 中有多少个已在今天使用。
            </p>

            <p className="font-medium text-white mt-2">操作</p>
            <ul className="space-y-2 ml-2">
              <li>
                <strong className="text-white">▶ 运行索引</strong> — 获取 sitemap，
                同步新增/删除的 URL，重置 lastmod 已更改的 URL（如果启用了 Track lastmod），
                然后将待处理的 URL 提交给 Google（最多达到每日配额）。日志面板显示
                实时进度。
              </li>
              <li>
                <strong className="text-white">获取网址</strong> — 读取您的 sitemap 并更新
                URL 列表，但不向 Google 提交任何内容。使用此功能可以在运行索引之前预览
                更改内容。
              </li>
              <li>
                <strong className="text-white">从 GSC 同步</strong> — 查询 Google Search
                Console 获取所有已确认索引的页面，并使用 GSC 徽章标记匹配的 URL。
                需要在站点设置中设置 Search Console Property URL。
              </li>
            </ul>
          </div>
        </Card>

        {/* ④ URLs 表格 */}
        <Card title="④ URLs 表格">
          <div className="text-sm space-y-3" style={{ color: "var(--color-muted)" }}>
            <p>URLs 表格显示在您的 sitemap 中找到的每个页面及其当前状态。</p>

            <p className="font-medium text-white">列</p>
            <ul className="space-y-1 ml-2">
              <li><strong className="text-white">状态</strong> — <span style={{ color: "var(--color-accent-hover)" }}>已发送</span>（已提交到 Google）或 <span style={{ color: "var(--color-warn)" }}>待处理</span>（尚未提交）。</li>
              <li><strong className="text-white">发送时间</strong> — URL 上次提交到 Indexing API 的日期。</li>
              <li><strong className="text-white">Lastmod</strong> — sitemap 报告的最后修改日期。当启用 Track lastmod 且此日期更改时，URL 会自动重置为待处理状态。</li>
              <li><strong className="text-white">GSC</strong> — <span style={{ color: "var(--color-success)" }}>已索引</span> 表示 Google Search Console 已确认此 URL 已索引。破折号表示尚未同步或未找到。</li>
            </ul>

            <p className="font-medium text-white mt-2">筛选标签</p>
            <p>使用 <em>全部</em> / <em>待处理</em> / <em>已索引</em> 标签来缩小列表范围。</p>

            <p className="font-medium text-white mt-2">批量操作</p>
            <ul className="space-y-2 ml-2">
              <li>
                <strong className="text-white">重置全部</strong> — 将所有 URL 标记为待处理。
                使用此功能强制 Google 从头开始重新索引所有内容。
              </li>
              <li>
                <strong className="text-white">重置选中项</strong> — 使用复选框选择一行或多行，
                然后点击此按钮将这些 URL 标记为待处理。它们将在下次运行时重新提交。
              </li>
              <li>
                <strong className="text-white">标记已发送</strong> — 手动将选中的 URL 标记为
                已发送（而不实际提交它们）。如果您知道 Google 已经有这些 URL 并且
                想要跳过重新提交，此功能非常有用。
              </li>
            </ul>
          </div>
        </Card>

        {/* ⑤ 筛选器和设置 */}
        <Card title="⑤ 筛选器和设置">
          <div className="text-sm space-y-3" style={{ color: "var(--color-muted)" }}>
            <p>
              筛选器按站点配置。打开站点 → 点击{" "}
              <strong className="text-white">编辑</strong>。
            </p>

            <ul className="space-y-3 ml-2">
              <li>
                <strong className="text-white">Track lastmod</strong> (开启/关闭) — 开启时，如果您的
                sitemap 报告某个 URL 的新 <code className="text-xs" style={{ color: "#e6edf3" }}>lastmod</code>{" "}
                日期，该 URL 将在下次运行时自动重置为待处理状态。对于博客或内容更新频繁的站点非常有用。
              </li>
              <li>
                <strong className="text-white">跳过扩展名</strong> — 完全忽略的文件类型（每行一个）。
                以这些扩展名结尾的 URL 在检查其他内容之前被排除。默认列表包括图像、PDF、视频和存档：
                <code className="text-xs block mt-1 ml-2" style={{ color: "#e6edf3" }}>
                  .jpg .jpeg .png .gif .webp .svg .pdf .mp4 .zip
                </code>
              </li>
              <li>
                <strong className="text-white">排除模式</strong> — 正则表达式
                （或普通字符串）。如果 URL 匹配任何排除模式，则忽略它。示例：
                添加{" "}
                <code className="text-xs" style={{ color: "#e6edf3" }}>/tag/</code> 跳过所有标签页面。
                排除始终优先于包含。
              </li>
              <li>
                <strong className="text-white">包含模式</strong> — 如果此列表{" "}
                <em>不为空</em>，仅处理匹配至少一个模式的 URL；所有其他 URL 都被忽略。示例：添加{" "}
                <code className="text-xs" style={{ color: "#e6edf3" }}>/blog/</code> 仅处理博客文章。
              </li>
            </ul>
          </div>
        </Card>

        {/* ⑥ 增加每日配额 */}
        <Card title="⑥ 增加每日配额">
          <div className="text-sm space-y-3" style={{ color: "var(--color-muted)" }}>
            <p>
              Google 的 <strong className="text-white">200 个 URL/天</strong> 限制是针对每个 GCP{" "}
              <em>项目</em>，而不是每个服务账户。通过将来自多个不同 GCP 项目的凭据分配给同一个站点，
              SiteIndexer 会在当前凭据达到每日限制时自动切换到下一个凭据。
            </p>
            <p>
              <strong className="text-white">示例：</strong> 来自 3 个不同项目的 3 个凭据 → 同一站点每天可处理 600 个 URL。
            </p>

            <p className="font-medium text-white mt-1">如何设置</p>
            <p>为每个要添加的额外 GCP 项目重复以下步骤：</p>

            <ol className="list-decimal list-inside space-y-3 ml-2 mt-2">
              <li>
                <strong className="text-white">创建新的 GCP 项目</strong> — 访问
                Google Cloud Console → 项目选择器 → <em>New Project</em>。
              </li>
              <li>
                <strong className="text-white">启用 Web Search Indexing API</strong> — 搜索
                <em>Web Search Indexing API</em>，确保选择了新项目，点击{" "}
                <em>ENABLE</em>。
              </li>
              <li>
                <strong className="text-white">创建服务账户并下载密钥</strong>{" "}
                — IAM &amp; Admin → Service Accounts → <em>+ Create</em> → 命名 → Keys 标签 →
                Add Key → JSON → Create。保存下载的{" "}
                <code className="text-xs" style={{ color: "#e6edf3" }}>.json</code> 文件。
              </li>
              <li>
                <strong className="text-white">将服务账户添加到 Search Console</strong>{" "}
                — 复制其邮箱，访问 Search Console → 您的属性 → Settings → Users and
                permissions → Add user → 粘贴邮箱 → Owner → Add。您可以向同一属性添加多个服务账户。
              </li>
              <li>
                <strong className="text-white">在 SiteIndexer 中上传并分配</strong> —
                进入 <em>设置</em> 并上传新的 JSON 文件，然后打开您的站点 →{" "}
                <em>编辑</em> → 添加新凭据。点击 <em>保存</em>。
              </li>
            </ol>

            <p className="mt-1">
              站点详情页面显示每个凭据的配额条，以便您可以查看每个凭据今天使用了多少配额。
            </p>
          </div>
        </Card>

        {/* 开源 */}
        <Card title="开源">
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            SiteIndexer 是开源软件。核心索引逻辑和此本地 Web 应用可免费使用、修改和分享。{" "}
            <strong className="text-white">
              需要定时自动索引、多站点管理等更多功能？
            </strong>{" "}
            请查看 SiteIndexer Cloud。
          </p>
        </Card>

      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 p-6 bg-slate-900/50 backdrop-blur-xl shadow-xl">
      <h2 className="font-semibold text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-white mb-1">
        Step {n} — {title}
      </p>
      <div style={{ color: "var(--color-muted)" }}>{children}</div>
    </div>
  );
}

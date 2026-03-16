/* @meta
{
  "name": "gov-qingdao/search",
  "description": "青岛政务网站内搜索（基于站内检索页，返回结构化结果）",
  "domain": "www.qingdao.gov.cn",
  "args": {
    "query": {"required": true, "description": "搜索关键词"},
    "count": {"required": false, "description": "返回结果数量（默认 10，最大 10）"},
    "days": {"required": false, "description": "仅返回最近 N 天结果，如 7"},
    "category": {"required": false, "description": "分类过滤：全部/政策/要闻/公开/服务/互动/扬帆青岛/微信"},
    "page": {"required": false, "description": "页码，当前仅支持 1"}
  },
  "readOnly": true,
  "example": "bb-browser site gov-qingdao/search 社会工作部 10 7"
}
*/

async function(args) {
  const query = (args.query || '').trim();
  if (!query) return {error: 'Missing argument: query'};

  const count = Math.min(Math.max(parseInt(args.count || 10, 10) || 10, 1), 10);
  const days = args.days == null ? null : Math.max(parseInt(args.days, 10) || 0, 0);
  const category = (args.category || '').trim();
  const page = Math.max(parseInt(args.page || 1, 10) || 1, 1);
  if (page !== 1) return {error: 'Only page=1 is supported for now', hint: 'Use page 1 or extend the adapter with pager API support later'};

  function stripHtml(s) {
    return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function norm(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }
  function parseDate(s) {
    const m = String(s || '').match(/(20\d{2})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function daysAgo(date) {
    if (!date) return null;
    const now = new Date();
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const b = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor((a - b) / 86400000);
  }
  function inferCategory(type, columnName) {
    const hay = [type, columnName].filter(Boolean).join(' ');
    if (/政策文件|政策|公文|法规|解读/.test(hay)) return '政策';
    if (/要闻动态|政务要闻|工作动态|要闻/.test(hay)) return '要闻';
    if (/政务公开|公开/.test(hay)) return '公开';
    if (/政务服务|服务/.test(hay)) return '服务';
    if (/政民互动|互动/.test(hay)) return '互动';
    if (/扬帆青岛/.test(hay)) return '扬帆青岛';
    if (/微信/.test(hay)) return '微信';
    return '全部';
  }

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = '/unionsearch/index.shtml?searchWord=' + encodeURIComponent(query) + '&sitetype=only';
  document.body.appendChild(iframe);

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Search page load timeout')), 15000);
      iframe.onload = () => setTimeout(() => { clearTimeout(timer); resolve(); }, 3500);
    });

    const w = iframe.contentWindow;
    const d = iframe.contentDocument;
    const totalText = norm(d.body?.textContent || '');
    const totalMatch = totalText.match(/为您筛选到\s*(\d+)\s*条结果/);
    const total = totalMatch ? Number(totalMatch[1]) : null;

    const raw = Array.isArray(w.mainNewList) ? w.mainNewList : [];
    const merged = [];
    const seen = new Set();

    // 1) 优先收集页面上的“最新资讯”区块，适合近期检索
    const newestLis = Array.from(d.querySelectorAll('.js_newest_ul li'));
    for (const li of newestLis) {
      const a = li.querySelector('a[data-link], a.js_a_link');
      if (!a) continue;
      const title = stripHtml(a.textContent || '');
      const url = a.getAttribute('data-link') || a.getAttribute('href') || '';
      const dateText = norm(li.querySelector('span')?.textContent || '').slice(0, 10) || null;
      const date = parseDate(dateText);
      const ageDays = daysAgo(date);
      const item = {
        title,
        url,
        date: dateText,
        ageDays,
        section: '要闻动态',
        columnName: '最新资讯',
        category: '要闻',
        snippet: ''
      };
      if (title && url && !seen.has(url)) { seen.add(url); merged.push(item); }
    }

    // 2) 再补主搜索结果
    for (const item of raw) {
      const title = stripHtml(item.title || '');
      const url = item.LinkUrl || item.url || '';
      const dateText = String(item.publishTime || '').slice(0, 10) || null;
      const date = parseDate(dateText);
      const ageDays = daysAgo(date);
      const section = norm(item.Type || '');
      const columnName = norm(item.columnName || '');
      const inferred = inferCategory(section, columnName);
      const snippet = stripHtml(item.Content || '').slice(0, 240);
      if (title && url && !seen.has(url)) {
        seen.add(url);
        merged.push({
          title,
          url,
          date: dateText,
          ageDays,
          section: section || null,
          columnName: columnName || null,
          category: inferred,
          snippet
        });
      }
    }

    const results = [];
    for (const item of merged) {
      if (days != null && (item.ageDays == null || item.ageDays < 0 || item.ageDays > days)) continue;
      if (category && category !== '全部') {
        const hay = [item.section, item.columnName, item.category].join(' ');
        if (!hay.includes(category)) continue;
      }
      results.push(item);
      if (results.length >= count) break;
    }

    return {
      query,
      page,
      count: results.length,
      total,
      filters: {days, category: category || null, sitetype: 'only'},
      results
    };
  } finally {
    try { iframe.remove(); } catch (e) {}
  }
}

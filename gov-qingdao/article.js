/* @meta
{
  "name": "gov-qingdao/article",
  "description": "提取青岛政务网文章详情、正文与附件",
  "domain": "www.qingdao.gov.cn",
  "args": {
    "url": {"required": true, "description": "文章 URL（qingdao.gov.cn 站内）"},
    "maxChars": {"required": false, "description": "正文最大长度，默认 4000"}
  },
  "readOnly": true,
  "example": "bb-browser site gov-qingdao/article http://www.qingdao.gov.cn/ywdt/zwyw/202603/t20260315_10537273.shtml"
}
*/

async function(args) {
  const rawUrl = (args.url || '').trim();
  if (!rawUrl) return {error: 'Missing argument: url'};

  let u;
  try {
    u = new URL(rawUrl, location.origin);
  } catch (e) {
    return {error: 'Invalid url', hint: 'Provide a valid qingdao.gov.cn article URL'};
  }

  if (!/qingdao\.gov\.cn$/i.test(u.hostname) && !/\.qingdao\.gov\.cn$/i.test(u.hostname)) {
    return {error: 'Unsupported domain', hint: 'Only qingdao.gov.cn article URLs are supported'};
  }

  const maxChars = Math.min(Math.max(parseInt(args.maxChars || 4000, 10) || 4000, 500), 20000);

  function norm(s) {
    return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function extFrom(url, name) {
    const m = (url || name || '').match(/\.([a-z0-9]+)(?:$|[?#])/i);
    return m ? m[1].toLowerCase() : null;
  }
  function extractText(root) {
    if (!root) return '';
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, iframe, form, button, .share, .pages, .page, .pagination, .video, .audio, .attachment, .ewm, .qrcode').forEach(el => el.remove());
    return norm(clone.textContent || '');
  }
  function pickContent(doc) {
    const selectors = [
      '#js_content',
      '#art-content',
      '.article_con',
      '.TRS_Editor',
      '#zoom',
      '.zoom',
      '.Custom_UnionStyle',
      '.content',
      '.article-content',
      '.details-content',
      '.news_content'
    ];
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      const txt = extractText(el);
      if (txt && txt.length > 80) return {el, text: txt, selector: sel};
    }
    const candidates = Array.from(doc.querySelectorAll('div, article, section'))
      .map(el => ({el, text: extractText(el)}))
      .filter(x => x.text.length > 200)
      .sort((a, b) => b.text.length - a.text.length);
    if (candidates.length) return {el: candidates[0].el, text: candidates[0].text, selector: 'largest-text-block'};
    return {el: null, text: '', selector: null};
  }
  function collectAttachments(doc, baseUrl) {
    const exts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip'];
    const out = [];
    const seen = new Set();
    for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href') || '';
      const text = norm(a.textContent || '');
      const ext = extFrom(href, text);
      if (!ext || !exts.includes(ext)) continue;
      let full;
      try { full = new URL(href, baseUrl).href; } catch (e) { continue; }
      if (seen.has(full)) continue;
      seen.add(full);
      const name = text || decodeURIComponent(full.split('/').pop() || full);
      out.push({ name, url: full, type: ext });
    }
    return out;
  }

  const resp = await fetch(u.href, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Open the page in bb-browser first if needed'};

  const html = await resp.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const title = norm(
    doc.querySelector('meta[name="ArticleTitle"]')?.getAttribute('content') ||
    doc.querySelector('h1')?.textContent ||
    doc.querySelector('.article-title')?.textContent ||
    doc.title.replace(/[_-]青岛政务网.*$/, '')
  );

  const bodyText = norm(doc.body?.textContent || '');
  let publishDate = norm(doc.querySelector('meta[name="PubDate"]')?.getAttribute('content') || '').slice(0, 10) || null;
  const dateMatch = bodyText.match(/(20\d{2}[-年]\d{1,2}[-月]\d{1,2}日?)/);
  if (!publishDate && dateMatch) {
    publishDate = dateMatch[1].replace(/年|月/g, '-').replace(/日/g, '');
    publishDate = publishDate.replace(/-(\d)(?!\d)/g, '-0$1');
  }

  let source = norm(
    doc.querySelector('meta[name="ContentSource"]')?.getAttribute('content') ||
    doc.querySelector('.source')?.textContent ||
    doc.querySelector('.文章来源')?.textContent ||
    ''
  );
  if (!source) {
    const sourceMatch = bodyText.match(/(?:来源|稿件来源|信息来源)[:：]\s*([^\n\r ]{2,40})/);
    if (sourceMatch) source = norm(sourceMatch[1]);
  }

  const content = pickContent(doc);
  const text = (content.text || '').slice(0, maxChars);
  const summary = text.slice(0, 180);
  const attachments = collectAttachments(doc, u.href);

  return {
    url: u.href,
    title: title || null,
    publishDate,
    source: source || null,
    contentSelector: content.selector,
    summary: summary || null,
    text,
    textLength: content.text.length || 0,
    attachments
  };
}

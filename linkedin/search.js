/* @meta
{
  "name": "linkedin/search",
  "description": "搜索 LinkedIn 帖子",
  "domain": "www.linkedin.com",
  "args": {
    "query": {"required": true, "description": "Search keyword"}
  },
  "readOnly": true,
  "example": "bb-browser site linkedin/search \"AI agent\""
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query'};

  // Navigate to search page
  const searchUrl = '/search/results/content/?keywords=' + encodeURIComponent(args.query);
  if (!location.pathname.includes('/search/results/content') || !location.search.includes(encodeURIComponent(args.query))) {
    location.href = searchUrl;
    await new Promise(r => setTimeout(r, 5000));
  }

  // Wait for results to render
  let attempts = 0;
  while (!document.querySelector('button[aria-label*="回应按钮"], button[aria-label*="React"]') && attempts < 20) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }

  const likeButtons = Array.from(document.querySelectorAll('button[aria-label*="回应按钮"], button[aria-label*="React"]'));
  if (!likeButtons.length) return {error: 'No results found', hint: 'Make sure you are logged in to LinkedIn'};

  const posts = [];
  likeButtons.forEach(btn => {
    let container = btn;
    for (let i = 0; i < 12; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      const ownLikes = container.querySelectorAll('button[aria-label*="回应按钮"], button[aria-label*="React"]');
      if (ownLikes.length === 1) {
        const links = Array.from(container.querySelectorAll('a[href*="/in/"], a[href*="/company/"]'));
        const textSpans = Array.from(container.querySelectorAll('span')).filter(s => s.textContent?.trim().length > 50);
        if (links.length > 0 && textSpans.length > 0) {
          const followBtn = container.querySelector('button[aria-label*="关注"], button[aria-label*="Follow"]');
          const followName = followBtn?.getAttribute('aria-label')?.replace(/关注|Follow/g, '').trim();
          const authorLink = links.find(l => l.textContent?.trim().length > 0 && l.textContent?.trim().length < 60);
          const author = followName || authorLink?.textContent?.trim() || '';
          const authorUrl = (authorLink?.href || links[0]?.href || '').split('?')[0];

          const seen = new Set();
          const texts = [];
          textSpans.forEach(s => {
            const t = s.textContent?.trim();
            if (t && !seen.has(t) && !Array.from(seen).some(x => x.includes(t))) {
              seen.add(t); texts.push(t);
            }
          });
          posts.push({author, authorUrl, text: texts.join(' ').substring(0, 800)});
          break;
        }
      }
    }
  });

  return {query: args.query, count: posts.length, posts};
}

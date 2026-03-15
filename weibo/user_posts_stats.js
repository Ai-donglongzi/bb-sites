/* @meta
{
  "name": "weibo/user_posts_stats",
  "description": "Scan a Weibo user's timeline and summarize latest post plus the post with max comments",
  "domain": "weibo.com",
  "args": {
    "uid": {"required": true, "description": "User ID (numeric)"},
    "max_pages": {"required": false, "description": "Maximum pages to scan (default: all available pages)"},
    "feature": {"required": false, "description": "Filter: 0=all, 1=original, 2=picture, 3=video, 4=music (default: 0)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site weibo/user_posts_stats 1654184992"
}
*/

async function(args) {
  if (!args.uid) return { error: 'Missing argument: uid' };

  const uid = String(args.uid);
  const feature = parseInt(args.feature) || 0;
  const userMaxPages = parseInt(args.max_pages);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const strip = (html) => String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

  async function fetchJsonWithRetry(url, options = {}) {
    let lastError = null;

    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        const response = await fetch(url, {
          credentials: 'include',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'x-requested-with': 'XMLHttpRequest',
            ...options.headers,
          },
          ...options,
        });

        const raw = await response.text();

        if (!response.ok) {
          lastError = `HTTP ${response.status}`;
        } else if (!raw) {
          lastError = 'Empty response body';
        } else {
          try {
            return JSON.parse(raw);
          } catch (error) {
            lastError = `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt < 6) {
        await sleep(700 * attempt + Math.floor(Math.random() * 500));
      }
    }

    return { ok: 0, msg: lastError || 'Request failed after retries' };
  }

  function normalizePost(s) {
    const post = {
      id: s.idstr || String(s.id),
      mblogid: s.mblogid,
      text: s.text_raw || strip(s.text || ''),
      created_at: s.created_at,
      source: strip(s.source || ''),
      reposts_count: s.reposts_count || 0,
      comments_count: s.comments_count || 0,
      likes_count: s.attitudes_count || 0,
      is_long_text: !!s.isLongText,
      pic_count: s.pic_num || 0,
      url: 'https://weibo.com/' + uid + '/' + (s.mblogid || ''),
    };

    if (s.retweeted_status) {
      const rt = s.retweeted_status;
      post.retweeted = {
        id: rt.idstr || String(rt.id),
        text: rt.text_raw || strip(rt.text || ''),
        user: rt.user?.screen_name || '[deleted]',
      };
    }

    return post;
  }

  const first = await fetchJsonWithRetry(
    '/ajax/statuses/mymblog?uid=' + encodeURIComponent(uid) + '&page=1&feature=' + feature,
  );
  if (!first.ok) {
    return {
      error: 'API error: ' + (first.msg || 'unknown'),
      hint: 'Not logged in? Or request was rate-limited. Retry in a few seconds.',
    };
  }

  const total = first.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const scanPages = userMaxPages > 0 ? Math.min(userMaxPages, totalPages) : totalPages;

  let latest = null;
  let maxCommentsPost = null;
  let scannedPages = 0;
  let scannedPosts = 0;

  for (let page = 1; page <= scanPages; page++) {
    const data = page === 1
      ? first
      : await fetchJsonWithRetry(
          '/ajax/statuses/mymblog?uid=' + encodeURIComponent(uid) + '&page=' + page + '&feature=' + feature,
        );

    if (!data.ok) {
      return {
        error: 'API error: ' + (data.msg || 'unknown'),
        hint: 'Timeline scan was interrupted by rate limiting. Retry in a few seconds.',
        uid,
        total,
        total_pages: totalPages,
        scanned_pages: scannedPages,
        scanned_posts: scannedPosts,
        latest,
        max_comments_post: maxCommentsPost,
        failed_page: page,
      };
    }

    const list = data.data?.list || [];
    if (!list.length) break;
    scannedPages += 1;

    for (const status of list) {
      const post = normalizePost(status);
      scannedPosts += 1;
      if (!latest) latest = post;
      if (!maxCommentsPost || post.comments_count > maxCommentsPost.comments_count) {
        maxCommentsPost = post;
      }
    }

    if (page < scanPages) {
      await sleep(350 + Math.floor(Math.random() * 250));
    }
  }

  return {
    uid,
    total,
    total_pages: totalPages,
    scanned_pages: scannedPages,
    scanned_posts: scannedPosts,
    latest,
    max_comments_post: maxCommentsPost,
  };
}

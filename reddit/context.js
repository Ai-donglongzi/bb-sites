/* @meta
{
  "name": "reddit/context",
  "description": "获取评论的 ancestor chain（从根帖到目标评论的完整路径）",
  "domain": "www.reddit.com",
  "args": {
    "url": {"required": true, "description": "Reddit comment URL (utm params are stripped automatically)"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site reddit/context https://www.reddit.com/r/LocalLLaMA/comments/1rso48p/comment/oa8domi/"
}
*/

async function(args) {
  if (!args.url) return {error: 'Missing argument: url', hint: 'Provide a Reddit comment URL'};
  const path = args.url.replace(/https?:\/\/[^/]*/, '').replace(/\?.*/, '').replace(/\/*$/, '/');

  let comment_id = (path.match(/\/comment\/([^/]+)/) || [])[1];
  if (!comment_id) {
    const parts = path.match(/\/comments\/[^/]*\/[^/]*\/([^/]*)/);
    comment_id = parts ? parts[1] : null;
  }
  if (!comment_id) return {error: 'Cannot extract comment_id from URL', hint: 'Expected: .../comment/<id>/'};

  const resp = await fetch(path + '.json?context=10&raw_json=1', {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  const d = await resp.json();
  if (!d[0]?.data?.children?.[0]?.data) return {error: 'Unexpected response', hint: 'Post may be deleted or URL is incorrect'};
  const post = d[0].data.children[0].data;

  function flatten(children, depth) {
    let result = [];
    for (const child of children) {
      if (child.kind !== 't1') continue;
      const c = child.data;
      result.push({id: c.name, parent_id: c.parent_id, author: c.author, score: c.score, body: c.body, depth});
      if (c.replies?.data?.children)
        result = result.concat(flatten(c.replies.data.children, depth + 1));
    }
    return result;
  }

  const comments = flatten(d[1]?.data?.children || [], 0);
  const target = comments.find(c => c.id === 't1_' + comment_id);
  if (!target) return {error: 'Comment t1_' + comment_id + ' not found', hint: 'Comment may be deleted or URL is incorrect'};

  let chain = [], cur = target;
  while (cur) { chain.unshift(cur); cur = comments.find(c => c.id === cur.parent_id); }

  return {
    post: {id: post.name, title: post.title, author: post.author},
    target_comment: target,
    ancestor_chain: chain
  };
}

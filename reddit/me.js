/* @meta
{
  "name": "reddit/me",
  "description": "获取当前 Reddit 登录用户信息",
  "domain": "www.reddit.com",
  "args": {},
  "capabilities": ["network"],
  "readOnly": true
}
*/

async function(args) {
  const resp = await fetch('/api/me.json', {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Not logged in? Open reddit.com and log in.'};
  const d = await resp.json();
  return {
    name: d.data?.name,
    id: d.data?.id,
    comment_karma: d.data?.comment_karma,
    link_karma: d.data?.link_karma,
    total_karma: d.data?.total_karma,
    created_utc: d.data?.created_utc
  };
}

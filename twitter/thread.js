/* @meta
{
  "name": "twitter/thread",
  "description": "获取推文对话线程（原文 + 所有回复）",
  "domain": "x.com",
  "args": {
    "tweet_id": {"required": true, "description": "Tweet ID (numeric) or full URL"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site twitter/thread 2032478407146311850"
}
*/

async function(args) {
  if (!args.tweet_id) return {error: 'Missing argument: tweet_id', hint: 'Provide a tweet ID or URL'};
  const ct0 = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ct0='))?.split('=')[1];
  if (!ct0) return {error: 'No ct0 cookie', hint: 'Not logged into x.com'};
  const bearer = decodeURIComponent('AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA');
  const _h = {'Authorization':'Bearer '+bearer, 'X-Csrf-Token':ct0, 'X-Twitter-Auth-Type':'OAuth2Session', 'X-Twitter-Active-User':'yes'};

  let tweetId = args.tweet_id;
  const urlMatch = tweetId.match(/\/status\/(\d+)/);
  if (urlMatch) tweetId = urlMatch[1];

  const variables = JSON.stringify({
    focalTweetId: tweetId, referrer: 'tweet', with_rux_injections: false,
    includePromotedContent: false, rankingMode: 'Relevance',
    withCommunity: true, withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: true, withVoice: true
  });
  const features = JSON.stringify({
    responsive_web_graphql_exclude_directive_enabled: true, verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true, responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    longform_notetweets_consumption_enabled: true, longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true, freedom_of_speech_not_reach_fetch_enabled: true
  });
  const fieldToggles = JSON.stringify({withArticleRichContentState: true, withArticlePlainText: false});
  const url = '/i/api/graphql/nBS-WpgA6ZG0CyNHD517JQ/TweetDetail?variables=' + encodeURIComponent(variables) + '&features=' + encodeURIComponent(features) + '&fieldToggles=' + encodeURIComponent(fieldToggles);
  const resp = await fetch(url, {headers: _h, credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Tweet may not exist or queryId expired'};
  const d = await resp.json();

  const instructions = d.data?.threaded_conversation_with_injections_v2?.instructions || d.data?.tweetResult?.result?.timeline?.instructions || [];
  let tweets = [], seen = new Set();
  for (const inst of instructions) {
    for (const entry of (inst.entries || [])) {
      const r = entry.content?.itemContent?.tweet_results?.result;
      if (r) {
        const tw = r.tweet || r; const l = tw.legacy || {};
        if (tw.rest_id && !seen.has(tw.rest_id)) {
          seen.add(tw.rest_id);
          const u = tw.core?.user_results?.result;
          const nt = tw.note_tweet?.note_tweet_results?.result?.text;
          tweets.push({id: tw.rest_id, author: u?.legacy?.screen_name || u?.core?.screen_name, text: nt || l.full_text || '',
            likes: l.favorite_count, retweets: l.retweet_count, in_reply_to: l.in_reply_to_status_id_str, created_at: l.created_at});
        }
      }
      for (const item of (entry.content?.items || [])) {
        const r2 = item.item?.itemContent?.tweet_results?.result;
        if (r2) {
          const tw = r2.tweet || r2; const l = tw.legacy || {};
          if (tw.rest_id && !seen.has(tw.rest_id)) {
            seen.add(tw.rest_id);
            const u = tw.core?.user_results?.result;
            const nt = tw.note_tweet?.note_tweet_results?.result?.text;
            tweets.push({id: tw.rest_id, author: u?.legacy?.screen_name || u?.core?.screen_name, text: nt || l.full_text || '',
              likes: l.favorite_count, retweets: l.retweet_count, in_reply_to: l.in_reply_to_status_id_str, created_at: l.created_at});
          }
        }
      }
    }
  }

  return {tweet_id: tweetId, count: tweets.length, tweets};
}

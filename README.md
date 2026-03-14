# bb-sites

Community site adapters for [bb-browser](https://github.com/epiral/bb-browser) — turning websites into CLI commands.

Each site adapter is a JS function that runs inside your browser via `bb-browser eval`. The browser is already logged in — no API keys, no cookie extraction, no anti-bot bypass.

## Quick Start

```bash
bb-browser site update                     # install/update site adapters
bb-browser site list                       # list available commands
bb-browser site reddit/me                  # run a command
bb-browser site reddit/thread <url>        # run with args
```

## Available Sites

### Reddit
| Command | Args | Description |
|---------|------|-------------|
| `reddit/me` | — | Current logged-in user info |
| `reddit/posts` | `username` (optional) | User's submitted posts (auto-paginated) |
| `reddit/thread` | `url` | Full discussion tree for a post |
| `reddit/context` | `url` | Ancestor chain for a specific comment |

### Twitter
| Command | Args | Description |
|---------|------|-------------|
| `twitter/user` | `screen_name` | User profile |
| `twitter/thread` | `tweet_id` | Tweet + all replies (supports URL or numeric ID) |

## Writing a Site Adapter

```javascript
/* @meta
{
  "name": "platform/command",
  "description": "What this adapter does",
  "domain": "www.example.com",
  "args": {
    "query": {"required": true, "description": "Search query"}
  },
  "capabilities": ["network"],
  "readOnly": true,
  "example": "bb-browser site platform/command value1"
}
*/

async function(args) {
  if (!args.query) return {error: 'Missing argument: query'};
  const resp = await fetch('/api/search?q=' + encodeURIComponent(args.query), {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status};
  return await resp.json();
}
```

### Metadata fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | `platform/command` format |
| `description` | yes | What this adapter does |
| `domain` | yes | Website domain (for tab routing) |
| `args` | yes | Argument definitions with required/description |
| `capabilities` | no | `["network"]`, `["network", "dom-read"]`, etc. |
| `readOnly` | no | `true` if adapter only reads data |
| `example` | no | Example CLI invocation |

## Private Adapters

Put private adapters in `~/.bb-browser/sites/`. They override community adapters with the same name.

```
~/.bb-browser/
├── sites/          # Your private adapters
│   └── internal/
│       └── deploy.js
└── bb-sites/       # This repo (bb-browser site update)
    ├── reddit/
    └── twitter/
```

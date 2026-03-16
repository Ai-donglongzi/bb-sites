/* @meta
{
  "name": "gov-qingdao/file",
  "description": "读取青岛政务网附件正文（优先支持 PDF / DOCX / XLSX，也支持 txt/html/json/csv）",
  "domain": "www.qingdao.gov.cn",
  "args": {
    "url": {"required": true, "description": "附件 URL（qingdao.gov.cn 站内）"},
    "maxChars": {"required": false, "description": "返回正文最大长度，默认 6000"}
  },
  "readOnly": true,
  "example": "bb-browser site gov-qingdao/file http://www.qingdao.gov.cn/.../P020240506402046913307.docx"
}
*/

async function(args) {
  const rawUrl = (args.url || '').trim();
  if (!rawUrl) return {error: 'Missing argument: url'};
  const maxChars = Math.min(Math.max(parseInt(args.maxChars || 6000, 10) || 6000, 500), 30000);

  let u;
  try {
    u = new URL(rawUrl, location.origin);
  } catch (e) {
    return {error: 'Invalid url'};
  }
  if (!/qingdao\.gov\.cn$/i.test(u.hostname) && !/\.qingdao\.gov\.cn$/i.test(u.hostname)) {
    return {error: 'Unsupported domain', hint: 'Only qingdao.gov.cn file URLs are supported'};
  }

  function norm(s) {
    return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function extFrom(url) {
    const m = String(url || '').match(/\.([a-z0-9]+)(?:$|[?#])/i);
    return m ? m[1].toLowerCase() : '';
  }
  function truncate(s) {
    const text = norm(s);
    return text.slice(0, maxChars);
  }

  const ext = extFrom(u.href);
  const resp = await fetch(u.href, {credentials: 'include'});
  if (!resp.ok) return {error: 'HTTP ' + resp.status, hint: 'Open the attachment URL in bb-browser first if needed'};
  const contentType = resp.headers.get('content-type') || '';

  try {
    if (ext === 'docx') {
      const mammoth = await import('https://esm.sh/mammoth@1.8.0');
      const ab = await resp.arrayBuffer();
      const r = await mammoth.extractRawText({arrayBuffer: ab});
      const text = truncate(r.value || '');
      return {
        url: u.href,
        type: 'docx',
        contentType,
        text,
        textLength: norm(r.value || '').length,
        warnings: (r.messages || []).map(x => x.message || String(x)).slice(0, 10)
      };
    }

    if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xlsb') {
      const XLSX = await import('https://esm.sh/xlsx@0.18.5');
      const ab = await resp.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(ab), {type: 'array'});
      const sheets = [];
      let combined = [];
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, {header: 1, blankrows: false, raw: false});
        sheets.push({name, rows: rows.length});
        combined.push('# Sheet: ' + name);
        for (const row of rows.slice(0, 200)) {
          const line = row.map(v => norm(v)).filter(Boolean).join(' | ');
          if (line) combined.push(line);
          if (combined.join('\n').length > maxChars * 1.5) break;
        }
        if (combined.join('\n').length > maxChars * 1.5) break;
      }
      const joined = combined.join('\n');
      return {
        url: u.href,
        type: ext,
        contentType,
        sheets,
        text: truncate(joined),
        textLength: norm(joined).length
      };
    }

    if (ext === 'pdf') {
      const pdfjs = await import('https://esm.sh/pdfjs-dist@4.3.136');
      pdfjs.GlobalWorkerOptions.workerSrc = '';
      const ab = await resp.arrayBuffer();
      const pdf = await pdfjs.getDocument({data: ab, disableWorker: true}).promise;
      const parts = [];
      const pageCount = pdf.numPages;
      for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        const line = tc.items.map(x => x.str).join(' ');
        if (line) parts.push(line);
        if (parts.join('\n').length > maxChars * 1.5) break;
      }
      const joined = parts.join('\n');
      return {
        url: u.href,
        type: 'pdf',
        contentType,
        pages: pageCount,
        text: truncate(joined),
        textLength: norm(joined).length
      };
    }


    if (['txt', 'csv', 'json', 'xml', 'html', 'htm'].includes(ext) || ((ext === '' || ext === 'txt') && /text|json|xml|html/.test(contentType))) {
      const text = await resp.text();
      return {
        url: u.href,
        type: ext || contentType,
        contentType,
        text: truncate(text),
        textLength: norm(text).length
      };
    }

    if (ext === 'doc' || ext === 'xls') {
      return {
        url: u.href,
        type: ext,
        contentType,
        error: 'Legacy Office format not yet supported in-browser',
        hint: 'Prefer docx/xlsx, or let the agent use local conversion tools as a fallback'
      };
    }

    return {
      url: u.href,
      type: ext || null,
      contentType,
      error: 'Unsupported file type for text extraction',
      hint: 'Currently supports pdf, docx, xlsx, txt/html/json/xml/csv'
    };
  } catch (e) {
    return {
      url: u.href,
      type: ext || null,
      contentType,
      error: 'Parse failed',
      hint: String(e)
    };
  }
}

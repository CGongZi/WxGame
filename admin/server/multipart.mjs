/**
 * Parse a single-file multipart/form-data body (K10 mock, no deps).
 * Expects fields: file (required), optional id.
 */

export function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return { error: 'missing multipart boundary' };
  const boundary = m[1] || m[2];
  const sep = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(buffer, sep);
  let file = null;
  let id = '';

  for (const part of parts) {
    if (part.length < 4) continue;
    // skip epilogue "--"
    if (part.slice(0, 2).toString() === '--') continue;
    let body = part;
    if (body.slice(0, 2).toString() === '\r\n') body = body.slice(2);
    const headerEnd = indexOf(body, Buffer.from('\r\n\r\n'));
    if (headerEnd < 0) continue;
    const headerText = body.slice(0, headerEnd).toString('utf8');
    let data = body.slice(headerEnd + 4);
    // trim trailing CRLF
    if (data.slice(-2).toString() === '\r\n') data = data.slice(0, -2);

    const nameMatch = /name="([^"]+)"/i.exec(headerText);
    const filenameMatch = /filename="([^"]*)"/i.exec(headerText);
    const name = nameMatch ? nameMatch[1] : '';
    if (name === 'id') {
      id = data.toString('utf8').trim();
      continue;
    }
    if (name === 'file' || filenameMatch) {
      const ctMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerText);
      file = {
        filename: (filenameMatch && filenameMatch[1]) || 'upload.bin',
        contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
        buffer: data,
      };
    }
  }

  if (!file) return { error: 'missing file field' };
  return { file, id };
}

function indexOf(buf, needle) {
  for (let i = 0; i <= buf.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (buf[i + j] !== needle[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

function splitBuffer(buf, sep) {
  const out = [];
  let start = 0;
  while (start <= buf.length) {
    const i = indexOf(buf.slice(start), sep);
    if (i < 0) {
      out.push(buf.slice(start));
      break;
    }
    out.push(buf.slice(start, start + i));
    start = start + i + sep.length;
  }
  return out;
}

export function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > maxBytes) {
        reject(new Error(`body too large (max ${maxBytes})`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

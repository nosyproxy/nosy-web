/**
 * Prepares untrusted HTML for preview in a sandboxed iframe (`sandbox=""`, so no
 * scripts, forms, popups or same-origin access). A CSP <meta> is injected as the
 * first element of <head> to control which external resources may load.
 */
export function buildPreview(html: string, opts: { external: boolean; baseUrl?: string }): string {
  const csp = opts.external
    ? "default-src 'none'; style-src * data: 'unsafe-inline'; img-src * data: blob:; font-src * data:; media-src * data:"
    : "default-src 'none'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data:"
  let inject = `<meta http-equiv="Content-Security-Policy" content="${csp}">`
  inject += '<meta name="referrer" content="no-referrer">'
  if (opts.external && opts.baseUrl) inject += `<base href="${escapeAttr(opts.baseUrl)}">`

  const head = /<head\b[^>]*>/i.exec(html)
  if (head) {
    const at = head.index + head[0].length
    return html.slice(0, at) + inject + html.slice(at)
  }
  const root = /<html\b[^>]*>/i.exec(html)
  if (root) {
    const at = root.index + root[0].length
    return `${html.slice(0, at)}<head>${inject}</head>${html.slice(at)}`
  }
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)
  if (doctype) return `${doctype[0]}<head>${inject}</head>${html.slice(doctype[0].length)}`
  return `<!doctype html><head>${inject}</head>${html}`
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

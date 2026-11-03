/**
 * Prepares untrusted HTML for preview in a sandboxed iframe (`sandbox=""`, so no
 * scripts, forms, popups or same-origin access). A CSP <meta> is injected at the very
 * start of the document (after a leading doctype) to control which external resources
 * may load: the parser puts it into <head> before anything the page contains, so it
 * cannot be hidden in a comment, script or attribute.
 */
export function buildPreview(html: string, opts: { external: boolean; baseUrl?: string }): string {
  const csp = opts.external
    ? "default-src 'none'; style-src * data: 'unsafe-inline'; img-src * data: blob:; font-src * data:; media-src * data:"
    : "default-src 'none'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; media-src data:"
  let inject = `<meta http-equiv="Content-Security-Policy" content="${csp}">`
  inject += '<meta name="referrer" content="no-referrer">'
  if (opts.external && opts.baseUrl) inject += `<base href="${escapeAttr(opts.baseUrl)}">`

  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)
  const at = doctype ? doctype[0].length : 0
  return html.slice(0, at) + inject + html.slice(at)
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

interface State {
  line: number
  part: number
  started: boolean
  body: boolean
  status: boolean
}

/** Highlighting for HTTP/1.x-style messages (request or response). */
export const httpLanguage = StreamLanguage.define<State>({
  name: 'http',
  startState: () => ({ line: 0, part: 0, started: false, body: false, status: false }),
  copyState: (s) => ({ ...s }),
  blankLine(s) {
    if (s.started) {
      s.body = true
      s.line++
    }
  },
  token(stream, s) {
    if (stream.sol()) {
      if (s.started) s.line++
      s.started = true
      s.part = 0
    }
    if (s.body) {
      stream.skipToEnd()
      return null
    }
    if (s.line === 0) {
      if (stream.eatSpace()) return null
      if (s.part === 0) {
        s.part = 1
        if (stream.match(/^HTTP\/\S+/)) {
          s.status = true
          return 'keyword'
        }
        stream.match(/^\S+/)
        return 'keyword'
      }
      if (s.part === 1) {
        s.part = 2
        stream.match(/^\S+/)
        return s.status ? 'number' : 'string'
      }
      stream.skipToEnd()
      return s.status ? 'comment' : 'meta'
    }
    if (s.part === 0 && stream.match(/^[^:\s][^:]*/)) {
      s.part = 1
      return 'propertyName'
    }
    if (s.part <= 1 && stream.eat(':')) {
      s.part = 2
      return 'punctuation'
    }
    stream.skipToEnd()
    return 'content'
  },
})

export const highlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.keyword, color: 'var(--color-accent)', fontWeight: '600' },
    { tag: t.string, color: 'var(--color-str)' },
    { tag: [t.number, t.integer], color: 'var(--color-ok)' },
    { tag: [t.meta, t.comment, t.punctuation], color: 'var(--color-dim)' },
    { tag: t.propertyName, color: 'var(--color-key)' },
    { tag: t.content, color: 'var(--color-fg)' },
    { tag: [t.bool, t.null, t.atom], color: 'var(--color-violet)' },
    { tag: t.tagName, color: 'var(--color-accent)' },
    { tag: t.attributeName, color: 'var(--color-key)' },
    { tag: t.attributeValue, color: 'var(--color-str)' },
  ]),
)

const accentMix = (pct: number) => `color-mix(in srgb, var(--color-accent) ${pct}%, transparent)`

export const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--editor-font-size, 12px)',
    backgroundColor: 'transparent',
    color: 'var(--color-fg)',
  },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--color-accent)', padding: '8px 0' },
  '.cm-line': { padding: '0 12px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
    { backgroundColor: `${accentMix(28)} !important` },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--color-faint)',
    paddingLeft: '4px',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--color-fg) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-dim)' },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--color-warn) 25%, transparent)',
    outline: '1px solid color-mix(in srgb, var(--color-warn) 50%, transparent)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: accentMix(45) },
  '.cm-selectionMatch': { backgroundColor: accentMix(12) },
  '.cm-panels': { backgroundColor: 'var(--color-raised)', color: 'var(--color-fg)' },
  '.cm-panels-top': { borderBottom: '1px solid var(--color-line)' },
  '.cm-panel.cm-search': { padding: '6px 8px', fontFamily: 'var(--font-sans)' },
  '.cm-panel input, .cm-panel button, .cm-panel label': { fontSize: '12px' },
  '.cm-textfield': {
    backgroundColor: 'var(--color-bg)',
    border: '1px solid var(--color-line)',
    borderRadius: '6px',
    color: 'var(--color-fg)',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--color-panel)',
    border: '1px solid var(--color-line)',
    borderRadius: '6px',
    color: 'var(--color-fg)',
  },
  '.cm-specialChar': { color: 'var(--color-err)' },
})

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Compartment, EditorSelection, EditorState, Prec, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightSpecialChars,
  keymap,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { highlight, httpLanguage, theme } from '@/lib/httpLang'
import { useSettings } from '@/stores/settings'
import { useDecoder } from '@/stores/decoder'
import { useUi } from '@/stores/ui'
import { OP_BY_ID, toBytes, toText } from '@/lib/transform'
import { t } from '@/i18n'
import { Copy, TextSelect, WandSparkles, Lock, LockOpen } from '@lucide/vue'
import ContextMenu, { type MenuItem } from './ContextMenu.vue'

export type Lang = 'http' | 'json' | 'html' | 'xml' | 'none'

const props = withDefaults(
  defineProps<{ modelValue: string; readonly?: boolean; language?: Lang; wrap?: boolean }>(),
  { readonly: false, language: 'http', wrap: true },
)
const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: []; selection: [text: string] }>()

const host = useTemplateRef<HTMLDivElement>('host')
const view = shallowRef<EditorView>()
const langC = new Compartment()
const roC = new Compartment()
const wrapC = new Compartment()
const gutterC = new Compartment()
const settings = useSettings()
const gutter = (on: boolean) => (on ? [lineNumbers(), highlightActiveLineGutter()] : [])

async function languageExt(lang: Lang): Promise<Extension> {
  switch (lang) {
    case 'http':
      return httpLanguage
    case 'json':
      return (await import('@codemirror/lang-json')).json()
    case 'html':
    case 'xml':
      return (await import('@codemirror/lang-html')).html()
    default:
      return []
  }
}

// Read-only views stay focusable so keyboard selection and Ctrl+F work.
const readonlyExt = (ro: boolean) => EditorState.readOnly.of(ro)

// ------------------------------------------------------------ selection → parent (once per frame)

const MAX_SELECTION = 1024 * 1024
let lastSel = ''
let selFrame = 0
function reportSelection() {
  selFrame = 0
  const v = view.value
  if (!v) return
  const r = v.state.selection.main
  const text = r.empty || r.to - r.from > MAX_SELECTION ? '' : v.state.sliceDoc(r.from, r.to)
  if (text !== lastSel) {
    lastSel = text
    emit('selection', text)
  }
}

// ------------------------------------------------------------ transforms on the selection

const ui = useUi()
/** Replace every non-empty selection range with `op(range)`; keeps the result selected. */
function transform(opId: string): boolean {
  const v = view.value
  const op = OP_BY_ID.get(opId)
  if (!v || !op || v.state.readOnly || v.state.selection.ranges.every((r) => r.empty)) return false
  try {
    const tr = v.state.changeByRange((range) => {
      if (range.empty) return { range }
      const out = toText(op.run(toBytes(v.state.sliceDoc(range.from, range.to))) as Uint8Array)
      return {
        changes: { from: range.from, to: range.to, insert: out },
        range: EditorSelection.range(range.from, range.from + out.length),
      }
    })
    v.dispatch(v.state.update(tr, { scrollIntoView: true, userEvent: 'input.transform' }))
  } catch (e) {
    ui.toast(t('editor.transformFailed', { msg: e instanceof Error ? e.message : String(e) }), 'error')
  }
  return true
}

const transformKeys = keymap.of([
  { key: 'Mod-u', run: () => transform('url-enc'), preventDefault: true },
  { key: 'Mod-Shift-u', run: () => transform('url-dec'), preventDefault: true },
  { key: 'Mod-b', run: () => transform('b64-enc'), preventDefault: true },
  { key: 'Mod-Shift-b', run: () => transform('b64-dec'), preventDefault: true },
])

// ------------------------------------------------------------ context menu

const decoder = useDecoder()
const router = useRouter()
const menu = ref<{ x: number; y: number; items: MenuItem[] } | null>(null)

function openMenu(e: MouseEvent) {
  const v = view.value
  if (!v) return
  e.preventDefault()
  const r = v.state.selection.main
  const sel = r.empty ? '' : v.state.sliceDoc(r.from, r.to)
  const editable = !v.state.readOnly
  const encodeOps = ['url-enc', 'url-enc-all', 'b64-enc', 'b64url-enc', 'html-enc', 'hex-enc', 'uni-enc']
  const decodeOps = ['url-dec', 'b64-dec', 'html-dec', 'hex-dec', 'uni-dec']
  const sub = (ids: string[]) =>
    ids.map((id) => ({ label: OP_BY_ID.get(id)!.label, action: () => transform(id) }))
  const items: MenuItem[] = [
    { label: t('common.copy'), icon: Copy, action: () => navigator.clipboard.writeText(sel) },
    {
      label: t('editor.toDecoder'),
      icon: WandSparkles,
      action: async () => {
        await decoder.open(sel || v.state.doc.toString().slice(0, 4 * MAX_SELECTION))
        await router.push('/decoder')
      },
    },
    {
      label: t('editor.selectAll'),
      icon: TextSelect,
      shortcut: 'Ctrl+A',
      action: () => v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } }),
    },
  ]
  if (!sel) items.shift()
  if (editable && sel) {
    items.push(
      { separator: true, label: '' },
      { label: t('editor.encode'), icon: Lock, children: sub(encodeOps) },
      { label: t('editor.decode'), icon: LockOpen, children: sub(decodeOps) },
    )
  }
  menu.value = { x: e.clientX, y: e.clientY, items }
}

onMounted(async () => {
  const v = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (emit('submit'), true) }])),
        Prec.high(transformKeys),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        theme,
        highlight,
        langC.of([]),
        roC.of(readonlyExt(props.readonly)),
        wrapC.of(props.wrap ? EditorView.lineWrapping : []),
        gutterC.of(gutter(settings.s.lineNumbers)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !props.readonly) emit('update:modelValue', u.state.doc.toString())
          if ((u.selectionSet || u.docChanged) && !selFrame) selFrame = requestAnimationFrame(reportSelection)
        }),
      ],
    }),
  })
  view.value = v
  v.dispatch({ effects: langC.reconfigure(await languageExt(props.language)) })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(selFrame)
  view.value?.destroy()
})

watch(
  () => props.modelValue,
  (val) => {
    const v = view.value
    if (!v || v.state.doc.toString() === val) return
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: val },
      selection: { anchor: 0 },
      scrollIntoView: true,
    })
  },
)
watch(
  () => props.language,
  async (l) => view.value?.dispatch({ effects: langC.reconfigure(await languageExt(l)) }),
)
watch(
  () => props.readonly,
  (ro) => view.value?.dispatch({ effects: roC.reconfigure(readonlyExt(ro)) }),
)
watch(
  () => props.wrap,
  (w) => view.value?.dispatch({ effects: wrapC.reconfigure(w ? EditorView.lineWrapping : []) }),
)

watch(
  () => settings.s.lineNumbers,
  (on) => view.value?.dispatch({ effects: gutterC.reconfigure(gutter(on)) }),
)

defineExpose({ focus: () => view.value?.focus() })
</script>

<template>
  <div ref="host" class="h-full min-h-0 overflow-hidden" @contextmenu="openMenu"></div>
  <ContextMenu v-if="menu" v-bind="menu" @close="menu = null" />
</template>

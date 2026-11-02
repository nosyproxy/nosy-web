<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowDown,
  ClipboardPaste,
  Copy,
  CornerLeftUp,
  Eraser,
  LoaderCircle,
  Trash2,
  WandSparkles,
} from '@lucide/vue'
import CodeView from '@/components/CodeView.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import { useDecoder, type StepView } from '@/stores/decoder'
import { useUi } from '@/stores/ui'
import { OPS, isPrintable, type OpGroup } from '@/lib/transform'
import { hexRow } from '@/lib/hex'
import { formatBytes } from '@/lib/format'
import { t } from '@/i18n'

const dec = useDecoder()
const ui = useUi()

const GROUPS: OpGroup[] = ['decode', 'encode', 'compress', 'hash']
const grouped = computed(() =>
  GROUPS.map((g) => ({ g, label: t(`decoder.group.${g}`), ops: OPS.filter((o) => o.group === g) })),
)
const viewOptions = computed(() => [
  { value: 'auto' as StepView, label: t('decoder.auto') },
  { value: 'text' as StepView, label: t('decoder.text') },
  { value: 'hex' as StepView, label: t('decoder.hex') },
])
const inputModes = computed(() => [
  { value: false, label: t('decoder.text') },
  { value: true, label: t('decoder.hex') },
])

const MAX_SHOW = 512 * 1024
const utf8 = new TextDecoder()

function render(bytes: Uint8Array, view: StepView): { text: string; hex: boolean; truncated: boolean } {
  const shown = bytes.length > MAX_SHOW ? bytes.subarray(0, MAX_SHOW) : bytes
  const hex = view === 'hex' || (view === 'auto' && !isPrintable(shown))
  if (!hex) return { text: utf8.decode(shown), hex, truncated: shown !== bytes }
  const rows: string[] = []
  for (let i = 0; i < Math.ceil(shown.length / 16); i++) {
    const r = hexRow(shown, i)
    rows.push(`${r.offset}  ${r.hex}  ${r.ascii}`)
  }
  return { text: rows.join('\n'), hex, truncated: shown !== bytes }
}

const outputs = computed(() =>
  dec.steps.map((s, i) => {
    const r = dec.results[i]
    return { step: s, res: r, view: r?.bytes ? render(r.bytes, s.view) : null }
  }),
)

const opLabel = (id: string) => {
  const o = OPS.find((x) => x.id === id)
  return o ? `${t(`decoder.group.${o.group}`)} · ${o.label}` : id
}

function add(e: Event) {
  const sel = e.target as HTMLSelectElement
  if (sel.value) dec.addStep(sel.value)
  sel.value = ''
}

async function smart() {
  const n = await dec.smart()
  if (!n) ui.toast(t('decoder.nothingDetected'))
}

async function paste() {
  try {
    dec.input = await navigator.clipboard.readText()
  } catch (e) {
    ui.error(e)
  }
}

async function copyBytes(b: Uint8Array) {
  await navigator.clipboard.writeText(
    isPrintable(b) ? utf8.decode(b) : Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''),
  )
  ui.toast(t('common.copied', { what: formatBytes(b.length) }))
}
</script>

<template>
  <div class="h-full overflow-auto">
    <div class="mx-auto max-w-5xl space-y-2 p-6 pb-24">
      <!-- header -->
      <div class="mb-4 flex items-center gap-3">
        <h1 class="text-base font-semibold">{{ t('decoder.title') }}</h1>
        <span class="text-xs text-faint">{{ t('decoder.hint') }}</span>
        <div class="ml-auto flex items-center gap-2">
          <button class="btn" @click="dec.clear()">
            <Eraser class="size-3.5" />{{ t('decoder.clear') }}
          </button>
          <button class="btn btn-primary" :title="t('decoder.smartHint')" :disabled="dec.busy" @click="smart">
            <LoaderCircle v-if="dec.busy" class="size-3.5 animate-spin" />
            <WandSparkles v-else class="size-3.5" />
            {{ t('decoder.smart') }}
          </button>
        </div>
      </div>

      <!-- input -->
      <section class="card overflow-hidden" :aria-label="t('decoder.input')">
        <header class="flex h-10 items-center gap-3 border-b border-line px-3">
          <h2 class="panel-title">{{ t('decoder.input') }}</h2>
          <SegmentedControl v-model="dec.inputHex" :options="inputModes" :label="t('decoder.input')" />
          <span v-if="dec.inputError" class="text-xs text-err">{{ t('decoder.invalidHexInput') }}</span>
          <span v-else-if="dec.inputBytes" class="font-mono text-[0.6875rem] text-faint">
            {{ t('decoder.bytes', { n: dec.inputBytes.length.toLocaleString() }) }}
          </span>
          <button class="btn-icon ml-auto" :title="t('decoder.paste')" @click="paste">
            <ClipboardPaste class="size-4" />
          </button>
        </header>
        <div class="h-40 resize-y overflow-hidden" style="min-height: 5rem">
          <CodeView v-model="dec.input" language="none" />
        </div>
      </section>

      <!-- steps -->
      <template v-for="(o, i) in outputs" :key="o.step.key">
        <div class="flex justify-center text-faint"><ArrowDown class="size-4" /></div>
        <section class="card overflow-hidden" :aria-label="t('decoder.step', { n: i + 1 })">
          <header class="flex h-10 items-center gap-3 border-b border-line px-3">
            <span
              class="grid size-5 place-items-center rounded-full bg-accent/15 font-mono text-[0.6875rem] text-accent"
              >{{ i + 1 }}</span
            >
            <select
              v-model="o.step.op"
              class="input !h-7 min-w-56 cursor-pointer"
              :aria-label="t('decoder.step', { n: i + 1 })"
              :title="opLabel(o.step.op)"
            >
              <optgroup v-for="grp in grouped" :key="grp.g" :label="grp.label">
                <option v-for="op in grp.ops" :key="op.id" :value="op.id">
                  {{ grp.label }} · {{ op.label }}
                </option>
              </optgroup>
            </select>
            <SegmentedControl
              v-if="o.res?.bytes"
              v-model="o.step.view"
              :options="viewOptions"
              :label="t('decoder.output')"
            />
            <span v-if="o.res?.bytes" class="font-mono text-[0.6875rem] text-faint">
              {{ t('decoder.bytes', { n: o.res.bytes.length.toLocaleString() }) }}
            </span>
            <div class="ml-auto flex items-center gap-0.5">
              <template v-if="o.res?.bytes">
                <button class="btn-icon" :title="t('common.copy')" @click="copyBytes(o.res.bytes)">
                  <Copy class="size-4" />
                </button>
                <button class="btn-icon" :title="t('decoder.useAsInput')" @click="dec.promote(i)">
                  <CornerLeftUp class="size-4" />
                </button>
              </template>
              <button
                class="btn-icon hover:!text-err"
                :title="t('decoder.remove')"
                @click="dec.removeStep(i)"
              >
                <Trash2 class="size-4" />
              </button>
            </div>
          </header>
          <div v-if="o.res?.error" class="px-4 py-3 text-xs text-err">{{ o.res.error }}</div>
          <div v-else-if="o.res?.skipped || !o.res" class="px-4 py-3 text-xs text-faint">
            {{ t('decoder.skipped') }}
          </div>
          <template v-else-if="o.view">
            <pre
              class="max-h-80 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed"
              :class="o.view.hex ? 'whitespace-pre text-dim' : 'break-all whitespace-pre-wrap'"
              >{{ o.view.text }}</pre>
            <p v-if="o.view.truncated" class="border-t border-line px-4 py-1.5 text-[0.6875rem] text-warn">
              {{ t('decoder.truncated', { n: formatBytes(MAX_SHOW) }) }}
            </p>
          </template>
        </section>
      </template>

      <!-- add step -->
      <div class="flex justify-center text-faint"><ArrowDown class="size-4" /></div>
      <div class="flex justify-center">
        <select
          class="input !h-8 w-64 cursor-pointer text-center"
          :aria-label="t('decoder.addStep')"
          @change="add"
        >
          <option value="">+ {{ t('decoder.addStep') }}</option>
          <optgroup v-for="grp in grouped" :key="grp.g" :label="grp.label">
            <option v-for="op in grp.ops" :key="op.id" :value="op.id">
              {{ grp.label }} · {{ op.label }}
            </option>
          </optgroup>
        </select>
      </div>
      <p v-if="!dec.steps.length" class="pt-2 text-center text-xs text-faint">{{ t('decoder.empty') }}</p>
    </div>
  </div>
</template>

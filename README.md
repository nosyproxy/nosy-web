# nosy-web

Web UI for [Nosy](https://github.com/nosyproxy/nosy), the intercepting HTTP(S) proxy:
Proxy History, Repeater, Decoder, Settings. Vue 3 · TypeScript · Tailwind · CodeMirror 6.

The built `dist/` is embedded into the `nosy` binary by the core's `make build`; this repo is
expected next to the core checkout (`../nosy`).

## Development

```sh
make dev        # Vite with HMR on :5173, proxies /api (+ WebSocket) to the core on :1337 (env NOSY_UI)
make build      # production build into dist/
make check      # eslint, vue-tsc, vitest
make fmt        # prettier
```

Run the core alongside: `make -C ../nosy dev`.

## API types

`src/api/generated/*.ts` is generated from the core's `nosy-model` crate with ts-rs — don't edit by
hand. After the API changes in the core:

```sh
make types      # regenerates from ../nosy (override with CORE=/path/to/nosy), then commit
```

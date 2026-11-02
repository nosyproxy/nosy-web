.PHONY: dev build test check fmt types clean

NPM ?= npm
# Sibling checkout of github.com/nosyproxy/nosy (the Rust core); source of the API types.
CORE ?= ../nosy

node_modules: package.json package-lock.json
	$(NPM) ci
	@touch node_modules

## Vite dev server with HMR on :5173 (proxies /api to the core on :1337, env NOSY_UI).
dev: node_modules
	$(NPM) run dev

## Production build into dist/ (embedded by the core's `make build`).
build: node_modules
	$(NPM) run build

test: node_modules
	$(NPM) test

check: node_modules
	$(NPM) run lint
	$(NPM) run typecheck
	$(NPM) test

fmt: node_modules
	$(NPM) run format

## Regenerate src/api/generated from the core's nosy-model (ts-rs). Commit the result.
types:
	@test -d $(CORE) || { echo "nosy core not found at $(CORE): git clone git@github.com:nosyproxy/nosy.git $(CORE)"; exit 1; }
	rm -rf src/api/generated
	TS_RS_EXPORT_DIR=$(abspath src/api/generated) cargo test --manifest-path $(CORE)/Cargo.toml -p nosy-model --quiet
	@git status --short src/api/generated 2>/dev/null || true

clean:
	rm -rf dist

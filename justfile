# Web Office — main entry points. Run `just` to list recipes.

set shell := ["bash", "-euo", "pipefail", "-c"]

# List available recipes
default:
    @just --list

# Install dependencies from the lockfile
install:
    npm ci

# Start the development server
dev:
    npm run dev

# Type-check the sources (strict mode)
typecheck:
    npm run typecheck

# Run the unit tests
test:
    npm test

# Run the unit tests in watch mode
test-watch:
    npm run test:watch

# Production build into dist/
build:
    npm run build

# Serve the production build locally
preview: build
    npm run preview

# End-to-end smoke tests in a real browser (Playwright)
e2e: build
    npm run test:e2e

# Build the documentation, llms.txt and llms-full.txt (fails on warnings)
docs:
    #!/usr/bin/env bash
    set -euo pipefail
    log=$(mktemp)
    npm run docs:build 2>&1 | tee "$log"
    if grep -Eiq '(^|[^a-z])warn(ing)?' "$log"; then
        echo "error: documentation build emitted warnings" >&2
        exit 1
    fi

# Publish specs/spec.md (working copy) into docs/requirements.md
sync-spec:
    node scripts/sync-requirements.mjs

# Live-preview the documentation
docs-dev:
    npm run docs:dev

# Regenerate the PNG app icons from public/icon.svg
icons:
    CHROMIUM_PATH="${CHROMIUM_PATH:-}" node scripts/render-icons.mjs

# Everything to run before committing
check: typecheck test build docs

# Remove build outputs
clean:
    rm -rf dist docs/.vitepress/dist docs/.vitepress/cache test-results playwright-report

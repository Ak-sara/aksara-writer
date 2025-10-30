## Development Commands

### Core Development
```bash
# Install dependencies
bun install

# Run demos and tests
bun run demo              # Quick test conversion
bun run test-full         # Full test suite

# CLI commands
bun run cli               # Run CLI directly
bun run cli:init          # Initialize project
bun run cli:convert       # Convert documents
bun run cli:templates     # List templates
bun run cli:themes        # List themes
```

### Package Development
```bash
# Core package (packages/core)
cd packages/core
bun run build            # Build: tsc && vite build
bun run dev              # Development: vite build --watch
bun run test             # Run tests

# CLI package (packages/cli)
cd packages/cli
bun run build            # Build: tsc && chmod +x dist/index.js
bun run dev              # Development: tsc --watch
bun run test             # Run tests

# VSCode extension (packages/vscode)
cd packages/vscode
bun run build            # Build: tsc && webpack --mode production
bun run dev              # Development: tsc --watch
bun run package          # Package extension: vsce package --no-dependencies
bun run publish          # Publish: vsce publish --no-dependencies
```

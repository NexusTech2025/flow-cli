# flow-cli

> flow-cli is an agent-native, headless diagramming CLI that compiles text, ASCII, and AST models into Lucidchart CSV, Mermaid, and interactive SVGs. Features topological auto-healing, custom shapes, rich themes, and atomic node/edge mutations—enabling AI agents and engineering teams to programmatically author and maintain architecture flows.

---

## Features

- **Headless & Agent-Ready:** Pure CLI and JSON AST interface designed for automated execution by AI agents and CI/CD pipelines.
- **Text-to-Diagram Parsing:** Ingests ASCII art, Unicode arrows, and indented bullet lists into structured graph models.
- **Topological Edge Healing:** Automatically re-wires parent and child connections when intermediary nodes are deleted.
- **Multi-Format Compilation:** Exports seamlessly to:
  - Official Lucidchart Process Diagram CSV (two-block format)
  - Lucidchart Light-Themed Mermaid syntax
  - Interactive SVG visualizer
  - Portable Canonical JSON AST
- **Interactive Visualizer:** Embedded lightweight local HTTP server with DAG layout computation, pan/zoom canvas, and live node inspector.

---

## Quick Start

### Installation

Clone the repository and install dependencies:

```bash
git clone git@github.com:NexusTech2025/flow-cli.git
cd flow-cli
```

*(Zero runtime dependencies required — runs on standard Node.js v18+)*

### Usage

```bash
# 1. Parse a text flowchart into JSON AST
node src/cli.js parse --input samples/websocket_crash_flow.txt --output output/diagram.json

# 2. Export to Lucidchart CSV, Mermaid, and JSON
node src/cli.js export --input output/diagram.json --format all --output-dir output/

# 3. Mutate graph (e.g. insert an intermediary validation step)
node src/cli.js mutate --input output/diagram.json --action add-node --id step_validator --label "Validator" --after node_step_4

# 4. Remove a node with automatic edge healing
node src/cli.js mutate --input output/diagram.json --action remove-node --id node_step_5 --heal true

# 5. Start the interactive visualizer
npm start
# Opens interactive editor at http://localhost:3000
```

### Running Tests

```bash
npm test
```

---

## License

MIT © AnalyticaX Team

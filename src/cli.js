#!/usr/bin/env node
/**
 * cli.js
 * Unified command line interface for LucidFlow Architect
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DiagramGraph } from './graph-model.js';
import { FlowchartParser } from './text-parser.js';
import { GraphMutator } from './graph-mutator.js';
import { LucidExporter } from './lucid-exporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function parseArgs(args) {
  const result = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    } else {
      result._.push(arg);
    }
  }
  return result;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function run() {
  const argv = parseArgs(process.argv.slice(2));
  const command = argv._[0] || 'help';

  switch (command) {
    case 'parse': {
      const inputFile = argv.input;
      if (!inputFile) {
        console.error('Error: --input <path_to_text_flowchart> is required');
        process.exit(1);
      }
      const rawText = fs.readFileSync(path.resolve(inputFile), 'utf-8');
      const parser = new FlowchartParser({
        defaultTitle: argv.title || path.basename(inputFile, path.extname(inputFile)),
      });
      const graph = parser.parse(rawText);

      const outputFile =
        argv.output ||
        path.resolve(ROOT_DIR, 'output', `${path.basename(inputFile, path.extname(inputFile))}.json`);
      ensureDir(path.dirname(outputFile));
      fs.writeFileSync(outputFile, LucidExporter.toJson(graph), 'utf-8');
      console.log(`✓ Parsed ${graph.getNodes().length} nodes and ${graph.edges.length} edges.`);
      console.log(`✓ Graph saved to: ${outputFile}`);
      break;
    }

    case 'export': {
      const inputFile = argv.input;
      if (!inputFile) {
        console.error('Error: --input <path_to_graph_json_or_txt> is required');
        process.exit(1);
      }
      const ext = path.extname(inputFile).toLowerCase();
      let graph;

      if (ext === '.json') {
        const data = JSON.parse(fs.readFileSync(path.resolve(inputFile), 'utf-8'));
        graph = DiagramGraph.fromJSON(data);
      } else {
        const rawText = fs.readFileSync(path.resolve(inputFile), 'utf-8');
        const parser = new FlowchartParser();
        graph = parser.parse(rawText);
      }

      const outDir = argv['output-dir'] || path.resolve(ROOT_DIR, 'output');
      ensureDir(outDir);
      const baseName = path.basename(inputFile, ext);
      const format = argv.format || 'all';

      if (format === 'all' || format === 'csv') {
        const csvPath = path.join(outDir, `${baseName}.csv`);
        fs.writeFileSync(csvPath, LucidExporter.toLucidCsv(graph), 'utf-8');
        console.log(`✓ Lucidchart Process CSV: ${csvPath}`);
      }

      if (format === 'all' || format === 'mermaid' || format === 'mmd') {
        const mmdPath = path.join(outDir, `${baseName}.mmd`);
        fs.writeFileSync(mmdPath, LucidExporter.toMermaid(graph), 'utf-8');
        console.log(`✓ Lucidchart Light-Theme Mermaid: ${mmdPath}`);
      }

      if (format === 'all' || format === 'json') {
        const jsonPath = path.join(outDir, `${baseName}.json`);
        fs.writeFileSync(jsonPath, LucidExporter.toJson(graph), 'utf-8');
        console.log(`✓ Graph JSON AST: ${jsonPath}`);
      }
      break;
    }

    case 'mutate': {
      const inputFile = argv.input;
      if (!inputFile) {
        console.error('Error: --input <path_to_graph_json> is required');
        process.exit(1);
      }
      const data = JSON.parse(fs.readFileSync(path.resolve(inputFile), 'utf-8'));
      const graph = DiagramGraph.fromJSON(data);
      const action = argv.action;

      if (action === 'add-node') {
        const id = argv.id;
        const label = argv.label || id;
        const description = argv.desc || '';
        const status = argv.status || 'normal';
        const after = argv.after || null;
        const before = argv.before || null;

        if (!id) {
          console.error('Error: --id is required for add-node');
          process.exit(1);
        }

        GraphMutator.addNode(
          graph,
          { id, label, description, status },
          { after, before }
        );
        console.log(`✓ Added node: ${id} (status: ${status})`);
      } else if (action === 'remove-node') {
        const id = argv.id;
        const heal = argv.heal !== 'false';
        if (!id) {
          console.error('Error: --id is required for remove-node');
          process.exit(1);
        }
        const success = GraphMutator.removeNode(graph, id, { healEdges: heal });
        if (success) {
          console.log(`✓ Removed node: ${id} (edge-healing: ${heal})`);
        } else {
          console.error(`Node not found: ${id}`);
        }
      } else if (action === 'update-node') {
        const id = argv.id;
        const updates = {};
        if (argv.label) updates.label = argv.label;
        if (argv.desc) updates.description = argv.desc;
        if (argv.status) updates.status = argv.status;
        GraphMutator.updateNode(graph, id, updates);
        console.log(`✓ Updated node: ${id}`);
      } else if (action === 'add-edge') {
        const source = argv.source;
        const target = argv.target;
        const label = argv.label || '';
        if (!source || !target) {
          console.error('Error: --source and --target required for add-edge');
          process.exit(1);
        }
        GraphMutator.addEdge(graph, { source, target, label });
        console.log(`✓ Added edge: ${source} -> ${target} (${label})`);
      } else if (action === 'remove-edge') {
        const source = argv.source;
        const target = argv.target;
        GraphMutator.removeEdge(graph, source, target);
        console.log(`✓ Removed edge: ${source} -> ${target}`);
      } else {
        console.error(`Unknown action: ${action}`);
        process.exit(1);
      }

      const outFile = argv.output || path.resolve(inputFile);
      fs.writeFileSync(outFile, LucidExporter.toJson(graph), 'utf-8');
      console.log(`✓ Saved mutated graph to: ${outFile}`);
      break;
    }

    case 'test': {
      console.log('=== Running LucidFlow Architect Automated Test Suite ===');
      const sampleFile = path.resolve(ROOT_DIR, 'samples', 'websocket_crash_flow.txt');
      const outDir = path.resolve(ROOT_DIR, 'output');
      ensureDir(outDir);

      // 1. Test Parse
      console.log('[Step 1] Parsing sample text flowchart...');
      const rawText = fs.readFileSync(sampleFile, 'utf-8');
      const parser = new FlowchartParser({ defaultTitle: 'WebSocket Crash Flow' });
      const graph = parser.parse(rawText);

      console.log(` -> Extracted ${graph.getNodes().length} nodes:`);
      graph.getNodes().forEach((n, idx) => {
        console.log(`    ${idx + 1}. [${n.status.toUpperCase()}] ${n.label}`);
      });
      console.log(` -> Extracted ${graph.edges.length} edges.`);

      if (graph.getNodes().length !== 7) {
        throw new Error(`Expected 7 nodes, but found ${graph.getNodes().length}`);
      }
      if (graph.edges.length !== 6) {
        throw new Error(`Expected 6 edges, but found ${graph.edges.length}`);
      }

      // 2. Test Exports
      console.log('[Step 2] Testing Exporters...');
      const csvContent = LucidExporter.toLucidCsv(graph);
      const csvPath = path.join(outDir, 'test_diagram.csv');
      fs.writeFileSync(csvPath, csvContent, 'utf-8');
      if (!csvContent.includes('Id,Name,Shape Library') || !csvContent.includes('Line Style,Source,Target')) {
        throw new Error('CSV output does not match Lucidchart two-block specification');
      }
      console.log(' -> CSV Export: PASS');

      const mmdContent = LucidExporter.toMermaid(graph);
      const mmdPath = path.join(outDir, 'test_diagram.mmd');
      fs.writeFileSync(mmdPath, mmdContent, 'utf-8');
      if (!mmdContent.includes('classDef ingress') || !mmdContent.includes('classDef crash')) {
        throw new Error('Mermaid output does not include light theme class definitions');
      }
      console.log(' -> Mermaid Light-Theme Export: PASS');

      // 3. Test Mutation: Add Node
      console.log('[Step 3] Testing Mutation: Add Intermediary Node...');
      GraphMutator.addNode(
        graph,
        {
          id: 'node_step_4b',
          label: '4b. Payload Type Injector',
          description: "Injects missing 'payload_type' discriminator into payload",
          status: 'success',
        },
        { after: 'node_step_4' }
      );
      if (!graph.hasNode('node_step_4b')) {
        throw new Error('Failed to insert node_step_4b');
      }
      console.log(' -> Insert Node & Rewire: PASS');

      // 4. Test Mutation: Remove Crash Node with Edge Healing
      console.log('[Step 4] Testing Mutation: Remove Crash Node with Edge Healing...');
      const initialNodeCount = graph.getNodes().length;
      GraphMutator.removeNode(graph, 'node_step_5', { healEdges: true });
      if (graph.hasNode('node_step_5')) {
        throw new Error('Failed to remove node_step_5');
      }
      // Edge from 4b should now connect to 6
      const outgoingFrom4b = graph.getOutgoingEdges('node_step_4b');
      const connectsTo6 = outgoingFrom4b.some((e) => e.target === 'node_step_6');
      if (!connectsTo6) {
        throw new Error('Edge healing failed: node_step_4b is not connected to node_step_6');
      }
      console.log(' -> Remove Node & Edge Healing: PASS');

      console.log('=== All Automated Tests PASSED Successfully! ===');
      break;
    }

    default:
      console.log(`
LucidFlow Architect CLI
Usage:
  node src/cli.js parse --input <file.txt> [--output <file.json>]
  node src/cli.js export --input <file.json|file.txt> [--format all|csv|mermaid|json] [--output-dir <dir>]
  node src/cli.js mutate --input <file.json> --action <add-node|remove-node|update-node|add-edge|remove-edge> [options]
  node src/cli.js test
      `);
      break;
  }
}

run().catch((err) => {
  console.error('Execution failed:', err);
  process.exit(1);
});

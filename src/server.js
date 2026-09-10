/**
 * server.js
 * Native Node.js HTTP server for LucidFlow Architect
 * Serves the interactive visualizer and provides REST endpoints for
 * parsing, mutating, and exporting diagrams.
 */

import http from 'node:http';
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
const PUBLIC_DIR = path.resolve(ROOT_DIR, 'public');
const OUTPUT_DIR = path.resolve(ROOT_DIR, 'output');
const SAMPLES_DIR = path.resolve(ROOT_DIR, 'samples');

const PORT = process.env.PORT || 3456;

// In-memory active graph instance
let activeGraph = null;

function ensureActiveGraph() {
  if (activeGraph) return activeGraph;

  const savedJsonPath = path.resolve(OUTPUT_DIR, 'diagram.json');
  if (fs.existsSync(savedJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(savedJsonPath, 'utf-8'));
      activeGraph = DiagramGraph.fromJSON(data);
      return activeGraph;
    } catch (e) {
      console.warn('Failed to load saved diagram.json, falling back to sample:', e);
    }
  }

  // Load from sample
  const samplePath = path.resolve(SAMPLES_DIR, 'websocket_crash_flow.txt');
  if (fs.existsSync(samplePath)) {
    const raw = fs.readFileSync(samplePath, 'utf-8');
    const parser = new FlowchartParser({ defaultTitle: 'WebSocket Flow' });
    activeGraph = parser.parse(raw);
    saveActiveGraph();
    return activeGraph;
  }

  activeGraph = new DiagramGraph({ title: 'New Flowchart' });
  return activeGraph;
}

function saveActiveGraph() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const jsonPath = path.resolve(OUTPUT_DIR, 'diagram.json');
  fs.writeFileSync(jsonPath, LucidExporter.toJson(activeGraph), 'utf-8');

  // Also auto-update CSV and MMD in output/
  fs.writeFileSync(path.resolve(OUTPUT_DIR, 'diagram.csv'), LucidExporter.toLucidCsv(activeGraph), 'utf-8');
  fs.writeFileSync(path.resolve(OUTPUT_DIR, 'diagram.mmd'), LucidExporter.toMermaid(activeGraph), 'utf-8');
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // API Endpoints
  if (pathname === '/api/diagram' && req.method === 'GET') {
    const graph = ensureActiveGraph();
    sendJson(res, 200, graph.toJSON());
    return;
  }

  if (pathname === '/api/parse' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const parser = new FlowchartParser({ defaultTitle: body.title || 'Parsed Diagram' });
      activeGraph = parser.parse(body.text || '');
      saveActiveGraph();
      sendJson(res, 200, activeGraph.toJSON());
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === '/api/mutate' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const graph = ensureActiveGraph();

      if (body.action === 'add-node') {
        GraphMutator.addNode(
          graph,
          {
            id: body.id,
            label: body.label,
            description: body.desc || '',
            status: body.status || 'normal',
          },
          { after: body.after, before: body.before }
        );
      } else if (body.action === 'remove-node') {
        GraphMutator.removeNode(graph, body.id, { healEdges: body.heal !== false });
      } else if (body.action === 'update-node') {
        GraphMutator.updateNode(graph, body.id, body.updates || {});
      } else if (body.action === 'add-edge') {
        GraphMutator.addEdge(graph, {
          source: body.source,
          target: body.target,
          label: body.label || '',
        });
      } else if (body.action === 'remove-edge') {
        GraphMutator.removeEdge(graph, body.source, body.target);
      } else {
        throw new Error(`Unsupported mutation action: ${body.action}`);
      }

      saveActiveGraph();
      sendJson(res, 200, graph.toJSON());
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === '/api/export/csv' && req.method === 'GET') {
    const graph = ensureActiveGraph();
    const csvData = LucidExporter.toLucidCsv(graph);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lucidchart_diagram.csv"',
    });
    res.end(csvData);
    return;
  }

  if (pathname === '/api/export/mermaid' && req.method === 'GET') {
    const graph = ensureActiveGraph();
    const mmdData = LucidExporter.toMermaid(graph);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end(mmdData);
    return;
  }

  if (pathname === '/api/export/json' && req.method === 'GET') {
    const graph = ensureActiveGraph();
    const jsonData = LucidExporter.toJson(graph);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="diagram.json"',
    });
    res.end(jsonData);
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`⚡ LucidFlow Architect Server running at http://localhost:${PORT}`);
});

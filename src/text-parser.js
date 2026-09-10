/**
 * text-parser.js
 * Parses text-based flowcharts into the DiagramGraph AST.
 * Handles Unicode/ASCII box & arrow diagrams, numbered steps, bullet points,
 * and semantic status classification.
 */

import { DiagramGraph, GraphNode, GraphEdge } from './graph-model.js';

export class FlowchartParser {
  constructor(options = {}) {
    this.options = {
      defaultTitle: 'Imported Flowchart',
      defaultDirection: 'TD',
      ...options,
    };
  }

  /**
   * Determine node semantic status based on keywords, emojis, and phrases
   */
  inferNodeStatus(label, details = []) {
    const combined = `${label} ${details.join(' ')}`.toLowerCase();

    if (
      combined.includes('💥') ||
      combined.includes('crash here') ||
      combined.includes('fatal') ||
      combined.includes('validationerror') ||
      combined.includes('panic')
    ) {
      return 'crash';
    }

    if (
      combined.includes('fallback') ||
      combined.includes('unhandled_system_error') ||
      combined.includes('unhandled_error') ||
      combined.includes('system error')
    ) {
      return 'fallback';
    }

    if (
      combined.includes('gemini') ||
      combined.includes('llm') ||
      combined.includes('subagent') ||
      combined.includes('intent classification') ||
      combined.includes('generatecontent')
    ) {
      return 'ai';
    }

    if (
      combined.includes('no crash') ||
      combined.includes('caught gracefully') ||
      combined.includes('warning') ||
      combined.includes('not registered')
    ) {
      return 'warning';
    }

    if (
      combined.includes('successresult') ||
      combined.includes('http 200') ||
      combined.includes('ok (12:') ||
      combined.includes('completed')
    ) {
      return 'success';
    }

    if (
      combined.includes('websocket') ||
      combined.includes('client') ||
      combined.includes('ingress') ||
      combined.includes('start') ||
      combined.includes('agent_query')
    ) {
      return 'ingress';
    }

    return 'normal';
  }

  /**
   * Parse arbitrary text into DiagramGraph
   */
  parse(rawText, metadata = {}) {
    const lines = rawText.split(/\r?\n/);
    const nodes = [];
    const edges = [];

    let currentNode = null;
    let pendingEdgeLabel = '';
    let nodeIndex = 0;

    const finalizeCurrentNode = () => {
      if (currentNode) {
        // Infer status if not explicitly set
        if (!currentNode.status || currentNode.status === 'normal') {
          currentNode.status = this.inferNodeStatus(
            currentNode.label,
            currentNode.details
          );
        }
        nodes.push(new GraphNode(currentNode));
        currentNode = null;
      }
    };

    const isTransitionLine = (line) => {
      const trimmed = line.trim();
      return (
        trimmed === '│' ||
        trimmed === '▼' ||
        trimmed === '|' ||
        trimmed === 'v' ||
        trimmed === '↓' ||
        trimmed === 'V' ||
        trimmed.startsWith('-->') ||
        trimmed.startsWith('->') ||
        trimmed.includes('──') ||
        trimmed.includes('==>')
      );
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      // 1. Check for transition symbols
      if (isTransitionLine(trimmed)) {
        // If current line has an arrow label like -- "label" -->
        const labelMatch = trimmed.match(/["']([^"']+)["']/);
        if (labelMatch) {
          pendingEdgeLabel = labelMatch[1];
        }
        continue;
      }

      // 2. Check for bracketed node: [Client / WebSocket: AGENT_QUERY]
      const bracketMatch = trimmed.match(/^\[(.*?)\]$/);
      if (bracketMatch) {
        finalizeCurrentNode();
        nodeIndex++;
        const label = bracketMatch[1].trim();
        currentNode = {
          id: `node_${nodeIndex}`,
          label,
          description: `Entry point: ${label}`,
          details: [],
          status: 'ingress',
          shapeType: 'Terminator',
        };

        // Create sequential edge if there was a previous node
        if (nodes.length > 0) {
          const prevNode = nodes[nodes.length - 1];
          edges.push(
            new GraphEdge({
              source: prevNode.id,
              target: currentNode.id,
              label: pendingEdgeLabel,
            })
          );
          pendingEdgeLabel = '';
        }
        continue;
      }

      // 3. Check for numbered step: "1. Schema Context Provider" or "Step 1: ..."
      const stepMatch = trimmed.match(/^(\d+)[\.\:]\s*(.+)$/);
      if (stepMatch) {
        finalizeCurrentNode();
        nodeIndex++;
        const stepNum = stepMatch[1];
        const stepLabel = `${stepNum}. ${stepMatch[2].trim()}`;

        currentNode = {
          id: `node_step_${stepNum}`,
          label: stepLabel,
          description: stepMatch[2].trim(),
          details: [],
          status: 'normal',
          shapeType: 'Process',
        };

        if (nodes.length > 0) {
          const prevNode = nodes[nodes.length - 1];
          edges.push(
            new GraphEdge({
              source: prevNode.id,
              target: currentNode.id,
              label: pendingEdgeLabel,
            })
          );
          pendingEdgeLabel = '';
        }
        continue;
      }

      // 4. Check for bullet points under current node
      const bulletMatch = trimmed.match(/^[•\-\*\+]\s*(.+)$/);
      if (bulletMatch && currentNode) {
        const detailText = bulletMatch[1].trim();
        currentNode.details.push(detailText);

        // Check if bullet point contains a major edge trigger like ValidationError
        if (detailText.toLowerCase().includes('validationerror')) {
          pendingEdgeLabel = 'ValidationError';
        }
        continue;
      }

      // 5. Continuation lines (nested code, JSON blocks, etc.)
      if (currentNode) {
        // If line is indented or part of a multi-line detail
        currentNode.details.push(trimmed);
        continue;
      }

      // 6. Generic unbracketed node
      finalizeCurrentNode();
      nodeIndex++;
      currentNode = {
        id: `node_${nodeIndex}`,
        label: trimmed,
        description: trimmed,
        details: [],
        status: 'normal',
        shapeType: 'Process',
      };

      if (nodes.length > 0) {
        const prevNode = nodes[nodes.length - 1];
        edges.push(
          new GraphEdge({
            source: prevNode.id,
            target: currentNode.id,
            label: pendingEdgeLabel,
          })
        );
        pendingEdgeLabel = '';
      }
    }

    finalizeCurrentNode();

    return new DiagramGraph({
      id: metadata.id || 'diagram_imported',
      title: metadata.title || this.options.defaultTitle,
      direction: metadata.direction || this.options.defaultDirection,
      metadata,
      nodes,
      edges,
    });
  }
}

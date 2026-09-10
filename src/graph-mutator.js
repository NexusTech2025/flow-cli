/**
 * graph-mutator.js
 * Mutation engine for DiagramGraph.
 * Provides programmatic and CLI-ready methods for adding, removing,
 * updating nodes and edges with automatic topological edge healing.
 */

import { GraphNode, GraphEdge } from './graph-model.js';

export class GraphMutator {
  /**
   * Add a node to the graph with optional contextual positioning
   */
  static addNode(
    graph,
    nodeData,
    { after = null, before = null, connectSource = null, connectTarget = null } = {}
  ) {
    const newNode = new GraphNode(nodeData);
    graph.addNode(newNode);

    if (after && graph.hasNode(after)) {
      // Find current outgoing edges from 'after'
      const outgoing = graph.getOutgoingEdges(after);
      // Connect after -> newNode
      graph.addEdge(new GraphEdge({ source: after, target: newNode.id }));

      // If 'after' was connected to a single downstream node, reconnect it: newNode -> downstream
      if (outgoing.length === 1 && !before && !connectTarget) {
        const downstreamId = outgoing[0].target;
        graph.removeEdge(after, downstreamId);
        graph.addEdge(new GraphEdge({ source: newNode.id, target: downstreamId }));
      }
    }

    if (before && graph.hasNode(before)) {
      const incoming = graph.getIncomingEdges(before);
      graph.addEdge(new GraphEdge({ source: newNode.id, target: before }));

      if (incoming.length === 1 && !after && !connectSource) {
        const upstreamId = incoming[0].source;
        graph.removeEdge(upstreamId, before);
        graph.addEdge(new GraphEdge({ source: upstreamId, target: newNode.id }));
      }
    }

    if (connectSource && graph.hasNode(connectSource)) {
      graph.addEdge(new GraphEdge({ source: connectSource, target: newNode.id }));
    }

    if (connectTarget && graph.hasNode(connectTarget)) {
      graph.addEdge(new GraphEdge({ source: newNode.id, target: connectTarget }));
    }

    return newNode;
  }

  /**
   * Remove a node from the graph, optionally healing incoming and outgoing edges
   */
  static removeNode(graph, nodeId, { healEdges = true } = {}) {
    return graph.removeNode(nodeId, healEdges);
  }

  /**
   * Update properties of an existing node
   */
  static updateNode(graph, nodeId, updates) {
    return graph.updateNode(nodeId, updates);
  }

  /**
   * Add or replace a directed edge
   */
  static addEdge(graph, edgeData) {
    return graph.addEdge(new GraphEdge(edgeData));
  }

  /**
   * Remove an edge between two nodes
   */
  static removeEdge(graph, sourceId, targetId) {
    return graph.removeEdge(sourceId, targetId);
  }
}

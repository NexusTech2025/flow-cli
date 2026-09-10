/**
 * graph-model.js
 * Canonical Graph Model for LucidFlow Architect
 * Defines DiagramGraph, GraphNode, GraphEdge, and Theme Palette.
 */

export const THEME_PALETTE = {
  ingress: {
    name: 'Ingress / Entry',
    fill: '#EBF3FC',
    stroke: '#2563EB',
    text: '#1E3A8A',
    badge: 'INGRESS',
    lucidShape: 'Terminator',
  },
  normal: {
    name: 'Normal Process',
    fill: '#F8FAFC',
    stroke: '#94A3B8',
    text: '#0F172A',
    badge: 'PROCESS',
    lucidShape: 'Process',
  },
  warning: {
    name: 'Warning / Graceful Fallback',
    fill: '#FFFBEB',
    stroke: '#F59E0B',
    text: '#78350F',
    badge: 'WARNING',
    lucidShape: 'Process',
  },
  ai: {
    name: 'AI / LLM Inference',
    fill: '#F3E8FF',
    stroke: '#9333EA',
    text: '#581C87',
    badge: 'AI TURN',
    lucidShape: 'Process',
  },
  success: {
    name: 'Success / Completed',
    fill: '#ECFDF5',
    stroke: '#10B981',
    text: '#064E3B',
    badge: 'SUCCESS',
    lucidShape: 'Process',
  },
  crash: {
    name: 'Crash / Fatal Error',
    fill: '#FEF2F2',
    stroke: '#EF4444',
    text: '#7F1D1D',
    badge: 'CRASH',
    lucidShape: 'Process',
  },
  fallback: {
    name: 'Fallback / System Error',
    fill: '#FFF1F2',
    stroke: '#E11D48',
    text: '#881337',
    badge: 'FALLBACK',
    lucidShape: 'Terminator',
  },
};

export class GraphNode {
  constructor({
    id,
    label,
    description = '',
    details = [],
    status = 'normal',
    shapeType = 'Process',
    customData = {},
  }) {
    if (!id || typeof id !== 'string') {
      throw new Error('GraphNode requires a valid non-empty string id');
    }
    this.id = id;
    this.label = label || id;
    this.description = description;
    this.details = Array.isArray(details) ? details : [];
    this.status = THEME_PALETTE[status] ? status : 'normal';
    this.shapeType = shapeType || THEME_PALETTE[this.status].lucidShape;
    this.customData = customData;
  }

  get theme() {
    return THEME_PALETTE[this.status] || THEME_PALETTE.normal;
  }

  toJSON() {
    return {
      id: this.id,
      label: this.label,
      description: this.description,
      details: this.details,
      status: this.status,
      shapeType: this.shapeType,
      customData: this.customData,
    };
  }

  static fromJSON(data) {
    return new GraphNode(data);
  }
}

export class GraphEdge {
  constructor({
    id = null,
    source,
    target,
    label = '',
    lineStyle = 'solid',
    arrowhead = 'Arrow',
  }) {
    if (!source || !target) {
      throw new Error('GraphEdge requires source and target node IDs');
    }
    this.id = id || `${source}->${target}`;
    this.source = source;
    this.target = target;
    this.label = label || '';
    this.lineStyle = ['solid', 'dashed', 'dotted'].includes(lineStyle)
      ? lineStyle
      : 'solid';
    this.arrowhead = arrowhead || 'Arrow';
  }

  toJSON() {
    return {
      id: this.id,
      source: this.source,
      target: this.target,
      label: this.label,
      lineStyle: this.lineStyle,
      arrowhead: this.arrowhead,
    };
  }

  static fromJSON(data) {
    return new GraphEdge(data);
  }
}

export class DiagramGraph {
  constructor({
    id = 'diagram_1',
    title = 'AnalyticaX Architecture Flow',
    direction = 'TD',
    nodes = [],
    edges = [],
    metadata = {},
  } = {}) {
    this.id = id;
    this.title = title;
    this.direction = ['TD', 'TB', 'LR', 'RL'].includes(direction) ? direction : 'TD';
    this.metadata = {
      created_at: metadata.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      theme: 'light',
      ...metadata,
    };

    this.nodes = new Map();
    this.edges = [];

    for (const n of nodes) {
      this.addNode(n instanceof GraphNode ? n : new GraphNode(n));
    }
    for (const e of edges) {
      this.addEdge(e instanceof GraphEdge ? e : new GraphEdge(e));
    }
  }

  addNode(node) {
    const nodeObj = node instanceof GraphNode ? node : new GraphNode(node);
    this.nodes.set(nodeObj.id, nodeObj);
    this.touch();
    return nodeObj;
  }

  getNode(id) {
    return this.nodes.get(id) || null;
  }

  hasNode(id) {
    return this.nodes.has(id);
  }

  getNodes() {
    return Array.from(this.nodes.values());
  }

  removeNode(id, healEdges = true) {
    if (!this.nodes.has(id)) return false;

    const incoming = this.getIncomingEdges(id);
    const outgoing = this.getOutgoingEdges(id);

    if (healEdges && incoming.length > 0 && outgoing.length > 0) {
      for (const inEdge of incoming) {
        for (const outEdge of outgoing) {
          const bridgedEdge = new GraphEdge({
            source: inEdge.source,
            target: outEdge.target,
            label: inEdge.label || outEdge.label,
            lineStyle: inEdge.lineStyle || outEdge.lineStyle,
          });
          this.addEdge(bridgedEdge);
        }
      }
    }

    this.edges = this.edges.filter((e) => e.source !== id && e.target !== id);
    this.nodes.delete(id);
    this.touch();
    return true;
  }

  updateNode(id, updates = {}) {
    const node = this.getNode(id);
    if (!node) return null;

    if (updates.label !== undefined) node.label = updates.label;
    if (updates.description !== undefined) node.description = updates.description;
    if (updates.details !== undefined) node.details = updates.details;
    if (updates.status !== undefined && THEME_PALETTE[updates.status]) {
      node.status = updates.status;
      node.shapeType = updates.shapeType || THEME_PALETTE[updates.status].lucidShape;
    }
    if (updates.shapeType !== undefined) node.shapeType = updates.shapeType;
    if (updates.customData !== undefined) {
      node.customData = { ...node.customData, ...updates.customData };
    }

    this.touch();
    return node;
  }

  addEdge(edge) {
    const edgeObj = edge instanceof GraphEdge ? edge : new GraphEdge(edge);
    const existingIndex = this.edges.findIndex(
      (e) => e.source === edgeObj.source && e.target === edgeObj.target
    );
    if (existingIndex >= 0) {
      this.edges[existingIndex] = edgeObj;
    } else {
      this.edges.push(edgeObj);
    }
    this.touch();
    return edgeObj;
  }

  removeEdge(source, target) {
    const initialLen = this.edges.length;
    this.edges = this.edges.filter(
      (e) => !(e.source === source && e.target === target)
    );
    const removed = this.edges.length < initialLen;
    if (removed) this.touch();
    return removed;
  }

  getOutgoingEdges(nodeId) {
    return this.edges.filter((e) => e.source === nodeId);
  }

  getIncomingEdges(nodeId) {
    return this.edges.filter((e) => e.target === nodeId);
  }

  touch() {
    this.metadata.updated_at = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      direction: this.direction,
      metadata: this.metadata,
      nodes: this.getNodes().map((n) => n.toJSON()),
      edges: this.edges.map((e) => e.toJSON()),
    };
  }

  static fromJSON(data) {
    return new DiagramGraph({
      id: data.id,
      title: data.title,
      direction: data.direction,
      metadata: data.metadata,
      nodes: (data.nodes || []).map((n) => GraphNode.fromJSON(n)),
      edges: (data.edges || []).map((e) => GraphEdge.fromJSON(e)),
    });
  }
}

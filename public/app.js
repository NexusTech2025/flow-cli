/**
 * app.js
 * Frontend controller for LucidFlow Architect
 * Handles interactive SVG layout, pan/zoom, node/edge mutations, and export.
 */

const PALETTE = {
  ingress: { fill: '#EBF3FC', stroke: '#2563EB', text: '#1E3A8A', badge: 'INGRESS' },
  normal:  { fill: '#F8FAFC', stroke: '#94A3B8', text: '#0F172A', badge: 'PROCESS' },
  warning: { fill: '#FFFBEB', stroke: '#F59E0B', text: '#78350F', badge: 'WARNING' },
  ai:      { fill: '#F3E8FF', stroke: '#9333EA', text: '#581C87', badge: 'AI TURN' },
  success: { fill: '#ECFDF5', stroke: '#10B981', text: '#064E3B', badge: 'SUCCESS' },
  crash:   { fill: '#FEF2F2', stroke: '#EF4444', text: '#7F1D1D', badge: 'CRASH' },
  fallback:{ fill: '#FFF1F2', stroke: '#E11D48', text: '#881337', badge: 'FALLBACK' },
};

class ChartApp {
  constructor() {
    this.graph = null;
    this.selectedNodeId = null;
    this.viewBox = { x: 0, y: 0, scale: 1 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };

    this.svg = document.getElementById('diagram-svg');
    this.viewportGroup = document.getElementById('viewport-group');
    this.canvasWrapper = document.getElementById('canvas-wrapper');

    this.initEventListeners();
    this.loadInitialDiagram();
  }

  initEventListeners() {
    // Canvas Pan & Zoom
    this.canvasWrapper.addEventListener('mousedown', (e) => {
      if (e.target.closest('.node-element')) return;
      this.isPanning = true;
      this.panStart = { x: e.clientX - this.viewBox.x, y: e.clientY - this.viewBox.y };
      this.canvasWrapper.classList.add('panning');
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      this.viewBox.x = e.clientX - this.panStart.x;
      this.viewBox.y = e.clientY - this.panStart.y;
      this.updateViewport();
    });

    window.addEventListener('mouseup', () => {
      this.isPanning = false;
      this.canvasWrapper.classList.remove('panning');
    });

    this.canvasWrapper.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.viewBox.scale = Math.min(Math.max(0.3, this.viewBox.scale * zoomFactor), 3);
      this.updateViewport();
    }, { passive: false });

    // Controls
    document.getElementById('ctrl-zoom-in').addEventListener('click', () => {
      this.viewBox.scale = Math.min(3, this.viewBox.scale * 1.2);
      this.updateViewport();
    });
    document.getElementById('ctrl-zoom-out').addEventListener('click', () => {
      this.viewBox.scale = Math.max(0.3, this.viewBox.scale / 1.2);
      this.updateViewport();
    });
    document.getElementById('ctrl-zoom-reset').addEventListener('click', () => {
      this.viewBox.x = 80;
      this.viewBox.y = 40;
      this.viewBox.scale = 1;
      this.updateViewport();
    });
    document.getElementById('ctrl-zoom-fit').addEventListener('click', () => {
      this.fitToScreen();
    });

    // Inspector
    document.getElementById('btn-save-node').addEventListener('click', () => this.saveSelectedNode());
    document.getElementById('btn-delete-node').addEventListener('click', () => this.deleteSelectedNode());

    // Modals
    document.getElementById('btn-import-text').addEventListener('click', () => {
      document.getElementById('modal-import').classList.add('active');
    });
    document.getElementById('btn-close-import').addEventListener('click', () => {
      document.getElementById('modal-import').classList.remove('active');
    });
    document.getElementById('btn-cancel-import').addEventListener('click', () => {
      document.getElementById('modal-import').classList.remove('active');
    });
    document.getElementById('btn-submit-import').addEventListener('click', () => this.handleImportText());

    document.getElementById('btn-add-node').addEventListener('click', () => {
      this.populateAfterDropdown();
      document.getElementById('modal-add').classList.add('active');
    });
    document.getElementById('btn-close-add').addEventListener('click', () => {
      document.getElementById('modal-add').classList.remove('active');
    });
    document.getElementById('btn-cancel-add').addEventListener('click', () => {
      document.getElementById('modal-add').classList.remove('active');
    });
    document.getElementById('btn-submit-add').addEventListener('click', () => this.handleAddNode());

    // Export Buttons
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      window.location.href = '/api/export/csv';
    });
    document.getElementById('btn-export-mermaid').addEventListener('click', async () => {
      const res = await fetch('/api/export/mermaid');
      const text = await res.text();
      navigator.clipboard.writeText(text);
      alert('Mermaid Light-Theme code copied to clipboard!');
    });
    document.getElementById('btn-view-mermaid')?.addEventListener('click', async () => {
      const res = await fetch('/api/export/mermaid');
      const text = await res.text();
      const codeEl = document.getElementById('mermaid-code-display');
      if (codeEl) codeEl.textContent = text;
      document.getElementById('modal-mermaid')?.classList.add('active');
    });
    document.getElementById('btn-close-mermaid')?.addEventListener('click', () => {
      document.getElementById('modal-mermaid')?.classList.remove('active');
    });
    document.getElementById('btn-close-mermaid-footer')?.addEventListener('click', () => {
      document.getElementById('modal-mermaid')?.classList.remove('active');
    });
    document.getElementById('btn-copy-mermaid-modal')?.addEventListener('click', () => {
      const text = document.getElementById('mermaid-code-display')?.textContent || '';
      navigator.clipboard.writeText(text);
      alert('Mermaid code copied to clipboard!');
    });
    document.getElementById('btn-export-json').addEventListener('click', () => {
      window.location.href = '/api/export/json';
    });
  }

  async loadInitialDiagram() {
    try {
      const res = await fetch('/api/diagram');
      if (res.ok) {
        this.graph = await res.json();
        this.renderDiagram();
        this.fitToScreen();
      }
    } catch (err) {
      console.error('Failed to load diagram:', err);
    }
  }

  updateViewport() {
    this.viewportGroup.setAttribute(
      'transform',
      `translate(${this.viewBox.x}, ${this.viewBox.y}) scale(${this.viewBox.scale})`
    );
  }

  fitToScreen() {
    if (!this.nodePositions || this.nodePositions.size === 0) {
      this.viewBox.x = 80;
      this.viewBox.y = 40;
      this.viewBox.scale = 0.85;
      this.updateViewport();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.nodePositions.forEach((pos) => {
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x + pos.width > maxX) maxX = pos.x + pos.width;
      if (pos.y + pos.height > maxY) maxY = pos.y + pos.height;
    });

    const canvasWidth = this.canvasWrapper.clientWidth || 1100;
    const canvasHeight = this.canvasWrapper.clientHeight || 800;
    const diagramWidth = Math.max(100, maxX - minX);
    const diagramHeight = Math.max(100, maxY - minY);

    const scaleX = (canvasWidth - 80) / diagramWidth;
    const scaleY = (canvasHeight - 80) / diagramHeight;
    const scale = Math.min(Math.max(0.35, Math.min(scaleX, scaleY)), 1.1);

    this.viewBox.scale = scale;
    this.viewBox.x = (canvasWidth - diagramWidth * scale) / 2 - minX * scale;
    this.viewBox.y = 30;
    this.updateViewport();
  }

  computeDAGLayout() {
    if (!this.graph || !this.graph.nodes || this.graph.nodes.length === 0) {
      return new Map();
    }

    const nodes = this.graph.nodes;
    const edges = this.graph.edges || [];

    const outgoing = new Map();
    const incoming = new Map();
    nodes.forEach((n) => {
      outgoing.set(n.id, []);
      incoming.set(n.id, []);
    });
    edges.forEach((e) => {
      if (outgoing.has(e.source)) outgoing.get(e.source).push(e.target);
      if (incoming.has(e.target)) incoming.get(e.target).push(e.source);
    });

    // Compute ranks using longest-path DAG relaxation
    const ranks = new Map();
    const roots = nodes.filter((n) => (incoming.get(n.id) || []).length === 0);
    if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0]);
    roots.forEach((r) => ranks.set(r.id, 0));

    let changed = true;
    let limit = nodes.length * 2;
    while (changed && limit-- > 0) {
      changed = false;
      edges.forEach((e) => {
        if (e.label && (e.label.toLowerCase().includes('refine') || e.label.toLowerCase().includes('retry') || e.label.toLowerCase().includes('loop'))) {
          return;
        }
        const srcRank = ranks.get(e.source) ?? 0;
        const tgtRank = ranks.get(e.target) ?? 0;
        if (srcRank + 1 > tgtRank) {
          ranks.set(e.target, srcRank + 1);
          changed = true;
        }
      });
    }
    nodes.forEach((n) => {
      if (!ranks.has(n.id)) ranks.set(n.id, 0);
    });

    const maxRank = Math.max(...Array.from(ranks.values()), 0);
    const layers = [];
    for (let r = 0; r <= maxRank; r++) layers.push([]);
    nodes.forEach((n) => layers[ranks.get(n.id)].push(n));

    const nodePositions = new Map();
    const nodeWidth = 440;
    const horizontalGap = 80;
    const verticalGap = 70;
    const centerCanvasX = 540;

    let currentY = 40;

    for (let r = 0; r < layers.length; r++) {
      const layerNodes = layers[r];
      if (layerNodes.length === 0) continue;

      let maxLayerHeight = 0;

      if (layerNodes.length === 1) {
        const node = layerNodes[0];
        const parents = incoming.get(node.id) || [];
        let posX = centerCanvasX - nodeWidth / 2;

        // If node has exactly 1 parent and that parent is offset horizontally, align with parent
        if (parents.length === 1) {
          const parentPos = nodePositions.get(parents[0]);
          if (parentPos && Math.abs(parentPos.x + parentPos.width / 2 - centerCanvasX) > 60) {
            posX = parentPos.x;
          }
        }

        const detailsCount = (node.details || []).length;
        const calcHeight = Math.max(85, 75 + detailsCount * 20);
        maxLayerHeight = calcHeight;

        nodePositions.set(node.id, {
          x: posX,
          y: currentY,
          width: nodeWidth,
          height: calcHeight,
          rank: r,
        });
      } else {
        const totalWidth = layerNodes.length * nodeWidth + (layerNodes.length - 1) * horizontalGap;
        const startX = centerCanvasX - totalWidth / 2;

        layerNodes.forEach((node, idx) => {
          const detailsCount = (node.details || []).length;
          const calcHeight = Math.max(85, 75 + detailsCount * 20);
          if (calcHeight > maxLayerHeight) maxLayerHeight = calcHeight;

          const posX = startX + idx * (nodeWidth + horizontalGap);

          nodePositions.set(node.id, {
            x: posX,
            y: currentY,
            width: nodeWidth,
            height: calcHeight,
            rank: r,
          });
        });
      }

      currentY += maxLayerHeight + verticalGap;
    }

    this.nodePositions = nodePositions;
    return nodePositions;
  }

  renderDiagram() {
    if (!this.graph || !this.graph.nodes) return;

    this.viewportGroup.innerHTML = '';
    const nodePositions = this.computeDAGLayout();

    // 0. Draw Containers / Subgraphs
    const containersGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    containersGroup.setAttribute('class', 'containers-layer');

    const containers = new Map();
    this.graph.nodes.forEach((node) => {
      const cId = node.customData?.container;
      if (!cId) return;
      if (!containers.has(cId)) {
        containers.set(cId, {
          id: cId,
          title: node.customData?.containerTitle || cId,
          nodeIds: [],
        });
      }
      containers.get(cId).nodeIds.push(node.id);
    });

    containers.forEach((cont) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cont.nodeIds.forEach((id) => {
        const pos = nodePositions.get(id);
        if (!pos) return;
        if (pos.x < minX) minX = pos.x;
        if (pos.y < minY) minY = pos.y;
        if (pos.x + pos.width > maxX) maxX = pos.x + pos.width;
        if (pos.y + pos.height > maxY) maxY = pos.y + pos.height;
      });

      if (minX === Infinity) return;

      const padX = 40;
      const padTop = 45;
      const padBottom = 25;
      const boxX = minX - padX;
      const boxY = minY - padTop;
      const boxWidth = (maxX - minX) + padX * 2;
      const boxHeight = (maxY - minY) + padTop + padBottom;

      // Outer Container Box
      const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      box.setAttribute('x', String(boxX));
      box.setAttribute('y', String(boxY));
      box.setAttribute('width', String(boxWidth));
      box.setAttribute('height', String(boxHeight));
      box.setAttribute('rx', '18');
      box.setAttribute('fill', 'rgba(243, 232, 255, 0.22)');
      box.setAttribute('stroke', '#9333EA');
      box.setAttribute('stroke-width', '2');
      box.setAttribute('stroke-dasharray', '8, 6');
      containersGroup.appendChild(box);

      // Header Tag
      const headerPill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const titleWidth = Math.max(200, cont.title.length * 8.5 + 32);
      headerPill.setAttribute('x', String(boxX + 24));
      headerPill.setAttribute('y', String(boxY - 14));
      headerPill.setAttribute('width', String(titleWidth));
      headerPill.setAttribute('height', '28');
      headerPill.setAttribute('rx', '8');
      headerPill.setAttribute('fill', '#9333EA');
      headerPill.setAttribute('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))');
      containersGroup.appendChild(headerPill);

      const headerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      headerText.setAttribute('x', String(boxX + 24 + titleWidth / 2));
      headerText.setAttribute('y', String(boxY + 5));
      headerText.setAttribute('text-anchor', 'middle');
      headerText.setAttribute('fill', '#FFFFFF');
      headerText.setAttribute('font-size', '12');
      headerText.setAttribute('font-weight', '700');
      headerText.setAttribute('font-family', 'sans-serif');
      headerText.textContent = cont.title;
      containersGroup.appendChild(headerText);
    });

    this.viewportGroup.appendChild(containersGroup);

    // 1. Draw Edges
    const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    edgesGroup.setAttribute('class', 'edges-layer');

    (this.graph.edges || []).forEach((edge) => {
      const srcPos = nodePositions.get(edge.source);
      const tgtPos = nodePositions.get(edge.target);
      if (!srcPos || !tgtPos) return;

      const startX = srcPos.x + srcPos.width / 2;
      const startY = srcPos.y + srcPos.height;
      const endX = tgtPos.x + tgtPos.width / 2;
      const endY = tgtPos.y;

      // Handle upward feedback loop (e.g. Refine loop)
      if (srcPos.y >= tgtPos.y) {
        const strokeColor = '#9333EA';
        const markerId = 'url(#arrow-solid)';

        const exitX = srcPos.x + srcPos.width;
        const exitY = srcPos.y + srcPos.height / 2;
        const enterX = tgtPos.x + tgtPos.width;
        const enterY = tgtPos.y + tgtPos.height / 2;
        const loopOffset = Math.max(exitX, enterX) + 80;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${exitX} ${exitY} C ${loopOffset} ${exitY}, ${loopOffset} ${enterY}, ${enterX} ${enterY}`;
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', strokeColor);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '6 4');
        path.setAttribute('marker-end', markerId);
        edgesGroup.appendChild(path);

        if (edge.label) {
          const midX = loopOffset + 8;
          const midY = (exitY + enterY) / 2;
          const labelText = edge.label;
          const textWidth = Math.max(80, labelText.length * 7.5 + 20);

          const pill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          pill.setAttribute('x', String(midX - textWidth / 2));
          pill.setAttribute('y', String(midY - 11));
          pill.setAttribute('width', String(textWidth));
          pill.setAttribute('height', '22');
          pill.setAttribute('rx', '11');
          pill.setAttribute('fill', '#FFFFFF');
          pill.setAttribute('stroke', strokeColor);
          pill.setAttribute('stroke-width', '1.2');
          pill.setAttribute('filter', 'drop-shadow(0 1px 3px rgba(0,0,0,0.12))');
          edgesGroup.appendChild(pill);

          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', String(midX));
          text.setAttribute('y', String(midY + 4));
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('fill', strokeColor);
          text.setAttribute('font-size', '11');
          text.setAttribute('font-weight', '700');
          text.setAttribute('font-family', 'sans-serif');
          text.textContent = labelText;
          edgesGroup.appendChild(text);
        }
        return;
      }

      const isDanger = edge.label && edge.label.toLowerCase().includes('validationerror');
      const strokeColor = isDanger ? '#EF4444' : '#64748B';
      const markerId = isDanger ? 'url(#arrow-danger)' : 'url(#arrow-solid)';

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const midY = (startY + endY) / 2;
      const d = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', strokeColor);
      path.setAttribute('stroke-width', '2');
      path.setAttribute('marker-end', markerId);
      edgesGroup.appendChild(path);

      if (edge.label) {
        const midX = (startX + endX) / 2;
        const labelText = edge.label;
        const textWidth = Math.max(80, labelText.length * 7.5 + 20);

        // White background pill mask
        const pill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        pill.setAttribute('x', String(midX - textWidth / 2));
        pill.setAttribute('y', String(midY - 11));
        pill.setAttribute('width', String(textWidth));
        pill.setAttribute('height', '22');
        pill.setAttribute('rx', '11');
        pill.setAttribute('fill', '#FFFFFF');
        pill.setAttribute('stroke', isDanger ? '#EF4444' : '#CBD5E1');
        pill.setAttribute('stroke-width', '1.2');
        pill.setAttribute('filter', 'drop-shadow(0 1px 3px rgba(0,0,0,0.12))');
        edgesGroup.appendChild(pill);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(midX));
        text.setAttribute('y', String(midY + 4));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', isDanger ? '#EF4444' : '#1E293B');
        text.setAttribute('font-size', '11');
        text.setAttribute('font-weight', '700');
        text.setAttribute('font-family', 'sans-serif');
        text.textContent = labelText;
        edgesGroup.appendChild(text);
      }
    });

    this.viewportGroup.appendChild(edgesGroup);

    // 2. Draw Nodes
    const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodesGroup.setAttribute('class', 'nodes-layer');

    this.graph.nodes.forEach((node) => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;

      const style = PALETTE[node.status] || PALETTE.normal;
      const isSelected = this.selectedNodeId === node.id;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'node-element');
      g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
      g.style.cursor = 'pointer';

      // Card Shape
      if (node.shapeType === 'Decision') {
        const hex = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const cut = 20;
        const d = `M ${cut} 0 L ${pos.width - cut} 0 L ${pos.width} ${pos.height / 2} L ${pos.width - cut} ${pos.height} L ${cut} ${pos.height} L 0 ${pos.height / 2} Z`;
        hex.setAttribute('d', d);
        hex.setAttribute('fill', style.fill);
        hex.setAttribute('stroke', isSelected ? '#1D4ED8' : style.stroke);
        hex.setAttribute('stroke-width', isSelected ? '3' : '2');
        hex.setAttribute('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))');
        g.appendChild(hex);
      } else {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', String(pos.width));
        rect.setAttribute('height', String(pos.height));
        rect.setAttribute('rx', node.shapeType === 'Terminator' ? '24' : '10');
        rect.setAttribute('fill', style.fill);
        rect.setAttribute('stroke', isSelected ? '#1D4ED8' : style.stroke);
        rect.setAttribute('stroke-width', isSelected ? '3' : '1.8');
        rect.setAttribute('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.06))');
        g.appendChild(rect);
      }

      // Status Badge
      const badgeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      badgeG.setAttribute('transform', `translate(${pos.width - 95}, 14)`);

      const badgeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      badgeRect.setAttribute('width', '80');
      badgeRect.setAttribute('height', '18');
      badgeRect.setAttribute('rx', '4');
      badgeRect.setAttribute('fill', style.stroke);
      badgeG.appendChild(badgeRect);

      const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badgeText.setAttribute('x', '40');
      badgeText.setAttribute('y', '12');
      badgeText.setAttribute('text-anchor', 'middle');
      badgeText.setAttribute('fill', '#FFFFFF');
      badgeText.setAttribute('font-size', '9');
      badgeText.setAttribute('font-weight', '700');
      badgeText.setAttribute('font-family', 'sans-serif');
      badgeText.textContent = node.shapeType === 'Decision' ? 'DECISION' : style.badge;
      badgeG.appendChild(badgeText);
      g.appendChild(badgeG);

      // Title Text
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      title.setAttribute('x', node.shapeType === 'Decision' ? '28' : '20');
      title.setAttribute('y', '28');
      title.setAttribute('fill', style.text);
      title.setAttribute('font-size', '14');
      title.setAttribute('font-weight', '700');
      title.setAttribute('font-family', 'sans-serif');
      title.textContent = node.label.length > 38 ? node.label.slice(0, 36) + '...' : node.label;
      g.appendChild(title);

      // Details / Bullets
      let detailY = 52;
      (node.details || []).slice(0, 4).forEach((d) => {
        const detailText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        detailText.setAttribute('x', node.shapeType === 'Decision' ? '30' : '24');
        detailText.setAttribute('y', String(detailY));
        detailText.setAttribute('fill', '#334155');
        detailText.setAttribute('font-size', '11');
        detailText.setAttribute('font-family', 'sans-serif');
        const textContent = d.length > 56 ? d.slice(0, 54) + '...' : d;
        detailText.textContent = `• ${textContent}`;
        g.appendChild(detailText);
        detailY += 18;
      });

      // Click to inspect
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectNode(node.id);
      });

      nodesGroup.appendChild(g);
    });

    this.viewportGroup.appendChild(nodesGroup);
  }

  selectNode(nodeId) {
    this.selectedNodeId = nodeId;
    const node = this.graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    document.getElementById('inspector-empty').style.display = 'none';
    document.getElementById('inspector-form').style.display = 'flex';

    document.getElementById('inp-node-id').value = node.id;
    document.getElementById('inp-node-label').value = node.label;
    document.getElementById('inp-node-status').value = node.status;
    document.getElementById('inp-node-desc').value = node.description || '';

    const badge = document.getElementById('selected-badge');
    badge.className = `badge badge-${node.status}`;
    badge.textContent = (PALETTE[node.status] || PALETTE.normal).badge;

    const detailsList = document.getElementById('node-details-list');
    detailsList.innerHTML = '';
    (node.details || []).forEach((d) => {
      const li = document.createElement('li');
      li.className = 'details-item';
      li.textContent = d;
      detailsList.appendChild(li);
    });

    this.renderDiagram();
  }

  async saveSelectedNode() {
    if (!this.selectedNodeId) return;

    const updates = {
      label: document.getElementById('inp-node-label').value,
      status: document.getElementById('inp-node-status').value,
      description: document.getElementById('inp-node-desc').value,
    };

    const res = await fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update-node',
        id: this.selectedNodeId,
        updates,
      }),
    });

    if (res.ok) {
      this.graph = await res.json();
      this.selectNode(this.selectedNodeId);
      this.renderDiagram();
    }
  }

  async deleteSelectedNode() {
    if (!this.selectedNodeId) return;
    if (!confirm(`Are you sure you want to delete ${this.selectedNodeId}? Edges will be automatically healed.`)) return;

    const res = await fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'remove-node',
        id: this.selectedNodeId,
        heal: true,
      }),
    });

    if (res.ok) {
      this.graph = await res.json();
      this.selectedNodeId = null;
      document.getElementById('inspector-form').style.display = 'none';
      document.getElementById('inspector-empty').style.display = 'block';
      this.renderDiagram();
    }
  }

  populateAfterDropdown() {
    const select = document.getElementById('new-node-after');
    select.innerHTML = '<option value="">-- None (Standalone / Manual Wiring) --</option>';
    if (this.graph && this.graph.nodes) {
      this.graph.nodes.forEach((n) => {
        const opt = document.createElement('option');
        opt.value = n.id;
        opt.textContent = `${n.id}: ${n.label}`;
        if (this.selectedNodeId === n.id) opt.selected = true;
        select.appendChild(opt);
      });
    }
  }

  async handleAddNode() {
    const id = document.getElementById('new-node-id').value.trim();
    const label = document.getElementById('new-node-label').value.trim();
    const status = document.getElementById('new-node-status').value;
    const desc = document.getElementById('new-node-desc').value.trim();
    const after = document.getElementById('new-node-after').value;

    if (!id || !label) {
      alert('Node ID and Label are required.');
      return;
    }

    const res = await fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add-node',
        id,
        label,
        status,
        desc,
        after: after || null,
      }),
    });

    if (res.ok) {
      this.graph = await res.json();
      document.getElementById('modal-add').classList.remove('active');
      this.selectNode(id);
      this.renderDiagram();
    }
  }

  async handleImportText() {
    const text = document.getElementById('txt-import-content').value;
    if (!text.trim()) return;

    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (res.ok) {
      this.graph = await res.json();
      document.getElementById('modal-import').classList.remove('active');
      this.renderDiagram();
      this.fitToScreen();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ChartApp();
});

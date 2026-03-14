// ===== MINDMAP =====
let mindmapData = null;          // current mindmap tree
let mindmapVocabId = null;       // vocab id being edited
let mindmapSelectedId = null;    // currently selected node id
let mindmapEditingId = null;     // node being inline-edited
let mindmapLayout = 'tree';      // 'tree' | 'radial' | 'vertical'
let mindmapHistory = [];         // stack of { vocabId, sectionId } for back navigation
let mindmapPanX = 0;
let mindmapPanY = 0;
let mindmapZoom = 1;
let mmIsPanning = false;
let mmPanStart = { x: 0, y: 0, px: 0, py: 0 };
let mmHoverTimeout = null;
let mmHoveredNodeId = null;
let mmDragNodeId = null;
let mmDragOverNodeId = null;
let mmIsDragging = false;
let mmDragGhost = null;
let mmDragStartPos = { x: 0, y: 0 };

let mmUndoStack = [];      // undo history: [ {data, selectedId, description} ]
let mmRedoStack = [];      // redo history
const MM_UNDO_MAX = 50;    // maximum undo depth
let _lastMmPositions = null; // last computed layout positions (for DOM connection fix)

// @mention autocomplete state
let mmMentionActive = false;
let mmMentionItems  = [];   // [{vocabId, sectionId, word}]
let mmMentionIdx    = 0;
let _mmMentionEl    = null; // singleton dropdown DOM element

// ── Image blob cache ─────────────────────────────────────────────────────────
// Each image file is fetched once per page session and stored as an ObjectURL.
// Re-renders skip the network entirely and reuse the cached URL.
const _mmImageCache = new Map(); // filename → objectURL | 'loading'

function _mmSetImageSrc(imgEl, filename) {
  if (!filename) return;
  const cached = _mmImageCache.get(filename);
  if (cached && cached !== 'loading') {
    imgEl.src = cached;
    return;
  }
  // Mark element so we can fill it when the fetch completes
  imgEl.dataset.mmimg = filename;
  if (cached === 'loading') return; // fetch already in-flight
  _mmImageCache.set(filename, 'loading');
  fetch(`${API_BASE}/images/${filename}`)
    .then(r => r.ok ? r.blob() : Promise.reject(r.status))
    .then(blob => {
      const url = URL.createObjectURL(blob);
      _mmImageCache.set(filename, url);
      // Apply to every img element waiting for this filename
      document.querySelectorAll(`img[data-mmimg="${filename}"]`).forEach(el => {
        el.src = url;
        delete el.dataset.mmimg;
      });
    })
    .catch(err => {
      _mmImageCache.delete(filename); // allow retry next time
      console.warn('[mmImage] failed to load:', filename, err);
    });
}

function _mmEvictImage(filename) {
  const url = _mmImageCache.get(filename);
  if (url && url !== 'loading') URL.revokeObjectURL(url);
  _mmImageCache.delete(filename);
}

function createMindmapNode(text, parentId) {
  return { id: uid(), text: text || '', desc: '', image: '', imageSize: 'small', imageHidden: false, collapsed: false, children: [], _parentId: parentId || null };
}

function initMindmapData(word) {
  const root = createMindmapNode(word, null);
  root.id = 'root';
  return root;
}

function getMindmaps() {
  if (!appData.mindmaps) appData.mindmaps = {};
  return appData.mindmaps;
}

function getMindmapLayout(vocabId) {
  if (!appData.mindmapLayouts) appData.mindmapLayouts = {};
  return appData.mindmapLayouts[vocabId] || 'tree';
}

function setMindmapLayout(vocabId, layout) {
  if (!appData.mindmapLayouts) appData.mindmapLayouts = {};
  appData.mindmapLayouts[vocabId] = layout;
  saveData();
}

function updateMindmapBackBtn() {
  const btn = document.getElementById('btn-mm-back');
  if (btn) btn.style.display = mindmapHistory.length > 0 ? '' : 'none';
}

function goBackMindmap() {
  if (mindmapHistory.length === 0) return;
  const prev = mindmapHistory.pop();
  currentVocabId = prev.vocabId;
  currentVocabSectionId = prev.sectionId;
  openMindmap(false); // false = don't push to history
}

function openMindmap(pushHistory) {
  if (!currentVocabId || !currentVocabSectionId) return;
  const vocabs = appData.vocabs[currentVocabSectionId] || [];
  const vocab = vocabs.find(v => v.id === currentVocabId);
  if (!vocab) return;

  const mindmaps = getMindmaps();
  mindmapVocabId = currentVocabId;
  mindmapLayout = getMindmapLayout(currentVocabId);

  const overlay = document.getElementById('mindmap-overlay');
  document.getElementById('mindmap-title').textContent = `Mindmap: ${vocab.word}`;

  // Set layout switcher active state
  document.querySelectorAll('.mm-layout-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layout === mindmapLayout);
  });

  updateMindmapBackBtn();

  if (mindmaps[currentVocabId]) {
    mindmapData = JSON.parse(JSON.stringify(mindmaps[currentVocabId]));
    rebuildParentRefs(mindmapData, null);
    // Clear undo/redo history whenever a new mindmap is loaded
    mmUndoStack = []; mmRedoStack = []; updateUndoRedoBtns();
    overlay.style.display = 'flex';
    mindmapSelectedId = 'root';
    mindmapEditingId = null;
    resetMindmapPan();
    renderMindmap();
    renderParentMapsBar();
    closeMindmapSidePanel();
  } else {
    overlay.style.display = 'flex';
    mindmapData = null;
    mindmapSelectedId = null;
    mindmapEditingId = null;
    renderParentMapsBar();
    closeMindmapSidePanel();
    showMindmapCreatePrompt(vocab.word);
  }
}

function showMindmapCreatePrompt(word) {
  const canvas = document.getElementById('mindmap-canvas');
  const panLayer = document.getElementById('mindmap-pan-layer');
  if (panLayer) {
    panLayer.innerHTML = '';
  }
  canvas.innerHTML = `
    <div class="mindmap-create-prompt">
      <i class="fas fa-project-diagram"></i>
      <p>No mindmap exists for "<strong>${escapeHtml(word)}</strong>"</p>
      <button id="btn-create-mindmap" class="btn btn-primary"><i class="fas fa-plus"></i> Create Mindmap</button>
    </div>
  `;
  document.getElementById('btn-create-mindmap').addEventListener('click', () => {
    mindmapData = initMindmapData(word);
    mindmapSelectedId = 'root';
    canvas.innerHTML = '<div id="mindmap-pan-layer" class="mindmap-pan-layer"><svg id="mindmap-svg" class="mindmap-svg"></svg><div id="mindmap-nodes" class="mindmap-nodes"></div></div>';
    resetMindmapPan();
    renderMindmap();
    saveMindmap();
    openMindmapSidePanel('root');
  });
}

function closeMindmap() {
  document.getElementById('mindmap-overlay').style.display = 'none';
  document.getElementById('mm-hover-menu').style.display = 'none';
  mmHideMentionDropdown();
  const bar = document.getElementById('mm-parent-maps-bar');
  if (bar) bar.style.display = 'none';
  mindmapData = null;
  mindmapVocabId = null;
  mindmapSelectedId = null;
  mindmapEditingId = null;
  mindmapHistory = [];
  mmUndoStack = []; mmRedoStack = [];
  mindmapZoom = 1;
  updateMindmapBackBtn();
  closeMindmapSidePanel();
}

function saveMindmap() {
  if (!mindmapVocabId || !mindmapData) return;
  const mindmaps = getMindmaps();
  mindmaps[mindmapVocabId] = cleanMindmapForSave(mindmapData);
  saveData();
}

// ===== UNDO / REDO =====

/** Snapshot the current mindmap state for the undo/redo stacks. */
function mmSnapshotState() {
  return {
    data: JSON.parse(JSON.stringify(mindmapData)),
    selectedId: mindmapSelectedId,
  };
}

/**
 * Push the current state onto the undo stack before a mutation.
 * @param {string} description  Short label shown in the undo button tooltip.
 */
function mmPushUndo(description) {
  if (!mindmapData) return;
  mmUndoStack.push({ ...mmSnapshotState(), description: description || '' });
  if (mmUndoStack.length > MM_UNDO_MAX) mmUndoStack.shift();
  mmRedoStack = [];  // new action clears redo
  updateUndoRedoBtns();
}

/** Undo the last mindmap operation. */
function mmUndo() {
  if (!mmUndoStack.length || !mindmapData) return;
  mmRedoStack.push(mmSnapshotState());
  const prev = mmUndoStack.pop();
  mindmapData = prev.data;
  rebuildParentRefs(mindmapData, null);
  mindmapSelectedId = prev.selectedId;
  getMindmaps()[mindmapVocabId] = cleanMindmapForSave(mindmapData);
  saveData();
  renderMindmap();
  updateUndoRedoBtns();
  if (mindmapSelectedId) openMindmapSidePanel(mindmapSelectedId);
}

/** Redo the last undone mindmap operation. */
function mmRedo() {
  if (!mmRedoStack.length || !mindmapData) return;
  mmUndoStack.push(mmSnapshotState());
  const next = mmRedoStack.pop();
  mindmapData = next.data;
  rebuildParentRefs(mindmapData, null);
  mindmapSelectedId = next.selectedId;
  getMindmaps()[mindmapVocabId] = cleanMindmapForSave(mindmapData);
  saveData();
  renderMindmap();
  updateUndoRedoBtns();
  if (mindmapSelectedId) openMindmapSidePanel(mindmapSelectedId);
}

/** Update the enabled/disabled state and tooltips of the undo/redo toolbar buttons. */
function updateUndoRedoBtns() {
  const undoBtn = document.getElementById('btn-mindmap-undo');
  const redoBtn = document.getElementById('btn-mindmap-redo');
  if (undoBtn) {
    undoBtn.disabled = mmUndoStack.length === 0;
    const lastDesc = mmUndoStack.length ? mmUndoStack[mmUndoStack.length - 1].description : '';
    undoBtn.title = `Undo${lastDesc ? ': ' + lastDesc : ''} (Ctrl+Z)`;
  }
  if (redoBtn) {
    redoBtn.disabled = mmRedoStack.length === 0;
    const nextDesc = mmRedoStack.length ? mmRedoStack[mmRedoStack.length - 1].description : '';
    redoBtn.title = `Redo${nextDesc ? ': ' + nextDesc : ''} (Ctrl+Y)`;
  }
}

// ===== POST-RENDER CONNECTION FIX =====
// After the DOM renders (especially after images load), re-draw SVG connection
// paths using the actual rendered heights of the label boxes so lines connect
// to the true visual centre even for landscape images whose rendered height
// is smaller than the estimated one used during layout.
function redrawConnectionsFromDOM() {
  const svg = document.getElementById('mindmap-svg');
  if (!svg || !mindmapData || !_lastMmPositions) return;

  // Map nodeId → actual label-box height from the live DOM
  const domLh = {};
  document.querySelectorAll('.mm-node').forEach(el => {
    const nodeId = el.dataset.nodeId;
    if (!nodeId) return;
    const labelEl = el.querySelector('.mm-node-label');
    if (labelEl) domLh[nodeId] = labelEl.offsetHeight;
  });
  if (Object.keys(domLh).length === 0) return;

  // Patch only the lh values; x/y/w/h stay as computed by the layout algorithm
  const patched = {};
  Object.keys(_lastMmPositions).forEach(id => {
    patched[id] = Object.assign({}, _lastMmPositions[id]);
    if (domLh[id] !== undefined) patched[id].lh = domLh[id];
  });

  svg.innerHTML = '';
  drawConnections(mindmapData, patched, svg);
}

function cleanMindmapForSave(node) {
  const obj = {
    id: node.id,
    text: node.text,
    desc: node.desc || '',
    collapsed: !!node.collapsed,
    children: (node.children || []).map(c => cleanMindmapForSave(c))
  };
  if (node.image) { obj.image = node.image; obj.imageSize = node.imageSize || 'small'; if (node.imageHidden) obj.imageHidden = true; }
  if (node.vocabLink) { obj.vocabLink = { vocabId: node.vocabLink.vocabId, sectionId: node.vocabLink.sectionId }; }
  return obj;
}

function rebuildParentRefs(node, parentId) {
  node._parentId = parentId;
  if (!node.desc) node.desc = '';
  if (!node.image) node.image = '';
  if (!node.imageSize) node.imageSize = 'small';
  if (node.imageHidden === undefined) node.imageHidden = false;
  if (node.collapsed === undefined) node.collapsed = false;
  if (!node.vocabLink) node.vocabLink = null;
  (node.children || []).forEach(c => rebuildParentRefs(c, node.id));
}

function findNode(node, id) {
  if (node.id === id) return node;
  for (const child of (node.children || [])) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// Returns true if targetId is inside the subtree of ancestorNode (not the ancestor itself)
function isDescendant(ancestorNode, targetId) {
  const kids = dispChildren(ancestorNode);
  for (const child of kids) {
    if (child.id === targetId) return true;
    if (isDescendant(child, targetId)) return true;
  }
  return false;
}

function executeMindmapDrop() {
  // Clean up visual state regardless
  document.querySelectorAll('.mm-node-drag-over, .mm-node-drag-source')
    .forEach(el => { el.classList.remove('mm-node-drag-over'); el.classList.remove('mm-node-drag-source'); });
  if (mmDragGhost) { mmDragGhost.remove(); mmDragGhost = null; }

  if (!mmDragNodeId || !mmDragOverNodeId) return;
  if (mmDragNodeId === mmDragOverNodeId) return;

  const dragNode = findNode(mindmapData, mmDragNodeId);
  if (!dragNode || dragNode._readonly) return;
  const dropTarget = findNode(mindmapData, mmDragOverNodeId);
  if (!dropTarget || dropTarget._readonly || dropTarget.vocabLink) return;

  // Prevent dropping onto a descendant of the dragged node
  if (isDescendant(dragNode, mmDragOverNodeId)) return;

  const currentParent = findParentNode(mindmapData, mmDragNodeId);
  if (!currentParent) return;

  mmPushUndo('reparent node');
  // Remove from current parent
  const idx = currentParent.children.findIndex(c => c.id === mmDragNodeId);
  if (idx !== -1) currentParent.children.splice(idx, 1);

  // Attach to drop target
  if (!dropTarget.children) dropTarget.children = [];
  dropTarget.children.push(dragNode);
  dragNode._parentId = dropTarget.id;

  mindmapSelectedId = mmDragNodeId;
  saveMindmap();
  renderMindmap();
  openMindmapSidePanel(mmDragNodeId);
}

function findParentNode(node, childId) {
  for (const child of (node.children || [])) {
    if (child.id === childId) return node;
    const found = findParentNode(child, childId);
    if (found) return found;
  }
  return null;
}

// ===== LINKED CHILDREN RESOLUTION =====
// Returns the children to display: live linked children from the linked mindmap (if vocabLink exists), else own children
function dispChildren(node) {
  if (node._linkedChildren !== undefined && node._linkedChildren !== null) return node._linkedChildren;
  return node.children || [];
}

// Re-key all node IDs in a (deep-cloned) subtree so that multiple references
// to the same external mindmap don't collide in the positions map.
// The prefix is the ID of the vocabLink holder, making IDs unique per slot.
function _reKeyNodes(nodes, prefix, idMap) {
  nodes.forEach(n => {
    const newId = prefix + '__' + n.id;
    idMap[n.id] = newId;
    n.id = newId;
    if (n.children && n.children.length) _reKeyNodes(n.children, prefix, idMap);
  });
}

// Call before every layout/render pass. Injects live children from linked mindmaps (not saved).
function resolveLinkedChildren(node, visited) {
  if (!visited) visited = new Set();
  if (visited.has(node.id)) return; // prevent cycles
  visited.add(node.id);

  node._linkedChildren = null;
  if (node.vocabLink && node.vocabLink.vocabId) {
    const linkedMM = getMindmaps()[node.vocabLink.vocabId];
    if (linkedMM) {
      const kids = JSON.parse(JSON.stringify(linkedMM.children || []));
      // Re-key IDs so that two nodes linking to the same external mindmap
      // produce unique IDs and never overwrite each other in the positions map.
      _reKeyNodes(kids, node.id, {});
      markNodesReadonly(kids, node.vocabLink);
      node._linkedChildren = kids;
      // Also resolve nested links within live children
      node._linkedChildren.forEach(c => resolveLinkedChildren(c, new Set(visited)));
    } else {
      node._linkedChildren = [];
    }
  }
  (node.children || []).forEach(c => resolveLinkedChildren(c, visited));
}

function markNodesReadonly(nodes, fromVocabLink) {
  nodes.forEach(n => {
    n._readonly = true;
    n._fromVocabLink = fromVocabLink;
    if (n.children && n.children.length) markNodesReadonly(n.children, fromVocabLink);
  });
}

// ===== LAYOUT ALGORITHMS =====
const MM_IMAGE_SIZES = { small: 60, medium: 120, large: 200, xl: 320 };

function estimateNodeWidth(text, level, node) {
  if (node && node.image && !node.imageHidden) {
    const imgSize = MM_IMAGE_SIZES[node.imageSize || 'small'];
    return Math.max(imgSize + 24, 80);
  }
  const fontSize = level === 0 ? 16 : 14;
  const charWidth = fontSize * 0.65;
  return Math.max(80, text.length * charWidth + 32);
}

function getNodeTotalHeight(hasDesc, node) {
  if (node && node.image && !node.imageHidden) {
    const imgSize = MM_IMAGE_SIZES[node.imageSize || 'small'];
    const textH = node.text ? 22 : 0;  // text label under image
    return imgSize + 16 + textH + (hasDesc ? 18 : 0);
  }
  return hasDesc ? 58 : 40;  // label + desc
}
function getRootTotalHeight(hasDesc, node) {
  if (node && node.image && !node.imageHidden) {
    const imgSize = MM_IMAGE_SIZES[node.imageSize || 'small'];
    const textH = node.text ? 22 : 0;
    return imgSize + 20 + textH + (hasDesc ? 22 : 0);
  }
  return hasDesc ? 70 : 48;
}

// --- TREE layout (horizontal right-branching) ---
function layoutTree(root) {
  const positions = {};
  const GAP_H = 70, GAP_V = 18;

  function calcHeight(node, lvl) {
    const h = lvl === 0 ? getRootTotalHeight(!!node.desc, node) : getNodeTotalHeight(!!node.desc, node);
    const kids = dispChildren(node);
    if (!kids.length || node.collapsed) return h;
    let total = 0;
    kids.forEach((c, i) => { total += calcHeight(c, lvl + 1); if (i > 0) total += GAP_V; });
    return Math.max(h, total);
  }

  function assign(node, lvl, x, yMin, yMax) {
    const h = lvl === 0 ? getRootTotalHeight(!!node.desc, node) : getNodeTotalHeight(!!node.desc, node);
    const lh = lvl === 0 ? getRootTotalHeight(false, node) : getNodeTotalHeight(false, node);
    const w = estimateNodeWidth(node.text, lvl, node);
    const y = (yMin + yMax) / 2 - h / 2;
    positions[node.id] = { x, y, w, h, lh };
    const kids = dispChildren(node);
    if (!kids.length || node.collapsed) return;
    const cX = x + w + GAP_H;
    const cHeights = kids.map(c => calcHeight(c, lvl + 1));
    const totalCH = cHeights.reduce((a, b) => a + b, 0) + (kids.length - 1) * GAP_V;
    let cY = (yMin + yMax) / 2 - totalCH / 2;
    kids.forEach((child, i) => {
      const cBot = cY + cHeights[i];
      assign(child, lvl + 1, cX, cY, cBot);
      cY = cBot + GAP_V;
    });
  }

  const canvas = document.getElementById('mindmap-canvas');
  const ch = canvas.clientHeight || 600;
  const tot = calcHeight(root, 0);
  assign(root, 0, 80, ch / 2 - tot / 2, ch / 2 + tot / 2);
  return positions;
}

// --- VERTICAL layout (top-down tree) ---
function layoutVertical(root) {
  const positions = {};
  const GAP_H = 30, GAP_V = 70;

  function calcWidth(node, lvl) {
    const w = estimateNodeWidth(node.text, lvl, node);
    const kids = dispChildren(node);
    if (!kids.length || node.collapsed) return w;
    let total = 0;
    kids.forEach((c, i) => { total += calcWidth(c, lvl + 1); if (i > 0) total += GAP_H; });
    return Math.max(w, total);
  }

  function assign(node, lvl, y, xMin, xMax) {
    const w = estimateNodeWidth(node.text, lvl, node);
    const h = lvl === 0 ? getRootTotalHeight(!!node.desc, node) : getNodeTotalHeight(!!node.desc, node);
    const lh = lvl === 0 ? getRootTotalHeight(false, node) : getNodeTotalHeight(false, node);
    const x = (xMin + xMax) / 2 - w / 2;
    positions[node.id] = { x, y, w, h, lh };
    const kids = dispChildren(node);
    if (!kids.length || node.collapsed) return;
    const cY = y + h + GAP_V;
    const cWidths = kids.map(c => calcWidth(c, lvl + 1));
    const totalCW = cWidths.reduce((a, b) => a + b, 0) + (kids.length - 1) * GAP_H;
    let cX = (xMin + xMax) / 2 - totalCW / 2;
    kids.forEach((child, i) => {
      const cRight = cX + cWidths[i];
      assign(child, lvl + 1, cY, cX, cRight);
      cX = cRight + GAP_H;
    });
  }

  const canvas = document.getElementById('mindmap-canvas');
  const cw = canvas.clientWidth || 800;
  const tot = calcWidth(root, 0);
  assign(root, 0, 60, cw / 2 - tot / 2, cw / 2 + tot / 2);
  return positions;
}

// --- RADIAL layout ---
function layoutRadial(root) {
  const positions = {};

  function countLeaves(node) {
    const kids = dispChildren(node);
    if (!kids.length || node.collapsed) return 1;
    return kids.reduce((s, c) => s + countLeaves(c), 0);
  }

  const canvas = document.getElementById('mindmap-canvas');
  const cw = canvas.clientWidth || 800;
  const ch = canvas.clientHeight || 600;
  const cx = cw / 2, cy = ch / 2;

  const rootW = estimateNodeWidth(root.text, 0, root);
  const rootH = getRootTotalHeight(!!root.desc, root);
  const rootLH = getRootTotalHeight(false, root);
  positions[root.id] = { x: cx - rootW / 2, y: cy - rootH / 2, w: rootW, h: rootH, lh: rootLH };

  function assignRadial(children, lvl, startAngle, endAngle, radius) {
    if (!children || children.length === 0) return;
    const totalLeaves = children.reduce((s, c) => s + countLeaves(c), 0);
    let angle = startAngle;
    children.forEach(child => {
      const leaves = countLeaves(child);
      const sweep = (endAngle - startAngle) * (leaves / totalLeaves);
      const midAngle = angle + sweep / 2;
      const w = estimateNodeWidth(child.text, lvl, child);
      const h = getNodeTotalHeight(!!child.desc, child);
      const lh = getNodeTotalHeight(false, child);
      const px = cx + radius * Math.cos(midAngle) - w / 2;
      const py = cy + radius * Math.sin(midAngle) - h / 2;
      positions[child.id] = { x: px, y: py, w, h, lh };
      const childKids = dispChildren(child);
      if (childKids.length > 0 && !child.collapsed) {
        assignRadial(childKids, lvl + 1, angle, angle + sweep, radius + 160);
      }
      angle += sweep;
    });
  }

  const rootKids = dispChildren(root);
  if (rootKids.length > 0) {
    assignRadial(rootKids, 1, -Math.PI, Math.PI, 200);
  }

  return positions;
}

function computeLayout(root) {
  switch (mindmapLayout) {
    case 'vertical': return layoutVertical(root);
    case 'radial':   return layoutRadial(root);
    default:         return layoutTree(root);
  }
}

// ===== PAN / ZOOM =====
function resetMindmapPan() {
  mindmapPanX = 0;
  mindmapPanY = 0;
  mindmapZoom = 1;
  applyPanTransform();
}

function applyPanTransform() {
  const pl = document.getElementById('mindmap-pan-layer');
  if (pl) pl.style.transform = `translate(${mindmapPanX}px, ${mindmapPanY}px) scale(${mindmapZoom})`;
}

// ===== RENDER =====
function renderMindmap() {
  if (!mindmapData) return;
  mmHideMentionDropdown(); // always clean up autocomplete on re-render
  resolveLinkedChildren(mindmapData);   // inject live linked children before layout
  const positions = computeLayout(mindmapData);
  _lastMmPositions = positions;          // cache for post-render connection redraw
  const nodesContainer = document.getElementById('mindmap-nodes');
  if (!nodesContainer) return;
  nodesContainer.innerHTML = '';

  // Find bounding box including negative positions
  const PADDING = 60;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  Object.values(positions).forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + p.w > maxX) maxX = p.x + p.w;
    if (p.y + p.h > maxY) maxY = p.y + p.h;
  });

  // Shift all positions so nothing is negative (add padding)
  const offsetX = minX < PADDING ? PADDING - minX : 0;
  const offsetY = minY < PADDING ? PADDING - minY : 0;
  if (offsetX !== 0 || offsetY !== 0) {
    Object.values(positions).forEach(p => {
      p.x += offsetX;
      p.y += offsetY;
    });
    maxX += offsetX;
    maxY += offsetY;
  }

  const svgW = Math.max(maxX + PADDING, 800);
  const svgH = Math.max(maxY + PADDING, 600);

  nodesContainer.style.width = svgW + 'px';
  nodesContainer.style.height = svgH + 'px';

  const svg = document.getElementById('mindmap-svg');
  if (!svg) return;
  svg.setAttribute('width', svgW);
  svg.setAttribute('height', svgH);
  svg.style.width = svgW + 'px';
  svg.style.height = svgH + 'px';
  svg.innerHTML = '';

  const panLayer = document.getElementById('mindmap-pan-layer');
  if (panLayer) {
    panLayer.style.width = svgW + 'px';
    panLayer.style.height = svgH + 'px';
  }

  drawConnections(mindmapData, positions, svg);
  renderNodes(mindmapData, positions, nodesContainer, 0);
  // Schedule a post-render pass to correct line endpoints using actual DOM heights
  // (fixes landscape images whose rendered height differs from the estimated value).
  requestAnimationFrame(redrawConnectionsFromDOM);
}

function drawConnections(node, positions, svg, readonly) {
  const p = positions[node.id];
  if (!p) return;
  if (node.collapsed) return;
  dispChildren(node).forEach(child => {
    const cp = positions[child.id];
    if (!cp) return;

    // lh = label-only height (excludes desc); used for center-y so lines always
    // connect to the visual mid-point of the colored label box, not the total
    // allocated band (which may include a description row below).
    const pLH  = p.lh  ?? p.h;
    const cpLH = cp.lh ?? cp.h;
    let x1, y1, x2, y2, d;
    if (mindmapLayout === 'vertical') {
      x1 = p.x + p.w / 2;   y1 = p.y + pLH;         // bottom of label box
      x2 = cp.x + cp.w / 2; y2 = cp.y;               // top of label box
      const midY = (y1 + y2) / 2;
      d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
    } else if (mindmapLayout === 'radial') {
      x1 = p.x + p.w / 2;   y1 = p.y + pLH / 2;     // center of label box
      x2 = cp.x + cp.w / 2; y2 = cp.y + cpLH / 2;   // center of label box
      const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
      d = `M ${x1} ${y1} Q ${midX} ${y1}, ${x2} ${y2}`;
    } else {
      x1 = p.x + p.w; y1 = p.y + pLH / 2;            // center of label box
      x2 = cp.x;      y2 = cp.y + cpLH / 2;           // center of label box
      const midX = (x1 + x2) / 2;
      d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    // Use dashed style for connections into read-only (linked) subtrees
    const childReadonly = readonly || !!child._readonly;
    if (childReadonly) path.setAttribute('class', 'mm-readonly-path');
    svg.appendChild(path);
    drawConnections(child, positions, svg, childReadonly);
  });
}

let mmClickTimer = null;

function buildDescEl(descText) {
  const descEl = document.createElement('div');
  descEl.className = 'mm-node-desc';
  const span = document.createElement('span');
  span.className = 'mm-desc-text';
  span.textContent = descText;
  descEl.appendChild(span);
  // After append, check if overflow and enable marquee
  requestAnimationFrame(() => {
    if (span.scrollWidth > descEl.clientWidth) {
      descEl.classList.add('marquee');
      // Duplicate text for seamless loop
      const dup = document.createElement('span');
      dup.className = 'mm-desc-text';
      dup.textContent = descText;
      span.textContent = descText + '\u00A0\u00A0\u00A0\u2022\u00A0\u00A0\u00A0';
      // Wrap both in a sliding container
      const wrapper = document.createElement('span');
      wrapper.className = 'mm-desc-text';
      wrapper.textContent = descText + '\u00A0\u00A0\u00A0\u2022\u00A0\u00A0\u00A0' + descText + '\u00A0\u00A0\u00A0\u2022\u00A0\u00A0\u00A0';
      descEl.innerHTML = '';
      descEl.appendChild(wrapper);
    }
  });
  return descEl;
}

function renderNodes(node, positions, container, level, readonly) {
  readonly = readonly || !!node._readonly;
  const p = positions[node.id];
  if (!p) return;

  const el = document.createElement('div');
  el.className = `mm-node ${level === 0 ? 'root' : 'level-' + Math.min(level, 4)}`;
  if (readonly) el.classList.add('mm-node-readonly');
  if (mindmapSelectedId === node.id) el.classList.add('selected');
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  el.dataset.nodeId = node.id;

  // Label area
  const labelEl = document.createElement('div');
  labelEl.className = 'mm-node-label';

  if (!readonly && mindmapEditingId === node.id) {
    // ---- INLINE EDITING ----
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'mm-node-input';
    input.value = node.text;
    input.placeholder = 'Type here...';
    input.style.width = Math.max(80, node.text.length * 9 + 20) + 'px';
    labelEl.appendChild(input);
    el.appendChild(labelEl);

    if (node.desc) el.appendChild(buildDescEl(node.desc));

    container.appendChild(el);
    setTimeout(() => {
      input.focus();
      if (node.text) input.select();
    }, 0);

    let blurHandled = false;
    input.addEventListener('blur', () => {
      if (blurHandled) return;
      // Delay so mousedown on a mention row fires before blur
      setTimeout(() => {
        if (blurHandled) return;
        mmHideMentionDropdown();
        blurHandled = true;
        finishNodeEdit(node.id, input.value);
      }, 120);
    });
    input.addEventListener('keydown', (e) => {
      // When dropdown active, intercept navigation/confirm keys
      if (mmMentionActive) {
        if (e.key === 'ArrowDown')  { e.preventDefault(); e.stopPropagation(); mmMentionMove(1);  return; }
        if (e.key === 'ArrowUp')    { e.preventDefault(); e.stopPropagation(); mmMentionMove(-1); return; }
        if (e.key === 'Enter')      { e.preventDefault(); e.stopPropagation(); blurHandled = true; mmMentionSelect(node.id, input); return; }
        if (e.key === 'Escape')     { e.preventDefault(); e.stopPropagation(); mmHideMentionDropdown(); return; }
        if (e.key === 'Tab')        { mmHideMentionDropdown(); /* fall through */ }
      }
      if (e.key === 'Enter') { e.preventDefault(); blurHandled = true; finishNodeEdit(node.id, input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); blurHandled = true; mindmapEditingId = null; renderMindmap(); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        blurHandled = true;
        finishNodeEdit(node.id, input.value);
        setTimeout(() => addChildNode(), 30);
      }
      e.stopPropagation();
    });
    input.addEventListener('input', () => {
      input.style.width = Math.max(80, input.value.length * 9 + 20) + 'px';
      // @mention detection: look for last '@' in the value
      const val = input.value;
      const atIdx = val.lastIndexOf('@');
      if (atIdx !== -1) {
        mmShowMentionDropdown(input, val.slice(atIdx + 1), node.id);
      } else {
        mmHideMentionDropdown();
      }
    });
    input.addEventListener('keypress', (e) => e.stopPropagation());
  } else {
    // ---- DISPLAY MODE ----
    if (node.image && !node.imageHidden) {
      const imgSize = MM_IMAGE_SIZES[node.imageSize || 'small'];
      labelEl.style.flexDirection = 'column';
      const imgEl = document.createElement('img');
      imgEl.className = 'mm-node-image';
      _mmSetImageSrc(imgEl, node.image);
      imgEl.alt = node.text || 'Node image';
      imgEl.style.maxWidth = imgSize + 'px';
      imgEl.style.maxHeight = imgSize + 'px';
      imgEl.style.width = 'auto';
      imgEl.style.height = 'auto';
      imgEl.style.display = 'block';
      imgEl.draggable = false;
      // Re-draw connections once the image loads so lines point to the actual
      // visual centre (important for landscape / wide images).
      imgEl.addEventListener('load', () => redrawConnectionsFromDOM());
      labelEl.appendChild(imgEl);
      if (node.text) {
        const textSpan = document.createElement('span');
        textSpan.className = 'mm-node-image-label';
        textSpan.textContent = node.text;
        textSpan.style.maxWidth = imgSize + 'px';
        labelEl.appendChild(textSpan);
      }
    } else {
      const textSpan = document.createElement('span');
      textSpan.textContent = node.text || (node.image ? '(image hidden)' : '(empty)');
      if (!node.text) textSpan.style.opacity = '0.4';
      labelEl.appendChild(textSpan);
    }

    // Readonly: lock icon
    if (readonly) {
      const lockIcon = document.createElement('span');
      lockIcon.className = 'mm-readonly-icon';
      lockIcon.title = 'Read-only — click to open linked mindmap';
      lockIcon.innerHTML = '<i class="fas fa-lock"></i>';
      labelEl.appendChild(lockIcon);
    }

    // VocabLink badge + Modify button on linked parent node
    if (!readonly && node.vocabLink) {
      const linkBadge = document.createElement('span');
      linkBadge.className = 'mm-linked-badge';
      linkBadge.title = 'Linked to another vocab\'s mindmap';
      linkBadge.innerHTML = '<i class="fas fa-link"></i>';
      labelEl.appendChild(linkBadge);

      const modifyBtn = document.createElement('button');
      modifyBtn.className = 'mm-modify-btn';
      modifyBtn.title = 'Open linked mindmap to modify';
      modifyBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> Modify';
      modifyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(mmClickTimer);
        const { vocabId, sectionId } = node.vocabLink;
        openMindmapByVocabId(vocabId, sectionId);
      });
      el.appendChild(modifyBtn);
    }

    el.appendChild(labelEl);

    // Collapse badge — uses dispChildren so linked subtrees count correctly
    const kids = dispChildren(node);
    if (kids.length > 0) {
      const collapseBtn = document.createElement('div');
      if (node.collapsed) {
        collapseBtn.className = 'mm-collapse-badge collapsed';
        collapseBtn.textContent = `▶ ${kids.length}`;
        collapseBtn.title = 'Click to expand';
      } else {
        collapseBtn.className = 'mm-collapse-badge expanded';
        collapseBtn.textContent = '▾';
        collapseBtn.title = 'Click to collapse';
      }
      if (!readonly) {
        collapseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          clearTimeout(mmClickTimer);
          mindmapSelectedId = node.id;
          toggleCollapseNode(node.id);
        });
      }
      el.appendChild(collapseBtn);
    }

    // Description below
    if (node.desc) el.appendChild(buildDescEl(node.desc));

    if (readonly) {
      // Readonly: click navigates directly to the linked mindmap
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mmIsPanning) return;
        clearTimeout(mmClickTimer);
        if (node._fromVocabLink) {
          const { vocabId, sectionId } = node._fromVocabLink;
          openMindmapByVocabId(vocabId, sectionId);
        }
      });
    } else {
      // Normal: click → select + side panel
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mmIsPanning) return;
        clearTimeout(mmClickTimer);
        mmClickTimer = setTimeout(() => {
          mindmapSelectedId = node.id;
          mindmapEditingId = null;
          renderMindmap();
          openMindmapSidePanel(node.id);
        }, 200);
      });

      // Double-click → inline rename
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        clearTimeout(mmClickTimer);
        mindmapSelectedId = node.id;
        mindmapEditingId = node.id;
        renderMindmap();
      });

      // Drag-to-reparent
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (node.id === 'root') return; // root cannot be dragged
        mmDragNodeId = node.id;
        mmDragStartPos = { x: e.clientX, y: e.clientY };
        e.stopPropagation(); // prevent canvas pan starting
      });

      // Hover → floating menu
      el.addEventListener('mouseenter', (e) => {
        clearTimeout(mmHoverTimeout);
        mmHoveredNodeId = node.id;
        mmHoverTimeout = setTimeout(() => showHoverMenu(node.id, el), 400);
      });
      el.addEventListener('mouseleave', () => {
        clearTimeout(mmHoverTimeout);
        mmHoverTimeout = setTimeout(() => hideHoverMenu(), 300);
      });
    }
  }

  container.appendChild(el);
  if (!node.collapsed) {
    const kids = dispChildren(node);
    const hasLinked = node._linkedChildren !== null && node._linkedChildren !== undefined;
    kids.forEach(child => renderNodes(child, positions, container, level + 1, hasLinked || readonly));
  }
}

// ===== HOVER MENU =====
function showHoverMenu(nodeId, nodeEl) {
  const menu = document.getElementById('mm-hover-menu');
  const rect = nodeEl.getBoundingClientRect();
  menu.style.left = (rect.left + rect.width / 2 - 50) + 'px';
  menu.style.top = (rect.top - 40) + 'px';
  menu.style.display = 'flex';
  menu.dataset.nodeId = nodeId;
}

function hideHoverMenu() {
  const menu = document.getElementById('mm-hover-menu');
  menu.style.display = 'none';
}

// ===== SIDE PANEL =====
function openMindmapSidePanel(nodeId) {
  if (!mindmapData) return;
  const node = findNode(mindmapData, nodeId);
  if (!node) return;

  mindmapSelectedId = nodeId;
  const panel = document.getElementById('mm-side-panel');
  document.getElementById('mm-side-title').textContent = nodeId === 'root' ? 'Root Node' : 'Node Details';
  document.getElementById('mm-side-name').value = node.text;
  document.getElementById('mm-side-desc').value = node.desc || '';

  // Image display in side panel
  const placeholder = document.getElementById('mm-side-image-placeholder');
  const preview = document.getElementById('mm-side-image-preview');
  const previewImg = document.getElementById('mm-side-image-img');
  const resizeBtns = document.getElementById('mm-image-resize-btns');

  if (node.image) {
    placeholder.style.display = 'none';
    preview.style.display = 'block';
    _mmSetImageSrc(previewImg, node.image);
    resizeBtns.style.display = 'flex';
    // Set active size button (none active if hidden)
    document.querySelectorAll('.mm-resize-btn[data-size]').forEach(btn => {
      btn.classList.toggle('active', !node.imageHidden && btn.dataset.size === (node.imageSize || 'small'));
    });
    const hideBtn = document.getElementById('btn-mm-image-hide');
    if (hideBtn) hideBtn.classList.toggle('active', !!node.imageHidden);
  } else {
    placeholder.style.display = 'flex';
    preview.style.display = 'none';
    resizeBtns.style.display = 'none';
  }

  // Vocab link section
  updateSidePanelVocabSection(node);

  // All mindmaps list
  renderAllMindmapsList();

  panel.style.display = 'flex';
}

function closeMindmapSidePanel() {
  document.getElementById('mm-side-panel').style.display = 'none';
}

function saveSidePanelFields() {
  if (!mindmapData || !mindmapSelectedId) return;
  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node) return;

  const newName = document.getElementById('mm-side-name').value.trim();
  const newDesc = document.getElementById('mm-side-desc').value.trim();
  mmPushUndo('edit node fields');
  if (newName) node.text = newName;
  node.desc = newDesc;
  saveMindmap();
  renderMindmap();
}

async function aiTranslateNode() {
  if (!mindmapData || !mindmapSelectedId) return;
  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node) return;

  const btn = document.getElementById('btn-mm-ai-translate');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Translating...';

  try {
    const resp = await fetch(`${API_BASE}/api/mindmap-translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: node.text, fromLang: getBookConfig().fromLang, toLang: getBookConfig().toLang })
    });
    const data = await resp.json();
    if (data.result) {
      mmPushUndo('AI translate');
      node.desc = data.result;
      document.getElementById('mm-side-desc').value = data.result;
      saveMindmap();
      renderMindmap();
    }
  } catch (err) {
    console.error('AI translate failed:', err);
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-robot"></i> AI Translate';
}

// ===== VOCAB / MINDMAP CROSS-LINKING =====

// Flatten the TOC tree into a flat array of { id, name }
function flattenAllSections(items, result = []) {
  (items || []).forEach(item => {
    result.push({ id: item.id, name: item.name });
    if (item.children) flattenAllSections(item.children, result);
  });
  return result;
}

// Find which section a vocab belongs to
function findVocabSectionId(vocabId) {
  for (const sectionId of Object.keys(appData.vocabs || {})) {
    const vocabs = appData.vocabs[sectionId] || [];
    if (vocabs.find(v => v.id === vocabId)) return sectionId;
  }
  return null;
}

// Get all mindmaps with their associated vocab word and sectionId
function getAllMindmapsData() {
  const result = [];
  const mindmaps = getMindmaps();
  Object.keys(mindmaps).forEach(vocabId => {
    const sectionId = findVocabSectionId(vocabId);
    if (!sectionId) return;
    const vocab = (appData.vocabs[sectionId] || []).find(v => v.id === vocabId);
    if (vocab) result.push({ vocabId, sectionId, word: vocab.word });
  });
  result.sort((a, b) => a.word.localeCompare(b.word));
  return result;
}

// Open a mindmap for any vocab (by vocabId + sectionId)
// If a mindmap is already open, the current one is pushed onto the history stack
function openMindmapByVocabId(vocabId, sectionId) {
  if (mindmapVocabId && mindmapVocabId !== vocabId) {
    mindmapHistory.push({ vocabId: mindmapVocabId, sectionId: currentVocabSectionId });
  }
  currentVocabId = vocabId;
  currentVocabSectionId = sectionId;
  openMindmap(false);
}

// Create a vocab (and sentence) from the currently selected node
function createVocabFromNode() {
  if (!mindmapData || !mindmapSelectedId) return;
  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node) return;

  const word = node.text.trim();
  if (!word) { alert('Node has no text to create a vocab from.'); return; }

  // Determine target sectionId: same as the current mindmap's vocab, fallback to currentSectionId
  const mmSectionId = findVocabSectionId(mindmapVocabId);
  const targetSection = mmSectionId || currentVocabSectionId || currentSectionId;
  if (!targetSection) { alert('No section found to add the vocab to.'); return; }

  // Create sentence
  if (!appData.sentences[targetSection]) appData.sentences[targetSection] = [];
  const sentenceId = uid();
  appData.sentences[targetSection].push({ id: sentenceId, text: word });

  // Create vocab directly
  if (!appData.vocabs[targetSection]) appData.vocabs[targetSection] = [];
  const existing = appData.vocabs[targetSection].find(
    v => v.word.toLowerCase() === word.toLowerCase()
  );
  let newVocabId;
  if (existing) {
    newVocabId = existing.id;
    if (node.desc) {
      if (!existing.definitions) existing.definitions = [];
      existing.definitions.push({ pos: '', vietnamese: node.desc, english: '', example: '' });
    }
  } else {
    newVocabId = uid();
    const definitions = node.desc ? [{ pos: '', vietnamese: node.desc, english: '', example: '' }] : [];
    appData.vocabs[targetSection].push({
      id: newVocabId,
      word: word,
      pronunciation: '',
      definitions,
      aiBrief: '',
      notes: '',
      sentenceId
    });
  }

  // Link node to the new/existing vocab
  node.vocabLink = { vocabId: newVocabId, sectionId: targetSection };
  saveMindmap();
  saveData();

  // Update side panel to reflect the new link
  updateSidePanelVocabSection(node);
}

// Extract the selected node's entire subtree into a new vocab + mindmap.
// The node stays in the parent mindmap as a linked placeholder (vocabLink).
function extractNodeToVocab() {
  if (!mindmapData || !mindmapSelectedId) return;
  if (mindmapSelectedId === 'root') { alert('Cannot extract the root node.'); return; }

  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node) return;

  const word = node.text.trim();
  if (!word) { alert('Node has no text. Please name it first.'); return; }

  const hasChildren = node.children && node.children.length > 0;
  if (!hasChildren && !node.vocabLink) {
    if (!confirm(`"${word}" has no children. Extract it to a new vocab anyway?`)) return;
  }

  if (node.vocabLink) {
    // Already linked — offer to open it instead
    if (confirm(`"${word}" is already linked to a vocab mindmap.\nClick OK to open that mindmap, or Cancel to stay here.`)) {
      const { vocabId, sectionId } = node.vocabLink;
      openMindmapByVocabId(vocabId, sectionId);
    }
    return;
  }

  // Determine section
  const mmSectionId = findVocabSectionId(mindmapVocabId);
  const targetSection = mmSectionId || currentVocabSectionId || currentSectionId;
  if (!targetSection) { alert('No section found to create the vocab in.'); return; }

  // Create the vocab entry
  if (!appData.vocabs[targetSection]) appData.vocabs[targetSection] = [];
  const newVocabId = uid();
  const definitions = node.desc ? [{ pos: '', vietnamese: node.desc, english: '', example: '' }] : [];
  appData.vocabs[targetSection].push({
    id: newVocabId,
    word,
    pronunciation: '',
    definitions,
    aiBrief: '',
    notes: '',
    sentenceId: null
  });

  // Build the new mindmap: root is the node, children are node's current children
  const newMindmapRoot = {
    id: 'root',
    text: word,
    desc: node.desc || '',
    collapsed: false,
    image: node.image || '',
    imageSize: node.imageSize || 'small',
    imageHidden: !!node.imageHidden,
    vocabLink: null,
    children: JSON.parse(JSON.stringify(node.children || []))
  };
  getMindmaps()[newVocabId] = cleanMindmapForSave(newMindmapRoot);

  // Replace node's children with the link; keep the node itself in the parent mindmap
  node.children = [];
  node.vocabLink = { vocabId: newVocabId, sectionId: targetSection };

  saveMindmap();
  saveData();
  updateTabCounts();
  renderMindmap();
  updateSidePanelVocabSection(node);

  // Notify user
  const sections = flattenAllSections(appData.toc);
  const sectionName = (sections.find(s => s.id === targetSection) || {}).name || '';
  alert(`"${word}" has been extracted to a new vocab${sectionName ? ` in "${sectionName}"` : ''}.\nIts subtree is now its own mindmap.\nClick the 🔗 badge or "Modify" to edit it.`);
}

// Update the vocab section of the side panel for a given node
function updateSidePanelVocabSection(node) {
  if (!node) return;
  const statusEl = document.getElementById('mm-side-vocab-status');
  const createBtn = document.getElementById('btn-mm-create-vocab');
  const openBtn = document.getElementById('btn-mm-open-linked-mindmap');
  const extractBtn = document.getElementById('btn-mm-extract-to-vocab');
  if (!statusEl) return;

  const hasChildren = node.children && node.children.length > 0;

  if (node.vocabLink) {
    const { vocabId, sectionId } = node.vocabLink;
    const sections = flattenAllSections(appData.toc);
    const section = sections.find(s => s.id === sectionId);
    const vocab = (appData.vocabs[sectionId] || []).find(v => v.id === vocabId);
    if (vocab) {
      const sectionLabel = section ? ` <span class="mm-vocab-section-name">(${escapeHtml(section.name)})</span>` : '';
      statusEl.innerHTML = `<span class="mm-vocab-link-badge"><i class="fas fa-link"></i> <strong>${escapeHtml(vocab.word)}</strong>${sectionLabel}</span>`;
      createBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Re-link Vocab';
    } else {
      statusEl.innerHTML = '<span class="mm-vocab-link-missing"><i class="fas fa-exclamation-triangle"></i> Linked vocab not found</span>';
      createBtn.innerHTML = '<i class="fas fa-plus"></i> Create Vocab from Node';
      node.vocabLink = null;
    }
    openBtn.style.display = '';
    if (extractBtn) extractBtn.style.display = 'none'; // already extracted
  } else {
    statusEl.innerHTML = '';
    createBtn.innerHTML = '<i class="fas fa-plus"></i> Create Vocab from Node';
    openBtn.style.display = 'none';
    // Show extract button only when there are children to extract
    if (extractBtn) extractBtn.style.display = (hasChildren && node.id !== 'root') ? '' : 'none';
  }
}

// Render all mindmaps list into the mindmap side panel
function renderAllMindmapsList() {
  const allMaps = getAllMindmapsData();
  const listEl = document.getElementById('mm-all-mindmaps-list');
  const countEl = document.getElementById('mm-maps-count');
  if (!listEl) return;

  countEl.textContent = allMaps.length ? `(${allMaps.length})` : '';
  if (allMaps.length === 0) {
    listEl.innerHTML = '<span class="mm-maps-empty">No mindmaps yet</span>';
    return;
  }

  listEl.innerHTML = '';
  allMaps.forEach(({ vocabId, sectionId, word }) => {
    const isCurrent = vocabId === mindmapVocabId;
    const item = document.createElement('div');
    item.className = 'mm-map-item' + (isCurrent ? ' current' : '');
    item.innerHTML = `<i class="fas fa-project-diagram"></i> ${escapeHtml(word)}`;
    if (isCurrent) item.innerHTML += ' <span class="mm-map-current-badge">current</span>';
    if (!isCurrent) {
      item.addEventListener('click', () => openMindmapByVocabId(vocabId, sectionId));
    }
    listEl.appendChild(item);
  });
}

// Find all mindmaps that contain a node linking to the given vocabId
function findMindmapsReferencingVocab(targetVocabId) {
  const result = [];
  const mindmaps = getMindmaps();

  function searchNode(node) {
    if (node.vocabLink && node.vocabLink.vocabId === targetVocabId) return true;
    if (node.children) {
      for (const child of node.children) {
        if (searchNode(child)) return true;
      }
    }
    return false;
  }

  Object.keys(mindmaps).forEach(ownerVocabId => {
    if (ownerVocabId === targetVocabId) return;
    const root = mindmaps[ownerVocabId];
    if (!root || !searchNode(root)) return;
    const sid = findVocabSectionId(ownerVocabId);
    if (!sid) return;
    const vocab = (appData.vocabs[sid] || []).find(v => v.id === ownerVocabId);
    if (vocab) result.push({ vocabId: ownerVocabId, sectionId: sid, word: vocab.word });
  });

  result.sort((a, b) => a.word.localeCompare(b.word));
  return result;
}

/** Render the "Used by" parent-mindmaps bar above the canvas. */
function renderParentMapsBar() {
  const bar = document.getElementById('mm-parent-maps-bar');
  const list = document.getElementById('mm-parent-maps-list');
  if (!bar || !list) return;

  const parents = mindmapVocabId ? findMindmapsReferencingVocab(mindmapVocabId) : [];

  if (!parents.length) {
    bar.style.display = 'none';
    return;
  }

  list.innerHTML = '';
  parents.forEach(({ vocabId, sectionId, word }) => {
    const pill = document.createElement('button');
    pill.className = 'mm-parent-pill';
    pill.title = `Open mindmap: ${word}`;
    pill.innerHTML = `<i class="fas fa-project-diagram"></i> ${escapeHtml(word)}`;
    pill.addEventListener('click', () => openMindmapByVocabId(vocabId, sectionId));
    list.appendChild(pill);
  });

  bar.style.display = 'flex';
}

// Render all mindmaps list into the vocab panel (sentence/word side panel)
function renderVocabPanelMindmapsList() {
  if (!currentVocabId) return;

  // --- Own mindmap ---
  const ownEl = document.getElementById('vocab-panel-own-mindmap');
  if (ownEl) {
    const mindmaps = getMindmaps();
    const hasMindmap = !!mindmaps[currentVocabId];
    ownEl.innerHTML = '';
    if (hasMindmap) {
      const sid = currentVocabSectionId || findVocabSectionId(currentVocabId);
      const item = document.createElement('div');
      item.className = 'mm-map-item';
      item.innerHTML = '<i class="fas fa-project-diagram"></i> Open mindmap';
      item.addEventListener('click', () => openMindmapByVocabId(currentVocabId, sid));
      ownEl.appendChild(item);
    } else {
      ownEl.innerHTML = '<span class="mm-maps-empty">No mindmap yet</span>';
    }
  }

  // --- Referencing mindmaps ---
  const refEl = document.getElementById('vocab-panel-referencing-mindmaps');
  if (refEl) {
    const refs = findMindmapsReferencingVocab(currentVocabId);
    refEl.innerHTML = '';
    if (refs.length === 0) {
      refEl.innerHTML = '<span class="mm-maps-empty">Not referenced by any mindmap</span>';
    } else {
      refs.forEach(({ vocabId, sectionId, word }) => {
        const item = document.createElement('div');
        item.className = 'mm-map-item';
        item.innerHTML = `<i class="fas fa-project-diagram"></i> ${escapeHtml(word)}`;
        item.addEventListener('click', () => openMindmapByVocabId(vocabId, sectionId));
        refEl.appendChild(item);
      });
    }
  }
}

// ===== @MENTION AUTOCOMPLETE =====

function _mmGetMentionEl() {
  if (!_mmMentionEl) {
    _mmMentionEl = document.createElement('div');
    _mmMentionEl.id = 'mm-mention-dropdown';
    _mmMentionEl.className = 'mm-mention-dropdown';
    _mmMentionEl.style.display = 'none';
    document.body.appendChild(_mmMentionEl);
  }
  return _mmMentionEl;
}

function mmHideMentionDropdown() {
  mmMentionActive = false;
  mmMentionItems  = [];
  mmMentionIdx    = 0;
  const el = _mmMentionEl;
  if (el) el.style.display = 'none';
}

function mmMentionSetIdx(idx) {
  mmMentionIdx = idx;
  const el = _mmMentionEl;
  if (!el) return;
  el.querySelectorAll('.mm-mention-item').forEach((row, i) => {
    row.classList.toggle('active', i === idx);
    if (i === idx) row.scrollIntoView({ block: 'nearest' });
  });
}

function mmMentionMove(dir) {
  const n = mmMentionItems.length;
  if (!n) return;
  mmMentionSetIdx((mmMentionIdx + dir + n) % n);
}

function mmShowMentionDropdown(inputEl, query, nodeId) {
  const q = query.toLowerCase();
  const all = getAllMindmapsData();
  mmMentionItems = all
    .filter(m => m.vocabId !== mindmapVocabId && m.word.toLowerCase().includes(q))
    .slice(0, 10);

  if (!mmMentionItems.length) { mmHideMentionDropdown(); return; }

  mmMentionIdx    = 0;
  mmMentionActive = true;

  const dropdown = _mmGetMentionEl();
  dropdown.innerHTML = '';
  mmMentionItems.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'mm-mention-item' + (idx === 0 ? ' active' : '');
    row.dataset.idx = String(idx);
    row.innerHTML = `<i class="fas fa-project-diagram"></i> <strong>${escapeHtml(item.word)}</strong>`;
    row.addEventListener('mousemove', () => mmMentionSetIdx(idx));
    row.addEventListener('mousedown', (e) => {
      e.preventDefault(); // prevent blur
      mmMentionIdx = idx;
      mmMentionSelect(nodeId, inputEl);
    });
    dropdown.appendChild(row);
  });
  const hint = document.createElement('div');
  hint.className = 'mm-mention-hint';
  hint.textContent = '↑↓ navigate  ·  Enter select  ·  Esc cancel';
  dropdown.appendChild(hint);

  const rect = inputEl.getBoundingClientRect();
  dropdown.style.left     = rect.left + 'px';
  dropdown.style.top      = (rect.bottom + 4) + 'px';
  dropdown.style.minWidth = Math.max(180, rect.width) + 'px';
  dropdown.style.display  = 'block';
}

function mmMentionSelect(nodeId, inputEl) {
  const item = mmMentionItems[mmMentionIdx];
  if (!item) { mmHideMentionDropdown(); return; }
  mmHideMentionDropdown();

  // Replace the '@…' portion with the chosen word
  const val    = inputEl.value;
  const atIdx  = val.lastIndexOf('@');
  const newText = atIdx !== -1 ? val.slice(0, atIdx) + item.word : item.word;

  const node = findNode(mindmapData, nodeId);
  if (!node) return;

  mmPushUndo('link to mindmap via @mention');
  node.text     = newText.trim();
  node.vocabLink = { vocabId: item.vocabId, sectionId: item.sectionId };
  mindmapEditingId = null;
  saveMindmap();
  renderMindmap();
  openMindmapSidePanel(nodeId);
}

// ===== NODE EDITING =====
function finishNodeEdit(nodeId, newText) {
  if (!mindmapData) return;
  mmPushUndo('rename node');
  const node = findNode(mindmapData, nodeId);
  if (node) node.text = newText.trim() || node.text;
  mindmapEditingId = null;
  saveMindmap();
  renderMindmap();
  // Update side panel if open for this node
  if (mindmapSelectedId === nodeId) {
    document.getElementById('mm-side-name').value = node ? node.text : '';
  }
}

function addChildNode() {
  if (!mindmapData || !mindmapSelectedId) return;
  const parent = findNode(mindmapData, mindmapSelectedId);
  if (!parent) return;
  if (parent.vocabLink) {
    if (confirm(`"${parent.text}" is linked to another vocab's mindmap.\nClick OK to open that mindmap and add children there.`)) {
      openMindmapByVocabId(parent.vocabLink.vocabId, parent.vocabLink.sectionId);
    }
    return;
  }
  mmPushUndo('add child node');
  const child = createMindmapNode('', parent.id);
  if (!parent.children) parent.children = [];
  parent.children.push(child);
  mindmapSelectedId = child.id;
  mindmapEditingId = child.id;
  saveMindmap();
  renderMindmap();
  openMindmapSidePanel(child.id);
}

function addSiblingNode() {
  if (!mindmapData || !mindmapSelectedId) return;
  if (mindmapSelectedId === 'root') { addChildNode(); return; }
  const parent = findParentNode(mindmapData, mindmapSelectedId);
  if (!parent) return;
  mmPushUndo('add sibling node');
  const sibling = createMindmapNode('', parent.id);
  const idx = parent.children.findIndex(c => c.id === mindmapSelectedId);
  parent.children.splice(idx + 1, 0, sibling);
  mindmapSelectedId = sibling.id;
  mindmapEditingId = sibling.id;
  saveMindmap();
  renderMindmap();
  openMindmapSidePanel(sibling.id);
}

function deleteSelectedNode() {
  if (!mindmapData || !mindmapSelectedId) return;
  if (mindmapSelectedId === 'root') {
    if (confirm('Delete entire mindmap?')) {
      const mindmaps = getMindmaps();
      delete mindmaps[mindmapVocabId];
      saveData();
      closeMindmap();
    }
    return;
  }
  const parent = findParentNode(mindmapData, mindmapSelectedId);
  if (!parent) return;
  const idx = parent.children.findIndex(c => c.id === mindmapSelectedId);
  if (idx !== -1) {
    mmPushUndo('delete node');
    parent.children.splice(idx, 1);
    mindmapSelectedId = parent.id;
    mindmapEditingId = null;
    saveMindmap();
    renderMindmap();
    openMindmapSidePanel(parent.id);
  }
}

function moveNodeUp() {
  if (!mindmapData || !mindmapSelectedId || mindmapSelectedId === 'root') return;
  const parent = findParentNode(mindmapData, mindmapSelectedId);
  if (!parent) return;
  const idx = parent.children.findIndex(c => c.id === mindmapSelectedId);
  if (idx <= 0) return;
  mmPushUndo('move node up');
  // Swap with previous
  [parent.children[idx - 1], parent.children[idx]] = [parent.children[idx], parent.children[idx - 1]];
  saveMindmap();
  renderMindmap();
}

function moveNodeDown() {
  if (!mindmapData || !mindmapSelectedId || mindmapSelectedId === 'root') return;
  const parent = findParentNode(mindmapData, mindmapSelectedId);
  if (!parent) return;
  const idx = parent.children.findIndex(c => c.id === mindmapSelectedId);
  if (idx === -1 || idx >= parent.children.length - 1) return;
  mmPushUndo('move node down');
  // Swap with next
  [parent.children[idx], parent.children[idx + 1]] = [parent.children[idx + 1], parent.children[idx]];
  saveMindmap();
  renderMindmap();
}

function toggleCollapseNode(nodeId) {
  if (!mindmapData) return;
  const id = nodeId || mindmapSelectedId;
  if (!id) return;
  const node = findNode(mindmapData, id);
  if (!node || !dispChildren(node).length) return;
  mmPushUndo(node.collapsed ? 'expand node' : 'collapse node');
  node.collapsed = !node.collapsed;
  saveMindmap();
  renderMindmap();
  // Update toolbar icon
  updateCollapseBtn(node);
}

function reverseChildNodes(nodeId) {
  if (!mindmapData) return;
  const id = nodeId || mindmapSelectedId;
  if (!id) return;
  const node = findNode(mindmapData, id);
  if (!node || !node.children || node.children.length < 2) return;
  mmPushUndo('reverse children');
  node.children.reverse();
  saveMindmap();
  renderMindmap();
}

function updateCollapseBtn(node) {
  const btn = document.getElementById('btn-mindmap-collapse');
  if (!btn) return;
  if (node && node.collapsed) {
    btn.title = 'Expand children (C)';
    btn.innerHTML = '<i class="fas fa-expand-alt"></i>';
  } else {
    btn.title = 'Collapse children (C)';
    btn.innerHTML = '<i class="fas fa-compress-alt"></i>';
  }
}

function clearMindmapSvg() {
  const svg = document.getElementById('mindmap-svg');
  if (svg) svg.innerHTML = '';
}

function navigateMindmap(direction) {
  if (!mindmapData || !mindmapSelectedId) return;
  if (direction === 'down' || direction === 'up') {
    if (mindmapSelectedId === 'root') {
      if (direction === 'down' && mindmapData.children && mindmapData.children.length > 0)
        mindmapSelectedId = mindmapData.children[0].id;
    } else {
      const parent = findParentNode(mindmapData, mindmapSelectedId);
      if (parent) {
        const idx = parent.children.findIndex(c => c.id === mindmapSelectedId);
        if (direction === 'down' && idx < parent.children.length - 1)
          mindmapSelectedId = parent.children[idx + 1].id;
        else if (direction === 'up' && idx > 0)
          mindmapSelectedId = parent.children[idx - 1].id;
      }
    }
  } else if (direction === 'right') {
    const node = findNode(mindmapData, mindmapSelectedId);
    if (node && node.children && node.children.length > 0)
      mindmapSelectedId = node.children[0].id;
  } else if (direction === 'left') {
    if (mindmapSelectedId !== 'root') {
      const parent = findParentNode(mindmapData, mindmapSelectedId);
      if (parent) mindmapSelectedId = parent.id;
    }
  }
  mindmapEditingId = null;
  renderMindmap();
  openMindmapSidePanel(mindmapSelectedId);
}

// ===== IMAGE PASTE & UPLOAD =====
async function pasteImageFromClipboard() {
  if (!mindmapData || !mindmapSelectedId) return;

  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const clipItem of clipboardItems) {
      for (const type of clipItem.types) {
        if (type.startsWith('image/')) {
          const blob = await clipItem.getType(type);
          await uploadMindmapImage(blob);
          return;
        }
      }
    }
    alert('No image found in clipboard. Copy an image first then click the button.');
  } catch (err) {
    console.error('Clipboard read failed:', err);
    alert('Could not read clipboard. Make sure you have copied an image and allowed clipboard access.');
  }
}

async function uploadMindmapImage(blob) {
  if (!mindmapData || !mindmapSelectedId || !mindmapVocabId) return;

  const formData = new FormData();
  formData.append('image', blob);
  formData.append('nodeId', mindmapSelectedId);
  formData.append('vocabId', mindmapVocabId);

  try {
    const resp = await fetch(`${API_BASE}/api/images/upload`, {
      method: 'POST',
      body: formData
    });
    const data = await resp.json();
    if (data.success && data.filename) {
      const node = findNode(mindmapData, mindmapSelectedId);
      if (node) {
        mmPushUndo('add image');
        node.image = data.filename;
        if (!node.imageSize) node.imageSize = 'small';
        saveMindmap();
        renderMindmap();
        openMindmapSidePanel(mindmapSelectedId);
      }
    }
  } catch (err) {
    console.error('Image upload failed:', err);
  }
}

async function deleteMindmapImage() {
  if (!mindmapData || !mindmapSelectedId) return;
  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node || !node.image) return;

  if (!confirm('Delete this image?')) return;

  const deletingFilename = node.image;
  mmPushUndo('delete image');
  try {
    await fetch(`${API_BASE}/api/images/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: deletingFilename })
    });
  } catch (err) {
    console.error('Image delete request failed:', err);
  }

  _mmEvictImage(deletingFilename); // free ObjectURL from cache
  node.image = '';
  saveMindmap();
  renderMindmap();
  openMindmapSidePanel(mindmapSelectedId);
}

function setMindmapImageSize(size) {
  if (!mindmapData || !mindmapSelectedId) return;
  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node) return;
  mmPushUndo('change image size');
  node.imageSize = size;
  node.imageHidden = false;
  saveMindmap();
  renderMindmap();
  // Update resize button state
  document.querySelectorAll('.mm-resize-btn[data-size]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.size === size);
  });
  const hideBtn = document.getElementById('btn-mm-image-hide');
  if (hideBtn) hideBtn.classList.remove('active');
}

function toggleHideNodeImage() {
  if (!mindmapData || !mindmapSelectedId) return;
  const node = findNode(mindmapData, mindmapSelectedId);
  if (!node || !node.image) return;
  mmPushUndo(node.imageHidden ? 'show node image' : 'hide node image');
  node.imageHidden = !node.imageHidden;
  saveMindmap();
  renderMindmap();
  // Update button states
  document.querySelectorAll('.mm-resize-btn[data-size]').forEach(btn => {
    btn.classList.toggle('active', !node.imageHidden && btn.dataset.size === node.imageSize);
  });
  const hideBtn = document.getElementById('btn-mm-image-hide');
  if (hideBtn) hideBtn.classList.toggle('active', !!node.imageHidden);
}

// ===== INIT MINDMAP EVENTS =====
function initMindmapEvents() {
  // Close
  document.getElementById('btn-mindmap-close').addEventListener('click', closeMindmap);
  document.getElementById('btn-mm-back').addEventListener('click', goBackMindmap);

  // Toolbar
  document.getElementById('btn-mindmap-add-child').addEventListener('click', addChildNode);
  document.getElementById('btn-mindmap-add-sibling').addEventListener('click', addSiblingNode);
  document.getElementById('btn-mindmap-move-up').addEventListener('click', moveNodeUp);
  document.getElementById('btn-mindmap-move-down').addEventListener('click', moveNodeDown);
  document.getElementById('btn-mindmap-collapse').addEventListener('click', () => toggleCollapseNode());
  document.getElementById('btn-mindmap-reverse').addEventListener('click', () => reverseChildNodes());
  document.getElementById('btn-mindmap-delete-node').addEventListener('click', deleteSelectedNode);
  document.getElementById('btn-mindmap-undo').addEventListener('click', mmUndo);
  document.getElementById('btn-mindmap-redo').addEventListener('click', mmRedo);

  // Open from vocab panel
  document.getElementById('btn-vocab-mindmap').addEventListener('click', openMindmap);

  // Layout switcher
  document.querySelectorAll('.mm-layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mindmapLayout = btn.dataset.layout;
      document.querySelectorAll('.mm-layout-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (mindmapVocabId) setMindmapLayout(mindmapVocabId, mindmapLayout);
      resetMindmapPan();
      renderMindmap();
    });
  });

  // Side panel
  document.getElementById('btn-mm-side-close').addEventListener('click', closeMindmapSidePanel);
  document.getElementById('btn-mm-side-save').addEventListener('click', saveSidePanelFields);
  document.getElementById('btn-mm-ai-translate').addEventListener('click', aiTranslateNode);

  // Image paste button
  document.getElementById('btn-mm-paste-image').addEventListener('click', pasteImageFromClipboard);
  document.getElementById('btn-mm-paste-image-replace').addEventListener('click', pasteImageFromClipboard);

  // Image delete button
  document.getElementById('btn-mm-image-delete').addEventListener('click', deleteMindmapImage);

  // Vocab / mindmap cross-link buttons
  document.getElementById('btn-mm-create-vocab').addEventListener('click', createVocabFromNode);
  document.getElementById('btn-mm-open-linked-mindmap').addEventListener('click', () => {
    if (!mindmapData || !mindmapSelectedId) return;
    const node = findNode(mindmapData, mindmapSelectedId);
    if (!node || !node.vocabLink) return;
    openMindmapByVocabId(node.vocabLink.vocabId, node.vocabLink.sectionId);
  });
  document.getElementById('btn-mm-extract-to-vocab').addEventListener('click', extractNodeToVocab);

  // Image resize buttons
  document.querySelectorAll('.mm-resize-btn[data-size]').forEach(btn => {
    btn.addEventListener('click', () => setMindmapImageSize(btn.dataset.size));
  });
  document.getElementById('btn-mm-image-hide').addEventListener('click', toggleHideNodeImage);

  // --- Canvas panning with left mouse ---
  const canvas = document.getElementById('mindmap-canvas');

  canvas.addEventListener('mousedown', (e) => {
    // Only pan when clicking on background (not on nodes)
    if (e.target.closest('.mm-node')) return;
    if (e.button !== 0) return;
    mmIsPanning = true;
    mmPanStart = { x: e.clientX, y: e.clientY, px: mindmapPanX, py: mindmapPanY };
    canvas.classList.add('panning');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    // --- Canvas panning ---
    if (mmIsPanning) {
      mindmapPanX = mmPanStart.px + (e.clientX - mmPanStart.x);
      mindmapPanY = mmPanStart.py + (e.clientY - mmPanStart.y);
      applyPanTransform();
      return;
    }

    // --- Node drag ---
    if (!mmDragNodeId) return;
    const dx = e.clientX - mmDragStartPos.x;
    const dy = e.clientY - mmDragStartPos.y;
    if (!mmIsDragging) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // Threshold crossed — start drag
      mmIsDragging = true;
      clearTimeout(mmHoverTimeout);
      hideHoverMenu();
      // Mark source node
      const sourceEl = document.querySelector(`.mm-node[data-node-id="${mmDragNodeId}"]`);
      if (sourceEl) sourceEl.classList.add('mm-node-drag-source');
      // Create ghost
      const txt = (mindmapData && findNode(mindmapData, mmDragNodeId));
      mmDragGhost = document.createElement('div');
      mmDragGhost.className = 'mm-drag-ghost';
      mmDragGhost.textContent = txt ? (txt.text || '(empty)') : '';
      mmDragGhost.style.pointerEvents = 'none';
      document.body.appendChild(mmDragGhost);
    }

    // Move ghost
    if (mmDragGhost) {
      mmDragGhost.style.left = (e.clientX + 14) + 'px';
      mmDragGhost.style.top = (e.clientY + 6) + 'px';
    }

    // Detect drop target via elementFromPoint (ghost has pointerEvents:none)
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const targetNode = target ? target.closest('.mm-node') : null;
    const hoverId = targetNode ? targetNode.dataset.nodeId : null;

    // Update drag-over highlights
    document.querySelectorAll('.mm-node-drag-over').forEach(el => el.classList.remove('mm-node-drag-over'));
    if (hoverId && hoverId !== mmDragNodeId && mindmapData) {
      const dragNodeObj = findNode(mindmapData, mmDragNodeId);
      const dropNodeObj = findNode(mindmapData, hoverId);
      const valid = dragNodeObj && dropNodeObj
        && !dropNodeObj._readonly
        && !dropNodeObj.vocabLink
        && !isDescendant(dragNodeObj, hoverId);
      if (valid) {
        targetNode.classList.add('mm-node-drag-over');
        mmDragOverNodeId = hoverId;
      } else {
        mmDragOverNodeId = null;
      }
    } else {
      mmDragOverNodeId = null;
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (mmIsPanning) {
      setTimeout(() => { mmIsPanning = false; }, 50);
      canvas.classList.remove('panning');
    }
    if (mmIsDragging) {
      executeMindmapDrop();
      mmIsDragging = false;
      mmDragNodeId = null;
      mmDragOverNodeId = null;
    } else {
      // mousedown was set but threshold not crossed — clear cleanly
      mmDragNodeId = null;
    }
  });

  // Canvas click to deselect
  canvas.addEventListener('click', (e) => {
    if (e.target.closest('.mm-node')) return;
    if (mmIsPanning) return;
    mindmapSelectedId = null;
    mindmapEditingId = null;
    renderMindmap();
    closeMindmapSidePanel();
  });

  // Mouse wheel zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(3, Math.max(0.2, mindmapZoom * delta));
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    mindmapPanX = cx - (cx - mindmapPanX) * (newZoom / mindmapZoom);
    mindmapPanY = cy - (cy - mindmapPanY) * (newZoom / mindmapZoom);
    mindmapZoom = newZoom;
    applyPanTransform();
  }, { passive: false });

  // Close overlay on backdrop — REMOVED (use X button only)

  // Hover menu interactions
  const hoverMenu = document.getElementById('mm-hover-menu');
  hoverMenu.addEventListener('mouseenter', () => clearTimeout(mmHoverTimeout));
  hoverMenu.addEventListener('mouseleave', () => { mmHoverTimeout = setTimeout(() => hideHoverMenu(), 200); });

  hoverMenu.querySelectorAll('.mm-hover-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const nodeId = hoverMenu.dataset.nodeId;
      hideHoverMenu();
      if (!nodeId || !mindmapData) return;

      if (action === 'rename') {
        mindmapSelectedId = nodeId;
        mindmapEditingId = nodeId;
        renderMindmap();
      } else if (action === 'add-desc') {
        mindmapSelectedId = nodeId;
        renderMindmap();
        openMindmapSidePanel(nodeId);
        // Focus description textarea
        setTimeout(() => document.getElementById('mm-side-desc').focus(), 100);
      } else if (action === 'ai-desc') {
        mindmapSelectedId = nodeId;
        renderMindmap();
        openMindmapSidePanel(nodeId);
        setTimeout(() => aiTranslateNode(), 100);
      } else if (action === 'collapse') {
        mindmapSelectedId = nodeId;
        toggleCollapseNode(nodeId);
      } else if (action === 'reverse') {
        mindmapSelectedId = nodeId;
        reverseChildNodes(nodeId);
      } else if (action === 'extract') {
        mindmapSelectedId = nodeId;
        extractNodeToVocab();
      }
    });
  });

  // Keyboard shortcuts for mindmap
  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('mindmap-overlay');
    if (overlay.style.display === 'none' || !overlay.style.display) return;
    if (mindmapEditingId) return;
    // Don't capture when typing in side panel inputs
    if (e.target.closest('.mm-side-panel')) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      // If side panel open, close it first
      if (document.getElementById('mm-side-panel').style.display !== 'none') {
        closeMindmapSidePanel();
        return;
      }
      closeMindmap();
      return;
    }

    if (!mindmapData) return;

    // Undo / Redo shortcuts
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault(); e.stopPropagation(); mmUndo(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault(); e.stopPropagation(); mmRedo(); return;
    }

    switch (e.key) {
      case 'Tab':
        e.preventDefault(); addChildNode(); break;
      case ' ':
        e.preventDefault(); addSiblingNode(); break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault(); deleteSelectedNode(); break;
      case 'F2':
        e.preventDefault();
        if (mindmapSelectedId) { mindmapEditingId = mindmapSelectedId; renderMindmap(); }
        break;
      case 'Enter':
        e.preventDefault();
        if (mindmapSelectedId) { mindmapEditingId = mindmapSelectedId; renderMindmap(); }
        break;
      case 'ArrowUp':    e.preventDefault(); navigateMindmap('up'); break;
      case 'ArrowDown':  e.preventDefault(); navigateMindmap('down'); break;
      case 'ArrowRight': e.preventDefault(); navigateMindmap('right'); break;
      case 'ArrowLeft':  e.preventDefault(); navigateMindmap('left'); break;
      case 'c':
      case 'C':
        e.preventDefault(); toggleCollapseNode(); break;
    }
  });
}

// ===== PUBLIC JAVASCRIPT API =====
// Access via: window.mindmapAPI.undo()  /  window.mindmapAPI.redo()  etc.
window.mindmapAPI = {
  /** Undo the last mindmap change. */
  undo:                mmUndo,
  /** Redo the last undone change. */
  redo:                mmRedo,
  /** Returns true when there is at least one step to undo. */
  canUndo:             () => mmUndoStack.length > 0,
  /** Returns true when there is at least one step to redo. */
  canRedo:             () => mmRedoStack.length > 0,
  /** Returns the description labels of all undo steps (oldest → newest). */
  getUndoDescriptions: () => mmUndoStack.map(s => s.description),
  /** Returns the description labels of all redo steps (oldest → newest). */
  getRedoDescriptions: () => mmRedoStack.map(s => s.description),
  /** Clear both undo and redo history. */
  clearHistory:        () => { mmUndoStack = []; mmRedoStack = []; updateUndoRedoBtns(); },
  /**
   * Save a named server-side checkpoint for cross-session recovery.
   * @param {string} label  Human-readable name (e.g. "before big refactor").
   * @returns {Promise<{id, vocabId, label, createdAt}>}
   */
  saveCheckpoint: async (label = 'manual checkpoint') => {
    if (!mindmapData || !mindmapVocabId) throw new Error('No mindmap open');
    const resp = await fetch(`${API_BASE}/api/mindmap/checkpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vocabId: mindmapVocabId, label, data: cleanMindmapForSave(mindmapData) }),
    });
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    return resp.json();
  },
  /**
   * List all server-side checkpoints for the current mindmap.
   * @returns {Promise<Array<{id, vocabId, label, createdAt}>>}
   */
  listCheckpoints: async () => {
    if (!mindmapVocabId) return [];
    const resp = await fetch(`${API_BASE}/api/mindmap/checkpoints/${encodeURIComponent(mindmapVocabId)}`);
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const json = await resp.json();
    return json.checkpoints || [];
  },
  /**
   * Restore the mindmap from a server-side checkpoint.
   * @param {string} checkpointId  The id returned by saveCheckpoint / listCheckpoints.
   */
  restoreCheckpoint: async (checkpointId) => {
    if (!mindmapVocabId) throw new Error('No mindmap open');
    const resp = await fetch(`${API_BASE}/api/mindmap/checkpoint/${encodeURIComponent(mindmapVocabId)}/${encodeURIComponent(checkpointId)}`);
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const cp = await resp.json();
    mmPushUndo('restore checkpoint');
    mindmapData = cp.data;
    rebuildParentRefs(mindmapData, null);
    getMindmaps()[mindmapVocabId] = cleanMindmapForSave(mindmapData);
    saveMindmap();
    renderMindmap();
    updateUndoRedoBtns();
  },
  /**
   * Query the server for undo status (acknowledgement only – undo state lives
   * on the client, but this is useful for debugging / monitoring).
   */
  reportUndoStatus: () => {
    const params = new URLSearchParams({
      vocabId:   mindmapVocabId || '',
      canUndo:   String(mmUndoStack.length > 0),
      canRedo:   String(mmRedoStack.length > 0),
      undoCount: mmUndoStack.length,
      redoCount: mmRedoStack.length,
    });
    return fetch(`${API_BASE}/api/mindmap/undo/status?${params}`).then(r => r.json());
  },
};

document.addEventListener('DOMContentLoaded', init);

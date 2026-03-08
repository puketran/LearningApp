// ===== TOC RENDERING =====
function renderTOC() {
  const tree = document.getElementById('toc-tree');
  tree.innerHTML = '';
  appData.toc.forEach(item => {
    tree.appendChild(createTocNode(item));
  });
}

function createTocNode(item) {
  const el = document.createElement('div');
  el.className = 'toc-item';
  el.dataset.id = item.id;

  const hasChildren = item.children && item.children.length > 0;
  const sentenceCount = (appData.sentences[item.id] || []).length;
  const vocabCount = (appData.vocabs[item.id] || []).length;

  const row = document.createElement('div');
  row.className = 'toc-item-row' + (currentSectionId === item.id ? ' active' : '');

  row.innerHTML = `
    <span class="toggle-icon ${hasChildren ? '' : 'invisible'}" style="${hasChildren ? '' : 'visibility:hidden'}">
      <i class="fas fa-chevron-right"></i>
    </span>
    <span class="item-icon"><i class="fas ${hasChildren ? 'fa-folder' : 'fa-file-alt'}"></i></span>
    <span class="item-name">${escapeHtml(item.name)}</span>
    ${sentenceCount > 0 ? `<span class="item-count">${sentenceCount}</span>` : ''}
  `;

  // Click to select section
  row.addEventListener('click', (e) => {
    if (e.target.closest('.toggle-icon')) {
      toggleTocExpand(el);
      return;
    }
    selectSection(item.id, item.name);
  });

  // Right-click context menu
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showTocContextMenu(e, item.id);
  });

  el.appendChild(row);

  if (hasChildren) {
    const childContainer = document.createElement('div');
    childContainer.className = 'toc-children' + (isTocExpanded(item.id) ? ' expanded' : '');
    item.children.forEach(child => {
      childContainer.appendChild(createTocNode(child));
    });
    el.appendChild(childContainer);
  }

  return el;
}

// Track expanded state
let expandedSections = new Set(JSON.parse(localStorage.getItem('expanded-sections') || '[]'));

function isTocExpanded(id) {
  return expandedSections.has(id);
}

function toggleTocExpand(el) {
  const id = el.dataset.id;
  const children = el.querySelector('.toc-children');
  const toggleIcon = el.querySelector('.toggle-icon');
  if (!children) return;

  if (expandedSections.has(id)) {
    expandedSections.delete(id);
    children.classList.remove('expanded');
    toggleIcon.classList.remove('expanded');
  } else {
    expandedSections.add(id);
    children.classList.add('expanded');
    toggleIcon.classList.add('expanded');
  }
  localStorage.setItem('expanded-sections', JSON.stringify([...expandedSections]));
}

// ===== TOC OPERATIONS =====
function findTocItem(id, items = appData.toc) {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findTocItem(id, item.children);
      if (found) return found;
    }
  }
  return null;
}

function findTocParent(id, items = appData.toc, parent = null) {
  for (const item of items) {
    if (item.id === id) return { parent, list: items };
    if (item.children) {
      const found = findTocParent(id, item.children, item);
      if (found) return found;
    }
  }
  return null;
}

function addChapter() {
  showTocModal('Add Chapter', '', (name) => {
    const newItem = { id: uid(), name, children: [] };
    appData.toc.push(newItem);
    saveData();
    renderTOC();
  });
}

function addSubSection(parentId) {
  showTocModal('Add Sub-section', '', (name) => {
    const parent = findTocItem(parentId);
    if (!parent) return;
    if (!parent.children) parent.children = [];
    parent.children.push({ id: uid(), name, children: [] });
    expandedSections.add(parentId);
    localStorage.setItem('expanded-sections', JSON.stringify([...expandedSections]));
    saveData();
    renderTOC();
  });
}

function renameSection(id) {
  const item = findTocItem(id);
  if (!item) return;
  showTocModal('Rename', item.name, (name) => {
    item.name = name;
    saveData();
    renderTOC();
    if (currentSectionId === id) {
      document.getElementById('section-title').textContent = name;
    }
  });
}

function deleteSection(id) {
  if (!confirm('Delete this section and all its contents?')) return;

  // Collect all descendant IDs
  const idsToDelete = [];
  function collectIds(item) {
    idsToDelete.push(item.id);
    if (item.children) item.children.forEach(collectIds);
  }
  const item = findTocItem(id);
  if (item) collectIds(item);

  // Remove data
  idsToDelete.forEach(did => {
    delete appData.sentences[did];
    delete appData.vocabs[did];
  });

  // Remove from tree
  const info = findTocParent(id);
  if (info) {
    const idx = info.list.findIndex(i => i.id === id);
    if (idx !== -1) info.list.splice(idx, 1);
  }

  saveData();
  renderTOC();

  if (idsToDelete.includes(currentSectionId)) {
    currentSectionId = null;
    showWelcome();
  }
}


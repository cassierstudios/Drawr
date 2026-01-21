(() => {
  if (window.__screenDrawInitialized) {
    window.__screenDrawToggle?.();
    return;
  }
  window.__screenDrawInitialized = true;

  const state = {
    active: true,
    tool: 'pen',
    color: '#a855f7',
    size: 4,
    drawing: false,
    history: [],
    collapsed: false
  };

  const colors = [
    ['#ef4444', '#f97316'],
    ['#eab308', '#22c55e'],
    ['#06b6d4', '#6366f1'],
    ['#a855f7', '#ec4899'],
    ['#ffffff', '#000000']
  ];

  // Load Inter font and Material Icons
  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);

  // Create overlay canvas - fixed to viewport
  const overlay = document.createElement('canvas');
  overlay.className = 'sd-overlay active';
  overlay.width = window.innerWidth;
  overlay.height = window.innerHeight;
  document.body.appendChild(overlay);

  // Store drawings in page coordinates, render to viewport
  let strokes = []; // Array of {points, color, size, alpha} or {type:'text', x, y, text, color, size}
  let currentStroke = null;

  const ctx = overlay.getContext('2d', { willReadFrequently: false });
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Offscreen canvas for preview drawing (avoids expensive getImageData)
  let offscreenCanvas = null;
  let offscreenCtx = null;

  function ensureOffscreenCanvas() {
    if (!offscreenCanvas || offscreenCanvas.width !== overlay.width || offscreenCanvas.height !== overlay.height) {
      offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = overlay.width;
      offscreenCanvas.height = overlay.height;
      offscreenCtx = offscreenCanvas.getContext('2d');
      offscreenCtx.lineCap = 'round';
      offscreenCtx.lineJoin = 'round';
    }
  }

  // Throttle helper for high-frequency events
  function throttle(fn, ms) {
    let lastCall = 0;
    let scheduled = null;
    return function(...args) {
      const now = performance.now();
      if (now - lastCall >= ms) {
        lastCall = now;
        fn.apply(this, args);
      } else if (!scheduled) {
        scheduled = requestAnimationFrame(() => {
          scheduled = null;
          lastCall = performance.now();
          fn.apply(this, args);
        });
      }
    };
  }

  // Debounce helper for resize/scroll
  function debounce(fn, ms) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // Get page coordinates (for storing strokes)
  function getPageCoords(e) {
    return {
      x: e.clientX + window.scrollX,
      y: e.clientY + window.scrollY
    };
  }

  // Render all strokes offset by current scroll position
  function renderStrokes() {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const offsetX = window.scrollX;
    const offsetY = window.scrollY;
    
    for (const stroke of strokes) {
      if (stroke.type === 'text') {
        drawText(stroke, offsetX, offsetY);
      } else if (stroke.points.length >= 2) {
        drawStroke(stroke, offsetX, offsetY);
      }
    }
    
    // Draw current stroke being drawn
    if (currentStroke && currentStroke.points && currentStroke.points.length >= 2) {
      drawStroke(currentStroke, offsetX, offsetY);
    }
  }

  function drawText(textObj, offsetX, offsetY) {
    ctx.font = `${textObj.size * 4}px Inter, sans-serif`;
    ctx.fillStyle = textObj.color;
    ctx.globalAlpha = 1;
    ctx.fillText(textObj.text, textObj.x - offsetX, textObj.y - offsetY);
  }

  function drawStroke(stroke, offsetX, offsetY) {
    const pts = stroke.points;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.globalAlpha = stroke.alpha;
    ctx.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over';
    
    ctx.beginPath();
    ctx.moveTo(pts[0].x - offsetX, pts[0].y - offsetY);
    
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x - offsetX, pts[1].y - offsetY);
    } else {
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        
        const cp1x = p1.x + (p2.x - p0.x) / 10 - offsetX;
        const cp1y = p1.y + (p2.y - p0.y) / 10 - offsetY;
        const cp2x = p2.x - (p3.x - p1.x) / 10 - offsetX;
        const cp2y = p2.y - (p3.y - p1.y) / 10 - offsetY;
        
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x - offsetX, p2.y - offsetY);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Create sidebar
  const sidebar = document.createElement('div');
  sidebar.className = 'sd-sidebar';
  sidebar.innerHTML = `
    <button class="sd-toggle-tab" title="Toggle sidebar (Alt+H)">
      <span class="material-symbols-rounded">chevron_right</span>
    </button>
    <div class="sd-content">
      <div class="sd-section">
        <span class="sd-label">Tools</span>
        <button class="sd-tool-btn" data-tool="pointer" title="Pointer (1)">
          <span class="material-symbols-rounded">arrow_selector_tool</span>
        </button>
        <button class="sd-tool-btn active" data-tool="pen" title="Pen (2)">
          <span class="material-symbols-rounded">edit</span>
        </button>
        <button class="sd-tool-btn" data-tool="highlighter" title="Highlighter (3)">
          <span class="material-symbols-rounded">ink_highlighter</span>
        </button>
        <button class="sd-tool-btn" data-tool="text" title="Text (5)">
          <span class="material-symbols-rounded">title</span>
        </button>
        <button class="sd-tool-btn" data-tool="eraser" title="Eraser (4)">
          <span class="material-symbols-rounded">ink_eraser</span>
        </button>
      </div>
      <div class="sd-section">
        <span class="sd-label">Color</span>
        <div class="sd-colors"></div>
      </div>
      <div class="sd-section">
        <span class="sd-label">Size</span>
        <div class="sd-size-container">
          <input type="range" class="sd-size-slider" min="1" max="50" value="4">
          <span class="sd-size-value">4px</span>
        </div>
      </div>
      <div class="sd-section">
        <span class="sd-label">Actions</span>
        <button class="sd-action-btn" data-action="undo" title="Undo (Alt+Z)">
          <span class="material-symbols-rounded">undo</span>
        </button>
        <button class="sd-action-btn danger" data-action="clear" title="Clear (Alt+D)">
          <span class="material-symbols-rounded">delete</span>
        </button>
        <button class="sd-action-btn sd-info-btn" data-action="info" title="Help">
          <span class="material-symbols-rounded">help</span>
        </button>
      </div>
    </div>
    <div class="sd-info-popup">
      <div class="sd-info-header">
        <span>Keyboard Shortcuts</span>
        <button class="sd-info-close"><span class="material-symbols-rounded">close</span></button>
      </div>
      <div class="sd-info-content">
        <div class="sd-shortcut"><span class="sd-key">1</span> Pointer mode</div>
        <div class="sd-shortcut"><span class="sd-key">2</span> Pen tool</div>
        <div class="sd-shortcut"><span class="sd-key">3</span> Highlighter</div>
        <div class="sd-shortcut"><span class="sd-key">4</span> Eraser</div>
        <div class="sd-shortcut"><span class="sd-key">5</span> Text tool</div>
        <div class="sd-shortcut"><span class="sd-key">Z</span> Undo</div>
        <div class="sd-shortcut"><span class="sd-key">D</span> Clear all</div>
        <div class="sd-shortcut"><span class="sd-key">H</span> Toggle sidebar</div>
      </div>
      <div class="sd-info-footer">
        Screen Draw v1.0
      </div>
    </div>
  `;
  document.body.appendChild(sidebar);

  // Populate colors
  const colorsContainer = sidebar.querySelector('.sd-colors');
  colors.forEach(row => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'sd-color-row';
    row.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'sd-color-btn' + (c === state.color ? ' active' : '');
      btn.style.background = c;
      // Add border for white color
      if (c === '#ffffff') {
        btn.style.border = '1px solid rgba(0, 0, 0, 0.15)';
      }
      btn.dataset.color = c;
      rowDiv.appendChild(btn);
    });
    colorsContainer.appendChild(rowDiv);
  });

  // Add custom color picker
  const pickerRow = document.createElement('div');
  pickerRow.className = 'sd-color-row';
  const pickerWrapper = document.createElement('div');
  pickerWrapper.className = 'sd-color-picker-wrapper';
  pickerWrapper.style.cursor = 'pointer';
  
  const pickerIcon = document.createElement('div');
  pickerIcon.className = 'sd-picker-icon';
  
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.className = 'sd-color-picker';
  picker.value = state.color;
  picker.title = 'Pick custom color';
  
  pickerWrapper.appendChild(pickerIcon);
  pickerWrapper.appendChild(picker);
  pickerRow.appendChild(pickerWrapper);
  colorsContainer.appendChild(pickerRow);

  picker.addEventListener('input', (e) => {
    setColor(e.target.value);
    // Deselect preset colors when using picker
    colorsContainer.querySelectorAll('.sd-color-btn').forEach(b => b.classList.remove('active'));
  });

  // Event handlers
  const toggleTab = sidebar.querySelector('.sd-toggle-tab');
  const sizeSlider = sidebar.querySelector('.sd-size-slider');
  const sizeValue = sidebar.querySelector('.sd-size-value');

  toggleTab.addEventListener('click', toggleCollapse);

  sidebar.querySelectorAll('.sd-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  colorsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('sd-color-btn')) {
      setColor(e.target.dataset.color);
    }
  });

  sizeSlider.addEventListener('input', (e) => {
    state.size = parseInt(e.target.value);
    sizeValue.textContent = state.size + 'px';
  });

  sidebar.querySelectorAll('.sd-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'undo') undo();
      else if (btn.dataset.action === 'clear') clearCanvas();
      else if (btn.dataset.action === 'info') toggleInfo();
    });
  });

  // Info popup
  const infoPopup = sidebar.querySelector('.sd-info-popup');
  const infoClose = sidebar.querySelector('.sd-info-close');
  
  function toggleInfo() {
    infoPopup.classList.toggle('visible');
  }
  
  infoClose.addEventListener('click', () => {
    infoPopup.classList.remove('visible');
  });

  // Text input element
  let textInput = null;

  function createTextInput(x, y, pageX, pageY) {
    if (textInput) {
      textInput.remove();
      textInput = null;
    }
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sd-text-input';
    input.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y - state.size * 2}px;
      font-size: ${state.size * 4}px;
      color: ${state.color};
      background: rgba(255,255,255,0.9);
      border: 2px solid ${state.color};
      outline: none;
      padding: 4px 8px;
      font-family: Inter, sans-serif;
      z-index: 2147483648;
      min-width: 100px;
      border-radius: 4px;
    `;
    document.body.appendChild(input);
    textInput = input;
    
    // Delay focus to ensure input is ready
    setTimeout(() => input.focus(), 10);
    
    function commitText() {
      if (input.value.trim()) {
        state.history.push([...strokes]);
        if (state.history.length > 30) state.history.shift();
        
        strokes.push({
          type: 'text',
          x: pageX,
          y: pageY,
          text: input.value,
          color: state.color,
          size: state.size
        });
        renderStrokes();
      }
      input.remove();
      if (textInput === input) textInput = null;
    }
    
    input.addEventListener('blur', () => {
      setTimeout(commitText, 100);
    });
    
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = '';
        input.blur();
      }
    });
  }

  // Drawing
  let points = [];

  overlay.addEventListener('mousedown', startDraw);
  overlay.addEventListener('mousemove', throttle(draw, 8));
  overlay.addEventListener('mouseup', endDraw);
  overlay.addEventListener('mouseleave', endDraw);

  function startDraw(e) {
    if (!state.active) return;
    
    // Handle text tool
    if (state.tool === 'text') {
      e.preventDefault();
      e.stopPropagation();
      const coords = getPageCoords(e);
      createTextInput(e.clientX, e.clientY, coords.x, coords.y);
      return;
    }
    
    state.drawing = true;
    const coords = getPageCoords(e);
    points = [coords];
    
    currentStroke = {
      points: [coords],
      color: state.color,
      size: state.tool === 'eraser' ? state.size * 3 : state.size,
      alpha: state.tool === 'highlighter' ? 0.4 : 1,
      eraser: state.tool === 'eraser'
    };
  }

  function draw(e) {
    if (!state.drawing || !state.active) return;
    const coords = getPageCoords(e);
    points.push(coords);
    currentStroke.points = points;
    renderStrokes();
  }

  function endDraw() {
    if (!state.drawing) return;
    
    if (points.length >= 2) {
      // Simplify and save the stroke
      const simplified = simplifyPath(points, 0.85);
      currentStroke.points = simplified;
      
      // Save undo state before adding stroke
      state.history.push([...strokes]);
      if (state.history.length > 30) state.history.shift();
      
      strokes.push(currentStroke);
    }
    
    currentStroke = null;
    state.drawing = false;
    points = [];
    renderStrokes();
  }

  // Ramer-Douglas-Peucker algorithm to simplify path
  function simplifyPath(points, tolerance) {
    if (points.length <= 2) return points;
    
    let maxDist = 0;
    let maxIndex = 0;
    const start = points[0];
    const end = points[points.length - 1];
    
    for (let i = 1; i < points.length - 1; i++) {
      const dist = perpendicularDistance(points[i], start, end);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }
    
    if (maxDist > tolerance) {
      const left = simplifyPath(points.slice(0, maxIndex + 1), tolerance);
      const right = simplifyPath(points.slice(maxIndex), tolerance);
      return left.slice(0, -1).concat(right);
    }
    
    return [start, end];
  }
  
  function perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
    
    const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (len * len)));
    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;
    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
  }

  function setTool(tool) {
    state.tool = tool;
    sidebar.querySelectorAll('.sd-tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    
    // Pointer mode: let clicks pass through to the page
    if (tool === 'pointer') {
      overlay.style.pointerEvents = 'none';
      overlay.classList.add('pointer-mode');
    } else {
      overlay.style.pointerEvents = 'auto';
      overlay.classList.remove('pointer-mode');
    }
    
    // Text cursor
    if (tool === 'text') {
      overlay.style.cursor = 'text';
    } else {
      overlay.style.cursor = '';
    }
    
    // Force cursor update by briefly hiding and showing the overlay
    overlay.style.display = 'none';
    overlay.offsetHeight; // Trigger reflow
    overlay.style.display = '';
  }

  function setColor(color) {
    state.color = color;
    colorsContainer.querySelectorAll('.sd-color-btn').forEach(b => b.classList.toggle('active', b.dataset.color === color));
  }

  function undo() {
    if (state.history.length) {
      strokes = state.history.pop();
      renderStrokes();
    }
  }

  function clearCanvas() {
    state.history.push([...strokes]);
    if (state.history.length > 30) state.history.shift();
    strokes = [];
    renderStrokes();
  }

  function toggleCollapse() {
    state.collapsed = !state.collapsed;
    sidebar.classList.toggle('collapsed', state.collapsed);
  }

  function toggle() {
    state.active = !state.active;
    overlay.classList.toggle('active', state.active);
    sidebar.classList.toggle('sd-hidden', !state.active);
  } 

  window.__screenDrawToggle = toggle;

  // Keyboard shortcuts fd
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    if (!e.ctrlKey && !e.metaKey && !e.altKey && state.active) {
      switch (e.key.toLowerCase()) {
        case '1': setTool('pointer'); break;
        case '2': setTool('pen'); break;
        case '3': setTool('highlighter'); break;
        case '4': setTool('eraser'); break;
        case '5': setTool('text'); break;
        case 'z': 
          e.preventDefault();
          undo(); 
          break;
        case 'd': 
          e.preventDefault();
          clearCanvas(); 
          break;
        case 'h':
          e.preventDefault();
          toggleCollapse();
          break;
      }
    }
  }, true); // Use capture phase to get the event first

  // Handle messages from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle') toggle();
    else if (msg.action === 'clear-canvas') clearCanvas();
    else if (msg.action === 'undo') undo();
  });

  // Handle resize - match viewport size
  const updateCanvasSize = debounce(() => {
    if (window.innerWidth !== overlay.width || window.innerHeight !== overlay.height) {
      ensureOffscreenCanvas();
      offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      offscreenCtx.drawImage(overlay, 0, 0);
      
      overlay.width = window.innerWidth;
      overlay.height = window.innerHeight;
      ctx.drawImage(offscreenCanvas, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      offscreenCanvas = null;
    }
  }, 150);

  window.addEventListener('resize', updateCanvasSize);

  // Re-render strokes on scroll so drawings follow the page
  window.addEventListener('scroll', () => {
    requestAnimationFrame(renderStrokes);
  }, { passive: true });
})();



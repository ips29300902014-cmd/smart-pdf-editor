// Smart PDF Editor - app.js
// Uses PDF.js, pdf-lib, Fabric.js loaded from CDN

// Basic state
const state = {
  pdfDoc: null,
  pdfBytes: null,
  pages: [], // { pdfPage|null, width, height, rotation, canvasImage }
  currentPageIndex: -1,
  fabricCanvas: null,
  fabricPerPage: {}, // key -> JSON string of fabric canvas
  fabricMeta: {},    // key -> { width, height }
  historyPerPage: {}, // key -> {undo:[], redo:[]}
  zoom: 1,
  fileName: 'edited.pdf',
  currentTool: 'select'
};

// Setup PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.210/pdf.worker.min.js';

// DOM refs
const fileInput = document.getElementById('fileInput');
const openBtn = document.getElementById('openBtn');
const dropZone = document.getElementById('dropZone');
const thumbs = document.getElementById('thumbs');
const pdfCanvas = document.getElementById('pdfCanvas');
const canvasWrap = document.getElementById('canvasWrap');
const fabricContainer = document.getElementById('fabricContainer');
const pageInfo = document.getElementById('pageInfo');
const errorMsg = document.getElementById('errorMsg');

// Buttons & controls
document.getElementById('openBtn').addEventListener('click', ()=>fileInput.click());
fileInput.addEventListener('change', async (e)=>{ if (e.target.files[0]) await loadPdfFile(e.target.files[0]); });

['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev, e=>{ e.preventDefault(); dropZone.style.borderColor='#2b7cff'; }));
['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev, e=>{ e.preventDefault(); dropZone.style.borderColor='#dbe6ff'; }));
dropZone.addEventListener('drop', async (e)=>{ e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) await loadPdfFile(f); });

// toolbar actions
document.getElementById('downloadBtn').addEventListener('click', exportPdf);
document.getElementById('saveBtn').addEventListener('click', exportPdf);
document.getElementById('printBtn').addEventListener('click', ()=>window.print());
document.getElementById('addPageBtn').addEventListener('click', addBlankPage);
document.getElementById('deletePageBtn').addEventListener('click', deletePage);
document.getElementById('duplicatePageBtn').addEventListener('click', duplicatePage);
document.getElementById('rotateLeftBtn').addEventListener('click', ()=>rotatePage(-90));
document.getElementById('rotateRightBtn').addEventListener('click', ()=>rotatePage(90));
document.getElementById('textToolBtn').addEventListener('click', ()=>setTool('text'));
document.getElementById('selectToolBtn').addEventListener('click', ()=>setTool('select'));
document.getElementById('drawToolBtn').addEventListener('click', ()=>setTool('draw'));
document.getElementById('eraseToolBtn').addEventListener('click', ()=>setTool('erase'));
document.getElementById('imageToolBtn').addEventListener('click', ()=>triggerImageUpload());
document.getElementById('signatureToolBtn').addEventListener('click', ()=>setTool('signature'));
document.getElementById('highlightToolBtn').addEventListener('click', ()=>setTool('highlight'));

document.getElementById('findBtn').addEventListener('click', findText);
document.getElementById('replaceBtn').addEventListener('click', replaceText);
document.getElementById('replaceAllBtn').addEventListener('click', replaceAllText);

document.getElementById('zoomSelect').addEventListener('change', (e)=>{
  if (e.target.value === 'fit') fitToViewport(); else setZoom(parseFloat(e.target.value)/100);
});

document.getElementById('undoBtn').addEventListener('click', undo);
document.getElementById('redoBtn').addEventListener('click', redo);

// Properties
const fontFamily = document.getElementById('fontFamily');
const fontSize = document.getElementById('fontSize');
const boldBtn = document.getElementById('boldBtn');
const italicBtn = document.getElementById('italicBtn');
const underlineBtn = document.getElementById('underlineBtn');
const textColor = document.getElementById('textColor');
const bgColor = document.getElementById('bgColor');
const objOpacity = document.getElementById('objOpacity');
const charSpacing = document.getElementById('charSpacing');
const lineHeight = document.getElementById('lineHeight');
const textAlign = document.getElementById('textAlign');
const posX = document.getElementById('posX');
const posY = document.getElementById('posY');
const bringForwardBtn = document.getElementById('bringForwardBtn');
const sendBackwardBtn = document.getElementById('sendBackwardBtn');
const deleteObjBtn = document.getElementById('deleteObjBtn');

[fontFamily,fontSize,textColor,bgColor,objOpacity,charSpacing,lineHeight,textAlign,posX,posY].forEach(el=>el.addEventListener('change', applyPropsToActive));
[boldBtn,italicBtn,underlineBtn].forEach(b=>b.addEventListener('click', ()=>{ b.classList.toggle('active'); applyPropsToActive(); }));
bringForwardBtn.addEventListener('click', ()=>{ const o = state.fabricCanvas?.getActiveObject(); if (o) state.fabricCanvas.bringForward(o); });
sendBackwardBtn.addEventListener('click', ()=>{ const o = state.fabricCanvas?.getActiveObject(); if (o) state.fabricCanvas.sendBackwards(o); });
deleteObjBtn.addEventListener('click', ()=>{ const o = state.fabricCanvas?.getActiveObject(); if (o){ state.fabricCanvas.remove(o); saveHistory(); } });

// simple error helper
function showError(msg){
  errorMsg.textContent = msg;
  setTimeout(()=>{ if (errorMsg.textContent === msg) errorMsg.textContent=''; }, 5000);
}

// Load PDF file
async function loadPdfFile(file){
  try{
    const bytes = await file.arrayBuffer();
    state.pdfBytes = new Uint8Array(bytes);
    state.fileName = file.name.replace(/\.pdf$/i,'') + '-edited.pdf';
    state.pdfDoc = await pdfjsLib.getDocument({data: state.pdfBytes}).promise;
  }catch(err){
    console.error(err);
    if (err && err.name === 'PasswordException') showError('Password-protected PDF: not supported in this demo.');
    else showError('Invalid or corrupted PDF.');
    return;
  }
  // reset state
  state.pages = [];
  state.fabricPerPage = {};
  state.fabricMeta = {};
  state.historyPerPage = {};
  for (let i=1;i<=state.pdfDoc.numPages;i++){
    const pdfPage = await state.pdfDoc.getPage(i);
    const viewport = pdfPage.getViewport({scale:1});
    state.pages.push({
      pdfPage,
      rotation: pdfPage.rotate || 0,
      width: viewport.width,
      height: viewport.height,
      canvasImage: null
    });
  }
  renderThumbnails();
  selectPage(0);
}

// Render thumbnails
async function renderThumbnails(){
  thumbs.innerHTML = '';
  for (let i=0;i<state.pages.length;i++){
    const p = state.pages[i];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = Math.min(0.18, 200 / Math.max(p.width, p.height));
    const viewport = p.pdfPage ? p.pdfPage.getViewport({scale}) : {width:p.width*scale, height:p.height*scale};
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    if (p.pdfPage) await p.pdfPage.render({ canvasContext: ctx, viewport }).promise;
    else { ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); }
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    thumb.dataset.index = i;
    thumb.innerHTML = `<img src="${canvas.toDataURL('image/png')}" alt="page ${i+1}"><div class="tmeta">Page ${i+1}</div>`;
    thumb.addEventListener('click', ()=>selectPage(i));
    thumbs.appendChild(thumb);
  }
}

// Select page
async function selectPage(index){
  if (index<0 || index>=state.pages.length) return;
  // save current page canvas state
  if (state.currentPageIndex >= 0) saveCurrentFabric();

  state.currentPageIndex = index;
  pageInfo.textContent = `Page ${index+1} / ${state.pages.length}`;
  const p = state.pages[index];

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const scale = state.zoom * dpr;
  if (p.pdfPage){
    const viewport = p.pdfPage.getViewport({scale});
    pdfCanvas.width = Math.round(viewport.width);
    pdfCanvas.height = Math.round(viewport.height);
    pdfCanvas.style.width = Math.round(viewport.width / dpr) + 'px';
    pdfCanvas.style.height = Math.round(viewport.height / dpr) + 'px';
    const ctx = pdfCanvas.getContext('2d');
    ctx.clearRect(0,0,pdfCanvas.width,pdfCanvas.height);
    await p.pdfPage.render({ canvasContext: ctx, viewport }).promise;
  } else {
    // blank page
    const w = Math.round((p.width||595)*scale);
    const h = Math.round((p.height||842)*scale);
    pdfCanvas.width = w; pdfCanvas.height = h;
    pdfCanvas.style.width = Math.round(w/dpr) + 'px';
    pdfCanvas.style.height = Math.round(h/dpr) + 'px';
    const ctx = pdfCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,w,h);
  }

  mountFabricForPage(index, pdfCanvas.width, pdfCanvas.height, dpr);
}

// Save current fabric canvas JSON & meta
function saveCurrentFabric(){
  if (!state.fabricCanvas || state.currentPageIndex < 0) return;
  const key = 'page_' + state.currentPageIndex;
  const json = state.fabricCanvas.toJSON(['selectable']);
  state.fabricPerPage[key] = JSON.stringify(json);
  state.fabricMeta[key] = { width: state.fabricCanvas.width, height: state.fabricCanvas.height };
  // also ensure history saved
  saveHistory(true);
}

// Mount fabric overlay for page
function mountFabricForPage(index, widthPx, heightPx, dpr=1){
  // clear container
  fabricContainer.innerHTML = '';
  const c = document.createElement('canvas');
  c.id = 'fabricCanvas';
  c.width = widthPx;
  c.height = heightPx;
  c.style.width = Math.round(widthPx / dpr) + 'px';
  c.style.height = Math.round(heightPx / dpr) + 'px';
  c.style.pointerEvents = 'auto';
  fabricContainer.style.width = c.style.width;
  fabricContainer.style.height = c.style.height;
  fabricContainer.appendChild(c);

  // create fabric canvas
  const f = new fabric.Canvas(c, { backgroundColor: 'transparent', renderOnAddRemove: true, preserveObjectStacking: true });
  state.fabricCanvas = f;

  // load previous JSON if exists
  const key = 'page_' + index;
  if (state.fabricPerPage[key]){
    try{
      const json = JSON.parse(state.fabricPerPage[key]);
      f.loadFromJSON(json, ()=>{ f.renderAll(); }, function(o, object){ /*reviver*/ });
    }catch(e){ console.warn('Failed to load fabric JSON', e); }
  }

  // interactions
  f.on('object:added', ()=>{ saveHistory(); });
  f.on('object:modified', ()=>{ saveHistory(); });
  f.on('object:removed', ()=>{ saveHistory(); });
  f.on('selection:created', updatePropsPanel);
  f.on('selection:updated', updatePropsPanel);
  f.on('selection:cleared', clearPropsPanel);

  // double-click text edit
  c.addEventListener('dblclick', (ev)=>{
    const target = f.findTarget(ev, true);
    if (target && target.type === 'textbox'){
      f.setActiveObject(target);
      target.enterEditing();
      target.selectAll();
    } else if (state.currentTool === 'text'){
      const pointer = f.getPointer(ev);
      const tb = new fabric.Textbox('New text', {
        left: pointer.x, top: pointer.y,
        fontFamily: fontFamily.value || 'Roboto',
        fontSize: parseInt(fontSize.value,10)||18,
        fill: textColor.value || '#000',
        backgroundColor: bgColor.value || '',
        editable: true,
        objectCaching: false,
        charSpacing: parseInt(charSpacing.value,10)||0,
        lineHeight: parseFloat(lineHeight.value)||1.2
      });
      f.add(tb);
      f.setActiveObject(tb);
      tb.enterEditing();
      saveHistory();
      updatePropsPanel();
    }
  });

  // mouse down for tools
  f.on('mouse:down', (opt)=>{
    const pointer = f.getPointer(opt.e);
    const target = opt.target;
    if (state.currentTool === 'text' && !target){
      const tb = new fabric.Textbox('New text', {
        left: pointer.x, top: pointer.y,
        fontFamily: fontFamily.value || 'Roboto',
        fontSize: parseInt(fontSize.value,10)||18,
        fill: textColor.value || '#000',
        backgroundColor: bgColor.value || '',
        editable: true,
        charSpacing: parseInt(charSpacing.value,10)||0,
        lineHeight: parseFloat(lineHeight.value)||1.2
      });
      f.add(tb);
      f.setActiveObject(tb);
      tb.enterEditing();
      saveHistory();
    } else if (state.currentTool === 'erase' && target){
      f.remove(target);
      saveHistory();
    }
  });

  // free drawing brush
  f.isDrawingMode = false;
  f.freeDrawingBrush = new fabric.PencilBrush(f);
  f.freeDrawingBrush.width = 2;
  f.freeDrawingBrush.color = '#000000';

  // update property panel live
  f.on('object:moving', updatePropsPanelFromActive);
  f.on('object:scaling', updatePropsPanelFromActive);
  f.on('object:rotating', updatePropsPanelFromActive);
  f.on('object:modified', updatePropsPanelFromActive);

  // initialize empty history if none
  const keyHist = 'page_' + state.currentPageIndex;
  if (!state.historyPerPage[keyHist]) state.historyPerPage[keyHist] = {undo:[],redo:[]};
  if (state.historyPerPage[keyHist].undo.length === 0){
    saveHistory(true);
  }

  // ensure fabric meta stored
  state.fabricMeta[key] = { width: f.width, height: f.height };
  updatePropsPanel();
  setTool(state.currentTool);
}

// Set active tool
function setTool(name){
  state.currentTool = name;
  if (!state.fabricCanvas) return;
  if (name === 'draw'){
    state.fabricCanvas.isDrawingMode = true;
    state.fabricCanvas.freeDrawingBrush.width = 3;
    state.fabricCanvas.freeDrawingBrush.color = '#000';
  } else if (name === 'highlight'){
    state.fabricCanvas.isDrawingMode = true;
    state.fabricCanvas.freeDrawingBrush.width = 16;
    state.fabricCanvas.freeDrawingBrush.color = 'rgba(255,255,0,0.35)';
  } else if (name === 'signature'){
    state.fabricCanvas.isDrawingMode = true;
    state.fabricCanvas.freeDrawingBrush.width = 2;
    state.fabricCanvas.freeDrawingBrush.color = '#000';
  } else {
    state.fabricCanvas.isDrawingMode = false;
  }
  state.fabricCanvas.defaultCursor = (name === 'text') ? 'text' : 'default';
}

// Apply properties to active object
function applyPropsToActive(){
  const obj = state.fabricCanvas?.getActiveObject();
  if (!obj) return;
  if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text'){
    obj.set({
      fontFamily: fontFamily.value,
      fontSize: parseInt(fontSize.value,10),
      fontWeight: boldBtn.classList.contains('active') ? '700' : '400',
      fontStyle: italicBtn.classList.contains('active') ? 'italic' : 'normal',
      underline: underlineBtn.classList.contains('active'),
      fill: textColor.value,
      backgroundColor: bgColor.value,
      opacity: parseFloat(objOpacity.value),
      charSpacing: parseInt(charSpacing.value,10),
      lineHeight: parseFloat(lineHeight.value),
      textAlign: textAlign.value
    });
    obj.setCoords();
    state.fabricCanvas.requestRenderAll();
    saveHistory();
    updatePropsPanelFromActive();
  } else {
    obj.set('opacity', parseFloat(objOpacity.value));
    obj.setCoords();
    state.fabricCanvas.requestRenderAll();
    saveHistory();
    updatePropsPanelFromActive();
  }
}

// Update properties panel
function updatePropsPanel(){
  const obj = state.fabricCanvas?.getActiveObject();
  if (!obj) return;
  fontFamily.value = obj.fontFamily || fontFamily.value;
  fontSize.value = obj.fontSize || fontSize.value;
  textColor.value = obj.fill || textColor.value;
  bgColor.value = obj.backgroundColor || bgColor.value;
  objOpacity.value = obj.opacity || 1;
  charSpacing.value = obj.charSpacing || 0;
  lineHeight.value = obj.lineHeight || 1;
  textAlign.value = obj.textAlign || 'left';
  posX.value = Math.round(obj.left || 0);
  posY.value = Math.round(obj.top || 0);
}

function updatePropsPanelFromActive(){
  const obj = state.fabricCanvas?.getActiveObject();
  if (!obj) return;
  posX.value = Math.round(obj.left || 0);
  posY.value = Math.round(obj.top || 0);
}

function clearPropsPanel(){
  // optionally clear inputs
}

// Image upload
function triggerImageUpload(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e)=>{
    const f = e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = ()=>{
      const fi = new fabric.Image(img, { left:40, top:40, scaleX: 0.5, scaleY: 0.5, selectable:true });
      state.fabricCanvas.add(fi);
      state.fabricCanvas.setActiveObject(fi);
      saveHistory();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  input.click();
}

// Page ops
function addBlankPage(){
  const w = 595, h = 842; // approx A4
  state.pages.push({ pdfPage: null, rotation:0, width: w, height: h, canvasImage: null });
  renderThumbnails();
  selectPage(state.pages.length-1);
}

function deletePage(){
  if (state.currentPageIndex < 0) return;
  state.pages.splice(state.currentPageIndex,1);
  // clear saved data and rebuild mapping
  const newPerPage = {};
  const newMeta = {};
  const newHist = {};
  let j=0;
  for (let i=0;i<state.pages.length+1;i++){
    const key = 'page_'+i;
    if (i === state.currentPageIndex) continue;
    if (state.fabricPerPage[key]) newPerPage['page_'+j] = state.fabricPerPage[key];
    if (state.fabricMeta[key]) newMeta['page_'+j] = state.fabricMeta[key];
    if (state.historyPerPage[key]) newHist['page_'+j] = state.historyPerPage[key];
    j++;
  }
  state.fabricPerPage = newPerPage; state.fabricMeta = newMeta; state.historyPerPage = newHist;
  renderThumbnails();
  const idx = Math.max(0, state.currentPageIndex-1);
  selectPage(idx);
}

function duplicatePage(){
  if (state.currentPageIndex < 0) return;
  const key = 'page_'+state.currentPageIndex;
  const copyJson = state.fabricPerPage[key] ? JSON.parse(state.fabricPerPage[key]) : null;
  const copyMeta = state.fabricMeta[key] ? {...state.fabricMeta[key]} : null;
  const p = state.pages[state.currentPageIndex];
  const newPage = { pdfPage: p.pdfPage, rotation: p.rotation, width: p.width, height: p.height, canvasImage: p.canvasImage };
  state.pages.splice(state.currentPageIndex+1, 0, newPage);
  // shift mappings
  const newPerPage = {};
  const newMeta = {};
  const newHist = {};
  for (let i=0;i<state.pages.length;i++){
    if (i === state.currentPageIndex+1){
      if (copyJson) newPerPage['page_'+i] = JSON.stringify(copyJson);
      if (copyMeta) newMeta['page_'+i] = copyMeta;
    } else {
      const origIndex = (i <= state.currentPageIndex) ? i : i-1;
      const keyo = 'page_'+origIndex;
      if (state.fabricPerPage[keyo]) newPerPage['page_'+i] = state.fabricPerPage[keyo];
      if (state.fabricMeta[keyo]) newMeta['page_'+i] = state.fabricMeta[keyo];
      if (state.historyPerPage[keyo]) newHist['page_'+i] = state.historyPerPage[keyo];
    }
  }
  state.fabricPerPage = newPerPage; state.fabricMeta = newMeta; state.historyPerPage = newHist;
  renderThumbnails();
  selectPage(state.currentPageIndex+1);
}

function rotatePage(angle){
  if (state.currentPageIndex < 0) return;
  const p = state.pages[state.currentPageIndex];
  p.rotation = (p.rotation + angle + 360) % 360;
  selectPage(state.currentPageIndex);
}

// Find & Replace within overlays on current page
function findText(){
  const q = document.getElementById('findInput').value;
  if (!q) return showError('Please provide find text.');
  const f = state.fabricCanvas;
  if (!f) return showError('No page loaded.');
  let found = 0;
  f.getObjects('textbox').forEach(o=>{
    if (o.text && o.text.includes(q)){ o.set('stroke','red'); o.set('strokeWidth',1); found++; }
    else { o.set('stroke', null); o.set('strokeWidth',0); }
  });
  f.requestRenderAll();
  showError(`Found ${found} overlay occurrences on this page.`);
}

function replaceText(){
  const find = document.getElementById('findInput').value;
  const rep = document.getElementById('replaceInput').value;
  if (!find) return showError('Find text required.');
  const f = state.fabricCanvas;
  for (const o of f.getObjects('textbox')){
    if (o.text && o.text.includes(find)){
      o.text = o.text.replace(find, rep);
      o.setCoords();
      saveHistory();
      f.requestRenderAll();
      showError('Replaced first occurrence on this page.');
      return;
    }
  }
  showError('No occurrence found on this page.');
}

function replaceAllText(){
  const find = document.getElementById('findInput').value;
  const rep = document.getElementById('replaceInput').value;
  if (!find) return showError('Find text required.');
  const f = state.fabricCanvas;
  let count=0;
  for (const o of f.getObjects('textbox')){
    if (o.text && o.text.includes(find)){
      o.text = o.text.split(find).join(rep);
      o.setCoords();
      count++;
    }
  }
  if (count) { saveHistory(); f.requestRenderAll(); showError(`Replaced ${count} occurrences on this page.`); }
  else showError('No occurrences found on this page.');
}

// History: undo/redo per page
function getHistoryStackForCurrent(){
  const key = 'page_' + state.currentPageIndex;
  if (!state.historyPerPage[key]) state.historyPerPage[key] = {undo:[], redo:[]};
  return state.historyPerPage[key];
}

function saveHistory(initial=false){
  if (state.currentPageIndex < 0 || !state.fabricCanvas) return;
  const key = 'page_' + state.currentPageIndex;
  const stack = getHistoryStackForCurrent();
  const json = state.fabricCanvas.toJSON();
  // also save meta
  state.fabricPerPage[key] = JSON.stringify(json);
  state.fabricMeta[key] = { width: state.fabricCanvas.width, height: state.fabricCanvas.height };
  if (initial){
    stack.undo = [json]; stack.redo = [];
  } else {
    stack.undo.push(json);
    if (stack.undo.length > 100) stack.undo.shift();
    stack.redo = [];
  }
}

function undo(){
  if (state.currentPageIndex < 0) return;
  const key = 'page_' + state.currentPageIndex;
  const stack = state.historyPerPage[key];
  if (!stack || stack.undo.length <= 1) return;
  const last = stack.undo.pop();
  stack.redo.push(last);
  const prev = stack.undo[stack.undo.length-1];
  state.fabricCanvas.loadFromJSON(prev, ()=>{ state.fabricCanvas.renderAll(); });
  state.fabricPerPage[key] = JSON.stringify(prev);
}

function redo(){
  if (state.currentPageIndex < 0) return;
  const key = 'page_' + state.currentPageIndex;
  const stack = state.historyPerPage[key];
  if (!stack || stack.redo.length === 0) return;
  const next = stack.redo.pop();
  stack.undo.push(next);
  state.fabricCanvas.loadFromJSON(next, ()=>{ state.fabricCanvas.renderAll(); });
  state.fabricPerPage[key] = JSON.stringify(next);
}

// Export: render each page and overlay and embed into pdf-lib
async function exportPdf(){
  if (!state.pages.length) return showError('No document to export.');
  try{
    showError('Exporting PDF, please wait...');
    const newPdf = await PDFLib.PDFDocument.create();
    for (let i=0;i<state.pages.length;i++){
      const p = state.pages[i];
      // create export canvas sized from PDF page (use scale)
      const exportScale = 2; // higher for quality
      let exportWidth, exportHeight;
      if (p.pdfPage){
        const vp = p.pdfPage.getViewport({scale: exportScale});
        exportWidth = Math.round(vp.width);
        exportHeight = Math.round(vp.height);
      } else {
        exportWidth = Math.round((p.width || 595) * exportScale);
        exportHeight = Math.round((p.height || 842) * exportScale);
      }
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = exportWidth;
      exportCanvas.height = exportHeight;
      const ctx = exportCanvas.getContext('2d');
      // white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0,0,exportCanvas.width, exportCanvas.height);

      // draw base PDF page
      if (p.pdfPage){
        const vp = p.pdfPage.getViewport({scale: exportScale});
        await p.pdfPage.render({ canvasContext: ctx, viewport: vp }).promise;
      } else {
        // blank - already white
      }

      // draw overlay: either current page fabric (if i == current) or load JSON into static canvas
      const key = 'page_'+i;
      if (state.fabricPerPage[key]){
        const savedJson = JSON.parse(state.fabricPerPage[key]);
        const savedMeta = state.fabricMeta[key] || { width: exportWidth/exportScale, height: exportHeight/exportScale };
        // create temporary StaticCanvas with saved dimensions
        const tmpCanvas = new fabric.StaticCanvas(null, { width: savedMeta.width, height: savedMeta.height });
        // append hidden canvas for toDataURL
        const tmpEl = document.createElement('canvas');
        tmpEl.width = savedMeta.width;
        tmpEl.height = savedMeta.height;
        tmpEl.style.display = 'none';
        document.body.appendChild(tmpEl);
        tmpCanvas.lowerCanvasEl = tmpEl;
        try{
          await new Promise((resolve, reject)=>{
            tmpCanvas.loadFromJSON(savedJson, ()=>{
              tmpCanvas.renderAll();
              resolve();
            }, function(o, object){});
          });
          // obtain dataURL at multiplier to match export scale
          const multiplier = exportScale * (savedMeta.width ? (exportWidth / (savedMeta.width * exportScale)) : 1) || exportScale;
          // simpler: generate toDataURL with multiplier = exportScale
          const dataUrl = tmpCanvas.toDataURL({ multiplier: exportScale });
          // draw the overlay on export ctx
          await new Promise((res, rej)=>{
            const img = new Image();
            img.onload = ()=>{ ctx.drawImage(img, 0, 0, exportWidth, exportHeight); res(); };
            img.onerror = ()=>{ res(); };
            img.src = dataUrl;
          });
        }catch(e){
          console.warn('Overlay render failed', e);
        }finally{
          // cleanup
          tmpCanvas.clear(); if (tmpEl && tmpEl.parentNode) tmpEl.parentNode.removeChild(tmpEl);
        }
      } else {
        // no overlay
      }

      // embed the composed canvas into pdf-lib page as a PNG
      const pngBytes = await new Promise(res=> exportCanvas.toBlob(b=>{ const r = new File([b], 'tmp.png'); const reader = new FileReader(); reader.onload = ()=>res(new Uint8Array(reader.result)); reader.readAsArrayBuffer(b); }));
      const img = await newPdf.embedPng(pngBytes);
      const page = newPdf.addPage([exportWidth, exportHeight]);
      page.drawImage(img, { x:0, y:0, width: exportWidth, height: exportHeight });
    }

    const pdfBytes = await newPdf.save();
    const blob = new Blob([pdfBytes], {type:'application/pdf'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.fileName || 'edited.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showError('Download started.');
  }catch(err){
    console.error(err);
    showError('Export failed: ' + (err.message || err));
  }
}

// Zoom helpers
function setZoom(z){
  state.zoom = z;
  if (state.currentPageIndex >= 0) selectPage(state.currentPageIndex);
}

function fitToViewport(){
  // basic fit: reduce zoom until page fits canvasWrap
  if (!state.pages.length || state.currentPageIndex < 0) return;
  const p = state.pages[state.currentPageIndex];
  const wrapRect = canvasWrap.getBoundingClientRect();
  const pad = 40;
  const wRatio = (wrapRect.width - pad) / p.width;
  const hRatio = (wrapRect.height - pad) / p.height;
  const z = Math.min(wRatio, hRatio, 1);
  setZoom(z || 1);
}

// Utility: save current page fabric before switching away
function ensureSaveBeforeSwitch(){
  saveCurrentFabric();
}

// init: nothing loaded yet
pageInfo.textContent = 'No document loaded';

// Expose minimal console message for debugging
console.log('Smart PDF Editor loaded. Open a PDF to begin.');
// ===== 상태/엘리먼트 =====
const STORAGE_KEY = "seatmap-pro-v2";

const els = {
  // 좌측 입력 방식
  methodText: document.getElementById("methodText"),
  methodFile: document.getElementById("methodFile"),
  methodNumber: document.getElementById("methodNumber"),
  methodTextBox: document.getElementById("methodTextBox"),
  methodFileBox: document.getElementById("methodFileBox"),
  methodNumberBox: document.getElementById("methodNumberBox"),

  namesInput: document.getElementById("namesInput"),
  namesFile: document.getElementById("namesFile"),
  readFileBtn: document.getElementById("readFileBtn"),

  numStart: document.getElementById("numStart"),
  numEnd: document.getElementById("numEnd"),
  numPad: document.getElementById("numPad"),
  genNumbersBtn: document.getElementById("genNumbersBtn"),

  applyNamesBtn: document.getElementById("applyNamesBtn"),

  gridSizeSelect: document.getElementById("gridSizeSelect"),
  viewModeSelect: document.getElementById("viewModeSelect"),
  autoModeSelect: document.getElementById("autoModeSelect"),
  orderBasisSelect: document.getElementById("orderBasisSelect"),
  orderBasisRow: document.getElementById("orderBasisRow"),

  autoFillEmptyBtn: document.getElementById("autoFillEmptyBtn"),
  autoFillAllBtn: document.getElementById("autoFillAllBtn"),
  clearAllBtn: document.getElementById("clearAllBtn"),

  lockIdInput: document.getElementById("lockIdInput"),
  lockSeatInput: document.getElementById("lockSeatInput"),
  addNameLockBtn: document.getElementById("addNameLockBtn"),
  removeNameLockBtn: document.getElementById("removeNameLockBtn"),
  nameLockList: document.getElementById("nameLockList"),

  unassignedList: document.getElementById("unassignedList"),

  // 우측: 제목 + 보기
  titleInput: document.getElementById("titleInput"),
  applyTitleBtn: document.getElementById("applyTitleBtn"),
  titleDisplay: document.getElementById("titleDisplay"),

  viewTop: document.getElementById("view-top"),
  gridTop: document.getElementById("grid-top"),
  viewBottom: document.getElementById("view-bottom"),
  gridBottom: document.getElementById("grid-bottom"),

  printBothCheckbox: document.getElementById("printBothCheckbox"),
  printBtn: document.getElementById("printBtn"),

  saveBtn: document.getElementById("saveBtn"),
  loadBtn: document.getElementById("loadBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importInput: document.getElementById("importInput"),

  ctxMenu: document.getElementById("ctxMenu"),
  body: document.body,
};

let state = {
  title: "제목 없음",
  rows: 6, cols: 6,
  students: [],        // [{id,name}]
  studentsOrder: [],   // 입력 순서 id[]
  unassigned: [],      // id[]
  assign: {},          // seatNum -> id|null
  disabledSeats: new Set(),
  occupantLocked: new Set(),
  nameLock: {},        // id -> seatNum
  autoMode: "random",  // random|order
  orderBasis: "id",    // id|input|name
  viewMode: "top"      // top|bottom|both
};

function totalSeats(){ return state.rows*state.cols; }
function ensureAssignSlots(){
  const N = totalSeats();
  for(let i=1;i<=N;i++) if(!(i in state.assign)) state.assign[i]=null;
  Object.keys(state.assign).forEach(k=>{
    const sn = parseInt(k,10);
    if(sn>N){
      const id = state.assign[sn];
      if(id) state.unassigned.push(id);
      delete state.assign[sn];
      state.disabledSeats.delete(sn);
      state.occupantLocked.delete(sn);
      for(const sid in state.nameLock) if(state.nameLock[sid]===sn) delete state.nameLock[sid];
    }
  });
}

// ===== 입력 파싱/생성 =====
function parseNames(text){
  const lines = text.split("\n").map(s=>s.trim()).filter(Boolean);
  const seen = new Set(); const students=[]; const order=[];
  for(const line of lines){
    const m = line.match(/^(\S+)(?:\s+(.+))?$/); if(!m) continue;
    const id=m[1], name=(m[2]||"").trim();
    if(seen.has(id)) continue; seen.add(id);
    students.push({id, name}); order.push(id);
  }
  return {students, order};
}
function generateNumbers(start,end,pad){
  const out=[]; const s=Math.min(start,end), e=Math.max(start,end);
  for(let n=s;n<=e;n++){ out.push(pad>0? String(n).padStart(pad,"0") : String(n)); }
  els.namesInput.value = out.join("\n");
}

// ===== 좌석 번호 매기기(세로 스캔): top=좌→우, 위→아래 / bottom=우→좌, 아래→위 =====
function seatScanOrder(view){
  const arr=[];
  if(view==="top"){
    for(let c=0;c<state.cols;c++) for(let r=0;r<state.rows;r++) arr.push({r,c});
  }else{
    for(let c=state.cols-1;c>=0;c--) for(let r=state.rows-1;r>=0;r--) arr.push({r,c});
  }
  return arr;
}
function buildMappings(){
  const top=seatScanOrder("top"), bottom=seatScanOrder("bottom");
  const map={ top:{gridToSeat:new Map(), seatToGrid:new Map()},
              bottom:{gridToSeat:new Map(), seatToGrid:new Map()} };
  top.forEach((p,i)=>{ const idx=p.r*state.cols+p.c, sn=i+1; map.top.gridToSeat.set(idx,sn); map.top.seatToGrid.set(sn,idx); });
  bottom.forEach((p,i)=>{ const idx=p.r*state.cols+p.c, sn=i+1; map.bottom.gridToSeat.set(idx,sn); map.bottom.seatToGrid.set(sn,idx); });
  return map;
}
let mappings=buildMappings();

// ===== 미배정/잠금 목록 =====
let selectedUnassignedLI=null;
function findStudentById(id){ return state.students.find(s=>s.id===id)||null; }

function renderUnassigned(){
  els.unassignedList.innerHTML="";
  state.unassigned.forEach(id=>{
    const s=findStudentById(id); if(!s) return;
    const li=document.createElement("li");
    li.draggable=true;
    li.innerHTML=`<span class="id">${s.id}</span><span class="nm">${s.name||""}</span>`;
    li.addEventListener("click",()=>{
      if(selectedUnassignedLI && selectedUnassignedLI!==li) selectedUnassignedLI.classList.remove("selected");
      li.classList.toggle("selected"); selectedUnassignedLI = li.classList.contains("selected")? li:null;
    });
    li.addEventListener("dragstart",(e)=>{
      e.dataTransfer.setData("text/plain", s.id);
      e.dataTransfer.setData("from","unassigned");
      e.dataTransfer.setData("idx", Array.from(els.unassignedList.children).indexOf(li)+"");
    });
    els.unassignedList.appendChild(li);
  });
}
function renderNameLockList(){
  els.nameLockList.innerHTML="";
  Object.entries(state.nameLock).forEach(([id,sn])=>{
    const s=findStudentById(id); const nm=s?(s.name||""):"";
    const li=document.createElement("li");
    li.textContent=`${id}${nm? " "+nm:""} → 좌석 ${sn}`;
    els.nameLockList.appendChild(li);
  });
}

// ===== 좌석 DOM =====
function createSeatEl(view, gridIdx, container){
  const sn=mappings[view].gridToSeat.get(gridIdx);
  const seat=document.createElement("div");
  seat.className="seat"; seat.setAttribute("role","gridcell");
  seat.dataset.view=view; seat.dataset.gridIdx=gridIdx; seat.dataset.seatnum=sn;

  const label=document.createElement("div"); label.className="label"; label.textContent=sn;
  const info=document.createElement("div"); info.className="info";
  const idEl=document.createElement("div"); idEl.className="id";
  const nmEl=document.createElement("div"); nmEl.className="nm";
  info.appendChild(idEl); info.appendChild(nmEl);

  const lockBtn=document.createElement("button");
  lockBtn.className="lock-btn"; lockBtn.title="잠금 토글 (빈좌석=비활성, 배정좌석=점유)"; lockBtn.textContent="🔒";

  seat.addEventListener("click",(e)=>{
    if(e.target===lockBtn) return;
    const curId=state.assign[sn];
    if(selectedUnassignedLI){
      const idx=Array.from(els.unassignedList.children).indexOf(selectedUnassignedLI);
      if(idx>=0){ const id=state.unassigned[idx]; assignToSeat(sn,id,true); }
    }else if(curId){
      if(state.occupantLocked.has(sn)) return alert("점유잠금 좌석은 비울 수 없습니다.");
      unassignSeat(sn,true);
    }
  });
  seat.addEventListener("dragover",e=>{e.preventDefault(); seat.classList.add("dragover");});
  seat.addEventListener("dragleave",()=> seat.classList.remove("dragover"));
  seat.addEventListener("drop",(e)=>{
    e.preventDefault(); seat.classList.remove("dragover");
    const id=e.dataTransfer.getData("text/plain"); if(!id) return;
    assignToSeat(sn,id,true);
    const from=e.dataTransfer.getData("from");
    if(from==="unass

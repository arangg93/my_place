// ===================== 상태/상수 =====================
const STORAGE_KEY = "seatmap-pro-v1";

const els = {
  titleInput: document.getElementById("titleInput"),
  applyTitleBtn: document.getElementById("applyTitleBtn"),
  titleDisplay: document.getElementById("titleDisplay"),

  namesInput: document.getElementById("namesInput"),
  applyNamesBtn: document.getElementById("applyNamesBtn"),
  clearAllBtn: document.getElementById("clearAllBtn"),

  gridSizeSelect: document.getElementById("gridSizeSelect"),
  viewModeSelect: document.getElementById("viewModeSelect"),
  autoModeSelect: document.getElementById("autoModeSelect"),
  orderBasisSelect: document.getElementById("orderBasisSelect"),
  orderBasisRow: document.getElementById("orderBasisRow"),

  autoFillEmptyBtn: document.getElementById("autoFillEmptyBtn"),
  autoFillAllBtn: document.getElementById("autoFillAllBtn"),

  lockIdInput: document.getElementById("lockIdInput"),
  lockSeatInput: document.getElementById("lockSeatInput"),
  addNameLockBtn: document.getElementById("addNameLockBtn"),
  removeNameLockBtn: document.getElementById("removeNameLockBtn"),
  nameLockList: document.getElementById("nameLockList"),

  unassignedList: document.getElementById("unassignedList"),

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

// 내부 데이터
let state = {
  title: "자리배치표",
  rows: 6,
  cols: 6,
  // 학생 목록: {id, name}
  students: [],
  // 입력 순서 보존(순서 배치용)
  studentsOrder: [], // array of id
  // 미배정 큐: array of id
  unassigned: [],
  // 좌석 배정: seatNumber(1..N) -> id | null
  assign: {},
  // 좌석 비활성 잠금: Set(seatNumber)
  disabledSeats: new Set(),
  // 좌석 점유 잠금: Set(seatNumber)
  occupantLocked: new Set(),
  // 이름 잠금: id -> seatNumber
  nameLock: {},
  // 자동 배치 옵션
  autoMode: "random", // random | order
  orderBasis: "id", // id | input | name
  // 보기 모드
  viewMode: "top", // top | bottom | both
};

// ===================== 유틸 =====================
function totalSeats(){ return state.rows * state.cols; }

function clampSeatNumber(n){
  return Math.max(1, Math.min(n, totalSeats()));
}

function seatScanOrder(view){ 
  // 교탁 위: 행 위→아래, 열 왼→오 (교탁 오른쪽=화면 왼쪽)
  // 교탁 아래: 행 아래→위, 열 오→왼 (교탁 오른쪽=화면 오른쪽)
  const order = [];
  if(view === "top"){
    for(let r=0;r<state.rows;r++){
      for(let c=0;c<state.cols;c++){
        order.push({r, c});
      }
    }
  }else{
    for(let r=state.rows-1;r>=0;r--){
      for(let c=state.cols-1;c>=0;c--){
        order.push({r, c});
      }
    }
  }
  return order;
}

function buildMappings(){
  // gridIndex = r*cols + c <-> seatNumber(1..N), view별 상이
  const topOrder = seatScanOrder("top");
  const bottomOrder = seatScanOrder("bottom");
  const map = {
    top: { gridToSeat: new Map(), seatToGrid: new Map() },
    bottom: { gridToSeat: new Map(), seatToGrid: new Map() }
  };
  topOrder.forEach((pos, i)=>{
    const gridIdx = pos.r * state.cols + pos.c;
    const seatNum = i + 1;
    map.top.gridToSeat.set(gridIdx, seatNum);
    map.top.seatToGrid.set(seatNum, gridIdx);
  });
  bottomOrder.forEach((pos, i)=>{
    const gridIdx = pos.r * state.cols + pos.c;
    const seatNum = i + 1;
    map.bottom.gridToSeat.set(gridIdx, seatNum);
    map.bottom.seatToGrid.set(seatNum, gridIdx);
  });
  return map;
}

function ensureAssignSlots(){
  const N = totalSeats();
  for(let i=1;i<=N;i++){
    if(!(i in state.assign)) state.assign[i] = null;
  }
  // 좌석 수 줄었을 때 잘라내기
  Object.keys(state.assign).forEach(k=>{
    const num = parseInt(k,10);
    if(num > N){
      const id = state.assign[num];
      if(id){ state.unassigned.push(id); }
      delete state.assign[num];
      state.disabledSeats.delete(num);
      state.occupantLocked.delete(num);
      // 이름 잠금에서 이 좌석 참조가 있다면 제거
      for(const sid in state.nameLock){
        if(state.nameLock[sid] === num) delete state.nameLock[sid];
      }
    }
  });
}

function parseNames(text){
  const lines = text.split("\n").map(s=>s.trim()).filter(Boolean);
  const seen = new Set();
  const students = [];
  const order = [];
  for(const line of lines){
    const m = line.match(/^(\S+)\s+(.+)$/);
    if(!m) continue;
    const id = m[1];
    const name = m[2];
    if(seen.has(id)) continue; // 동일 학번은 하나만
    seen.add(id);
    students.push({id, name});
    order.push(id);
  }
  return {students, order};
}

function findStudentById(id){
  return state.students.find(s=>s.id===id) || null;
}

function collateNameAsc(a,b){
  return a.localeCompare(b,'ko',{sensitivity:'base'});
}

// ===================== 렌더링(미배정/잠금목록) =====================
let selectedUnassignedLI = null;

function renderUnassigned(){
  els.unassignedList.innerHTML = "";
  state.unassigned.forEach(id=>{
    const stu = findStudentById(id);
    if(!stu) return;
    const li = document.createElement("li");
    li.draggable = true;
    li.innerHTML = `<span class="id">${stu.id}</span><span class="nm">${stu.name}</span>`;
    li.addEventListener("click", ()=>{
      if(selectedUnassignedLI && selectedUnassignedLI!==li) selectedUnassignedLI.classList.remove("selected");
      li.classList.toggle("selected");
      selectedUnassignedLI = li.classList.contains("selected") ? li : null;
    });
    li.addEventListener("dragstart", (e)=>{
      e.dataTransfer.setData("text/plain", stu.id);
      e.dataTransfer.setData("from", "unassigned");
      e.dataTransfer.setData("idx", Array.from(els.unassignedList.children).indexOf(li)+"");
    });
    els.unassignedList.appendChild(li);
  });
}

function renderNameLockList(){
  els.nameLockList.innerHTML = "";
  Object.entries(state.nameLock).forEach(([id, seat])=>{
    const stu = findStudentById(id);
    if(!stu) return;
    const li = document.createElement("li");
    li.textContent = `${stu.id} ${stu.name} → 좌석 ${seat}`;
    els.nameLockList.appendChild(li);
  });
}

// ===================== 좌석 DOM 생성/렌더 =====================
let mappings = buildMappings();

function createSeatEl(view, gridIdx, container){
  const seatNum = mappings[view].gridToSeat.get(gridIdx);
  const seat = document.createElement("div");
  seat.className = "seat";
  seat.setAttribute("role","gridcell");
  seat.dataset.view = view;
  seat.dataset.gridIdx = gridIdx;
  seat.dataset.seatnum = seatNum;

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = seatNum;

  const info = document.createElement("div");
  info.className = "info";
  const idEl = document.createElement("div");
  idEl.className = "id";
  const nmEl = document.createElement("div");
  nmEl.className = "nm";
  info.appendChild(idEl);
  info.appendChild(nmEl);

  const lockBtn = document.createElement("button");
  lockBtn.className = "lock-btn";
  lockBtn.title = "잠금 토글 (빈좌석=비활성, 배정좌석=점유)";
  lockBtn.textContent = "🔒";

  // 클릭: 미배정 선택자가 있으면 배정, 없고 배정돼있으면 비우기(단, 점유잠금 제외)
  seat.addEventListener("click", (e)=>{
    if(e.target===lockBtn) return; // 아이콘 클릭은 별도
    const sn = parseInt(seat.dataset.seatnum,10);
    const currentId = state.assign[sn];
    if(selectedUnassignedLI){
      const selIdx = Array.from(els.unassignedList.children).indexOf(selectedUnassignedLI);
      if(selIdx>=0){
        const id = state.unassigned[selIdx];
        assignToSeat(sn, id, true);
      }
    }else{
      // 비우기
      if(currentId){
        if(state.occupantLocked.has(sn)) { alert("점유잠금 좌석은 비울 수 없습니다."); return; }
        unassignSeat(sn, true);
      }
    }
  });

  // 드래그오버/드롭
  seat.addEventListener("dragover",(e)=>{
    e.preventDefault();
    seat.classList.add("dragover");
  });
  seat.addEventListener("dragleave",()=> seat.classList.remove("dragover"));
  seat.addEventListener("drop",(e)=>{
    e.preventDefault();
    seat.classList.remove("dragover");
    const id = e.dataTransfer.getData("text/plain");
    if(!id) return;
    const sn = parseInt(seat.dataset.seatnum,10);
    assignToSeat(sn, id, true);
    // 미배정에서 왔다면 해당 li 제거
    const from = e.dataTransfer.getData("from");
    if(from==="unassigned"){
      const idx = parseInt(e.dataTransfer.getData("idx")||"-1",10);
      const li = els.unassignedList.children[idx];
      if(li) li.remove();
    }
    // 선택 해제
    if(selectedUnassignedLI){ selectedUnassignedLI.classList.remove("selected"); selectedUnassignedLI=null; }
  });

  // 🔒 아이콘: 빈좌석이면 비활성 잠금 토글, 배정좌석이면 점유 잠금 토글
  lockBtn.addEventListener("click",(e)=>{
    e.stopPropagation();
    const sn = parseInt(seat.dataset.seatnum,10);
    if(state.assign[sn]){ // 점유잠금
      if(state.occupantLocked.has(sn)) state.occupantLocked.delete(sn);
      else state.occupantLocked.add(sn);
    }else{ // 비활성잠금
      if(state.disabledSeats.has(sn)) state.disabledSeats.delete(sn);
      else state.disabledSeats.add(sn);
    }
    renderAllViews();
  });

  // 우클릭 컨텍스트 메뉴
  seat.addEventListener("contextmenu",(e)=>{
    e.preventDefault();
    openCtxMenu(e.pageX, e.pageY, seat);
  });

  seat.appendChild(label);
  seat.appendChild(info);
  seat.appendChild(lockBtn);
  container.appendChild(seat);
}

function renderView(view, gridEl){
  const N = totalSeats();
  gridEl.innerHTML = "";
  gridEl.dataset.cols = state.cols+"";
  for(let gridIdx=0; gridIdx<N; gridIdx++){
    createSeatEl(view, gridIdx, gridEl);
  }
  // 내용 반영
  Array.from(gridEl.children).forEach(seat=>{
    const sn = parseInt(seat.dataset.seatnum,10);
    const id = state.assign[sn];
    const info = seat.querySelector(".info");
    const idEl = info.querySelector(".id");
    const nmEl = info.querySelector(".nm");
    const disabled = state.disabledSeats.has(sn);
    const locked = state.occupantLocked.has(sn);

    if(id){
      const stu = findStudentById(id);
      idEl.textContent = stu ? stu.id : id;
      nmEl.textContent = stu ? stu.name : "";
      seat.classList.add("filled");
    }else{
      idEl.textContent = "";
      nmEl.textContent = "";
      seat.classList.remove("filled");
    }
    seat.classList.toggle("disabled", disabled);
    seat.classList.toggle("locked", locked);
  });
}

function renderAllViews(){
  mappings = buildMappings();
  const mode = state.viewMode;
  els.viewTop.style.display = (mode==="top"||mode==="both")? "block":"none";
  els.viewBottom.style.display = (mode==="bottom"||mode==="both")? "block":"none";
  renderView("top", els.gridTop);
  renderView("bottom", els.gridBottom);
  renderUnassigned();
  renderNameLockList();
  updateOrderBasisVisibility();
  els.titleDisplay.textContent = state.title || "자리배치표";
}

// ===================== 배정/해제 로직 =====================
function isSeatAvailable(sn){
  if(sn<1 || sn>totalSeats()) return false;
  if(state.disabledSeats.has(sn)) return false;
  return true;
}

function assignToSeat(sn, id, fromUnassigned=false){
  if(!isSeatAvailable(sn)){ alert("비활성 잠금 좌석입니다."); return false; }
  // 이름잠금: 다른 좌석에 잠금되어 있다면 이동 금지
  const lockedSeat = state.nameLock[id];
  if(lockedSeat && lockedSeat !== sn){
    alert(`이름 잠금: ${id}는 좌석 ${lockedSeat}에 고정되어 있습니다.`);
    return false;
  }
  // 해당 좌석이 점유잠금 + 다른 사람이라면 금지
  const cur = state.assign[sn];
  if(cur && cur!==id && state.occupantLocked.has(sn)){
    alert("점유잠금 좌석입니다.");
    return false;
  }
  // 좌석에 기존 인원이 있으면 미배정으로 복귀(단, 점유잠금이면 금지)
  if(cur && cur!==id){
    if(state.occupantLocked.has(sn)){ alert("점유잠금 좌석입니다."); return false; }
    state.unassigned.push(cur);
  }
  // 기존에 배정돼있던 좌석에서 id 제거
  for(const seat in state.assign){
    if(state.assign[seat]===id && parseInt(seat,10)!==sn){
      state.assign[seat]=null;
    }
  }
  state.assign[sn] = id;
  if(fromUnassigned){
    const idx = state.unassigned.indexOf(id);
    if(idx>=0) state.unassigned.splice(idx,1);
  }
  renderAllViews();
  return true;
}

function unassignSeat(sn, pushToUnassigned=false){
  const cur = state.assign[sn];
  if(!cur) return;
  if(state.occupantLocked.has(sn)){ alert("점유잠금 좌석은 해제할 수 없습니다."); return; }
  state.assign[sn] = null;
  if(pushToUnassigned) state.unassigned.push(cur);
  renderAllViews();
}

// ===================== 자동 배치 =====================
function collectAssignableSeats(){
  const N = totalSeats();
  const seats = [];
  for(let i=1;i<=N;i++){
    if(isSeatAvailable(i) && !state.occupantLocked.has(i)) seats.push(i);
  }
  return seats;
}

function orderStudentsList(source){
  // source: "all" | "unassigned"
  let ids = source==="all" ? state.students.map(s=>s.id) : state.unassigned.slice();
  // 이름잠금 적용: 잠금된 대상은 먼저 고정
  const lockedPairs = [];
  for(const id of ids){
    const sn = state.nameLock[id];
    if(sn) lockedPairs.push([id,sn]);
  }
  // 고정 우선 배치
  lockedPairs.forEach(([id, sn])=>{
    if(isSeatAvailable(sn)){
      assignToSeat(sn, id, true);
    }
  });
  // 나머지
  ids = ids.filter(id=> state.assignSeatOf?.(id) ? false : !isAlreadyAssigned(id));
  // 정렬 기준
  if(state.autoMode==="order"){
    if(state.orderBasis==="id"){
      ids.sort((a,b)=> (a+"").localeCompare(b+"",undefined, {numeric:true}));
    }else if(state.orderBasis==="name"){
      const arr = ids.map(id=> findStudentById(id)).filter(Boolean);
      arr.sort((s1,s2)=> collateNameAsc(s1.name, s2.name));
      ids = arr.map(s=>s.id);
    }else{ // input
      const order = state.studentsOrder.slice();
      ids.sort((a,b)=> order.indexOf(a)-order.indexOf(b));
    }
  }else if(state.autoMode==="random"){
    // shuffle
    for(let i=ids.length-1; i>0; i--){
      const j = Math.floor(Math.random()*(i+1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  }
  return ids;
}

function isAlreadyAssigned(id){
  return Object.values(state.assign).includes(id);
}

function autoFillEmpty(){
  // 이름잠금 먼저 자리 잡도록 한 번 처리
  for(const [id, sn] of Object.entries(state.nameLock)){
    if(state.assign[sn]!==id) assignToSeat(sn, id, true);
  }
  const seats = collectAssignableSeats().filter(sn => !state.assign[sn]);
  const ids = orderStudentsList("unassigned");
  const take = Math.min(seats.length, ids.length);
  for(let i=0;i<take;i++){
    assignToSeat(seats[i], ids[i], true);
  }
}

function autoFillAll(){
  // 잠금 좌석/점유좌석 제외하고 모두 비우기
  const N = totalSeats();
  for(let sn=1; sn<=N; sn++){
    if(state.assign[sn] && !state.occupantLocked.has(sn)){
      unassignSeat(sn, true);
    }
  }
  // 이름잠금 먼저 적용
  for(const [id, sn] of Object.entries(state.nameLock)){
    if(isSeatAvailable(sn)) assignToSeat(sn, id, true);
  }
  // 나머지 전체 배치
  const seats = collectAssignableSeats();
  const ids = orderStudentsList("all")
    .filter(id => !isAlreadyAssigned(id));
  const take = Math.min(seats.length, ids.length);
  for(let i=0;i<take;i++){
    assignToSeat(seats[i], ids[i], true);
  }
}

// ===================== 컨텍스트 메뉴 =====================
let ctxTargetSeat = null;

function openCtxMenu(x, y, seatEl){
  ctxTargetSeat = seatEl;
  els.ctxMenu.style.left = x+"px";
  els.ctxMenu.style.top = y+"px";
  els.ctxMenu.style.display = "block";
}

function closeCtxMenu(){
  els.ctxMenu.style.display = "none";
  ctxTargetSeat = null;
}

els.ctxMenu.addEventListener("click",(e)=>{
  const act = e.target.getAttribute("data-act");
  if(!act || !ctxTargetSeat) return;
  const sn = parseInt(ctxTargetSeat.dataset.seatnum,10);
  if(act==="toggleDisabled"){
    if(state.assign[sn]){ alert("배정된 좌석은 비활성잠금으로 전환할 수 없습니다. 먼저 비우세요."); }
    else{
      if(state.disabledSeats.has(sn)) state.disabledSeats.delete(sn);
      else state.disabledSeats.add(sn);
      renderAllViews();
    }
  }else if(act==="toggleOccupantLock"){
    if(!state.assign[sn]){ alert("배정된 좌석이 아닙니다."); }
    else{
      if(state.occupantLocked.has(sn)) state.occupantLocked.delete(sn);
      else state.occupantLocked.add(sn);
      renderAllViews();
    }
  }else if(act==="clearSeat"){
    if(state.occupantLocked.has(sn)){ alert("점유잠금 좌석은 비울 수 없습니다."); }
    else unassignSeat(sn, true);
  }
  closeCtxMenu();
});

document.addEventListener("click", (e)=>{
  if(e.target.closest("#ctxMenu")) return;
  closeCtxMenu();
});
document.addEventListener("scroll", closeCtxMenu);

// ===================== 제목/명단/잠금 UI =====================
els.applyTitleBtn.addEventListener("click", ()=>{
  state.title = els.titleInput.value.trim() || "자리배치표";
  renderAllViews();
});

els.applyNamesBtn.addEventListener("click", ()=>{
  const {students, order} = parseNames(els.namesInput.value);
  state.students = students;
  state.studentsOrder = order;
  // 전체 리셋: (이름잠금/좌석잠금은 유지)
  state.unassigned = students.map(s=>s.id);
  for(const k in state.assign) state.assign[k]=null;
  renderAllViews();
  alert("명단을 반영했습니다. (잠금 상태는 유지됩니다)");
});

els.clearAllBtn.addEventListener("click", ()=>{
  // 점유잠금 제외 모두 비우고 미배정으로 복귀
  const N = totalSeats();
  for(let sn=1; sn<=N; sn++){
    if(state.assign[sn] && !state.occupantLocked.has(sn)){
      unassignSeat(sn, true);
    }
  }
  renderAllViews();
});

// 이름 잠금
els.addNameLockBtn.addEventListener("click", ()=>{
  const id = els.lockIdInput.value.trim();
  const seat = parseInt(els.lockSeatInput.value,10);
  if(!id) return alert("학번을 입력하세요.");
  if(!findStudentById(id)) return alert("명단에 없는 학번입니다.");
  if(!Number.isInteger(seat) || seat<1 || seat>totalSeats()) return alert("올바른 좌석번호를 입력하세요.");
  // 좌석이 비활성잠금이면 불가
  if(state.disabledSeats.has(seat)) return alert("비활성 잠금 좌석에는 이름 잠금을 설정할 수 없습니다.");
  state.nameLock[id] = seat;
  renderAllViews();
});

els.removeNameLockBtn.addEventListener("click", ()=>{
  const id = els.lockIdInput.value.trim();
  if(!id) return alert("학번을 입력하세요.");
  if(state.nameLock[id]) delete state.nameLock[id];
  renderAllViews();
});

// ===================== 옵션/인쇄/저장 =====================
els.gridSizeSelect.addEventListener("change", ()=>{
  const v = els.gridSizeSelect.value;
  if(v==="6x6"){ state.rows=6; state.cols=6; }
  else { state.rows=6; state.cols=5; }
  ensureAssignSlots();
  renderAllViews();
});

els.viewModeSelect.addEventListener("change", ()=>{
  state.viewMode = els.viewModeSelect.value;
  renderAllViews();
});

els.autoModeSelect.addEventListener("change", ()=>{
  state.autoMode = els.autoModeSelect.value;
  updateOrderBasisVisibility();
});

function updateOrderBasisVisibility(){
  els.orderBasisRow.style.display = state.autoMode==="order" ? "flex" : "none";
}

els.orderBasisSelect.addEventListener("change", ()=>{
  state.orderBasis = els.orderBasisSelect.value;
});

els.autoFillEmptyBtn.addEventListener("click", autoFillEmpty);
els.autoFillAllBtn.addEventListener("click", autoFillAll);

// 인쇄
els.printBothCheckbox.addEventListener("change", ()=>{
  els.body.classList.toggle("print-both", els.printBothCheckbox.checked);
});
els.printBtn.addEventListener("click", ()=>{ window.print(); });

// 저장/불러오기/내보내기/가져오기
els.saveBtn.addEventListener("click", ()=>{
  const payload = {
    ...state,
    // Set → Array 직렬화
    disabledSeats: Array.from(state.disabledSeats),
    occupantLocked: Array.from(state.occupantLocked),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  alert("저장되었습니다.");
});

els.loadBtn.addEventListener("click", ()=>{
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return alert("저장된 데이터가 없습니다.");
  try{
    const data = JSON.parse(raw);
    Object.assign(state, data);
    state.disabledSeats = new Set(data.disabledSeats||[]);
    state.occupantLocked = new Set(data.occupantLocked||[]);
    ensureAssignSlots();
    renderAllViews();
    alert("불러오기 완료");
  }catch(e){
    console.error(e); alert("불러오기에 실패했습니다.");
  }
});

els.exportBtn.addEventListener("click", ()=>{
  const payload = {
    ...state,
    disabledSeats: Array.from(state.disabledSeats),
    occupantLocked: Array.from(state.occupantLocked),
  };
  const blob = new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "seatmap.json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

els.importInput.addEventListener("change", (e)=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      Object.assign(state, data);
      state.disabledSeats = new Set(data.disabledSeats||[]);
      state.occupantLocked = new Set(data.occupantLocked||[]);
      ensureAssignSlots();
      renderAllViews();
      alert("가져오기 완료");
    }catch(err){
      console.error(err); alert("JSON 형식이 올바르지 않습니다.");
    }
  };
  reader.readAsText(file, "utf-8");
  e.target.value = "";
});

// 유틸: 특정 id가 현재 어느 좌석인지
state.assignSeatOf = function(id){
  for(const k in state.assign){ if(state.assign[k]===id) return parseInt(k,10); }
  return null;
};

// 초기화
(function init(){
  ensureAssignSlots();
  renderAllViews();
})();

/* =========================
   VIP Orders Tracker (GitHub Pages) - FINAL
   - No Apps Script
   - Reads Google Sheets via CSV
   - Shows errors inside page (no white screen)
   ========================= */

const FILE_ID = "1HfDubrlG9a2kM89GK4BRQ5hZI_X3oE4RYn86dT1fZmA";
const GIDS = {
  STOCK: 0,
  ORDERS: 743878492,
  OUT: 965988266,
  USERS: 658369520,
};

// ✅ gviz CSV (الأكثر ثباتاً)
const CSV = {
  STOCK: `https://docs.google.com/spreadsheets/d/${FILE_ID}/gviz/tq?tqx=out:csv&gid=${GIDS.STOCK}`,
  ORDERS:`https://docs.google.com/spreadsheets/d/${FILE_ID}/gviz/tq?tqx=out:csv&gid=${GIDS.ORDERS}`,
  OUT:   `https://docs.google.com/spreadsheets/d/${FILE_ID}/gviz/tq?tqx=out:csv&gid=${GIDS.OUT}`,
  USERS: `https://docs.google.com/spreadsheets/d/${FILE_ID}/gviz/tq?tqx=out:csv&gid=${GIDS.USERS}`,
};

const APP = {
  whatsappNumber: "",   // مثال: "201229202030" (بدون +)
  autoRefreshMs: 30000,
  maxSearchResults: 50,
  storageKey: "vip_orders_tracker_cache_v1",
};

const $ = (id)=>document.getElementById(id);
const esc = (s)=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const unesc = (s)=>String(s||"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const norm = (v)=>String(v??"").replace(/^\uFEFF/,"").trim();
const toNum = (v)=>{ const n = Number(String(v??"").replace(/[^\d.-]/g,"")); return isNaN(n)?0:n; };
const pad2 = (x)=>String(x).padStart(2,"0");
const todayStr = ()=>{ const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };

function setLoading(on){ const b=$("loadingBox"); if(b) b.classList.toggle("hide", !on); }

function bootStatus(text, type){
  const el=$("bootStatus");
  if(!el) return;
  el.className = "boot-status " + (type||"");
  el.textContent = text || "";
}

function showFatal(msg, details){
  try{
    if($("loginBox")) $("loginBox").classList.add("hide");
    if($("dash")) $("dash").classList.remove("hide");
    const cards=$("cards");
    if(cards){
      cards.innerHTML = `
        <div class="card red">
          <b>⚠️ مشكلة في التحميل</b>
          <div style="margin-top:8px;line-height:1.7">${esc(msg||"")}</div>
          <div style="margin-top:8px;font-size:12px;opacity:.8">${esc(details||"")}</div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <button class="nav-btn" style="flex:1" onclick="location.reload()">🔄 إعادة المحاولة</button>
            <button class="nav-btn" style="flex:1" onclick="window.__clearCache__()">🧹 تفريغ الكاش</button>
          </div>
          <div style="margin-top:10px;font-size:12px;opacity:.85">
            ✅ تأكد أن ملف Google Sheet: مشاركة "أي شخص لديه الرابط" = Viewer + Publish to web.
          </div>
        </div>`;
    }
  }catch(_){}
}

/** CSV parser robust */
function parseCSV(text){
  const rows=[]; let row=[]; let cur=""; let inQ=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch === '"'){
      if(inQ && text[i+1] === '"'){ cur+='"'; i++; }
      else inQ = !inQ;
      continue;
    }
    if(!inQ && (ch===',' || ch==='\n' || ch==='\r')){
      if(ch==='\r') continue;
      row.push(cur); cur="";
      if(ch==='\n'){
        const empty=row.every(c=>String(c).trim()==="");
        if(!empty) rows.push(row);
        row=[];
      }
      continue;
    }
    cur+=ch;
  }
  row.push(cur);
  const empty=row.every(c=>String(c).trim()==="");
  if(!empty) rows.push(row);
  return rows;
}

async function fetchCSV(url){
  const u = url + (url.includes("?")?"&":"?") + "v=" + Date.now();
  const resp = await fetch(u, { cache:"no-store", mode:"cors" });
  if(!resp.ok) throw new Error(`CSV HTTP ${resp.status}`);
  const txt = await resp.text();
  const rows = parseCSV(txt);
  if(!rows || rows.length < 2) throw new Error("CSV فارغ أو غير صالح");
  return rows;
}

function headerMap(hdr){
  const map={};
  hdr.forEach((h,i)=>{ const k=norm(h); if(k) map[k]=i; });
  return map;
}
function findCol(hmap, candidates){
  for(const c of candidates){ if(Object.prototype.hasOwnProperty.call(hmap,c)) return hmap[c]; }
  return -1;
}
function colOr(idx, key, fallback){
  const v=idx[key];
  return (typeof v==="number" && v>=0) ? v : fallback;
}

/** Column candidates */
const ORDER_COLS = {
  invoice: ["رقم الفاتورة","الفاتورة","رقم"],
  date: ["التاريخ","تاريخ"],
  client: ["اسم العميل","العميل","اسم الزبون","الزبون"],
  model: ["الموديل","رقم الموديل","رمز الصنف","كود الصنف","الصنف"],
  qty: ["الكمية المطلوبة","الكمية","كمية","المطلوب"],
};
const OUT_COLS = {
  invoice: ["رقم الفاتورة","الفاتورة","رقم"],
  date: ["التاريخ","تاريخ"],
  client: ["اسم العميل","العميل","اسم الزبون","الزبون"],
  model: ["الموديل","رقم الموديل","رمز الصنف","كود الصنف","الصنف"],
  qty: ["الكميه المسلمه","الكمية المسلمة","الكمية","كمية","المسلم"],
};
const STOCK_COLS = {
  model: ["الموديل","رقم الموديل","رمز الصنف","كود الصنف","الصنف"],
  qty: ["الكميه","الكمية","كمية","المخزون","متاح"],
};
const USER_COLS = {
  user: ["اسم المستخدم","يوزر","User","Username"],
  pass: ["كلمة المرور","باسورد","Pass","Password"],
  role: ["الصلاحية","Role","الوظيفة"],
};

let readyFilter=false;
let autoTimer=null;
let deferredInstallPrompt=null;

const STATE = {
  users: [],
  stock: null,
  orders: null,
  out: null,
};

/** Cache */
function saveCache(){
  try{
    const payload = {
      t: Date.now(),
      users: STATE.users,
      stock: STATE.stock,
      orders: {
        ordersByClientModel: Array.from(STATE.orders.ordersByClientModel.entries()).map(([c,m])=>[c, Array.from(m.entries())]),
        invoicesByClient: Array.from(STATE.orders.invoicesByClient.entries()).map(([c,s])=>[c, Array.from(s.values())]),
        totalRequiredByClient: Array.from(STATE.orders.totalRequiredByClient.entries()),
      },
      out: {
        deliveredByClientModel: Array.from(STATE.out.deliveredByClientModel.entries()).map(([c,m])=>[c, Array.from(m.entries())]),
        totalDeliveredByClient: Array.from(STATE.out.totalDeliveredByClient.entries()),
      }
    };
    localStorage.setItem(APP.storageKey, JSON.stringify(payload));
  }catch(_){}
}
function loadCache(){
  try{
    const raw = localStorage.getItem(APP.storageKey);
    if(!raw) return false;
    const p = JSON.parse(raw);
    if(!p || !p.t) return false;

    STATE.users = p.users || [];
    STATE.stock = p.stock || null;

    const o = p.orders || {};
    STATE.orders = {
      ordersByClientModel: new Map((o.ordersByClientModel||[]).map(([c,arr])=>[c, new Map(arr)])),
      invoicesByClient: new Map((o.invoicesByClient||[]).map(([c,arr])=>[c, new Set(arr)])),
      totalRequiredByClient: new Map(o.totalRequiredByClient||[]),
    };

    const out = p.out || {};
    STATE.out = {
      deliveredByClientModel: new Map((out.deliveredByClientModel||[]).map(([c,arr])=>[c, new Map(arr)])),
      totalDeliveredByClient: new Map(out.totalDeliveredByClient||[]),
    };

    return true;
  }catch(_){ return false; }
}

window.__clearCache__ = function(){
  try{ localStorage.removeItem(APP.storageKey); }catch(_){}
  alert("تم تفريغ الكاش ✅ افتح الموقع مرة ثانية");
};

/** Builders */
function buildUsers(rows){
  const clean = (s)=>norm(String(s||""));
  const hdr=(rows[0]||[]).map(clean);
  const hmap=headerMap(hdr);
  const idx = {
    user: findCol(hmap, USER_COLS.user),
    pass: findCol(hmap, USER_COLS.pass),
    role: findCol(hmap, USER_COLS.role),
  };
  const cUser = (idx.user>=0)?idx.user:0;
  const cPass = (idx.pass>=0)?idx.pass:1;
  const cRole = (idx.role>=0)?idx.role:2;

  const users=[];
  for(const r of rows.slice(1)){
    const u=clean(r[cUser]);
    const p=clean(r[cPass]);
    if(!u || !p) continue;
    users.push({ user:u, pass:p, role: clean(r[cRole]) });
  }
  return users;
}

function buildStock(rows){
  const hdr=rows[0].map(norm);
  const hmap=headerMap(hdr);
  const idx={ model: findCol(hmap, STOCK_COLS.model), qty: findCol(hmap, STOCK_COLS.qty) };
  const cModel=colOr(idx,"model",0);
  const cQty=colOr(idx,"qty",2);

  const stockSet=new Set();
  const stockQty=new Map();

  for(const r of rows.slice(1)){
    const model=norm(r[cModel]);
    if(!model) continue;
    stockSet.add(model);
    const q=toNum(r[cQty]);
    stockQty.set(model, (stockQty.get(model)||0) + (q||0));
  }
  return { stockSet, stockQty };
}

function buildOrders(rows){
  const hdr=rows[0].map(norm);
  const hmap=headerMap(hdr);
  const idx={
    invoice: findCol(hmap, ORDER_COLS.invoice),
    date: findCol(hmap, ORDER_COLS.date),
    client: findCol(hmap, ORDER_COLS.client),
    model: findCol(hmap, ORDER_COLS.model),
    qty: findCol(hmap, ORDER_COLS.qty),
  };
  const cInv=colOr(idx,"invoice",0);
  const cClient=colOr(idx,"client",2);
  const cModel=colOr(idx,"model",3);
  const cQty=colOr(idx,"qty",4);

  const ordersByClientModel=new Map();
  const invoicesByClient=new Map();
  const totalRequiredByClient=new Map();

  for(const r of rows.slice(1)){
    const client=norm(r[cClient]);
    const model=norm(r[cModel]);
    const qty=toNum(r[cQty]);
    const inv=norm(r[cInv]);
    if(!client || !model || qty<=0) continue;

    if(!ordersByClientModel.has(client)) ordersByClientModel.set(client, new Map());
    const mm=ordersByClientModel.get(client);
    mm.set(model, (mm.get(model)||0)+qty);

    totalRequiredByClient.set(client, (totalRequiredByClient.get(client)||0)+qty);

    if(inv){
      if(!invoicesByClient.has(client)) invoicesByClient.set(client, new Set());
      invoicesByClient.get(client).add(inv);
    }
  }

  return { ordersByClientModel, invoicesByClient, totalRequiredByClient };
}

function buildOut(rows){
  const hdr=rows[0].map(norm);
  const hmap=headerMap(hdr);
  const idx={
    client: findCol(hmap, OUT_COLS.client),
    model: findCol(hmap, OUT_COLS.model),
    qty: findCol(hmap, OUT_COLS.qty),
  };
  const cClient=colOr(idx,"client",2);
  const cModel=colOr(idx,"model",3);
  const cQty=colOr(idx,"qty",4);

  const deliveredByClientModel=new Map();
  const totalDeliveredByClient=new Map();

  for(const r of rows.slice(1)){
    const client=norm(r[cClient]);
    const model=norm(r[cModel]);
    const qty=toNum(r[cQty]);
    if(!client || !model || qty<=0) continue;

    if(!deliveredByClientModel.has(client)) deliveredByClientModel.set(client, new Map());
    const mm=deliveredByClientModel.get(client);
    mm.set(model, (mm.get(model)||0)+qty);

    totalDeliveredByClient.set(client, (totalDeliveredByClient.get(client)||0)+qty);
  }

  return { deliveredByClientModel, totalDeliveredByClient };
}

async function loadAll(){
  const [usersRows, stockRows, ordersRows, outRows] = await Promise.all([
    fetchCSV(CSV.USERS),
    fetchCSV(CSV.STOCK),
    fetchCSV(CSV.ORDERS),
    fetchCSV(CSV.OUT),
  ]);
  STATE.users = buildUsers(usersRows);
  STATE.stock = buildStock(stockRows);
  STATE.orders = buildOrders(ordersRows);
  STATE.out = buildOut(outRows);
  saveCache();
}

/** Business */
function computeDashboardClients(readyOnly){
  const { stockSet, stockQty } = STATE.stock;
  const { ordersByClientModel, invoicesByClient, totalRequiredByClient } = STATE.orders;
  const { deliveredByClientModel, totalDeliveredByClient } = STATE.out;

  const result=[];
  ordersByClientModel.forEach((modelsMap, client)=>{
    const requiredAll = totalRequiredByClient.get(client)||0;
    const deliveredAll = totalDeliveredByClient.get(client)||0;
    const remainingAll = Math.max(0, requiredAll - deliveredAll);

    let readyRequired=0, readyDelivered=0, readyRemaining=0;
    const readyModels=[];

    modelsMap.forEach((req, model)=>{
      const del = (deliveredByClientModel.get(client)?.get(model)) || 0;
      const rem = Math.max(0, req - del);
      if(rem<=0) return;

      const inStock = stockSet.has(model);
      const qtyInStock = (stockQty.get(model)||0);
      const ok = inStock && qtyInStock>0;

      if(ok){
        readyRequired += req;
        readyDelivered += del;
        readyRemaining += rem;
        readyModels.push(model);
      }
    });

    if(readyOnly){
      if(readyModels.length===0) return;
      const status = readyDelivered===0 ? "لم يبدأ" : (readyRemaining>0 ? "جزئي" : "مكتمل");
      result.push({
        client, required: readyRequired, delivered: readyDelivered, remaining: readyRemaining,
        status, invoices: Array.from(invoicesByClient.get(client)||[]).join(", "), readyModels
      });
    }else{
      const status = deliveredAll===0 ? "لم يبدأ" : (remainingAll>0 ? "جزئي" : "مكتمل");
      result.push({
        client, required: requiredAll, delivered: deliveredAll, remaining: remainingAll,
        status, invoices: Array.from(invoicesByClient.get(client)||[]).join(", "), readyModels
      });
    }
  });

  return result.sort((a,b)=>(b.remaining||0)-(a.remaining||0));
}

function computeClientModels(client, readyOnly){
  const c=norm(client);
  if(!c) return [];
  const { stockSet, stockQty } = STATE.stock;
  const { ordersByClientModel } = STATE.orders;
  const { deliveredByClientModel } = STATE.out;

  const modelsMap = ordersByClientModel.get(c);
  if(!modelsMap) return [];

  const res=[];
  modelsMap.forEach((req, model)=>{
    const del = (deliveredByClientModel.get(c)?.get(model)) || 0;
    const rem = Math.max(0, req - del);
    if(rem<=0) return;

    const inStock = stockSet.has(model);
    const qtyInStock = (stockQty.get(model)||0);

    if(readyOnly && (!inStock || qtyInStock<=0)) return;
    res.push({ model, required:req, delivered:del, remaining:rem, stockQty: qtyInStock, stockStatus: (inStock && qtyInStock>0) ? "متاح" : "غير متوفر" });
  });

  return res.sort((a,b)=>(b.remaining||0)-(a.remaining||0));
}

function searchReadyClients(keyword){
  const k=norm(keyword).toLowerCase();
  if(!k) return [];
  const readyClients = computeDashboardClients(true).map(x=>x.client);
  return readyClients.filter(n=>norm(n).toLowerCase().includes(k)).slice(0, APP.maxSearchResults);
}

/** UI rendering */
function showSection(name){
  document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));
  $(name).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
  if(name==="clients") $("navClients").classList.add("active");
  if(name==="search") $("navSearch").classList.add("active");
  if(name==="models") $("navModels").classList.add("active");

  if(name==="models") renderModelsPrefix();
}

function setReadyFilter(val){
  readyFilter=!!val;
  $("btnAll").classList.toggle("active", !readyFilter);
  $("btnReady").classList.toggle("active", readyFilter);
  $("statusLine").textContent = readyFilter ? "عرض: العملاء الجاهزين (متبقي غير مسلم + الموديل موجود بالمخزون)" : "عرض: كل العملاء";
  renderDashboard();
}

function renderDashboard(){
  const cards=$("cards");
  cards.innerHTML="";
  const data=computeDashboardClients(!!readyFilter);

  if(data.length===0){
    cards.innerHTML = `<div class="empty-state">لا توجد بيانات للعرض حالياً</div>`;
    return;
  }

  const totals = data.reduce((acc,c)=>{
    acc.clients += 1;
    acc.required += Number(c.required||0);
    acc.delivered += Number(c.delivered||0);
    acc.remaining += Number(c.remaining||0);
    acc.readyModels += Array.isArray(c.readyModels) ? c.readyModels.length : 0;
    return acc;
  }, {clients:0, required:0, delivered:0, remaining:0, readyModels:0});

  cards.innerHTML = `
    <div class="clients-hero">
      <div class="clients-hero-title">لوحة العملاء</div>
      <div class="clients-hero-sub">عرض أسرع وأوضح للموبايل مع بطاقات مرتبة، أزرار أكبر، وإحصائيات مباشرة تساعدك على متابعة التسليم فوراً.</div>
    </div>
    <div class="app-overview">
      <div class="overview-card"><div class="overview-label">عدد العملاء</div><div class="overview-value">${esc(totals.clients)}</div><div class="overview-sub">عميل ظاهر الآن</div></div>
      <div class="overview-card"><div class="overview-label">إجمالي المطلوب</div><div class="overview-value">${esc(totals.required)}</div><div class="overview-sub">كل الكميات المطلوبة</div></div>
      <div class="overview-card"><div class="overview-label">إجمالي المسلم</div><div class="overview-value">${esc(totals.delivered)}</div><div class="overview-sub">تم تسليمه للعملاء</div></div>
      <div class="overview-card"><div class="overview-label">إجمالي المتبقي</div><div class="overview-value">${esc(totals.remaining)}</div><div class="overview-sub">جاهز للمتابعة</div></div>
    </div>
    <div class="card-list"></div>`;

  const list = cards.querySelector('.card-list');

  data.forEach(c=>{
    const cls = (c.status==="مكتمل") ? "green" : (c.status==="جزئي") ? "orange" : "red";
    const clientSafe = esc(c.client);
    const readyCount = Array.isArray(c.readyModels) ? c.readyModels.length : 0;
    list.innerHTML += `
      <div class="card ${cls}">
        <div class="client-card">
          <div>
            <div class="client-card-name" onclick="window.__showClient__('${clientSafe}')">${clientSafe}</div>
            <div class="client-card-stats">
              <span class="client-mini">المطلوب: ${esc(c.required)}</span>
              <span class="client-mini">المسلم: ${esc(c.delivered)}</span>
              <span class="client-mini">المتبقي: ${esc(c.remaining)}</span>
              <span class="client-mini">الحالة: ${esc(c.status)}</span>
              ${readyCount ? `<span class="client-mini">المتاح الآن: ${esc(readyCount)} موديل</span>` : ''}
            </div>
          </div>
          <button class="nav-btn" style="max-width:180px" onclick="window.__showClient__('${clientSafe}')">فتح الطلبية</button>
        </div>
      </div>`;
  });
}

function stepQty(modelEsc, delta, max){
  const model = unesc(modelEsc);
  let target=null;
  document.querySelectorAll("input[data-model]").forEach(inp=>{
    if(norm(inp.getAttribute("data-model"))===model) target=inp;
  });
  if(!target) return;
  let v=toNum(target.value);
  v += delta;
  if(v<0) v=0;
  if(v>max) v=max;
  target.value=v;
}

function getSelectedItems(){
  const items=[];
  document.querySelectorAll("input[data-model]").forEach(inp=>{
    const qty=toNum(inp.value);
    if(qty>0) items.push({ model: unesc(inp.getAttribute("data-model")), qty });
  });
  return items;
}

function copyOutRows(clientEsc){
  const client=unesc(clientEsc);
  const items=getSelectedItems();
  if(items.length===0) return alert("حدد كمية للتسليم أولاً");

  const lines = items.map(it=>["تسليم", todayStr(), client, it.model, it.qty].join(","));
  const txt = lines.join("\n");

  $("copyBox").classList.remove("hide");
  $("copyArea").value = txt;
  $("copyBox").scrollIntoView({behavior:"smooth", block:"start"});
}

function copyTextNow(){
  const area=$("copyArea");
  area.select(); area.setSelectionRange(0, area.value.length);
  try{ document.execCommand("copy"); alert("تم النسخ ✅"); }
  catch(_){ alert("انسخ يدويًا من المربع"); }
}

function sendWhatsApp(clientEsc){
  const client=unesc(clientEsc);
  const items=getSelectedItems();
  if(items.length===0) return alert("حدد كمية للتسليم أولاً");

  let msg = `تأكيد تسليم ✅\nالعميل: ${client}\nالتاريخ: ${todayStr()}\n\nتفاصيل التسليم:\n`;
  items.forEach((it,i)=>{ msg += `${i+1}) ${it.model} — ${it.qty}\n`; });
  msg += `\nشكراً لتعاملكم معنا.`;

  const phone=(APP.whatsappNumber||"").trim();
  const url = phone ? `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(msg)}`
                    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank");
}

function backToList(){ renderDashboard(); }

function installApp(){
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(()=>{ deferredInstallPrompt=null; toggleInstallBox(false); });
    return;
  }
  alert('للتثبيت من الموبايل: افتح المتصفح ثم اختر "إضافة إلى الشاشة الرئيسية" أو "Install app".');
}

function toggleInstallBox(show){
  const box=$("installBox");
  if(!box) return;
  box.classList.toggle("hide", !show);
}

function registerPWA(){
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", ()=>{
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    });
  }

  window.addEventListener("beforeinstallprompt", (e)=>{
    e.preventDefault();
    deferredInstallPrompt = e;
    toggleInstallBox(true);
  });

  window.addEventListener("appinstalled", ()=>{
    deferredInstallPrompt = null;
    toggleInstallBox(false);
  });
}

function showClient(clientEsc){
  const client=unesc(clientEsc);
  setLoading(true);

  const models=computeClientModels(client, !!readyFilter);
  const totalRequired = models.reduce((a,m)=>a+Number(m.required||0),0);
  const totalDelivered = models.reduce((a,m)=>a+Number(m.delivered||0),0);
  const totalRemaining = models.reduce((a,m)=>a+Number(m.remaining||0),0);
  let html = `<div class="card printable">
    <div class="client-head">
      <div>
        <h3>${esc(client)}</h3>
        <div class="client-subtitle">واجهة محسّنة للموبايل. يمكنك إدخال كميات التسليم بسهولة ثم النسخ أو الطباعة أو الإرسال واتساب.</div>
      </div>
      <button class="action-btn action-back" onclick="window.__backToList__()">⬅️ رجوع</button>
    </div>

    <div class="summary-strip">
      <div class="summary-chip">المطلوب<b>${esc(totalRequired)}</b></div>
      <div class="summary-chip">المسلم<b>${esc(totalDelivered)}</b></div>
      <div class="summary-chip">المتبقي<b>${esc(totalRemaining)}</b></div>
    </div>

    <div class="table-wrap">
      <table>
        <tr>
          <th>موديل</th><th>المطلوب</th><th>المسلم</th><th>المتبقي</th><th>تسليم</th><th>+ / -</th>
        </tr>`;

  models.forEach(m=>{
    const inStock = Number(m.stockQty||0) > 0;
    const stockLabel = inStock
      ? '<span class="status-pill available">متاح</span>'
      : '<span class="status-pill unavailable">غير متوفر</span>' ;
    const maxQty = Number(Math.min(m.remaining, m.stockQty||0));
    html += `<tr>
      <td>
        <div>${esc(m.model)}</div>
        ${stockLabel}
        <div class="stock-note">المتوفر بالمخزن: ${esc(m.stockQty||0)}</div>
      </td>
      <td>${esc(m.required)}</td>
      <td>${esc(m.delivered)}</td>
      <td>${esc(m.remaining)}</td>
      <td><input class="qty-input" type="number" min="0" max="${esc(maxQty)}" value="0" data-model="${esc(m.model)}" ${inStock ? '' : 'disabled'}></td>
      <td style="white-space:nowrap">
        <button class="qty-btn" onclick="window.__stepQty__('${esc(m.model)}',1,${maxQty})" ${inStock ? '' : 'disabled'}>+</button>
        <button class="qty-btn minus" onclick="window.__stepQty__('${esc(m.model)}',-1,${maxQty})" ${inStock ? '' : 'disabled'}>-</button>
      </td>
    </tr>`;
  });

  html += `</table></div>

    <div class="model-grid">`;

  models.forEach(m=>{
    const inStock = Number(m.stockQty||0) > 0;
    const stockLabel = inStock
      ? '<span class="status-pill available">متاح</span>'
      : '<span class="status-pill unavailable">غير متوفر</span>' ;
    const maxQty = Number(Math.min(m.remaining, m.stockQty||0));
    html += `<div class="model-card">
      <div class="model-card-top">
        <div>
          <div class="model-name">${esc(m.model)}</div>
          ${stockLabel}
        </div>
        <div class="stock-note">المتوفر بالمخزن: ${esc(m.stockQty||0)}</div>
      </div>
      <div class="model-stats">
        <div class="model-stat">المطلوب<b>${esc(m.required)}</b></div>
        <div class="model-stat">المسلم<b>${esc(m.delivered)}</b></div>
        <div class="model-stat">المتبقي<b>${esc(m.remaining)}</b></div>
      </div>
      <div class="delivery-box">
        <input class="qty-input" type="number" min="0" max="${esc(maxQty)}" value="0" data-model="${esc(m.model)}" ${inStock ? '' : 'disabled'}>
        <div class="qty-controls">
          <button class="qty-btn" onclick="window.__stepQty__('${esc(m.model)}',1,${maxQty})" ${inStock ? '' : 'disabled'}>+</button>
          <button class="qty-btn minus" onclick="window.__stepQty__('${esc(m.model)}',-1,${maxQty})" ${inStock ? '' : 'disabled'}>-</button>
        </div>
      </div>
    </div>`;
  });

  html += `</div>

    <div class="client-actions">
      <button class="action-btn action-copy" onclick="window.__copyOutRows__('${esc(client)}')">📋 نسخ سطور الصادر</button>
      <button class="action-btn action-wa" onclick="window.__sendWhatsApp__('${esc(client)}')">💬 إرسال واتساب</button>
      <button class="action-btn action-print" onclick="window.print()">🖨️ طباعة</button>
    </div>

    <div id="copyBox" class="card hide" style="margin-top:12px;background:#f7f9fc">
      <b>انسخ والصق في شيت الصادر</b>
      <textarea id="copyArea" style="width:100%;height:160px;margin-top:8px;border-radius:14px;padding:12px;border:1px solid #ccd7e6;direction:rtl"></textarea>
      <button class="action-btn action-copy" style="width:100%;margin-top:8px" onclick="window.__copyTextNow__()">✅ نسخ الآن</button>
      <div style="font-size:12px;opacity:.8;margin-top:6px">الصيغة: رقم الفاتورة, التاريخ, اسم العميل, الموديل, الكمية</div>
    </div>
  </div>`;

  $("cards").innerHTML = html;
  setLoading(false);
}

/** Models prefix report */
function modelsByPrefix(){
  const { ordersByClientModel } = STATE.orders;
  const data={};

  ordersByClientModel.forEach((modelsMap, client)=>{
    modelsMap.forEach((qty, model)=>{
      if(!model) return;
      const num=Number(model);
      const prefix = (!isNaN(num) && num < 1000) ? model.substring(0,1) : model.substring(0,2);

      if(!data[prefix]) data[prefix]={};
      if(!data[prefix][model]) data[prefix][model]={ total:0, clients:[] };

      data[prefix][model].total += qty;
      data[prefix][model].clients.push({ client, qty });
    });
  });

  const result={};
  Object.keys(data).forEach(p=>{
    result[p] = Object.entries(data[p]).map(([model,obj])=>({ model, total:obj.total, clients:obj.clients }));
  });
  return result;
}

function renderModelsPrefix(){
  const container=$("modelsContainer");
  container.innerHTML = "<div class='card'>⏳ جاري التحميل...</div>";

  try{
    const data=modelsByPrefix();
    let html="";
    for(const prefix in (data||{})){
      const arr=data[prefix]||[];
      const sum=arr.reduce((a,b)=>a+Number(b.total||0),0);

      html += `<div class="card printable">
        <h3>بادئة ${esc(prefix)} | مجموع المطلوب: ${esc(sum)}</h3>
        <button onclick="window.print()" style="padding:12px;border:none;border-radius:14px;background:#455a64;color:#fff;font-weight:bold;cursor:pointer;width:100%">🖨️ طباعة</button>
        <table>
          <tr><th>موديل</th><th>المطلوب</th><th>تفصيل العملاء</th></tr>`;

      arr.forEach(m=>{
        let clients="";
        (m.clients||[]).forEach(c=>{ clients += `${esc(c.client)} (${esc(c.qty)})<br>`; });
        html += `<tr><td>${esc(m.model)}</td><td>${esc(m.total)}</td><td>${clients}</td></tr>`;
      });

      html += `</table></div>`;
    }

    container.innerHTML = html || "<div class='card'>لا توجد بيانات</div>";
  }catch(e){
    container.innerHTML = `<div class="card red">خطأ: ${esc(e.message||String(e))}</div>`;
  }
}

/** Login */
function doLogin(){
  const u=norm($("user").value);
  const p=norm($("pass").value);

  if(!u || !p) return alert("اكتب اسم المستخدم وكلمة المرور");

  if(!STATE.users || STATE.users.length===0){
    alert("⚠️ لا توجد بيانات مستخدمين. تأكد من شيت المستخدمين (Publish + مشاركة).");
    return;
  }

  const ok = STATE.users.find(x => norm(x.user)===u && norm(x.pass)===p);
  if(!ok){
    alert("بيانات غير صحيحة ❌\nتأكد من المسافات + ترتيب الأعمدة (A:اسم المستخدم, B:كلمة المرور).");
    return;
  }

  $("loginBox").classList.add("hide");
  $("dash").classList.remove("hide");

  setReadyFilter(false);

  if(autoTimer) clearInterval(autoTimer);
  autoTimer = setInterval(async ()=>{
    if($("clients").classList.contains("active")) await refreshNow(true);
  }, APP.autoRefreshMs);
}

/** Refresh */
async function refreshNow(silent){
  try{
    if(!silent) setLoading(true);
    await loadAll();
    renderDashboard();
  }catch(e){
    showFatal("فشل تحديث البيانات. تأكد أن الشيتات منشورة ومشتركة للعامة.", e.message||String(e));
  }finally{
    if(!silent) setLoading(false);
  }
}

/** Search */
let searchT=null;
function doSearch(v){
  clearTimeout(searchT);
  searchT=setTimeout(()=>{
    const q=norm(v);
    const box=$("searchResults");
    box.innerHTML="";
    if(!q) return;

    const results = searchReadyClients(q);
    if(!results.length){
      box.innerHTML = `<div class="card">لا توجد نتائج</div>`;
      return;
    }
    results.forEach(c=>{
      const div=document.createElement("div");
      div.textContent=c;
      div.className="search-item";
      div.onclick=()=>showClient(esc(c));
      box.appendChild(div);
    });
  },250);
}

/** Bootstrap */
async function bootstrap(){
  try{
    const cached = loadCache();
    if(cached){
      bootStatus("تم تحميل بيانات من الكاش ✅ (سيتم التحديث بعد قليل)", "ok");
    }else{
      bootStatus("جاري تحميل البيانات...", "");
    }

    await loadAll();
    bootStatus("تم تحميل البيانات ✅", "ok");

    $("loginBtn").addEventListener("click", doLogin);
    document.addEventListener("keydown",(e)=>{
      if(!$("dash").classList.contains("hide")) return;
      if(e.key==="Enter") doLogin();
    });

    $("btnAll").addEventListener("click", ()=>setReadyFilter(false));
    $("btnReady").addEventListener("click", ()=>setReadyFilter(true));
    $("btnRefresh").addEventListener("click", ()=>refreshNow(false));

    $("navClients").addEventListener("click", ()=>showSection("clients"));
    $("navSearch").addEventListener("click", ()=>showSection("search"));
    $("navModels").addEventListener("click", ()=>showSection("models"));

    $("searchInput").addEventListener("keyup",(e)=>doSearch(e.target.value));

    $("btnClearCache").addEventListener("click", window.__clearCache__);
    if ($("installBtn")) $("installBtn").addEventListener("click", installApp);

    $("statusLine").textContent = "عرض: كل العملاء";
    registerPWA();
  }catch(e){
    bootStatus("فشل تحميل البيانات. راجع نشر الشيت.", "warn");
    showFatal(
      "فشل تحميل البيانات. غالباً الشيت ليس Public أو لم يتم Publish to web.",
      e.message||String(e)
    );
  }
}

window.addEventListener("DOMContentLoaded", bootstrap);

/** Expose for inline handlers */
window.__showClient__ = showClient;
window.__stepQty__ = stepQty;
window.__copyOutRows__ = copyOutRows;
window.__copyTextNow__ = copyTextNow;
window.__sendWhatsApp__ = sendWhatsApp;
window.__backToList__ = backToList;

window.__installApp__ = installApp;

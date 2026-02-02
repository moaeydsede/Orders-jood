/* =========================
   VIP Orders Tracker (GitHub Pages)
   app.js - COMPATIBLE VERSION
   ========================= */

const CSV = {
  STOCK: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTdyU9KNUduBp6l86bMVp_Bd9zBoAZR3-Iw0qQdSu4lv9ZAoRQSFNsJ9Zx5m7iV4E2A_51k3sncdQLw/pub?gid=0&single=true&output=csv",
  ORDERS:"https://docs.google.com/spreadsheets/d/e/2PACX-1vTdyU9KNUduBp6l86bMVp_Bd9zBoAZR3-Iw0qQdSu4lv9ZAoRQSFNsJ9Zx5m7iV4E2A_51k3sncdQLw/pub?gid=743878492&single=true&output=csv",
  OUT:   "https://docs.google.com/spreadsheets/d/e/2PACX-1vTdyU9KNUduBp6l86bMVp_Bd9zBoAZR3-Iw0qQdSu4lv9ZAoRQSFNsJ9Zx5m7iV4E2A_51k3sncdQLw/pub?gid=965988266&single=true&output=csv",
  USERS: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTdyU9KNUduBp6l86bMVp_Bd9zBoAZR3-Iw0qQdSu4lv9ZAoRQSFNsJ9Zx5m7iV4E2A_51k3sncdQLw/pub?gid=658369520&single=true&output=csv",
};

const APP = {
  whatsappNumber: "", // مثال: "201229202030"
  autoRefreshMs: 30000,
  maxSearchResults: 50,
};

const $ = (id)=> document.getElementById(id);

function esc(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}
function unesc(s){
  return String(s||"")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<")
    .replace(/&gt;/g,">").replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'");
}
function norm(v){ return String(v ?? "").trim(); }
function toNum(v){
  const n = Number(String(v ?? "").toString().replace(/[^\d.-]/g,""));
  return isNaN(n) ? 0 : n;
}
function todayStr(){
  const d = new Date();
  const pad = (x)=> String(x).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function setLoading(on){
  const box = $("loadingBox");
  if(box) box.classList.toggle("hide", !on);
}

function showFatalError(msg, details){
  const cards = $("cards");
  const dash = $("dash");
  const loginBox = $("loginBox");

  if(loginBox) loginBox.classList.add("hide");
  if(dash) dash.classList.remove("hide");

  if(cards){
    cards.innerHTML = `
      <div class="card red">
        <b>⚠️ خطأ في التحميل</b>
        <div style="margin-top:8px;line-height:1.7">${esc(msg || "")}</div>
        <div style="margin-top:8px;font-size:12px;opacity:.8">${esc(details || "")}</div>
        <div style="margin-top:10px">
          <button class="nav-btn" style="width:100%" onclick="location.reload()">🔄 إعادة المحاولة</button>
        </div>
      </div>
    `;
  }
}

function parseCSV(text){
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for(let i=0;i<text.length;i++){
    const ch = text[i];

    if(ch === '"'){
      if(inQuotes && text[i+1] === '"'){ cur += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if(!inQuotes && (ch === ',' || ch === '\n' || ch === '\r')){
      if(ch === '\r') continue;
      row.push(cur); cur = "";
      if(ch === '\n'){
        const isAllEmpty = row.every(c => String(c).trim()==="");
        if(!isAllEmpty) rows.push(row);
        row = [];
      }
      continue;
    }
    cur += ch;
  }
  row.push(cur);
  const isAllEmpty = row.every(c => String(c).trim()==="");
  if(!isAllEmpty) rows.push(row);

  return rows;
}

async function fetchCSV(url){
  const u = url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
  const resp = await fetch(u, { cache:"no-store" });
  if(!resp.ok) throw new Error(`فشل تحميل CSV (${resp.status})`);
  const text = await resp.text();
  const rows = parseCSV(text);
  if(!rows || rows.length < 2) throw new Error("CSV فارغ أو غير صالح");
  return rows;
}

function headerMap(headers){
  const map = {};
  headers.forEach((h,i)=>{ const k = norm(h); if(k) map[k]=i; });
  return map;
}
function findCol(hmap, candidates){
  for(const c of candidates){ if(Object.prototype.hasOwnProperty.call(hmap,c)) return hmap[c]; }
  return -1;
}
function colOr(idx, key, fallback){
  const v = idx[key];
  return (typeof v === "number" && v >= 0) ? v : fallback;
}

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

let readyFilter = false;
let autoTimer = null;

const STATE = {
  users: [],
  stock: null,
  orders: null,
  out: null,
};

function buildUsers(rows){
  const hdr = rows[0].map(norm);
  const hmap = headerMap(hdr);
  const idx = {
    user: findCol(hmap, USER_COLS.user),
    pass: findCol(hmap, USER_COLS.pass),
    role: findCol(hmap, USER_COLS.role),
  };
  const cUser = colOr(idx,"user",0);
  const cPass = colOr(idx,"pass",1);
  const cRole = colOr(idx,"role",2);

  return rows.slice(1)
    .map(r=>({ user:norm(r[cUser]), pass:norm(r[cPass]), role:norm(r[cRole]) }))
    .filter(x=>x.user && x.pass);
}

function buildStock(rows){
  const hdr = rows[0].map(norm);
  const hmap = headerMap(hdr);
  const idx = { model: findCol(hmap, STOCK_COLS.model), qty: findCol(hmap, STOCK_COLS.qty) };
  const cModel = colOr(idx,"model",0);
  const cQty = colOr(idx,"qty",2);

  const stockSet = new Set();
  const stockQty = new Map();

  rows.slice(1).forEach(r=>{
    const model = norm(r[cModel]);
    if(!model) return;
    stockSet.add(model);
    const q = toNum(r[cQty]);
    stockQty.set(model, (stockQty.get(model)||0) + (q||0));
  });

  return { stockSet, stockQty };
}

function buildOrders(rows){
  const hdr = rows[0].map(norm);
  const hmap = headerMap(hdr);
  const idx = {
    invoice: findCol(hmap, ORDER_COLS.invoice),
    client:  findCol(hmap, ORDER_COLS.client),
    model:   findCol(hmap, ORDER_COLS.model),
    qty:     findCol(hmap, ORDER_COLS.qty),
  };
  const cInv = colOr(idx,"invoice",0);
  const cClient = colOr(idx,"client",2);
  const cModel = colOr(idx,"model",3);
  const cQty = colOr(idx,"qty",4);

  const ordersByClientModel = new Map();
  const invoicesByClient = new Map();
  const totalRequiredByClient = new Map();

  rows.slice(1).forEach(r=>{
    const client = norm(r[cClient]);
    const model  = norm(r[cModel]);
    const qty    = toNum(r[cQty]);
    const inv    = norm(r[cInv]);

    if(!client || !model || qty<=0) return;

    if(!ordersByClientModel.has(client)) ordersByClientModel.set(client,new Map());
    const mm = ordersByClientModel.get(client);
    mm.set(model, (mm.get(model)||0) + qty);

    totalRequiredByClient.set(client, (totalRequiredByClient.get(client)||0) + qty);

    if(inv){
      if(!invoicesByClient.has(client)) invoicesByClient.set(client,new Set());
      invoicesByClient.get(client).add(inv);
    }
  });

  return { ordersByClientModel, invoicesByClient, totalRequiredByClient };
}

function buildOut(rows){
  const hdr = rows[0].map(norm);
  const hmap = headerMap(hdr);
  const idx = {
    client: findCol(hmap, OUT_COLS.client),
    model:  findCol(hmap, OUT_COLS.model),
    qty:    findCol(hmap, OUT_COLS.qty),
  };
  const cClient = colOr(idx,"client",2);
  const cModel  = colOr(idx,"model",3);
  const cQty    = colOr(idx,"qty",4);

  const deliveredByClientModel = new Map();
  const totalDeliveredByClient = new Map();

  rows.slice(1).forEach(r=>{
    const client = norm(r[cClient]);
    const model  = norm(r[cModel]);
    const qty    = toNum(r[cQty]);
    if(!client || !model || qty<=0) return;

    if(!deliveredByClientModel.has(client)) deliveredByClientModel.set(client,new Map());
    const mm = deliveredByClientModel.get(client);
    mm.set(model, (mm.get(model)||0) + qty);

    totalDeliveredByClient.set(client, (totalDeliveredByClient.get(client)||0) + qty);
  });

  return { deliveredByClientModel, totalDeliveredByClient };
}

async function loadAll(){
  const [usersRows, stockRows, ordersRows, outRows] = await Promise.all([
    fetchCSV(CSV.USERS),
    fetchCSV(CSV.STOCK),
    fetchCSV(CSV.ORDERS),
    fetchCSV(CSV.OUT),
  ]);

  STATE.users  = buildUsers(usersRows);
  STATE.stock  = buildStock(stockRows);
  STATE.orders = buildOrders(ordersRows);
  STATE.out    = buildOut(outRows);
}

function computeDashboardClients(readyOnly){
  const { stockSet, stockQty } = STATE.stock;
  const { ordersByClientModel, invoicesByClient, totalRequiredByClient } = STATE.orders;
  const { deliveredByClientModel, totalDeliveredByClient } = STATE.out;

  const result = [];

  ordersByClientModel.forEach((modelsMap, client)=>{
    const requiredAll  = totalRequiredByClient.get(client) || 0;
    const deliveredAll = totalDeliveredByClient.get(client) || 0;
    const remainingAll = Math.max(0, requiredAll - deliveredAll);

    let readyRequired=0, readyDelivered=0, readyRemaining=0;
    const readyModels = [];

    modelsMap.forEach((req, model)=>{
      const del = (deliveredByClientModel.get(client)?.get(model)) || 0;
      const rem = Math.max(0, req - del);
      if(rem<=0) return;

      const inStock = stockSet.has(model);
      const qtyInStock = (stockQty.get(model) || 0);
      const ok = inStock && qtyInStock > 0;

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
        client, required: readyRequired, delivered: readyDelivered, remaining: readyRemaining, status,
        invoices: Array.from(invoicesByClient.get(client)||[]).join(", "),
        readyModels
      });
    } else {
      const status = deliveredAll===0 ? "لم يبدأ" : (remainingAll>0 ? "جزئي" : "مكتمل");
      result.push({
        client, required: requiredAll, delivered: deliveredAll, remaining: remainingAll, status,
        invoices: Array.from(invoicesByClient.get(client)||[]).join(", "),
        readyModels
      });
    }
  });

  return result.sort((a,b)=>(b.remaining||0)-(a.remaining||0));
}

function computeClientModels(client, readyOnly){
  const c = norm(client);
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

    if(readyOnly){
      const inStock = stockSet.has(model);
      const qtyInStock = (stockQty.get(model)||0);
      if(!inStock || qtyInStock<=0) return;
    }

    res.push({ model, required:req, delivered:del, remaining:rem });
  });

  return res.sort((a,b)=>(b.remaining||0)-(a.remaining||0));
}

function renderDashboard(){
  const cards = $("cards");
  cards.innerHTML="";

  const data = computeDashboardClients(!!readyFilter);
  data.forEach(c=>{
    const cls = (c.status==="مكتمل") ? "green" : (c.status==="جزئي") ? "orange" : "red";
    const clientSafe = esc(c.client);
    cards.innerHTML += `
      <div class="card ${cls}">
        <b style="cursor:pointer" onclick="showClient('${clientSafe}')">${clientSafe}</b>
        <div>المطلوب ${esc(c.required)} | المسلم ${esc(c.delivered)} | المتبقي ${esc(c.remaining)}</div>
      </div>`;
  });

  if(data.length===0){
    cards.innerHTML = `<div class="card">لا توجد بيانات</div>`;
  }
}

function showClient(clientEsc){
  const client = unesc(clientEsc);
  setLoading(true);

  const models = computeClientModels(client, !!readyFilter);

  let html = `<div class="card printable">
    <h3>${esc(client)}</h3>

    <table>
      <tr>
        <th>موديل</th><th>المطلوب</th><th>المسلم</th><th>المتبقي</th><th>تسليم</th><th>+ / -</th>
      </tr>`;

  models.forEach(m=>{
    html += `<tr>
      <td>${esc(m.model)}</td>
      <td>${esc(m.required)}</td>
      <td>${esc(m.delivered)}</td>
      <td>${esc(m.remaining)}</td>
      <td><input type="number" min="0" max="${esc(m.remaining)}" value="0"
        data-model="${esc(m.model)}"
        style="width:90px;padding:8px;border-radius:10px;border:1px solid #ccc;text-align:center"></td>
      <td style="white-space:nowrap">
        <button style="padding:8px 10px;border:none;border-radius:10px;background:#e3f2fd;cursor:pointer"
          onclick="stepQty('${esc(m.model)}',1,${Number(m.remaining)})">+</button>
        <button style="padding:8px 10px;border:none;border-radius:10px;background:#fff3e0;cursor:pointer"
          onclick="stepQty('${esc(m.model)}',-1,${Number(m.remaining)})">-</button>
      </td>
    </tr>`;
  });

  html += `</table>

    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      <button style="flex:1;min-width:150px;padding:12px;border:none;border-radius:14px;background:#2e7d32;color:#fff;font-weight:bold;cursor:pointer"
        onclick="copyOutRows('${esc(client)}')">📋 نسخ سطور الصادر</button>

      <button style="flex:1;min-width:150px;padding:12px;border:none;border-radius:14px;background:#1976d2;color:#fff;font-weight:bold;cursor:pointer"
        onclick="sendWhatsApp('${esc(client)}')">💬 إرسال واتساب</button>

      <button style="flex:1;min-width:150px;padding:12px;border:none;border-radius:14px;background:#455a64;color:#fff;font-weight:bold;cursor:pointer"
        onclick="window.print()">🖨️ طباعة</button>
    </div>

    <div style="margin-top:10px">
      <button style="width:100%;padding:12px;border:none;border-radius:14px;background:#e3f2fd;color:#0d47a1;font-weight:bold;cursor:pointer"
        onclick="backToList()">⬅️ رجوع</button>
    </div>

    <div id="copyBox" class="card hide" style="margin-top:10px;background:#f7f7f7">
      <b>انسخ والصق في شيت الصادر</b>
      <textarea id="copyArea" style="width:100%;height:160px;margin-top:8px;border-radius:10px;padding:10px;border:1px solid #ccc;direction:rtl"></textarea>
      <button style="width:100%;padding:12px;border:none;border-radius:14px;background:#2e7d32;color:#fff;font-weight:bold;cursor:pointer;margin-top:8px"
        onclick="copyTextNow()">✅ نسخ الآن</button>
      <div style="font-size:12px;opacity:.8;margin-top:6px">الصيغة: رقم الفاتورة, التاريخ, اسم العميل, الموديل, الكمية</div>
    </div>
  </div>`;

  $("cards").innerHTML = html;
  setLoading(false);
}

function stepQty(modelEsc, delta, max){
  const model = unesc(modelEsc);
  let target = null;
  document.querySelectorAll("input[data-model]").forEach(inp=>{
    if(norm(inp.getAttribute("data-model")) === model) target = inp;
  });
  if(!target) return;

  let v = toNum(target.value);
  v += delta;
  if(v<0) v=0;
  if(v>max) v=max;
  target.value = v;
}

function getSelectedItems(){
  const items=[];
  document.querySelectorAll("input[data-model]").forEach(inp=>{
    const qty = toNum(inp.value);
    if(qty>0) items.push({ model: unesc(inp.getAttribute("data-model")), qty });
  });
  return items;
}

function copyOutRows(clientEsc){
  const client = unesc(clientEsc);
  const items = getSelectedItems();
  if(items.length===0) return alert("حدد كمية للتسليم أولاً");

  const lines = items.map(it=>["تسليم", todayStr(), client, it.model, it.qty].join(","));
  const txt = lines.join("\n");

  $("copyBox").classList.remove("hide");
  $("copyArea").value = txt;
  $("copyBox").scrollIntoView({behavior:"smooth", block:"start"});
}

function copyTextNow(){
  const area = $("copyArea");
  area.select();
  area.setSelectionRange(0, area.value.length);
  try{ document.execCommand("copy"); alert("تم النسخ ✅"); }
  catch(e){ alert("انسخ يدويًا من المربع"); }
}

function sendWhatsApp(clientEsc){
  const client = unesc(clientEsc);
  const items = getSelectedItems();
  if(items.length===0) return alert("حدد كمية للتسليم أولاً");

  let msg = `تأكيد تسليم ✅\nالعميل: ${client}\nالتاريخ: ${todayStr()}\n\nتفاصيل التسليم:\n`;
  items.forEach((it,i)=>{ msg += `${i+1}) ${it.model} — ${it.qty}\n`; });
  msg += `\nشكراً لتعاملكم معنا.`;

  const phone = (APP.whatsappNumber||"").trim();
  const url = phone ? `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(msg)}`
                    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url,"_blank");
}

function backToList(){ renderDashboard(); }

function setReadyFilter(val){
  readyFilter = !!val;
  $("btnAll").classList.toggle("active", !readyFilter);
  $("btnReady").classList.toggle("active", readyFilter);
  $("statusLine").textContent = readyFilter ? "عرض: العملاء الجاهزين" : "عرض: كل العملاء";
  renderDashboard();
}

function showSection(name){
  document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));
  $(name).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
  if(name==="clients") $("navClients").classList.add("active");
  if(name==="search") $("navSearch").classList.add("active");
  if(name==="models") $("navModels").classList.add("active");
}

let searchT=null;
function doSearch(k){
  clearTimeout(searchT);
  searchT=setTimeout(()=>{
    const q = norm(k).toLowerCase();
    const box = $("searchResults");
    box.innerHTML="";
    if(!q) return;

    const readyClients = computeDashboardClients(true).map(x=>x.client);
    const results = readyClients.filter(n=>norm(n).toLowerCase().includes(q)).slice(0, APP.maxSearchResults);

    if(results.length===0){
      box.innerHTML = `<div class="card">لا توجد نتائج</div>`;
      return;
    }

    results.forEach(c=>{
      const div = document.createElement("div");
      div.textContent = c;
      div.style.cssText="padding:10px;margin:6px 0;background:#e3f2fd;border-radius:12px;cursor:pointer;font-size:16px";
      div.onclick = ()=> showClient(esc(c));
      box.appendChild(div);
    });
  },250);
}

/** LOGIN **/
function doLogin(){
  const u = norm($("user").value);
  const p = norm($("pass").value);
  if(!u || !p) return alert("اكتب اسم المستخدم وكلمة المرور");

  const ok = STATE.users.find(x=>x.user===u && x.pass===p);
  if(!ok) return alert("بيانات غير صحيحة");

  $("loginBox").classList.add("hide");
  $("dash").classList.remove("hide");

  setReadyFilter(false);

  if(autoTimer) clearInterval(autoTimer);
  autoTimer = setInterval(async ()=>{
    if($("clients").classList.contains("active")){
      await refreshNow(true);
    }
  }, APP.autoRefreshMs);
}

/** refresh **/
async function refreshNow(silent){
  try{
    if(!silent) setLoading(true);
    await loadAll();
    renderDashboard();
  } catch(e){
    showFatalError(
      "تأكد أن الشيتات منشورة على الويب وأن روابط CSV تعمل بدون تسجيل دخول.",
      e.message || String(e)
    );
  } finally {
    if(!silent) setLoading(false);
  }
}

/** bootstrap **/
async function bootstrap(){
  try{
    setLoading(true);
    await loadAll();
    setLoading(false);

    // buttons
    $("loginBtn").onclick = doLogin;
    $("btnAll").onclick = ()=> setReadyFilter(false);
    $("btnReady").onclick = ()=> setReadyFilter(true);
    $("btnRefresh").onclick = ()=> refreshNow(false);

    $("navClients").onclick = ()=> showSection("clients");
    $("navSearch").onclick = ()=> showSection("search");
    $("navModels").onclick = ()=> showSection("models");

    $("searchInput").addEventListener("keyup", (e)=> doSearch(e.target.value));

    document.addEventListener("keydown",(e)=>{
      if(!$("dash").classList.contains("hide")) return;
      if(e.key==="Enter") doLogin();
    }); 

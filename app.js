/* =========================
   VIP Orders Tracker (GitHub Pages)
   app.js - FULL FILE
   ========================= */

/** ====== CSV SOURCES (YOUR SHEET) ====== **/
const CSV = {
  STOCK: "https://docs.google.com/spreadsheets/d/1HfDubrlG9a2kM89GK4BRQ5hZI_X3oE4RYn86dT1fZmA/gviz/tq?tqx=out:csv&gid=0",
  ORDERS:"https://docs.google.com/spreadsheets/d/1HfDubrlG9a2kM89GK4BRQ5hZI_X3oE4RYn86dT1fZmA/gviz/tq?tqx=out:csv&gid=743878492",
  OUT:   "https://docs.google.com/spreadsheets/d/1HfDubrlG9a2kM89GK4BRQ5hZI_X3oE4RYn86dT1fZmA/gviz/tq?tqx=out:csv&gid=965988266",
  USERS: "https://docs.google.com/spreadsheets/d/1HfDubrlG9a2kM89GK4BRQ5hZI_X3oE4RYn86dT1fZmA/gviz/tq?tqx=out:csv&gid=658369520",
};

/** ====== APP SETTINGS ====== **/
const APP = {
  whatsappNumber: "",  // اختياري: ضع رقم واتساب بشكل دولي بدون + (مثال: 201229202030)
  autoRefreshMs: 30000,
  maxSearchResults: 50,
};

/** ====== DOM HELPERS ====== **/
const $ = (id) => document.getElementById(id);

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

/** ====== UI STATUS / LOADING ====== **/
function setLoading(on){
  const box = $("loadingBox");
  if(!box) return;
  box.classList.toggle("hide", !on);
}
function showFatalError(msg, details){
  // يضمن ألا تكون الصفحة بيضاء: نعرض رسالة واضحة داخل cards
  const cards = $("cards");
  const dash = $("dash");
  const loginBox = $("loginBox");
  if(loginBox) loginBox.classList.add("hide");
  if(dash) dash.classList.remove("hide");

  if(cards){
    cards.innerHTML = `
      <div class="card red">
        <b>حدث خطأ في تحميل البيانات</b>
        <div style="margin-top:8px;font-size:14px;line-height:1.6">
          ${esc(msg || "غير معروف")}
        </div>
        <div style="margin-top:8px;font-size:12px;opacity:.8">
          ${esc(details || "")}
        </div>
        <div style="margin-top:10px">
          <button class="nav-btn" style="width:100%" onclick="location.reload()">🔄 إعادة المحاولة</button>
        </div>
      </div>
    `;
  }
}

/** ====== CSV PARSER (ROBUST) ====== **/
function parseCSV(text){
  // CSV parser يدعم الفواصل والاقتباس
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for(let i=0;i<text.length;i++){
    const ch = text[i];

    if(ch === '"'){
      if(inQuotes && text[i+1] === '"'){ // escaped quote
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if(!inQuotes && (ch === ',' || ch === '\n' || ch === '\r')){
      if(ch === '\r') continue;
      row.push(cur);
      cur = "";
      if(ch === '\n'){
        // ignore trailing empty row
        const isAllEmpty = row.every(c => String(c).trim()==="");
        if(!isAllEmpty) rows.push(row);
        row = [];
      }
      continue;
    }

    cur += ch;
  }

  // last cell
  row.push(cur);
  const isAllEmpty = row.every(c => String(c).trim()==="");
  if(!isAllEmpty) rows.push(row);

  return rows;
}

/** ====== FETCH CSV WITH NO-CACHE ====== **/
async function fetchCSV(url){
  const u = url + (url.includes("?") ? "&" : "?") + "v=" + Date.now();
  const resp = await fetch(u, { cache: "no-store" });
  if(!resp.ok){
    throw new Error(`فشل تحميل CSV (${resp.status})`);
  }
  const text = await resp.text();
  const rows = parseCSV(text);
  if(!rows || rows.length === 0){
    throw new Error("CSV فارغ أو غير صالح");
  }
  return rows;
}

/** ====== HEADER DETECT ====== **/
function headerMap(headers){
  const map = {};
  headers.forEach((h,i)=>{
    const k = norm(h);
    if(k) map[k] = i;
  });
  return map;
}
function findCol(hmap, candidates){
  for(const c of candidates){
    if(Object.prototype.hasOwnProperty.call(hmap, c)) return hmap[c];
  }
  return -1;
}
function colOr(idx, key, fallback){
  const v = idx[key];
  return (typeof v === "number" && v >= 0) ? v : fallback;
}

/** ====== COLUMN CANDIDATES (AR) ====== **/
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
  name: ["اسم الموديل","اسم الصنف","الصنف"],
  qty: ["الكميه","الكمية","كمية","المخزون","متاح"],
};

const USER_COLS = {
  user: ["اسم المستخدم","يوزر","User","Username"],
  pass: ["كلمة المرور","باسورد","Pass","Password"],
  role: ["الصلاحية","دور","Role","الوظيفة"],
};

/** ====== APP STATE ====== **/
let readyFilter = false;
let autoTimer = null;

const STATE = {
  users: [],
  stock: null,
  orders: null,
  out: null,
  loggedIn: false,
  role: "",
};

/** ====== LOAD ALL DATA ====== **/
async function loadAll(){
  try{
    // parallel load
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

  } catch(e){
    showFatalError(
      "تأكد أن الشيتات الأربعة منشورة على الويب (Publish to web) وأن روابط CSV تعمل بدون تسجيل دخول.",
      (e && e.message) ? e.message : String(e)
    );
    throw e;
  }
}

/** ====== BUILDERS ====== **/
function buildUsers(rows){
  const hdr = rows[0].map(norm);
  const hmap = headerMap(hdr);
  const idx = {
    user: findCol(hmap, USER_COLS.user),
    pass: findCol(hmap, USER_COLS.pass),
    role: findCol(hmap, USER_COLS.role),
  };

  const cUser = colOr(idx, "user", 0);
  const cPass = colOr(idx, "pass", 1);
  const cRole = colOr(idx, "role", 2);

  const data = rows.slice(1);
  const users = [];

  for(const r of data){
    const u = norm(r[cUser]);
    const p = norm(r[cPass]);
    if(!u || !p) continue;
    users.push({
      user: u,
      pass: p,
      role: norm(r[cRole]),
    });
  }
  return users;
}

function buildStock(rows){
  const hdr = rows[0].map(norm);
  const hmap = headerMap(hdr);
  const idx = {
    model: findCol(hmap, STOCK_COLS.model),
    qty: findCol(hmap, STOCK_COLS.qty),
  };
  const cModel = colOr(idx, "model", 0);
  const cQty = colOr(idx, "qty", 2);

  const data = rows.slice(1);
  const stockSet = new Set();
  const stockQty = new Map();

  for(const r of data){
    const model = norm(r[cModel]);
    if(!model) continue;
    stockSet.add(model);
    const q = toNum(r[cQty]);
    stockQty.set(model, (stockQty.get(model) || 0) + (q || 0));
  }
  return { stockSet, stockQty };
}

function buildOrders(rows){
  const hdr = rows[0].map(norm);
  const hmap = headerMap(hdr);
  const idx = {
    invoice: findCol(hmap, ORDER_COLS.invoice),
    date: findCol(hmap, ORDER_COLS.date),
    client: findCol(hmap, ORDER_COLS.client),
    model: findCol(hmap, ORDER_COLS.model),
    qty: findCol(hmap, ORDER_COLS.qty),
  };

  const cInv = colOr(idx, "invoice", 0);
  const cDate = colOr(idx, "date", 1);
  const cClient = colOr(idx, "client", 2);
  const cModel = colOr(idx, "model", 3);
  const cQty = colOr(idx, "qty", 4);

  const data = rows.slice(1);

  const ordersByClientModel = new Map();
  const invoicesByClient = new Map();
  const totalRequiredByClient = new Map();

  for(const r of data){
    const client = norm(r[cClient]);
    const model = norm(r[cModel]);
    const qty = toNum(r[cQty]);
    const invoice = norm(r[cInv]);

    if(!client || !model || qty <= 0) continue;

    if(!ordersByClientModel.has(client)) ordersByClientModel.set(client, new Map());
    const mm = ordersByClientModel.get(client);
    mm.set(model, (mm.get(model) || 0) + qty);

    totalRequiredByClient.set(client, (totalRequiredByClient.get(client) || 0) + qty);

    if(invoice){
      if(!invoicesByClient.has(client)) invoicesByClient.set(client, new Set());
      invoicesByClient.get(client).add(invoice);
    }
  }

  return { ordersByClientModel, invoicesByClient, totalRequiredByClient };
}

function buildOut(rows){
  const hdr = rows[0].map(norm);
  const hmap = headerMap(hdr);
  const idx = {
    client: findCol(hmap, OUT_COLS.client),
    model: findCol(hmap, OUT_COLS.model),
    qty: findCol(hmap, OUT_COLS.qty),
  };
  const cClient = colOr(idx, "client", 2);
  const cModel = colOr(idx, "model", 3);
  const cQty = colOr(idx, "qty", 4);

  const data = rows.slice(1);

  const deliveredByClientModel = new Map();
  const totalDeliveredByClient = new Map();

  for(const r of data){
    const client = norm(r[cClient]);
    const model = norm(r[cModel]);
    const qty = toNum(r[cQty]);
    if(!client || !model || qty <= 0) continue;

    if(!deliveredByClientModel.has(client)) deliveredByClientModel.set(client, new Map());
    const mm = deliveredByClientModel.get(client);
    mm.set(model, (mm.get(model) || 0) + qty);

    totalDeliveredByClient.set(client, (totalDeliveredByClient.get(client) || 0) + qty);
  }

  return { deliveredByClientModel, totalDeliveredByClient };
}

/** ====== BUSINESS LOGIC ====== **/
function computeDashboardClients(readyOnly){
  const { stockSet, stockQty } = STATE.stock;
  const { ordersByClientModel, invoicesByClient, totalRequiredByClient } = STATE.orders;
  const { deliveredByClientModel, totalDeliveredByClient } = STATE.out;

  const result = [];

  ordersByClientModel.forEach((modelsMap, client)=>{
    const requiredAll = totalRequiredByClient.get(client) || 0;
    const deliveredAll = totalDeliveredByClient.get(client) || 0;
    const remainingAll = Math.max(0, requiredAll - deliveredAll);

    let readyRequired = 0;
    let readyDelivered = 0;
    let readyRemaining = 0;
    const readyModels = [];

    modelsMap.forEach((req, model)=>{
      const del = (deliveredByClientModel.get(client)?.get(model)) || 0;
      const rem = Math.max(0, req - del);
      if(rem <= 0) return;

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
      if(readyModels.length === 0) return;

      const status =
        readyDelivered === 0 ? "لم يبدأ" :
        (readyRemaining > 0 ? "جزئي" : "مكتمل");

      result.push({
        client,
        required: readyRequired,
        delivered: readyDelivered,
        remaining: readyRemaining,
        status,
        invoices: Array.from(invoicesByClient.get(client) || []).join(", "),
        readyModels
      });
    } else {
      const status =
        deliveredAll === 0 ? "لم يبدأ" :
        (remainingAll > 0 ? "جزئي" : "مكتمل");

      result.push({
        client,
        required: requiredAll,
        delivered: deliveredAll,
        remaining: remainingAll,
        status,
        invoices: Array.from(invoicesByClient.get(client) || []).join(", "),
        readyModels
      });
    }
  });

  return result.sort((a,b)=> (b.remaining||0) - (a.remaining||0));
}

function computeClientModels(client, readyOnly){
  const c = norm(client);
  if(!c) return [];

  const { stockSet, stockQty } = STATE.stock;
  const { ordersByClientModel } = STATE.orders;
  const { deliveredByClientModel } = STATE.out;

  const modelsMap = ordersByClientModel.get(c);
  if(!modelsMap) return [];

  const res = [];
  modelsMap.forEach((req, model)=>{
    const del = (deliveredByClientModel.get(c)?.get(model)) || 0;
    const rem = Math.max(0, req - del);
    if(rem <= 0) return;

    if(readyOnly){
      const inStock = stockSet.has(model);
      const qtyInStock = (stockQty.get(model) || 0);
      if(!inStock || qtyInStock <= 0) return;
    }

    res.push({ model, required: req, delivered: del, remaining: rem });
  });

  return res.sort((a,b)=> (b.remaining||0) - (a.remaining||0));
}

function searchReadyClients(keyword){
  const k = norm(keyword).toLowerCase();
  if(!k) return [];
  const readyClients = computeDashboardClients(true).map(x=> x.client);
  return readyClients
    .filter(n => norm(n).toLowerCase().includes(k))
    .slice(0, APP.maxSearchResults);
}

/** ====== LOGIN ====== **/
function doLogin(){
  const user = $("user").value;
  const pass = $("pass").value;

  $("loginBtn").disabled = true;

  const u = norm(user), p = norm(pass);
  if(!u || !p){
    $("loginBtn").disabled = false;
    alert("اكتب اسم المستخدم وكلمة المرور");
    return;
  }

  const found = STATE.users.find(x => x.user === u && x.pass === p);
  $("loginBtn").disabled = false;

  if(!found){
    alert("بيانات غير صحيحة");
    return;
  }

  STATE.loggedIn = true;
  STATE.role = found.role || "";

  $("loginBox").classList.add("hide");
  $("dash").classList.remove("hide");

  setReadyFilter(false);

  // auto refresh only on clients section
  if(autoTimer) clearInterval(autoTimer);
  autoTimer = setInterval(async ()=>{
    const clientsTabActive = $("clients").classList.contains("active");
    if(clientsTabActive) await refreshNow(true);
  }, APP.autoRefreshMs);
}

/** ====== NAV / FILTER ====== **/
function showSection(id,btn){
  document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));
  $(id).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");

  if(id === "models") renderModelsPrefix();
}

async function setReadyFilter(val){
  readyFilter = !!val;
  $("btnAll").classList.toggle("active", !readyFilter);
  $("btnReady").classList.toggle("active", readyFilter);
  await loadDashboard(readyFilter);
}

async function refreshNow(silent){
  await reloadDataIfNeeded();
  await loadDashboard(readyFilter, !!silent);
}

/** ====== LOAD / RELOAD DATA ====== **/
let lastLoadAt = 0;
async function reloadDataIfNeeded(){
  // reload every refresh to keep latest
  await loadAll();
  lastLoadAt = Date.now();
}

/** ====== DASHBOARD RENDER ====== **/
async function loadDashboard(ready, silent){
  try{
    if(!silent) setLoading(true);

    $("statusLine").textContent = ready
      ? "عرض: العملاء الجاهزين (متبقي غير مسلم + الموديل موجود بالمخزون)"
      : "عرض: كل العملاء";

    const data = computeDashboardClients(!!ready);

    const cards = $("cards");
    cards.innerHTML = "";

    (data||[]).forEach(c=>{
      const cls = (c.status==="مكتمل") ? "green" : (c.status==="جزئي") ? "orange" : "red";
      const clientSafe = esc(c.client);
      cards.innerHTML += `
        <div class="card ${cls}">
          <b style="cursor:pointer" onclick="showClient('${clientSafe}')">${clientSafe}</b>
          <div>المطلوب ${esc(c.required)} | المسلم ${esc(c.delivered)} | المتبقي ${esc(c.remaining)}</div>
        </div>`;
    });

    if((data||[]).length===0){
      cards.innerHTML = `<div class="card">لا توجد بيانات للعرض</div>`;
    }

  } catch(e){
    showFatalError("تعذر عرض البيانات. تأكد من الروابط وصلاحية النشر.", e.message || String(e));
  } finally {
    if(!silent) setLoading(false);
  }
}

/** ====== CLIENT VIEW ====== **/
function showClient(clientEsc){
  const client = unesc(clientEsc);
  setLoading(true);

  const models = computeClientModels(client, !!readyFilter);

  let html = `<div class="card printable">
    <h3>${esc(client)}</h3>
    <div style="font-size:12px;opacity:.8;margin-top:6px">حدد كميات التسليم ثم انسخ سطور الصادر أو أرسل واتساب.</div>

    <table>
      <tr>
        <th>موديل</th>
        <th>المطلوب</th>
        <th>المسلم</th>
        <th>المتبقي</th>
        <th>تسليم</th>
        <th>+ / −</th>
      </tr>`;

  models.forEach(m=>{
    if(Number(m.remaining) <= 0) return;
    const max = Number(m.remaining);
    const modelS = esc(m.model);
    html += `
      <tr>
        <td>${modelS}</td>
        <td>${esc(m.required)}</td>
        <td>${esc(m.delivered)}</td>
        <td>${esc(m.remaining)}</td>
        <td>
          <input type="number" min="0" max="${esc(max)}"
            data-model="${modelS}"
            value="0"
            style="width:90px;padding:8px;border-radius:10px;border:1px solid #ccc;text-align:center;">
        </td>
        <td style="white-space:nowrap">
          <button onclick="stepQty('${modelS}',1,${max})" style="padding:8px 10px;border:none;border-radius:10px;background:#e3f2fd;cursor:pointer">+</button>
          <button onclick="stepQty('${modelS}',-1,${max})" style="padding:8px 10px;border:none;border-radius:10px;background:#fff3e0;cursor:pointer">-</button>
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

  document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));
  $("clients").classList.add("active");

  setLoading(false);
}

function backToList(){
  loadDashboard(readyFilter);
}

/** ====== QTY STEP ====== **/
function stepQty(modelEsc, delta, max){
  const model = unesc(modelEsc);
  const inp = document.querySelector(`input[data-model="${CSS.escape(model)}"]`);
  if(!inp) return;
  const v = toNum(inp.value);
  let nv = v + delta;
  if(nv < 0) nv = 0;
  if(nv > max) nv = max;
  inp.value = nv;
}

/** ====== COLLECT SELECTED ITEMS ====== **/
function getSelectedItems(){
  const items = [];
  document.querySelectorAll("input[data-model]").forEach(inp=>{
    const qty = toNum(inp.value);
    if(qty > 0){
      items.push({ model: unesc(inp.getAttribute("data-model")), qty });
    }
  });
  return items;
}

/** ====== COPY OUT ROWS (Paste to OUT sheet) ====== **/
function co

// VIP Orders Tracker (GitHub Pages) - CSV Only
const CSV = {
  STOCK: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTdyU9KNUduBp6l86bMVp_Bd9zBoAZR3-Iw0qQdSu4lv9ZAoRQSFNsJ9Zx5m7iV4E2A_51k3sncdQLw/pub?gid=0&single=true&output=csv",
  ORDERS:"https://docs.google.com/spreadsheets/d/e/2PACX-1vTdyU9KNUduBp6l86bMVp_Bd9zBoAZR3-Iw0qQdSu4lv9ZAoRQSFNsJ9Zx5m7iV4E2A_51k3sncdQLw/pub?gid=743878492&single=true&output=csv",
  OUT:   "https://docs.google.com/spreadsheets/d/e/2PACX-1vTdyU9KNUduBp6l86bMVp_Bd9zBoAZR3-Iw0qQdSu4lv9ZAoRQSFNsJ9Zx5m7iV4E2A_51k3sncdQLw/pub?gid=965988266&single=true&output=csv",
  USERS: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTdyU9KNUduBp6l86bMVp_Bd9zBoAZR3-Iw0qQdSu4lv9ZAoRQSFNsJ9Zx5m7iV4E2A_51k3sncdQLw/pub?gid=658369520&single=true&output=csv",
};

const LS = { SESSION:"orders_vip_session_v1", CACHE:"orders_vip_cache_v1" };
const AUTO_REFRESH_MS = 30000;
const CACHE_TTL_MS = 60*1000;

const $ = (id)=>document.getElementById(id);
const loginView=$("loginView"), appView=$("appView"), loading=$("loading"), loadingSub=$("loadingSub"), banner=$("banner");
const btnLogin=$("btnLogin"), btnRefreshTop=$("btnRefreshTop"), chipAll=$("chipAll"), chipReady=$("chipReady"), statsPill=$("statsPill");
const qClients=$("qClients"), qSearch=$("qSearch"), listClients=$("listClients"), emptyClients=$("emptyClients"), listSearch=$("listSearch"), modelsWrap=$("modelsWrap");
const drawer=$("drawer"), btnClose=$("btnClose"), dClient=$("dClient"), dMeta=$("dMeta"), kReq=$("kReq"), kDel=$("kDel"), kRem=$("kRem"), kStatus=$("kStatus");
const mCount=$("mCount"), mTable=$("mTable"), btnCopyRows=$("btnCopyRows"), btnWhats=$("btnWhats"), copyHint=$("copyHint");

let READY_ONLY=false, AUTO_T=null;
let DATA={ stockSet:new Set(), stockQty:new Map(), ordersByClientModel:new Map(), invoicesByClient:new Map(), totalRequiredByClient:new Map(), deliveredByClientModel:new Map(), totalDeliveredByClient:new Map() };
let DASHBOARD=[], CURRENT_CLIENT=null, CURRENT_MODELS=[], DELIVERY_DRAFT=new Map();

function norm(v){return String(v??"").trim();}
function toNum(v){const n=Number(v);return isNaN(n)?0:n;}
function esc(s){return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");}
function showLoading(on, sub){ if(sub) loadingSub.textContent=sub; loading.classList.toggle("hide", !on); }
function showBanner(msg){ if(!msg){ banner.classList.add("hide"); banner.textContent=""; return;} banner.textContent=msg; banner.classList.remove("hide"); }
function setTab(tab){
  document.querySelectorAll(".seg__btn").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  $("tab-"+tab).classList.add("active");
}
function setReady(ready){ READY_ONLY=!!ready; chipAll.classList.toggle("active", !READY_ONLY); chipReady.classList.toggle("active", READY_ONLY); renderDashboard(); }

function splitCSVLine(line){
  const out=[]; let cur=""; let q=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){ if(q && line[i+1]==='"'){cur+='"'; i++;} else q=!q; }
    else if(ch===',' && !q){ out.push(cur); cur=""; }
    else cur+=ch;
  }
  out.push(cur); return out;
}
function parseCSV(csvText){
  const lines=String(csvText||"").split(/\r?\n/).filter(l=>l.trim().length);
  if(!lines.length) return [];
  const headers=splitCSVLine(lines[0]).map(h=>norm(h));
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const cols=splitCSVLine(lines[i]);
    const obj={};
    for(let c=0;c<headers.length;c++) obj[headers[c]]=(cols[c]??"");
    rows.push(obj);
  }
  return rows;
}
async function fetchCSV(url){
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok) throw new Error("HTTP "+r.status);
  return await r.text();
}

const CANDS={
  ORDER:{invoice:["رقم الفاتورة","الفاتورة","رقم"],date:["التاريخ","تاريخ"],client:["اسم العميل","العميل","اسم الزبون","الزبون"],model:["الموديل","رقم الموديل","رمز الصنف","كود الصنف","الصنف"],qty:["الكمية المطلوبة","الكمية","كمية","المطلوب"]},
  OUT:{invoice:["رقم الفاتورة","الفاتورة","رقم"],date:["التاريخ","تاريخ"],client:["اسم العميل","العميل","اسم الزبون","الزبون"],model:["الموديل","رقم الموديل","رمز الصنف","كود الصنف","الصنف"],qty:["الكميه المسلمه","الكمية المسلمة","الكمية","كمية","المسلم"]},
  STOCK:{model:["الموديل","رقم الموديل","رمز الصنف","كود الصنف","الصنف"],qty:["الكميه","الكمية","كمية","المخزون","متاح"]},
  USER:{user:["اسم المستخدم","يوزر","User","Username"],pass:["كلمة المرور","باسورد","Pass","Password"],role:["الصلاحية","دور","Role","الوظيفة"]}
};
function pickCol(headers, candidates, fallback){ for(const c of candidates){ const i=headers.indexOf(c); if(i>=0) return i; } return fallback; }
function mapRowsToMatrix(rows){ if(!rows.length) return {headers:[], matrix:[]}; const headers=Object.keys(rows[0]); return {headers, matrix: rows.map(r=>headers.map(h=>r[h]))}; }

function saveCache(payload){ try{localStorage.setItem(LS.CACHE, JSON.stringify({ts:Date.now(), payload}));}catch(e){} }
function loadCache(){ try{return JSON.parse(localStorage.getItem(LS.CACHE)||"null");}catch(e){return null;} }
function saveSession(s){ try{localStorage.setItem(LS.SESSION, JSON.stringify(s));}catch(e){} }
function loadSession(){ try{return JSON.parse(localStorage.getItem(LS.SESSION)||"null");}catch(e){return null;} }

async function loadAll(force){
  showBanner(null);
  showLoading(true, "تحميل البيانات…");
  const now=Date.now();
  if(!force){
    const c=loadCache();
    if(c && (now-c.ts)<CACHE_TTL_MS){
      hydrate(c.payload); computeDashboard(); showLoading(false); renderDashboard(); renderSearch(); return;
    }
  }
  try{
    loadingSub.textContent="تحميل المستخدمين…"; const users=parseCSV(await fetchCSV(CSV.USERS));
    loadingSub.textContent="تحميل المخزون…"; const stock=parseCSV(await fetchCSV(CSV.STOCK));
    loadingSub.textContent="تحميل الطلبيات…"; const orders=parseCSV(await fetchCSV(CSV.ORDERS));
    loadingSub.textContent="تحميل الصادر…"; const out=parseCSV(await fetchCSV(CSV.OUT));
    const payload={users,stock,orders,out};
    saveCache(payload);
    hydrate(payload);
    computeDashboard();
    showLoading(false);
    renderDashboard(); renderSearch(); renderModelsByPrefix();
  }catch(e){
    showLoading(false);
    showBanner("تعذر تحميل البيانات.\n\n- تأكد Publish to web\n- تأكد روابط CSV\n\nالخطأ: "+(e?.message||e));
  }
}

function hydrate(payload){
  window.__USERS__=payload.users||[];

  // STOCK
  const {headers:sh, matrix:sm}=mapRowsToMatrix(payload.stock||[]);
  const cModel=pickCol(sh, CANDS.STOCK.model, 0);
  const cQty=pickCol(sh, CANDS.STOCK.qty, 2);
  const stockSet=new Set(); const stockQty=new Map();
  for(const r of sm){
    const model=norm(r[cModel]); if(!model) continue;
    stockSet.add(model);
    stockQty.set(model, (stockQty.get(model)||0) + (toNum(r[cQty])||0));
  }

  // ORDERS
  const {headers:oh, matrix:om}=mapRowsToMatrix(payload.orders||[]);
  const oInv=pickCol(oh,CANDS.ORDER.invoice,0);
  const oClient=pickCol(oh,CANDS.ORDER.client,2);
  const oModel=pickCol(oh,CANDS.ORDER.model,3);
  const oQty=pickCol(oh,CANDS.ORDER.qty,4);

  const ordersByClientModel=new Map(), invoicesByClient=new Map(), totalRequiredByClient=new Map();
  for(const r of om){
    const client=norm(r[oClient]), model=norm(r[oModel]), qty=toNum(r[oQty]), invoice=norm(r[oInv]);
    if(!client||!model||qty<=0) continue;
    if(!ordersByClientModel.has(client)) ordersByClientModel.set(client, new Map());
    const mm=ordersByClientModel.get(client);
    mm.set(model,(mm.get(model)||0)+qty);
    totalRequiredByClient.set(client,(totalRequiredByClient.get(client)||0)+qty);
    if(invoice){
      if(!invoicesByClient.has(client)) invoicesByClient.set(client,new Set());
      invoicesByClient.get(client).add(invoice);
    }
  }

  // OUT
  const {headers:uh, matrix:um}=mapRowsToMatrix(payload.out||[]);
  const uClient=pickCol(uh,CANDS.OUT.client,2);
  const uModel=pickCol(uh,CANDS.OUT.model,3);
  const uQty=pickCol(uh,CANDS.OUT.qty,4);

  const deliveredByClientModel=new Map(), totalDeliveredByClient=new Map();
  for(const r of um){
    const client=norm(r[uClient]), model=norm(r[uModel]), qty=toNum(r[uQty]);
    if(!client||!model||qty<=0) continue;
    if(!deliveredByClientModel.has(client)) deliveredByClientModel.set(client,new Map());
    const mm=deliveredByClientModel.get(client);
    mm.set(model,(mm.get(model)||0)+qty);
    totalDeliveredByClient.set(client,(totalDeliveredByClient.get(client)||0)+qty);
  }

  DATA={stockSet,stockQty,ordersByClientModel,invoicesByClient,totalRequiredByClient,deliveredByClientModel,totalDeliveredByClient};
}

function computeDashboard(){
  const res=[];
  DATA.ordersByClientModel.forEach((modelsMap, client)=>{
    const requiredAll=DATA.totalRequiredByClient.get(client)||0;
    const deliveredAll=DATA.totalDeliveredByClient.get(client)||0;
    const remainingAll=Math.max(0, requiredAll-deliveredAll);
    let readyRequired=0, readyDelivered=0, readyRemaining=0; const readyModels=[];
    modelsMap.forEach((req, model)=>{
      const del=(DATA.deliveredByClientModel.get(client)?.get(model))||0;
      const rem=Math.max(0, req-del);
      if(rem<=0) return;
      const inStock=DATA.stockSet.has(model);
      const qtyInStock=DATA.stockQty.get(model)||0;
      if(inStock && qtyInStock>0){
        readyRequired+=req; readyDelivered+=del; readyRemaining+=rem; readyModels.push(model);
      }
    });
    const invoices=Array.from(DATA.invoicesByClient.get(client)||[]).join(", ");
    const statusAll = deliveredAll===0?"لم يبدأ":(remainingAll>0?"جزئي":"مكتمل");
    const statusReady= readyDelivered===0?"لم يبدأ":(readyRemaining>0?"جزئي":"مكتمل");
    res.push({client,requiredAll,deliveredAll,remainingAll,statusAll,readyRequired,readyDelivered,readyRemaining,statusReady,invoices,readyModels});
  });
  res.sort((a,b)=>(b.remainingAll||0)-(a.remainingAll||0));
  DASHBOARD=res;
}

function statusBadge(status){
  if(status==="مكتمل") return '<span class="badge ok">مكتمل</span>';
  if(status==="جزئي") return '<span class="badge warn">جزئي</span>';
  return '<span class="badge bad">لم يبدأ</span>';
}

function renderDashboard(){
  const q=norm(qClients.value).toLowerCase();
  const list=DASHBOARD.filter(x=>{
    if(READY_ONLY){ if((x.readyModels||[]).length===0 || x.readyRemaining<=0) return false; }
    if(!q) return true;
    return norm(x.client).toLowerCase().includes(q);
  });

  const sumRem=list.reduce((a,x)=>a+(READY_ONLY?(x.readyRemaining||0):(x.remainingAll||0)),0);
  statsPill.textContent = list.length + " عميل • متبقي " + sumRem;

  listClients.innerHTML="";
  emptyClients.classList.toggle("hide", list.length!==0);

  for(const c of list){
    const status=READY_ONLY?c.statusReady:c.statusAll;
    const req=READY_ONLY?c.readyRequired:c.requiredAll;
    const del=READY_ONLY?c.readyDelivered:c.deliveredAll;
    const rem=READY_ONLY?c.readyRemaining:c.remainingAll;
    listClients.insertAdjacentHTML("beforeend", `
      <div class="item" data-client="${esc(c.client)}">
        <div class="item__top">
          <div>
            <div class="item__name">${esc(c.client)}</div>
            <div class="item__meta">المطلوب ${req} • المسلم ${del} • المتبقي ${rem}</div>
          </div>
          ${statusBadge(status)}
        </div>
        <div class="kv">
          <span class="pill">${c.invoices?("فواتير: "+esc(c.invoices)):"بدون فواتير"}</span>
          ${READY_ONLY?`<span class="pill">جاهز: ${esc((c.readyModels||[]).slice(0,4).join("، "))}${(c.readyModels||[]).length>4?"…":""}</span>`:""}
        </div>
      </div>
    `);
  }
  listClients.querySelectorAll(".item").forEach(el=> el.onclick=()=>openClient(el.getAttribute("data-client")));
}

function renderSearch(){
  const q=norm(qSearch.value).toLowerCase();
  listSearch.innerHTML="";
  if(!q) return;
  const readyClients=DASHBOARD.filter(x=>(x.readyModels||[]).length>0 && x.readyRemaining>0).map(x=>x.client);
  const hits=readyClients.filter(n=>norm(n).toLowerCase().includes(q)).slice(0,50);
  if(!hits.length){ listSearch.innerHTML='<div class="item"><div class="item__name">لا توجد نتائج</div></div>'; return; }
  for(const name of hits){
    listSearch.insertAdjacentHTML("beforeend", `<div class="item" data-client="${esc(name)}"><div class="item__top"><div class="item__name">${esc(name)}</div><span class="badge ok">جاهز</span></div></div>`);
  }
  listSearch.querySelectorAll(".item").forEach(el=> el.onclick=()=>openClient(el.getAttribute("data-client")));
}

function computeClientModels(client, readyOnly){
  const modelsMap=DATA.ordersByClientModel.get(client);
  if(!modelsMap) return [];
  const res=[];
  modelsMap.forEach((req, model)=>{
    const del=(DATA.deliveredByClientModel.get(client)?.get(model))||0;
    const rem=Math.max(0, req-del);
    if(rem<=0) return;
    if(readyOnly){
      const inStock=DATA.stockSet.has(model);
      const qtyInStock=DATA.stockQty.get(model)||0;
      if(!inStock||qtyInStock<=0) return;
    }
    res.push({model,required:req,delivered:del,remaining:rem});
  });
  res.sort((a,b)=>(b.remaining||0)-(a.remaining||0));
  return res;
}

function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }

function openClient(clientName){
  const client=norm(clientName);
  const c=DASHBOARD.find(x=>norm(x.client)===client);
  if(!c) return;
  CURRENT_CLIENT=client;
  DELIVERY_DRAFT=new Map();

  const status=READY_ONLY?c.statusReady:c.statusAll;
  const req=READY_ONLY?c.readyRequired:c.requiredAll;
  const del=READY_ONLY?c.readyDelivered:c.deliveredAll;
  const rem=READY_ONLY?c.readyRemaining:c.remainingAll;

  dClient.textContent=client;
  dMeta.textContent=c.invoices?("فواتير: "+c.invoices):"بدون فواتير";
  kReq.textContent=req; kDel.textContent=del; kRem.textContent=rem; kStatus.textContent=status;

  CURRENT_MODELS=computeClientModels(client, READY_ONLY);
  mCount.textContent=CURRENT_MODELS.length+" موديل";
  renderClientModelsTable();
  copyHint.textContent="";
  drawer.classList.remove("hide");
}

function renderClientModelsTable(){
  if(!CURRENT_MODELS.length){ mTable.innerHTML='<div class="muted">لا يوجد موديلات متبقية</div>'; return; }
  let html='<div class="table"><div class="trow head"><div>موديل</div><div>مطلوب</div><div>متبقي</div><div>تسليم</div></div>';
  for(const m of CURRENT_MODELS){
    const v=DELIVERY_DRAFT.get(m.model)||0;
    html += `
      <div class="trow">
        <div class="strong">${esc(m.model)}</div>
        <div>${esc(m.required)}</div>
        <div>${esc(m.remaining)}</div>
        <div class="qty">
          <button class="qbtn" data-m="${esc(m.model)}" data-d="-1">−</button>
          <input class="qin" data-i="${esc(m.model)}" value="${esc(v||"")}" inputmode="numeric" placeholder="0" />
          <button class="qbtn" data-m="${esc(m.model)}" data-d="1">+</button>
        </div>
      </div>`;
  }
  html += "</div>";
  mTable.innerHTML=html;

  mTable.querySelectorAll(".qbtn").forEach(btn=>{
    btn.onclick=()=>{
      const model=btn.getAttribute("data-m");
      const dir=Number(btn.getAttribute("data-d"))||0;
      const m=CURRENT_MODELS.find(x=>String(x.model)===String(model));
      if(!m) return;
      const cur=DELIVERY_DRAFT.get(model)||0;
      const next=clamp(cur+dir,0,m.remaining);
      if(next<=0) DELIVERY_DRAFT.delete(model); else DELIVERY_DRAFT.set(model,next);
      renderClientModelsTable();
    };
  });
  mTable.querySelectorAll(".qin").forEach(inp=>{
    inp.onchange=()=>{
      const model=inp.getAttribute("data-i");
      const m=CURRENT_MODELS.find(x=>String(x.model)===String(model));
      if(!m) return;
      const v=clamp(toNum(inp.value),0,m.remaining);
      if(v<=0) DELIVERY_DRAFT.delete(model); else DELIVERY_DRAFT.set(model,v);
      renderClientModelsTable();
    };
  });
}

function formatDT(d){ try{return new Date(d).toLocaleString("ar-EG");}catch{return String(d);} }

function buildOutRowsText(){
  if(!CURRENT_CLIENT) return "";
  const now=new Date();
  const rows=[];
  DELIVERY_DRAFT.forEach((qty, model)=>{
    if(qty<=0) return;
    rows.push(["تسليم", formatDT(now), CURRENT_CLIENT, model, qty].join("\t"));
  });
  return rows.join("\n");
}

function buildWhatsText(){
  const now=new Date();
  const lines=[];
  DELIVERY_DRAFT.forEach((qty, model)=>{ if(qty>0) lines.push("▫️ "+model+" — "+qty+" قطعة"); });
  const total=Array.from(DELIVERY_DRAFT.values()).reduce((a,b)=>a+(b||0),0);
  return ["🚚 *تسليم - متابعة الطلبات*","👤 العميل: *"+CURRENT_CLIENT+"*","🗓️ "+formatDT(now),"— — —","📦 التفاصيل:",(lines.join("\n")||"لا يوجد"),"— — —","✅ إجمالي القطع: "+total].join("\n");
}

async function copyText(txt){
  try{ await navigator.clipboard.writeText(txt); return true; }
  catch{ try{ window.prompt("انسخ النص يدويًا:", txt); }catch{} return false; }
}

function closeDrawer(){ drawer.classList.add("hide"); }

btnClose.onclick=closeDrawer;
drawer.addEventListener("click",(e)=>{ if(e.target===drawer) closeDrawer(); });

btnCopyRows.onclick=async()=>{
  if(!DELIVERY_DRAFT.size) return alert("حدد كميات للتسليم أولاً");
  const ok=await copyText(buildOutRowsText());
  copyHint.textContent = ok ? "✅ تم النسخ. الصق في شيت “الصادر”." : "ℹ️ تم عرض النص للنسخ اليدوي.";
};

btnWhats.onclick=()=>{
  if(!DELIVERY_DRAFT.size) return alert("حدد كميات للتسليم أولاً");
  window.open("https://wa.me/?text="+encodeURIComponent(buildWhatsText()), "_blank");
};

// Login (client-side)
function login(username, password){
  const u=norm(username), p=norm(password);
  if(!u||!p) return {ok:false};
  const users=(window.__USERS__||[]);
  if(!users.length) return {ok:false, error:"لا يوجد USERS"};
  const keys=Object.keys(users[0]||{});
  const cu=pickCol(keys, CANDS.USER.user, 0);
  const cp=pickCol(keys, CANDS.USER.pass, 1);
  const cr=pickCol(keys, CANDS.USER.role, 2);
  for(const r of users){
    const vals=keys.map(k=>r[k]);
    if(norm(vals[cu])===u && norm(vals[cp])===p) return {ok:true, role:norm(vals[cr])};
  }
  return {ok:false};
}

btnLogin.onclick=async()=>{
  if(!(window.__USERS__ && window.__USERS__.length)) await loadAll(true);
  const r=login($("u").value, $("p").value);
  if(!r.ok) return alert("بيانات غير صحيحة");
  saveSession({ok:true, role:r.role||""});
  loginView.classList.add("hide");
  appView.classList.remove("hide");
  setReady(false);
  renderModelsByPrefix();
  if(AUTO_T) clearInterval(AUTO_T);
  AUTO_T=setInterval(()=>loadAll(false), AUTO_REFRESH_MS);
};

document.addEventListener("keydown",(e)=>{ if(!appView.classList.contains("hide")) return; if(e.key==="Enter") btnLogin.click(); });

btnRefreshTop.onclick=()=>loadAll(true);
chipAll.onclick=()=>setReady(false);
chipReady.onclick=()=>setReady(true);

qClients.oninput=renderDashboard;
qSearch.oninput=renderSearch;

document.querySelectorAll(".seg__btn").forEach(b=>{
  b.onclick=()=>{
    setTab(b.dataset.tab);
    if(b.dataset.tab==="models") renderModelsByPrefix();
    if(b.dataset.tab==="search") renderSearch();
  };
});

function renderModelsByPrefix(){
  const data={};
  DATA.ordersByClientModel.forEach((modelsMap, client)=>{
    modelsMap.forEach((qty, model)=>{
      if(!model) return;
      const num=Number(model);
      const prefix=(!isNaN(num)&&num<1000)?String(model).substring(0,1):String(model).substring(0,2);
      data[prefix]=data[prefix]||{};
      data[prefix][model]=data[prefix][model]||{total:0,clients:[]};
      data[prefix][model].total+=qty;
      data[prefix][model].clients.push({client, qty});
    });
  });
  const prefixes=Object.keys(data).sort((a,b)=>String(a).localeCompare(String(b),"ar"));
  let html="";
  for(const p of prefixes){
    const arr=Object.entries(data[p]).map(([model,obj])=>({model,total:obj.total,clients:obj.clients})).sort((a,b)=>(b.total||0)-(a.total||0));
    const sum=arr.reduce((a,b)=>a+(b.total||0),0);
    let table='<div class="table"><div class="trow head"><div>موديل</div><div>المطلوب</div><div style="grid-column:span 2">تفصيل العملاء</div></div>';
    for(const m of arr){
      const clients=(m.clients||[]).map(c=>`${esc(c.client)} (${esc(c.qty)})`).join("<br>");
      table+=`<div class="trow"><div>${esc(m.model)}</div><div>${esc(m.total)}</div><div style="grid-column:span 2;font-size:12px;color:var(--muted)">${clients}</div></div>`;
    }
    table+="</div>";
    html+=`<div class="card" style="margin-bottom:10px"><div class="card__head"><div class="strong">بادئة ${esc(p)}</div><div class="pill">المجموع: ${esc(sum)}</div></div>${table}</div>`;
  }
  modelsWrap.innerHTML = html || '<div class="card"><div class="strong">لا توجد بيانات</div></div>';
}

(function init(){
  const s=loadSession();
  if(s && s.ok){ loginView.classList.add("hide"); appView.classList.remove("hide"); }
  loadAll(false);
})();

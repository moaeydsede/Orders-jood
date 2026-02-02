function doLogin(){
  const u = norm(($("user").value || "").replace(/^\uFEFF/, "")).trim();
  const p = norm(($("pass").value || "").replace(/^\uFEFF/, "")).trim();

  if(!u || !p) return alert("اكتب اسم المستخدم وكلمة المرور");

  if(!STATE.users || STATE.users.length === 0){
    alert("⚠️ لا توجد بيانات مستخدمين (CSV USERS فارغ أو غير مقروء). تأكد من Publish + رابط USERS.");
    return;
  }

  const ok = STATE.users.find(x =>
    norm(String(x.user||"")).trim() === u &&
    norm(String(x.pass||"")).trim() === p
  );

  if(!ok){
    alert("بيانات غير صحيحة ❌ (راجع المسافات + ترتيب الأعمدة + نشر الشيت)");
    return;
  }

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

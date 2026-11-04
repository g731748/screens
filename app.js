(function(){
  'use strict';
  var C = window.CONFIG || {};
  var root = document.getElementById('app'), toastT = null;
  function el(t, c, x){ var e = document.createElement(t); if(c) e.className = c; if(x != null) e.textContent = x; return e; }
  function toast(m){ var t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove('show'); }, 3000); }
  function ok(res){ if(res && res.error){ toast('שגיאה: ' + res.error.message); return false; } return true; }
  function clear(){ root.textContent = ''; }

  if(!C.url || C.url.indexOf('https://') !== 0 || C.url.indexOf('YOUR-PROJECT') > -1 || !window.supabase){
    root.appendChild(el('p', 'err', 'חסרה הגדרת Supabase בקובץ config.js, או שספריית ההתחברות לא נטענה.')); return;
  }
  var sb = window.supabase.createClient(C.url, C.key);

  var CATS = window.CATS, catOf = window.catOf;
  var MODS = {shabbat:'זמני שבת וחגים', ticker:'פס רץ וחיזוקים'};
  var PERIODS = {all:'כל היום', m:'בוקר (עד 12:00)', n:'צהריים (12:00 עד 17:00)', e:'ערב (אחרי 17:00)', w:'ימי חול בלבד', f:'שישי בלבד'};
  var TIERS = {base:'בסיס', prem:'פרימיום'}, EQ = {dep:'ערבון', buy:'נרכש'};
  var TYPES = {'מאפייה':['shabbat', 'ticker'], 'בית כנסת':['shabbat', 'ticker'], 'מספרה':[], 'מרפאה':[], 'חנות':[], 'אחר':[]};

  function shell(title, extra){
    clear();
    var top = el('div', 'top'), inn = el('div', 'top-in');
    inn.appendChild(el('div', 'brand', title));
    var r = el('div', 'acts');
    if(extra) r.appendChild(extra);
    var out = el('button', null, 'יציאה'); out.type = 'button';
    out.addEventListener('click', function(){ sb.auth.signOut().then(start); });
    r.appendChild(out); inn.appendChild(r); top.appendChild(inn); root.appendChild(top);
    var m = el('main'); root.appendChild(m); return m;
  }
  function field(label, node, cls){ var l = el('label', cls || null); l.appendChild(document.createTextNode(label)); l.appendChild(node); return l; }
  function input(type, id, val){ var i = el('input'); i.type = type; if(id) i.id = id; if(val != null) i.value = val; return i; }
  function select(map, val){ var s = el('select'); Object.keys(map).forEach(function(k){ var o = el('option', null, map[k]); o.value = k; s.appendChild(o); }); if(val) s.value = val; return s; }
  function nul(v){ return v ? v : null; }
  function dmy(iso){ var p = iso.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
  function agoText(ts){
    if(!ts) return ['לא התחבר עדיין', 'warn'];
    var m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if(m < 5) return ['מחובר', 'ok'];
    if(m < 60) return ['לא מדווח ' + m + ' דק׳', 'warn'];
    if(m < 1440) return ['לא מחובר ' + Math.round(m / 60) + ' שעות', 'bad'];
    return ['לא מחובר ' + Math.round(m / 1440) + ' ימים', 'bad'];
  }
  function sparkline(pings){
    var d = el('div', 'spark'), base = Math.floor(Date.now() / 3600000) * 3600000;
    for(var k = 23; k >= 0; k--){ var t = base - k * 3600000, i = el('i', pings[t] ? '' : 'x'); i.style.height = (pings[t] ? 22 : 8) + 'px'; d.appendChild(i); }
    d.title = '24 שעות אחרונות: כל עמודה היא שעה. אדום זה שעה בלי חיבור.';
    return d;
  }

  /* ---------- login ---------- */
  function renderLogin(){
    clear();
    var f = el('form', 'login');
    f.appendChild(el('div', 'logo', 'ניהול מסך'));
    var u = input('email', 'u'); u.autocomplete = 'username'; u.required = true;
    var p = input('password', 'p'); p.autocomplete = 'current-password'; p.required = true;
    f.appendChild(field('אימייל', u)); f.appendChild(field('סיסמה', p));
    var err = el('p', 'err', ''); f.appendChild(err);
    var b = el('button', 'p', 'כניסה'); b.type = 'submit'; f.appendChild(b);
    f.appendChild(el('p', 'note', 'שכחתם סיסמה? פנו למיכאל מערכות.'));
    f.addEventListener('submit', function(e){
      e.preventDefault(); err.textContent = ''; b.disabled = true;
      sb.auth.signInWithPassword({email:u.value.trim(), password:p.value}).then(function(r){
        b.disabled = false;
        if(r.error){ err.textContent = 'אימייל או סיסמה לא נכונים'; return; }
        start();
      });
    });
    root.appendChild(f);
  }
  function renderMsg(t){ var m = shell('ניהול מסך'); m.appendChild(el('p', 'sub', t)); }

  function start(){
    sb.auth.getSession().then(function(r){
      var s = r.data && r.data.session;
      if(!s) return renderLogin();
      sb.from('profiles').select('role,client_id').eq('id', s.user.id).maybeSingle().then(function(p){
        if(p.error || !p.data) return renderMsg('אין פרופיל למשתמש הזה. פנו למיכאל מערכות.');
        if(p.data.role === 'admin') return renderAdmin();
        if(p.data.client_id) return renderClient(p.data.client_id, false);
        renderMsg('המשתמש עדיין לא קושר ללקוח. פנו למיכאל מערכות.');
      });
    });
  }

  /* ---------- admin ---------- */
  function playerLink(token){ return location.href.replace(/[^\/]*$/, '').replace(/#.*$/, '') + 'player.html?t=' + token; }
  function copy(text, label){
    try{ navigator.clipboard.writeText(text).then(function(){ toast(label + ' הועתק'); }, function(){ window.prompt('העתיקו:', text); }); }
    catch(e){ window.prompt('העתיקו:', text); }
  }
  var adminTimer = null;
  function renderAdmin(){
    clearInterval(adminTimer);
    var m = shell('מיכאל מערכות • אדמין');
    m.appendChild(el('h1', null, 'לקוחות'));
    m.appendChild(el('p', 'sub', 'כל לקוח רואה רק את המסך שלו. השעיה חוסמת את הכניסה והמסך מציג הודעת חידוש מנוי. הדף מתעדכן לבד כל חצי דקה.'));
    var kp = el('div', 'kpis'); m.appendChild(kp);
    var box = el('div', 'box'), sc = el('div', 'scroll'); box.appendChild(sc); m.appendChild(box);
    var formsDone = false;
    function load(){
      if(!document.body.contains(box)){ clearInterval(adminTimer); return; }
      Promise.all([
        sb.from('clients').select('*, screens(id,name,token,last_seen,player_ver)').order('created_at'),
        sb.from('screen_pings').select('screen_id,hour').gte('hour', new Date(Date.now() - 25 * 3600000).toISOString())
      ]).then(function(rs){
        var r = rs[0]; if(!ok(r)) return;
        var pingMap = {}; ((rs[1] && rs[1].data) || []).forEach(function(p){ (pingMap[p.screen_id] = pingMap[p.screen_id] || {})[new Date(p.hour).getTime()] = 1; });
        var clients = r.data || [], okN = 0, warnN = 0, badN = 0;
        var tb = el('table'), th = el('thead'), hr = el('tr');
        ['לקוח', 'סוג', 'מסלול', 'ציוד', 'מסך', 'מצב', '24 שעות', 'גרסה', 'פעולות'].forEach(function(h){ hr.appendChild(el('th', null, h)); });
        th.appendChild(hr); tb.appendChild(th);
        var body = el('tbody');
        clients.forEach(function(c){
          var scr = (c.screens && c.screens[0]) || null, tr = el('tr');
          tr.appendChild(el('td', null, c.name)); tr.appendChild(el('td', null, (CATS[catOf(c.biz_type)] || {}).n || ''));
          var t = el('td'); t.appendChild(el('span', 'pill tier', TIERS[c.tier])); tr.appendChild(t);
          tr.appendChild(el('td', null, EQ[c.equipment]));
          var st = el('td'), a = scr ? agoText(scr.last_seen) : ['אין מסך', 'warn'];
          if(c.active){ if(a[1] === 'ok') okN++; else if(a[1] === 'warn') warnN++; else badN++; }
          st.appendChild(el('span', 'pill ' + (c.active ? a[1] : 'warn'), c.active ? a[0] : 'מושעה'));
          tr.appendChild(el('td', null, scr ? scr.name : '')); tr.appendChild(st);
          var sp = el('td'); if(scr) sp.appendChild(sparkline(pingMap[scr.id] || {})); tr.appendChild(sp);
          tr.appendChild(el('td', 'note', scr && scr.player_ver ? scr.player_ver : ''));
          var ac = el('td'), row = el('div', 'acts');
          function btn(txt, cls, fn){ var x = el('button', cls || null, txt); x.type = 'button'; x.addEventListener('click', fn); row.appendChild(x); }
          btn('פתח כלקוח', null, function(){ clearInterval(adminTimer); renderClient(c.id, true); });
          btn('הגדרות', null, function(){ clearInterval(adminTimer); renderEdit(c, scr); });
          if(scr){
            btn('קישור נגן', null, function(){ copy(playerLink(scr.token), 'הקישור'); });
            btn('רענן נגן', null, function(){ sb.rpc('admin_send_cmd', {p_screen:scr.id, p_cmd:'reload'}).then(function(x){ if(ok(x)) toast('הפקודה נשלחה, המסך יתרענן תוך כדקה'); }); });
          }
          btn(c.active ? 'השעה' : 'החזר גישה', c.active ? 'd' : null, function(){
            sb.from('clients').update({active:!c.active}).eq('id', c.id).then(function(x){ if(ok(x)){ toast(c.active ? 'הלקוח הושעה' : 'הגישה הוחזרה'); load(); } });
          });
          ac.appendChild(row); tr.appendChild(ac); body.appendChild(tr);
        });
        tb.appendChild(body); sc.textContent = ''; sc.appendChild(tb);
        if(!clients.length) sc.appendChild(el('p', 'note', 'עדיין אין לקוחות. הוסיפו את הראשון למטה.'));
        kp.textContent = '';
        [[okN, 'מסכים מחוברים', 'ok'], [warnN, 'לא מדווחים', 'warn'], [badN, 'בלי חיבור מעל שעה', 'bad']].forEach(function(k){
          var d = el('div', 'kpi ' + k[2]); d.appendChild(el('b', null, String(k[0]))); d.appendChild(el('span', null, k[1])); kp.appendChild(d);
        });
        if(!formsDone){ formsDone = true; m.appendChild(addClientForm(clients)); m.appendChild(linkForm(clients)); m.appendChild(alertBox()); }
      });
    }
    load(); adminTimer = setInterval(load, 30000);
  }
  function alertBox(){
    var box = el('div', 'box'); box.appendChild(el('h2', null, 'התראות על מסך שנופל'));
    box.appendChild(el('p', 'note', 'אם מסך לא מדווח 10 דקות, יישלח אליך אימייל אחד, ועוד אחד כשהוא חוזר. לא נשלחות הודעות בשבת (משישי 14:00 עד מוצאי שבת 20:00) ובלילה (22:00 עד 05:30). חגים עדיין לא מוגדרים.'));
    var f = el('form'), en = input('checkbox', null), ph = input('email', null), key = input('text', null);
    ph.placeholder = 'name@gmail.com'; ph.dir = 'ltr'; key.dir = 'ltr'; key.placeholder = 're_...';
    var l = el('label', 'chk'); l.appendChild(en); l.appendChild(document.createTextNode('התראות פעילות')); f.appendChild(l);
    f.appendChild(field('אימייל לקבלת ההתראות', ph)); f.appendChild(field('מפתח Resend', key));
    var hint = el('p', 'note full', ''); f.appendChild(hint);
    var go = el('button', 'p', 'שמור'); go.type = 'submit'; f.appendChild(go);
    var test = el('button', null, 'שלח הודעת בדיקה'); test.type = 'button'; f.appendChild(test);
    sb.rpc('admin_get_alert').then(function(r){
      if(r.error || !r.data) return;
      en.checked = !!r.data.enabled; ph.value = r.data.email || '';
      hint.textContent = r.data.has_key ? 'מפתח שמור. השאירו ריק כדי לא לשנות.' : 'עדיין לא נשמר מפתח.';
    });
    f.addEventListener('submit', function(e){
      e.preventDefault();
      sb.rpc('admin_save_alert', {p_enabled:en.checked, p_email:ph.value.trim(), p_key:key.value.trim() || null}).then(function(r){ if(ok(r)){ toast('נשמר'); key.value = ''; hint.textContent = 'מפתח שמור. השאירו ריק כדי לא לשנות.'; } });
    });
    test.addEventListener('click', function(){
      sb.rpc('admin_test_alert').then(function(r){ if(ok(r)) toast('נשלחה הודעת בדיקה. אם לא הגיעה תוך דקה, בדקו אימייל ומפתח, ואת תיבת הספאם.'); });
    });
    box.appendChild(f); return box;
  }
  function addClientForm(){
    var box = el('div', 'box'); box.appendChild(el('h2', null, 'הוספת לקוח'));
    var f = el('form'), n = input('text', 'n'); n.required = true;
    var ty = select(Object.keys(CATS).reduce(function(o, k){ o[k] = CATS[k].n; return o; }, {}), 'biz');
    var tr = select(TIERS), eq = select(EQ);
    var info = el('div', 'note full');
    f.appendChild(field('שם הלקוח', n)); f.appendChild(field('קטגוריה', ty)); f.appendChild(info); f.appendChild(field('מסלול', tr)); f.appendChild(field('ציוד', eq));
    var fs = el('fieldset'); fs.appendChild(el('legend', null, 'יכולות בממשק הלקוח'));
    var boxes = {};
    Object.keys(MODS).forEach(function(k){ var l = el('label', 'chk'), i = input('checkbox', null); boxes[k] = i; l.appendChild(i); l.appendChild(document.createTextNode(MODS[k])); fs.appendChild(l); });
    function defaults(){
      var c = CATS[ty.value]; tr.value = c.tier; eq.value = c.eq;
      Object.keys(boxes).forEach(function(k){ boxes[k].checked = c.mods.indexOf(k) > -1; });
      info.textContent = c.s + '. ' + c.plan + ' ציוד מומלץ: ' + c.equip;
    }
    ty.addEventListener('change', defaults); defaults(); f.appendChild(fs);
    var msg = el('p', 'note full', ''), go = el('button', 'p', 'צור לקוח'); go.type = 'submit';
    f.appendChild(go); f.appendChild(msg);
    f.addEventListener('submit', function(e){
      e.preventDefault(); go.disabled = true;
      var mods = Object.keys(boxes).filter(function(k){ return boxes[k].checked; });
      sb.from('clients').insert({name:n.value.trim(), biz_type:ty.value, tier:tr.value, equipment:eq.value, modules:mods}).select().single().then(function(r){
        if(!ok(r)){ go.disabled = false; return; }
        sb.from('screens').insert({client_id:r.data.id}).select().single().then(function(s){
          go.disabled = false; if(!ok(s)) return;
          msg.textContent = 'נוצר. קישור הנגן למסך: ' + playerLink(s.data.token) + '\nצ׳קליסט קליטה: ' + CATS[ty.value].ck.map(function(x, i){ return (i + 1) + '. ' + x; }).join('  |  ');
          msg.style.whiteSpace = 'pre-wrap';
          toast('הלקוח נוצר'); setTimeout(renderAdmin, 15000);
        });
      });
    });
    box.appendChild(f); return box;
  }
  function linkForm(clients){
    var box = el('div', 'box'); box.appendChild(el('h2', null, 'קישור משתמש ללקוח'));
    box.appendChild(el('p', 'note', 'קודם יוצרים משתמש ב-Supabase: Authentication, Users, Add user (עם סימון Auto Confirm). אחר כך מקשרים כאן את האימייל ללקוח.'));
    var f = el('form'), em = input('email', 'le'); em.required = true;
    var sel = el('select'); clients.forEach(function(c){ var o = el('option', null, c.name); o.value = c.id; sel.appendChild(o); });
    f.appendChild(field('אימייל המשתמש', em)); f.appendChild(field('לקוח', sel));
    var go = el('button', 'p', 'קשר'); go.type = 'submit'; f.appendChild(go);
    f.addEventListener('submit', function(e){
      e.preventDefault();
      sb.rpc('admin_link_user', {p_email:em.value.trim(), p_client:sel.value}).then(function(r){ if(ok(r)){ toast('המשתמש קושר ללקוח'); em.value = ''; } });
    });
    box.appendChild(f); return box;
  }
  function renderEdit(c, scr){
    var back = el('button', null, 'חזרה'); back.type = 'button'; back.addEventListener('click', renderAdmin);
    var m = shell('הגדרות • ' + c.name, back);
    var box = el('div', 'box'), f = el('form');
    var n = input('text', null, c.name), tr = select(TIERS, c.tier), eq = select(EQ, c.equipment);
    f.appendChild(field('שם העסק', n)); f.appendChild(field('מסלול', tr)); f.appendChild(field('ציוד', eq));
    var fs = el('fieldset'); fs.appendChild(el('legend', null, 'יכולות'));
    var boxes = {};
    Object.keys(MODS).forEach(function(k){ var l = el('label', 'chk'), i = input('checkbox', null); i.checked = (c.modules || []).indexOf(k) > -1; boxes[k] = i; l.appendChild(i); l.appendChild(document.createTextNode(MODS[k])); fs.appendChild(l); });
    f.appendChild(fs);
    var go = el('button', 'p', 'שמור'); go.type = 'submit'; f.appendChild(go);
    f.addEventListener('submit', function(e){
      e.preventDefault();
      sb.from('clients').update({name:n.value.trim(), tier:tr.value, equipment:eq.value, modules:Object.keys(boxes).filter(function(k){ return boxes[k].checked; })}).eq('id', c.id).then(function(r){ if(ok(r)){ toast('נשמר'); renderAdmin(); } });
    });
    box.appendChild(f); m.appendChild(box);
    if(scr){ var b2 = el('div', 'box'); b2.appendChild(el('h2', null, 'קישור נגן')); b2.appendChild(el('p', 'note', playerLink(scr.token))); m.appendChild(b2); }
  }

  /* ---------- customer ---------- */
  function resize(file, max){
    return new Promise(function(res, rej){
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function(){
        var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(function(b){ b ? res(b) : rej(new Error('המרה נכשלה')); }, 'image/jpeg', 0.86);
      };
      img.onerror = function(){ rej(new Error('הקובץ אינו תמונה')); }; img.src = url;
    });
  }
  function pubUrl(path){ return sb.storage.from('slides').getPublicUrl(path).data.publicUrl; }

  var slideState = {rows:[], draw:null};
  function onSlides(rows){ slideState.rows = rows; if(slideState.draw) slideState.draw(); }
  var WHEN = {all:'כל היום', m:'בוקר', n:'צהריים', e:'ערב', f:'שישי בלבד', w:'ימי חול'};
  function chips(map, initial, onPick){
    var wrap = el('div', 'chips'), cur = initial, btns = {};
    Object.keys(map).forEach(function(k){
      var b = el('button', 'chip', map[k]); b.type = 'button'; b.setAttribute('aria-pressed', k === cur ? 'true' : 'false');
      b.addEventListener('click', function(){ cur = k; Object.keys(btns).forEach(function(x){ btns[x].setAttribute('aria-pressed', x === k ? 'true' : 'false'); }); if(onPick) onPick(k); });
      btns[k] = b; wrap.appendChild(b);
    });
    return {node:wrap, get:function(){ return cur; }};
  }
  function localDate(){ var d = new Date(), p = function(n){ return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function shownAt(s, hour, fri){
    if(!s.enabled) return false;
    var today = localDate();
    if(s.from_date && today < s.from_date) return false;
    if(s.to_date && today > s.to_date) return false;
    switch(s.period){
      case 'm': return hour < 12;
      case 'n': return hour >= 12 && hour < 17;
      case 'e': return hour >= 17;
      case 'w': return !fri;
      case 'f': return fri;
      default: return true;
    }
  }

  function statusRow(cid){
    var row = el('div', 'statusrow'), pill = el('span', 'pill warn', 'בודק חיבור...'); row.appendChild(pill);
    sb.from('screens').select('name,last_seen').eq('client_id', cid).then(function(r){
      var s = r.data && r.data[0];
      if(!s){ pill.textContent = 'אין מסך מחובר'; return; }
      var a = agoText(s.last_seen);
      pill.className = 'pill ' + (a[1] === 'ok' ? 'ok' : 'warn');
      pill.textContent = a[1] === 'ok' ? 'המסך מחובר' : 'המסך לא מחובר כרגע';
      if(a[1] !== 'ok') row.appendChild(el('span', 'note', 'בדקו שהמסך דלוק ושיש אינטרנט. אם זה נמשך, פנו אלינו.'));
    });
    return row;
  }
  function previewBox(){
    var box = el('div', 'box'); box.appendChild(el('h2', null, 'מה מוצג במסך'));
    var tv = el('div', 'tvp'), info = el('p', 'note'), fri = false, now = new Date();
    var slider = input('range', null, String(Math.min(23, Math.max(5, now.getHours()))));
    slider.min = 5; slider.max = 23; slider.setAttribute('aria-label', 'שעה ביום');
    var day = chips({w:'יום חול', f:'שישי'}, 'w', function(k){ fri = (k === 'f'); draw(); });
    function draw(){
      var h = +slider.value, list = slideState.rows.filter(function(s){ return shownAt(s, h, fri); });
      tv.textContent = '';
      if(!list.length){ tv.appendChild(el('div', 'tvp-empty', slideState.rows.length ? 'בשעה הזו אין תמונה. יוצג מסך עם שם העסק.' : 'עדיין אין תמונות')); }
      else { var im = el('img'); im.alt = ''; im.src = pubUrl(list[0].image_path); tv.appendChild(im); }
      info.textContent = 'בשעה ' + h + ':00 ' + (fri ? 'בשישי' : 'ביום חול') + ': ' + (list.length ? list.length + (list.length > 1 ? ' תמונות בסבב' : ' תמונה') : 'אין תמונות');
    }
    slideState.draw = draw; slider.addEventListener('input', draw);
    box.appendChild(tv); box.appendChild(slider); box.appendChild(info); box.appendChild(day.node); draw();
    return box;
  }

  function renderClient(cid, asAdmin){
    var extra = null;
    if(asAdmin){ extra = el('button', null, 'חזרה לאדמין'); extra.type = 'button'; extra.addEventListener('click', renderAdmin); }
    sb.from('clients').select('*').eq('id', cid).maybeSingle().then(function(r){
      if(!ok(r) || !r.data){ shell('ניהול מסך', extra).appendChild(el('p', 'sub', 'לא נמצאו נתוני לקוח.')); return; }
      var c = r.data, m = shell(c.name, extra);
      if(!c.active){ m.appendChild(el('h1', null, 'החשבון מושעה')); m.appendChild(el('p', 'sub', 'פנו למיכאל מערכות להחזרת הגישה.')); return; }
      slideState = {rows:[], draw:null};
      m.appendChild(el('h1', null, 'התמונות במסך'));
      m.appendChild(statusRow(cid));
      m.appendChild(el('p', 'sub', 'שינויים מופיעים במסך תוך כדקה.'));
      var mods = c.modules || [];
      m.appendChild(previewBox());
      var slidesBox = el('div', 'box'); m.appendChild(slidesBox);
      var refresh = function(){ loadSlides(cid, slidesBox); };
      var ed = el('div', 'box'); ed.appendChild(el('h2', null, 'עורך עיצוב מלא'));
      ed.appendChild(el('p', 'note', 'רקעים מגלריה, טקסט חופשי, תמונות, גרירה, הגדלה וסיבוב, בדומה לקנבה.'));
      var eb = el('a', 'btn p', 'פתח את העורך'); eb.href = 'editor.html?c=' + encodeURIComponent(cid); ed.appendChild(eb); m.appendChild(ed);
      m.appendChild(uploadBox(cid, refresh));
      m.appendChild(templateBox(cid, c.name, refresh));
      if(mods.indexOf('ticker') > -1) m.appendChild(tickerBox(cid));
      if(mods.indexOf('shabbat') > -1) m.appendChild(shabbatBox(cid));
      var help = el('a', 'btn p helpbtn', 'שלחו הודעה למיכאל מערכות');
      help.href = 'https://wa.me/972534339050?text=' + encodeURIComponent('שלום, אני מ' + c.name + ' ומבקש עזרה במסך'); help.target = '_blank'; help.rel = 'noopener';
      m.appendChild(help);
      refresh();
    });
  }
  function loadSlides(cid, box){
    sb.from('slides').select('*').eq('client_id', cid).order('position').then(function(r){
      if(!ok(r)) return; box.textContent = '';
      var rows = r.data || []; onSlides(rows);
      if(!rows.length){ box.appendChild(el('p', 'note', 'עדיין אין תמונות. העלו את הראשונה למטה.')); return; }
      rows.forEach(function(s, i){
        var row = el('div', 'srow' + (s.enabled ? '' : ' off'));
        var im = el('img'); im.src = pubUrl(s.image_path); im.alt = ''; row.appendChild(im);
        var t = el('div', 't'); t.appendChild(el('b', null, s.title || 'תמונה ' + (i + 1)));
        var meta = PERIODS[s.period] + (s.from_date ? ' • מ-' + dmy(s.from_date) : '') + (s.to_date ? ' • עד ' + dmy(s.to_date) : '') + ' • ' + s.dur + ' שנ׳';
        t.appendChild(el('span', 'note', meta)); row.appendChild(t);
        var ac = el('div', 'acts');
        function b(txt, fn, cls){ var x = el('button', cls || null, txt); x.type = 'button'; x.addEventListener('click', fn); ac.appendChild(x); }
        function move(d){
          var j = i + d; if(j < 0 || j >= rows.length) return;
          var order = rows.slice(); var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
          Promise.all(order.map(function(o, k){ return o.position === k ? null : sb.from('slides').update({position:k}).eq('id', o.id); }).filter(Boolean)).then(function(){ loadSlides(cid, box); });
        }
        b('למעלה', function(){ move(-1); }); b('למטה', function(){ move(1); });
        b(s.enabled ? 'מוצגת' : 'מוסתרת', function(){ sb.from('slides').update({enabled:!s.enabled}).eq('id', s.id).then(function(x){ if(ok(x)) loadSlides(cid, box); }); });
        b('עריכה', function(){ openEdit(); });
        b('מחק', function(){
          if(!row.dataset.sure){ row.dataset.sure = '1'; toast('לחצו שוב על מחק לאישור'); return; }
          sb.from('slides').delete().eq('id', s.id).then(function(x){ if(ok(x)){ sb.storage.from('slides').remove([s.image_path]); loadSlides(cid, box); } });
        }, 'd');
        row.appendChild(ac);
        var edit = null;
        function openEdit(){
          if(edit){ row.removeChild(edit); edit = null; return; }
          edit = el('div', 'edit');
          var ti = input('text', null, s.title || ''), pe = select(PERIODS, s.period), fr = input('date', null, s.from_date || ''), to = input('date', null, s.to_date || ''), du = input('number', null, s.dur);
          du.min = 3; du.max = 60;
          edit.appendChild(field('כותרת', ti)); edit.appendChild(field('מתי מוצגת', pe)); edit.appendChild(field('מתאריך', fr)); edit.appendChild(field('עד תאריך', to)); edit.appendChild(field('שניות', du));
          var sv = el('button', 'p', 'שמור'); sv.type = 'button';
          sv.addEventListener('click', function(){
            sb.from('slides').update({title:ti.value.trim() || null, period:pe.value, from_date:nul(fr.value), to_date:nul(to.value), dur:Math.max(3, Math.min(60, +du.value || 8))}).eq('id', s.id).then(function(x){ if(ok(x)){ toast('נשמר'); loadSlides(cid, box); } });
          });
          edit.appendChild(sv); row.appendChild(edit);
        }
        box.appendChild(row);
      });
    });
  }
  /* shared: resize/upload a picture and add it to the screen list */
  function addSlide(cid, blob, meta){
    var path = cid + '/' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + '.jpg';
    return sb.storage.from('slides').upload(path, blob, {contentType:'image/jpeg'}).then(function(u){
      if(u.error) throw u.error;
      return sb.from('slides').select('position').eq('client_id', cid).order('position', {ascending:false}).limit(1);
    }).then(function(p){
      var next = p.data && p.data[0] ? p.data[0].position + 1 : 0;
      return sb.from('slides').insert({client_id:cid, image_path:path, title:meta.title || null, period:meta.period || 'all', from_date:meta.from || null, to_date:meta.to || null, dur:Math.max(3, Math.min(60, +meta.dur || 8)), position:next});
    }).then(function(x){ if(x.error) throw x.error; });
  }
  function uploadBox(cid, done){
    var box = el('div', 'box'); box.appendChild(el('h2', null, 'העלאת תמונה'));
    var f = el('form'), file = input('file', null); file.accept = 'image/*'; file.required = true;
    f.appendChild(field('תמונה', file, 'full'));
    var when = chips(WHEN, 'all'), wl = el('div', 'full'); wl.appendChild(el('b', null, 'מתי להציג')); wl.appendChild(when.node); f.appendChild(wl);
    var det = el('details', 'full'); det.appendChild(el('summary', null, 'אפשרויות מתקדמות'));
    var ti = input('text', null), fr = input('date', null), to = input('date', null), du = input('number', null, 8); du.min = 3; du.max = 60;
    det.appendChild(field('כותרת (לא מוצגת במסך)', ti)); det.appendChild(field('מתאריך', fr)); det.appendChild(field('עד תאריך', to)); det.appendChild(field('שניות על המסך', du)); f.appendChild(det);
    var go = el('button', 'p', 'העלה'); go.type = 'submit'; f.appendChild(go);
    f.addEventListener('submit', function(e){
      e.preventDefault(); if(!file.files[0]) return; go.disabled = true; go.textContent = 'מעלה...';
      resize(file.files[0], 1920).then(function(blob){ return addSlide(cid, blob, {title:ti.value.trim(), period:when.get(), from:nul(fr.value), to:nul(to.value), dur:du.value}); }).then(function(){
        go.disabled = false; go.textContent = 'העלה'; toast('התמונה עלתה'); f.reset(); du.value = 8; done();
      }).catch(function(err){ go.disabled = false; go.textContent = 'העלה'; toast('שגיאה: ' + err.message); });
    });
    box.appendChild(f); return box;
  }

  /* ---------- pictures from templates ---------- */
  var TPLS = {sale:'מבצע', menu:'תפריט', notice:'הודעה'};
  var COLORS = {amber:['#a33a12', '#e8873a', 'כתום'], blue:['#14305f', '#3b6fd0', 'כחול'], green:['#17463a', '#3d9a78', 'ירוק'], wine:['#5a1830', '#c04a6a', 'בורדו'], dark:['#10161f', '#2c3a52', 'כהה']};
  function wrapLines(ctx, text, maxW){
    var out = [];
    String(text || '').split('\n').forEach(function(par){
      var words = par.split(/\s+/).filter(Boolean), line = '';
      if(!words.length){ out.push(''); return; }
      words.forEach(function(w){ var t = line ? line + ' ' + w : w; if(ctx.measureText(t).width > maxW && line){ out.push(line); line = w; } else line = t; });
      out.push(line);
    });
    return out;
  }
  function drawTemplate(cv, tpl, col, title, body, brand){
    var W = 1920, H = 1080, ctx = cv.getContext('2d'), pal = COLORS[col] || COLORS.amber;
    cv.width = W; cv.height = H;
    var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.direction = 'rtl'; ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    var F = "'Heebo','Arial',sans-serif";
    if(tpl === 'menu'){
      ctx.textAlign = 'center'; ctx.font = '800 120px ' + F;
      ctx.fillText(title || 'תפריט', W / 2, 190);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(W / 2 - 160, 225, 320, 6); ctx.fillStyle = '#fff';
      var lines = String(body || '').split('\n').filter(function(x){ return x.trim(); }).slice(0, 7), y = 350, step = Math.min(110, 640 / Math.max(lines.length, 1));
      ctx.font = '600 64px ' + F;
      lines.forEach(function(l){
        var p = l.split(/\s*[|\-:]\s*/), name = p[0], price = p[1] || '';
        ctx.textAlign = 'right'; ctx.fillText(name, W - 220, y);
        if(price){ ctx.textAlign = 'left'; ctx.fillText(price, 220, y); }
        y += step;
      });
    } else {
      var big = tpl === 'sale' ? 190 : 130, small = tpl === 'sale' ? 84 : 66;
      ctx.textAlign = 'center'; ctx.font = '800 ' + big + 'px ' + F;
      var tl = wrapLines(ctx, title || (tpl === 'sale' ? 'מבצע מיוחד' : 'הודעה חשובה'), W - 320), lh = big * 1.1;
      ctx.font = '500 ' + small + 'px ' + F; var bl = wrapLines(ctx, body, W - 360), sh = small * 1.35;
      var total = tl.length * lh + (bl.length && body ? 50 + bl.length * sh : 0), y0 = (H - total) / 2 + big * 0.85;
      ctx.font = '800 ' + big + 'px ' + F; tl.forEach(function(l, i){ ctx.fillText(l, W / 2, y0 + i * lh); });
      if(body){ ctx.font = '500 ' + small + 'px ' + F; var y1 = y0 + (tl.length - 1) * lh + 50 + small; bl.forEach(function(l, i){ ctx.fillText(l, W / 2, y1 + i * sh); }); }
    }
    ctx.textAlign = 'center'; ctx.font = '500 44px ' + F; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(brand || '', W / 2, H - 56);
  }
  function templateBox(cid, brand, done){
    var box = el('div', 'box'); box.appendChild(el('h2', null, 'יצירת תמונה מתבנית'));
    box.appendChild(el('p', 'note', 'אין לכם תמונה מוכנה? כתבו טקסט, בחרו תבנית וצבע, והתמונה נוצרת לבד.'));
    var f = el('form'), st = {tpl:'sale', col:'amber'};
    var tp = chips(TPLS, 'sale', function(k){ st.tpl = k; hint(); paint(); });
    var cl = chips(Object.keys(COLORS).reduce(function(o, k){ o[k] = COLORS[k][2]; return o; }, {}), 'amber', function(k){ st.col = k; paint(); });
    var tl = el('div', 'full'); tl.appendChild(el('b', null, 'תבנית')); tl.appendChild(tp.node); f.appendChild(tl);
    var cc = el('div', 'full'); cc.appendChild(el('b', null, 'צבע')); cc.appendChild(cl.node); f.appendChild(cc);
    var ti = input('text', null); ti.maxLength = 60; var body = el('textarea'); body.rows = 4;
    var bl = field('טקסט', body, 'full'), bt = bl.firstChild;
    function hint(){ body.placeholder = st.tpl === 'menu' ? 'שורה לכל מנה: שם | מחיר\nבורקס | 12\nקפה | 8' : 'שורה נוספת (לא חובה)'; bt.textContent = st.tpl === 'menu' ? 'מנות ומחירים' : 'טקסט משני'; }
    f.appendChild(field('כותרת', ti, 'full')); f.appendChild(bl); hint();
    var cv = el('canvas', 'tplcv'); f.appendChild(cv);
    var when = chips(WHEN, 'all'), wl = el('div', 'full'); wl.appendChild(el('b', null, 'מתי להציג')); wl.appendChild(when.node); f.appendChild(wl);
    function paint(){ drawTemplate(cv, st.tpl, st.col, ti.value.trim(), body.value, brand); }
    ti.addEventListener('input', paint); body.addEventListener('input', paint); paint();
    if(document.fonts && document.fonts.load){ Promise.all([document.fonts.load("800 100px Heebo"), document.fonts.load("500 60px Heebo")]).then(paint).catch(function(){}); }
    var go = el('button', 'p', 'הוסף למסך'); go.type = 'submit'; f.appendChild(go);
    f.addEventListener('submit', function(e){
      e.preventDefault(); go.disabled = true; go.textContent = 'מוסיף...'; paint();
      cv.toBlob(function(blob){
        if(!blob){ go.disabled = false; go.textContent = 'הוסף למסך'; toast('יצירת התמונה נכשלה'); return; }
        addSlide(cid, blob, {title:ti.value.trim() || TPLS[st.tpl], period:when.get(), dur:8}).then(function(){
          go.disabled = false; go.textContent = 'הוסף למסך'; toast('התמונה נוספה למסך'); ti.value = ''; body.value = ''; paint(); done();
        }).catch(function(err){ go.disabled = false; go.textContent = 'הוסף למסך'; toast('שגיאה: ' + err.message); });
      }, 'image/jpeg', 0.9);
    });
    box.appendChild(f); return box;
  }
  function tickerBox(cid){
    var box = el('div', 'box'); box.appendChild(el('h2', null, 'פס רץ וחיזוקים'));
    var f = el('form'), mode = select({off:'כבוי', msg:'הודעה בלבד', torah:'חיזוקים בלבד', both:'הודעה וחיזוקים'});
    var msg = input('text', null); msg.maxLength = 140;
    var tor = el('textarea'); tor.placeholder = 'חיזוק בכל שורה';
    f.appendChild(field('מצב', mode)); f.appendChild(field('הודעה למסך', msg)); f.appendChild(field('חיזוקים, שורה לכל חיזוק', tor, 'full'));
    var go = el('button', 'p', 'שמור'); go.type = 'submit'; f.appendChild(go);
    sb.from('settings').select('*').eq('client_id', cid).maybeSingle().then(function(r){
      if(r.data){ mode.value = r.data.ticker_mode; msg.value = r.data.message || ''; tor.value = (r.data.torah || []).join('\n'); }
    });
    f.addEventListener('submit', function(e){
      e.preventDefault();
      sb.from('settings').upsert({client_id:cid, ticker_mode:mode.value, message:msg.value.trim(), torah:tor.value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean)}, {onConflict:'client_id'}).then(function(x){ if(ok(x)) toast('נשמר'); });
    });
    box.appendChild(f); return box;
  }
  function shabbatBox(cid){
    var box = el('div', 'box'); box.appendChild(el('h2', null, 'זמני שבת וחגים'));
    box.appendChild(el('p', 'note', 'כל שורה היא שבת או חג. התמונה עולה במסך שלושה ימים לפני הכניסה ויורדת ביציאה. אין שורה פעילה: אין תמונה, ולא נשארים זמנים ישנים.'));
    var list = el('div'); box.appendChild(list);
    function load(){
      sb.from('shabbat_rows').select('*').eq('client_id', cid).order('eve').then(function(r){
        if(!ok(r)) return; list.textContent = '';
        (r.data || []).forEach(function(x){
          var row = el('div', 'srow'); row.style.gridTemplateColumns = 'minmax(0,1fr) auto';
          row.appendChild(el('span', null, (x.title || 'שבת') + ' • כניסה ' + dmy(x.eve) + ' ' + x.candle + ' • יציאה ' + dmy(x.endd) + ' ' + x.havdalah));
          var d = el('button', 'd', 'מחק'); d.type = 'button';
          d.addEventListener('click', function(){ sb.from('shabbat_rows').delete().eq('id', x.id).then(function(z){ if(ok(z)) load(); }); });
          row.appendChild(d); list.appendChild(row);
        });
        if(!(r.data || []).length) list.appendChild(el('p', 'note', 'הטבלה ריקה.'));
      });
    }
    load();
    var CITIES = {'295530':'באר שבע', '281184':'ירושלים', '293397':'תל אביב', '294801':'חיפה'};
    var af = el('div', 'autofill'); af.appendChild(el('b', null, 'מילוי אוטומטי'));
    var city = select(CITIES, '295530'), mins = input('number', null, 20); mins.min = 0; mins.max = 60;
    af.appendChild(field('עיר', city)); af.appendChild(field('דקות לפני השקיעה להדלקת נרות', mins));
    var ab = el('button', 'p', 'מלא את השבתות והחגים הקרובים'); ab.type = 'button'; af.appendChild(ab);
    af.appendChild(el('p', 'note full', 'הזמנים נמשכים מ-Hebcal.com ונשמרים אצלנו. אפשר לתקן או למחוק שורה בכל שלב.'));
    box.appendChild(af);
    function stripNikud(s){ return String(s || '').replace(/[֑-ׇ]/g, ''); }
    function hebcalUrl(year, geo, b){ return 'https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=off&mod=off&nx=off&year=' + year + '&month=x&ss=off&mf=off&c=on&geo=geoname&geonameid=' + geo + '&M=on&s=on&i=on&b=' + b; }
    function buildRows(items, today, limitDate){
      items = items.slice().sort(function(x, y){ return String(x.date) < String(y.date) ? -1 : 1; });
      var rows = [], open = null;
      items.forEach(function(it){
        var d = String(it.date).slice(0, 10), t = String(it.date).slice(11, 16);
        if(it.category === 'candles' && !open && t){ open = {eve:d, candle:t}; }
        else if(it.category === 'havdalah' && open && t){ open.endd = d; open.havdalah = t; rows.push(open); open = null; }
      });
      rows.forEach(function(r){
        var hol = items.filter(function(it){ var d = String(it.date).slice(0, 10); return it.category === 'holiday' && d >= r.eve && d <= r.endd; });
        var nameOf = function(it){ return stripNikud(it.hebrew || it.title); };
        var real = hol.filter(function(it){ return !/^ערב /.test(nameOf(it)); })[0];
        var par = items.filter(function(it){ return it.category === 'parashat' && String(it.date).slice(0, 10) === r.endd; })[0];
        r.title = real ? nameOf(real) : (par ? nameOf(par) : '');
      });
      return rows.filter(function(r){ return r.endd >= today && r.eve <= limitDate; });
    }
    ab.addEventListener('click', function(){
      ab.disabled = true; ab.textContent = 'טוען...';
      var y = new Date().getFullYear(), geo = city.value, b = Math.max(0, Math.min(60, +mins.value || 20));
      var lim = new Date(Date.now() + 70 * 86400000), limIso = lim.getFullYear() + '-' + ('0' + (lim.getMonth() + 1)).slice(-2) + '-' + ('0' + lim.getDate()).slice(-2);
      Promise.all([y, y + 1].map(function(yy){ return fetch(hebcalUrl(yy, geo, b)).then(function(r){ if(!r.ok) throw new Error('http ' + r.status); return r.json(); }); })).then(function(res){
        var items = [].concat(res[0].items || [], res[1].items || []), rows = buildRows(items, localDate(), limIso);
        if(!rows.length) throw new Error('לא התקבלו זמנים');
        return sb.from('shabbat_rows').select('eve').eq('client_id', cid).then(function(ex){
          var have = {}; (ex.data || []).forEach(function(x){ have[x.eve] = 1; });
          var fresh = rows.filter(function(r){ return !have[r.eve]; }).map(function(r){ return {client_id:cid, eve:r.eve, candle:r.candle, endd:r.endd, havdalah:r.havdalah, title:r.title}; });
          if(!fresh.length){ toast('הכול כבר מעודכן'); return; }
          return sb.from('shabbat_rows').insert(fresh).then(function(x){ if(ok(x)){ load(); toast('נוספו ' + fresh.length + ' שורות'); } });
        });
      }).catch(function(err){ toast('לא הצלחתי למשוך זמנים (' + err.message + '). אפשר להזין ידנית.'); }).then(function(){ ab.disabled = false; ab.textContent = 'מלא את השבתות והחגים הקרובים'; });
    });
    var f = el('form'), eve = input('date', null), c1 = input('time', null), end = input('date', null), h1 = input('time', null), ti = input('text', null);
    ti.placeholder = 'פרשת וירא, או: ראש השנה';
    [['תאריך כניסה', eve], ['שעת כניסה', c1], ['תאריך יציאה', end], ['שעת יציאה', h1]].forEach(function(x){ x[1].required = true; f.appendChild(field(x[0], x[1])); });
    f.appendChild(field('כותרת', ti));
    var go = el('button', 'p', 'הוסף שורה'); go.type = 'submit'; f.appendChild(go);
    f.addEventListener('submit', function(e){
      e.preventDefault();
      if(end.value < eve.value){ toast('תאריך היציאה לפני הכניסה'); return; }
      sb.from('shabbat_rows').insert({client_id:cid, eve:eve.value, candle:c1.value, endd:end.value, havdalah:h1.value, title:ti.value.trim()}).then(function(x){ if(ok(x)){ f.reset(); load(); toast('נוסף'); } });
    });
    box.appendChild(f);
    var csv = el('textarea'); csv.placeholder = '2026-10-23,17:42,2026-10-24,18:32,פרשת לך לך';
    var cg = el('button', null, 'טען טבלה'); cg.type = 'button';
    cg.addEventListener('click', function(){
      var rows = [], bad = 0, D = /^\d{4}-\d{2}-\d{2}$/, T = /^\d{1,2}:\d{2}$/;
      csv.value.split('\n').forEach(function(line){
        line = line.trim(); if(!line) return;
        var p = line.split(/[,;\t]/).map(function(s){ return s.trim(); });
        if(p.length >= 4 && D.test(p[0]) && T.test(p[1]) && D.test(p[2]) && T.test(p[3]) && p[2] >= p[0]) rows.push({client_id:cid, eve:p[0], candle:('0' + p[1]).slice(-5), endd:p[2], havdalah:('0' + p[3]).slice(-5), title:p[4] || ''});
        else bad++;
      });
      if(!rows.length){ toast('לא נמצאו שורות תקינות. בדקו את סדר העמודות'); return; }
      sb.from('shabbat_rows').insert(rows).then(function(x){ if(ok(x)){ csv.value = ''; load(); toast('נוספו ' + rows.length + ' שורות' + (bad ? ', ' + bad + ' דולגו' : '')); } });
    });
    var w = el('div', 'full'); box.appendChild(el('p', 'note', 'או הדביקו טבלה: תאריך כניסה, שעת כניסה, תאריך יציאה, שעת יציאה, כותרת.')); box.appendChild(csv); box.appendChild(cg);
    return box;
  }

  start();
})();

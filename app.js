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
    if(m < 60) return ['לפני ' + m + ' דק׳', 'ok'];
    if(m < 1440) return ['לפני ' + Math.round(m / 60) + ' שעות', 'warn'];
    return ['לא התחבר ' + Math.round(m / 1440) + ' ימים', 'bad'];
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
  function renderAdmin(){
    var m = shell('מיכאל מערכות • אדמין');
    m.appendChild(el('h1', null, 'לקוחות'));
    m.appendChild(el('p', 'sub', 'כל לקוח רואה רק את המסך שלו. השעיה חוסמת את הכניסה והמסך מפסיק להציג תוכן.'));
    var box = el('div', 'box'), sc = el('div', 'scroll'); box.appendChild(sc); m.appendChild(box);
    sb.from('clients').select('*, screens(id,name,token,last_seen)').order('created_at').then(function(r){
      if(!ok(r)) return;
      var clients = r.data || [];
      var tb = el('table'), th = el('thead'), hr = el('tr');
      ['לקוח', 'סוג', 'מסלול', 'ציוד', 'מסך', 'מצב', 'פעולות'].forEach(function(h){ hr.appendChild(el('th', null, h)); });
      th.appendChild(hr); tb.appendChild(th);
      var body = el('tbody');
      clients.forEach(function(c){
        var scr = (c.screens && c.screens[0]) || null, tr = el('tr');
        tr.appendChild(el('td', null, c.name)); tr.appendChild(el('td', null, c.biz_type || ''));
        var t = el('td'); t.appendChild(el('span', 'pill tier', TIERS[c.tier])); tr.appendChild(t);
        tr.appendChild(el('td', null, EQ[c.equipment]));
        var st = el('td'), a = scr ? agoText(scr.last_seen) : ['אין מסך', 'warn'];
        st.appendChild(el('span', 'pill ' + a[1], a[0])); tr.appendChild(el('td', null, scr ? scr.name : '')); tr.appendChild(st);
        var ac = el('td'), row = el('div', 'acts');
        function btn(txt, cls, fn){ var x = el('button', cls || null, txt); x.type = 'button'; x.addEventListener('click', fn); row.appendChild(x); }
        btn('פתח כלקוח', null, function(){ renderClient(c.id, true); });
        btn('הגדרות', null, function(){ renderEdit(c, scr); });
        if(scr) btn('קישור נגן', null, function(){ copy(playerLink(scr.token), 'הקישור'); });
        btn(c.active ? 'השעה' : 'החזר גישה', c.active ? 'd' : null, function(){
          sb.from('clients').update({active:!c.active}).eq('id', c.id).then(function(x){ if(ok(x)){ toast(c.active ? 'הלקוח הושעה' : 'הגישה הוחזרה'); renderAdmin(); } });
        });
        ac.appendChild(row); tr.appendChild(ac); body.appendChild(tr);
      });
      tb.appendChild(body); sc.appendChild(tb);
      if(!clients.length) sc.appendChild(el('p', 'note', 'עדיין אין לקוחות. הוסיפו את הראשון למטה.'));
      m.appendChild(addClientForm(clients));
      m.appendChild(linkForm(clients));
    });
  }
  function addClientForm(){
    var box = el('div', 'box'); box.appendChild(el('h2', null, 'הוספת לקוח'));
    var f = el('form'), n = input('text', 'n'); n.required = true;
    var ty = select(Object.keys(TYPES).reduce(function(o, k){ o[k] = k; return o; }, {}));
    var tr = select(TIERS), eq = select(EQ);
    f.appendChild(field('שם העסק', n)); f.appendChild(field('סוג עסק', ty)); f.appendChild(field('מסלול', tr)); f.appendChild(field('ציוד', eq));
    var fs = el('fieldset'); fs.appendChild(el('legend', null, 'יכולות בממשק הלקוח'));
    var boxes = {};
    Object.keys(MODS).forEach(function(k){ var l = el('label', 'chk'), i = input('checkbox', null); boxes[k] = i; l.appendChild(i); l.appendChild(document.createTextNode(MODS[k])); fs.appendChild(l); });
    function defaults(){ Object.keys(boxes).forEach(function(k){ boxes[k].checked = (TYPES[ty.value] || []).indexOf(k) > -1; }); }
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
          msg.textContent = 'נוצר. קישור הנגן למסך: ' + playerLink(s.data.token);
          toast('הלקוח נוצר'); setTimeout(renderAdmin, 4000);
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

  function renderClient(cid, asAdmin){
    var extra = null;
    if(asAdmin){ extra = el('button', null, 'חזרה לאדמין'); extra.type = 'button'; extra.addEventListener('click', renderAdmin); }
    sb.from('clients').select('*').eq('id', cid).maybeSingle().then(function(r){
      if(!ok(r) || !r.data){ shell('ניהול מסך', extra).appendChild(el('p', 'sub', 'לא נמצאו נתוני לקוח.')); return; }
      var c = r.data, m = shell(c.name, extra);
      if(!c.active){ m.appendChild(el('h1', null, 'החשבון מושעה')); m.appendChild(el('p', 'sub', 'פנו למיכאל מערכות להחזרת הגישה.')); return; }
      m.appendChild(el('h1', null, 'התמונות במסך'));
      m.appendChild(el('p', 'sub', 'שינויים מופיעים במסך תוך כדקה.'));
      var mods = c.modules || [];
      var slidesBox = el('div', 'box'); m.appendChild(slidesBox);
      m.appendChild(uploadBox(cid, function(){ loadSlides(cid, slidesBox); }));
      if(mods.indexOf('ticker') > -1) m.appendChild(tickerBox(cid));
      if(mods.indexOf('shabbat') > -1) m.appendChild(shabbatBox(cid));
      loadSlides(cid, slidesBox);
    });
  }
  function loadSlides(cid, box){
    sb.from('slides').select('*').eq('client_id', cid).order('position').then(function(r){
      if(!ok(r)) return; box.textContent = '';
      var rows = r.data || [];
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
          var sv = el('button', 'p',

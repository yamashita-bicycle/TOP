/* やました自転車工房｜営業日・お知らせ編集画面
 * 秘密のトークンをローカルストレージやリポジトリへ保存しません。
 * データ・ユーザー入力はHTMLに直接埋め込まず textContent で描画します。
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const repo = 'yamashita-cycle/yamashita-bicycle';
  const branch = 'main';
  const allowed = new Set(['day', 'night', 'closed']);
  const apiBase = `https://api.github.com/repos/${repo}/contents/`;
  let schedule = {};
  let news = [];
  let editingId = null;
  let dirty = false;
  let working = false;
  let shaBaseline = null;
  const japanParts = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce((a, v) => { a[v.type] = v.value; return a; }, {});
  const t = japanParts();
  const nowDate = `${t.year}-${t.month}-${t.day}`;
  const pad = n => String(n).padStart(2, '0');
  const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  let currentYear = Number(t.year), currentMonth = Number(t.month);
  let selectedDate = nowDate;
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  const validDate = x => isoRe.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`)) &&
    new Date(`${x}T00:00:00Z`).toISOString().slice(0, 10) === x;

  function validateSchedule(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('営業日データの形式が正しくありません');
    const clean = {};
    for (const [k, v] of Object.entries(data)) if (validDate(k) && allowed.has(v)) clean[k] = v;
    return clean;
  }
  function validateNews(data) {
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) throw new Error('お知らせの形式が正しくありません');
    if (items.length > 500) throw new Error('お知らせの件数が多すぎます');
    return items.filter(v => v && typeof v === 'object' && typeof v.title === 'string')
      .map((v, i) => ({
        id: String(v.id || `item-${i}`).slice(0, 90),
        date: validDate(String(v.date || '')) ? String(v.date) : '',
        category: String(v.category || '店舗情報').slice(0, 35),
        title: v.title.trim().slice(0, 120),
        body: String(v.body || '').slice(0, 1200),
        published: v.published !== false
      })).filter(v => v.title);
  }
  function jsonFor(name) {
    return name === 'schedule.json' ? `${JSON.stringify(schedule, null, 2)}\n`
      : `${JSON.stringify({version:1, items:news}, null, 2)}\n`;
  }
  function markDirty(v = true) {
    dirty = v;
    $('save-indicator').replaceChildren();
    const dot = document.createElement('span'); dot.className = 'dot' + (v ? ' dirty' : '');
    $('save-indicator').append(dot, document.createTextNode(v ? '未公開の変更があります' : '編集内容は未変更です'));
  }
  function message(txt, isError = false) {
    const el = $('global-message');
    el.className = 'message' + (isError ? ' error' : '');
    el.textContent = txt;
    el.scrollIntoView({behavior:'smooth', block:'nearest'});
  }
  function clearMessage() { $('global-message').textContent = ''; }
  function tab(name) {
    for (const btn of document.querySelectorAll('[data-tab]')) {
      const active = btn.dataset.tab === name;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    }
    for (const panel of document.querySelectorAll('.panel')) panel.classList.toggle('active', panel.id === `panel-${name}`);
    clearMessage();
  }
  document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => tab(btn.dataset.tab)));
  $('go-publish').addEventListener('click', () => { tab('publish'); window.scrollTo({top:0, behavior:'smooth'}); });

  const labels = {day:'昼間営業', night:'夜間営業', closed:'休業日', unset:'未定'};
  const symbol = {day:'☀', night:'☾', closed:'−', unset:'□'};
  function renderCalendar() {
    $('month-heading').textContent = `${currentYear}年${currentMonth}月`;
    const grid = $('calendar-grid'); grid.replaceChildren();
    '日月火水木金土'.split('').forEach(w => {
      const box = document.createElement('div'); box.className = 'weekday'; box.textContent = w; grid.append(box);
    });
    const blank = new Date(Date.UTC(currentYear, currentMonth-1, 1)).getUTCDay();
    const days = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();
    for (let i = 0; i < blank; i++) grid.append(document.createElement('div'));
    for (let d = 1; d <= days; d++) {
      const k = dateKey(currentYear, currentMonth, d), v = schedule[k] || 'unset';
      const weekday = new Date(Date.UTC(currentYear, currentMonth-1, d)).getUTCDay();
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `date ${v}${k === selectedDate ? ' selected' : ''}${weekday===0 ? ' sunday' : weekday===6 ? ' saturday' : ''}`;
      b.setAttribute('aria-label', `${d}日 ${labels[v]}`);
      b.setAttribute('aria-pressed', String(k === selectedDate));
      const dayText = document.createElement('strong'); dayText.textContent = d;
      const kindText = document.createElement('span'); kindText.textContent = `${symbol[v]} ${labels[v]}`;
      b.append(dayText, kindText);
      b.addEventListener('click', () => { selectedDate = k; renderCalendar(); renderSelected(); });
      grid.append(b);
    }
  }
  function renderSelected() {
    $('selected-title').textContent = `${Number(selectedDate.slice(5,7))}月${Number(selectedDate.slice(8,10))}日の営業設定`;
    const mode = schedule[selectedDate] || 'unset';
    document.querySelectorAll('[data-mode]').forEach(b => {
      b.classList.toggle('selected', b.dataset.mode === mode);
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
  }
  $('month-prev').addEventListener('click', () => {
    if (--currentMonth < 1) { currentMonth=12; currentYear--; }
    renderCalendar();
  });
  $('month-next').addEventListener('click', () => {
    if (++currentMonth > 12) { currentMonth=1; currentYear++; }
    renderCalendar();
  });
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    const v = button.dataset.mode;
    if (v === 'unset') delete schedule[selectedDate]; else schedule[selectedDate] = v;
    markDirty(); renderCalendar(); renderSelected();
  }));

  const make = (tag, cls, text) => {
    const e = document.createElement(tag); if (cls) e.className = cls;
    if (text !== undefined) e.textContent = String(text); return e;
  };
  const datePrint = d => d ? d.replaceAll('-', '.') : '日付なし';
  function renderNews() {
    $('news-count').textContent = `${news.length}件`;
    const parent = $('news-items'); parent.replaceChildren();
    if (!news.length) { parent.append(make('p','sub','まだお知らせはありません。')); return; }
    news.forEach((item, index) => {
      const article = make('article', 'news-item');
      const meta = make('div', 'news-info');
      meta.append(make('span', 'pill', item.category), make('time', '', datePrint(item.date)));
      if (!item.published) meta.append(make('span','pill off','非公開'));
      article.append(meta, make('strong','',item.title), make('p','',item.body));
      const row = make('div','row');
      const edit = make('button','btn outline sm','編集'); edit.type='button';
      edit.addEventListener('click', () => {
        editingId = item.id;
        $('news-form-heading').textContent = 'お知らせを編集';
        $('news-submit').textContent = '変更を反映';
        $('news-cancel').hidden = false;
        $('news-date').value = item.date;
        // Special category entered from an imported file
        if (![...$('news-category').options].some(o=>o.value===item.category)) {
          const extra = document.createElement('option'); extra.value = item.category; extra.textContent = item.category; $('news-category').append(extra);
        }
        $('news-category').value = item.category;
        $('news-title').value = item.title;
        $('news-body').value = item.body;
        $('news-published').checked = item.published;
        $('news-form').scrollIntoView({behavior:'smooth',block:'start'});
        $('news-title').focus({preventScroll:true});
      });
      const up = make('button','btn secondary sm','↑'); up.type='button'; up.title = '上へ移動'; up.disabled = index === 0;
      up.addEventListener('click', () => { [news[index-1],news[index]] = [news[index],news[index-1]];markDirty();renderNews(); });
      const down = make('button','btn secondary sm','↓'); down.type='button';down.title='下へ移動';down.disabled=index===news.length-1;
      down.addEventListener('click', () => { [news[index+1],news[index]] = [news[index],news[index+1]];markDirty();renderNews(); });
      const del = make('button','btn danger sm','削除');del.type='button';
      del.addEventListener('click', () => {
        if (!confirm(`「${item.title}」を削除しますか？\nGitHubに保存するまで公開HPには反映されません。`)) return;
        news.splice(index,1);if(editingId===item.id)resetForm();markDirty();renderNews();
      });
      row.append(edit,up,down,del);article.append(row);parent.append(article);
    });
  }
  function resetForm() {
    editingId=null;
    $('news-form').reset();
    $('news-date').value=nowDate;
    $('news-submit').textContent='お知らせを追加';
    $('news-form-heading').textContent='お知らせを登録';
    $('news-cancel').hidden=true;
  }
  $('news-cancel').addEventListener('click', resetForm);
  $('news-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const title = $('news-title').value.trim(), body = $('news-body').value.trim();
    if (!title) { $('news-title').focus(); return; }
    const entry = {
      id: editingId || ('n-' + Date.now() + '-' + Math.random().toString(36).slice(2,8)),
      date: $('news-date').value,
      category: $('news-category').value,
      title,body,published:$('news-published').checked
    };
    if (editingId) {
      const index = news.findIndex(n => n.id === editingId);
      if(index === -1){message('編集中のお知らせが見つかりません。',true);return;}
      news[index]=entry;
    } else news.unshift(entry);
    resetForm();markDirty();renderNews();
    message('お知らせを画面内に反映しました。公開するには「公開・更新」で保存してください。');
  });

  function download(name) {
    const blob = new Blob([jsonFor(name)], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    message(`${name} をダウンロードしました。\n次にGitHubへ同名ファイルをアップロードしてください。`);
  }
  $('download-schedule').addEventListener('click', () => download('schedule.json'));
  $('download-news').addEventListener('click', () => download('news.json'));
  $('import-schedule').addEventListener('click', () => $('file-schedule').click());
  $('import-news').addEventListener('click', () => $('file-news').click());
  function setData(name, raw) {
    if(name==='schedule.json') {schedule=validateSchedule(raw);renderCalendar();renderSelected();}
    else {news=validateNews(raw);resetForm();renderNews();}
  }
  [['file-schedule','schedule.json'],['file-news','news.json']].forEach(([id,name]) => {
    $(id).addEventListener('change', async ev => {
      const file=ev.target.files?.[0];if(!file)return;
      try {
        const obj=JSON.parse(await file.text());
        if(!confirm(`現在の${name}の編集内容を、選択したファイルの内容に置き換えますか？`))return;
        setData(name,obj); markDirty(); message(`${name} を読み込みました。`);
      } catch(err){message(`読み込みに失敗しました：${err.message}`,true);}
      finally{ev.target.value='';}
    });
  });

  async function getStaticJSON(name) {
    const response = await fetch(`./${name}?t=${Date.now()}`, {cache:'no-store'});
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  }
  async function boot() {
    let errors=[];
    for (const name of ['schedule.json','news.json']) {
      try {setData(name,await getStaticJSON(name));}
      catch(e){errors.push(e.message);console.warn(e);}
    }
    renderCalendar();renderSelected();renderNews();resetForm();markDirty(false);
    if(errors.length) message('読み込みできなかったデータがあります：' + errors.join(' / ') + '\nGitHub Pagesで公開したURLから開いてください。',true);
  }

  function token() {
    const value=$('github-token').value.trim();
    if (!value) throw new Error('GitHubトークンを入力してください。トークンを使用しない場合は、ファイルのダウンロードで更新できます。');
    return value;
  }
  async function ghRequest(path, accessToken, init = {}) {
    const response = await fetch(apiBase + path, {
      ...init,
      headers:{
        Accept:'application/vnd.github+json',
        Authorization:'Bearer '+accessToken,
        'X-GitHub-Api-Version':'2022-11-28',
        ...(init.body ? {'Content-Type':'application/json'} : {})
      },cache:'no-store'
    });
    const result=await response.json().catch(()=>({}));
    if(response.status===404 && (!init.method || init.method==='GET'))return null;
    if(!response.ok)throw new Error(`GitHub API ${response.status}: ${result.message || '読み込み・書き込みに失敗しました'}`);
    return result;
  }
  function fromBase64(b64) {
    const binary=atob(b64.replace(/\s/g,''));
    return new TextDecoder().decode(Uint8Array.from(binary, c=>c.charCodeAt(0)));
  }
  function toBase64(text) {
    const bytes=new TextEncoder().encode(text);
    let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(out);
  }
  async function ghGet(name, accessToken) {
    const res=await ghRequest(`${name}?ref=${encodeURIComponent(branch)}`,accessToken);
    return res ? {sha:res.sha,data:JSON.parse(fromBase64(res.content))} : {sha:null,data:name==='schedule.json'?{}:{version:1,items:[]}};
  }
  function setWorking(value) {
    working=value;
    $('github-publish').disabled=value;
    $('github-load').disabled=value;
    $('github-publish').textContent=value?'GitHubに処理中…':'GitHubに直接公開';
  }
  $('github-load').addEventListener('click', async () => {
    if(working)return;
    if(dirty && !confirm('画面内の未公開の変更は破棄されます。GitHubの最新データを読み込みますか？'))return;
    setWorking(true);
    try {
      const tok=token(), a=await ghGet('schedule.json',tok), b=await ghGet('news.json',tok);
      setData('schedule.json',a.data);setData('news.json',b.data);
      shaBaseline={'schedule.json':a.sha,'news.json':b.sha};
      markDirty(false);message('GitHubの最新データを読み込みました。');
    }catch(e){message('GitHubから読み込めませんでした：'+e.message,true);}
    finally{setWorking(false);}
  });
  $('github-publish').addEventListener('click', async () => {
    if(working)return;
    setWorking(true);
    const saved=[];
    try {
      const tok=token();
      if(!confirm('営業日とお知らせの両方をGitHubの main ブランチに公開しますか？\n公開サイトの内容が更新されます。'))return;
      // Update with GitHub's latest SHA to avoid accidental overwrite in case of concurrent edits.
      for(const name of ['schedule.json','news.json']) {
        const latest=await ghGet(name,tok);
        if(shaBaseline && shaBaseline[name]!==latest.sha)throw new Error(`${name} は別の場所から更新されています。GitHubから最新データを読み込み、変更を確認してから再度公開してください。`);
        const body={message:`Update ${name} from Yamashita site admin`,content:toBase64(jsonFor(name)),branch};
        if(latest.sha)body.sha=latest.sha;
        const result=await ghRequest(name,tok,{method:'PUT',body:JSON.stringify(body)});
        saved.push(name);
        if(!shaBaseline)shaBaseline={};
        shaBaseline[name]=result.content?.sha || null;
      }
      markDirty(false);
      $('github-token').value='';
      message('GitHubへの保存が完了しました。公開サイトへの反映には数分かかる場合があります。');
    }catch(e){message((saved.length ? `${saved.join(' と ')} は保存済みです。\n` : '') + 'GitHubへの公開に失敗しました：'+e.message,true);}
    finally{setWorking(false);}
  });
  $('clear-token').addEventListener('click', () => {$('github-token').value=''; message('入力中のトークンを消しました。');});
  window.addEventListener('beforeunload', e => {if(dirty){e.preventDefault();e.returnValue='';}});
  boot();
})();

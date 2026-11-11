/* やました自転車工房｜公開用お知らせ。入力文はHTMLとして解釈しません。 */
(() => {
  'use strict';
  const list = document.getElementById('news-list');
  const more = document.getElementById('news-more');
  if (!list || !more) return;
  let records = [];
  let expanded = false;
  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  };
  const fmtDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.replaceAll('-', '.') : '';
  function draw() {
    list.replaceChildren();
    const items = expanded ? records : records.slice(0, 3);
    if (!items.length) list.append(el('p', 'news-empty', '現在、お知らせはありません。'));
    for (const item of items) {
      const article = el('article', 'news-entry');
      article.setAttribute('role', 'listitem');
      const label = el('span', 'news-category' + (item.category === 'WEBショップ' ? ' shop' : ''), item.category || 'お知らせ');
      const text = el('div', 'news-content');
      text.append(el('strong', '', item.title));
      const desc = [fmtDate(item.date), item.body].filter(Boolean).join('　');
      if (desc) text.append(el('span', '', desc));
      article.append(label, text, el('span', 'news-arrow', '›'));
      list.append(article);
    }
    more.hidden = records.length <= 3;
    more.setAttribute('aria-expanded', String(expanded));
    more.textContent = expanded ? '閉じる ⌃' : 'お知らせをもっと見る ⌄';
  }
  more.addEventListener('click', () => { expanded = !expanded; draw(); });
  fetch('./news.json', { cache: 'no-store' }).then(async r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(data => {
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) throw new Error('形式が正しくありません');
    records = items.filter(v => v && typeof v === 'object' && v.published !== false && typeof v.title === 'string' && v.title.trim())
      .map(v => ({title:v.title, body:String(v.body || ''), category:String(v.category || 'お知らせ'), date:String(v.date || '')}));
    draw();
  }).catch(err => {
    list.replaceChildren(el('p', 'news-empty', 'お知らせを読み込めませんでした。しばらくしてから再度お試しください。'));
    more.hidden = true;
    console.warn('お知らせ取得失敗', err);
  });
})();

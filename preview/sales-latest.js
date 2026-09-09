(function(){
  if (typeof state === 'undefined' || typeof requests === 'undefined') return;

  state.requestQuery = state.requestQuery || '';
  state.requestStageFilter = state.requestStageFilter || '';
  state.requestOwnerFilter = state.requestOwnerFilter || '';
  state.clientQuery = state.clientQuery || '';
  state.clientFilter = state.clientFilter || 'all';
  state.proposalQuery = state.proposalQuery || '';
  state.proposalFilter = state.proposalFilter || 'all';

  const salesIcon = {
    list:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    board:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="16" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/></svg>',
    analytics:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
    sliders:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--panel)"/><circle cx="15" cy="12" r="2" fill="var(--panel)"/><circle cx="7" cy="18" r="2" fill="var(--panel)"/></svg>',
    plus:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    search:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.7-3.7"/></svg>',
    eye:'<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M7 17 17 7M8 7h9v9"/></svg>',
    users:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    calendar:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>',
    x:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  function requestBucketFor(row){
    if (row.archived) return 'archive';
    return ['Согласовано','Не согласовано'].includes(row.stage) ? 'completed' : 'active';
  }
  function currentRequestRows(){
    return requests.filter(row=>{
      if(requestBucketFor(row)!==state.requestBucket) return false;
      if(state.requestStageFilter && row.stage!==state.requestStageFilter) return false;
      if(state.requestOwnerFilter && (row.owner||'Не назначен')!==state.requestOwnerFilter) return false;
      const q=state.requestQuery.trim().toLowerCase();
      return !q || `${row.title} ${row.client} ${row.location} ${row.owner||''} ${row.roles}`.toLowerCase().includes(q);
    });
  }
  function salesSegments(value, items, setter, icons){
    return `<div class="sales-segments" role="group">${items.map(item=>`<button type="button" aria-pressed="${value===item[0]}" onclick="${setter}('${item[0]}')">${icons&&salesIcon[item[0]]?salesIcon[item[0]]:''}${esc(item[1])}</button>`).join('')}</div>`;
  }
  function salesSearch(value, placeholder, setter){
    return `<div class="sales-search">${salesIcon.search}<input type="search" aria-label="${esc(placeholder)}" placeholder="${esc(placeholder)}" value="${esc(value)}" oninput="${setter}(this.value)">${value?`<button type="button" aria-label="Очистить поиск" onclick="${setter}('')">${salesIcon.x}</button>`:''}</div>`;
  }
  function salesMetrics(items){
    return `<div class="sales-metrics">${items.map(item=>`<div><span>${esc(item[0])}</span><strong>${esc(String(item[1]))}</strong><small>${esc(item[2])}</small></div>`).join('')}</div>`;
  }
  function requestRowsForBucket(bucket){return requests.filter(r=>requestBucketFor(r)===bucket);}

  window.setRequestView=function(v){state.requestView=v;render();};
  window.setRequestBucket=function(v){state.requestBucket=v;state.requestStageFilter='';render();};
  window.setRequestStageFilter=function(v){state.requestStageFilter=v;render();};
  window.setRequestOwnerFilter=function(v){state.requestOwnerFilter=v;render();};
  window.setRequestQuery=function(v){state.requestQuery=v;render();};
  window.resetRequestFilters=function(){state.requestQuery='';state.requestStageFilter='';state.requestOwnerFilter='';render();};
  window.openRequestStage=function(stage){state.requestBucket=['Согласовано','Не согласовано'].includes(stage)?'completed':'active';state.requestStageFilter=stage;state.requestView='list';render();};

  window.openRequestQuickView=function(id){
    const row=requests.find(item=>item.id===id); if(!row) return;
    let dialog=document.getElementById('salesRequestPreview');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='salesRequestPreview';dialog.className='sales-drawer';document.body.appendChild(dialog);}
    dialog.innerHTML=`<div class="sales-drawer-content sales-workspace"><header><div><span class="sales-overline">Быстрый просмотр</span><h2>${esc(row.title)}</h2><p>${esc(row.client)} · ${esc(row.location||'Локация уточняется')}</p></div><button type="button" class="icon-button" onclick="closeRequestQuickView()" aria-label="Закрыть">${salesIcon.x}</button></header><div class="sales-drawer-body"><div class="sales-drawer-facts"><div><span>Этап</span><strong>${stageBadge(row.stage)}</strong></div><div><span>Потребность</span><strong>${row.headcount} чел.</strong></div><div><span>Ответственный</span><strong>${esc(row.owner||'Не назначен')}</strong></div><div><span>Старт</span><strong>${esc(row.start||'Уточняется')}</strong></div></div><section class="section"><div class="section-head"><div><h2>Позиции и активность</h2><p>Краткий контекст без перехода в карточку.</p></div></div><div style="padding:16px 18px">${kv('Позиции',row.roles)}${kv('Активность',row.activity)}${kv('КП',row.proposal)}${kv('Источник',row.source)}</div></section></div><footer><button class="button" onclick="closeRequestQuickView()">Закрыть</button><button class="button primary" onclick="closeRequestQuickView();openRequest('${row.id}')">Открыть заявку ${salesIcon.arrow}</button></footer></div>`;
    if(typeof dialog.showModal==='function') dialog.showModal(); else dialog.setAttribute('open','');
  };
  window.closeRequestQuickView=function(){const dialog=document.getElementById('salesRequestPreview');if(!dialog)return;if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');};

  window.renderRequests=function(){
    const active=requestRowsForBucket('active');
    const completed=requestRowsForBucket('completed');
    const agreed=completed.filter(r=>r.stage==='Согласовано').length;
    const lost=completed.filter(r=>r.stage==='Не согласовано').length;
    const conversionBase=agreed+lost;
    const activeHeadcount=active.reduce((sum,row)=>sum+row.headcount,0);
    const sent=requests.reduce((sum,row)=>sum+(row.sent||0),0);
    const filtered=currentRequestRows();
    const totalInBucket=requestRowsForBucket(state.requestBucket).length;
    const owners=[...new Set(requests.map(r=>r.owner||'Не назначен'))];
    const allStages=['Новая','Уточнение','Готово к расчёту','Расчёт','Подготовка КП','КП у клиента','Переговоры','Согласовано','Не согласовано'];

    let body=header('Заявки','Рабочая воронка от первичной потребности до согласованного коммерческого предложения.','КОММЕРЦИЯ → ЗАЯВКИ');
    body+=salesMetrics([
      ['Активные заявки',active.length,'сейчас в работе'],
      ['Потребность',activeHeadcount,'человек по активным заявкам'],
      ['Отправки КП',sent,'за всё время'],
      ['Согласовано',conversionBase?`${Math.round(agreed/conversionBase*100)}%`:'—',conversionBase?`из ${conversionBase} завершённых заявок`:'нет завершённых заявок']
    ]);
    body+=`<div class="sales-registry"><div class="sales-toolbar">${salesSegments(state.requestView,[['list','Список'],['board','Доска'],['analytics','Аналитика']],'setRequestView',true)}<div class="sales-toolbar-actions"><button class="icon-button" aria-label="Настроить этапы" title="Настроить этапы">${salesIcon.sliders}</button><button class="button">Поделиться формой</button><button class="button primary" onclick="alert('В preview форма создания не сохраняет данные')">${salesIcon.plus}Новая заявка</button></div></div>`;
    if(state.requestView!=='analytics'){
      body+=`<div class="sales-filterbar">${salesSegments(state.requestBucket,[['active','Активные'],['completed','Завершённые'],['archive','Архив']],'setRequestBucket')}<select aria-label="Фильтр по этапу" onchange="setRequestStageFilter(this.value)"><option value="">Все этапы</option>${allStages.map(s=>`<option value="${esc(s)}" ${state.requestStageFilter===s?'selected':''}>${esc(s)}</option>`).join('')}</select><select aria-label="Фильтр по ответственному" onchange="setRequestOwnerFilter(this.value)"><option value="">Все ответственные</option>${owners.map(o=>`<option value="${esc(o)}" ${state.requestOwnerFilter===o?'selected':''}>${esc(o)}</option>`).join('')}</select>${salesSearch(state.requestQuery,'Поиск по заявкам','setRequestQuery')}</div>`;
      body+=`<div class="sales-results"><span>Показано ${filtered.length} из ${totalInBucket}</span>${(state.requestQuery||state.requestStageFilter||state.requestOwnerFilter)?'<button onclick="resetRequestFilters()">Сбросить фильтры</button>':''}${state.requestView==='board'?'<span class="sales-result-hint">Этап можно изменить в просмотре карточки или перетаскиванием</span>':''}</div>`;
    }
    if(state.requestView==='analytics') body+=renderRequestAnalytics();
    else if(!filtered.length) body+=`<div class="sales-empty"><strong>${state.requestQuery||state.requestStageFilter||state.requestOwnerFilter?'Заявки не найдены':'В этом разделе пока нет заявок'}</strong><p>${state.requestQuery||state.requestStageFilter||state.requestOwnerFilter?'Измените условия поиска или сбросьте фильтры.':'Новые заявки появятся в активных. Завершённые и архивные хранятся отдельно.'}</p>${state.requestQuery||state.requestStageFilter||state.requestOwnerFilter?'<button class="button" onclick="resetRequestFilters()">Сбросить фильтры</button>':''}</div>`;
    else if(state.requestView==='board' && state.requestBucket!=='archive') body+=renderRequestBoard();
    else body+=renderRequestList(filtered);
    body+='</div>';
    return body;
  };

  window.renderRequestList=function(rows){
    return `<div class="sales-table-wrap"><table class="data-table sales-request-table"><thead><tr><th>Заявка / клиент</th><th>Потребность</th><th>Этап</th><th>Ответственный</th><th>Старт</th><th>Активность</th><th><span class="sales-sr-only">Просмотр</span></th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="preview-title-link cell-title" onclick="openRequest('${r.id}')">${esc(r.title)}</span><span class="cell-sub">${esc(r.client)} · ${esc(r.location||'Локация уточняется')}</span></td><td><strong>${r.headcount} чел.</strong><span class="cell-sub">${esc(r.roles)}</span></td><td>${stageBadge(r.stage)}</td><td>${esc(r.owner||'Не назначен')}</td><td class="sales-nowrap">${esc(r.start||'Уточняется')}</td><td><span class="sales-secondary">${esc(r.activity)}</span>${r.proposal&&r.proposal!=='—'?`<span class="cell-sub">КП ${esc(r.proposal)}${r.sent?` · отправок ${r.sent}`:''}</span>`:''}</td><td><button class="icon-button sales-preview-button" aria-label="Просмотр" onclick="openRequestQuickView('${r.id}')">${salesIcon.eye}</button></td></tr>`).join('')}</tbody></table></div>`;
  };

  window.renderRequestBoard=function(){
    const filtered=currentRequestRows();
    const stageOrder=['Новая','Уточнение','Готово к расчёту','Расчёт','Подготовка КП','КП у клиента','Переговоры','Согласовано','Не согласовано'];
    const stages=stageOrder.filter(stage=>filtered.some(r=>r.stage===stage) || ['Новая','Готово к расчёту','Расчёт','КП у клиента'].includes(stage));
    return `<div class="sales-board" aria-label="Доска заявок">${stages.map(stage=>{const rows=filtered.filter(r=>r.stage===stage);return `<section class="sales-board-column"><header>${stageBadge(stage)}<b>${rows.length}</b></header><div class="sales-board-cards">${rows.length?rows.map(r=>`<article class="sales-board-card"><div class="sales-card-heading"><span class="preview-title-link" onclick="openRequest('${r.id}')">${esc(r.title)}</span><button class="icon-button" onclick="openRequestQuickView('${r.id}')" aria-label="Просмотр">${salesIcon.arrow}</button></div><p>${esc(r.client)}<span>${esc(r.location||'Локация уточняется')}</span></p><div class="sales-card-facts"><span>${salesIcon.users}${r.headcount} чел.</span><span>${salesIcon.calendar}${esc(r.start||'Уточняется')}</span></div><footer><span>${esc(r.owner||'Не назначен')}</span><small>${esc(r.activity)}</small></footer></article>`).join(''):'<div class="sales-board-empty">Нет заявок</div>'}</div></section>`;}).join('')}</div>`;
  };

  window.renderRequestAnalytics=function(){
    const actual=requests.filter(r=>!r.archived);
    const stageOrder=['Новая','Уточнение','Готово к расчёту','Расчёт','Подготовка КП','КП у клиента','Переговоры','Согласовано','Не согласовано'];
    const distribution=stageOrder.map(stage=>[stage,actual.filter(r=>r.stage===stage).length]).filter(x=>x[1]||['Новая','Готово к расчёту','Расчёт','КП у клиента'].includes(x[0]));
    const max=Math.max(1,...distribution.map(x=>x[1]));
    const agreed=actual.filter(r=>r.stage==='Согласовано').length;
    const lost=actual.filter(r=>r.stage==='Не согласовано').length;
    const completed=agreed+lost;
    return `<div class="sales-insights"><section class="section"><div class="section-head"><div><h2>Заявки по этапам</h2><p>Текущее распределение без архива. Нажмите на этап, чтобы открыть заявки.</p></div></div><div class="sales-bars">${distribution.map(([stage,count])=>`<button type="button" class="sales-bar-row" onclick="openRequestStage('${esc(stage)}')"><span>${esc(stage)}</span><strong>${count}<small>${actual.length?Math.round(count/actual.length*100):0}%</small></strong><span class="sales-bar-track"><i style="width:${count/max*100}%"></i></span></button>`).join('')}</div></section><section class="section"><div class="section-head"><div><h2>Результаты согласования</h2><p>По завершённым заявкам в доступном контуре, за всё время.</p></div></div><div class="sales-outcome"><strong>${completed?`${Math.round(agreed/completed*100)}%`:'—'}</strong><span>${completed?`Согласовано ${agreed} из ${completed}`:'Завершённых заявок пока нет'}</span><div class="sales-outcome-track"><i style="width:${completed?agreed/completed*100:0}%"></i></div><div class="sales-outcome-legend"><span>Согласовано <b>${agreed}</b></span><span>Не согласовано <b>${lost}</b></span></div></div><div class="sales-losses"><h3>Причины отказов</h3><p>${lost?'Не устроила цена':'Причины появятся после фиксации отказов.'}</p></div></section><section class="section sales-idle-section"><div class="section-head"><div><h2>Без изменений от 7 дней</h2><p>По дате последнего изменения заявки. Это не срок последнего контакта с клиентом.</p></div></div><div class="sales-empty"><strong>Заявок без изменений от 7 дней нет</strong><p>Здесь будут видны активные заявки, которые давно не обновлялись.</p></div></section></div>`;
  };

  window.setClientFilter=function(v){state.clientFilter=v;render();};
  window.setClientQuery=function(v){state.clientQuery=v;render();};
  window.renderClients=function(){
    const active=clients.filter(c=>c.status==='Активный');
    const filtered=clients.filter(c=>(state.clientFilter!=='active'||c.status==='Активный')&&(!state.clientQuery.trim()||`${c.name} ${c.contour}`.toLowerCase().includes(state.clientQuery.trim().toLowerCase())));
    const requestCount=clients.reduce((s,c)=>s+c.requests,0), objectCount=clients.reduce((s,c)=>s+c.objects,0);
    let body=header('Клиенты','Компании, контакты и связанный коммерческий контур.','КОММЕРЦИЯ → КЛИЕНТЫ');
    body+=salesMetrics([['Клиенты',clients.length,'в доступном контуре'],['Активные',active.length,'сейчас в работе'],['Заявки',requestCount,'доступные заявки клиентов'],['Контакты',clients.length,`Объектов в доступном контуре: ${objectCount}`]]);
    body+=`<div class="sales-registry"><div class="sales-toolbar">${salesSegments(state.clientFilter,[['all','Все'],['active','Активные']],'setClientFilter')}<div class="sales-toolbar-actions">${salesSearch(state.clientQuery,'Поиск по клиентам','setClientQuery')}<button class="button primary">${salesIcon.plus}Новый клиент</button></div></div><div class="sales-results">Показано ${filtered.length} из ${clients.length}</div><div class="request-table-wrap"><table class="data-table sales-client-table"><thead><tr><th>Клиент</th><th>Статус</th><th>Контакты</th><th>Заявки</th><th>Объекты</th></tr></thead><tbody>${filtered.map(c=>`<tr><td><span class="preview-title-link cell-title" onclick="openClient('${c.id}')">${esc(c.name)}</span><span class="cell-sub">${esc(c.contour)}</span></td><td>${stageBadge(c.status)}</td><td>${esc(c.contacts)}</td><td class="num">${c.requests}</td><td class="num">${c.objects}</td></tr>`).join('')}</tbody></table></div></div>`;
    return body;
  };

  window.setProposalFilter=function(v){state.proposalFilter=v;render();};
  window.setProposalQuery=function(v){state.proposalQuery=v;render();};
  window.renderProposals=function(){
    const belongs=(p)=>state.proposalFilter==='all'||(state.proposalFilter==='draft'&&/Черновик|доработк/i.test(p.status))||(state.proposalFilter==='approval'&&/согласован/i.test(p.status))||(state.proposalFilter==='client'&&/клиент|Переговоры/i.test(p.status))||(state.proposalFilter==='completed'&&/Принято|Отказ|запуск/i.test(p.status));
    const visible=proposals.filter(p=>belongs(p)&&(!state.proposalQuery.trim()||`${p.title} ${p.client} ${p.request}`.toLowerCase().includes(state.proposalQuery.trim().toLowerCase())));
    const inWork=proposals.filter(p=>!/Принято|Отказ|запуск/i.test(p.status));
    const atClient=proposals.filter(p=>/клиент|Переговоры/i.test(p.status));
    const accepted=proposals.filter(p=>/Принято|запуск/i.test(p.status));
    const activeValue=inWork.reduce((sum,p)=>sum+Number(p.amount||0),0);
    let body=header('Коммерческие предложения','Реестр КП, документ, согласование и история отправок.','КОММЕРЦИЯ → КОММЕРЧЕСКИЕ ПРЕДЛОЖЕНИЯ');
    body+=salesMetrics([['КП в работе',inWork.length,'активных версий'],['У клиента',atClient.length,'ожидают решения'],['Принято',accepted.length,'клиентских решений'],['Активный объём',activeValue?money(activeValue):'—','по текущим версиям']]);
    body+=`<div class="sales-toolbar">${salesSegments(state.proposalFilter,[['all','Все'],['draft','Черновики'],['approval','Согласование'],['client','У клиента'],['completed','Завершённые']],'setProposalFilter')}${salesSearch(state.proposalQuery,'Поиск по КП, клиенту или заявке','setProposalQuery')}</div><div class="sales-results">Показано ${visible.length} из ${proposals.length}</div><div class="commercial-table-wrap"><table class="data-table proposal-registry-table"><thead><tr><th>Коммерческое предложение</th><th>Клиент</th><th>Сумма</th><th>Этап</th><th>Позиции</th><th>Создано</th><th>Активность</th></tr></thead><tbody>${visible.map(p=>`<tr><td><span class="preview-title-link cell-title" onclick="openProposal('${p.id}')">${esc(p.title)}</span><span class="cell-sub">${esc(p.request)}</span></td><td>${esc(p.client)}</td><td class="num">${money(p.amount)}</td><td>${stageBadge(p.status)}</td><td class="num">${p.positions}</td><td>${esc(p.created)}</td><td><span class="proposal-activity">${esc(p.activity)}</span></td></tr>`).join('')}</tbody></table></div>`;
    return body;
  };

  const originalRender=render;
  window.render=function(){
    originalRender();
    const page=document.getElementById('page');
    if(page) page.classList.toggle('sales-workspace',/^\/(requests|clients|proposals)(\/|$)/.test(state.route));
  };

  render();
})();

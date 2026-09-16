// TC 申请工作台主程序
(function(){
  let currentStandard = null; // 当前选中的标准（用于过滤）
  let currentModule = 'home'; // 当前模块：home / settings / 标准key
  let currentSubView = 'orders'; // 标准模块内子视图：orders / quotas / certificates
  let editingOrderId = null;  // 当前正在编辑的订单ID
  let fieldDictCache = null;  // 字段别名词典缓存

  // 可编辑的订单关键字段
  const ORDER_FIELDS = [
    {key:'productionOrder', label:'生产订单号'},
    {key:'fabricCode', label:'布编'},
    {key:'batchNo', label:'缸号'},
    {key:'composition', label:'成分'},
    {key:'contractNo', label:'合同号'},
    {key:'invoiceNo', label:'发票号'},
    {key:'quantityY', label:'数量(y)'},
    {key:'netWeight', label:'净重(kg)'},
    {key:'grossWeight', label:'毛重(kg)'},
    {key:'customer', label:'客户'},
    {key:'po', label:'PO号'}
  ];

  // 初始化
  function init(){
    if(window.pdfjsLib){
      try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/lib/pdf.worker.min.js'; } catch(e){}
    }
    DataStore.ensureSeed();
    const boot = function(){ migrateSystems(); bindLogin(); checkSession(); };
    if(DataStore.isGithubEnabled()){
      // 启用云端时，先拉取共享数据再渲染（云端为真相源，本机仅缓存）
      DataStore.syncPull().then(boot).catch(function(e){
        console.warn('云端拉取失败，使用本地数据：', e && e.message);
        boot();
      });
    } else {
      boot();
    }
  }

  function checkSession(){
    const u = Auth.getCurrent();
    if(u){
      showApp();
    } else {
      document.getElementById('login-view').style.display = 'flex';
      document.getElementById('app-view').style.display = 'none';
    }
  }

  function bindLogin(){
    const btn = document.getElementById('login-btn');
    const skip = document.getElementById('skip-login-btn');
    if(btn){
      btn.addEventListener('click', function(){
        const account = document.getElementById('login-account').value.trim();
        const password = document.getElementById('login-password').value;
        const res = Auth.login(account, password);
        if(res.ok){
          showApp();
        } else {
          document.getElementById('login-error').textContent = res.msg;
        }
      });
    }
    if(skip){
      skip.addEventListener('click', function(){
        // 预览模式：默认管理员
        sessionStorage.setItem('tc_current', 'admin');
        showApp();
      });
    }
    const logout = document.getElementById('logout-btn');
    if(logout){
      logout.addEventListener('click', function(){
        Auth.logout();
        location.reload();
      });
    }
  }

  function showApp(){
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('app-view').style.display = 'block';
    const u = Auth.getCurrent();
    document.getElementById('current-user').textContent = (u ? u.name : '管理员') + (u && u.role==='admin' ? '（管理）' : '');
    renderModuleMenu();
    bindStaticNav();
    // 默认工作台总览
    selectModule('home');
  }

  // 左侧模块菜单
  function renderModuleMenu(){
    const menu = document.getElementById('module-menu');
    if(!menu) return;
    const standards = Auth.visibleStandards();
    let html = '<li data-module="home" class="'+(currentModule==='home'?'active':'')+'">工作台总览</li>';
    standards.forEach(function(s){
      const active = currentModule===s.key ? ' active' : '';
      html += '<li data-module="'+s.key+'" class="'+active+'">'+s.shortName+' 证书申请 '+systemBadge(s.key)+'</li>';
    });
    menu.innerHTML = html;
    bindModuleMenu();
  }

  function bindModuleMenu(){
    document.querySelectorAll('#module-menu li[data-module]').forEach(function(li){
      li.addEventListener('click', function(){ selectModule(li.dataset.module); });
    });
  }

  function bindStaticNav(){
    document.querySelectorAll('.nav-menu li[data-view]').forEach(function(li){
      li.addEventListener('click', function(){ selectModule('settings'); });
    });
  }

  function selectModule(module){
    currentModule = module;
    currentStandard = (module === 'home' || module === 'settings') ? null : module;
    if(module !== 'home' && module !== 'settings') currentSubView = currentSubView || 'orders';
    renderModuleMenu();
    renderMain();
  }

  function setSubView(view){
    currentSubView = view;
    renderMain();
  }

  function renderSubTabs(){
    const views = [
      {key:'orders', label:'订单管理'},
      {key:'quotas', label:'原纱额度汇总'},
      {key:'certificates', label:'证书库'}
    ];
    let html = '<div class="sub-tabs">';
    views.forEach(function(v){
      html += '<div class="sub-tab '+(currentSubView===v.key?'active':'')+'" data-sub="'+v.key+'">'+v.label+'</div>';
    });
    html += '</div>';
    return html;
  }

  function bindSubTabs(){
    document.querySelectorAll('.sub-tab').forEach(function(el){
      el.addEventListener('click', function(){ setSubView(el.dataset.sub); });
    });
  }

  // 渲染主内容区
  function renderMain(){
    const main = document.getElementById('main-content');
    if(currentModule === 'home'){
      main.innerHTML = renderHome();
    } else if(currentModule === 'settings'){
      main.innerHTML = renderSettings();
    } else {
      let html = '<div class="section-title">'+standardShort(currentModule)+' 证书申请</div>';
      html += renderSubTabs();
      if(currentSubView === 'orders') html += renderOrders();
      else if(currentSubView === 'quotas') html += renderQuotas();
      else if(currentSubView === 'certificates') html += renderCertificates();
      main.innerHTML = html;
      bindSubTabs();
    }
  }

  // 工具：筛选标准
  function filterByStd(list, field){
    if(!currentStandard) return list;
    return list.filter(function(x){ return x[field] === currentStandard; });
  }

  // 机构徽章：Regenagri 发证机构为 CU，其他为 ECOCERT
  function systemBadge(stdKey){
    const all = DataStore.load('standards')||[];
    const s = all.find(function(x){ return x.key===stdKey; });
    if(!s) return '';
    const agency = s.agency || (s.system==='CU' ? 'CU' : s.system);
    const cls = agency==='CU' ? 'cu' : 'eco';
    return '<span class="badge '+cls+'">'+agency+'</span>';
  }

  // 标准缩写：Regenagri 显示 REG
  function standardShort(stdKey){
    const all = DataStore.load('standards')||[];
    const s = all.find(function(x){ return x.key===stdKey; });
    if(!s) return stdKey;
    return s.shortName || stdKey;
  }

  // ---------- 首页 ----------
  function renderHome(){
    const orders = filterByStd(DataStore.load('orders')||[], 'standard');
    const quotas = filterByStd(DataStore.load('quotas')||[], 'standard');
    const standards = Auth.visibleStandards();
    const activeOrders = orders.length;
    const pending = orders.filter(function(o){ return o.statusStep && o.statusStep < 6; }).length;
    const totalAvailable = quotas.reduce(function(sum, q){ return sum + (parseFloat(q.weight)||0); }, 0);

    let html = '<div class="section-title">工作台总览'+(currentStandard?' · '+currentStandard:'')+'</div>';

    // 6 步流程图
    html += '<div class="card home-flow"><h3>TC 申请流程</h3>';
    html += renderFlow(1);
    html += '</div>';

    html += '<div class="metric-row">';
    html += metricCard('活跃订单', activeOrders);
    html += metricCard('待处理', pending);
    html += metricCard('可用额度(kg)', formatNum(totalAvailable));
    html += metricCard('负责标准', standards.length);
    html += '</div>';

    // 5 标准额度健康
    html += '<div class="card"><h3>额度健康度</h3>';
    standards.forEach(function(s){
      const sq = (DataStore.load('quotas')||[]).filter(function(q){ return q.standard===s.key; });
      const total = sq.reduce(function(sum, q){ return sum + (parseFloat(q.weight)||0); }, 0);
      const max = 250000; // 示意上限
      const pct = Math.min(100, Math.round(total/max*100));
      const low = pct < 10;
      html += '<div class="std-card">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<div><strong>'+s.name+'</strong> '+systemBadge(s.key)+' <span style="color:#888;font-size:12px;margin-left:6px;">'+s.systemName+'</span></div>';
      html += '<div style="font-weight:500;">'+formatNum(total)+' kg</div>';
      html += '</div>';
      html += '<div class="quota-bar"><span style="width:'+pct+'%;background:'+(low?'#A32D2D':'#185FA5')+'"></span></div>';
      html += '<div style="font-size:11px;color:#888;">占示意上限 '+pct+'%'+(low?' · 额度偏低':'')+'</div>';
      html += '</div>';
    });
    html += '</div>';

    // 最近订单
    html += '<div class="card"><h3>最近订单</h3>';
    if(orders.length===0){
      html += '<div class="empty">暂无订单</div>';
    } else {
      html += '<table><thead><tr><th>标准</th><th>客户</th><th>PO</th><th>布编</th><th>当前步骤</th><th>创建</th></tr></thead><tbody>';
      sortOrders(orders).slice(0, 5).forEach(function(o){
        html += '<tr><td>'+systemBadge(o.standard)+'</td><td>'+o.customer+'</td><td>'+o.po+'</td><td>'+(o.fabricCode||'-')+'</td><td>'+flowStepName(o.statusStep)+'</td><td>'+o.createdAt+'</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';
    return html;
  }

  function metricCard(label, value){
    return '<div class="metric"><div class="label">'+label+'</div><div class="value">'+value+'</div></div>';
  }

  function flowStepName(step){
    const names = ['', '收到订单', '符合性核对', '额度计算', '上传系统', '草拟确认', '出正本'];
    return names[step] || '未知';
  }

  function formatNum(n){
    if(n===undefined || n===null) return '-';
    return parseFloat(n).toLocaleString('zh-CN', {maximumFractionDigits:2});
  }

  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // 多文件字段一致性：归一化后比较
  function normalizeForCompare(v, field){
    if(v === null || v === undefined) return '';
    let s = String(v).trim();
    if(field === 'quantityY' || field === 'netWeight' || field === 'grossWeight'){
      s = s.replace(/,/g, '');
      const n = parseFloat(s);
      if(!isNaN(n)) s = String(n);
    }
    return s;
  }

  // 把多份文件的识别结果合并为“多数值”
  function mergeExtractions(files){
    const keys = ['productionOrder','fabricCode','batchNo','composition','contractNo','invoiceNo','quantityY','netWeight','grossWeight','customer','po'];
    const merged = {};
    keys.forEach(function(k){
      const counts = {};
      files.forEach(function(f){
        const v = f.extracted && f.extracted[k];
        if(v !== null && v !== undefined && String(v).trim() !== ''){
          const key = normalizeForCompare(v, k);
          if(key === '') return;
          counts[key] = (counts[key] || 0) + 1;
        }
      });
      let best = null, bestCount = 0;
      for(const key in counts){ if(counts[key] > bestCount){ best = key; bestCount = counts[key]; } }
      if(best !== null){
        merged[k] = (k === 'quantityY' || k === 'netWeight' || k === 'grossWeight') ? parseFloat(best) : best;
      }
    });
    return merged;
  }

  // 计算多份文件之间的不一致字段，返回 { field: "文件名:值；文件名:值" }
  function computeAnomalies(order){
    const files = order.fileExtractions || [];
    if(files.length < 2) return {};
    const keys = ['productionOrder','fabricCode','batchNo','composition','contractNo','invoiceNo','quantityY','netWeight','grossWeight','customer','po'];
    const anomalies = {};
    keys.forEach(function(k){
      const groups = {}; // normalized value -> { raw, names: [] }
      files.forEach(function(f){
        const v = f.extracted && f.extracted[k];
        if(v !== null && v !== undefined && String(v).trim() !== ''){
          const key = normalizeForCompare(v, k);
          if(key === '') return;
          if(!groups[key]) groups[key] = { raw: String(v).trim(), names: [] };
          groups[key].names.push(f.name);
        }
      });
      const values = Object.keys(groups);
      if(values.length > 1){
        anomalies[k] = values.map(function(key){
          return groups[key].names.join('、') + '：' + groups[key].raw;
        }).join('；');
      }
    });
    return anomalies;
  }

  // 订单排序：新订单置顶（createdAt 降序，时间相同则按订单号降序）
  function sortOrders(list){
    return list.slice().sort(function(a, b){
      const ta = a.createdAt || '';
      const tb = b.createdAt || '';
      if(ta !== tb) return tb.localeCompare(ta);
      return String(b.id).localeCompare(String(a.id));
    });
  }

  // 字段合规状态：ok / missing / invalid / anomaly
  function fieldStatus(order, field){
    // 多文件同一字段不一致时优先标红
    const anomalies = computeAnomalies(order);
    if(anomalies[field]) return 'invalid';
    const val = order[field];
    const hasVal = val !== undefined && val !== null && String(val).trim() !== '';
    if(!hasVal) return 'missing';
    if(field === 'contractNo'){
      if(!/^CTR-\d{4}-\d{4}$/.test(String(val))) return 'invalid';
    }
    if(field === 'quantityY' || field === 'netWeight' || field === 'grossWeight'){
      const n = parseFloat(val);
      if(isNaN(n) || n <= 0) return 'invalid';
    }
    if((field === 'netWeight' || field === 'grossWeight') && order.netWeight && order.grossWeight){
      const n = parseFloat(order.netWeight), g = parseFloat(order.grossWeight);
      if(!isNaN(n) && !isNaN(g) && n > g) return 'invalid';
    }
    return 'ok';
  }

  function tdClass(status){
    if(status === 'missing') return 'td-missing';
    if(status === 'invalid') return 'td-invalid';
    return '';
  }

  function renderVal(order, field){
    const status = fieldStatus(order, field);
    const val = order[field];
    const text = (val === undefined || val === null || String(val).trim() === '') ? '未填写' : String(val);
    // 缸号列：超过 4 个时自动拆成双排（每行 2 个），避免拉长整表
    if(field === 'batchNo' && text !== '未填写'){
      const items = text.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
      if(items.length > 4){
        const inner = items.map(function(b){ return '<span class="batch-item">'+escapeHtml(b)+'</span>'; }).join('');
        return '<td class="'+tdClass(status)+' batch-cell"><div class="batch-list multi">'+inner+'</div></td>';
      } else if(items.length > 1){
        const inner = items.map(function(b){ return '<span class="batch-item">'+escapeHtml(b)+'</span>'; }).join('');
        return '<td class="'+tdClass(status)+' batch-cell"><div class="batch-list">'+inner+'</div></td>';
      }
    }
    return '<td class="'+tdClass(status)+'">'+text+'</td>';
  }

  function previewNewFiles(){
    const input = document.getElementById('new-order-file');
    if(input && input.files) renderFileList(Array.from(input.files), 'new-order-file-list');
  }

  // ---------- 新建订单 ----------
  function nextOrderId(){
    const orders = DataStore.load('orders') || [];
    const nums = orders.map(function(o){ const m = String(o.id).match(/(\d+)/); return m ? parseInt(m[1],10) : 0; });
    const max = nums.length ? Math.max.apply(null, nums) : 0;
    return 'ORD-' + String(max + 1).padStart(3, '0');
  }

  function toggleNewOrderForm(){
    window.__showNewOrderForm = !window.__showNewOrderForm;
    renderMain();
  }

  function renderNewOrderForm(){
    let html = '<div class="card" style="margin-bottom:16px;padding:14px;">';
    html += '<h4 style="margin:0 0 10px;font-size:13px;color:#333;">新建订单（标准：'+standardShort(currentStandard)+'）</h4>';
    html += '<p style="margin:0 0 10px;font-size:12px;color:#666;">一次可选多份订单文件（销售合同 / Packing List / Delivery Note / 发票 / 码单等），系统自动识别关键字段并交叉核对，不一致时会在"异常原因"列说明。文件不保存，仅用于识别。</p>';
    html += '<input type="file" id="new-order-file" multiple style="font-size:12px;" accept=".pdf,.xlsx,.xls,.csv,.doc,.docx" onchange="App.previewNewFiles()">';
    html += '<button class="btn primary" style="margin-left:8px;" onclick="App.createOrderFromFile()">开始识别并创建</button>';
    html += '<button class="btn" style="margin-left:8px;" onclick="App.toggleNewOrderForm()">取消</button>';
    html += '<span id="new-order-status" style="font-size:12px;color:#185FA5;margin-left:8px;"></span>';
    html += '<div id="new-order-file-list" style="margin-top:10px;font-size:12px;color:#555;"></div>';
    html += '</div>';
    return html;
  }

  function renderFileList(list, containerId){
    const el = document.getElementById(containerId);
    if(!el) return;
    if(!list || !list.length){ el.innerHTML = ''; return; }
    let html = '<strong>已选文件：</strong>';
    list.forEach(function(f, idx){
      html += '<span class="badge" style="margin-right:6px;">'+(idx+1)+'. '+f.name+' ('+(f.size/1024/1024).toFixed(2)+'MB)</span>';
    });
    el.innerHTML = html;
  }

  async function createOrderFromFile(){
    const input = document.getElementById('new-order-file');
    const files = input && input.files;
    if(!files || files.length === 0){ alert('请先选择订单文件'); return; }
    if(!currentStandard){ alert('请先选择一个标准模块'); return; }
    const status = document.getElementById('new-order-status');
    if(status){ status.textContent = '识别 1/' + files.length + '…'; status.style.color = '#B8860B'; }
    renderFileList(Array.from(files), 'new-order-file-list');
    try {
      const fileExtractions = [];
      for(let i = 0; i < files.length; i++){
        const file = files[i];
        if(status){ status.textContent = '识别 ' + (i+1) + '/' + files.length + '：' + file.name + '…'; }
        const text = await parseFile(file);
        const fields = extractFields(text);
        fileExtractions.push({
          name: file.name,
          size: (file.size/1024/1024).toFixed(2)+'MB',
          extracted: fields,
          status: '已识别'
        });
      }
      const merged = mergeExtractions(fileExtractions);
      const id = nextOrderId();
      const newOrder = {
        id: id,
        standard: currentStandard,
        customer: merged.customer || '',
        po: merged.po || '',
        weight: parseFloat(merged.netWeight) || 0,
        statusStep: 1,
        stepName: '资料收集',
        createdBy: (Auth.getCurrent() || {}).id || 'admin',
        createdAt: new Date().toISOString().slice(0,16).replace('T',' '),
        productionOrder: merged.productionOrder || '',
        fabricCode: merged.fabricCode || '',
        batchNo: merged.batchNo || '',
        composition: merged.composition || '',
        contractNo: merged.contractNo || '',
        invoiceNo: merged.invoiceNo || '',
        quantityY: merged.quantityY || null,
        netWeight: merged.netWeight || null,
        grossWeight: merged.grossWeight || null,
        fileExtractions: fileExtractions,
        extracted: merged,
        extractedSource: fileExtractions.map(function(f){ return f.name; }).join('、'),
        compliance: []
      };
      newOrder.compliance = buildCompliance(newOrder);
      const orders = DataStore.load('orders') || [];
      orders.push(newOrder);
      DataStore.save('orders', orders);
      window.__showNewOrderForm = false;
      window.__expandedOrder = id;
      if(status){ status.textContent = '创建完成：' + id; status.style.color = '#2E7D32'; }
      renderMain();
    } catch(e){
      if(status){ status.textContent = '失败'; status.style.color = '#A32D2D'; }
      alert('识别失败：' + e.message);
    }
  }

  // ---------- 批量导入已开证TC（从 import_orders.json） ----------
  async function importIssuedTC(){
    if(!confirm('将从 import_orders.json 导入已开证的 TC 订单（共 14 张，状态置为「出正本」）。\n已存在的同编号订单会自动跳过。是否继续？')) return;
    try {
      const res = await fetch('import_orders.json', { cache: 'no-store' });
      if(!res.ok){ alert('无法读取 import_orders.json（HTTP ' + res.status + '）'); return; }
      const list = await res.json();
      const orders = DataStore.load('orders') || [];
      const existing = new Set(orders.map(function(o){ return o.id; }));
      let added = 0, skipped = 0;
      (list || []).forEach(function(src){
        if(existing.has(src.id)){ skipped++; return; }
        const o = Object.assign({}, src);
        o.compliance = o.compliance || [];
        if(!o.createdBy) o.createdBy = 'admin';
        orders.push(o);
        added++;
      });
      DataStore.save('orders', orders);
      renderMain();
      alert('导入完成：新增 ' + added + ' 张，跳过 ' + skipped + ' 张（编号已存在）。');
    } catch(e){
      alert('导入失败：' + e.message);
    }
  }

  // ---------- 订单管理 ----------
  function renderOrders(){
    const orders = sortOrders(filterByStd(DataStore.load('orders')||[], 'standard'));
    let html = '<div style="margin-bottom:14px;"><button class="btn primary" onclick="App.toggleNewOrderForm()">+ 新建订单</button><button class="btn" style="margin-left:8px;" onclick="App.importIssuedTC()">导入已开证TC</button></div>';
    if(window.__showNewOrderForm){
      html += renderNewOrderForm();
    }
    if(orders.length===0 && !window.__showNewOrderForm){
      html += '<div class="empty">当前标准下暂无订单</div>';
      return html;
    }
    // 订单列表表格
    html += '<div class="card" style="overflow-x:auto;">';
    html += '<table class="order-table">';
    html += '<thead><tr>';
    html += '<th>订单号</th><th>标准</th>';
    html += '<th>生产订单号</th><th>布编</th><th>缸号</th><th>成分</th><th>合同号</th><th>发票号</th>';
    html += '<th>数量(y)</th><th>净重(kg)</th><th>毛重(kg)</th>';
    html += '<th>客户</th><th>PO号</th><th>当前步骤</th><th>操作</th><th>记录时间</th>';
    html += '</tr></thead><tbody>';
    orders.forEach(function(o){
      const expanded = window.__expandedOrder === o.id;
      html += '<tr id="order-row-'+o.id+'">';
      html += '<td><strong>'+o.id+'</strong></td>';
      html += '<td>'+systemBadge(o.standard)+'</td>';
      html += renderVal(o, 'productionOrder');
      html += renderVal(o, 'fabricCode');
      html += renderVal(o, 'batchNo');
      html += renderVal(o, 'composition');
      html += renderVal(o, 'contractNo');
      html += renderVal(o, 'invoiceNo');
      html += renderVal(o, 'quantityY');
      html += renderVal(o, 'netWeight');
      html += renderVal(o, 'grossWeight');
      const cust = escapeHtml(o.customer || '-');
      html += '<td title="'+cust+'"><span class="cell-ellipsis">'+cust+'</span></td>';
      html += '<td><span class="cell-ellipsis">'+(o.po||'-')+'</span></td>';
      html += '<td><span class="badge '+ (o.statusStep>=6?'ok':'warn') +'">'+flowStepName(o.statusStep)+'</span></td>';
      html += '<td>';
      html += '<button class="btn btn-sm" onclick="App.toggleOrder(\''+o.id+'\')">'+(expanded?'收起':'展开')+'</button>';
      html += '<button class="btn btn-sm" onclick="App.editOrder(\''+o.id+'\')">编辑</button>';
      html += '<button class="btn btn-sm danger" onclick="App.deleteOrder(\''+o.id+'\')">删除</button>';
      html += '</td>';
      html += '<td><span class="cell-ellipsis">'+(o.createdAt||'-')+'</span></td>';
      html += '</tr>';
      if(expanded){
        html += '<tr class="order-detail-row"><td colspan="16">'+renderOrderDetail(o)+'</td></tr>';
      }
    });
    html += '</tbody></table>';
    html += '</div>';
    return html;
  }

  function renderOrderDetail(o){
    let html = '<div class="order-detail" style="padding:12px;background:#fafaf9;border-radius:8px;">';

    // 编辑模式：直接显示可编辑表单
    if(window.__editingOrder === o.id){
      html += '<h4 style="margin:0 0 10px;font-size:13px;color:#333;">编辑订单关键信息</h4>';
      html += '<table class="order-info-table">';
      html += '<thead><tr><th>字段</th><th>当前值</th></tr></thead><tbody>';
      ORDER_FIELDS.forEach(function(f){
        const val = (o[f.key] === undefined || o[f.key] === null) ? '' : String(o[f.key]);
        const inputType = (f.key === 'quantityY' || f.key === 'netWeight' || f.key === 'grossWeight') ? 'text' : 'text';
        html += '<tr>';
        html += '<td>'+f.label+'</td>';
        html += '<td><input type="'+inputType+'" id="edit-'+o.id+'-'+f.key+'" class="edit-input" value="'+escapeHtml(val)+'"></td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      html += '<div style="margin-top:10px;">';
      html += '<button class="btn primary" onclick="App.saveOrder(\''+o.id+'\')">保存</button> ';
      html += '<button class="btn" onclick="App.cancelEdit()">取消</button>';
      html += '</div>';
      html += '</div>';
      return html;
    }

    // 关键字段表格（含多文件一致性异常原因）
    const anomalies = computeAnomalies(o);
    html += '<h4 style="margin:0 0 10px;font-size:13px;color:#333;">订单关键信息</h4>';
    html += '<table class="order-info-table">';
    html += '<thead><tr><th>字段</th><th>当前值</th><th>状态</th><th>异常原因（多文件不一致）</th></tr></thead><tbody>';
    ORDER_FIELDS.forEach(function(f){
      let status = fieldStatus(o, f.key);
      const val = o[f.key];
      const text = (val === undefined || val === null || String(val).trim() === '') ? '未填写' : String(val);
      let statusText = '正常', statusBadge = 'ok';
      if(anomalies[f.key]){ statusText = '不一致'; statusBadge = 'warn'; }
      else if(status === 'missing'){ statusText = '缺失'; statusBadge = 'warn'; }
      else if(status === 'invalid'){ statusText = '不合规'; statusBadge = 'warn'; }
      html += '<tr>';
      html += '<td>'+f.label+'</td>';
      html += '<td class="'+tdClass(status)+'">'+text+'</td>';
      html += '<td><span class="badge '+statusBadge+'">'+statusText+'</span></td>';
      html += '<td>'+(anomalies[f.key] ? '<span class="anomaly-reason">'+anomalies[f.key]+'</span>' : '—')+'</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';

    // 上传区域
    html += '<h4 style="margin:20px 0 10px;font-size:13px;color:#333;">订单文件识别</h4>';
    html += '<div style="padding:14px;background:#f7f7f6;border-radius:8px;">';
    html += '<p style="margin:0 0 10px;font-size:12px;color:#666;">上传销售合同 / Packing List / Delivery Note / 发票等，系统自动识别关键字段并检测合规性。文件不保存，仅用于识别。</p>';
    html += '<input type="file" id="order-file-'+o.id+'" multiple style="font-size:12px;" accept=".pdf,.xlsx,.xls,.csv,.doc,.docx">';
    html += '<button class="btn primary" style="margin-left:8px;" onclick="App.uploadOrderFile(\''+o.id+'\')">开始识别</button>';
    html += '<span id="parse-status-'+o.id+'" style="font-size:12px;color:#185FA5;margin-left:8px;"></span>';
    html += '</div>';

    // 已上传文件
    const extractedFiles = o.fileExtractions && o.fileExtractions.length ? o.fileExtractions : (o.files || []);
    if(extractedFiles.length){
      html += '<div style="margin-top:12px;">';
      html += '<strong style="font-size:12px;">已识别文件：</strong>';
      extractedFiles.forEach(function(f){
        html += '<span class="badge" style="margin-right:6px;">'+f.name+' ('+(f.size||'-')+') '+(f.status||'已识别')+'</span>';
      });
      html += '</div>';
    }

    // 识别结果（固定 9 个关键字段，未识别提示手动补）
    const showFields = ['productionOrder','fabricCode','batchNo','composition','contractNo','invoiceNo','quantityY','netWeight','grossWeight','customer','po'];
    if(o.extracted || o.productionOrder){
      html += '<h4 style="margin:20px 0 10px;font-size:13px;color:#333;">识别结果（自动提取）</h4>';
      html += '<div class="kv-grid">';
      showFields.forEach(function(k){
        let v = (o.extracted && o.extracted[k]!=null) ? o.extracted[k] : (o[k]!=null ? o[k] : null);
        html += kv(fieldLabel(k), v!=null ? v : '未识别，请手动补充');
      });
      html += '</div>';
      if(o.extractedSource){
        html += '<div style="font-size:11px;color:#999;margin-top:6px;">识别来源：'+o.extractedSource+'</div>';
      }
    }

    // 合规检测
    const compliance = o.compliance && o.compliance.length ? o.compliance : buildCompliance(o);
    html += '<h4 style="margin:20px 0 10px;font-size:13px;color:#333;">合规检测</h4>';
    html += renderCompliance(compliance);

    html += '</div>';
    return html;
  }

  function kv(k, v){
    return '<div class="kv-item"><span class="kv-key">'+k+'</span><span class="kv-val">'+(v||'<span style="color:#999">未填写</span>')+'</span></div>';
  }

  function fieldLabel(key){
    const map = {
      productionOrder:'生产订单号', fabricCode:'布编', batchNo:'缸号', composition:'成分',
      contractNo:'合同号', invoiceNo:'发票号',
      quantityY:'数量(y)', netWeight:'净重(kg)', grossWeight:'毛重(kg)',
      customer:'客户', po:'PO号'
    };
    return map[key] || key;
  }

  function renderCompliance(list){
    let html = '<table><thead><tr><th>检测项</th><th>状态</th><th>说明</th></tr></thead><tbody>';
    list.forEach(function(item){
      const badge = item.status==='ok'
        ? '<span class="badge ok">通过</span>'
        : '<span class="badge warn">'+ (item.status==='warn'?'警告':'不合规') +'</span>';
      html += '<tr><td>'+item.rule+'</td><td>'+badge+'</td><td>'+(item.msg||'')+'</td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function renderFlow(step){
    const steps = ['收到订单','符合性核对','额度计算','上传系统','草拟确认','出正本'];
    let html = '<div class="flow">';
    steps.forEach(function(name, idx){
      const n = idx + 1;
      let cls = 'flow-step';
      if(n < step) cls += ' done';
      else if(n === step) cls += ' active';
      html += '<div class="'+cls+'">'+(n)+'. '+name+'</div>';
    });
    html += '</div>';
    return html;
  }

  // ---------- 原纱额度汇总 ----------
  function renderQuotas(){
    let quotas = filterByStd(DataStore.load('quotas')||[], 'standard');
    // 过滤掉 MVP 演示用的占位行（name='待录入' 且 weight=0）
    quotas = quotas.filter(function(q){ return !(String(q.name).trim()==='待录入' && parseFloat(q.weight||0)===0); });
    let html = '';

    // 录入入口
    html += '<div class="card" style="margin-bottom:14px;padding:14px;">';
    html += '<h4 style="margin:0 0 10px;font-size:13px;color:#333;">录入原纱额度</h4>';
    html += '<p style="margin:0 0 10px;font-size:12px;color:#666;">上传原纱 TC 证书（PDF / Excel / Word），系统自动识别「原始名称、批次、成分、额度(kg)」并累加到汇总表。</p>';
    html += '<input type="file" id="quota-file" style="font-size:12px;" accept=".pdf,.xlsx,.xls,.csv,.doc,.docx">';
    html += '<button class="btn primary" style="margin-left:8px;" onclick="App.uploadQuotaFile()">开始录入</button>';
    html += '<span id="quota-parse-status" style="font-size:12px;color:#185FA5;margin-left:8px;"></span>';
    html += '</div>';

    if(quotas.length===0){
      html += '<div class="empty">当前标准下暂无额度数据</div>';
      return html;
    }
    html += '<div class="card" style="overflow-x:auto;">';
    html += '<table class="quota-table">';
    html += '<thead><tr><th>序号</th><th>证书编号</th><th>机构</th><th>TC时间</th><th>标准</th><th>原始名称</th><th>批次</th><th>成分</th><th>额度/kg</th><th>备注</th><th>操作</th></tr></thead><tbody>';
    let idx = 1;
    quotas.forEach(function(q){
      html += '<tr>';
      html += '<td>'+(idx++)+'</td>';
      html += '<td>'+(q.tcNo||'-')+'</td>';
      html += '<td>'+(q.agency||systemBadge(q.standard))+'</td>';
      html += '<td>'+(q.tcDate||'-')+'</td>';
      html += '<td>'+standardShort(q.standard)+'</td>';
      html += '<td>'+(q.name||'-')+'</td>';
      html += '<td>'+(q.batch||'-')+'</td>';
      html += '<td>'+(q.composition||'-')+'</td>';
      html += '<td style="text-align:right;font-weight:500;">'+formatNum(q.weight)+'</td>';
      html += '<td>'+(q.remark||'')+'</td>';
      html += '<td><button class="btn" style="padding:2px 8px;font-size:11px;" onclick="App.deleteQuota(\''+q.standard+'\',\''+String(q.name).replace(/'/g,"\\'")+'\',\''+(q.tcNo||'-')+'\')">删除</button></td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    html += '</div>';
    html += '<div style="font-size:12px;color:#888;margin-top:8px;">说明：可用额度来自原纱 TC 证书库，出货后自动扣减（本 MVP 暂未接入出货流水扣减）。</div>';
    return html;
  }

  // ---------- 证书库 ----------
  function renderCertificates(){
    const certs = filterByStd(DataStore.load('certificates')||[], 'standard');
    let html = '';
    if(certs.length===0){
      html += '<div class="empty">当前标准下暂无证书</div>';
      return html;
    }
    html += '<table><thead><tr><th>标准</th><th>供应商</th><th>TC 号</th><th>重量(kg)</th><th>月份</th></tr></thead><tbody>';
    certs.forEach(function(c){
      html += '<tr><td>'+systemBadge(c.standard)+'</td><td>'+c.supplier+'</td><td>'+c.tcNo+'</td><td style="text-align:right;">'+formatNum(c.weight)+'</td><td>'+c.date+'</td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  // ---------- 系统接入迁移与本地密码 ----------
  // 自动把已配置的系统（如 ECOCERT）标记为已接入并补全网址/账号；不破坏现有数据，不写密码。
  function migrateSystems(){
    try {
      const settings = DataStore.load('settings') || {};
      settings.systems = settings.systems || {};
      const ECO = { name:'ECOCERT NTC', standards:['GRS','RCS','GOTS','OCS'], status:'已接入', url:'https://ntc.ecocert.cc/client', account:'vananhdao42@gmail.com' };
      let changed = false;
      if(!settings.systems.ECOCERT){
        settings.systems.ECOCERT = { name:ECO.name, standards:ECO.standards, status:ECO.status, url:ECO.url, account:ECO.account };
        changed = true;
      } else {
        const s = settings.systems.ECOCERT;
        if(s.status !== '已接入'){ s.status = '已接入'; changed = true; }
        if(!s.url){ s.url = ECO.url; changed = true; }
        if(!s.account){ s.account = ECO.account; changed = true; }
        if(!s.name || s.name === 'ECOCERT'){ s.name = ECO.name; changed = true; }
      }
      if(changed){ DataStore.save('settings', settings); }
    } catch(e){ console.warn('migrateSystems 失败：', e); }
  }

  // 仅本机保存系统密码（独立键 tc_syspwd_<key>，不在同步集合内，绝不随云端上传）
  function saveSysPwd(key){
    const el = document.getElementById('syspwd-' + key);
    if(!el) return;
    try { localStorage.setItem('tc_syspwd_' + key, el.value); } catch(e){}
    el.style.borderColor = '#2E7D32';
    setTimeout(function(){ el.style.borderColor = '#ddd'; }, 1200);
  }
  function toggleSysPwd(key){
    const el = document.getElementById('syspwd-' + key);
    if(!el) return;
    el.type = (el.type === 'password') ? 'text' : 'password';
  }

  // ---------- 系统配置 ----------
  function renderSettings(){
    const settings = DataStore.load('settings') || {};
    const users = DataStore.load('users') || [];
    const systems = settings.systems || {};
    const standards = DataStore.load('standards') || [];
    let html = '<div class="section-title">系统配置</div>';

    html += '<div class="card"><h3>双系统接入状态</h3>';
    for(const key in systems){
      const sys = systems[key];
      let savedPwd = '';
      try { savedPwd = localStorage.getItem('tc_syspwd_' + key) || ''; } catch(e){}
      html += '<div style="margin-bottom:12px;padding:10px;background:#f7f7f6;border-radius:6px;">';
      html += '<strong>'+escapeHtml(sys.name||key)+'</strong> <span class="badge '+ (sys.status==='已接入'?'ok':'warn') +'">'+escapeHtml(sys.status||'')+'</span>';
      html += '<div style="color:#888;font-size:12px;margin-top:4px;">负责标准：'+sys.standards.join('、')+'</div>';
      if(sys.url){
        html += '<div style="margin-top:6px;font-size:13px;"><a href="'+escapeHtml(sys.url)+'" target="_blank" rel="noopener" style="color:#185FA5;text-decoration:none;">🔗 打开系统 ↗</a> <span style="color:#888;">'+escapeHtml(sys.url)+'</span></div>';
      }
      if(sys.account){
        html += '<div style="margin-top:4px;font-size:13px;color:#444;">账号：'+escapeHtml(sys.account)+'</div>';
      }
      // 仅本机密码（独立 localStorage 键，不在 DataStore.COLLECTIONS 内，绝不随云端同步上传）
      html += '<div style="margin-top:8px;font-size:12px;">';
      html += '<label style="display:block;margin-bottom:4px;color:#666;">记住密码（仅本机浏览器保存，开启云端同步也不会上传仓库）</label>';
      html += '<input id="syspwd-'+key+'" type="password" value="'+escapeHtml(savedPwd)+'" placeholder="输入后点保存" style="width:58%;padding:5px;border:1px solid #ddd;border-radius:4px;font-size:12px;"> ';
      html += '<button class="btn" style="padding:5px 10px;font-size:12px;" onclick="App.saveSysPwd(\''+key+'\')">保存</button> ';
      html += '<button class="btn" style="padding:5px 10px;font-size:12px;" onclick="App.toggleSysPwd(\''+key+'\')">显示/隐藏</button>';
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';

    html += '<div class="card"><h3>用户与权限</h3>';
    html += '<table><thead><tr><th>账号</th><th>姓名</th><th>角色</th><th>可见标准</th></tr></thead><tbody>';
    users.forEach(function(u){
      const stds = (u.standards.indexOf('all')>=0 ? '全部' : u.standards.join('、'));
      html += '<tr><td>'+u.account+'</td><td>'+u.name+'</td><td>'+(u.role==='admin'?'管理员':'员工')+'</td><td>'+stds+'</td></tr>';
    });
    html += '</tbody></table>';
    html += '<div style="font-size:12px;color:#888;">当前登录用户：'+(Auth.getCurrent()||{}).name+'；预览模式下默认管理员，可见全部标准。</div>';
    html += '</div>';

    html += '<div class="card"><h3>标准列表</h3>';
    html += '<table><thead><tr><th>标准</th><th>所属系统</th><th>系统名称</th></tr></thead><tbody>';
    standards.forEach(function(s){
      html += '<tr><td>'+s.name+'</td><td>'+s.system+'</td><td>'+s.systemName+'</td></tr>';
    });
    html += '</tbody></table></div>';

    // ---------- 云端同步（GitHub Pages 共享数据） ----------
    const gh = DataStore.getGithubConfig() || {};
    const ghEnabled = DataStore.isGithubEnabled();
    html += '<div class="card"><h3>云端同步（GitHub Pages 共享数据）</h3>';
    html += '<p style="font-size:12px;color:#666;margin:0 0 12px;">开启后，订单/额度/证书等数据会实时同步到 GitHub 仓库的 <code>data/</code> 目录，换电脑、换浏览器、多人协作都看同一份数据。令牌(PAT)仅保存在本机浏览器，不会写入代码。</p>';
    html += '<label style="font-size:12px;"><input type="checkbox" id="gh-enabled" '+(ghEnabled?'checked':'')+'> 启用云端同步</label><br>';
    html += '<div style="margin-top:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">仓库（owner/repo，如 toby3611/tc-workbench）</label><input id="gh-repo" type="text" value="'+escapeHtml(gh.repo||'')+'" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;"></div>';
    html += '<div style="margin-top:10px;"><label style="font-size:12px;display:block;margin-bottom:4px;">GitHub 个人令牌 PAT（需 repo 权限）</label><input id="gh-token" type="password" placeholder="ghp_... 或 github_pat_..." value="'+escapeHtml(gh.token||'')+'" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;"></div>';
    html += '<div style="margin-top:14px;">';
    html += '<button class="btn primary" onclick="App.saveGithubConfig()">保存并连接测试</button> ';
    html += '<button class="btn" onclick="App.syncPull()">从云端拉取</button> ';
    html += '<button class="btn" onclick="App.syncPush()">推送到云端</button>';
    html += '</div>';
    html += '<div id="gh-status" style="font-size:12px;margin-top:10px;color:#185FA5;"></div>';
    html += '</div>';

    // 字段识别规则配置面板
    html += '<div class="card"><h3>字段识别规则（别名词典）</h3>';
    html += '<p style="font-size:12px;color:#666;margin:0 0 14px;">管理订单文件识别时使用的字段别名。每行一个别名，保存后立即生效；后续遇到供应商新写法，直接在这里添加。</p>';
    const fieldDict = getFieldDict();
    const fieldKeys = ['fabricCode','batchNo','netWeight','grossWeight','quantityY','contractNo','po','productionOrder','customer'];
    fieldKeys.forEach(function(k){
      const item = fieldDict[k] || { label:k, aliases:[] };
      html += '<div style="margin-bottom:14px;">';
      html += '<div style="font-size:12px;font-weight:500;margin-bottom:4px;">'+escapeHtml(item.label)+' <span style="color:#888;font-weight:400;">('+k+')</span></div>';
      html += '<textarea id="field-dict-'+k+'" rows="2" style="width:100%;font-size:12px;padding:6px;border:1px solid #ddd;border-radius:4px;resize:vertical;">'+escapeHtml(item.aliases.join('\n'))+'</textarea>';
      html += '</div>';
    });
    html += '<button class="btn primary" onclick="App.saveFieldDict()">保存识别规则</button>';
    html += '<span id="field-dict-status" style="font-size:12px;color:#185FA5;margin-left:8px;"></span>';
    html += '</div>';

    return html;
  }

  // ---------- 云端同步操作 ----------
  function saveGithubConfig(){
    const status = document.getElementById('gh-status');
    const repo = document.getElementById('gh-repo').value.trim();
    const token = document.getElementById('gh-token').value;
    const enabled = document.getElementById('gh-enabled').checked;
    if(enabled && (!repo || !token)){
      if(status){ status.style.color = '#A32D2D'; status.textContent = '启用需同时填写仓库和令牌'; }
      return;
    }
    DataStore.setGithubConfig({ enabled: enabled, repo: repo, token: token });
    if(!enabled){
      if(status){ status.style.color = '#2E7D32'; status.textContent = '已关闭云端同步（仅本机数据）'; }
      return;
    }
    if(status){ status.style.color = '#185FA5'; status.textContent = '正在连接测试…'; }
    DataStore.testGithub().then(function(info){
      if(status){ status.style.color = '#2E7D32'; status.textContent = '连接成功：' + info.full_name + '，正在推送当前数据…'; }
      return DataStore.syncPushAll();
    }).then(function(){
      if(status){ status.style.color = '#2E7D32'; status.textContent = '连接成功并已推送当前数据到云端 ✅'; }
    }).catch(function(e){
      if(status){ status.style.color = '#A32D2D'; status.textContent = '测试/推送失败：' + (e && e.message ? e.message : e); }
    });
  }

  function syncPull(){
    const status = document.getElementById('gh-status');
    if(status){ status.style.color = '#185FA5'; status.textContent = '正在从云端拉取…'; }
    DataStore.syncPull().then(function(){
      if(status){ status.style.color = '#2E7D32'; status.textContent = '已从云端拉取最新数据 ✅'; }
      renderMain();
    }).catch(function(e){
      if(status){ status.style.color = '#A32D2D'; status.textContent = '拉取失败：' + (e && e.message ? e.message : e); }
    });
  }

  function syncPush(){
    const status = document.getElementById('gh-status');
    if(status){ status.style.color = '#185FA5'; status.textContent = '正在推送到云端…'; }
    DataStore.syncPushAll().then(function(){
      if(status){ status.style.color = '#2E7D32'; status.textContent = '已推送到云端 ✅'; }
    }).catch(function(e){
      if(status){ status.style.color = '#A32D2D'; status.textContent = '推送失败：' + (e && e.message ? e.message : e); }
    });
  }

  function saveFieldDict(){
    const keys = ['fabricCode','batchNo','netWeight','grossWeight','quantityY','contractNo','po','productionOrder','customer'];
    const dict = {};
    keys.forEach(function(k){
      const ta = document.getElementById('field-dict-'+k);
      if(!ta) return;
      const aliases = ta.value.split(/\r?\n/).map(function(s){ return s.trim(); }).filter(function(s){ return s; });
      const existing = (getFieldDict()[k] || { label:k }).label;
      dict[k] = { label: existing, aliases: aliases };
    });
    DataStore.save('fieldDict', dict);
    invalidateFieldDictCache();
    const status = document.getElementById('field-dict-status');
    if(status){ status.textContent = '已保存'; status.style.color = '#2E7D32'; }
    setTimeout(function(){ if(status){ status.textContent = ''; } }, 2000);
  }

  // 订单详情交互（暴露给内联 onclick）
  function toggleOrder(id){
    window.__expandedOrder = (window.__expandedOrder === id ? null : id);
    window.__editingOrder = null;
    renderMain();
  }

  function editOrder(id){
    window.__expandedOrder = id;
    window.__editingOrder = id;
    renderMain();
  }

  function cancelEdit(){
    window.__editingOrder = null;
    renderMain();
  }

  function saveOrder(id){
    const orders = DataStore.load('orders') || [];
    const idx = orders.findIndex(function(o){ return o.id === id; });
    if(idx < 0) return;
    const o = orders[idx];
    ORDER_FIELDS.forEach(function(f){
      const input = document.getElementById('edit-'+id+'-'+f.key);
      if(!input) return;
      let v = input.value.trim();
      if(v === ''){
        o[f.key] = '';
        return;
      }
      if(f.key === 'quantityY' || f.key === 'netWeight' || f.key === 'grossWeight'){
        const n = parseFloat(v.replace(/,/g, ''));
        o[f.key] = isNaN(n) ? v : n;
      } else {
        o[f.key] = v;
      }
    });
    o.compliance = buildCompliance(o);
    DataStore.save('orders', orders);
    window.__editingOrder = null;
    renderMain();
  }

  // 上传订单文件并真实解析（Excel/PDF/Word 自动读文本提取字段）
  async function uploadOrderFile(id){
    const input = document.getElementById('order-file-'+id);
    const files = input && input.files;
    if(!files || files.length === 0){ alert('请先选择文件'); return; }
    const status = document.getElementById('parse-status-'+id);
    if(status){ status.textContent = '识别 1/' + files.length + '…'; status.style.color = '#B8860B'; }
    try {
      const orders = DataStore.load('orders') || [];
      const idx = orders.findIndex(function(o){ return o.id === id; });
      if(idx < 0) return;
      const o = orders[idx];
      o.fileExtractions = o.fileExtractions || [];
      for(let i = 0; i < files.length; i++){
        const file = files[i];
        if(status){ status.textContent = '识别 ' + (i+1) + '/' + files.length + '：' + file.name + '…'; }
        const text = await parseFile(file);
        const fields = extractFields(text);
        const existIdx = o.fileExtractions.findIndex(function(f){ return f.name === file.name; });
        const entry = { name:file.name, size:(file.size/1024/1024).toFixed(2)+'MB', extracted:fields, status:'已识别' };
        if(existIdx >= 0) o.fileExtractions[existIdx] = entry;
        else o.fileExtractions.push(entry);
      }
      // 合并多文件结果：取多数值作为当前订单值
      o.extracted = mergeExtractions(o.fileExtractions);
      // 同步到订单关键字段
      const syncKeys = ['productionOrder','fabricCode','batchNo','composition','contractNo','invoiceNo','quantityY','netWeight','grossWeight','customer','po'];
      syncKeys.forEach(function(k){ if(o.extracted[k] !== null && o.extracted[k] !== undefined) o[k] = o.extracted[k]; });
      o.extractedSource = o.fileExtractions.map(function(f){ return f.name; }).join('、');
      o.compliance = buildCompliance(o);
      DataStore.save('orders', orders);
      if(status){ status.textContent = '识别完成：共' + files.length + '份文件'; status.style.color = '#2E7D32'; }
      renderMain();
    } catch(e){
      if(status){ status.textContent = '失败'; status.style.color = '#A32D2D'; }
      alert('识别失败：' + e.message);
    }
  }

  // ---------- 原纱额度录入 ----------
  async function uploadQuotaFile(){
    const input = document.getElementById('quota-file');
    const file = input && input.files[0];
    if(!file){ alert('请先选择原纱 TC 证书文件'); return; }
    const status = document.getElementById('quota-parse-status');
    if(status){ status.textContent = '识别中…'; status.style.color = '#B8860B'; }
    try {
      const text = await parseFile(file);
      const parsed = extractQuotaFields(text, file.name);
      const items = (parsed.items || []).filter(function(it){ return it.name && it.weight; });
      if(!items.length){
        throw new Error('未能从证书中识别到原纱名称与额度，请检查文件内容或手动录入');
      }
      let quotas = DataStore.load('quotas') || [];
      const agency = parsed.agency || (currentStandard==='Regenagri' ? 'CU' : 'ECOCERT');
      // 同一证书（同编号+同标准）重传时先清旧记录，避免重复累加
      if(parsed.tcNo){
        quotas = quotas.filter(function(q){ return !(q.standard === currentStandard && q.tcNo === parsed.tcNo); });
      }
      let added = 0, updated = 0;
      items.forEach(function(it){
        const exist = quotas.find(function(q){ return q.standard === currentStandard && String(q.name).trim() === String(it.name).trim(); });
        if(exist){
          exist.weight = (parseFloat(exist.weight)||0) + parseFloat(it.weight);
          exist.agency = agency;
          exist.tcNo = parsed.tcNo || exist.tcNo || '-';
          exist.tcDate = parsed.tcDate || exist.tcDate || '-';
          exist.batch = it.batch || exist.batch || '-';
          exist.composition = it.composition || exist.composition || '-';
          exist.remark = '由证书录入自动累加：' + file.name;
          updated++;
        } else {
          quotas.push({
            standard: currentStandard, agency: agency, tcNo: parsed.tcNo || '-', tcDate: parsed.tcDate || '-',
            name: it.name, batch: it.batch || '-', composition: it.composition || '-', weight: parseFloat(it.weight), unit: 'kg', remark: '由证书录入：' + file.name
          });
          added++;
        }
      });
      DataStore.save('quotas', quotas);
      if(status){ status.textContent = '录入完成：新增'+added+'条，更新'+updated+'条'; status.style.color = '#2E7D32'; }
      renderMain();
    } catch(e){
      if(status){ status.textContent = '失败'; status.style.color = '#A32D2D'; }
      alert('录入失败：' + e.message);
    }
  }

  // 从证书文本/文件名中提取原纱额度字段
  function extractQuotaFields(text, fileName){
    const src = text || '';
    const nameSrc = (fileName || '').replace(/\.[^.]+$/, ''); // 去掉扩展名
    const fields = {};
    function clean(v){
      v = String(v).trim();
      v = v.replace(/^[:：,，\s\-–]+/, '');
      return v || null;
    }
    function find(patterns, source){
      source = source || src;
      for(let i = 0; i < patterns.length; i++){
        const m = source.match(patterns[i]);
        if(m && m[1] !== undefined){
          const v = clean(m[1]);
          if(v && v.length >= 3) return v;
        }
      }
      return null;
    }
    // 证书编号
    const tcNo = find([
      /Transaction\s*Certificate\s*(?:No\.?|Number|#)?[:：,\s]*([A-Za-z0-9\-]{5,})/i,
      /TC\s*(?:编号|号码|No\.?|#)?[:：,\s]*([A-Za-z0-9\-]{5,})/i,
      /Certificate\s*(?:No\.?|Number|#)?[:：,\s]*([A-Za-z0-9\-]{5,})/i
    ]) || find([
      /(?:RCS|GRS|GOTS|OCS|Regenagri)[\s_-]?TC[\s_-]?([A-Za-z0-9\-]{5,})/i,
      /TC[\s_-]?([A-Za-z0-9\-]{5,})/i
    ], nameSrc);
    // 日期
    const tcDate = find([
      /Place\s*(?:and\s*)?Date\s*of\s*Issue[^0-9]*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i,
      /Issued?\D*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/i,
      /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/
    ]);
    // 机构（按证书实际发证方）
    let agency = null;
    if(/ecocert/i.test(src)) agency = 'ECOCERT';
    else if(/control union/i.test(src)) agency = 'CU';
    // 成分（取首个 Material Composition）
    const composition = find([/Material (?:Composition|composition):\s*([^\n]{1,200})/i]);
    // 多原料：优先 Box 11，回退 Box 10，再回退单条
    let items = [];
    const m11 = src.match(/11\.\s*Certified\s*Raw\s*Materials[\s\S]*?(?=12\.)/i);
    if(m11) items = parseBox11(m11[0]);
    if(!items.length){
      const m10 = src.match(/10\.\s*Certified\s*Products[\s\S]*?(?=10a\.|11\.)/i);
      if(m10) items = parseBox10(m10[0]);
    }
    if(!items.length){
      const name = find([
        /原始名称[:：,\s]*([^\n\r]{1,80})/i,
        /原料[:：,\s]*([^\n\r]{1,80})/i,
        /Material (?:Composition|composition):\s*([^\n]{1,80})/i
      ]);
      const w = find([/Net\s*Shipping\s*Weight[:：,\s]*([\d,\.]+)\s*kg/i, /Certified\s*Weight[:：,\s]*(?:RCS|OCS|GRS|GOTS)?\s*([\d,\.]+)\s*kg/i, /Weight[:：,\s]*([\d,\.]+)/i]);
      if(name && w) items.push({ name: name, weight: parseFloat(String(w).replace(/,/g,'')), composition: composition });
    }
    items.forEach(function(it){ if(!it.composition && composition) it.composition = composition; });
    return { tcNo: tcNo, tcDate: tcDate, agency: agency, items: items };
  }

  function parseBox11(block){
    const lines = block.split('\n').map(function(s){ return s.trim(); }).filter(function(s){ return s.length; });
    const items = [];
    let cur = null;
    const wmRe = /([\d,]{1,3}(?:[.,]\d{3})*\.?\d*|\d+\.?\d*)\s*kg/i;
    lines.forEach(function(line){
      if(/certified weight/i.test(line)) return;
      if(/certified raw materials/i.test(line) || /declared geographic/i.test(line)) return;
      const num = line.match(/^\s*(\d+)[\.\s]\s*(.+)$/);
      const wm = line.match(wmRe);
      if(num){
        cur = { name: num[2].trim(), weight: null };
        items.push(cur);
        const w2 = line.match(wmRe);
        if(w2) cur.weight = parseFloat(w2[1].replace(/,/g,''));
      } else if(wm){
        const w = parseFloat(wm[1].replace(/,/g,''));
        if(cur && cur.weight === null){ cur.weight = w; }
        else { cur = { name:'', weight:w }; items.push(cur); }
      } else {
        if(!cur){ cur = { name: line, weight: null }; items.push(cur); }
        else if(cur.name === ''){ cur.name = line; }
      }
    });
    return items.filter(function(i){ return i.weight !== null && i.name; });
  }

  function parseBox10(block){
    const segs = block.split(/Product\s*No\.:\s*\d+/i).slice(1);
    const items = [];
    segs.forEach(function(seg){
      const comp = seg.match(/Material (?:Composition|composition):\s*([^\n]+)/i);
      const name = comp ? comp[1].trim() : null;
      const wm = seg.match(/(?:Certified\s*Weight:?\s*)?(?:RCS|OCS|GRS|GOTS)?\s*([\d,]{2,}\.?\d*)\s*kg/i);
      const weight = wm ? parseFloat(wm[1].replace(/,/g,'')) : null;
      if(name && weight) items.push({ name: name, weight: weight, composition: name });
    });
    return items;
  }

  // 文件 → 纯文本
  function readFileAsArrayBuffer(file){
    return new Promise(function(res, rej){
      const r = new FileReader();
      r.onload = function(){ res(r.result); };
      r.onerror = function(){ rej(new Error('文件读取失败')); };
      r.readAsArrayBuffer(file);
    });
  }
  function readFileAsText(file){
    return new Promise(function(res, rej){
      const r = new FileReader();
      r.onload = function(){ res(r.result); };
      r.onerror = function(){ rej(new Error('文件读取失败')); };
      r.readAsText(file);
    });
  }
  async function parseFile(file){
    const name = (file.name || '').toLowerCase();
    if(name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')){
      const buf = await readFileAsArrayBuffer(file);
      const wb = XLSX.read(buf, { type:'array' });
      let text = '';
      wb.SheetNames.forEach(function(sn){
        const ws = wb.Sheets[sn];
        text += '\n--- Sheet: ' + sn + ' ---\n';
        text += XLSX.utils.sheet_to_csv(ws);
      });
      return text;
    }
    if(name.endsWith('.pdf')){
      const buf = await readFileAsArrayBuffer(file);
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      for(let p = 1; p <= pdf.numPages; p++){
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        text += content.items.map(function(it){ return it.str; }).join(' ') + '\n';
      }
      return text;
    }
    if(name.endsWith('.docx')){
      const arrayBuffer = await readFileAsArrayBuffer(file);
      const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      return result.value;
    }
    if(name.endsWith('.doc')){
      throw new Error('老版 .doc 暂不支持，请另存为 .docx 或 .pdf 后上传');
    }
    if(name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')){
      throw new Error('图片暂不支持自动识别，请提供文字版（Excel / PDF / Word）');
    }
    return await readFileAsText(file);
  }

  // ---------- 字段别名词典 ----------
  function getFieldDict(){
    if(fieldDictCache) return fieldDictCache;
    const dict = DataStore.load('fieldDict');
    if(dict && Object.keys(dict).length > 0){
      fieldDictCache = dict;
      return dict;
    }
    return (window.SEED && window.SEED.fieldDict) ? window.SEED.fieldDict : {};
  }
  function invalidateFieldDictCache(){ fieldDictCache = null; }
  function escapeReg(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // 把字典里的别名数组转成可匹配的正则
  function buildAliasPatterns(aliases, numeric, crossUnits){
    const esc = (aliases || []).map(escapeReg).filter(function(s){ return s; });
    if(esc.length === 0) return [];
    const core = esc.join('|');
    // 给别名加「词边界」：防止短英文别名被吞进长单词（如 PO 匹配 PORT 中的 PO）
    const boundedCore = '(?<![A-Za-z0-9])(?:' + core + ')(?![A-Za-z0-9])';
    const patterns = [];
    if(numeric){
      // 同行：关键词后直接跟数字（别名放非捕获组，捕获组1为值）
      // 分隔符里不用 \s（避免跨行），只匹配空格/制表/冒号/逗号
      patterns.push(new RegExp(boundedCore + '[:：, \\t]*([\\d,\\.]+)', 'i'));
      // 跨行：关键词后 80 字符内出现数字+单位（用于表格换行场景）
      (crossUnits || []).forEach(function(unit){
        patterns.push(new RegExp(boundedCore + '[\\s\\S]{0,80}?([\\d,\\.]+)\\s*(?:' + unit + ')', 'i'));
      });
    } else {
      // 文本字段：关键词后跟代码（别名放非捕获组，捕获组1为值）
      // 同样限制分隔符不跨行，避免 "编号\nDenim" 被误抓为 Denim
      patterns.push(new RegExp(boundedCore + '[:：, \\t]*([A-Za-z0-9\\-\\/\\.]+)', 'i'));
    }
    return patterns;
  }

  // 文本 → 关键字段（基于字段别名词典 + 兜底正则）
  function extractFields(text){
    const src = text || '';
    const fields = {};
    const dict = getFieldDict();
    function clean(v){
      v = String(v).trim();
      // 去掉前导分隔符（冒号/逗号/空格/短横线/井号），pdf.js 拆字时常见
      v = v.replace(/^[:：,，\s\-–#]+/, '');
      // 如果没有字母或数字，说明只是分隔符，丢弃
      if(!/[A-Za-z0-9]/.test(v)) return null;
      return v || null;
    }
    function cleanCode(v){
      v = String(v).trim();
      // 去掉首尾的杂项符号，但保留数字/字母/连字符/斜杠/井号
      v = v.replace(/^[:：,，\s\-–#]+|[,:：\s\-–]+$/, '');
      if(!/[A-Za-z0-9]/.test(v)) return null;
      return v || null;
    }
    function find(patterns){
      for(let i = 0; i < patterns.length; i++){
        const m = src.match(patterns[i]);
        if(m && m[1] !== undefined){
          const v = clean(m[1]);
          if(v) return v;
        }
      }
      return null;
    }
    function findCross(patterns){
      // 跨行匹配：允许关键词与数值之间有换行（常见于表格解析后的文本）
      for(let i = 0; i < patterns.length; i++){
        const m = src.match(patterns[i]);
        if(m && m[1] !== undefined){
          const v = clean(m[1]);
          if(v) return v;
        }
      }
      return null;
    }
    function findMax(patterns){
      // 数值字段（数量/净重/毛重）一份文件里可能同时有小计和汇总，
      // 小计在前、汇总在后且数值更大，取所有匹配中的最大值更稳。
      let best = null;
      patterns.forEach(function(p){
        let m;
        const re = new RegExp(p.source, p.flags.indexOf('g') >= 0 ? p.flags : p.flags + 'g');
        while((m = re.exec(src)) !== null){
          if(m[1] !== undefined){
            const v = clean(m[1]);
            if(v){
              const n = parseFloat(String(v).replace(/,/g, ''));
              if(!isNaN(n) && (best === null || n > best)) best = n;
            }
          }
        }
      });
      return best;
    }
    function findAllBatches(){
      // 捕获所有 BATCH# / Lot# / 缸号 后面的缸号，去重后合并
      // 用户确认缸号固定结构为「7位数字 + 1个字母」（如 2605173H），
      // 因此所有候选必须匹配该结构，避免 TOTAL/ROLL 等汇总词或数字被误识别。
      const res = [];
      const seen = {};
      const batchAliases = (dict.batchNo && dict.batchNo.aliases) || [];
      const batchCores = batchAliases.map(escapeReg).filter(function(s){ return s; }).join('|');
      const patterns = [
        /BATCH\s*#?\s*([A-Za-z0-9\-\/\.]+)/gi,
        /Batch\s*(?:No\.?)?[:：,\s#]*([A-Za-z0-9\-\/\.]+)/gi,
        /LOT\s*#?\s*([A-Za-z0-9\-\/\.]+)/gi,
        /Lot\s*(?:No\.?)?[:：,\s#]*([A-Za-z0-9\-\/\.]+)/gi,
        /缸号[:：,\s]*([A-Za-z0-9\-\/\.]+)/gi
      ];
      if(batchCores){
        patterns.push(new RegExp('(?:' + batchCores + ')\\s*#?\\s*([A-Za-z0-9\\-\\/\\.]+)', 'gi'));
        patterns.push(new RegExp('(?:' + batchCores + ')\\s*(?:No\\.?)?[:：,\\s#]*([A-Za-z0-9\\-\\/\\.]+)', 'gi'));
      }
      // 常见非缸号词黑名单（TOTAL 等汇总词不应作为缸号别名）
      const blacklist = /^(?:roll|rolls|no|number|no\.|qty|quantity|yd|yds|yard|yards|lot|batch|kg|kgs|total|ttl|gross|net|date|page)$/i;
      // 缸号结构化格式：7位数字 + 1个字母
      const batchFormat = /^\d{7}[A-Za-z]$/;
      patterns.forEach(function(p){
        let m;
        while((m = p.exec(src)) !== null){
          let v = cleanCode(m[1]);
          // 必须包含数字、不是常见非缸号词，且符合固定结构
          if(v && /\d/.test(v) && !blacklist.test(v) && batchFormat.test(v) && !seen[v.toUpperCase()]){
            seen[v.toUpperCase()] = true;
            res.push(v.toUpperCase());
          }
        }
      });
      // 结构化兜底：全局精确扫描所有 7位数字+1字母 的片段
      const structRe = /\b\d{7}[A-Za-z]\b/g;
      let sm;
      while((sm = structRe.exec(src)) !== null){
        let v = sm[0].toUpperCase();
        if(!seen[v]){
          seen[v] = true;
          res.push(v);
        }
      }
      return res.length ? res.join(',') : null;
    }
    // 表格数据行兜底：从包含布编的行中提取数量/毛重/净重
    function extractFromTableRow(fabricCode, target){
      if(!fabricCode) return null;
      const lines = src.split(/\r?\n/);
      for(let i = 0; i < lines.length; i++){
        const line = lines[i];
        if(line.toUpperCase().indexOf(fabricCode.toUpperCase()) < 0) continue;
        // 去掉布编本身，避免把 A6149A 中的 6149 当作数据
        const dataLine = line.replace(new RegExp(fabricCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
        // 提取本行所有数字（>=10，避免页码、百分比）
        const nums = [];
        const re = /[\d,]+(?:\.\d+)?/g;
        let m;
        while((m = re.exec(dataLine)) !== null){
          const n = parseFloat(m[0].replace(/,/g, ''));
          if(!isNaN(n) && n >= 10) nums.push(n);
        }
        // 去重并降序
        const unique = nums.filter(function(v, idx, arr){ return arr.indexOf(v) === idx; }).sort(function(a,b){ return b-a; });
        if(unique.length < 2) continue;
        if(target === 'quantityY') return unique[0]; // 最大的通常是码数
        if(target === 'grossWeight' || target === 'netWeight'){
          // 找两个相近的大数（差值不超过较小值的50%），分别作为毛重/净重
          for(let j = 0; j < unique.length - 1; j++){
            const a = unique[j], b = unique[j+1];
            if(a > b && a - b < b * 0.5){
              return target === 'grossWeight' ? a : b;
            }
          }
          //  fallback
          return target === 'grossWeight' ? (unique[1] || null) : (unique[2] || unique[1] || null);
        }
      }
      return null;
    }
    // 1) PO 号：要求 PO 是独立单词，避免误匹配 Composition/Position 中的 po
    const poAliases = (dict.po && dict.po.aliases) || [];
    fields.po = find([
      /\bPO\s*(?:No\.?)?[:：,|\s]*([A-Za-z0-9\-\/\.]+)/i,
      /\bP\/O\s*(?:No\.?)?[:：,|\s]*([A-Za-z0-9\-\/\.]+)/i,
      /\bPO\s*Number[:：,|\s]*([A-Za-z0-9\-\/\.]+)/i,
      /Customer\s*PO[:：,|\s]*([A-Za-z0-9\-\/\.]+)/i
    ].concat(buildAliasPatterns(poAliases, false)));
    // 2) 生产订单号：只匹配真正的生产订单号字段（文件上通常没有）
    const prodAliases = (dict.productionOrder && dict.productionOrder.aliases) || [];
    fields.productionOrder = find([
      /生产订单号[:：,\s]*([A-Za-z0-9\-\/\.]+)/i,
      /生产单号[:：,\s]*([A-Za-z0-9\-\/\.]+)/i,
      /Production\s*Order\s*(?:No\.?)?[:：,\s]*([A-Za-z0-9\-\/\.]+)/i
    ].concat(buildAliasPatterns(prodAliases, false)));
    // 3) 布编：兼容 Article No / Denim Fabric / Fabric Code 等
    const fabricAliases = (dict.fabricCode && dict.fabricCode.aliases) || [];
    fields.fabricCode = find([
      /Article\s*No\.?[:：,\s]*([A-Za-z0-9\-\/\.]+)/i,
      /Art\.?\s*No\.?[:：,\s]*([A-Za-z0-9\-\/\.]+)/i,
      /Denim\s*Fabric[:：,\s]*([A-Za-z0-9\-\/\.]+)/i,
      /Fabric\s*Code[:：,\s]*([A-Za-z0-9\-\/\.]+)/i,
      /布编[:：,\s]*([A-Za-z0-9\-\/\.]+)/i,
      /布号[:：,\s]*([A-Za-z0-9\-\/\.]+)/i,
      /Style[:：,\s]*([A-Za-z0-9\-\/\.]+)/i,
      /Item\s*(?:No\.?)?[:：,\s]*([A-Za-z0-9\-\/\.]+)/i
    ].concat(buildAliasPatterns(fabricAliases, false)));
    // 4) 缸号：支持一份文件多个 BATCH#，合并为逗号分隔
    fields.batchNo = findAllBatches();
    // 5) 合同号
    const contractAliases = (dict.contractNo && dict.contractNo.aliases) || [];
    fields.contractNo = find([
      /合同号[:：,\s]*([A-Za-z0-9\-\/\.]+)/i,
      /Contract\s*No\.?[:：,\s]*([A-Za-z0-9\-\/\.]+)/i,
      /CTR-\d{4}-\d{4}/i,
      /(CTR-[A-Za-z0-9\-]+)/i
    ].concat(buildAliasPatterns(contractAliases, false)));
    // 6) 数量（码）：兼容 Yds / QTY(Y) / Quantity / 数量 等
    // 文件里可能同时有小计和汇总，取最大值避免抓到小计
    const qtyAliases = (dict.quantityY && dict.quantityY.aliases) || [];
    fields.quantityY = findMax([
      /总数\(?\s*码\s*\)?[:：,\s]*([\d,\.]+)/i,
      /数量\(?\s*码\s*\)?[:：,\s]*([\d,\.]+)/i,
      /码数[:：,\s]*([\d,\.]+)/i,
      /Yds[:：,\s]*([\d,\.]+)/i,
      /Yard(?:s)?[:：,\s]*([\d,\.]+)/i,
      /QTY\s*[\(\[]?\s*[Yy]\s*[\)\]]?[:：,\s]*([\d,\.]+)/i,
      /Qty[:：,\s]*([\d,\.]+)/i,
      /Quantity[:：,\s]*([\d,\.]+)/i,
      /数量[:：,\s]*([\d,\.]+)/i,
      /TOTAL[:：,\s]*[\d\s,]+Rolls?[^\d]*([\d,\.]+)\s*(?:Yds|Yard)/i,
      // 表格跨行兜底：关键词后 80 字符内找数字+码单位
      /(?:QTY|Quantity|数量|总数|TOTAL)[\s\S]{0,80}?([\d,\.]+)\s*(?:Yds?|Yard|码)/i
    ].concat(buildAliasPatterns(qtyAliases, true, ['Yds?','Yard','码'])));
    // 7) 净重：兼容 TTL N.W. / Net Weight (KG) / 净重 等
    const netAliases = (dict.netWeight && dict.netWeight.aliases) || [];
    fields.netWeight = findMax([
      /TTL\s*N\.W\.[:：,\s]*([\d,\.]+)/i,
      /净重[:：,\s]*([\d,\.]+)/i,
      /Net\s*Weight\s*(?:\(?KG\)?)?[:：,\s]*([\d,\.]+)/i,
      /N\.W\.[:：,\s]*([\d,\.]+)/i,
      // 表格跨行兜底：Net Weight / N.W. / 净重 后 80 字符内找数字+kg
      /(?:Net\s*Weight|N\.W\.|净重|Net\s*Wt)[\s\S]{0,80}?([\d,\.]+)\s*(?:KG|kgs?|千克)/i
    ].concat(buildAliasPatterns(netAliases, true, ['KG','kgs?','千克'])));
    // 8) 毛重：兼容 TTL G.W. / Gross Weight (KG) / 毛重 等
    const grossAliases = (dict.grossWeight && dict.grossWeight.aliases) || [];
    fields.grossWeight = findMax([
      /TTL\s*G\.W\.[:：,\s]*([\d,\.]+)/i,
      /毛重[:：,\s]*([\d,\.]+)/i,
      /Gross\s*Weight\s*(?:\(?KG\)?)?[:：,\s]*([\d,\.]+)/i,
      /G\.W\.[:：,\s]*([\d,\.]+)/i,
      // 表格跨行兜底：Gross Weight / G.W. / 毛重 后 80 字符内找数字+kg
      /(?:Gross\s*Weight|G\.W\.|毛重|Gross\s*Wt)[\s\S]{0,80}?([\d,\.]+)\s*(?:KG|kgs?|千克)/i
    ].concat(buildAliasPatterns(grossAliases, true, ['KG','kgs?','千克'])));
    // 9) 客户：匹配 Buyer / Customer / 购买方 / 收货方 Consignee
    // Consignee 名称可能跨多行（如 "...AND\nFASHION WASH..."），用 [\s\S]{0,200}? 捕获
    const customerAliases = (dict.customer && dict.customer.aliases) || [];
    fields.customer = findCross([
      /Consignee\s*[:：|,]\s*([A-Za-z0-9\s\.\-&]+?)(?=\n{2,}|Payment|PO\s|Shipment|Standard|Buyer|Seller|Company|$)/i,
      /收货方\s*(?:Consignee)?\s*[:：|,]\s*([A-Za-z0-9\s\.\-&]+?)(?=\n{2,}|Payment|PO\s|Shipment|Standard|Buyer|Seller|Company|$)/i,
      /购买方\s*(?:Buyer)?\s*[:：|,]\s*([A-Za-z0-9\s\.\-&]+?)(?=\n{2,}|地址|Address|Consignee|Payment|PO\s|Shipment|Standard|$)/i,
      /Buyer\s*[:：|,]\s*([A-Za-z0-9\s\.\-&]+?)(?=\n{2,}|地址|Address|Consignee|Payment|PO\s|Shipment|Standard|$)/i,
      /Customer\s*[:：|,]\s*([A-Za-z0-9\s\.\-&]+?)(?=\n{2,}|$)/i,
      /Sold\s*To\s*[:：|,]\s*([A-Za-z0-9\s\.\-&]+?)(?=\n{2,}|$)/i
    ].concat(buildAliasPatterns(customerAliases, false)));
    if(fields.customer){
      // Consignee 名称可能跨行，把换行和多余空格合并成单个空格
      fields.customer = fields.customer.replace(/\s+/g, ' ').trim();
    }
    // 10) 成分
    const compositionAliases = (dict.composition && dict.composition.aliases) || [];
    fields.composition = find([
      /Composition\s*:?\s*([A-Za-z0-9\s%\-\.]+?)(?=\n|$)/i
    ].concat(buildAliasPatterns(compositionAliases, false)));
    // 11) 发票号
    const invoiceAliases = (dict.invoiceNo && dict.invoiceNo.aliases) || [];
    fields.invoiceNo = find([
      // 发票号必须在同行，避免 Invoice No.: 为空时跨行抓到地址里的门牌号 48
      /Invoice\s*No\.?[:：, \t]*([A-Za-z0-9\-]+)/i,
      /发票号[:：, \t]*([A-Za-z0-9\-]+)/i
    ].concat(buildAliasPatterns(invoiceAliases, false)));
    // 表格数据行兜底：常规正则没识别到时，从含布编的数据行补提
    if(!fields.quantityY) fields.quantityY = extractFromTableRow(fields.fabricCode, 'quantityY');
    if(!fields.grossWeight) fields.grossWeight = extractFromTableRow(fields.fabricCode, 'grossWeight');
    if(!fields.netWeight) fields.netWeight = extractFromTableRow(fields.fabricCode, 'netWeight');
    // 数值字段统一转数字
    ['quantityY','netWeight','grossWeight'].forEach(function(k){
      if(fields[k]) fields[k] = parseFloat(String(fields[k]).replace(/,/g, ''));
    });
    // 兜底：某些 PDF 把 PO-2605377H 拆成 'PO' 和 '-2605377H' 两个 token，导致丢失 PO
    if(!fields.po && /\bPO\b/i.test(src)){
      const m = src.match(/\bPO\s*(?:No\.?)?\s*[-–|]?\s*([A-Za-z0-9\-\/\.]+)/i);
      if(m){
        let v = clean(m[1]);
        if(v) fields.po = v;
      }
    }
    return fields;
  }

  // 基于识别结果跑合规规则
  function buildCompliance(o){
    // o 中的手动/同步值优先于 extracted；extracted 作为文件识别来源兜底
    const e = Object.assign({}, o.extracted, o);
    const rules = [];
    rules.push(check('生产订单号不能为空', e.productionOrder, '已识别：' + e.productionOrder, '未识别生产订单号'));
    rules.push(check('缸号不能为空', e.batchNo, '已识别：' + e.batchNo, '未识别缸号'));
    if(e.batchNo){
      const batchList = String(e.batchNo).split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s; });
      const bad = batchList.filter(function(b){ return !/^\d{7}[A-Za-z]$/.test(b); });
      if(bad.length === 0){
        rules.push({ rule:'缸号格式应为 7位数字+1字母', status:'ok', msg:'全部符合：' + batchList.join('、') });
      } else {
        rules.push({ rule:'缸号格式应为 7位数字+1字母', status:'warn', msg:'异常：' + bad.join('、') + '（应为 7位数字+1字母，如 2605173H）' });
      }
    }
    rules.push(check('布编不能为空', e.fabricCode, '已识别：' + e.fabricCode, '未识别布编'));
    rules.push(checkNum('数量(y)应大于 0', e.quantityY));
    rules.push(checkNum('净重(kg)应大于 0', e.netWeight));
    rules.push(checkNum('毛重(kg)应大于 0', e.grossWeight));
    if(e.netWeight && e.grossWeight){
      const n = parseFloat(e.netWeight), g = parseFloat(e.grossWeight);
      rules.push({ rule:'净重必须 ≤ 毛重', status:(n <= g ? 'ok' : 'fail'), msg: formatNum(n) + ' kg ' + (n <= g ? '≤' : '＞') + ' ' + formatNum(g) + ' kg' });
    } else {
      rules.push({ rule:'净重必须 ≤ 毛重', status:'warn', msg:'缺少净重或毛重，未能核对' });
    }
    if(e.contractNo){
      const ok = /^CTR-\d{4}-\d{4}$/.test(String(e.contractNo));
      rules.push({ rule:'合同号格式应为 CTR-YYYY-XXXX', status:(ok ? 'ok' : 'fail'), msg:(ok ? '格式正确：' + e.contractNo : '当前：' + e.contractNo + '，不符合 CTR-YYYY-XXXX') });
    } else {
      rules.push({ rule:'合同号格式应为 CTR-YYYY-XXXX', status:'warn', msg:'未识别合同号，未能核对' });
    }
    return rules;
  }
  function check(rule, val, okMsg, failMsg){
    if(val !== null && val !== undefined && String(val).trim() !== '') return { rule:rule, status:'ok', msg:okMsg };
    return { rule:rule, status:'fail', msg:failMsg };
  }
  function checkNum(rule, val){
    const n = parseFloat(val);
    if(!isNaN(n) && n > 0) return { rule:rule, status:'ok', msg:'已识别：' + formatNum(n) };
    return { rule:rule, status:'fail', msg:'未识别或数值无效' };
  }

  function deleteQuota(std, name, tcNo){
    if(!confirm('确定删除该额度记录？')) return;
    let quotas = DataStore.load('quotas') || [];
    quotas = quotas.filter(function(q){ return !(q.standard===std && q.name===name && (q.tcNo||'-')===tcNo); });
    DataStore.save('quotas', quotas);
    renderMain();
  }

  function deleteOrder(id){
    const orders = DataStore.load('orders') || [];
    const o = orders.find(function(x){ return x.id === id; });
    const confirmMsg = o ? '确定删除订单 ' + o.id + ' 吗？删除后不可恢复。' : '确定删除该订单吗？删除后不可恢复。';
    if(!confirm(confirmMsg)) return;
    const filtered = orders.filter(function(x){ return x.id !== id; });
    DataStore.save('orders', filtered);
    if(window.__expandedOrder === id) window.__expandedOrder = null;
    if(window.__editingOrder === id) window.__editingOrder = null;
    renderMain();
  }

  window.App = { toggleOrder: toggleOrder, editOrder: editOrder, cancelEdit: cancelEdit, saveOrder: saveOrder, deleteOrder: deleteOrder, toggleNewOrderForm: toggleNewOrderForm, previewNewFiles: previewNewFiles, createOrderFromFile: createOrderFromFile, uploadOrderFile: uploadOrderFile, uploadQuotaFile: uploadQuotaFile, deleteQuota: deleteQuota, saveFieldDict: saveFieldDict, importIssuedTC: importIssuedTC, saveGithubConfig: saveGithubConfig, syncPull: syncPull, syncPush: syncPush, saveSysPwd: saveSysPwd, toggleSysPwd: toggleSysPwd };

  // 启动
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

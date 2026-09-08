// 数据层：本机 localStorage 为同步主存储（保证离线可用、接口不变）；
// 部署到 GitHub Pages 后，可在「系统配置」中开启云端同步：
// 云端仓库 data/{collection}.json 作为多人共享的真相源，本机 localStorage 作为缓存。
// 令牌(PAT)与仓库名仅保存在本机浏览器，绝不写入源码。
window.DataStore = (function(){
  const PREFIX = 'tc_';
  const VERSION_KEY = PREFIX + '_seed_version';
  const CFG_KEY = PREFIX + 'gh_cfg';
  const SHA_KEY = PREFIX + 'gh_sha';
  const COLLECTIONS = ['users','standards','quotas','certificates','orders','fieldDict','settings'];

  // ---- 持久化的 GitHub 配置（来自设置页，存在本机浏览器） ----
  let githubCfg = null;
  let shaCache = {};
  try { githubCfg = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch(e){ githubCfg = null; }
  try { shaCache = JSON.parse(localStorage.getItem(SHA_KEY) || '{}'); } catch(e){ shaCache = {}; }

  function persistCfg(){ try { localStorage.setItem(CFG_KEY, JSON.stringify(githubCfg)); } catch(e){} }
  function persistSha(){ try { localStorage.setItem(SHA_KEY, JSON.stringify(shaCache)); } catch(e){} }

  function ensureSeed(){
    const seedVersion = (window.SEED && window.SEED._version) || '1';
    const storedVersion = localStorage.getItem(VERSION_KEY);
    const shouldReset = (seedVersion !== storedVersion);
    if(shouldReset){
      COLLECTIONS.forEach(function(c){ localStorage.removeItem(PREFIX+c); });
    }
    COLLECTIONS.forEach(function(c){
      if(localStorage.getItem(PREFIX+c) === null){
        const val = (c === 'settings') ? window.SEED.settings : (window.SEED[c] || []);
        localStorage.setItem(PREFIX+c, JSON.stringify(val));
      }
    });
    localStorage.setItem(VERSION_KEY, seedVersion);
  }

  // load 永远从本机缓存读取（同步，调用方无需改动）
  function load(c){ return JSON.parse(localStorage.getItem(PREFIX+c) || 'null'); }

  // save 写本机缓存，并 best-effort 推送到云端
  function save(c, data){
    localStorage.setItem(PREFIX+c, JSON.stringify(data));
    pushToGithub(c, data);
  }

  // ---------- GitHub 同步层 ----------
  const github = {
    get enabled(){ return !!(githubCfg && githubCfg.enabled && githubCfg.token && githubCfg.repo); },
    get token(){ return githubCfg ? githubCfg.token : ''; },
    get repo(){ return githubCfg ? githubCfg.repo : ''; },
    path: 'data'
  };

  function _ghHeaders(extra){
    const h = { 'Authorization': 'token ' + (githubCfg ? githubCfg.token : '') };
    if(extra) Object.assign(h, extra);
    return h;
  }
  function _b64encode(str){ return btoa(unescape(encodeURIComponent(str))); }
  function _b64decode(b64){ return decodeURIComponent(escape(atob(b64))); }

  async function ghRead(c){
    const url = 'https://api.github.com/repos/' + githubCfg.repo + '/contents/' + github.path + '/' + c + '.json';
    const r = await fetch(url, { headers: _ghHeaders() });
    if(r.status === 404) return { data: null, sha: null };
    if(!r.ok) throw new Error('GitHub 读取 ' + c + ' 失败：HTTP ' + r.status);
    const j = await r.json();
    shaCache[c] = j.sha; persistSha();
    return { data: JSON.parse(_b64decode(j.content)), sha: j.sha };
  }

  async function ghWrite(c, data){
    const url = 'https://api.github.com/repos/' + githubCfg.repo + '/contents/' + github.path + '/' + c + '.json';
    // 先取 sha：存在则更新，不存在则新建
    let sha = shaCache[c] || null;
    if(!sha){
      try {
        const cur = await fetch(url, { headers: _ghHeaders() });
        if(cur.ok){ const j = await cur.json(); sha = j.sha; shaCache[c] = sha; persistSha(); }
      } catch(e){ /* 忽略，可能 404（新建） */ }
    }
    const body = {
      message: 'TC工作台 更新 ' + c + ' ' + new Date().toISOString().slice(0,19).replace('T',' '),
      content: _b64encode(JSON.stringify(data, null, 2))
    };
    if(sha) body.sha = sha;
    const r = await fetch(url, { method:'PUT', headers: _ghHeaders({ 'Content-Type':'application/json' }), body: JSON.stringify(body) });
    if(!r.ok){ const t = await r.text(); throw new Error('GitHub 写入 ' + c + ' 失败：HTTP ' + r.status + ' ' + t.slice(0,120)); }
    const j = await r.json();
    shaCache[c] = j.content.sha; persistSha();
  }

  // 单集合推送（保存时自动调用，失败仅告警不阻断）
  function pushToGithub(c, data){
    if(!github.enabled) return;
    const d = (data === undefined) ? load(c) : data;
    ghWrite(c, d).catch(function(e){ console.warn('[GitHub] 推送 ' + c + ' 失败：', e.message); });
  }

  // 全部集合推送到云端
  function syncPushAll(){
    if(!github.enabled) return Promise.reject(new Error('未启用 GitHub 同步'));
    return Promise.all(COLLECTIONS.map(function(c){ return ghWrite(c, load(c)); }));
  }

  // 从云端拉取全部集合，覆盖本机缓存（云端为真相源）
  function syncPull(){
    if(!github.enabled) return Promise.reject(new Error('未启用 GitHub 同步'));
    return Promise.all(COLLECTIONS.map(async function(c){
      const r = await ghRead(c);
      if(r.data !== null){ localStorage.setItem(PREFIX+c, JSON.stringify(r.data)); }
    }));
  }

  // 连接测试：读取仓库元数据
  function testGithub(){
    if(!githubCfg || !githubCfg.token || !githubCfg.repo) return Promise.reject(new Error('请先填写仓库与令牌'));
    const url = 'https://api.github.com/repos/' + githubCfg.repo;
    return fetch(url, { headers: _ghHeaders() }).then(function(r){
      if(!r.ok) throw new Error('仓库或令牌无效：HTTP ' + r.status);
      return r.json();
    });
  }

  function setGithubConfig(cfg){
    githubCfg = {
      enabled: !!cfg.enabled,
      token: cfg.token || '',
      repo: (cfg.repo || '').trim()
    };
    persistCfg();
  }
  function getGithubConfig(){ return githubCfg ? Object.assign({}, githubCfg) : null; }
  function isGithubEnabled(){ return github.enabled; }

  return {
    ensureSeed: ensureSeed,
    load: load,
    save: save,
    github: github,
    COLLECTIONS: COLLECTIONS,
    setGithubConfig: setGithubConfig,
    getGithubConfig: getGithubConfig,
    testGithub: testGithub,
    syncPull: syncPull,
    syncPushAll: syncPushAll,
    isGithubEnabled: isGithubEnabled
  };
})();

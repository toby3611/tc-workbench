// 登录与权限：真账号密码登录；按认证标准分配可见范围
window.Auth = (function(){
  let current = null;

  function login(account, password){
    const users = DataStore.load('users') || [];
    const u = users.find(function(x){ return x.account===account && x.password===password; });
    if(!u) return { ok:false, msg:'账号或密码错误' };
    current = u;
    sessionStorage.setItem('tc_current', u.id);
    return { ok:true, user:u };
  }
  function logout(){ current = null; sessionStorage.removeItem('tc_current'); }

  function getCurrent(){
    if(current) return current;
    const id = sessionStorage.getItem('tc_current');
    if(id){
      const u = (DataStore.load('users')||[]).find(function(x){ return x.id===id; });
      current = u || null;
    }
    return current;
  }
  // 是否可见某标准
  function canSee(standard){
    const u = getCurrent();
    if(!u) return false;
    if(u.role==='admin' || u.standards.indexOf('all')>=0) return true;
    return u.standards.indexOf(standard)>=0;
  }
  // 可见标准列表
  function visibleStandards(){
    const u = getCurrent();
    if(!u) return [];
    const all = DataStore.load('standards')||[];
    if(u.role==='admin' || u.standards.indexOf('all')>=0) return all;
    return all.filter(function(s){ return u.standards.indexOf(s.key)>=0; });
  }

  return { login:login, logout:logout, getCurrent:getCurrent, canSee:canSee, visibleStandards:visibleStandards };
})();

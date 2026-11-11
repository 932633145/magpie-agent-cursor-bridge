(() => {
  const $ = id => document.getElementById(id);
  const pending = new Map();
  let sequence = 10000, saved = null, options = {};
  function call(method, value) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Magpie 设置接口未响应，请返回插件页面重试')); }, 10000);
      pending.set(id, {resolve, reject, timer});
      parent.postMessage({magpie: 1, id, method: method === 'get' ? 'options.get' : 'options.set', params: method === 'save' ? {options: value} : undefined}, '*');
    });
  }
  function theme(value) {
    document.documentElement.style.colorScheme = value?.dark ? 'dark' : 'light';
    for (const [key, color] of Object.entries(value?.tokens || {})) document.documentElement.style.setProperty('--magpie-' + key, color);
  }
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.magpie !== 1) return;
    const message = event.data;
    if (message.event === 'theme') { theme(message.data); return; }
    if (message.id === 9999 && message.result) { theme(message.result); return; }
    const wait = pending.get(message.id);
    if (!wait) return;
    clearTimeout(wait.timer); pending.delete(message.id);
    if (message.error) wait.reject(new Error(message.error)); else wait.resolve(message.result);
  });
  function populate(select, models) {
    const value = select.value;
    while (select.options.length > 1) select.remove(1);
    for (const model of models) select.add(new Option(model.name + ' · ' + model.id, model.id));
    if (value && !models.some(model => model.id === value)) select.add(new Option('不可用：' + value, value));
    select.value = value;
  }
  async function refresh() {
    try {
      const response = await fetch('api/state', {cache: 'no-store'});
      if (!response.ok) throw new Error('状态服务暂不可用');
      const data = await response.json();
      populate($('gitModel'), data.models); populate($('tabModel'), data.models);
      const alive = data.bridge?.heartbeat && Date.now() - data.bridge.heartbeat < 25000;
      $('state').textContent = alive ? `${data.bridge.version} · ${data.bridge.state}` : '未接入或后台状态已过期；保存的配置会在接入后应用';
      $('mainModel').textContent = data.mainModel || '—';
      $('gitApplied').textContent = alive && data.applied ? (data.applied.gitError || data.applied.gitModel || '—') : '—';
      $('tabApplied').textContent = alive && data.applied ? `${data.applied.tabMode} · ${data.applied.tabError || data.applied.tabModel || '—'}` : '—';
      $('applied').textContent = !alive || !data.applied ? '待接入后确认' : JSON.stringify(data.applied.preferences) === JSON.stringify(saved) ? '引擎已应用保存的配置' : '引擎尚未应用当前保存配置';
    } catch (error) { $('state').textContent = error.message; }
  }
  function canonical(options) {
    return {gitModel: options.gitModel || '', gitPrompt: options.gitPrompt || '', tabMode: options.tabMode || 'forward', tabModel: options.tabModel || ''};
  }
  $('tabMode').addEventListener('change', () => { $('tabModel').required = $('tabMode').value === 'local'; });
  $('settings').addEventListener('submit', async event => {
    event.preventDefault(); $('save').disabled = true;
    try {
      const value = Object.fromEntries(['gitModel', 'gitPrompt', 'tabMode', 'tabModel'].map(key => [key, $(key).value]));
      if (value.tabMode === 'local' && !value.tabModel) throw new Error('请先选择本地补全模型');
      options = await call('save', {...options, ...value}); saved = canonical(options);
      $('result').textContent = '配置已保存，等待引擎确认';
      await refresh();
    } catch (error) { $('result').textContent = error.message; }
    finally { $('save').disabled = false; }
  });
  $('refresh').addEventListener('click', refresh);
  call('get').then(async result => {
    options = result; saved = canonical(options);
    for (const [key, value] of Object.entries(saved)) {
      if ($(key).tagName === 'SELECT' && value && !Array.from($(key).options).some(o => o.value === value)) $(key).add(new Option(value, value));
      $(key).value = value;
    }
    await refresh();
  }).catch(error => { $('result').textContent = error.message; });
  parent.postMessage({magpie: 1, id: 9999, method: 'theme'}, '*');
  setInterval(() => { if (!document.hidden) refresh(); }, 4000);
})();

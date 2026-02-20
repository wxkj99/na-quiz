// Auto-number questions
const prefix = 'naq:input:' + (location.pathname.replace(/.*\//, '').replace(/\.[^.]*$/, '') || 'index');

// AI grading config
const WORKER_URL = 'https://blog-proxy.yangjt22.workers.dev';
const AI_MODEL = 'glm-4.5-air:free';
const RATE_WINDOW = 60000;

function clearGradeCache() {
  Object.keys(localStorage).filter(k => k.startsWith('naq:grade:')).forEach(k => localStorage.removeItem(k));
}

function getApiConfig() {
  const url = localStorage.getItem('user-api-url');
  const key = localStorage.getItem('user-api-key');
  const model = localStorage.getItem('user-api-model');
  const invite = localStorage.getItem('user-invite');
  const type = (localStorage.getItem('user-api-type') || 'openai').toLowerCase();
  if (url && key) return { url: url.replace(/\/$/, ''), key, model: model || AI_MODEL, type, invite: null };
  return { url: WORKER_URL, key: null, model: AI_MODEL, type: 'openai', invite };
}

function buildRequest(cfg, messages) {
  const model = cfg.model;
  if (cfg.type === 'gemini') {
    return {
      url: `${cfg.url}/models/${model}:generateContent?key=${cfg.key}`,
      headers: { 'Content-Type': 'application/json' },
      body: { contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) }
    };
  } else if (cfg.type === 'claude') {
    return {
      url: `${cfg.url}/messages`,
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
      body: { model, messages, max_tokens: 4096 }
    };
  } else {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.key) headers['Authorization'] = `Bearer ${cfg.key}`;
    if (cfg.invite) headers['X-Invite'] = cfg.invite;
    return { url: `${cfg.url}/chat/completions`, headers, body: { model, messages } };
  }
}

function parseResponse(cfg, data) {
  if (cfg.type === 'gemini') return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (cfg.type === 'claude') return data.content?.[0]?.text || '';
  return data.choices?.[0]?.message?.content || '';
}

function checkRate(storageKey, limit) {
  const now = Date.now();
  const r = JSON.parse(localStorage.getItem(storageKey) || '{"count":0,"start":0}');
  if (now - r.start > RATE_WINDOW) { r.count = 0; r.start = now; }
  r.count++;
  localStorage.setItem(storageKey, JSON.stringify(r));
  return r.count <= limit;
}

function cacheKey(id, inputs) { return 'naq:grade:' + id + ':' + inputs.join('|'); }

function getQuestionData(q) {
  const qtext = q.querySelector('.q-text')?.textContent?.trim() || '';
  const answer = q.querySelector('.answer')?.textContent?.trim() || '';
  const inputs = [...q.querySelectorAll('textarea, input.blank')].map(el => el.value.trim());
  return { qtext, answer, inputs };
}

function buildPrompt(questions) {
  const sendAnswer = localStorage.getItem('send-answer') !== 'false';
  const items = questions.map(({ qtext, answer, inputs }, i) => {
    const ans = sendAnswer && answer ? `\n参考答案：${answer}` : '';
    return `===题${i+1}===\n题目：${qtext}\n学生答案：${inputs.join(' | ')}${ans}`;
  }).join('\n\n');
  return `你是数值分析老师，正在批改作业。注意：题目中可能有填空框，学生答案是填入空缺处的内容，题目中已印出的部分不需要学生重复填写，批改时请结合题目上下文判断学生答案是否正确。对每题输出一行，必须以 ===题N=== 开头（N为题号），然后给出批改：正确给【✓】（若有值得补充的要点可加一句，否则只输出【✓】）；部分正确给【△】并指出缺失点；错误给【✗】并直接给出正确思路。数学含义正确即为正确，忽略符号写法差异。批改标准从宽：这是学生自测练习，思路方向正确即视为正确，仅在缺失核心关键步骤时给【△】，不扣细节表述和符号规范。\n\n${items}`;
}

function showResult(el, text) {
  el.textContent = text;
  el.innerHTML = el.innerHTML
    .replace(/\$\$(.+?)\$\$/gs, '\\[$1\\]')
    .replace(/\$(.+?)\$/gs, '\\($1\\)')
    .replace(/\n/g, '<br>');
  el.className = 'grade-result' + (
    /✓/.test(text) && !/✗|△/.test(text) ? ' correct' :
    /✗/.test(text) && !/✓|△/.test(text) ? ' wrong' : ''
  );
  el.style.display = 'block';
  if (window.MathJax?.typesetPromise) MathJax.typesetPromise([el]);
}

function updateEditedMark(q, id) {
  const snap = localStorage.getItem('naq:snap:' + id);
  const resultEl = q.querySelector('.grade-result');
  if (!resultEl) return;
  const current = [...q.querySelectorAll('textarea, input.blank')].map(el => el.value.trim()).join('|');
  const edited = snap !== null && current !== snap;
  let mark = q.querySelector('.edited-mark');
  if (edited) {
    if (!mark) {
      mark = document.createElement('span');
      mark.className = 'edited-mark';
      mark.title = '上次批改后已编辑';
      mark.textContent = '✎ 已编辑';
      resultEl.insertAdjacentElement('beforebegin', mark);
    }
  } else if (mark) {
    mark.remove();
  }
}

const gradingIds = new Set();

function addGradeBtnListeners(btn, getArgs) {
  let timer = null;
  let didLongPress = false;
  btn.addEventListener('pointerdown', () => {
    didLongPress = false;
    timer = setTimeout(async () => {
      didLongPress = true;
      if (!confirm('强制重新批改？将清除范围内所有已有批改结果。')) return;
      btn.disabled = true;
      const [qEls, summaryEl] = getArgs();
      await gradeQuestions(qEls, summaryEl, true);
      btn.disabled = false;
    }, 1000);
  });
  const cancel = () => { clearTimeout(timer); timer = null; };
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('click', async () => {
    if (didLongPress) { didLongPress = false; return; }
    btn.disabled = true;
    const [qEls, summaryEl] = getArgs();
    await gradeQuestions(qEls, summaryEl, false);
    btn.disabled = false;
  });
}

async function gradeQuestions(qEls, summaryEl, force = false) {
  const ids = qEls.map(q => q.dataset.gradeId);
  if (ids.some(id => gradingIds.has(id))) {
    if (summaryEl) { summaryEl.textContent = '有题目正在批改中，请稍候。'; summaryEl.className = 'grade-result error'; summaryEl.style.display = 'block'; }
    return;
  }
  ids.forEach(id => gradingIds.add(id));
  try {
    const allData = qEls.map(q => {
      const id = q.dataset.gradeId;
      const data = getQuestionData(q);
      const key = cacheKey(id, data.inputs);
      return { q, data, id, key, cached: localStorage.getItem(key) };
    });

    allData.filter(d => d.cached && d.data.inputs.some(v => v)).forEach(({ q, cached }) => {
      const el = q.querySelector('.grade-result');
      if (el) showResult(el, cached);
    });

    if (force) allData.forEach(({ q, key }) => {
      localStorage.removeItem(key);
      const el = q.querySelector('.grade-result');
      if (el) el.style.display = 'none';
    });
    const needGrade = allData.filter(d => (force || !localStorage.getItem(d.key)) && d.data.inputs.some(v => v));

    if (needGrade.length === 0) {
      if (summaryEl && !allData.some(d => d.data.inputs.some(v => v))) {
        summaryEl.textContent = '请先填写答案再批改。'; summaryEl.style.display = 'block';
      }
      return;
    }

    if (!checkRate('naq:rate:grade', 5)) {
      if (summaryEl) { summaryEl.textContent = '请求过于频繁，请稍后再试。'; summaryEl.className = 'grade-result error'; summaryEl.style.display = 'block'; }
      return;
    }

    const prompt = buildPrompt(needGrade.map(d => d.data));
    if (prompt.length > 8000) {
      if (summaryEl) { summaryEl.textContent = '内容过长，请分节批改。'; summaryEl.className = 'grade-result error'; summaryEl.style.display = 'block'; }
      return;
    }

    if (summaryEl) { summaryEl.textContent = '批改中…'; summaryEl.style.display = 'block'; }

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1 && summaryEl) summaryEl.textContent = `批改中… (第${attempt}次，等待${attempt * 3}s)`;
      if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 3000));
      try {
        const cfg = getApiConfig();
        const req = buildRequest(cfg, [{ role: 'user', content: buildPrompt(needGrade.map(d => d.data)) }]);
        const resp = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
        if ((resp.status === 504 || resp.status === 429) && attempt < 3) continue;
        if (resp.status === 401) throw new Error('邀请码错误或未填写，请在配置 API 中填写邀请码');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = parseResponse(cfg, await resp.json()) || '无返回内容';

        if (needGrade.length === 1) {
          const result = text.replace(/^===题\d+===\s*/, '').trim();
          localStorage.setItem(needGrade[0].key, result);
          localStorage.setItem('naq:snap:' + needGrade[0].id, needGrade[0].data.inputs.join('|'));
          updateEditedMark(needGrade[0].q, needGrade[0].id);
          const targetEl = needGrade[0].q.querySelector('.grade-result') || summaryEl;
          showResult(targetEl, result);
          if (summaryEl && targetEl !== summaryEl) summaryEl.style.display = 'none';
        } else {
          const parsed = {};
          text.split(/===题(\d+)===/).forEach((seg, i, arr) => {
            if (i % 2 === 1) parsed[parseInt(arr[i])] = (arr[i+1] || '').trim();
          });
          const parseOk = needGrade.every((_, i) => parsed[i+1]);
          needGrade.forEach(({ q, key, id, data }, i) => {
            const part = parseOk ? parsed[i+1] : text;
            localStorage.setItem(key, part);
            localStorage.setItem('naq:snap:' + id, data.inputs.join('|'));
            updateEditedMark(q, id);
            const el = q.querySelector('.grade-result');
            if (el) showResult(el, part);
          });
          if (summaryEl) { if (parseOk) summaryEl.style.display = 'none'; else showResult(summaryEl, text); }
        }
        return;
      } catch (e) {
        if (attempt === 3 && summaryEl) { summaryEl.textContent = '批改失败：' + e.message; summaryEl.className = 'grade-result error'; }
      }
    }
  } finally {
    ids.forEach(id => gradingIds.delete(id));
  }
}

if (document.querySelector('.question')) {
document.querySelectorAll('.question').forEach((q, i) => {
  const id = prefix + '-' + (i + 1);
  q.dataset.gradeId = id;
  q.style.position = 'relative';

  const num = document.createElement('span');
  num.style.cssText = 'position:absolute;bottom:0.4rem;right:0.6rem;font-size:0.75rem;color:var(--muted);';
  num.textContent = id;
  q.appendChild(num);

  q.querySelectorAll('textarea, input.blank').forEach((el, j) => {
    el.maxLength = el.tagName === 'TEXTAREA' ? 2000 : 300;
    const key = id + ':' + j;
    if (localStorage.getItem(key)) el.value = localStorage.getItem(key);
    el.addEventListener('input', () => {
      localStorage.setItem(key, el.value);
      updateEditedMark(q, id);
    });
  });

  const btn = document.createElement('button');
  btn.className = 'grade-btn';
  btn.textContent = 'AI 批改';
  const resultEl = document.createElement('div');
  resultEl.className = 'grade-result';
  resultEl.style.display = 'none';

  const data = getQuestionData(q);
  const cached = localStorage.getItem(cacheKey(id, data.inputs));
  if (cached && data.inputs.some(v => v)) {
    showResult(resultEl, cached);
    if (!localStorage.getItem('naq:snap:' + id))
      localStorage.setItem('naq:snap:' + id, data.inputs.join('|'));
  }

  addGradeBtnListeners(btn, () => [[q], resultEl]);

  q.querySelector('.answer-btn').insertAdjacentElement('afterend', btn);
  btn.insertAdjacentElement('afterend', resultEl);

  updateEditedMark(q, id);
});

document.addEventListener('click', e => {
  if (e.target.classList.contains('answer-btn')) {
    const ans = e.target.closest('.question').querySelector('.answer');
    const visible = ans.classList.toggle('visible');
    e.target.textContent = visible ? '隐藏答案' : '显示答案';
  }
});
} // end if (.question)

// Settings panel
const FONT_KEY = 'fontSize';
const THEME_KEY = 'theme';
const sizes = ['0.75rem','0.85rem','0.95rem','1.05rem','1.18rem','1.32rem','1.5rem'];
let sizeIdx = parseInt(localStorage.getItem(FONT_KEY) || '2');

const ctrl = document.createElement('div');
ctrl.className = 'font-controls';
ctrl.innerHTML = `<span class="fc-toggle">⚙</span><div class="fc-inner">
  <label>字号</label><input type="range" min="0" max="6" step="1"><span class="fc-size"></span>
  <label>主题</label><button class="fc-theme">🌙</button>
  <div class="fc-sep"></div>
  <button class="fc-api-open">配置 API</button>
  <button class="fc-clear-page">缓存管理</button>
</div>`;
document.body.appendChild(ctrl);

const slider = ctrl.querySelector('input[type=range]');
const sizeLabel = ctrl.querySelector('.fc-size');
const applySize = () => { document.documentElement.style.fontSize = sizes[sizeIdx]; sizeLabel.textContent = sizes[sizeIdx]; slider.value = sizeIdx; };

const themeBtn = ctrl.querySelector('.fc-theme');
let dark = localStorage.getItem(THEME_KEY) !== 'light';
const applyTheme = () => { document.body.classList.toggle('light', !dark); themeBtn.textContent = dark ? '🌙' : '☀️'; };
themeBtn.addEventListener('click', () => { dark = !dark; localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); applyTheme(); });

ctrl.querySelector('.fc-toggle').addEventListener('click', () => ctrl.classList.toggle('open'));
slider.addEventListener('input', () => { sizeIdx = parseInt(slider.value); localStorage.setItem(FONT_KEY, sizeIdx); applySize(); });
applySize();
applyTheme();

// API config modal — no click-outside-to-close
const apiModal = document.createElement('div');
apiModal.className = 'api-modal';
apiModal.innerHTML = `<div class="api-modal-box">
  <h3>自定义 API 配置</h3>
  <label>接入点</label><input class="fc-api-url" type="text" placeholder="https://api.xxx.com/v1">
  <label>API Key</label><input class="fc-api-key" type="password" placeholder="sk-...">
  <label>模型</label><input class="fc-api-model" type="text" placeholder="${AI_MODEL}">
  <label>API 类型</label><select class="fc-api-type"><option value="openai">OpenAI 兼容</option><option value="gemini">Gemini</option><option value="claude">Claude</option></select>
  <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;white-space:nowrap"><input class="fc-send-answer" type="checkbox"> 将参考答案传给 AI</label>
  <div class="fc-sep" style="width:100%;border-top:1px solid var(--border);margin:0.2rem 0"></div>
  <label>邀请码（使用默认 API 时需要）</label><input class="fc-invite" type="password" placeholder="邀请码">
  <div class="api-modal-row"><button class="fc-api-save">更新</button><button class="fc-api-test">测试自定义 API</button><span class="fc-api-status"></span><button class="fc-api-close">关闭</button></div>
</div>`;
document.body.appendChild(apiModal);

// Clear cache modal
const clearModal = document.createElement('div');
clearModal.className = 'api-modal';
clearModal.innerHTML = `<div class="api-modal-box">
  <h3>缓存管理</h3>
  <label class="clr-option"><input class="clr-inputs" type="checkbox"> 题目输入（本页）</label>
  <label class="clr-option"><input class="clr-grade" type="checkbox"> 批改结果（本页）</label>
  <label class="clr-option"><input class="clr-api" type="checkbox"> API 配置</label>
  <div class="api-modal-row"><button class="clr-confirm">清除所选</button><button class="clr-export">导出所选</button><button class="clr-import">导入</button><input class="clr-import-file" type="file" accept=".json" style="display:none"><button class="clr-close">关闭</button></div>
</div>`;
document.body.appendChild(clearModal);

if (!document.querySelector('.question')) {
  clearModal.querySelector('.clr-inputs').closest('label').childNodes[1].textContent = ' 题目输入（所有页面）';
  clearModal.querySelector('.clr-grade').closest('label').childNodes[1].textContent = ' 批改结果（所有页面）';
}

clearModal.querySelector('.clr-close').addEventListener('click', () => clearModal.classList.remove('open'));
clearModal.querySelector('.clr-confirm').addEventListener('click', () => {
  const doInputs = clearModal.querySelector('.clr-inputs').checked;
  const doGrade = clearModal.querySelector('.clr-grade').checked;
  const doApi = clearModal.querySelector('.clr-api').checked;
  if (!doInputs && !doGrade && !doApi) return;
  const labels = [doInputs && '题目输入', doGrade && '批改结果', doApi && 'API 配置'].filter(Boolean).join('、');
  if (!confirm(`确认清除：${labels}？`)) return;
  if (doInputs) {
    Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
    document.querySelectorAll('textarea, input.blank').forEach(el => { el.value = ''; });
  }
  if (doGrade) {
    Object.keys(localStorage).filter(k => k.startsWith('naq:grade:' + prefix) || k.startsWith('naq:snap:' + prefix)).forEach(k => localStorage.removeItem(k));
    document.querySelectorAll('.grade-result').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.edited-mark').forEach(el => el.remove());
  }
  if (doApi) {
    ['user-api-url','user-api-key','user-api-model','user-api-type','send-answer'].forEach(k => localStorage.removeItem(k));
    apiUrlEl.value = ''; apiKeyEl.value = ''; apiModelEl.value = ''; apiTypeEl.value = 'openai';
    sendAnswerEl.checked = true;
  }
  clearModal.classList.remove('open');
});

function getSelectedKeys() {
  const doInputs = clearModal.querySelector('.clr-inputs').checked;
  const doGrade = clearModal.querySelector('.clr-grade').checked;
  const doApi = clearModal.querySelector('.clr-api').checked;
  return Object.keys(localStorage).filter(k =>
    (doInputs && k.startsWith(prefix)) ||
    (doGrade && (k.startsWith('naq:grade:') || k.startsWith('naq:snap:'))) ||
    (doApi && ['user-api-url','user-api-key','user-api-model','user-api-type','send-answer','user-invite'].includes(k))
  );
}

clearModal.querySelector('.clr-export').addEventListener('click', () => {
  const keys = getSelectedKeys();
  if (!keys.length) return;
  const data = Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = 'na-quiz-cache.json';
  a.click();
});

const importFile = clearModal.querySelector('.clr-import-file');
clearModal.querySelector('.clr-import').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
      location.reload();
    } catch { alert('文件格式错误'); }
  };
  reader.readAsText(file);
  importFile.value = '';
});

const apiUrlEl = apiModal.querySelector('.fc-api-url');
const apiKeyEl = apiModal.querySelector('.fc-api-key');
const apiModelEl = apiModal.querySelector('.fc-api-model');
const apiTypeEl = apiModal.querySelector('.fc-api-type');
const sendAnswerEl = apiModal.querySelector('.fc-send-answer');
const inviteEl = apiModal.querySelector('.fc-invite');
const apiStatus = apiModal.querySelector('.fc-api-status');
apiUrlEl.value = localStorage.getItem('user-api-url') || '';
apiKeyEl.value = localStorage.getItem('user-api-key') || '';
apiModelEl.value = localStorage.getItem('user-api-model') || '';
apiTypeEl.value = localStorage.getItem('user-api-type') || 'openai';
sendAnswerEl.checked = localStorage.getItem('send-answer') !== 'false';
inviteEl.value = localStorage.getItem('user-invite') || '';

apiModal.querySelector('.fc-api-save').addEventListener('click', () => {
  localStorage.setItem('user-api-url', apiUrlEl.value.trim());
  localStorage.setItem('user-api-key', apiKeyEl.value.trim());
  localStorage.setItem('user-api-model', apiModelEl.value.trim());
  localStorage.setItem('user-api-type', apiTypeEl.value);
  localStorage.setItem('send-answer', sendAnswerEl.checked ? 'true' : 'false');
  localStorage.setItem('user-invite', inviteEl.value.trim());
  apiStatus.textContent = '已更新。'; apiStatus.style.color = 'var(--green)';
  if (confirm('是否清除所有批改缓存？')) clearGradeCache();
});

ctrl.querySelector('.fc-api-open').addEventListener('click', () => apiModal.classList.add('open'));
ctrl.querySelector('.fc-clear-page').addEventListener('click', () => clearModal.classList.add('open'));
apiModal.querySelector('.fc-api-close').addEventListener('click', () => apiModal.classList.remove('open'));

apiModal.querySelector('.fc-api-test').addEventListener('click', async () => {
  const url = apiUrlEl.value.trim();
  const key = apiKeyEl.value.trim();
  const model = apiModelEl.value.trim() || AI_MODEL;
  if (!url || !key) { apiStatus.textContent = '请填写接入点和 Key'; apiStatus.style.color = 'var(--red)'; return; }
  if (!checkRate('naq:rate:test', 5)) { apiStatus.textContent = '测试过于频繁，请稍后再试。'; apiStatus.style.color = 'var(--red)'; return; }
  apiStatus.textContent = '测试中…'; apiStatus.style.color = 'var(--muted)';
  try {
    const req = buildRequest({ url: url.replace(/\/$/, ''), key, model, type: apiTypeEl.value, invite: null },
      [{ role: 'user', content: 'hi' }]);
    if (req.body && !req.body.max_tokens) req.body.max_tokens = 5;
    const resp = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    await resp.json();
    apiStatus.textContent = '✓ 连接成功'; apiStatus.style.color = 'var(--green)';
  } catch (e) {
    apiStatus.textContent = '✗ ' + e.message; apiStatus.style.color = 'var(--red)';
  }
});

// Section-level grade buttons
function makeSectionGradeBtn(qEls) {
  const wrap = document.createElement('div');
  const btn = document.createElement('button');
  btn.className = 'grade-btn section-grade';
  btn.textContent = 'AI 批改本节';
  const resultEl = document.createElement('div');
  resultEl.className = 'grade-result';
  resultEl.style.display = 'none';
  addGradeBtnListeners(btn, () => [qEls, resultEl]);
  wrap.appendChild(btn);
  wrap.appendChild(resultEl);
  return wrap;
}

if (document.querySelector('.question')) {
[...document.querySelectorAll('h2')].forEach(h2 => {
  const sectionQs = [];
  let el = h2.nextElementSibling;
  while (el && el.tagName !== 'H2') {
    if (el.classList.contains('question')) sectionQs.push(el);
    el = el.nextElementSibling;
  }
  if (sectionQs.length) sectionQs[sectionQs.length - 1].insertAdjacentElement('afterend', makeSectionGradeBtn(sectionQs));
});

// Page-level grade button
const pageBtn = document.createElement('button');
pageBtn.className = 'grade-btn page-grade';
pageBtn.textContent = 'AI 批改全页';
const pageResult = document.createElement('div');
pageResult.className = 'grade-result';
pageResult.style.display = 'none';
addGradeBtnListeners(pageBtn, () => [[...document.querySelectorAll('.question')], pageResult]);
document.body.appendChild(pageBtn);
document.body.appendChild(pageResult);
} // end if (.question)

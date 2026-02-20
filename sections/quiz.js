// Auto-number questions: derive chapter prefix from filename
const prefix = 'na-quiz:' + (location.pathname.replace(/.*\//, '').replace(/\.[^.]*$/, '') || 'index');
const VERSION = '2026-02-20 18:00';

// AI grading config
const WORKER_URL = 'https://blog-proxy.yangjt22.workers.dev';
const AI_MODEL = 'glm-4.5-air:free';
const RATE_KEY = 'grade-rate';
const RATE_LIMIT = 10;
const RATE_WINDOW = 60000;

function clearGradeCache() {
  Object.keys(localStorage).filter(k => k.startsWith('grade:')).forEach(k => localStorage.removeItem(k));
}

function getApiConfig() {
  const url = localStorage.getItem('user-api-url');
  const key = localStorage.getItem('user-api-key');
  const model = localStorage.getItem('user-api-model');
  if (url && key) return { url: url.replace(/\/$/, '') + '/chat/completions', key, model: model || AI_MODEL, custom: true };
  return { url: WORKER_URL, key: null, model: AI_MODEL, custom: false };
}

function checkClientRate() {
  const now = Date.now();
  const r = JSON.parse(localStorage.getItem(RATE_KEY) || '{"count":0,"start":0}');
  if (now - r.start > RATE_WINDOW) { r.count = 0; r.start = now; }
  r.count++;
  localStorage.setItem(RATE_KEY, JSON.stringify(r));
  return r.count <= RATE_LIMIT;
}

function cacheKey(id, inputs) { return 'grade:' + id + ':' + inputs.join('|'); }

function getQuestionData(q) {
  const qtext = q.querySelector('.q-text')?.textContent?.trim() || '';
  const answer = q.querySelector('.answer')?.textContent?.trim() || '';
  const inputs = [...q.querySelectorAll('textarea, input.blank')].map(el => el.value.trim());
  return { qtext, answer, inputs };
}

function buildPrompt(questions) {
  const items = questions.map(({ qtext, answer, inputs }, i) =>
    `===题${i+1}===\n题目：${qtext}\n学生答案：${inputs.join(' | ')}\n参考答案：${answer}`
  ).join('\n\n');
  return `你是数值分析老师，正在批改作业。对每题输出一行，必须以 ===题N=== 开头（N为题号），然后给出批改：正确给【✓】（若有值得补充的要点可加一句，否则只输出【✓】）；部分正确给【△】并指出缺失点；错误给【✗】并直接给出正确思路。数学含义正确即为正确，忽略符号写法差异。\n\n${items}`;
}

function showResult(el, text) {
  el.textContent = text;
  el.className = 'grade-result' + (
    /✓/.test(text) && !/✗|△/.test(text) ? ' correct' :
    /✗/.test(text) && !/✓|△/.test(text) ? ' wrong' : ''
  );
  el.style.display = 'block';
}

async function gradeQuestions(qEls, summaryEl) {
  const allData = qEls.map(q => {
    const id = q.dataset.gradeId;
    const data = getQuestionData(q);
    const key = cacheKey(id, data.inputs);
    return { q, data, id, key, cached: localStorage.getItem(key) };
  });

  // Show cached results on per-question elements
  allData.filter(d => d.cached && d.data.inputs.some(v => v)).forEach(({ q, cached }) => {
    const el = q.querySelector('.grade-result');
    if (el) showResult(el, cached);
  });

  const needGrade = allData.filter(d => !d.cached && d.data.inputs.some(v => v));

  if (needGrade.length === 0) {
    if (summaryEl && !allData.some(d => d.data.inputs.some(v => v))) {
      summaryEl.textContent = '请先填写答案再批改。'; summaryEl.style.display = 'block';
    }
    return;
  }

  if (!checkClientRate()) {
    if (summaryEl) { summaryEl.textContent = '请求过于频繁，请稍后再试。'; summaryEl.className = 'grade-result error'; summaryEl.style.display = 'block'; }
    return;
  }

  if (summaryEl) { summaryEl.textContent = '批改中…'; summaryEl.style.display = 'block'; }

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1 && summaryEl) summaryEl.textContent = `批改中… (第${attempt}次，等待${attempt * 3}s)`;
    if (attempt > 1) await new Promise(r => setTimeout(r, attempt * 3000));
    try {
      const cfg = getApiConfig();
      const headers = { 'Content-Type': 'application/json' };
      if (cfg.key) headers['Authorization'] = `Bearer ${cfg.key}`;
      const resp = await fetch(cfg.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: buildPrompt(needGrade.map(d => d.data)) }] })
      });
      if ((resp.status === 504 || resp.status === 429) && attempt < 3) continue;
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = (await resp.json()).choices?.[0]?.message?.content || '无返回内容';

      if (needGrade.length === 1) {
        localStorage.setItem(needGrade[0].key, text);
        const target = summaryEl || needGrade[0].q.querySelector('.grade-result');
        showResult(target, text);
      } else {
        // Parse by ===题N=== markers
        const parsed = {};
        text.split(/===题(\d+)===/).forEach((seg, i, arr) => {
          if (i % 2 === 1) parsed[parseInt(arr[i])] = (arr[i+1] || '').trim();
        });
        const parseOk = needGrade.every((_, i) => parsed[i+1]);
        needGrade.forEach(({ q, key }, i) => {
          const part = parseOk ? parsed[i+1] : null;
          if (part) {
            localStorage.setItem(key, part);
            const el = q.querySelector('.grade-result');
            if (el) showResult(el, part);
          }
        });
        // On parse failure, show full text in summary only
        if (summaryEl) { if (parseOk) summaryEl.style.display = 'none'; else showResult(summaryEl, text); }
      }
      return;
    } catch (e) {
      if (attempt === 3 && summaryEl) { summaryEl.textContent = '批改失败：' + e.message; summaryEl.className = 'grade-result error'; }
    }
  }
}

document.querySelectorAll('.question').forEach((q, i) => {
  const id = prefix + '-' + (i + 1);
  q.dataset.gradeId = id;
  q.style.position = 'relative';

  const num = document.createElement('span');
  num.style.cssText = 'position:absolute;bottom:0.4rem;right:0.6rem;font-size:0.75rem;color:var(--muted);';
  num.textContent = id;
  q.appendChild(num);

  q.querySelectorAll('textarea, input.blank').forEach((el, j) => {
    const key = id + ':' + j;
    if (localStorage.getItem(key)) el.value = localStorage.getItem(key);
    el.addEventListener('input', () => localStorage.setItem(key, el.value));
  });

  const btn = document.createElement('button');
  btn.className = 'grade-btn';
  btn.textContent = 'AI 批改';
  const resultEl = document.createElement('div');
  resultEl.className = 'grade-result';
  resultEl.style.display = 'none';

  // Restore cached result on load
  const data = getQuestionData(q);
  const cached = localStorage.getItem(cacheKey(id, data.inputs));
  if (cached && data.inputs.some(v => v)) showResult(resultEl, cached);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await gradeQuestions([q], resultEl);
    btn.disabled = false;
  });

  q.querySelector('.answer-btn').insertAdjacentElement('afterend', btn);
  btn.insertAdjacentElement('afterend', resultEl);
});

// Toggle answer visibility
document.addEventListener('click', e => {
  if (e.target.classList.contains('answer-btn')) {
    const ans = e.target.closest('.question').querySelector('.answer');
    const visible = ans.classList.toggle('visible');
    e.target.textContent = visible ? '隐藏答案' : '显示答案';
  }
});

// Settings panel
const FONT_KEY = 'fontSize';
const THEME_KEY = 'theme';
const sizes = ['0.75rem','0.85rem','0.95rem','1.05rem','1.18rem','1.32rem','1.5rem'];
let sizeIdx = parseInt(localStorage.getItem(FONT_KEY) || '2');

const ctrl = document.createElement('div');
ctrl.className = 'font-controls';
ctrl.innerHTML = `<span class="fc-toggle">⚙</span><div class="fc-inner">
  <label>字号</label><input type="range" min="0" max="6" step="1"><span class="fc-size"></span>
  <label>主题</label><button class="fc-theme">🌙</button><span class="fc-ver">${VERSION}</span>
  <div class="fc-sep"></div>
  <button class="fc-api-open">配置 API</button>
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

// User API config modal
const apiModal = document.createElement('div');
apiModal.className = 'api-modal';
apiModal.innerHTML = `<div class="api-modal-box">
  <h3>自定义 API 配置</h3>
  <label>接入点</label><input class="fc-api-url" type="text" placeholder="https://api.xxx.com/v1">
  <label>API Key</label><input class="fc-api-key" type="password" placeholder="sk-...">
  <label>模型</label><input class="fc-api-model" type="text" placeholder="${AI_MODEL}">
  <div class="api-modal-row"><button class="fc-api-test">测试</button><span class="fc-api-status"></span><button class="fc-api-close" style="margin-left:auto">关闭</button></div>
</div>`;
document.body.appendChild(apiModal);

const apiUrlEl = apiModal.querySelector('.fc-api-url');
const apiKeyEl = apiModal.querySelector('.fc-api-key');
const apiModelEl = apiModal.querySelector('.fc-api-model');
const apiStatus = apiModal.querySelector('.fc-api-status');
apiUrlEl.value = localStorage.getItem('user-api-url') || '';
apiKeyEl.value = localStorage.getItem('user-api-key') || '';
apiModelEl.value = localStorage.getItem('user-api-model') || '';
[['user-api-url', apiUrlEl], ['user-api-key', apiKeyEl], ['user-api-model', apiModelEl]].forEach(([k, el]) =>
  el.addEventListener('input', () => {
    localStorage.setItem(k, el.value.trim());
    clearGradeCache();
    apiStatus.textContent = '配置已更新，批改缓存已清除。'; apiStatus.style.color = 'var(--muted)';
  })
);

ctrl.querySelector('.fc-api-open').addEventListener('click', () => apiModal.classList.add('open'));
apiModal.querySelector('.fc-api-close').addEventListener('click', () => apiModal.classList.remove('open'));
apiModal.addEventListener('click', e => { if (e.target === apiModal) apiModal.classList.remove('open'); });

apiModal.querySelector('.fc-api-test').addEventListener('click', async () => {
  const url = apiUrlEl.value.trim();
  const key = apiKeyEl.value.trim();
  const model = apiModelEl.value.trim() || AI_MODEL;
  if (!url || !key) { apiStatus.textContent = '请填写接入点和 Key'; apiStatus.style.color = 'var(--red)'; return; }
  apiStatus.textContent = '测试中…'; apiStatus.style.color = 'var(--muted)';
  try {
    const resp = await fetch(url.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
    });
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
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await gradeQuestions(qEls, resultEl);
    btn.disabled = false;
  });
  wrap.appendChild(btn);
  wrap.appendChild(resultEl);
  return wrap;
}

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
pageBtn.addEventListener('click', async () => {
  pageBtn.disabled = true;
  await gradeQuestions([...document.querySelectorAll('.question')], pageResult);
  pageBtn.disabled = false;
});
document.body.appendChild(pageBtn);
document.body.appendChild(pageResult);

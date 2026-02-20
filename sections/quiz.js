// Auto-number questions: derive chapter prefix from filename
const prefix = 'na-quiz:' + (location.pathname.replace(/.*\//, '').replace(/\.[^.]*$/, '') || 'index');
const VERSION = '10c8e77';

// AI grading config — update these after deploying your Cloudflare Worker
const WORKER_URL = 'https://blog-proxy.yangjt22.workers.dev';
const AI_MODEL = 'glm-4.5-air:free'; // model name passed to the API
const RATE_KEY = 'grade-rate';
const RATE_LIMIT = 10;   // max calls per window (client-side soft limit)
const RATE_WINDOW = 60000;

function checkClientRate() {
  const now = Date.now();
  const r = JSON.parse(localStorage.getItem(RATE_KEY) || '{"count":0,"start":0}');
  if (now - r.start > RATE_WINDOW) { r.count = 0; r.start = now; }
  r.count++;
  localStorage.setItem(RATE_KEY, JSON.stringify(r));
  return r.count <= RATE_LIMIT;
}

function getQuestionData(q) {
  const qtext = q.querySelector('.q-text')?.textContent?.trim() || '';
  const answer = q.querySelector('.answer')?.textContent?.trim() || '';
  const inputs = [...q.querySelectorAll('textarea, input.blank')].map(el => el.value.trim());
  return { qtext, answer, inputs };
}

function buildPrompt(questions) {
  const items = questions.map(({ qtext, answer, inputs }, i) => {
    const userAns = inputs.length ? inputs.join(' | ') : '（未作答）';
    return `【第${i+1}题】\n题目：${qtext}\n学生答案：${userAns}\n参考答案：${answer}`;
  }).join('\n\n');
  return `你是一位数值分析课程助教，请批改以下题目。评判标准：数学含义正确即为正确，不要因为符号写法、省略范围等细节扣分。对每题输出一行：【✓正确】【△部分正确】【✗错误】加一句简短点评。用中文，格式简洁。\n\n${items}`;
}

async function gradeQuestions(questions, resultEl) {
  if (!checkClientRate()) {
    resultEl.textContent = '请求过于频繁，请稍后再试。';
    resultEl.className = 'grade-result error';
    return;
  }
  const hasInput = questions.some(q => q.inputs.some(v => v));
  if (!hasInput) {
    resultEl.textContent = '请先填写答案再批改。';
    resultEl.className = 'grade-result error';
    return;
  }

  resultEl.textContent = '批改中…';
  resultEl.className = 'grade-result';

  try {
    const resp = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: buildPrompt(questions) }]
      })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '无返回内容';
    resultEl.textContent = text;
    resultEl.className = 'grade-result' + (
      /✓/.test(text) && !/✗|△/.test(text) ? ' correct' :
      /✗/.test(text) && !/✓|△/.test(text) ? ' wrong' : ''
    );
  } catch (e) {
    resultEl.textContent = '批改失败：' + e.message;
    resultEl.className = 'grade-result error';
  }
}

document.querySelectorAll('.question').forEach((q, i) => {
  const num = document.createElement('span');
  num.style.cssText = 'position:absolute;bottom:0.4rem;right:0.6rem;font-size:0.75rem;color:var(--muted);';
  const id = prefix + '-' + (i + 1);
  num.textContent = id;
  q.style.position = 'relative';
  q.appendChild(num);

  // Restore saved values
  q.querySelectorAll('textarea, input.blank').forEach((el, j) => {
    const key = id + ':' + j;
    if (localStorage.getItem(key)) el.value = localStorage.getItem(key);
    el.addEventListener('input', () => localStorage.setItem(key, el.value));
  });

  // Per-question grade button
  const btn = document.createElement('button');
  btn.className = 'grade-btn';
  btn.textContent = 'AI 批改';
  const resultEl = document.createElement('div');
  resultEl.className = 'grade-result';
  resultEl.style.display = 'none';

  btn.addEventListener('click', async () => {
    resultEl.style.display = 'block';
    btn.disabled = true;
    await gradeQuestions([getQuestionData(q)], resultEl);
    btn.disabled = false;
  });

  q.querySelector('.answer-btn').insertAdjacentElement('afterend', btn);
  btn.insertAdjacentElement('afterend', resultEl);
});

// Toggle answer visibility
document.addEventListener('click', e => {
  if (e.target.classList.contains('answer-btn')) {
    const ans = e.target.nextElementSibling;
    const visible = ans.classList.toggle('visible');
    e.target.textContent = visible ? '隐藏答案' : '显示答案';
  }
});

// Settings panel: font size, theme, version
const FONT_KEY = 'fontSize';
const THEME_KEY = 'theme';
const sizes = ['0.75rem','0.85rem','0.95rem','1.05rem','1.18rem','1.32rem','1.5rem'];
let sizeIdx = parseInt(localStorage.getItem(FONT_KEY) || '2');

const ctrl = document.createElement('div');
ctrl.className = 'font-controls';
ctrl.innerHTML = `
  <span class="fc-toggle">⚙</span>
  <div class="fc-inner">
    <label>字号</label><input type="range" min="0" max="6" step="1"><span class="fc-size"></span>
    <label>主题</label>
    <button class="fc-theme">🌙</button>
    <span class="fc-ver" title="git commit">${VERSION}</span>
  </div>`;
document.body.appendChild(ctrl);

const slider = ctrl.querySelector('input[type=range]');
const sizeLabel = ctrl.querySelector('.fc-size');
const applySize = () => { document.documentElement.style.fontSize = sizes[sizeIdx]; sizeLabel.textContent = sizes[sizeIdx]; slider.value = sizeIdx; };

// Theme
const themeBtn = ctrl.querySelector('.fc-theme');
let dark = localStorage.getItem(THEME_KEY) !== 'light';
const applyTheme = () => { document.body.classList.toggle('light', !dark); themeBtn.textContent = dark ? '🌙' : '☀️'; };
themeBtn.addEventListener('click', () => { dark = !dark; localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); applyTheme(); });

ctrl.querySelector('.fc-toggle').addEventListener('click', () => ctrl.classList.toggle('open'));
slider.addEventListener('input', () => { sizeIdx = parseInt(slider.value); localStorage.setItem(FONT_KEY, sizeIdx); applySize(); });
applySize();
applyTheme();

// Section-level grade buttons: insert after each h2, covering questions until next h2
function makeSectionGradeBtn(questions) {
  const wrap = document.createElement('div');
  const btn = document.createElement('button');
  btn.className = 'grade-btn section-grade';
  btn.textContent = 'AI 批改本节';
  const resultEl = document.createElement('div');
  resultEl.className = 'grade-result';
  resultEl.style.display = 'none';
  btn.addEventListener('click', async () => {
    resultEl.style.display = 'block';
    btn.disabled = true;
    await gradeQuestions(questions.map(getQuestionData), resultEl);
    btn.disabled = false;
  });
  wrap.appendChild(btn);
  wrap.appendChild(resultEl);
  return wrap;
}

// Group questions by section (h2)
const allH2 = [...document.querySelectorAll('h2')];
allH2.forEach(h2 => {
  const sectionQs = [];
  let el = h2.nextElementSibling;
  while (el && el.tagName !== 'H2') {
    if (el.classList.contains('question')) sectionQs.push(el);
    el = el.nextElementSibling;
  }
  if (sectionQs.length) {
    const lastQ = sectionQs[sectionQs.length - 1];
    lastQ.insertAdjacentElement('afterend', makeSectionGradeBtn(sectionQs));
  }
});

// Page-level grade button at bottom
const pageBtn = document.createElement('button');
pageBtn.className = 'grade-btn page-grade';
pageBtn.textContent = 'AI 批改全页';
const pageResult = document.createElement('div');
pageResult.className = 'grade-result';
pageResult.style.display = 'none';
pageBtn.addEventListener('click', async () => {
  pageResult.style.display = 'block';
  pageBtn.disabled = true;
  await gradeQuestions([...document.querySelectorAll('.question')].map(getQuestionData), pageResult);
  pageBtn.disabled = false;
});
document.body.appendChild(pageBtn);
document.body.appendChild(pageResult);

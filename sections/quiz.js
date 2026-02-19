// Auto-number questions: derive chapter prefix from filename
const chapterMatch = location.pathname.match(/(\d+)/);
const prefix = chapterMatch ? chapterMatch[1] : '0';

document.querySelectorAll('.question').forEach((q, i) => {
  const num = document.createElement('span');
  num.style.cssText = 'float:right;font-size:0.75rem;color:var(--muted);margin-top:0.2rem;';
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
});

// Toggle answer visibility
document.addEventListener('click', e => {
  if (e.target.classList.contains('answer-btn')) {
    const ans = e.target.nextElementSibling;
    const visible = ans.classList.toggle('visible');
    e.target.textContent = visible ? '隐藏答案' : '显示答案';
  }
});

// Font size controls
const FONT_KEY = 'fontSize';
const sizes = ['0.85rem', '1rem', '1.15rem', '1.3rem'];
let sizeIdx = parseInt(localStorage.getItem(FONT_KEY) || '1');
document.documentElement.style.fontSize = sizes[sizeIdx];

const ctrl = document.createElement('div');
ctrl.className = 'font-controls';
ctrl.innerHTML = '<button id="fz-">A-</button><button id="fz+">A+</button>';
document.body.appendChild(ctrl);

document.getElementById('fz-').addEventListener('click', () => {
  if (sizeIdx > 0) { sizeIdx--; document.documentElement.style.fontSize = sizes[sizeIdx]; localStorage.setItem(FONT_KEY, sizeIdx); }
});
document.getElementById('fz+').addEventListener('click', () => {
  if (sizeIdx < sizes.length - 1) { sizeIdx++; document.documentElement.style.fontSize = sizes[sizeIdx]; localStorage.setItem(FONT_KEY, sizeIdx); }
});

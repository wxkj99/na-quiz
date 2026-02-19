// Auto-number questions: derive chapter prefix from filename
const prefix = 'na-quiz:' + (location.pathname.replace(/.*\//, '').replace(/\.[^.]*$/, '') || 'index');

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
const sizes = ['0.75rem','0.85rem','0.95rem','1.05rem','1.18rem','1.32rem','1.5rem'];
let sizeIdx = parseInt(localStorage.getItem(FONT_KEY) || '2');

const ctrl = document.createElement('div');
ctrl.className = 'font-controls';
ctrl.innerHTML = '<span class="fc-toggle">A</span><div class="fc-inner"><input type="range" min="0" max="6" step="1"><span></span></div>';
document.body.appendChild(ctrl);

const slider = ctrl.querySelector('input');
const label = ctrl.querySelector('.fc-inner span');
const applySize = () => { document.documentElement.style.fontSize = sizes[sizeIdx]; label.textContent = sizes[sizeIdx]; slider.value = sizeIdx; };

ctrl.querySelector('.fc-toggle').addEventListener('click', () => ctrl.classList.toggle('open'));
slider.addEventListener('input', () => { sizeIdx = parseInt(slider.value); localStorage.setItem(FONT_KEY, sizeIdx); applySize(); });
applySize();

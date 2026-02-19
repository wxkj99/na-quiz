import re, os

os.makedirs('/d/math/NA/md', exist_ok=True)

def strip_tags(html):
    # Remove script/style blocks
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
    # input.blank -> ______
    html = re.sub(r'<input[^>]*class="blank"[^>]*>', '______', html)
    # textarea -> answer area marker
    html = re.sub(r'<textarea[^>]*>.*?</textarea>', '\n> （作答区）\n', html, flags=re.DOTALL)
    # <br> -> newline
    html = re.sub(r'<br\s*/?>', '\n', html)
    # <b> -> **
    html = re.sub(r'<b>(.*?)</b>', r'**\1**', html, flags=re.DOTALL)
    # strip remaining tags
    html = re.sub(r'<[^>]+>', '', html)
    # decode entities
    html = html.replace('&lt;','<').replace('&gt;','>').replace('&amp;','&').replace('&nbsp;',' ')
    return html

def extract_questions(html):
    questions = re.findall(r'<div class="question">(.*?)</div>\s*\n?\s*(?=<div class="question">|<script|$)', html, re.DOTALL)
    if not questions:
        questions = re.findall(r'<div class="question">(.*?)(?=<div class="question">|<script)', html, re.DOTALL)
    return questions

files = sorted([f for f in os.listdir('/d/math/NA/sections') if re.match(r'\d+_.*\.html$', f)])

for fname in files:
    path = f'/d/math/NA/sections/{fname}'
    with open(path, encoding='utf-8') as f:
        html = f.read()

    # chapter number
    ch = re.match(r'(\d+)', fname).group(1)

    # h1
    h1 = re.search(r'<h1>(.*?)</h1>', html)
    title = strip_tags(h1.group(1)) if h1 else fname

    lines = [f'# {title}\n']

    # split by h2 sections
    # find all h2 positions and question positions
    parts = re.split(r'(<h2>.*?</h2>)', html, flags=re.DOTALL)

    q_idx = 0
    for part in parts:
        h2m = re.match(r'<h2>(.*?)</h2>', part, re.DOTALL)
        if h2m:
            lines.append(f'\n## {strip_tags(h2m.group(1))}\n')
            continue
        # find questions in this part
        qs = list(re.finditer(r'<div class="question">(.*?)(?=<div class="question">|$)', part, re.DOTALL))
        for qm in qs:
            qhtml = qm.group(1)
            q_idx += 1

            # type badge
            badge = re.search(r'class="q-type[^"]*">(.*?)</span>', qhtml)
            badge_text = strip_tags(badge.group(1)) if badge else ''

            # question text
            qtext = re.search(r'class="q-text">(.*?)</span>', qhtml, re.DOTALL)
            qtext_str = strip_tags(qtext.group(1)).strip() if qtext else ''

            # extra div (blanks area)
            extra = re.search(r'<div style="margin[^"]*">(.*?)</div>', qhtml, re.DOTALL)
            extra_str = strip_tags(extra.group(1)).strip() if extra else ''

            # answer
            ans = re.search(r'<div class="answer">(.*?)</div>\s*\n?\s*</div>', qhtml, re.DOTALL)
            ans_str = strip_tags(ans.group(1)).strip() if ans else ''

            lines.append(f'\n**{ch}-{q_idx}** [{badge_text}] {qtext_str}\n')
            if extra_str:
                lines.append(f'\n{extra_str}\n')
            # textarea already converted to > （作答区）
            if '（作答区）' in qhtml:
                lines.append('\n> （作答区）\n')
            if ans_str:
                lines.append(f'\n<details><summary>答案</summary>\n\n{ans_str}\n\n</details>\n')
            lines.append('\n---\n')

    out = fname.replace('.html', '.md')
    with open(f'/d/math/NA/md/{out}', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f'wrote {out}')


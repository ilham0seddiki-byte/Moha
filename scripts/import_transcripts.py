"""Convert saved video_transcript results (JSON) into es/corpus/<video_id>.tsv files."""
import json, re, sys, pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / 'es' / 'corpus'
CHANNELS = {}  # video_id -> channel name (optional, from channels.json)
ch = OUT / 'channels.json'
if ch.exists():
    CHANNELS = json.loads(ch.read_text())

def clean(t):
    t = re.sub(r'\[[^\]]*\]', '', t)          # [música], [risas]
    return re.sub(r'\s+', ' ', t).strip()

def import_stdout(text):
    """Lines from a jq export: '#<id>\t<title>' then '<start_ms>\t<text>'."""
    vid, lines = None, []
    def flush():
        if vid and len(lines) > 1:
            (OUT / f'{vid}.tsv').write_text('\n'.join(lines) + '\n'); print('ok', vid, len(lines) - 1)
    for ln in text.split('\n'):
        if ln.startswith('#'):
            flush(); vid, title = ln[1:].split('\t', 1); lines = [f"#{title}\t{CHANNELS.get(vid, '')}"]
        elif vid and '\t' in ln:
            ms, t = ln.split('\t', 1); t = clean(t)
            if t and ms.isdigit(): lines.append(f"{int(ms) / 1000:g}\t{t}")
    flush()

for path in sys.argv[1:]:
    raw = pathlib.Path(path).read_text()
    data = json.loads(raw[raw.index('{'):])
    if 'stdout' in (data['data']['alexandria'][0].get('data') or {}):
        import_stdout(data['data']['alexandria'][0]['data']['stdout']); continue
    for item in data['data']['alexandria']:
        d = item.get('data') or {}
        if not d.get('has_transcript'):
            print('skip (no transcript):', d.get('video_id'), item.get('error')); continue
        if not d.get('language_code', '').startswith('es'):
            print('skip (not Spanish):', d['video_id'], d.get('language_code')); continue
        vid = d['video_id']
        lines = [f"#{d['title']}\t{CHANNELS.get(vid, '')}"]
        for s in d['segments']:
            t = clean(s['text'])
            if t:
                lines.append(f"{round(s['start_ms'] / 1000, 2):g}\t{t}")
        (OUT / f'{vid}.tsv').write_text('\n'.join(lines) + '\n')
        print('ok', vid, len(lines) - 1, 'segments', d.get('kind'))

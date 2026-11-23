"""Bundle es/corpus/*.tsv into es/corpus.js for the search page."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'es'
videos = []
for f in sorted((root / 'corpus').glob('*.tsv')):
    head, *rows = f.read_text().splitlines()
    title, _, channel = head[1:].partition('\t')
    segs = [[float(t), x] for t, _, x in (r.partition('\t') for r in rows) if x]
    videos.append([f.stem, title, channel, segs])
js = 'window.CORPUS=' + json.dumps(videos, ensure_ascii=False, separators=(',', ':')) + ';\n'
(root / 'corpus.js').write_text(js)
print(len(videos), 'videos,', sum(len(v[3]) for v in videos), 'lines,', len(js.encode()) // 1024, 'KB')

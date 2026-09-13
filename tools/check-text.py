"""Check tracked and new text files for forbidden punctuation, including JSON gzip assets."""
from pathlib import Path
import gzip
import re
import subprocess
import sys

failed = []
count = 0
for arg in sys.argv[1:] or [str(Path(__file__).resolve().parents[1])]:
    repo = Path(arg).resolve()
    names = subprocess.check_output(['git', '-C', str(repo), 'ls-files', '--cached', '--others', '--exclude-standard', '-z']).decode().split('\0')
    for name in names:
        if not name:
            continue
        path = repo / name
        if not path.is_file() or path.is_symlink():
            continue
        data = path.read_bytes()
        if name.endswith('.json.gz'):
            data = gzip.decompress(data)
        if b'\0' in data:
            continue
        try:
            text = data.decode('utf-8')
        except UnicodeDecodeError:
            continue
        count += 1
        if chr(8212) in text or (chr(92) + 'u' + format(8212, '04x')) in text.lower() or re.search(r'&(?:mdash|#8212|#x2014);', text, re.I):
            failed.append(str(path))
if failed:
    print('\n'.join(failed))
    sys.exit(1)
print(f'{count} text files checked; no forbidden punctuation found.')

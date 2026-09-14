"""Extract verified official discs and Austin Sierra's mirrored game discs.

Place downloaded archives in ../.work/upstream/TerryArchives and the GamesMirror
checkout in ../.work/upstream/AustinGames. Run from TempleOS-Web before sync-games.
No boot scripts are executed. RedSea and TempleOS compression are decoded as data.
"""
from pathlib import Path
from hashlib import sha256
import json
import sys
from tempfile import TemporaryDirectory
from zipfile import ZipFile
from redsea import files, expand

root = Path(__file__).resolve().parents[1]
upstream = Path(sys.argv[1] if len(sys.argv) > 1 else '../.work/upstream').resolve()
manifest = json.loads((root / 'games/provenance.json').read_text())
expected = {entry['url'].rsplit('/', 1)[1]: entry['sha256'] for entry in manifest['archives']}


def verified(path):
    if sha256(path.read_bytes()).hexdigest() != expected[path.name]:
        raise ValueError('Archive checksum mismatch: ' + str(path))
    return path


def extract(image, output, prefix):
    count = 0
    for path, data in files(image).items():
        if not path.startswith(prefix):
            continue
        name = path[len(prefix):].lstrip('/')
        if not name:
            continue
        if name.endswith('.Z'):
            data = expand(data)
            name = name[:-2]
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        count += 1
    print(f'{count} files: {output}')


for name in ['TempleOS.ISO', 'TOS_Supplemental1.ISO.C', 'TOS_Supplemental2.ISO.C', 'TOS_Supplemental3.ISO.C']:
    extract(verified(upstream / 'TerryArchives' / name), upstream / 'TerryOriginal' / name, '/')

for archive, folder, prefix in [
    ('Ezekiel.ISO_.zip', 'Ezekiel', '/Home/'),
    ('LordofHostsv3.ISO_(1).zip', 'LordOfHosts', '/Home/LD2/'),
    ('Temple.ISO_.C(1).zip', 'Temple', '/Home/Temple/'),
]:
    with ZipFile(verified(upstream / 'AustinGames' / archive)) as zipped, TemporaryDirectory() as temp:
        images = [name for name in zipped.namelist() if name.endswith('.ISO.C')]
        if len(images) != 1:
            raise ValueError('Expected one game disc in ' + archive)
        image = Path(temp) / 'disc.bin'
        image.write_bytes(zipped.read(images[0]))
        extract(image, upstream / 'AustinSources' / folder, prefix)

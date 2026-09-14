"""Known official-disc fixtures, independently verified against the source mirror."""
from pathlib import Path
from hashlib import sha256
import json
import struct
import unittest
from redsea import expand


class CompressionTest(unittest.TestCase):
    def test_original_disc_fixtures(self):
        root = Path(__file__).parent / 'fixtures/redsea'
        for fixture in json.loads((root / 'manifest.json').read_text()):
            with self.subTest(file=fixture['file']):
                packed = (root / fixture['file']).read_bytes()
                self.assertEqual(sha256(packed).hexdigest(), fixture['packedSha256'])
                decoded = expand(packed)
                self.assertEqual(len(decoded), fixture['decodedBytes'])
                self.assertEqual(sha256(decoded).hexdigest(), fixture['decodedSha256'])
                with self.assertRaises(ValueError):
                    expand(packed[:-1])

    def test_raw_and_empty(self):
        for content in [b'', b'HolyC\0\xff']:
            packed = struct.pack('<QQB', 17 + len(content), len(content), 1) + content
            self.assertEqual(expand(packed), content)

    def test_invalid_header(self):
        for packed in [b'', b'\0' * 16, struct.pack('<QQB', 17, 0, 9), struct.pack('<QQB', 17, 2**40, 2)]:
            with self.assertRaises(ValueError):
                expand(packed)


if __name__ == '__main__':
    unittest.main()

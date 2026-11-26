"""Offline maintenance test of the original platform upload contract; no network/install."""
import importlib.util
from pathlib import Path
import os
import sys
import tempfile
from types import ModuleType, SimpleNamespace
from unittest.mock import patch
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('upload', Path(__file__).with_name('upload_h5_cos.py'))
upload = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upload)
calls = []
response = {'code': 'OK', 'data': {'cdn_url': 'https://example.test/dashboard/life-app-1.zip'}}
def post(url, **kwargs):
    calls.append((url, kwargs))
    assert kwargs['files']['file'][1].read() == b'test archive'
    return SimpleNamespace(ok=True, status_code=200, json=lambda: response)
fake = ModuleType('requests')
fake.post = post
with tempfile.TemporaryDirectory() as directory, patch.dict(sys.modules, {'requests': fake}), patch.dict(os.environ, {'AGENTHUB_BASE_URL': 'http://127.0.0.1:8000'}):
    archive = Path(directory) / 'life-app-1.zip'
    archive.write_bytes(b'test archive')
    assert upload.upload_file(archive, 'dashboard/life-app-1.zip') == response['data']['cdn_url']
    url, args = calls[0]
    assert url == 'http://127.0.0.1:8000/builder/api/v1/resource/upload'
    assert args['data'] == {'object_key': 'dashboard/life-app-1.zip'}
    assert args['files']['file'][0] == 'life-app-1.zip'
    assert args['files']['file'][2] == 'application/octet-stream'
    assert args['timeout'] == (10, 120)
    response = {'code': 'ERROR', 'message': 'fixture failure'}
    try:
        upload.upload_file(archive, 'dashboard/life-app-1.zip')
        raise AssertionError('failure accepted')
    except SystemExit:
        pass
    assert len(calls) == 2
assert upload.object_key('', 1) == 'dashboard/life-app-1.zip'
assert upload.object_key('p1', 1) == 'dashboard/p1/life-app-1.zip'
assert upload._base_url('https://example.test/dashboard/life-app-1.zip') == 'https://example.test/dashboard/'
print('PASS original upload contract: endpoint, file/object_key, timeout, CDN result, naming, failure; no real upload')

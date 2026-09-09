import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mediaResponse } from '../electron/media-response.cjs';

test('local video responses support streaming and byte-range seeks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'videe-range-'));
  const file = join(dir, 'movie.mp4');
  await writeFile(file, Buffer.from('0123456789'));
  try {
    const request = range => new Request('http://localhost/movie', { headers: range ? { Range: range } : {} });
    const all = await mediaResponse(request(),file);
    assert.equal(all.headers.get('Accept-Ranges'),'bytes');
    assert.equal(all.headers.get('Content-Type'),'video/mp4');
    assert.equal(await all.text(),'0123456789');
    for (const [range, expected, contentRange] of [
      ['bytes=3-5','345','bytes 3-5/10'],
      ['bytes=6-','6789','bytes 6-9/10'],
      ['bytes=-3','789','bytes 7-9/10'],
      ['bytes=8-99','89','bytes 8-9/10']
    ]) {
      const response = await mediaResponse(request(range),file);
      assert.equal(response.status,206);
      assert.equal(response.headers.get('Content-Range'),contentRange);
      assert.equal(response.headers.get('Content-Length'),String(expected.length));
      assert.equal(await response.text(),expected);
    }
    for(const range of ['bytes=20-','bytes=6-2','bytes=-0','bytes=1-2,4-5','bytes=-']) {
      const response = await mediaResponse(request(range),file);
      assert.equal(response.status,416);
      assert.equal(response.headers.get('Content-Range'),'bytes */10');
    }
    const head = await mediaResponse(new Request('http://localhost/movie',{method:'HEAD'}),file);
    assert.equal(head.headers.get('Content-Length'),'10');
    assert.equal(await head.text(),'');
  } finally { await rm(dir,{recursive:true,force:true}); }
});

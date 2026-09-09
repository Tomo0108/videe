import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, normalizePreferences, nextOnEnded } from '../src/preferences.mjs';
test('malformed settings recover to safe playback and UI values',()=>{
  for(const input of [null,[],false,42,'bad']) assert.deepEqual(normalizePreferences(input),defaults);
  const settings=normalizePreferences({speed:99,volume:7,resume:'false',repeat:'invalid',theme:'invalid',layout:'invalid',sort:'invalid'});
  assert.equal(settings.speed,1);assert.equal(settings.volume,1);assert.equal(settings.resume,true);
  assert.equal(settings.repeat,'off');assert.equal(settings.theme,'system');assert.equal(settings.layout,'grid');
  assert.equal(defaults.motion,true);
  assert.equal(normalizePreferences({motion:false}).motion,false);
  assert.equal(normalizePreferences({motion:'off'}).motion,true);
  assert.equal(normalizePreferences({volume:NaN}).volume,0.8);
  assert.equal(normalizePreferences({volume:-1}).volume,0);
});
test('legacy autoplay migrates to independent auto advance without overriding explicit choices',()=>{
  assert.equal(normalizePreferences({autoplay:false}).autoAdvance,false);
  assert.equal(normalizePreferences({autoplay:false,autoAdvance:true}).autoAdvance,true);
  assert.equal(normalizePreferences({repeat:'all'}).repeat,'all');
});
test('repeat policy covers boundaries, one item, empty queues, and disabled auto advance',()=>{
  assert.equal(nextOnEnded(0,2,'off',false),-1);
  assert.equal(nextOnEnded(0,2,'off',true),1);
  assert.equal(nextOnEnded(1,2,'off',true),-1);
  assert.equal(nextOnEnded(0,2,'one',true),0);
  assert.equal(nextOnEnded(1,2,'all',false),0);
  assert.equal(nextOnEnded(0,1,'all',false),0);
  assert.equal(nextOnEnded(-1,0,'all',true),-1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { isEditableShortcutTarget, isMapShortcutEvent } from '../src/core/shortcut-scope.js';

test('map shortcuts skip all form controls, menus, rich text and editable ancestors', () => {
  for (const tagName of ['INPUT','TEXTAREA','SELECT','BUTTON','SUMMARY'])
    assert.equal(isMapShortcutEvent({ key: 'z' }, { tagName }), false, tagName);
  assert.equal(isEditableShortcutTarget({ tagName:'DIV', isContentEditable:true }), true);
  assert.equal(isEditableShortcutTarget({ tagName:'SPAN', closest:s=>s.includes('contenteditable') ? {}:null }), true);
  assert.equal(isMapShortcutEvent({ key:'Delete', target:{tagName:'INPUT'} }, {tagName:'BODY'}), false);
  assert.equal(isMapShortcutEvent({defaultPrevented:true}, {tagName:'BODY'}), false);
  assert.equal(isMapShortcutEvent({key:'Delete'}, {tagName:'CANVAS'}), true);
  assert.equal(isMapShortcutEvent({key:'Escape'}, {tagName:'BODY'}), true);
});

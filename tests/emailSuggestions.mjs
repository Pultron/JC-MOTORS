import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMAIL_DOMAINS, applySuggestion, buildSuggestions, closestDomain, editDistance, handleSuggestKey, initialSuggestState,
  isOpen, onTextChange, suggestDomains,
} from '../src/validation/emailSuggestions.ts';

test('editDistance', () => {
  assert.equal(editDistance('gmail.com', 'gmail.com'), 0);
  assert.equal(editDistance('gmai.com', 'gmail.com'), 1);
  assert.equal(editDistance('gmial.com', 'gmail.com'), 2);
  assert.equal(editDistance('', 'abc'), 3);
});

test('"@" and "@g" offer domains filtered by what is typed', () => {
  assert.deepEqual(suggestDomains('juan@'), [...EMAIL_DOMAINS]);
  assert.deepEqual(suggestDomains('juan@g'), ['gmail.com']);
  assert.deepEqual(suggestDomains('juan@y'), ['yahoo.com', 'yahoo.com.mx']);
  assert.deepEqual(suggestDomains('juan@OUT'), ['outlook.com', 'outlook.es']);
});

test('no suggestions without a local part, with several @, spaces or no @', () => {
  assert.deepEqual(suggestDomains('juan'), []);
  assert.deepEqual(suggestDomains('@g'), []);
  assert.deepEqual(suggestDomains('a@b@g'), []);
  assert.deepEqual(suggestDomains('ju an@g'), []);
});

test('a valid listed domain generates no suggestion at all', () => {
  assert.deepEqual(buildSuggestions('juan@gmail.com'), []);
  assert.deepEqual(buildSuggestions('juan@yahoo.com'), []);
  assert.deepEqual(buildSuggestions('juan@prodigy.net.mx'), []);
  assert.equal(closestDomain('gmail.com'), null);
});

test('typo correction within edit distance 2', () => {
  for (const [typed, expected] of [['gmai.com', 'gmail.com'], ['gmial.com', 'gmail.com'], ['gnail.com', 'gmail.com'], ['hotmial.com', 'hotmail.com'], ['hotmal.com', 'hotmail.com'], ['outlok.com', 'outlook.com'], ['yaho.com', 'yahoo.com']]) {
    assert.equal(closestDomain(typed), expected, typed);
    assert.deepEqual(buildSuggestions(`juan@${typed}`), [{ kind: 'typo', domain: expected }]);
  }
  assert.equal(closestDomain('empresa-taller.com.mx'), null);
  assert.equal(closestDomain('me.com'), null, 'short provider names are not flagged');
});

test('"juan@g" offers gmail.com as a completion; typo hints appear only when nothing completes', () => {
  assert.deepEqual(buildSuggestions('juan@g'), [{ kind: 'complete', domain: 'gmail.com' }]);
  assert.deepEqual(buildSuggestions('juan@gmial.com'), [{ kind: 'typo', domain: 'gmail.com' }]);
});

test('applySuggestion replaces only the domain and never touches text on its own', () => {
  assert.equal(applySuggestion('juan@g', { kind: 'complete', domain: 'gmail.com' }), 'juan@gmail.com');
  assert.equal(applySuggestion('Juan.Perez@gmial.com', { kind: 'typo', domain: 'gmail.com' }), 'Juan.Perez@gmail.com');
  assert.equal(applySuggestion('sin arroba', { kind: 'typo', domain: 'gmail.com' }), 'sin arroba');
});

function press(state, key, text, extra = {}) {
  return handleSuggestKey(state, { key, ...extra }, text, buildSuggestions(text));
}

test('Tab / Enter accept the active completion and prevent the default action', () => {
  const text = 'juan@g';
  const state = onTextChange(buildSuggestions(text));
  assert.equal(state.active, 0);
  const tab = press(state, 'Tab', text);
  assert.deepEqual(tab.accept, { kind: 'complete', domain: 'gmail.com' });
  assert.equal(tab.preventDefault, true);
  const enter = press(state, 'Enter', text);
  assert.deepEqual(enter.accept, { kind: 'complete', domain: 'gmail.com' });
  assert.equal(enter.preventDefault, true, 'Enter must not submit the form when it accepts');
});

test('Tab and Enter do nothing when the popover is closed, has no active item or Shift is held', () => {
  assert.equal(press(initialSuggestState, 'Tab', 'juan@gmail.com').preventDefault, false);
  assert.equal(press(initialSuggestState, 'Enter', 'juan').accept, null);
  const typoText = 'juan@gmial.com';
  const typoState = onTextChange(buildSuggestions(typoText));
  assert.equal(typoState.active, -1, 'a typo hint is not highlighted by default');
  assert.equal(press(typoState, 'Tab', typoText).accept, null);
  assert.equal(press(typoState, 'Enter', typoText).preventDefault, false);
  const text = 'juan@g';
  assert.equal(press(onTextChange(buildSuggestions(text)), 'Tab', text, { shiftKey: true }).accept, null);
});

test('a typo hint can be reached with the arrows and then accepted', () => {
  const text = 'juan@gmial.com';
  const down = press(onTextChange(buildSuggestions(text)), 'ArrowDown', text);
  assert.equal(down.state.active, 0);
  assert.deepEqual(press(down.state, 'Enter', text).accept, { kind: 'typo', domain: 'gmail.com' });
});

test('arrows move and wrap', () => {
  const text = 'juan@y';
  let state = onTextChange(buildSuggestions(text));
  state = press(state, 'ArrowDown', text).state;
  assert.equal(state.active, 1);
  state = press(state, 'ArrowDown', text).state;
  assert.equal(state.active, 0);
  state = press(state, 'ArrowUp', text).state;
  assert.equal(state.active, 1);
});

test('Escape closes until the text changes', () => {
  const text = 'juan@g';
  const items = buildSuggestions(text);
  const escaped = press(onTextChange(items), 'Escape', text);
  assert.equal(escaped.stopPropagation, true);
  assert.equal(isOpen(escaped.state, text, items), false);
  assert.equal(press(escaped.state, 'Tab', text).accept, null, 'Tab after Esc just moves focus');
  const typed = 'juan@gm';
  assert.equal(isOpen(onTextChange(buildSuggestions(typed)), typed, buildSuggestions(typed)), true);
  assert.equal(press(escaped.state, 'Escape', 'juan').stopPropagation, false, 'Esc with no popover is left to others');
});

test('keys are ignored while an IME is composing', () => {
  const text = 'juan@g';
  const state = onTextChange(buildSuggestions(text));
  assert.equal(press(state, 'Enter', text, { isComposing: true }).accept, null);
  assert.equal(press(state, 'Tab', text, { keyCode: 229 }).preventDefault, false);
});

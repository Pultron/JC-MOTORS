import { writeFile } from 'node:fs/promises';
export async function connect(port = 9223) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const target = targets.find(t => t.type === 'page');
  if (!target) throw new Error('No browser page found');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  /** Console / Log entries reporting a Content Security Policy violation (they survive page navigations). */
  const violations = [];
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.method === 'Log.entryAdded' && /Content Security Policy|Refused to/i.test(msg.params.entry.text)) violations.push(msg.params.entry.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error' && /Content Security Policy|Refused to/i.test(JSON.stringify(msg.params.args))) violations.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
    const call = pending.get(msg.id);
    if (call) { pending.delete(msg.id); msg.error ? call.reject(new Error(JSON.stringify(msg.error))) : call.resolve(msg.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(`Timed out: ${expression}`); };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
  /** Elige una opción de un Select personalizado: abre el combobox y hace clic en la opción por su valor. */
  const pick = async (selector, value) => {
    await click(selector);
    await waitFor(`Boolean(document.querySelector('.mac-listbox [role="option"][data-value=${JSON.stringify(String(value))}]'))`);
    await evaluate(`document.querySelector('.mac-listbox [role="option"][data-value=${JSON.stringify(String(value))}]').click()`);
    await waitFor(`!document.querySelector('.mac-listbox')`);
  };
  const screenshot = async path => { const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(path, Buffer.from(data, 'base64')); };
  await send('Runtime.enable');
  await send('Log.enable');
  // Log.enable replays entries the page logged before we connected: only violations from now on count.
  await new Promise((r) => setTimeout(r, 400));
  violations.length = 0;
  return { send, evaluate, waitFor, click, fill, pick, screenshot, errors, violations, close: () => socket.close() };
}

/*
  The boot screen's task registry: the one place the home page's
  startup work is announced as promises, so the boot log in main.js
  can report real processes instead of running on timers.

  A module that owns a piece of startup work calls
  announceBootTask(name, promise) when the work starts; the promise
  resolves with whatever the log line should say (a duration, a
  cache flag, a clock reading). whenBootTask(name) hands the promise
  back whether the announcement came before or after the ask, which
  matters because the page's modules load in order and the boot log
  is wired up in the first of them.
*/

const announced = new Map();
const waiters = new Map();

export function announceBootTask(name, promise) {
  const settled = Promise.resolve(promise);
  announced.set(name, settled);
  const waiting = waiters.get(name) || [];
  waiters.delete(name);
  for (const resolve of waiting) resolve(settled);
}

export function whenBootTask(name) {
  if (announced.has(name)) return announced.get(name);
  return new Promise((resolve) => {
    const waiting = waiters.get(name) || [];
    waiting.push(resolve);
    waiters.set(name, waiting);
  });
}

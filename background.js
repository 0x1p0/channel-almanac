// Channel Almanac — background service worker.
// All data is read inside the YouTube tab itself; this worker only wires up
// the toolbar button and the keyboard shortcut (Alt+Shift+D, ⌥⇧D on a Mac).

// The shortcut as the browser has it: it depends on the OS and can be changed in the browser's
// shortcut settings, so the panel and the toolbar tooltip ask here instead of hard-coding it.
function getShortcut(done) {
  chrome.commands.getAll(cmds => {
    const c = (cmds || []).find(x => x.name === '_execute_action');
    done(c ? c.shortcut || '' : '');
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'shortcut') return;
  getShortcut(sendResponse);
  return true; // answers asynchronously
});

getShortcut(s => chrome.action.setTitle({ title: s ? `Filter this channel by date (${s})` : 'Filter this channel by date' }));

chrome.action.onClicked.addListener(async tab => {
  if (!tab || tab.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
  } catch (e) {
    // YouTube tabs opened before the extension was installed don't have the panel yet.
    if (!tab.url || !tab.url.startsWith('https://www.youtube.com/')) return;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib.js', 'content.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
    } catch (e2) { /* tab can't be scripted */ }
  }
});

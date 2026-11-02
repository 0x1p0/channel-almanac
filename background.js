// Channel Date Finder — background service worker.
// All data is read inside the YouTube tab itself; this worker only wires up
// the toolbar button and the Alt+Shift+D shortcut.

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

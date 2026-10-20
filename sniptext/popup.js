document.getElementById('snipBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'activateSnip' });
  window.close();
});

const API_BASE = "http://192.168.10.222:5000";

// --- IP Capture Logic ---
chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    if (details.type === 'main_frame' && details.ip) {
      // Store the captured IP for this tab
      const key = `ip_${details.tabId}`;
      chrome.storage.local.set({ [key]: details.ip });
    }
  },
  {urls: ["<all_urls>"]}
);

// Clean up storage when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.remove(`ip_${tabId}`);
});
// ------------------------

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    handleTabUpdate(tabId, tab.url);
  }
});

async function handleTabUpdate(tabId, urlStr) {
  if (!urlStr || urlStr.startsWith('chrome://') || urlStr.startsWith('about:') || urlStr.startsWith('edge://')) {
    return;
  }

  try {
    const url = new URL(urlStr);
    const hostname = url.hostname;

    // 1. Resolve DNS
    const dnsRes = await fetch(`https://dns.google/resolve?name=${hostname}&type=A`);
    const dnsData = await dnsRes.json();

    if (dnsData.Status !== 0 || !dnsData.Answer) return;
    
    const aRecord = dnsData.Answer.find(r => r.type === 1);
    if (!aRecord) return;
    
    const ip = aRecord.data;

    // 2. Get Geo Info
    const apiRes = await fetch(`${API_BASE}/ip?ip=${ip}`);
    const apiData = await apiRes.json();

    if (apiData.success && apiData.data && apiData.data.geo) {
        const countryCode = apiData.data.geo.country_code; // e.g., "US"
        if (countryCode) {
            updateIconToFlag(tabId, countryCode.toLowerCase());
        }
    }

  } catch (e) {
    console.error("Background fetch failed", e);
  }
}

async function updateIconToFlag(tabId, countryCode) {
    try {
        const flagUrl = `https://flagcdn.com/w40/${countryCode}.png`;
        const response = await fetch(flagUrl);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        
        chrome.action.setIcon({
            tabId: tabId,
            imageData: imageData
        });
    } catch (e) {
        console.error("Failed to set flag icon", e);
    }
}

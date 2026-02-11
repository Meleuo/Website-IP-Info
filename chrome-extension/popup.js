document.addEventListener('DOMContentLoaded', function () {
  const loadingDiv = document.getElementById('loading');
  const errorDiv = document.getElementById('error');
  const contentDiv = document.getElementById('content');
  const tabs = document.querySelectorAll('.tab');
  
  let currentMap = null;
  let currentHostname = '';
  let currentTabId = null;

  // --- Helper Functions ---

  const setContent = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text || '-';
  };

  const showError = (msg) => {
    loadingDiv.style.display = 'none';
    contentDiv.style.display = 'none';
    errorDiv.textContent = msg;
    errorDiv.style.display = 'block';
  };

  const showLoading = () => {
      errorDiv.style.display = 'none';
      contentDiv.style.display = 'none';
      loadingDiv.style.display = 'flex';
  };

  const showContent = () => {
    loadingDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    contentDiv.style.display = 'block';
  };

  const initMap = (lat, lon) => {
    if (currentMap) {
        currentMap.remove();
        currentMap = null;
    }
    
    // Create new map
    currentMap = L.map('map').setView([lat, lon], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(currentMap);

    L.Icon.Default.imagePath = 'lib/images/';
    L.marker([lat, lon]).addTo(currentMap)
      .bindPopup(`<b>${lat}, ${lon}</b>`).openPopup();
  };

  const fetchGeoInfo = (ip) => {
    return fetch(`http://192.168.10.222:5000/ip?ip=${ip}`)
      .then(res => res.json())
      .then(apiData => {
         if ((!apiData.success && apiData.code !== 200) || !apiData.data) {
             throw new Error(apiData.message || "API Error");
         }
         return apiData.data.geo;
      });
  };

  const updateUIWithGeo = (geo, ip) => {
      setContent('ip', ip);
      if (geo) {
          setContent('country', `${geo.country} (${geo.country_code})`);
          setContent('city', geo.city);
          setContent('timezone', geo.timezone);
          setContent('coords', `${geo.lat}, ${geo.lon}`);
          
          if (geo.lat && geo.lon) {
              // Delay map init slightly to ensure container is visible/sized
              setTimeout(() => initMap(geo.lat, geo.lon), 100);
          }
      } else {
          setContent('country', 'N/A');
          setContent('city', '-');
          setContent('timezone', '-');
          setContent('coords', '-');
          if (currentMap) {
              currentMap.remove();
              currentMap = null;
          }
          document.getElementById('map').innerHTML = '<div style="padding:20px;text-align:center;color:#666">No Geo Data</div>';
      }
      showContent();
  };

  // --- Data Source Handlers ---

  const handlers = {
      local: async () => {
         // Get IP from storage (captured by webRequest in background.js)
         const result = await chrome.storage.local.get(`ip_${currentTabId}`);
         const ip = result[`ip_${currentTabId}`];
         
         if (!ip) {
             throw new Error("Could not capture local IP. Try refreshing the page.");
         }
         return ip;
      },
      alidns: async () => {
          const res = await fetch(`https://dns.alidns.com/resolve?name=${currentHostname}&type=A`);
          const data = await res.json();
          if (data.Status !== 0) throw new Error("AliDNS resolution failed");
          const record = data.Answer?.find(r => r.type === 1);
          if (!record) throw new Error("AliDNS returned no A records");
          return record.data;
      },
      google: async () => {
          const res = await fetch(`https://dns.google/resolve?name=${currentHostname}&type=A`);
          const data = await res.json();
          if (data.Status !== 0) throw new Error("Google DNS resolution failed");
          const record = data.Answer?.find(r => r.type === 1);
          if (!record) throw new Error("Google DNS returned no A records");
          return record.data;
      }
  };

  const loadData = async (source) => {
      showLoading();
      try {
          const handler = handlers[source];
          if (!handler) throw new Error("Unknown source");
          
          const ip = await handler();
          const geo = await fetchGeoInfo(ip);
          updateUIWithGeo(geo, ip);
      } catch (e) {
          showError(e.message);
      }
  };

  // --- Initialization ---

  // Tab switching logic
  tabs.forEach(tab => {
      tab.addEventListener('click', () => {
          // Update active tab style
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          
          // Load data for selected source
          const source = tab.dataset.source;
          loadData(source);
      });
  });

  // Start
  chrome.tabs.query({ active: true, currentWindow: true }, function (browserTabs) {
    if (!browserTabs || browserTabs.length === 0) {
      showError("No active tab found.");
      return;
    }
    
    currentTabId = browserTabs[0].id;
    const urlStr = browserTabs[0].url;
    
    if (!urlStr || urlStr.startsWith('chrome://') || urlStr.startsWith('about:') || urlStr.startsWith('edge://')) {
      showError("当前未访问任何网站 (No website visited)");
      return;
    }

    try {
        const url = new URL(urlStr);
        currentHostname = url.hostname;
        setContent('domain', currentHostname);

        // Default load: Local
        loadData('local');

    } catch (e) {
        showError("Invalid URL: " + e.message);
    }
  });
});

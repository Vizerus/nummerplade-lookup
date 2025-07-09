import { keyMapping } from './keymapping.js';

const sessionCarCache = {};
const getLS = k => {
  if (k === 'searchHistory') return JSON.parse(localStorage.getItem(k)) || [];
  if (k === 'lastSearch') return JSON.parse(localStorage.getItem(k)) || {};
  return JSON.parse(localStorage.getItem(k)) || { makes: {}, fuel_types: {}, models: {}, years: {} };
};
const setLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const saveHistory = license => {
  let history = getLS('searchHistory');
  if (!history.includes(license)) {
    history.unshift(license);
    if (history.length > 5) history.pop();
    setLS('searchHistory', history);
  }
  displayHistory();
};

const displayHistory = () => {
  const history = getLS('searchHistory');
  const list = document.getElementById('searchHistoryList');
  list.innerHTML = '';
  history.forEach(license => {
    const item = document.createElement('li');
    item.textContent = license;
    item.onclick = () => {
      document.getElementById('license').value = license;
      document.getElementById('licenseForm').dispatchEvent(new Event('submit'));
    };
    list.appendChild(item);
  });
};

const saveInterests = carData => {
  let interests = getLS('userInterests');
  ['make', 'fuel_type', 'model'].forEach(k => {
    if (carData[k]) interests[k + 's'] = { ...interests[k + 's'], [carData[k]]: (interests[k + 's'][carData[k]] || 0) + 1 };
  });
  if (carData.first_registration) {
    const year = carData.first_registration.slice(0, 4);
    interests.years = { ...interests.years, [year]: (interests.years[year] || 0) + 1 };
  }
  setLS('userInterests', interests);
};

const sendFeedback = (license, relevant) => {
  fetch('http://localhost:5000/api/feedback', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ license, relevant }), mode: 'cors'
  })
    .then(r => r.json())
    .then(data => { console.log('Feedback response:', data); localStorage.removeItem('pendingFeedback'); })
    .catch(err => console.error('Error sending feedback:', err));
};

document.addEventListener('DOMContentLoaded', () => {
  displayHistory();
  displayLastSearch();
  console.log('User Interests:', getLS('userInterests'));
  logMostFrequentInterests();
  checkPendingFeedback();
});

document.getElementById('licenseForm').onsubmit = e => {
  e.preventDefault();
  const license = document.getElementById('license').value.toUpperCase().trim();
  if (!/^[A-Z0-9]{2,7}$/.test(license)) return (document.getElementById('error').textContent = 'Invalid plates, 2-7 characters allowed, no special characters allowed');
  fetch('https://v1.motorapi.dk/vehicles/' + license, { headers: { 'X-AUTH-TOKEN': 'TOKEN_HERE' } })
    .then(r => { if (!r.ok) throw new Error('No car found with that plate number'); return r.json(); })
    .then(data => {
      saveHistory(license);
      sessionCarCache[license] = data;
      setLS('lastSearch', { license, data });
      saveInterests(data);
      fetch('http://localhost:5000/api/ping', { method: 'GET', mode: 'cors' })
        .then(() => Promise.all([
          fetch('http://localhost:5000/api/cache_car', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ license, car_data: data }), mode: 'cors' }).then(r => r.json()).then(d => console.log('Cache car response:', d)),
          fetch('http://localhost:5000/api/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ license, valid: true }), mode: 'cors' }).then(r => r.json()).then(d => console.log('Record license response:', d))
        ])).catch(err => console.error('Error updating ML model:', err));
      displayCarInfo(data);
      showFeedbackPrompt(license);
    })
    .catch(err => { console.error(err); document.getElementById('error').textContent = err.message; });
};

function displayCarInfo(data) {
  const table = document.createElement('table');
  Object.entries(data).forEach(([key, val]) => {
    if (!val) return;
    const row = document.createElement('tr');
    let cell = document.createElement('td');
    cell.textContent = keyMapping[key] || key;
    row.appendChild(cell);
    cell = document.createElement('td');
    cell.innerHTML = typeof val === 'object' && val !== null ? Object.entries(val).map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ')}: ${v}<br>`).join('') : val;
    row.appendChild(cell);
    table.appendChild(row);
  });
  const oldTable = document.getElementById('carInfoTable');
  if (oldTable) oldTable.remove();
  table.id = 'carInfoTable';
  document.getElementById('carInfo').appendChild(table);
}

function displayLastSearch() {
  const lastSearch = getLS('lastSearch');
  if (lastSearch.license) {
    document.getElementById('license').value = lastSearch.license;
    displayCarInfo(lastSearch.data);
  }
}

document.getElementById('recognizeButton').onclick = () => {
  const imgFile = document.getElementById('licenseImage').files[0];
  if (!imgFile) return (document.getElementById('error').textContent = 'No image uploaded');
  document.getElementById('progress').style.display = 'block';
  document.getElementById('progressText').textContent = 'Loading image...';
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      document.getElementById('progressText').textContent = 'Initializing OCR...';
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const aspectRatio = img.width / img.height;
      const targetHeight = 480;
      const targetWidth = targetHeight * aspectRatio;
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      Tesseract.recognize(canvas.toDataURL(), 'eng', {
        logger: m => m.status === 'recognizing text' && (document.getElementById('progressText').textContent = `Recognizing text: ${Math.round(m.progress * 100)}%`)
      }).then(({ data }) => {
        document.getElementById('progress').style.display = 'none';
        const recognized = data.text.trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
        document.getElementById('license').value = recognized;
        const avgConfidence = data.words.reduce((acc, w) => acc + w.confidence, 0) / data.words.length;
        document.getElementById('error').textContent = avgConfidence < 85 ? 'Low confidence in text recognition, please verify the plate number.' : '';
      }).catch(err => {
        document.getElementById('progress').style.display = 'none';
        document.getElementById('error').textContent = 'Error processing image';
        console.error(err);
      });
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(imgFile);
};

document.getElementById('license').oninput = function () {
  const partialLicense = this.value.toUpperCase().trim();
  if (partialLicense.length) {
    fetch('http://localhost:5000/api/predict', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license: partialLicense, most_frequent_interests: getMostFrequentInterests(), search_history: getLS('searchHistory') })
    })
      .then(r => r.json())
      .then(data => displaySuggestions(data.predictions, partialLicense))
      .catch(err => console.error('Error fetching suggestions:', err));
  } else clearSuggestions();
};

const getMostFrequentInterests = () => {
  const interests = getLS('userInterests');
  const mostFrequent = {};
  for (let cat in interests) {
    let max = 0, mf = null;
    for (let item in interests[cat]) if (interests[cat][item] > max) max = interests[cat][item], mf = item;
    mostFrequent[cat.slice(0, -1)] = mf;
  }
  return mostFrequent;
};

function displaySuggestions(predictions) {
  clearSuggestions();
  if (!predictions.length) return;
  let suggestionsDiv = document.getElementById('suggestions');
  if (!suggestionsDiv) {
    suggestionsDiv = document.createElement('div');
    suggestionsDiv.id = 'suggestions';
    document.getElementById('license').parentNode.insertBefore(suggestionsDiv, document.getElementById('license').nextSibling);
  }
  let highestConfidence = 0, highestConfidencePlate = '';
  predictions.forEach(({ plate, confidence }) => {
    if (confidence > highestConfidence) highestConfidence = confidence, highestConfidencePlate = plate;
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.innerHTML = `${plate} <span>${confidence >= 90 ? '★★★' : confidence >= 60 ? '★★' : '★'}</span>`;
    item.onclick = () => { document.getElementById('license').value = plate; clearSuggestions(); };
    suggestionsDiv.appendChild(item);
  });
  if (highestConfidencePlate) document.getElementById('license').placeholder = highestConfidencePlate;
  if (highestConfidence < 40) {
    const warning = document.createElement('div');
    warning.className = 'suggestion-item';
    warning.style.color = 'red';
    warning.textContent = 'Add more input to increase confidence';
    document.getElementById('license').parentNode.insertBefore(warning, document.getElementById('license'));
  }
}

function clearSuggestions() {
  const suggestionsDiv = document.getElementById('suggestions');
  if (suggestionsDiv) suggestionsDiv.innerHTML = '';
  const warning = document.querySelector('.suggestion-item[style="color: red;"]');
  if (warning) warning.remove();
}

document.getElementById('forgetPreferencesButton').onclick = () => {
  ['searchHistory', 'lastSearch', 'userInterests', 'pendingFeedback'].forEach(k => localStorage.removeItem(k));
  displayHistory();
  document.getElementById('carInfo').innerHTML = '';
  document.getElementById('license').value = '';
  console.log('User preferences have been forgotten.');
};

const logMostFrequentInterests = () => {
  const interests = getLS('userInterests');
  const mostFrequent = {};
  for (let cat in interests) {
    let max = 0, mf = null;
    for (let item in interests[cat]) if (interests[cat][item] > max) max = interests[cat][item], mf = item;
    mostFrequent[cat] = mf;
  }
  console.log('Most Frequent User Interests:', mostFrequent);
};

function showFeedbackPrompt(license) {
  const feedbackDiv = document.createElement('div');
  feedbackDiv.id = 'feedbackPrompt';
  feedbackDiv.innerHTML = `<p>Was the recommended plate ${license} relevant to you?</p>`;
  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'buttons';
  ['Yes', 'No'].forEach((txt, i) => {
    const btn = document.createElement('button');
    btn.textContent = txt;
    btn.onclick = () => {
      sendFeedback(license, i === 0);
      document.body.removeChild(feedbackDiv);
      document.removeEventListener('click', handleClickOutside);
    };
    buttonsDiv.appendChild(btn);
  });
  feedbackDiv.appendChild(buttonsDiv);
  document.body.appendChild(feedbackDiv);
  localStorage.setItem('pendingFeedback', license);
  function handleClickOutside(e) {
    if (!feedbackDiv.contains(e.target)) {
      document.body.removeChild(feedbackDiv);
      document.removeEventListener('click', handleClickOutside);
    }
  }
  setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
}

function checkPendingFeedback() {
  const pendingFeedback = localStorage.getItem('pendingFeedback');
  if (pendingFeedback) showFeedbackPrompt(pendingFeedback);
}
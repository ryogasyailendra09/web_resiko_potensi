const iconMap = { people: '◉', land: '⌂', fruit: '✦', alert: '!', rain: '∿', sun: '○', leaf: '⌁', community: '◎' };

async function loadDashboard() {
  const response = await fetch('/api/dashboard');
  if (!response.ok) throw new Error('Data dashboard tidak dapat dimuat');
  return response.json();
}

const el = (id) => document.getElementById(id);

function render(data) {
  el('stats').innerHTML = data.stats.map((item) => `<article class="stat-card"><div class="stat-icon">${iconMap[item.icon] || '•'}</div><strong class="stat-value">${item.value}</strong><span class="stat-label">${item.label}</span><span class="stat-note">${item.note}</span></article>`).join('');
  el('seasons').innerHTML = data.seasons.map((item) => `<article class="season-card ${item.tone}"><div class="season-title"><h3>${iconMap[item.icon]} ${item.name}</h3><span>${item.period}</span></div><p class="season-trigger">${item.trigger}</p><ul>${item.effects.map((effect) => `<li>${effect}</li>`).join('')}</ul></article>`).join('');
  el('risks').innerHTML = data.risks.map((item) => `<article class="risk-item"><div><h3>${item.title}</h3><p>${item.detail}</p><small>${item.area} · ${item.level}</small><div class="risk-bar"><div class="risk-fill" style="--score:${item.score}%;--tone:var(--${item.color})"></div></div></div><div class="risk-score">${item.score}<small>/ 100</small></div></article>`).join('');
  el('potentials').innerHTML = data.potentials.map((item) => `<article class="potential-card"><span class="potential-number">${item.number}</span><span class="tag">${item.tag}</span><h3>${iconMap[item.icon]} ${item.title}</h3><p>${item.detail}</p></article>`).join('');
  el('programs').innerHTML = data.programs.map((item, index) => `<article class="program-item"><span class="program-index">0${index + 1}</span><div><h3>${item.title}</h3><span class="program-type">${item.type}</span></div><p>${item.detail}</p></article>`).join('');
  el('kkn').innerHTML = data.kkn.map((item) => `<article class="timeline-item"><span class="timeline-year">${item.year}</span><h3>${item.title}</h3><p>${item.detail}</p></article>`).join('');
  el('source-file').textContent = data.source.file;
  el('source-count').textContent = `${data.sources.length} sumber terindeks · ${data.source.characters.toLocaleString('id-ID')} karakter`; 
  renderSources(data.sources);
  el('source-filter').addEventListener('input', (event) => { const query = event.target.value.toLowerCase(); renderSources(data.sources.filter((source) => `${source.group} ${source.name}`.toLowerCase().includes(query))); });
}

function renderSources(sources) { el('sources').innerHTML = sources.map((source) => `<div class="source-item"><span>${source.group}</span><a href="${source.url}" target="_blank" rel="noreferrer">${source.name} <b class="source-arrow">↗</b></a></div>`).join('') || '<p class="body-copy">Sumber tidak ditemukan.</p>'; }

loadDashboard().then(render).catch((error) => { document.querySelector('main').innerHTML = `<section class="section-wrap" style="padding:100px 0"><h1>Data belum siap</h1><p>${error.message}</p></section>`; });
'use strict';
const $ = id => document.getElementById(id);
let unit = 'cm';
let mode = 'count';
const format = value => new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 2}).format(value);
function parseNumber(value) {
  const text = value.trim().replace(',', '.');
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
}
function calculateLayout(width, slat, count, target, selectedMode) {
  if (!Number.isFinite(width) || width <= 0) throw new Error('Podaj szerokość segmentu większą od zera.');
  if (!Number.isFinite(slat) || slat <= 0) throw new Error('Podaj szerokość szczebelka większą od zera.');
  if (slat > width) throw new Error('Szczebelek nie może być szerszy od segmentu.');
  if (selectedMode === 'gap') {
    if (!Number.isFinite(target) || target <= 0) throw new Error('Podaj maksymalną szerokość przerwy większą od zera.');
    count = Math.max(1, Math.ceil((width - target) / (slat + target) - 1e-12));
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new Error('Liczba szczebelków musi być liczbą całkowitą od 1 do 1000.');
  const remaining = width - count * slat;
  if (remaining < -Math.max(width, 1) * 1e-12) throw new Error(selectedMode === 'gap' ? 'Nie da się uzyskać tak małej przerwy. Zmień szerokość szczebelka lub maksymalną przerwę.' : 'Szczebelki nie mieszczą się w segmencie. Zmniejsz ich liczbę lub szerokość.');
  const gap = Math.max(0, remaining) / (count + 1);
  if (selectedMode === 'gap' && gap > target + Math.max(width, 1) * 1e-12) throw new Error('Nie można uzyskać wskazanej przerwy przy tych wymiarach.');
  return {width, slat, count, gap, gaps: count + 1};
}
function showError(message) {
  $('error').textContent = message;
  $('error').hidden = false;
  $('result-content').hidden = true;
  $('preview-content').hidden = true;
  $('positions-section').hidden = true;
  $('result-tag').textContent = 'Sprawdź wymiary';
}
function update() {
  try {
    const result = calculateLayout(parseNumber($('width').value), parseNumber($('slat').value), parseNumber($('count').value), parseNumber($('target').value), mode);
    $('error').hidden = true;
    $('result-content').hidden = false;
    $('preview-content').hidden = false;
    $('positions-section').hidden = false;
    $('result-tag').innerHTML = '<i></i> ' + (result.gap === 0 ? 'Brak wolnej przestrzeni' : 'Gotowe do budowy');
    $('gap-result').textContent = format(result.gap);
    document.querySelector('.result-unit').textContent = unit;
    $('count-result').innerHTML = result.count + ' <small>szt.</small>';
    $('gaps-result').innerHTML = result.gaps + ' <small>szt.</small>';
    $('width-result').innerHTML = format(result.width) + ' <small>' + unit + '</small>';
    $('dimension').textContent = format(result.width) + ' ' + unit;
    $('legend-width').textContent = format(result.slat) + ' ' + unit;
    $('legend-gap').textContent = format(result.gap) + ' ' + unit;
    $('precision-note').textContent = result.gap === 0 ? 'Szczebelki wypełniają cały segment. Przerwy wynoszą 0.' : 'Do wyznaczania pozycji używaj dokładnego wyniku, nie sumy zaokrąglonych przerw.';
    const slats = document.createDocumentFragment();
    const rows = document.createDocumentFragment();
    for (let index = 0; index < result.count; index++) {
      const left = result.gap + index * (result.slat + result.gap);
      const item = document.createElement('div');
      item.className = 'slat';
      item.style.left = (left / result.width * 100) + '%';
      item.style.width = (result.slat / result.width * 100) + '%';
      slats.append(item);
      const row = document.createElement('tr');
      [String(index + 1), format(left) + ' ' + unit, format(left + result.slat) + ' ' + unit].forEach(text => {
        const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
      });
      rows.append(row);
    }
    $('slats').replaceChildren(slats);
    $('slats').setAttribute('role', 'img');
    $('slats').setAttribute('aria-label', result.count + ' szczebelków, równe przerwy po ' + format(result.gap) + ' ' + unit);
    $('positions').replaceChildren(rows);
  } catch (error) { showError(error.message); }
}
$('calculator-form').addEventListener('submit', event => { event.preventDefault(); update(); });
['width', 'slat', 'count', 'target'].forEach(id => $(id).addEventListener('input', update));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(item => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  $('count-field').hidden = mode !== 'count';
  $('gap-field').hidden = mode !== 'gap';
  update();
}));
document.querySelectorAll('[data-unit]').forEach(button => button.addEventListener('click', () => {
  const next = button.dataset.unit;
  if (next === unit) return;
  const factor = next === 'mm' ? 10 : 0.1;
  ['width', 'slat', 'target'].forEach(id => { const value = parseNumber($(id).value); if (Number.isFinite(value)) $(id).value = String(Number((value * factor).toPrecision(12))).replace('.', ','); });
  unit = next;
  document.querySelectorAll('[data-unit]').forEach(item => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  document.querySelectorAll('.unit').forEach(item => item.textContent = unit);
  update();
}));
$('decrease').addEventListener('click', () => { $('count').value = Math.max(1, (parseNumber($('count').value) || 1) - 1); update(); });
$('increase').addEventListener('click', () => { $('count').value = Math.min(1000, (parseNumber($('count').value) || 0) + 1); update(); });
update();

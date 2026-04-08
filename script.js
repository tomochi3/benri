const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const youbi = ['日', '月', '火', '水', '木', '金', '土'];
const CHOUSEISAN_CREATE_URL = 'https://chouseisan.com/schedule/newEvent/create';
const QUICK_EVENT_TITLE = '金曜夜・土日で空いてる時間を教えてください';
const QUICK_EVENT_COMMENT = '当日から2ヶ月先の金曜夜と土日で、空いている日や時間帯を教えてください。';

function pad2(n) {
	return String(n).padStart(2, '0');
}

function fmtDateLine(d, label) {
	const M = d.getMonth() + 1;
	const D = d.getDate();
	const w = youbi[d.getDay()];
	return `${M}/${D}(${w}) ${label}`.trim();
}

function addMonths(date, months) {
	const d = new Date(date.getTime());
	const day = d.getDate();
	d.setMonth(d.getMonth() + months);
	// 月末超過の調整（例: 1/31 +1ヶ月 → 3/2 にならないように）
	while (d.getDate() < day) {
		d.setDate(d.getDate() - 1);
	}
	return d;
}

function toISODateInputValue(d) {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseISODateInputValue(value) {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day);
}

function showToast(msg) {
	const t = $('#toast');
	t.textContent = msg;
	t.classList.add('show');
	setTimeout(() => t.classList.remove('show'), 1600);
}

async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch (e) {
		// フォールバック
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.style.position = 'fixed';
		ta.style.left = '-1000px';
		document.body.appendChild(ta);
		ta.select();
		const ok = document.execCommand('copy');
		document.body.removeChild(ta);
		return ok;
	}
}

function loadPrefs() {
	try {
		const raw = localStorage.getItem('chousei-prefs');
		if (!raw) return null;
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function savePrefs(obj) {
	try {
		localStorage.setItem('chousei-prefs', JSON.stringify(obj));
	} catch {}
}

function buildCandidateLines({ startDate, months, incFri, incSat, incSun, friTime, weekendMode }) {
	const endDate = addMonths(startDate, months);
	const lines = [];
	const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

	while (d < endDate) {
		const day = d.getDay();
		if (incFri && day === 5) {
			lines.push(fmtDateLine(d, `${friTime}～`));
		}
		if (incSat && day === 6) {
			if (weekendMode === 'split') {
				lines.push(fmtDateLine(d, '9:00～13:00'));
				lines.push(fmtDateLine(d, '13:00～17:00'));
			} else {
				lines.push(fmtDateLine(d, '終日'));
			}
		}
		if (incSun && day === 0) {
			if (weekendMode === 'split') {
				lines.push(fmtDateLine(d, '9:00～13:00'));
				lines.push(fmtDateLine(d, '13:00～17:00'));
			} else {
				lines.push(fmtDateLine(d, '終日'));
			}
		}
		d.setDate(d.getDate() + 1);
	}

	return lines;
}

function readFormSettings() {
	return {
		startDate: parseISODateInputValue($('#startDate').value),
		months: parseInt($('#months').value, 10),
		incFri: $('#incFri').checked,
		incSat: $('#incSat').checked,
		incSun: $('#incSun').checked,
		friTime: $('#friTime').value || '19:00',
		weekendMode: $('#weekendMode').value
	};
}

function persistCurrentPrefs(settings) {
	savePrefs({
		title: $('#title').value || '',
		startDate: $('#startDate').value,
		months: settings.months,
		friTime: settings.friTime,
		incFri: settings.incFri,
		incSat: settings.incSat,
		incSun: settings.incSun,
		weekendMode: settings.weekendMode
	});
}

function updatePreview(lines) {
	$('#preview').value = lines.join('\n');
	const has = lines.length > 0;
	$('#copyBtn').disabled = !has;
	$('#copyOpenBtn').disabled = !has;
	return has;
}

function generate() {
	const settings = readFormSettings();
	const lines = buildCandidateLines(settings);
	updatePreview(lines);
	persistCurrentPrefs(settings);
	syncToggleChips();
	return lines;
}

function openPrefilledChouseisan({ title, comment, lines, suffix = '19:00〜', addSuffix = true }) {
	if (!lines.length) {
		showToast('開く候補がありません');
		return;
	}

	const form = document.createElement('form');
	form.method = 'post';
	form.action = CHOUSEISAN_CREATE_URL;
	form.target = '_blank';
	form.style.display = 'none';

	const fields = {
		name: title,
		comment,
		kouho: lines.join('\n'),
		suffix,
		add_suffix: addSuffix ? '1' : '0'
	};

	Object.entries(fields).forEach(([name, value]) => {
		const input = document.createElement('input');
		input.type = 'hidden';
		input.name = name;
		input.value = value;
		form.appendChild(input);
	});

	document.body.appendChild(form);
	form.submit();
	form.remove();
	showToast('候補入りの調整さんを開いています');
}

function buildDetailedEventComment(title) {
	if (!title) return QUICK_EVENT_COMMENT;
	return `${title}の日程調整です。ご都合のよい日を教えてください。`;
}

function syncToggleChips() {
	$$('.toggle-chip').forEach((chip) => {
		const input = chip.querySelector('input');
		chip.classList.toggle('is-active', !!input?.checked);
	});
}

function applyPreset({ weekendMode }) {
	const today = new Date();
	$('#startDate').value = toISODateInputValue(today);
	$('#months').value = '2';
	$('#friTime').value = '19:00';
	$('#incFri').checked = true;
	$('#incSat').checked = true;
	$('#incSun').checked = true;
	$('#weekendMode').value = weekendMode;
	generate();
}

async function copyOnly() {
	const text = $('#preview').value.trim();
	if (!text) {
		showToast('コピーする候補がありません');
		return;
	}
	const ok = await copyText(text);
	showToast(ok ? 'コピーしました' : 'コピーに失敗しました');
}

function openDetailedChouseisan() {
	const lines = generate();
	const title = ($('#title').value || '').trim() || QUICK_EVENT_TITLE;
	openPrefilledChouseisan({
		title,
		comment: buildDetailedEventComment(title),
		lines,
		suffix: `${$('#friTime').value || '19:00'}〜`,
		addSuffix: false
	});
}

function launchQuickAllDayChouseisan() {
	applyPreset({ weekendMode: 'allDay' });
	openDetailedChouseisan();
}

function launchQuickSplitChouseisan() {
	applyPreset({ weekendMode: 'split' });
	openDetailedChouseisan();
}

(function init() {
	const today = new Date();
	$('#startDate').value = toISODateInputValue(today);
	const prefs = loadPrefs();

	if (prefs) {
		if (prefs.title) $('#title').value = prefs.title;
		if (prefs.startDate) $('#startDate').value = prefs.startDate;
		if (prefs.months) $('#months').value = String(prefs.months);
		if (prefs.friTime) $('#friTime').value = prefs.friTime;
		if ('incFri' in prefs) $('#incFri').checked = !!prefs.incFri;
		if ('incSat' in prefs) $('#incSat').checked = !!prefs.incSat;
		if ('incSun' in prefs) $('#incSun').checked = !!prefs.incSun;
		if (prefs.weekendMode) $('#weekendMode').value = prefs.weekendMode;
	}

	$('#copyBtn').addEventListener('click', copyOnly);
	$('#copyOpenBtn').addEventListener('click', openDetailedChouseisan);
	$('#quickLaunchAllDayBtn').addEventListener('click', launchQuickAllDayChouseisan);
	$('#quickLaunchSplitBtn').addEventListener('click', launchQuickSplitChouseisan);
	['title', 'startDate', 'months', 'friTime', 'weekendMode', 'incFri', 'incSat', 'incSun'].forEach((id) => {
		$(id.startsWith('#') ? id : `#${id}`).addEventListener(id === 'title' || id === 'friTime' ? 'input' : 'change', generate);
	});

	generate();
})();

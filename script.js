const $ = (s) => document.querySelector(s);
const youbi = ['日', '月', '火', '水', '木', '金', '土'];
const CHOUSEISAN_CREATE_URL = 'https://chouseisan.com/schedule/newEvent/create';
const RAKUTEN_MAIL_UNSUBSCRIBE_URL = 'https://emagazine.rakuten.co.jp/ns?act=chg_data';
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

function showToast(msg) {
	const t = $('#toast');
	t.textContent = msg;
	t.classList.add('show');
	setTimeout(() => t.classList.remove('show'), 1600);
}

function openExternalUrl(url) {
	const opened = window.open(url, '_blank', 'noopener');
	if (!opened) {
		window.location.href = url;
	}
}

function buildCandidateLines({ startDate, months, friTime, weekendMode }) {
	const endDate = addMonths(startDate, months);
	const lines = [];
	const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

	while (d < endDate) {
		const day = d.getDay();
		if (day === 5) {
			lines.push(fmtDateLine(d, `${friTime}～`));
		}
		if (day === 6) {
			if (weekendMode === 'split') {
				lines.push(fmtDateLine(d, '9:00～13:00'));
				lines.push(fmtDateLine(d, '13:00～17:00'));
			} else {
				lines.push(fmtDateLine(d, '終日'));
			}
		}
		if (day === 0) {
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

function openQuickChouseisan(weekendMode) {
	const lines = buildCandidateLines({
		startDate: new Date(),
		months: 2,
		friTime: '19:00',
		weekendMode
	});
	openPrefilledChouseisan({
		title: QUICK_EVENT_TITLE,
		comment: buildDetailedEventComment(QUICK_EVENT_TITLE),
		lines,
		suffix: '19:00〜',
		addSuffix: false
	});
}

function launchQuickAllDayChouseisan() {
	openQuickChouseisan('allDay');
}

function launchQuickSplitChouseisan() {
	openQuickChouseisan('split');
}

function openRakutenUnsubscribe() {
	openExternalUrl(RAKUTEN_MAIL_UNSUBSCRIBE_URL);
	showToast('楽天メルマガの停止ページを開いています');
}

/* ── RM換算表 ─────────────────────────── */

const RM_CONFIG = {
	bench: {
		divisor: 40,
		formula: '最大挙上重量 ＝ 重量 × 回数 ÷ 40 ＋ 重量'
	},
	squat: {
		divisor: 33.3,
		formula: '最大挙上重量 ＝ 重量 × 回数 ÷ 33.3 ＋ 重量'
	}
};

const RM_REPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

let rmCurrentTab = 'bench';

function calcRM(weight, reps, divisor) {
	if (reps <= 0) return weight;
	return weight * reps / divisor + weight;
}

function roundTo1(n) {
	return Math.round(n * 10) / 10;
}

function getLevel(val) {
	if (val < 30) return 'rm-lv1';
	if (val < 60) return 'rm-lv2';
	if (val < 90) return 'rm-lv3';
	if (val < 120) return 'rm-lv4';
	if (val < 160) return 'rm-lv5';
	if (val < 200) return 'rm-lv6';
	return 'rm-lv7';
}

function buildRmTable() {
	const minEl = $('#rmRangeMin');
	const maxEl = $('#rmRangeMax');
	if (!minEl || !maxEl) return;

	let min = parseFloat(minEl.value) || 20;
	let max = parseFloat(maxEl.value) || 200;

	min = Math.round(min / 2.5) * 2.5;
	max = Math.round(max / 2.5) * 2.5;
	if (min > max) { const t = min; min = max; max = t; }
	if (min < 0) min = 0;

	const maxRows = 200;
	const steps = Math.round((max - min) / 2.5) + 1;
	if (steps > maxRows) {
		max = min + (maxRows - 1) * 2.5;
	}

	const config = RM_CONFIG[rmCurrentTab];

	// ヘッダー
	const thead = $('#rmTableHead');
	let headHtml = '<tr><th>重量<small>kg</small></th>';
	RM_REPS.forEach(r => {
		headHtml += `<th>${r}<small>回</small></th>`;
	});
	headHtml += '</tr>';
	thead.innerHTML = headHtml;

	// ボディ
	const tbody = $('#rmTableBody');
	let bodyHtml = '';

	for (let w = min; w <= max; w = Math.round((w + 2.5) * 10) / 10) {
		const is10k = w % 10 === 0;
		const rowClass = is10k ? ' class="rm-row-10k"' : '';
		bodyHtml += `<tr${rowClass}>`;
		bodyHtml += `<td>${w}<small>kg</small></td>`;

		RM_REPS.forEach(r => {
			const rm = calcRM(w, r, config.divisor);
			const val = roundTo1(rm);
			const lv = getLevel(val);
			const cls = r === 1 ? `${lv} rm-cell-1rm` : lv;
			bodyHtml += `<td class="${cls}">${val}</td>`;
		});

		bodyHtml += '</tr>';
	}

	tbody.innerHTML = bodyHtml;

	const formulaExpr = $('#rmFormulaExpr');
	if (formulaExpr) {
		formulaExpr.textContent = config.formula;
	}
}

function switchRmTab(tab) {
	rmCurrentTab = tab;

	// タブのアクティブ状態を更新
	document.querySelectorAll('.rm-tab').forEach(btn => {
		btn.classList.toggle('is-active', btn.dataset.tab === tab);
	});

	buildRmTable();
}

(function init() {
	$('#quickLaunchAllDayBtn').addEventListener('click', launchQuickAllDayChouseisan);
	$('#quickLaunchSplitBtn').addEventListener('click', launchQuickSplitChouseisan);
	$('#openRakutenUnsubscribeBtn').addEventListener('click', openRakutenUnsubscribe);

	// RM換算表の初期化
	const tabBench = $('#rmTabBench');
	const tabSquat = $('#rmTabSquat');
	const rangeMin = $('#rmRangeMin');
	const rangeMax = $('#rmRangeMax');

	if (tabBench && tabSquat) {
		tabBench.addEventListener('click', () => switchRmTab('bench'));
		tabSquat.addEventListener('click', () => switchRmTab('squat'));
	}

	if (rangeMin && rangeMax) {
		let debounceTimer;
		const debouncedBuild = () => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(buildRmTable, 300);
		};
		rangeMin.addEventListener('input', debouncedBuild);
		rangeMax.addEventListener('input', debouncedBuild);
	}

	// 初回テーブル生成
	buildRmTable();
})();

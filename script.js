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
	// 月末超過の調整(例: 1/31 +1ヶ月 → 3/2 にならないように)
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

// 選択状態は行・列のインデックスではなく「重量×回数」の値で保持する。
// タブ切替や範囲変更でテーブルが再生成されても、同じ意味のセルに復元できる。
let rmSelectedWeight = null;
let rmSelectedReps = null;

const RM_DEFAULTS = {
	bench: { min: 50, max: 100 },
	squat: { min: 80, max: 120 }
};

function saveRmRange(tab, min, max) {
	try { localStorage.setItem(`rm_range_${tab}`, JSON.stringify({ min, max })); } catch (e) { /* ignore */ }
}

function loadRmRange(tab) {
	try {
		const saved = localStorage.getItem(`rm_range_${tab}`);
		if (saved) {
			const parsed = JSON.parse(saved);
			if (typeof parsed.min === 'number' && typeof parsed.max === 'number') return parsed;
		}
	} catch (e) { /* ignore */ }
	return RM_DEFAULTS[tab] || { min: 20, max: 200 };
}

function saveRmTab(tab) {
	try { localStorage.setItem('rm_active_tab', tab); } catch (e) { /* ignore */ }
}

function loadRmTab() {
	try { return localStorage.getItem('rm_active_tab') || 'bench'; } catch (e) { return 'bench'; }
}

function calcRM(weight, reps, divisor) {
	if (reps <= 0) return weight;
	return weight * reps / divisor + weight;
}

function roundTo1(n) {
	return Math.round(n);
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

/* ── ハイライト(ホバーでプレビュー、クリック/矢印キーで固定) ── */

function rmGetTable() {
	return $('#rmTable');
}

function clearRmHighlights() {
	const table = rmGetTable();
	if (!table) return;
	table.querySelectorAll('.rm-highlight-col, .rm-highlight-row, .rm-highlight-cell').forEach(el => {
		el.classList.remove('rm-highlight-col', 'rm-highlight-row', 'rm-highlight-cell');
	});
}

// colIdx は 0 始まりのセル位置(0 は重量列)、row は tr 要素
function applyRmHighlights(colIdx, row) {
	clearRmHighlights();
	const table = rmGetTable();
	if (!table) return;

	if (colIdx != null && colIdx > 0) {
		const ths = table.tHead?.rows[0]?.children || [];
		if (ths[colIdx]) ths[colIdx].classList.add('rm-highlight-col');
		table.querySelectorAll(`tbody tr td:nth-child(${colIdx + 1})`).forEach(td => td.classList.add('rm-highlight-col'));
	}

	if (row) {
		row.classList.add('rm-highlight-row');
		if (colIdx != null && colIdx > 0) {
			const cross = row.children[colIdx];
			if (cross) cross.classList.add('rm-highlight-cell');
		}
	}
}

function rmRowForWeight(weight) {
	const table = rmGetTable();
	const tbody = table && table.tBodies[0];
	if (!tbody || weight == null) return null;
	return tbody.querySelector(`tr[data-weight="${weight}"]`);
}

// 保持している選択値を現在のテーブルに適用する。
// 再生成後に選択値がテーブルに存在しなければ、その選択は破棄する。
function applySelectedRmHighlights() {
	let row = null;
	let colIdx = null;

	if (rmSelectedWeight != null) {
		row = rmRowForWeight(rmSelectedWeight);
		if (!row) {
			// 選択していた重量が範囲外になったら、セル選択はまとめて解除する
			rmSelectedWeight = null;
			rmSelectedReps = null;
		}
	}
	if (rmSelectedReps != null) {
		const i = RM_REPS.indexOf(rmSelectedReps);
		if (i === -1) rmSelectedReps = null;
		else colIdx = i + 1;
	}

	applyRmHighlights(colIdx, row);
}

// スクリーンリーダー向けに選択内容を通知
function announceRmSelection() {
	const live = $('#rmLive');
	if (!live) return;
	if (rmSelectedWeight != null && rmSelectedReps != null) {
		const row = rmRowForWeight(rmSelectedWeight);
		const val = row?.children[RM_REPS.indexOf(rmSelectedReps) + 1]?.textContent || '';
		live.textContent = `${rmSelectedWeight}kg × ${rmSelectedReps}回 → 推定 ${val}kg`;
	} else if (rmSelectedReps != null) {
		live.textContent = `${rmSelectedReps}回の列を選択しました`;
	} else if (rmSelectedWeight != null) {
		live.textContent = `${rmSelectedWeight}kgの行を選択しました`;
	} else {
		live.textContent = '選択を解除しました';
	}
}

function buildRmTable() {
	const minEl = $('#rmRangeMin');
	const maxEl = $('#rmRangeMax');
	if (!minEl || !maxEl) return;

	const minRaw = parseFloat(minEl.value);
	const maxRaw = parseFloat(maxEl.value);
	let min = Number.isFinite(minRaw) ? minRaw : 20;
	let max = Number.isFinite(maxRaw) ? maxRaw : 200;

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
	let headHtml = '<tr><th scope="col">重量<small>kg</small></th>';
	RM_REPS.forEach(r => {
		headHtml += `<th scope="col" data-reps="${r}">${r}<small>回</small></th>`;
	});
	headHtml += '</tr>';
	thead.innerHTML = headHtml;

	// ボディ
	const tbody = $('#rmTableBody');
	let bodyHtml = '';

	for (let w = min; w <= max; w = Math.round((w + 2.5) * 10) / 10) {
		const is10k = w % 10 === 0;
		const rowClass = is10k ? ' class="rm-row-10k"' : '';
		bodyHtml += `<tr${rowClass} data-weight="${w}">`;
		bodyHtml += `<th scope="row">${w}<small>kg</small></th>`;

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

	// テーブルを再生成した後でも、選択状態(重量×回数)を復元
	applySelectedRmHighlights();
}

function switchRmTab(tab, isInit = false) {
	// 現タブの値を保存(初回呼び出し時はスキップ)
	if (!isInit) {
		const curMin = $('#rmRangeMin');
		const curMax = $('#rmRangeMax');
		if (curMin && curMax) {
			saveRmRange(rmCurrentTab, parseFloat(curMin.value), parseFloat(curMax.value));
		}
	}

	rmCurrentTab = tab;
	saveRmTab(tab);

	// タブのアクティブ状態を更新
	document.querySelectorAll('.rm-tab').forEach(btn => {
		const active = btn.dataset.tab === tab;
		btn.classList.toggle('is-active', active);
		btn.setAttribute('aria-pressed', active ? 'true' : 'false');
	});

	// 保存値を復元(なければデフォルト)
	const minEl = $('#rmRangeMin');
	const maxEl = $('#rmRangeMax');
	if (minEl && maxEl) {
		const range = loadRmRange(tab);
		minEl.value = range.min;
		maxEl.value = range.max;
	}

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
			debounceTimer = setTimeout(() => {
				saveRmRange(rmCurrentTab, parseFloat(rangeMin.value), parseFloat(rangeMax.value));
				buildRmTable();
			}, 300);
		};
		rangeMin.addEventListener('input', debouncedBuild);
		rangeMax.addEventListener('input', debouncedBuild);
	}

	// 初回: 保存されたタブとレンジを復元してテーブル生成
	switchRmTab(loadRmTab(), true);

	// ==== RM表: 列/行ハイライト(ホバーでプレビュー、クリック/矢印キーで固定) ====
	const table = $('#rmTable');
	const wrapper = $('#rmTableWrapper');
	if (!table || !wrapper) return;

	// ホバーで即時にプレビュー
	table.addEventListener('mouseover', (e) => {
		const cell = e.target instanceof Element ? e.target.closest('th, td') : null;
		if (!cell || !table.contains(cell)) return;
		const idx = cell.cellIndex;
		if (cell.closest('thead')) {
			if (idx > 0) applyRmHighlights(idx, null);
		} else {
			applyRmHighlights(idx > 0 ? idx : null, cell.closest('tr'));
		}
	});

	// テーブル外れで固定選択を復元
	table.addEventListener('mouseleave', applySelectedRmHighlights);

	// クリックで選択を固定/解除
	table.addEventListener('click', (e) => {
		const cell = e.target instanceof Element ? e.target.closest('th, td') : null;
		if (!cell || !table.contains(cell)) return;
		const idx = cell.cellIndex;

		if (cell.closest('thead')) {
			if (idx === 0) return; // 重量列ヘッダーはスキップ
			const reps = RM_REPS[idx - 1];
			const isSame = rmSelectedReps === reps && rmSelectedWeight == null;
			rmSelectedReps = isSame ? null : reps;
			rmSelectedWeight = null;
		} else {
			const weight = parseFloat(cell.closest('tr')?.dataset.weight ?? '');
			if (!Number.isFinite(weight)) return;
			if (idx === 0) {
				// 行見出しをクリック → 行のみ選択
				const isSame = rmSelectedWeight === weight && rmSelectedReps == null;
				rmSelectedWeight = isSame ? null : weight;
				rmSelectedReps = null;
			} else {
				// 交差セル → 行と列の両方を選択
				const reps = RM_REPS[idx - 1];
				const isSame = rmSelectedWeight === weight && rmSelectedReps === reps;
				rmSelectedWeight = isSame ? null : weight;
				rmSelectedReps = isSame ? null : reps;
			}
		}

		applySelectedRmHighlights();
		announceRmSelection();
	});

	// キーボード操作: 矢印キーでセル選択を移動、Escapeで解除
	wrapper.addEventListener('keydown', (e) => {
		const handled = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'];
		if (!handled.includes(e.key)) return;
		e.preventDefault();

		if (e.key === 'Escape') {
			rmSelectedWeight = null;
			rmSelectedReps = null;
			applySelectedRmHighlights();
			announceRmSelection();
			return;
		}

		const tbody = table.tBodies[0];
		if (!tbody || !tbody.rows.length) return;
		const weights = Array.from(tbody.rows, r => parseFloat(r.dataset.weight));

		let wi = rmSelectedWeight != null ? weights.indexOf(rmSelectedWeight) : -1;
		let ri = rmSelectedReps != null ? RM_REPS.indexOf(rmSelectedReps) : -1;
		if (wi === -1) wi = 0;
		if (ri === -1) ri = 0;

		if (e.key === 'ArrowUp') wi = Math.max(0, wi - 1);
		if (e.key === 'ArrowDown') wi = Math.min(weights.length - 1, wi + 1);
		if (e.key === 'ArrowLeft') ri = Math.max(0, ri - 1);
		if (e.key === 'ArrowRight') ri = Math.min(RM_REPS.length - 1, ri + 1);

		rmSelectedWeight = weights[wi];
		rmSelectedReps = RM_REPS[ri];
		applySelectedRmHighlights();
		announceRmSelection();

		const cross = tbody.rows[wi]?.children[ri + 1];
		if (cross) cross.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
})();

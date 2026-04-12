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

(function init() {
	$('#quickLaunchAllDayBtn').addEventListener('click', launchQuickAllDayChouseisan);
	$('#quickLaunchSplitBtn').addEventListener('click', launchQuickSplitChouseisan);
	$('#openRakutenUnsubscribeBtn').addEventListener('click', openRakutenUnsubscribe);
})();

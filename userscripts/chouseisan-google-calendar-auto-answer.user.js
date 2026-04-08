// ==UserScript==
// @name         Chouseisan Google Calendar Auto Answer
// @namespace    /Users/tomochikatakeshi/benri
// @version      0.1.0
// @description  調整さんの候補をGoogleカレンダーの空き状況から判定して自動回答します
// @match        https://chouseisan.com/s*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
	'use strict';

	const STORAGE_KEY = 'chouseisan-google-auto-answer-settings';
	const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
	const GOOGLE_FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';
	const OPEN_ENDED_SLOT_MINUTES = 180;
	const DEFAULT_ALL_DAY_START_HOUR = 9;
	const DEFAULT_ALL_DAY_END_HOUR = 18;

	let gisScriptPromise = null;
	let tokenClientPromise = null;
	let accessToken = null;

	function getEventData() {
		return window.Chouseisan?.event;
	}

	function getChoices() {
		return Array.isArray(getEventData()?.choices) ? getEventData().choices : [];
	}

	function getSettings() {
		try {
			return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
		} catch {
			return {};
		}
	}

	function saveSettings(settings) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	}

	function promptForSettings() {
		const current = getSettings();
		const defaultName = current.participantName || window.Chouseisan?.user_nickname || '';
		const clientId = window.prompt(
			'Google OAuth クライアント ID を入力してください',
			current.googleClientId || ''
		);
		if (!clientId) return null;

		const participantName = window.prompt('回答名を入力してください', defaultName);
		if (!participantName) return null;

		const calendarIds = window.prompt(
			'参照するGoogleカレンダーIDをカンマ区切りで入力してください。通常は primary で大丈夫です。',
			current.calendarIds || 'primary'
		);
		if (!calendarIds) return null;

		const settings = {
			googleClientId: clientId.trim(),
			participantName: participantName.trim(),
			calendarIds: calendarIds
				.split(',')
				.map((value) => value.trim())
				.filter(Boolean)
				.join(',')
		};

		if (!settings.googleClientId || !settings.participantName || !settings.calendarIds) {
			return null;
		}

		saveSettings(settings);
		return settings;
	}

	function ensureSettings({ forcePrompt = false } = {}) {
		const existing = getSettings();
		if (
			!forcePrompt &&
			existing.googleClientId &&
			existing.participantName &&
			existing.calendarIds
		) {
			return existing;
		}

		return promptForSettings();
	}

	function ensureGisScript() {
		if (window.google?.accounts?.oauth2) {
			return Promise.resolve();
		}
		if (gisScriptPromise) return gisScriptPromise;

		gisScriptPromise = new Promise((resolve, reject) => {
			const script = document.createElement('script');
			script.src = 'https://accounts.google.com/gsi/client';
			script.async = true;
			script.defer = true;
			script.onload = resolve;
			script.onerror = () => reject(new Error('Google Identity Services の読み込みに失敗しました'));
			document.head.appendChild(script);
		});

		return gisScriptPromise;
	}

	async function getTokenClient(clientId) {
		await ensureGisScript();

		if (tokenClientPromise) return tokenClientPromise;

		tokenClientPromise = Promise.resolve(
			window.google.accounts.oauth2.initTokenClient({
				client_id: clientId,
				scope: GOOGLE_SCOPE,
				callback: () => {},
				error_callback: () => {}
			})
		);

		return tokenClientPromise;
	}

	async function requestAccessToken(clientId) {
		const tokenClient = await getTokenClient(clientId);

		return new Promise((resolve, reject) => {
			tokenClient.callback = (response) => {
				if (response?.error) {
					reject(new Error(response.error_description || response.error));
					return;
				}
				accessToken = response.access_token;
				resolve(response.access_token);
			};

			tokenClient.error_callback = (error) => {
				reject(new Error(error?.type || 'Google認証に失敗しました'));
			};

			tokenClient.requestAccessToken({
				prompt: accessToken ? '' : 'consent'
			});
		});
	}

	function inferYear(month, day) {
		const today = new Date();
		let year = today.getFullYear();
		const candidate = new Date(year, month - 1, day);
		const diffDays = (candidate - today) / (24 * 60 * 60 * 1000);

		if (diffDays < -180) year += 1;
		if (diffDays > 180) year -= 1;

		return year;
	}

	function parseTimePart(raw) {
		const normalized = raw.trim().replace(/時/g, ':').replace(/分/g, '').replace(/:$/, ':00');
		const match = normalized.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
		if (!match) return null;
		return {
			hour: Number(match[1]),
			minute: Number(match[2] || 0)
		};
	}

	function createDate(year, month, day, hour, minute) {
		return new Date(year, month - 1, day, hour, minute, 0, 0);
	}

	function parseChoice(choiceText) {
		const match = choiceText.match(/^(\d{1,2})\/(\d{1,2})\([^)]+\)\s*(.+)$/);
		if (!match) return null;

		const month = Number(match[1]);
		const day = Number(match[2]);
		const detail = match[3].trim();
		const year = inferYear(month, day);

		if (detail === '終日') {
			return {
				type: 'allDay',
				label: choiceText,
				start: createDate(year, month, day, DEFAULT_ALL_DAY_START_HOUR, 0),
				end: createDate(year, month, day, DEFAULT_ALL_DAY_END_HOUR, 0)
			};
		}

		const normalizedDetail = detail.replace(/[〜～]/g, '~');
		const rangeMatch = normalizedDetail.match(/^(.+?)\s*~\s*(.+)$/);
		if (rangeMatch) {
			const startTime = parseTimePart(rangeMatch[1]);
			const endTime = parseTimePart(rangeMatch[2]);
			if (startTime && endTime) {
				return {
					type: 'timed',
					label: choiceText,
					start: createDate(year, month, day, startTime.hour, startTime.minute),
					end: createDate(year, month, day, endTime.hour, endTime.minute)
				};
			}
		}

		const startOnlyMatch = normalizedDetail.match(/^(.+?)\s*~$/);
		if (startOnlyMatch) {
			const startTime = parseTimePart(startOnlyMatch[1]);
			if (startTime) {
				const start = createDate(year, month, day, startTime.hour, startTime.minute);
				const end = new Date(start.getTime() + OPEN_ENDED_SLOT_MINUTES * 60 * 1000);
				return {
					type: 'timed',
					label: choiceText,
					start,
					end
				};
			}
		}

		return null;
	}

	function mergeBusyIntervals(intervals) {
		if (!intervals.length) return [];
		const sorted = [...intervals].sort((a, b) => a.start - b.start);
		const merged = [sorted[0]];

		for (let index = 1; index < sorted.length; index += 1) {
			const current = sorted[index];
			const last = merged[merged.length - 1];
			if (current.start <= last.end) {
				last.end = new Date(Math.max(last.end.getTime(), current.end.getTime()));
			} else {
				merged.push(current);
			}
		}

		return merged;
	}

	function calculateOverlapMinutes(targetStart, targetEnd, busyIntervals) {
		return busyIntervals.reduce((sum, busy) => {
			const overlapStart = Math.max(targetStart.getTime(), busy.start.getTime());
			const overlapEnd = Math.min(targetEnd.getTime(), busy.end.getTime());
			if (overlapEnd <= overlapStart) return sum;
			return sum + (overlapEnd - overlapStart) / 60000;
		}, 0);
	}

	function classifyChoice(parsedChoice, busyIntervals) {
		const durationMinutes = (parsedChoice.end - parsedChoice.start) / 60000;
		const busyMinutes = calculateOverlapMinutes(parsedChoice.start, parsedChoice.end, busyIntervals);

		if (busyMinutes <= 0) return 1;

		if (parsedChoice.type === 'allDay') {
			if (busyMinutes >= 360) return 3;
			return 2;
		}

		if (busyMinutes >= durationMinutes * 0.85) return 3;
		return 2;
	}

	async function queryBusyIntervals(token, parsedChoices, calendarIds) {
		const timeMin = new Date(Math.min(...parsedChoices.map((choice) => choice.start.getTime())));
		const timeMax = new Date(Math.max(...parsedChoices.map((choice) => choice.end.getTime())));
		const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';

		const response = await fetch(GOOGLE_FREEBUSY_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				timeMin: timeMin.toISOString(),
				timeMax: timeMax.toISOString(),
				timeZone,
				items: calendarIds.map((id) => ({ id }))
			})
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Google Calendar API error: ${response.status} ${text}`);
		}

		const data = await response.json();
		const intervals = Object.values(data.calendars || {}).flatMap((calendar) =>
			(calendar.busy || []).map((busy) => ({
				start: new Date(busy.start),
				end: new Date(busy.end)
			}))
		);

		return mergeBusyIntervals(intervals);
	}

	function findMemberTriggerByName(participantName) {
		const memberLinks = Array.from(document.querySelectorAll('#nittei tr:first-child td a, #nittei tr:first-child td span'));
		return memberLinks.find((element) => element.textContent.trim() === participantName) || null;
	}

	function waitForElement(selector, timeoutMs = 5000) {
		return new Promise((resolve, reject) => {
			const existing = document.querySelector(selector);
			if (existing) {
				resolve(existing);
				return;
			}

			const timeoutId = window.setTimeout(() => {
				observer.disconnect();
				reject(new Error(`${selector} が見つかりませんでした`));
			}, timeoutMs);

			const observer = new MutationObserver(() => {
				const target = document.querySelector(selector);
				if (!target) return;
				window.clearTimeout(timeoutId);
				observer.disconnect();
				resolve(target);
			});

			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
		});
	}

	async function openResponseForm(participantName) {
		const existingTrigger = findMemberTriggerByName(participantName);
		if (existingTrigger) {
			if (existingTrigger.tagName.toLowerCase() !== 'a') {
				throw new Error('同名の回答がありますが、このブラウザでは編集できません');
			}
			existingTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			return waitForElement('#f');
		}

		const addButton = document.querySelector('#add_btn');
		if (!addButton || addButton.disabled) {
			throw new Error('出欠入力フォームを開けませんでした');
		}

		addButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		return waitForElement('#f');
	}

	function setInputValue(input, value) {
		input.value = value;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}

	function selectAttendance(choiceNum, status) {
		const hiddenInput = document.querySelector(`input[name="kouho${choiceNum}"]`);
		if (!hiddenInput) {
			throw new Error(`候補 ${choiceNum} の入力欄が見つかりません`);
		}

		const container = hiddenInput.parentElement;
		const buttonIndexMap = { 1: 0, 2: 1, 3: 2 };
		const button = container.querySelector(`.oax-${buttonIndexMap[status]}`);
		if (!button) {
			throw new Error(`候補 ${choiceNum} のボタンが見つかりません`);
		}

		button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	}

	async function fillAndSubmitForm(participantName, statuses) {
		await openResponseForm(participantName);

		const nameInput = await waitForElement('#f_name');
		setInputValue(nameInput, participantName);

		statuses.forEach(({ num, status }) => {
			selectAttendance(num, status);
		});

		const submitButton = document.querySelector('#memUpdBtn');
		if (!submitButton) {
			throw new Error('送信ボタンが見つかりません');
		}

		submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	}

	function buildStatuses(choices, busyIntervals) {
		return choices.map((choice) => {
			const parsed = parseChoice(choice.choice);
			if (!parsed) {
				throw new Error(`候補を解釈できませんでした: ${choice.choice}`);
			}

			return {
				num: choice.num,
				label: choice.choice,
				status: classifyChoice(parsed, busyIntervals)
			};
		});
	}

	function createToolbar() {
		if (document.querySelector('#gc-auto-answer-toolbar')) return;

		const anchor = document.querySelector('#survey-button') || document.querySelector('.choice-div-notes-and-csv-button');
		if (!anchor) return;

		const toolbar = document.createElement('div');
		toolbar.id = 'gc-auto-answer-toolbar';
		toolbar.innerHTML = `
			<style>
				#gc-auto-answer-toolbar {
					display: flex;
					gap: 8px;
					flex-wrap: wrap;
					justify-content: center;
					margin: 16px 0 0;
				}
				#gc-auto-answer-toolbar .gc-auto-answer-btn {
					appearance: none;
					border: none;
					border-radius: 999px;
					padding: 12px 16px;
					font-size: 14px;
					font-weight: 700;
					cursor: pointer;
				}
				#gc-auto-answer-run {
					background: #1d9bf0;
					color: #fff;
				}
				#gc-auto-answer-settings {
					background: #eef4ff;
					color: #1f2937;
				}
				#gc-auto-answer-status {
					width: 100%;
					text-align: center;
					font-size: 12px;
					color: #64748b;
				}
			</style>
			<button id="gc-auto-answer-run" class="gc-auto-answer-btn" type="button">Googleカレンダーで自動回答</button>
			<button id="gc-auto-answer-settings" class="gc-auto-answer-btn" type="button">設定</button>
			<div id="gc-auto-answer-status"></div>
		`;

		anchor.appendChild(toolbar);
		document.querySelector('#gc-auto-answer-run')?.addEventListener('click', handleAutoAnswer);
		document.querySelector('#gc-auto-answer-settings')?.addEventListener('click', () => {
			if (promptForSettings()) {
				setStatus('設定を保存しました');
			}
		});
	}

	function setStatus(message) {
		const status = document.querySelector('#gc-auto-answer-status');
		if (status) status.textContent = message;
	}

	function setRunning(running) {
		const button = document.querySelector('#gc-auto-answer-run');
		if (!button) return;
		button.disabled = running;
		button.textContent = running ? '確認中…' : 'Googleカレンダーで自動回答';
	}

	async function handleAutoAnswer() {
		try {
			setRunning(true);
			setStatus('');

			const event = getEventData();
			if (!event?.id || !getChoices().length) {
				throw new Error('イベント情報を取得できませんでした');
			}

			const settings = ensureSettings();
			if (!settings) {
				setStatus('設定が未完了のため中断しました');
				return;
			}

			const token = await requestAccessToken(settings.googleClientId);
			const parsedChoices = getChoices().map((choice) => parseChoice(choice.choice));
			if (parsedChoices.some((choice) => !choice)) {
				throw new Error('対応していない候補形式が含まれています');
			}

			setStatus('Googleカレンダーを確認しています…');
			const busyIntervals = await queryBusyIntervals(
				token,
				parsedChoices,
				settings.calendarIds.split(',').map((value) => value.trim()).filter(Boolean)
			);
			const statuses = buildStatuses(getChoices(), busyIntervals);

			setStatus('回答フォームに入力しています…');
			await fillAndSubmitForm(settings.participantName, statuses);
			setStatus('Googleカレンダーの予定をもとに回答を送信しました');
		} catch (error) {
			console.error('[gc-auto-answer]', error);
			window.alert(error.message || '自動回答に失敗しました');
			setStatus(error.message || '自動回答に失敗しました');
		} finally {
			setRunning(false);
		}
	}

	function boot() {
		if (!window.Chouseisan?.event) return;
		createToolbar();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot, { once: true });
	} else {
		boot();
	}
})();

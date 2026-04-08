(function () {
	'use strict';

	const SETTINGS_DEFAULTS = {
		googleClientId: '',
		participantName: '',
		calendarIds: 'primary'
	};
	const MESSAGE_SOURCE = 'chouseisan-auto-answer-extension';
	const TOOLBAR_ID = 'gc-auto-answer-toolbar';
	const BRIDGE_ID = 'gc-auto-answer-bridge';
	const TOAST_ID = 'gc-auto-answer-toast';

	let toolbarReady = false;
	let bridgePromise = null;

	function hasCompleteSettings(settings) {
		return Boolean(
			settings.googleClientId?.trim() &&
			settings.participantName?.trim() &&
			settings.calendarIds?.trim()
		);
	}

	function ensureBridge() {
		if (bridgePromise) return bridgePromise;
		if (document.getElementById(BRIDGE_ID)) {
			bridgePromise = Promise.resolve();
			return bridgePromise;
		}

		bridgePromise = new Promise((resolve, reject) => {
			const script = document.createElement('script');
			script.id = BRIDGE_ID;
			script.src = chrome.runtime.getURL('injected.js');
			script.onload = () => resolve();
			script.onerror = () => reject(new Error('拡張の本体スクリプトを読み込めませんでした'));
			(document.head || document.documentElement).appendChild(script);
		});

		return bridgePromise;
	}

	function ensureToast() {
		let toast = document.getElementById(TOAST_ID);
		if (toast) return toast;

		toast = document.createElement('div');
		toast.id = TOAST_ID;
		toast.style.position = 'fixed';
		toast.style.left = '50%';
		toast.style.bottom = '20px';
		toast.style.transform = 'translateX(-50%)';
		toast.style.zIndex = '2147483647';
		toast.style.maxWidth = 'min(92vw, 520px)';
		toast.style.padding = '12px 16px';
		toast.style.borderRadius = '14px';
		toast.style.boxShadow = '0 14px 40px rgba(15, 23, 42, 0.18)';
		toast.style.background = '#0f172a';
		toast.style.color = '#ffffff';
		toast.style.fontSize = '13px';
		toast.style.fontWeight = '700';
		toast.style.lineHeight = '1.5';
		toast.style.opacity = '0';
		toast.style.pointerEvents = 'none';
		toast.style.transition = 'opacity 160ms ease';
		document.documentElement.appendChild(toast);
		return toast;
	}

	let toastTimer = 0;

	function showToast(message, tone = 'info') {
		const toast = ensureToast();
		const backgrounds = {
			info: '#0f172a',
			success: '#166534',
			error: '#991b1b'
		};

		toast.textContent = message;
		toast.style.background = backgrounds[tone] || backgrounds.info;
		toast.style.opacity = '1';
		window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => {
			toast.style.opacity = '0';
		}, 3400);
	}

	function setToolbarStatus(message, tone = 'info') {
		const status = document.querySelector(`#${TOOLBAR_ID} [data-role="status"]`);
		if (!status) {
			showToast(message, tone);
			return;
		}

		const colors = {
			info: '#64748b',
			success: '#166534',
			error: '#991b1b'
		};

		status.textContent = message;
		status.style.color = colors[tone] || colors.info;
		showToast(message, tone);
	}

	function setToolbarRunning(running) {
		const button = document.querySelector(`#${TOOLBAR_ID} [data-role="run"]`);
		if (!button) return;
		button.disabled = running;
		button.textContent = running ? '確認中…' : 'Googleカレンダーで自動入力';
		button.style.opacity = running ? '0.7' : '1';
	}

	async function getSettings() {
		return chrome.storage.sync.get(SETTINGS_DEFAULTS);
	}

	async function openOptionsPage() {
		await chrome.runtime.sendMessage({
			type: 'chouseisan-auto-answer:open-options'
		});
	}

	async function runAutoAnswer(explicitSettings) {
		await ensureBridge();

		const settings = explicitSettings || (await getSettings());
		if (!hasCompleteSettings(settings)) {
			setToolbarStatus('先に拡張の設定を保存してください', 'error');
			await openOptionsPage();
			return;
		}

		setToolbarRunning(true);
		setToolbarStatus('Googleカレンダーの予定を確認します', 'info');

		window.dispatchEvent(
			new CustomEvent('chouseisan-auto-answer:run', {
				detail: {
					settings
				}
			})
		);
	}

	function createToolbar() {
		if (toolbarReady || document.getElementById(TOOLBAR_ID)) {
			toolbarReady = true;
			return true;
		}

		const anchor =
			document.querySelector('#survey-button') ||
			document.querySelector('.choice-div-notes-and-csv-button');
		if (!anchor) return false;

		const toolbar = document.createElement('div');
		toolbar.id = TOOLBAR_ID;
		toolbar.innerHTML = `
			<style>
				#${TOOLBAR_ID} {
					display: flex;
					gap: 8px;
					flex-wrap: wrap;
					justify-content: center;
					margin: 16px 0 0;
				}
				#${TOOLBAR_ID} .gc-auto-answer-btn {
					appearance: none;
					border: none;
					border-radius: 999px;
					padding: 12px 16px;
					font-size: 14px;
					font-weight: 700;
					cursor: pointer;
				}
				#${TOOLBAR_ID} .gc-auto-answer-btn.secondary {
					background: #eef4ff;
					color: #1f2937;
				}
				#${TOOLBAR_ID} .gc-auto-answer-btn.primary {
					background: #1d9bf0;
					color: #fff;
				}
				#${TOOLBAR_ID} [data-role="status"] {
					width: 100%;
					text-align: center;
					font-size: 12px;
					color: #64748b;
				}
			</style>
			<button class="gc-auto-answer-btn primary" data-role="run" type="button">Googleカレンダーで自動入力</button>
			<button class="gc-auto-answer-btn secondary" data-role="settings" type="button">設定</button>
			<div data-role="status"></div>
		`;

		anchor.appendChild(toolbar);

		toolbar.querySelector('[data-role="run"]')?.addEventListener('click', () => {
			void runAutoAnswer();
		});

		toolbar.querySelector('[data-role="settings"]')?.addEventListener('click', () => {
			void openOptionsPage();
		});

		toolbarReady = true;
		return true;
	}

	function watchToolbarAnchor() {
		if (createToolbar()) return;

		const observer = new MutationObserver(() => {
			if (createToolbar()) {
				observer.disconnect();
			}
		});

		observer.observe(document.documentElement, {
			childList: true,
			subtree: true
		});
	}

	window.addEventListener('message', (event) => {
		if (event.source !== window) return;
		if (event.data?.source !== MESSAGE_SOURCE) return;

		if (event.data.kind === 'status') {
			setToolbarStatus(event.data.message, 'info');
			return;
		}

		if (event.data.kind === 'done') {
			setToolbarRunning(false);
			setToolbarStatus(event.data.message, 'success');
			return;
		}

		if (event.data.kind === 'error') {
			setToolbarRunning(false);
			setToolbarStatus(event.data.message, 'error');
		}
	});

	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (message?.type !== 'chouseisan-auto-answer:run') return;

		runAutoAnswer(message.settings)
			.then(() => sendResponse({ ok: true }))
			.catch((error) => {
				console.error('[chouseisan-auto-answer]', error);
				setToolbarRunning(false);
				setToolbarStatus(error.message || '自動入力に失敗しました', 'error');
				sendResponse({ ok: false, error: error.message });
			});

		return true;
	});

	function boot() {
		void ensureBridge();
		watchToolbarAnchor();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot, { once: true });
	} else {
		boot();
	}
})();

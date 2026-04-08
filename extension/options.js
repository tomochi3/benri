(function () {
	'use strict';

	const SETTINGS_DEFAULTS = {
		googleClientId: '',
		participantName: '',
		calendarIds: 'primary'
	};

	const form = document.getElementById('settingsForm');
	const status = document.getElementById('status');
	const googleClientIdInput = document.getElementById('googleClientId');
	const participantNameInput = document.getElementById('participantName');
	const calendarIdsInput = document.getElementById('calendarIds');

	function setStatus(message, tone = 'info') {
		status.textContent = message;
		status.style.color = tone === 'error' ? '#991b1b' : '#166534';
	}

	async function loadSettings() {
		const settings = await chrome.storage.sync.get(SETTINGS_DEFAULTS);
		googleClientIdInput.value = settings.googleClientId || '';
		participantNameInput.value = settings.participantName || '';
		calendarIdsInput.value = settings.calendarIds || 'primary';
	}

	form.addEventListener('submit', async (event) => {
		event.preventDefault();

		const settings = {
			googleClientId: googleClientIdInput.value.trim(),
			participantName: participantNameInput.value.trim(),
			calendarIds: calendarIdsInput.value
				.split(',')
				.map((value) => value.trim())
				.filter(Boolean)
				.join(', ')
		};

		if (!settings.googleClientId || !settings.participantName || !settings.calendarIds) {
			setStatus('すべての項目を入力してください', 'error');
			return;
		}

		await chrome.storage.sync.set(settings);
		setStatus('設定を保存しました');
	});

	void loadSettings();
})();

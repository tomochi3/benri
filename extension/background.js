const SETTINGS_DEFAULTS = {
	googleClientId: '',
	participantName: '',
	calendarIds: 'primary'
};

function isChouseisanPage(url) {
	return /^https:\/\/chouseisan\.com\/s/.test(url || '');
}

function hasCompleteSettings(settings) {
	return Boolean(
		settings.googleClientId?.trim() &&
		settings.participantName?.trim() &&
		settings.calendarIds?.trim()
	);
}

async function getSettings() {
	return chrome.storage.sync.get(SETTINGS_DEFAULTS);
}

chrome.runtime.onInstalled.addListener((details) => {
	if (details.reason === 'install') {
		chrome.runtime.openOptionsPage();
	}
});

chrome.runtime.onMessage.addListener((message) => {
	if (message?.type === 'chouseisan-auto-answer:open-options') {
		chrome.runtime.openOptionsPage();
	}
});

chrome.action.onClicked.addListener(async (tab) => {
	if (!tab.id || !isChouseisanPage(tab.url)) {
		return;
	}

	const settings = await getSettings();
	if (!hasCompleteSettings(settings)) {
		chrome.runtime.openOptionsPage();
		return;
	}

	try {
		await chrome.tabs.sendMessage(tab.id, {
			type: 'chouseisan-auto-answer:run',
			settings
		});
	} catch (error) {
		console.error('[chouseisan-auto-answer]', error);
	}
});

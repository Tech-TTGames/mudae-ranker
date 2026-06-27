mudaeRanker.controller('mudaeRankerController', ['$scope', '$http', '$timeout', 'Characters', 'PreferenceList', 'Utilities', '$rootScope', function($scope, $http, $timeout, Characters, PreferenceList, Utilities, $rootScope) {
	$scope.characters = Characters.getCharacters();
	$scope.getModeClassName = Characters.getModeClassName;
	$scope.getNextModeName = Characters.getNextModeName;
	$scope.getLeftCompare = Characters.getLeftCompare;
	$scope.getRightCompare = Characters.getRightCompare;
	$scope.getRankingInProgress = Characters.getRankingInProgress;
	$scope.hasCharacters = Characters.hasCharacters;

	// --- Dynamic Progress Header ---
	$scope.getRankProgress = function() {
		if (Characters.mode === Characters.Modes.Endless) {
			return "∞ Endless Mode";
		} else if (Characters.mode === Characters.Modes.Placement) {
			const target = Characters.getLeftCompare();
			return "Placement Matches Left: " + (target ? target.placementMatchesLeft : 0);
		} else {
			// Finite Mode Fallback
			return PreferenceList.currentIndex + " / " + PreferenceList.size;
		}
	};

	// --- Expose Endless Rank to UI ---
	$scope.startEndlessRank = function() {
		if (Characters.startEndlessRank()) {
			document.getElementById('RankingContainer').style.display = 'block';
		}
	};

	// Undo, Ghost Mode, and List View hooks
	$scope.undoRank = Characters.undoRank;
	$scope.ghostMode = false;
	$scope.listMode = false;

	var saveTimer = null;
	var lastSyncedCloudState = null;
	const mql = window.matchMedia("(width <= 600px)");

	$scope.toggleGhostMode = function() {
		$scope.ghostMode = !$scope.ghostMode;
		if ($scope.ghostMode) $scope.listMode = false;
	};

	$scope.toggleListMode = function() {
		$scope.listMode = !$scope.listMode;
		if ($scope.listMode) $scope.ghostMode = false;
	};

	function savetoCloudStorage() {
		const cloudToken = localStorage.getItem('gh_sync_token');
		const activeGistId = localStorage.getItem('gh_sync_gist_id');

		if (cloudToken && activeGistId) {
			const syncPayload = {
				characters: Characters.getCharacters(),
				tierConfig: $scope.tierConfig
			};
			const currentStateString = JSON.stringify(syncPayload);

			// OPTIMIZATION: Skip the PATCH request if the data hasn't mutated
			if (lastSyncedCloudState === currentStateString) {
				return;
			}

			Characters.saveToGist(cloudToken, activeGistId, syncPayload)
				.then(() => {
					// Lock in the new baseline upon success
					lastSyncedCloudState = currentStateString;
					console.log("☁️ Cloud sync pushed new changes.");
				})
				.catch(err => {
					console.error("❌ Background cloud sync failed:", err);
					Utilities.showError("Cloud sync failed. Working offline for now.", false);
				});
		}
	}

	function saveToLocalStorage() {
		var chars = Characters.getCharacters();
		if (chars && chars.length > 0) {
			var exportData = {
				appState: {
					rankingInProgress: Characters.getRankingInProgress(),
					preferenceState: PreferenceList.getState()
				},
				characters: chars
			};
			localStorage.setItem('mudaeRankerCache', angular.toJson(exportData));
		} else {
			localStorage.removeItem('mudaeRankerCache');
		}
	}

	$scope.saveState = function() {
		// INSTANT: Bulletproof local backup so no data is ever lost if the tab closes
		saveToLocalStorage();

		// DELAYED: Safely batch GitHub API calls
		if (saveTimer) $timeout.cancel(saveTimer);
		saveTimer = $timeout(function() {
			savetoCloudStorage();
		}, 10000);
	};

	$scope.sortableConfig = {
		handle: mql.matches ? '.DragHandle' : '',
		onEnd: function (event) {
			$timeout(function() {
				Characters.dragAndDropSortEnd(event);

				if (!Characters.getRankingInProgress()) {
					Characters.reapplyLinks();
				}
			}, 0);
		}
	};

	mql.onchange = (e) => {
		$scope.$applyAsync(function() {
			$scope.sortableConfig.handle = e.matches ? '.DragHandle' : '';
		});
	}

	$timeout(function() {
		var cachedSession = localStorage.getItem('mudaeRankerCache');
		if (cachedSession) {
			try {
				Characters.parseInputField(cachedSession);
			} catch (e) {
				console.error("Failed to parse local cache:", e);
			}
		}
	}, 500);

	$scope.getFlaggedCharacters = function() {
		return $scope.characters.filter(function(c) { return c.flag && !c.skip; });
	};

	$scope.triggerBatchInsert = function(queue) {
		if (queue.length > 0) {
			Utilities.showSuccess('Starting placement matches for ' + queue.length + ' character(s).', true);
		}

		var isInserting = Characters.startPlacementMatches(queue);
		if (isInserting) {
			document.getElementById('RankingContainer').style.display = 'block';
		}
	};

	// --- Merge / Absorb Logic ---
	$scope.absorbAdjacent = function(direction) {
		Characters.absorbAdjacent(direction);
	};

	$scope.canMerge = function(direction) {
		if (Characters.getRankingInProgress() || Characters.mode !== Characters.Modes.Edit) return false;

		const activeIdx = Characters.activeIndex;
		if (activeIdx >= 0) {
			const targetIdx = activeIdx + direction;
			return targetIdx >= 0 && targetIdx < Characters.getCharacters().length;
		}
		return false;
	};

	// --- Mass Prompts ---
	$scope.exportSort = function() {
		Characters.exportSort();
	};

	$scope.exportNoteCommand = function() {
		// Just trigger the service! It handles the grouping and scoping natively now.
		Characters.exportNoteCommand();
	};

	$scope.clearAllFlags = function() {
		Characters.clearAllFlags();
		saveState();
		$rootScope.$broadcast('charactersUpdated');
	};

	$scope.massDeleteFlagged = function() {
		Characters.massDeleteFlagged().then(() => {
			// Force immediate DOM reconciliation after async modal closes
			$scope.$apply(() => {
				saveState();
				$rootScope.$broadcast('charactersUpdated');
			});
		}).catch(() => {});
	};

	$scope.massEditNotes = function() {
		const flaggedCount = Characters.getFlaggedCharacters().length;
		const totalCount = Characters.getCharacters().filter(c => !c.skip).length;
		const targetCount = flaggedCount > 0 ? flaggedCount : totalCount;

		if (targetCount === 0) return;

		const scopeStr = flaggedCount > 0 ? `${flaggedCount} selected` : `ALL ${totalCount} un-skipped`;
		const newNote = window.prompt(`Enter the local note for ${scopeStr} character(s):\n(Leave blank to clear notes)`);

		if (newNote !== null) {
			const count = Characters.massEditNotes(newNote);
			Utilities.showSuccess(`Updated local notes for ${count} character(s).`, true);

			// Sync layout instantly
			saveState();
			$rootScope.$broadcast('charactersUpdated');
		}
	};

	// --- Auto-Stratify Modal State ---
	$scope.showTierModal = false;

	// Load previously saved tier setup, or provide a default layout
	$scope.tierConfig = JSON.parse(localStorage.getItem('mudaeRankerTierConfig')) || [
		{ label: '❤️', size: 15 },
		{ label: '⭐', size: 30 },
		{ label: '🔼', size: 50 },
		{ label: '', size: -1 } // Unbounded catch-all
	];

	$scope.saveTierConfig = function() {
		localStorage.setItem('mudaeRankerTierConfig', angular.toJson($scope.tierConfig));
		$scope.saveState();
	};

	$scope.addTier = function() {
		$scope.tierConfig.push({ label: '', size: 20 });
		$scope.saveTierConfig();
	};

	$scope.removeTier = function(index) {
		$scope.tierConfig.splice(index, 1);
		$scope.saveTierConfig();
	};

	$scope.applyStratification = function() {
		const count = Characters.stratifyNotes($scope.tierConfig);
		Utilities.showSuccess(`Applied tier labels to ${count} characters!`, true);

		$scope.saveState();
		$rootScope.$broadcast('charactersUpdated');
		$scope.showTierModal = false; // Close modal on success
	};

	$scope.massSkipCharacters = function(shouldSkip) {
		const flaggedCount = Characters.getFlaggedCharacters().length;
		const totalCount = Characters.getCharacters().filter(c => !c.skip).length;
		const targetCount = flaggedCount > 0 ? flaggedCount : totalCount;

		if (targetCount === 0) return;

		const actionStr = shouldSkip ? 'SKIP' : 'UN-SKIP';
		const scopeStr = flaggedCount > 0 ? `${flaggedCount} selected` : `ALL ${totalCount} currently un-skipped`;

		if (window.confirm(`Are you sure you want to mass ${actionStr} ${scopeStr} character(s)?`)) {
			Characters.massToggleSkip(shouldSkip);
			Utilities.showSuccess(`Successfully set ${actionStr} status.`, true);

			// Sync layout instantly
			saveState();
			$rootScope.$broadcast('charactersUpdated');
			if (!$scope.$$phase) { $scope.$apply(); }
		}
	};

	$scope.massLinkAfterPrompt = function() {
		const flaggedCount = Characters.getFlaggedCharacters().length;
		const totalCount = Characters.getCharacters().filter(c => !c.skip).length;
		const targetCount = flaggedCount > 0 ? flaggedCount : totalCount;

		if (targetCount === 0) return;

		const scopeStr = flaggedCount > 0 ? `${flaggedCount} selected` : `ALL ${totalCount} un-skipped`;
		const targetName = window.prompt(`Enter the EXACT name of the leader character to chain ${scopeStr} behind:`);

		if (targetName && targetName.trim() !== '') {
			Characters.massLinkAfter(targetName);
			Utilities.showSuccess(`Chained dependents behind "${targetName.trim()}".`, true);

			// Sync layout instantly
			saveState();
			$rootScope.$broadcast('charactersUpdated');
			if (!$scope.$$phase) { $scope.$apply(); }
		}
	};

	// --- HOTKEYS ---
	document.addEventListener('keydown', function(event) {
		if ($scope.getModeClassName() === 'RankMode') {
			var validKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

			// Handle Ctrl+Z for Undo
			if (event.ctrlKey && event.key === 'z') {
				event.preventDefault();
				$scope.$applyAsync(function() {
					$scope.undoRank();
				});
				return;
			}

			if (validKeys.includes(event.key)) {
				event.preventDefault();
				$scope.$applyAsync(function() {
					if (event.key === "ArrowLeft") Characters.selectLeft();
					else if (event.key === "ArrowRight") Characters.selectRight();
					else if (event.key === "ArrowUp") Characters.skipLeft();
					else if (event.key === "ArrowDown") Characters.skipRight();
				});
			}
		}
	});

	// Listen for the background character changes.
	$scope.$on('charactersUpdated', function() {
		$scope.saveState();
	});

	// --- LOAD & SYNC ---
	$scope.connectCloudSync = function() {
		const APP_CLIENT_ID = "Iv23likoa1dq7SF8pdRm";
		Characters.redirectToGitHub(APP_CLIENT_ID);
	};

	$scope.disconnectCloudSync = function() {
		if (window.confirm("Disconnect cloud sync? Your data will remain intact locally, but changes won't save across other devices.")) {
			localStorage.removeItem('gh_sync_token');
			localStorage.removeItem('gh_sync_gist_id');
			Utilities.showSuccess("Cloud disconnected. Operating in local-only mode.", true);
		}
	};

	$scope.initCloudSync = function() {
		$scope.isCloudConnected = function() {
			return !!localStorage.getItem('gh_sync_token');
		};

		const urlParams = new URLSearchParams(window.location.search);
		const code = urlParams.get('code');

		const cloudToken = localStorage.getItem('gh_sync_token');
		const activeGistId = localStorage.getItem('gh_sync_gist_id');

		// ==========================================================================
		// CASE A: User just returned from GitHub Auth Redirect (Linking Session)
		// ==========================================================================
		if (code) {
			const workerUrl = "/a/token";
			Utilities.showSuccess("Exchanging authorization keys...", false);

			Characters.exchangeAuthCodeForToken(workerUrl, code).then(token => {
				localStorage.setItem('gh_sync_token', token);

				return Characters.findOrCreateSyncGist(token).then(gistInfo => {
					localStorage.setItem('gh_sync_gist_id', gistInfo.id);

					if (!gistInfo.isNew) {
						// A cloud save exists, but we might have unsaved local work right now!
						return Characters.loadFromGist(token, gistInfo.id).then(cloudData => {
							const localData = Characters.getCharacters();

							// If local storage is empty, skip the prompt and pull down immediately
							if (!localData || localData.length === 0) {
								if (cloudData) {
									const incomingChars = cloudData.characters ? cloudData.characters : (Array.isArray(cloudData) ? cloudData : []);
									if (incomingChars.length > 0) {
										Characters.updateAll(incomingChars);
									}

									if (cloudData.tierConfig) {
										$scope.tierConfig = cloudData.tierConfig;
										$scope.saveTierConfig();
									}

									lastSyncedCloudState = JSON.stringify(cloudData);
									saveToLocalStorage();
								}
								Utilities.showSuccess("Connected! Loaded your save layout from the cloud.", true);
							}
							// Conflict resolution: Ask the user who wins the fight
							else if (window.confirm("An existing cloud save was found!\n\nClick 'OK' to LOAD your cloud save (this will overwrite your current screen).\n\nClick 'Cancel' to KEEP your current screen and overwrite the cloud instead.")) {
								// User chose Cloud data
								if (cloudData) {
									const incomingChars = cloudData.characters ? cloudData.characters : (Array.isArray(cloudData) ? cloudData : []);
									if (incomingChars.length > 0) {
										Characters.updateAll(incomingChars);
									}

									if (cloudData.tierConfig) {
										$scope.tierConfig = cloudData.tierConfig;
										$scope.saveTierConfig();
									}

									lastSyncedCloudState = JSON.stringify(cloudData);
									saveToLocalStorage();
								}
								Utilities.showSuccess("Connected! Synced your data down from the cloud.", true);
							} else {
								const syncPayload = { characters: localData, tierConfig: $scope.tierConfig };
								return Characters.saveToGist(token, gistInfo.id, syncPayload).then(() => {
									Utilities.showSuccess("Connected! Cloud save updated with your current local layout.", true);
									lastSyncedCloudState = JSON.stringify(syncPayload);
								});
							}
						});
					} else {
						Utilities.showSuccess("Connected! Created a fresh private save slot in your cloud.", true);
					}
				});
			}).catch(err => {
				const errorMsg = (err.data && err.data.error) || err.message || "Network link failed.";
				Utilities.showError("GitHub Sync Activation Failed: " + errorMsg, true);
			}).finally(() => {
				// Scrub code parameters out of the URL string cleanly
				urlParams.delete('code');
				const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
				window.history.replaceState({}, document.title, newUrl);
				if (!$scope.$$phase) { $scope.$apply(); }
			});
		}
		// ==========================================================================
		// CASE B: Regular Bootup (Already logged in, no code in URL)
		// ==========================================================================
		else if (cloudToken && activeGistId) {
			// Quietly fetch the master cloud file to bring this browser up to date
			Characters.loadFromGist(cloudToken, activeGistId).then(cloudData => {
				if (cloudData) {
					// Build the current local state string matching the new payload structure
					const currentLocalState = JSON.stringify({
						characters: Characters.getCharacters(),
						tierConfig: $scope.tierConfig
					});
					const incomingCloudState = JSON.stringify(cloudData);

					if (currentLocalState !== incomingCloudState) {
						const incomingChars = cloudData.characters ? cloudData.characters : (Array.isArray(cloudData) ? cloudData : []);
						if (incomingChars.length > 0) {
							Characters.updateAll(incomingChars);
						}

						if (cloudData.tierConfig) {
							$scope.tierConfig = cloudData.tierConfig;
							$scope.saveTierConfig();
						}

						lastSyncedCloudState = incomingCloudState;
						saveToLocalStorage();
						console.log("☁️ Application state successfully synced with latest GitHub cloud data.");
					}
				}
			}).catch(err => {
				console.error("❌ Failed to download background cloud sync on boot:", err);
			});
		}
	};

	// Trigger on boot
	$scope.initCloudSync();
}]);
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
	const mql = window.matchMedia("(width <= 600px)");

	$scope.toggleGhostMode = function() {
		$scope.ghostMode = !$scope.ghostMode;
		if ($scope.ghostMode) $scope.listMode = false;
	};

	$scope.toggleListMode = function() {
		$scope.listMode = !$scope.listMode;
		if ($scope.listMode) $scope.ghostMode = false;
	};

	function saveState() {
		saveToLocalStorage();

		const cloudToken = localStorage.getItem('gh_sync_token');
		const activeGistId = localStorage.getItem('gh_sync_gist_id');

		if (cloudToken && activeGistId) {
			Characters.saveToGist(cloudToken, activeGistId, Characters.getCharacters())
				.then(() => {
					console.log("☁️ Cloud sync up-to-date.");
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
		if (saveTimer) $timeout.cancel(saveTimer);
		saveTimer = $timeout(function() {
			saveState();
		}, 1000); // Waits 1 second after you stop typing to save
	};

	$scope.sortableConfig = {
		handle: mql.matches ? '.DragHandle' : '',
		onEnd: function (event) {
			Characters.dragAndDropSortEnd(event);

			// If we just dragged a card in Edit Mode, snap the linked characters to their targets
			if (!Characters.getRankingInProgress()) {
				Characters.reapplyLinks();
			}

			// Trigger 1: Save when a card is manually dragged
			saveState();
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

	// Trigger 2: Save immediately when "Parse Input" adds characters (or when you delete one)
	$scope.$watch(function() {
		return $scope.characters.length;
	}, function(newVal, oldVal) {
		if (newVal !== oldVal) {
			saveState();
		}
	});

	// Trigger 3: Save when Ranking Mode is closed (Clicking "X" or finishing all comparisons)
	$scope.$watch(function() {
		return Characters.getModeClassName();
	}, function(newValue, oldValue) {
		if (oldValue === 'RankMode' && newValue === 'EditMode') {
			saveState();
		}
	});

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

	// Listen for the background AniList fetch completion and commit data to disk
	$scope.$on('charactersUpdated', function() {
		saveState();
	});

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
		const urlParams = new URLSearchParams(window.location.search);
		const code = urlParams.get('code');

		// Expose connection state helper to the UI template
		$scope.isCloudConnected = function() {
			return !!localStorage.getItem('gh_sync_token');
		};

		if (code) {
			const workerUrl = "/a/token";
			Utilities.showSuccess("Exchanging authorization keys...", false);

			Characters.exchangeAuthCodeForToken(workerUrl, code).then(token => {
				localStorage.setItem('gh_sync_token', token);

				// Run our discovery matrix check
				return Characters.findOrCreateSyncGist(token).then(gistInfo => {
					localStorage.setItem('gh_sync_gist_id', gistInfo.id);

					if (!gistInfo.isNew) {
						// Device sync activated: pull remote cloud layout down
						return Characters.loadFromGist(token, gistInfo.id).then(cloudData => {
							if (cloudData && cloudData.length > 0) {
								Characters.characters = cloudData;
								saveToLocalStorage(); // Lock cache locally
								$rootScope.$broadcast('charactersUpdated');
							}
							Utilities.showSuccess("Connected! Synced your character data from the cloud.", true);
						});
					} else {
						Utilities.showSuccess("Connected! Created a fresh private save slot in your cloud.", true);
					}
				});
			}).catch(err => {
				Utilities.showError("GitHub Sync Activation Failed: " + err.message, true);
			}).finally(() => {
				urlParams.delete('code');
				const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
				window.history.replaceState({}, document.title, newUrl);
				if (!$scope.$$phase) { $scope.$apply(); }
			});
		}
	};

	// Trigger on boot
	$scope.initCloudSync();
}]);
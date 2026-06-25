mudaeRanker.controller('mudaeRankerController', ['$scope', '$http', '$timeout', 'Characters', 'PreferenceList', 'Utilities', function($scope, $http, $timeout, Characters, PreferenceList, Utilities) {

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
			saveToLocalStorage();
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
			saveToLocalStorage();
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
			saveToLocalStorage();
		}
	});

	// Trigger 3: Save when Ranking Mode is closed (Clicking "X" or finishing all comparisons)
	$scope.$watch(function() {
		return Characters.getModeClassName();
	}, function(newValue, oldValue) {
		if (oldValue === 'RankMode' && newValue === 'EditMode') {
			saveToLocalStorage();
		}
	});

	$scope.getFlaggedCharacters = function() {
		return $scope.characters.filter(function(c) { return c.insertFlag && !c.skip; });
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
		saveToLocalStorage();
	});
}]);
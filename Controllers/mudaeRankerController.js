mudaeRanker.controller('mudaeRankerController', ['$scope', '$http', '$timeout', 'Characters', 'PreferenceList', function($scope, $http, $timeout, Characters, PreferenceList) {

	$scope.characters = Characters.getCharacters();
	$scope.getModeClassName = Characters.getModeClassName;
	$scope.getNextModeName = Characters.getNextModeName;
	$scope.getLeftCompare = Characters.getLeftCompare;
	$scope.getRightCompare = Characters.getRightCompare;
	$scope.getRankingInProgress = Characters.getRankingInProgress;
	$scope.hasCharacters = Characters.hasCharacters;
	$scope.getRankProgress = function() { return PreferenceList.currentIndex + " / " + PreferenceList.size; }

	// Undo & Ghost Mode hooks
	$scope.undoRank = Characters.undoRank;
	$scope.ghostMode = false;
	$scope.toggleGhostMode = function() {
		$scope.ghostMode = !$scope.ghostMode;
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

	$scope.sortableConfig = {
		onEnd: function (event) {
			Characters.dragAndDropSortEnd(event);
			// Trigger 1: Save when a card is manually dragged
			saveToLocalStorage();
		}
	};

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
}]);
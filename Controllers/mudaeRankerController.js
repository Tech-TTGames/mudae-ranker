mudaeRanker.controller('mudaeRankerController', ['$scope', '$http', '$timeout', 'Characters', 'PreferenceList', function($scope, $http, $timeout, Characters, PreferenceList) {

	$scope.characters = Characters.getCharacters();
	$scope.getModeClassName = Characters.getModeClassName;
	$scope.getNextModeName = Characters.getNextModeName;
	$scope.getLeftCompare = Characters.getLeftCompare;
	$scope.getRightCompare = Characters.getRightCompare;
	$scope.getRankingInProgress = Characters.getRankingInProgress;
	$scope.hasCharacters = Characters.hasCharacters;

	// Centralized save function
	function saveToLocalStorage() {
		var chars = Characters.getCharacters();
		if (chars && chars.length > 0) {
			var exportData = {
				appState: {
					rankingInProgress: false, // Hardcoded to false since we only save when stopping
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
		onEnd: function (event)
		{
			Characters.dragAndDropSortEnd(event);
			saveToLocalStorage(); // Save when a card is manually dragged and dropped
		}
	};

	// 1. Auto-Load on Startup
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

	// 2. Save on "X" (When ranking mode is stopped)
	$scope.$watch(function() {
		return Characters.getRankingInProgress();
	}, function(newValue, oldValue) {
		// If ranking was in progress (true) and is now stopped (false)
		if (oldValue === true && newValue === false) {
			saveToLocalStorage();
		}
	});

	// --- HOTKEYS ---
	document.addEventListener('keydown', function(event) {
		if ($scope.getModeClassName() === 'RankMode' && Characters.getRankingInProgress()) {
			var validKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
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

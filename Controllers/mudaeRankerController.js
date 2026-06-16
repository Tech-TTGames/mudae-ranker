mudaeRanker.controller('mudaeRankerController', ['$scope', '$http', 'Characters', 'PreferenceList', function($scope, $http, Characters, PreferenceList) {

	$scope.characters = Characters.getCharacters();
	$scope.getModeClassName = Characters.getModeClassName;
	$scope.getNextModeName = Characters.getNextModeName;
	$scope.getLeftCompare = Characters.getLeftCompare;
	$scope.getRightCompare = Characters.getRightCompare;
	$scope.getRankingInProgress = Characters.getRankingInProgress;
	$scope.hasCharacters = Characters.hasCharacters;

	$scope.sortableConfig = {
		onEnd: function (event)
		{
			Characters.dragAndDropSortEnd(event);
		}
	};

	// --- LOCAL STORAGE CACHING ---
	
	// 1. Auto-Load on Startup
	var cachedSession = localStorage.getItem('mudaeRankerCache');
	if (cachedSession) {
		try {
			// parseInputField inherently handles JSON object strings, skipping the raw text parsing
			Characters.parseInputField(cachedSession);
		} catch (e) {
			console.error("Failed to parse local cache:", e);
		}
	}

	// 2. Auto-Save on Exit (Zero performance cost during runtime)
	window.addEventListener('beforeunload', function(e) {
		if ($scope.characters.length > 0) {
			var exportData = {
				appState: {
					rankingInProgress: Characters.getRankingInProgress(),
					preferenceState: PreferenceList.getState()
				}, 
				characters: $scope.characters 
			};
			localStorage.setItem('mudaeRankerCache', angular.toJson(exportData));
		} else {
			// Clean up the cache if the list was explicitly emptied (e.g., after clicking Reset)
			localStorage.removeItem('mudaeRankerCache');
		}
	});

	// --- HOTKEYS ---
	
	document.addEventListener('keydown', function(event) {
		// Only execute if the Ranking modal is actively open
		if ($scope.getModeClassName() === 'RankMode' && Characters.getRankingInProgress()) {
			
			// Arrow Keys for Selections
			if (event.key === "ArrowLeft") {
				Characters.selectLeft();
				$scope.$apply(); // Force UI to update
				event.preventDefault(); // Stop page from scrolling
			} 
			else if (event.key === "ArrowRight") {
				Characters.selectRight();
				$scope.$apply();
				event.preventDefault();
			}
			
			// Up/Down Arrows for Skips (Optional, but useful for clean-up)
			else if (event.key === "ArrowUp") {
				Characters.skipLeft();
				$scope.$apply();
				event.preventDefault();
			}
			else if (event.key === "ArrowDown") {
				Characters.skipRight();
				$scope.$apply();
				event.preventDefault();
			}
		}
	});

}]);

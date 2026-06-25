mudaeRanker.directive('mudrParseInput', ['Characters', function(Characters) {
	return {
		restrict: 'A',
		scope: false,
		link: function(scope, element) {
			element.on('click', function() {
				Characters.parseInputField($('#InputField').first().val());

				if (scope.saveState) {
					scope.saveState();
				}

				scope.$apply();
			});
		}
	}
}]);
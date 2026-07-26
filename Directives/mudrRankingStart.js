mudaeRanker.directive('mudrRankingStart', ['Characters', 'Utilities', function(Characters, Utilities) {
    return {
		restrict: 'A',
		scope: false,
		link: function(scope, element, attrs) {
			// Helper function to show depth options before launching
			function promptIntensityAndStart() {
				const validChars = Characters.characters.filter(c => !c.skip);

				// If not enough characters, start standard mode and let the service throw the warning
				if (validChars.length < 2) {
					Characters.startRankMode();
					scope.$apply();
					return;
				}

				const baseRounds = Math.ceil(Math.log2(validChars.length));

				$.MessageBox({
					title: 'Select Ranking Depth',
					message: 'Choose tournament depth for <strong>' + validChars.length + '</strong> characters:',
					buttonDone: {
						quick: { text: '⚡ Quick (' + Math.max(2, baseRounds) + ' Rounds)' },
						balanced: { text: '⚖️ Balanced (' + Math.max(3, baseRounds + 1) + ' Rounds)' },
						thorough: { text: '🔬 Thorough (' + Math.max(4, baseRounds + 3) + ' Rounds)' }
					},
					buttonFail: 'Cancel',
					buttonsOrder: 'done fail'
				}).done(function (data, button) {
				if (button) {
					Characters.startRankMode(button);
					scope.$apply();
				}
				});
			}

			element.on('click', function(event) {
				if (Characters.rankingInProgress) {
					$.MessageBox({
						buttonDone: {
							startOver: { text: 'Start Over' },
							resume: { text: 'Resume' }
						},
						buttonFail: 'Cancel',
						buttonsOrder: 'done fail',
						message: 'You have already ranked some characters, do you want to start over or resume ranking?',
						title: 'Confirm Restart'
					}).done(function (data, button) {
						if (button === 'startOver') {
							promptIntensityAndStart();
						} else { // resume
							Characters.resumeRankMode();
							scope.$apply();
						}
					}).fail(function (data, button) {
						console.log('Fine then, stay in Edit mode');
					});
				} else {
					promptIntensityAndStart();
				}
			});
		}
    };
}]);
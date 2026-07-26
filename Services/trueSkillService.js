mudaeRanker.factory('trueSkillService', ['$window', function($window) {
    // 1. Safely retrieve the library from the window object
    const ts = $window.tsTrueSkill;

    if (!ts) {
        console.error("ts-trueskill failed to load from CDN. Check network tab.");
    }

    return {
        /**
         * Creates a new character rating with default mu and sigma
         * @returns {Rating} A TrueSkill Rating object
         */
        createCharacter: function() {
            return new ts.Rating();
        },

        /**
         * Calculates the new ratings after a 1v1 match
         * @param {Object} winner - The winning character's Rating object
         * @param {Object} loser - The losing character's Rating object
         * @returns {Array} [newWinnerRating, newLoserRating]
         */
        calculateMatch: function(winner, loser) {
            // rate_1vs1 takes (winner, loser) and returns updated Rating objects
            return ts.rate_1vs1(winner, loser);
        },

        /**
         * Calculates the probability of a draw (Matchmaking Quality)
         * Use this for generating Swiss pairings. The higher the return,
         * the closer the match.
         * @param {Object} charA - Character A's Rating object
         * @param {Object} charB - Character B's Rating object
         * @returns {Number} Probability of a draw (0.0 to 1.0)
         */
        getMatchQuality: function(charA, charB) {
            return ts.quality_1vs1(charA, charB);
        },

        /**
         * Generates the conservative leaderboard score (mu - 3*sigma)
         * Sort your final UI list by this number!
         * @param {Object} rating - A TrueSkill Rating object
         * @returns {Number} The conservative score
         */
        getConservativeScore: function(rating) {
            return rating.mu - (3 * rating.sigma);
        }
    };
}]);
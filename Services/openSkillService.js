mudaeRanker.factory('openSkillService', ['$window', function($window) {
    const os = $window.osOpenSkill;

    if (!os) {
        console.error("openskill.js failed to load from CDN.");
    }

    const selectedModel = os?.models?.bradleyTerryFull;
    const modelOption = selectedModel ? { model: selectedModel } : {};

    return {
        /**
         * Creates a new rating object { mu: 25, sigma: 8.333... }
         */
        createCharacter: function(existingRating) {
            if (existingRating && existingRating.mu !== undefined) {
                return os.rating({ mu: existingRating.mu, sigma: existingRating.sigma });
            }

            return os.rating();
        },

        /**
         * Calculates new ratings for a 1v1 matchup
         * OpenSkill expects arrays of teams: [[winner], [loser]]
         * Returns [newWinnerRating, newLoserRating]
         */
        calculateMatch: function(winner, loser) {
            const [[newWinner], [newLoser]] = os.rate([[winner], [loser]], modelOption);
            return [newWinner, newLoser];
        },

        /**
         * Match Quality / Draw Probability (0.0 to 1.0)
         * Used for Swiss pairing selection
         */
        getMatchQuality: function(charA, charB) {
            return os.predictDraw([[charA], [charB]], modelOption);
        },

        /**
         * Conservative Score: mu - (3 * sigma)
         * OpenSkill's os.ordinal() computes this bound directly.
         */
        getConservativeScore: function(rating) {
            return os.ordinal(rating, modelOption);
        }
    };
}]);
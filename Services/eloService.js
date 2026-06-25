mudaeRanker.factory('EloEngine', function() {
    const MAX_ELO = 2400;
    const MIN_ELO = 800;
    const DEFAULT_ELO = 1200;

    // Standard K-Factors
    const K_NORMAL = 16;
    const K_PROVISIONAL = 60; // For placement matches/new inserts

    // Calculates the expected win probability of Character A vs. Character B
    const calculateExpected = (ratingA, ratingB) => {
        return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    };

    return {
        // Expose constants for the rest of the app to use
        K_NORMAL,
        K_PROVISIONAL,
        DEFAULT_ELO,
        MIN_ELO,
        MAX_ELO,

        /**
         * Calculates the new ratings after a match.
         * @param {number} ratingA - Current Elo of Character A
         * @param {number} ratingB - Current Elo of Character B
         * @param {number} scoreA - 1 if A wins, 0 if A loses (0.5 for draw, though we won't use draws)
         * @param {number} kFactorA - Volatility for A
         * @param {number} kFactorB - Volatility for B
         * @returns {Object} { newRatingA, newRatingB }
         */
        calculateMatch: (ratingA, ratingB, scoreA, kFactorA = K_NORMAL, kFactorB = K_NORMAL) => {
            const expectedA = calculateExpected(ratingA, ratingB);
            const expectedB = 1 - expectedA;

            let newRatingA = ratingA + kFactorA * (scoreA - expectedA);
            let newRatingB = ratingB + kFactorB * ((1 - scoreA) - expectedB);

            newRatingA = Math.max(MIN_ELO, Math.min(MAX_ELO, newRatingA));
            newRatingB = Math.max(MIN_ELO, Math.min(MAX_ELO, newRatingB));

            return {
                newRatingA: newRatingA,
                newRatingB: newRatingB
            };
        },

        /**
         * Seeds a starting Elo based on the current array position (for pre-sorted imports).
         * @param {number} index - The character's current array index
         * @param {number} totalCharacters - Total size of the list
         * @returns {number} The calculated starting Elo
         */
        seedInitialElo: (index, totalCharacters) => {
            if (totalCharacters <= 1) return DEFAULT_ELO;
            const eloRange = MAX_ELO - MIN_ELO;
            // Linearly interpolate between 2400 and 800
            return MAX_ELO - ((index / (totalCharacters - 1)) * eloRange);
        }
    };
});
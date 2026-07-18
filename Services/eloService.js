mudaeRanker.factory('EloEngine', function() {
    const MAX_ELO = 2400;
    const MIN_ELO = 800;
    const DEFAULT_ELO = 1200;

    // Private Flex-K Calculator (Not exposed in the return block)
    const getFlexK = (matchesPlayed) => {
        // Explicitly reject NaN, null, strings, etc.
        if (typeof matchesPlayed !== 'number' || !Number.isFinite(matchesPlayed)) return 16;
        if (matchesPlayed <= 5) return 120; // Aggressive Placement
        if (matchesPlayed <= 15) return 60; // Provisional Settling
        if (matchesPlayed <= 30) return 32; // Maturing
        return 16;                          // Established
    };

    const calculateExpected = (ratingA, ratingB) => {
        return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    };

    return {
        DEFAULT_ELO,
        MIN_ELO,
        MAX_ELO,

        /**
         * Calculates the new ratings after a match using internal Flex-K.
         * @param {number} ratingA - Current Elo of Character A
         * @param {number} ratingB - Current Elo of Character B
         * @param {number} scoreA - 1 if A wins, 0 if A loses
         * @param {number} matchesPlayedA - Number of matches A has played (for K-Factor)
         * @param {number} matchesPlayedB - Number of matches B has played (for K-Factor)
         * @param {number} [multiplier=1] - Optional multiplier for the K-Factor (e.g. for MMR)
         * @returns {Object} { newRatingA, newRatingB }
         */
        calculateMatch: (ratingA, ratingB, scoreA, matchesPlayedA, matchesPlayedB, multiplier = 1) => {
            const expectedA = calculateExpected(ratingA, ratingB);
            const expectedB = 1 - expectedA;

            // Compute volatility internally
            const kFactorA = getFlexK(matchesPlayedA);
            const kFactorB = getFlexK(matchesPlayedB);

            let newRatingA = ratingA + kFactorA * (scoreA - expectedA) * multiplier;
            let newRatingB = ratingB + kFactorB * ((1 - scoreA) - expectedB) * multiplier;

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
            return MAX_ELO - ((index / (totalCharacters - 1)) * eloRange);
        },

        /**
         * Takes an array of raw Elo scores and scales them to fit within the engine's target bounds.
         * @param {number[]} elos - Array of current Elo scores
         * @returns {number[]} Array of scaled Elo scores in the exact same order
         */
        rescalePool: (elos) => {
            if (!elos || elos.length < 2) return elos;

            let currentMin = Math.min(...elos);
            let currentMax = Math.max(...elos);

            // Bail out if the roster is totally flat (prevents division by zero)
            if (currentMin === currentMax) return elos;

            return elos.map(elo => {
                // Uses the engine's internal MIN_ELO and MAX_ELO constants
                const scaledElo = ((elo - currentMin) / (currentMax - currentMin)) * (MAX_ELO - MIN_ELO) + MIN_ELO;
                return Math.round(scaledElo);
            });
        },
    };
});
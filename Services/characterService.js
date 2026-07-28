mudaeRanker.service('Characters', ['$rootScope', '$interval', '$http', 'Utilities', 'openSkillService', function($rootScope, $interval, $http, Utilities, openSkillService) {
	const service = this;

	service.characters = [];

	// --- Global States ---
	service.leftCompare = null;
	service.rightCompare = null;
	service.activeIndex = -1;
	service.inMessageBox = false;
	service.sortableObject = null;
	service._matchStartTime = 0;
	service._accumulatedTime = 0;
	service._lastTick = 0;
	service._recentMatchups = [];
	service.lastRankMode = null;
	const MAX_RECENT_MATCHUPS = 25;

	// Mode definitions and helper predicates
	const Mode = { Edit: 0, RankFinite: 1, Placement: 2, Endless: 3 };
	service.Modes = Mode; // Expose constants to outer controller scopes
	service.mode = Mode.Edit;

	service.isPlacementMode = () => service.mode === Mode.Placement;
	service.isEndlessMode = () => service.mode === Mode.Endless;
	service.getRankingInProgress = () => {
		const validChars = service.characters.filter(c => !c.skip).length >= 2;
		return (service.mode !== Mode.Edit || service.lastRankMode !== null) && validChars;
	};

	Object.defineProperty(service, 'rankingInProgress', {
		get: () => service.getRankingInProgress(),
		configurable: true
	});

	document.addEventListener("visibilitychange", () => {
		if (service._matchStartTime === 0) return;

		if (document.hidden) {
			// Tab minimized/switched: Save the time spent so far
			service._accumulatedTime += (Date.now() - service._lastTick);
		} else {
			// Tab active again: Restart the clock from this exact moment
			service._lastTick = Date.now();
		}
	});

	service._markMatchStart = () => {
		service._matchStartTime = Date.now();
		service._accumulatedTime = 0;
		service._lastTick = Date.now();
	};

	service._getLatencyMultiplier = () => {
		if (service._matchStartTime === 0) return 1.0;

		let totalTimeMs = service._accumulatedTime;
		if (!document.hidden) {
			totalTimeMs += (Date.now() - service._lastTick);
		}

		const t = totalTimeMs / 1000;

		// If t > 120 (AFK), return 1.0.
		// Otherwise, calculate slope clamped strictly between 0.3 and 1.0
		return t > 120 ? 1.0 : Math.max(0.3, Math.min(1.0, 1.0 - ((t - 3) * 0.7 / 12)));
	};

	service._getMatchupSignature = (charA, charB) => {
		if (!charA || !charB) return '';
		// Sort names alphabetically so Left vs Right and Right vs Left generate the exact same string
		return [charA.originalName, charB.originalName].sort().join('::');
	};

	service._recordMatchup = (charA, charB) => {
		const sig = service._getMatchupSignature(charA, charB);
		if (!sig) return;
		service._recentMatchups.push(sig);
		if (service._recentMatchups.length > MAX_RECENT_MATCHUPS) {
			service._recentMatchups.shift();
		}
	};

	// --- OpenSKill Helper Hydration ---
	const OLD_ELO_BASELINE = 1200;

	/**
	 * Ensures a character object has valid OpenSkill properties (mu, sigma, osRating, score)
	 * and performs legacy Elo migration if necessary.
	 */
	service._hydrateCharacter = (c) => {
    // 0. ENSURE BASE CSS CLASS EXISTS
    if (!c.className || typeof c.className !== 'string' || !c.className.includes('CharacterThumb')) {
        c.className = 'CharacterThumb';
    } else {
        // Strip any lingering full/expanded state from imports
        c.className = c.className.replace(/ ?CharacterFull( )?/, '').trim();
    }
		// 1. MIGRATION: Convert legacy Elo -> OpenSkill
		if (typeof c.elo !== 'undefined' && typeof c.mu === 'undefined') {
			c.mu = 25.0 + ((c.elo - OLD_ELO_BASELINE) / 40.0);
			const matches = c.endlessMatches || c.totalMatches || ((c.wins || 0) + (c.losses || 0)) || 0;

			c.sigma = matches === 0 ? 8.333 : (1.0 + (7.333 * Math.exp(-0.05 * matches)));
			delete c.elo;
		}

		// 2. UNSEEDED / NEW CHARACTERS
		if (typeof c.mu === 'undefined') {
			c.mu = 25.0;
			c.sigma = 8.333;
		}

		// 3. HYDRATE OPENSKILL RATING OBJECT
		c.osRating = openSkillService.createCharacter(c)

		// 4. CALCULATE DISPLAY CONSERVATIVE SCORE (mu - 3*sigma)
		c.score = openSkillService.getConservativeScore(c.osRating);

		return c;
	};

	// --- Placement Matches State ---
	const placementState = {
		active: false,
		queue: [],
		target: null,
		minIdx: 0,
		maxIdx: 0,
		phase: 'BINARY',
		history: new Set()
	};

	service.getPlacementState = () => placementState;

	// --- SortableJS Controls ---
	service.getSortableObject = () => {
		if (service.sortableObject != null) return service.sortableObject;
		const sortableDiv = $('.CharacterCardContainer')[0];
		if (!sortableDiv) return null;

		for (let prop in sortableDiv) {
			if (prop.match(/Sortable\d+/)) {
				service.sortableObject = sortableDiv[prop];
			}
		}
		return service.sortableObject;
	};

	service.disableSortable = () => {
		const sortable = service.getSortableObject();
		if (sortable) sortable.options.disabled = true;
	};

	service.enableSortable = () => {
		const sortable = service.getSortableObject();
		if (sortable) sortable.options.disabled = false;
	};

	service.dragAndDropSortEnd = (event) => {
		const oldIndex = event.oldIndex;
		const newIndex = event.newIndex;
		if (oldIndex === newIndex) return;

		const movedChar = service.characters[newIndex];
		const prevChar = newIndex > 0 ? service.characters[newIndex - 1] : null;
		const nextChar = newIndex < service.characters.length - 1 ? service.characters[newIndex + 1] : null;

		// 1. Interpolate the exact conservative TARGET SCORE based on neighbors
		const prevScore = prevChar ? prevChar.score : (nextChar ? nextChar.score + 1.0 : 25.0);
		const nextScore = nextChar ? nextChar.score : (prevChar ? prevChar.score - 1.0 : 25.0);
		const targetScore = (prevScore + nextScore) / 2;

		// 2. Barely penalize sigma to prevent the score from crashing
		movedChar.sigma = Math.min(8.333, (movedChar.sigma || 4.0) + 0.1);

		// 3. Reverse engineer mu so the final conservative math precisely matches the UI drop position
		movedChar.mu = targetScore + (3.0 * movedChar.sigma);
		movedChar.osRating = openSkillService.createCharacter(movedChar);
		movedChar.score = openSkillService.getConservativeScore(movedChar.osRating);

		// 4. CRITICAL: Cascade the new OpenSkill variables to all Follow-Me links!
		service.reapplyLinks();

		$rootScope.$broadcast('charactersUpdated');
	};

	service.handleSkippedCharacter = (index) => {
		const character = service.characters[index];
		if (!character) return;

		if (character.skip) {
			character.mu = service.getLowestMu() - 0.5;
			character.osRating = openSkillService.createCharacter(character);
			character.score = openSkillService.getConservativeScore(character.osRating);
		} else {
			character.linkedTo = '';
			if (character.sigma <= 0.001) {
				character.sigma = 8.333;
				character.osRating = openSkillService.createCharacter(character);
				character.score = openSkillService.getConservativeScore(character.osRating);
        	}
		}

		service.reapplyLinks();
		$rootScope.$broadcast('charactersUpdated');
	};

	// --- UI Getters & State Checkers ---
	service.getCharacters = () => service.characters;
	service.hasCharacters = () => service.characters.length > 0;
	service.getLeftCompare = () => service.leftCompare;
	service.getRightCompare = () => service.rightCompare;

	service.getModeClassName = () => {
		return service.mode !== Mode.Edit ? 'RankMode' : 'EditMode';
	};

	service.getNextModeName = () => {
		return service.mode !== Mode.Edit ? 'Start Editing' : 'Start Ranking';
	};

	// --- UI Component Utilities ---
	service.minimizeActiveCard = (skipEnableSortable = false) => {
		if (service.mode === Mode.Edit && service.activeIndex >= 0) {
			const aClass = service.characters[service.activeIndex].className;
			service.characters[service.activeIndex].className = aClass.replace(/ ?CharacterFull( )?/, '$1');
			service.activeIndex = -1;
			if (!skipEnableSortable) {
				service.enableSortable();
			}
		}
	};

	service.clickCard = (element, characterOrIndex) => {
		if (service.mode !== Mode.Edit) return;

		let index = (typeof characterOrIndex === 'number') ? characterOrIndex : service.characters.indexOf(characterOrIndex);
		if (index < 0 || index >= service.characters.length) return;

		if (index !== service.activeIndex) {
			service.minimizeActiveCard(true);
			service.disableSortable();
			service.characters[index].className += ' CharacterFull';
			service.activeIndex = index;
		}
	};

	service.deleteActiveCard = () => {
		return new Promise((resolve, reject) => {
			if (service.mode === Mode.Edit && service.activeIndex >= 0) {
				service.inMessageBox = true;
				Utilities.confirm('Are you sure you want to delete this character?', 'Confirm Deletion').done(() => {
					service.characters.splice(service.activeIndex, 1);
					service.activeIndex = -1;
					service.inMessageBox = false;
					$rootScope.$broadcast('charactersUpdated');
					resolve();
				}).fail(() => {
					service.inMessageBox = false;
					reject();
				});
			} else {
				resolve();
			}
		});
	};

	service.clean = () => {
		service.characters.length = 0;
		service.mode = Mode.Edit;
		service._undoStack.length = 0;

		placementState.active = false;
		placementState.queue = [];
		$rootScope.$broadcast('charactersUpdated');
		return service.characters;
	};

	// --- Array Management & Sync ---
	service.sortArrayByScore = () => {
		service.characters.sort((a, b) => b.score - a.score);
	};

	// Legacy Alias
	service.sortArrayByElo = service.sortArrayByScore;

	service.updateAll = (newCharacters) => {
		service.characters.length = 0;

		const processedCharacters = newCharacters.map((c) => {
			if (typeof c.placementMatchesLeft === 'undefined') {
				c.placementMatchesLeft = 0;
			}
			return service._hydrateCharacter(c);
		});

		service.characters.push(...processedCharacters);
		service.sortArrayByScore();

		if (!$rootScope.$$phase) {
			$rootScope.$apply();
		}
		$rootScope.$broadcast('charactersUpdated');
	};

	service.addNewCharacter = (originalName, seriesName, imageUrl, skip) => {
		const characterName = originalName.replace(/(?: \([A-Z]+\))?/gi, '').trim();
		let character = {
			className: 'CharacterThumb',
			imageUrl: imageUrl,
			minimizedName: Utilities.minimizeName(characterName),
			name: characterName,
			originalName: originalName,
			series: seriesName,
			skip: skip,
			linkedTo: '',
			flag: false,
			mu: 25.0,
			sigma: 8.333,
			placementMatchesLeft: skip ? 0 : 5
		};

		character = service._hydrateCharacter(character);

		service.characters.push(character);
		if (!skip) {
			service.startPlacementMatches([character]);
		} else {
			service.sortArrayByScore();
			$rootScope.$broadcast('charactersUpdated');
		}
	};

	service.mergeCharacter = (character) => {
		const total = service.characters.length;
		for (let i = 0; i < total; i++) {
			const matchCharacter = service.characters[i];
			if (matchCharacter.originalName === character.originalName &&
			   (matchCharacter.series === character.series || matchCharacter.series === 'Unknown Series' || character.series === 'Unknown Series')) {

				if (matchCharacter.series === 'Unknown Series' && character.series !== 'Unknown Series') {
					matchCharacter.series = character.series;
				}
				if (character.note && character.note !== '') {
					matchCharacter.note = character.note;
				}
				if (character.imageUrl && character.imageUrl.trim() !== '') {
					matchCharacter.imageUrl = character.imageUrl;
				}

				return { code: matchCharacter.imageUrl ? 'NoAction' : 'Lookup', match: matchCharacter };
			}
		}

		// --- BRAND NEW ARRIVAL ---
		character.placementMatchesLeft = character.skip ? 0 : 5;
		character.flag = !character.skip;
		character = service._hydrateCharacter(character);

		service.characters.push(character);
		return { code: 'NotFound', match: character };
	};

	service.mergeAll = (newCharacters) => {
		if (!Array.isArray(newCharacters)) return;
		newCharacters.forEach(c => service.mergeCharacter(c));
	};

	service.absorbAdjacent = (direction) => {
		if (service.mode !== Mode.Edit || service.activeIndex < 0) return;

		const survivorIndex = service.activeIndex;
		const targetIndex = survivorIndex + direction;

		if (targetIndex < 0 || targetIndex >= service.characters.length) return;

		const survivor = service.characters[survivorIndex];
		const target = service.characters[targetIndex];

		// Steal OpenSkill stats
		survivor.mu = target.mu;
		survivor.sigma = target.sigma;
		survivor.osRating = target.osRating;
		survivor.score = target.score;
		survivor.placementMatchesLeft = target.placementMatchesLeft;
		survivor.skip = target.skip;

		if (!survivor.linkedTo || survivor.linkedTo.trim() === '') {
			survivor.linkedTo = target.linkedTo;
		}
		if (target.flag) {
			survivor.flag = true;
		}

		// Scavenge metadata
		if ((!survivor.series || survivor.series === 'Unknown Series') && target.series && target.series !== 'Unknown Series') {
			survivor.series = target.series;
		}
		if ((!survivor.imageUrl || survivor.imageUrl.trim() === '') && target.imageUrl) {
			survivor.imageUrl = target.imageUrl;
		}
		if ((!survivor.note || survivor.note.trim() === '') && target.note) {
			survivor.note = target.note;
		}

		// Repoint links
		const targetOriginalLower = target.originalName.toLowerCase();
		const targetMinLower = target.minimizedName.toLowerCase();

		service.characters.forEach(c => {
			if (c.skip && c.linkedTo && c.linkedTo.trim() !== '') {
				const linkLower = c.linkedTo.trim().toLowerCase();
				if (linkLower === targetOriginalLower || linkLower === targetMinLower) {
					c.linkedTo = survivor.minimizedName;
				}
			}
		});

		service.characters.splice(targetIndex, 1);

		if (direction === -1) {
			service.activeIndex--;
		}

		service.sortArrayByScore();
		service.minimizeActiveCard(true);

		Utilities.showSuccess(`Merged data! ${survivor.name} absorbed the old entry's stats.`, true);
		$rootScope.$broadcast('charactersUpdated');
	};

	// --- Cascading Links ---
	service.resolveLinks = (rankedArray, discardedArray) => {
		const finalArray = [];
		const linkMap = {};
		const trulyDiscarded = [];

		discardedArray.forEach(c => {
			if (c.linkedTo && c.linkedTo.trim() !== '') {
				const target = c.linkedTo.trim().toLowerCase();
				if (!linkMap[target]) linkMap[target] = [];
				linkMap[target].push(c);
			} else {
				trulyDiscarded.push(c);
			}
		});

		const processedSet = new Set();
		let cascadeOffset = 0.0001;

		// Pass parentScore instead of parentMu
		const insertWithLinks = (char, parentScore = null) => {
			if (processedSet.has(char.originalName)) return;
			processedSet.add(char.originalName);

			if (parentScore !== null) {
				// Force sigma to 0, making Score exactly equal to Mu
				char.mu = parentScore - cascadeOffset;
				char.sigma = 0.001;
				cascadeOffset += 0.0001;

				char.osRating = openSkillService.createCharacter(char);
				char.score = char.mu; // Since sigma is 0, score = mu
			} else {
				cascadeOffset = 0.0001;
			}

			finalArray.push(char);

			const target1 = char.originalName.toLowerCase();
			const target2 = char.minimizedName.toLowerCase();
			const links = (linkMap[target1] || []).concat(linkMap[target2] || []);

			delete linkMap[target1];
			delete linkMap[target2];

			links.forEach(linkedChar => {
				// Pass the literal score down the chain
				insertWithLinks(linkedChar, char.score);
			});
		};

		rankedArray.forEach(char => insertWithLinks(char));
		Object.keys(linkMap).forEach(key => {
			linkMap[key].forEach(char => trulyDiscarded.push(char));
		});

		finalArray.push(...trulyDiscarded);
		return finalArray;
	};

	service.reapplyLinks = () => {
		const mainList = [];
		const linkedList = [];

		service.characters.forEach(c => {
			if (c.skip && c.linkedTo && c.linkedTo.trim() !== '') {
				linkedList.push(c);
			} else {
				mainList.push(c);
			}
		});

		const resolvedArray = service.resolveLinks(mainList, linkedList);
		service.characters.length = 0;
		service.characters.push(...resolvedArray);
		service.sortArrayByScore();
	};

	// --- Placement Matches Engine ---
	service.startPlacementMatches = (queueToInsert) => {
		if (!queueToInsert || queueToInsert.length === 0) return false;

		service.minimizeActiveCard(true);
		service.mode = Mode.Placement;

		placementState.queue = queueToInsert;
		placementState.active = true;

		return service.nextPlacementTarget();
	};

	service.nextPlacementTarget = () => {
		if (placementState.queue.length === 0) {
			placementState.active = false;
			service.mode = Mode.Edit;
			service.characters.forEach(c => c.flag = false);

			service.sortArrayByScore();
			if (service._rankingContainer) service._rankingContainer.style.display = '';
			Utilities.showSuccess('Placement matches complete!', true);
			$rootScope.$broadcast('charactersUpdated');
			return false;
		}

		placementState.target = placementState.queue.shift();
		// OpenSkill typically requires ~5 matches to collapse the sigma (uncertainty) reliably
		placementState.target.placementMatchesLeft = 5;

		// Purge legacy phase trackers since OpenSkill handles the volatility naturally
		placementState.history.clear();

		return service.nextPlacementMatch();
	};

	service.nextPlacementMatch = () => {
		// Check if the current target has finished their calibration rounds
		if (placementState.target.placementMatchesLeft <= 0) {
			return service.nextPlacementTarget();
		}

		const activeRoster = service.characters.filter(c =>
			!c.skip &&
			c !== placementState.target &&
			!placementState.queue.includes(c)
		);

		if (activeRoster.length === 0) {
			placementState.target.placementMatchesLeft = 0;
			return service.nextPlacementTarget();
		}

		// 1. Strict filter: Exclude session placement history AND recent global matchups
		let candidates = activeRoster.filter(c =>
			!placementState.history.has(c.originalName) &&
			!service._recentMatchups.includes(service._getMatchupSignature(placementState.target, c))
		);

		// 2. Fallback: If the pool is exhausted, drop the global buffer block first
		if (candidates.length === 0) {
			candidates = activeRoster.filter(c => !placementState.history.has(c.originalName));
		}

		// 3. Absolute Fallback: Clear placement amnesia entirely if needed
		if (candidates.length === 0) {
			placementState.history.clear();
			candidates = activeRoster;
		}

		// Sort by closest mean skill (mu). We use mu instead of conservative score
		// here so the system tests if they truly belong at their current temporary level
		candidates.sort((a, b) => Math.abs(a.mu - placementState.target.mu) - Math.abs(b.mu - placementState.target.mu));

		service.leftCompare = placementState.target;

		// Pull from the top 3 closest opponents to introduce slight matchmaking variety
		const poolSize = Math.min(3, candidates.length);
		service.rightCompare = candidates[Math.floor(Math.random() * poolSize)];
		service._markMatchStart();

		return true;
	};

	service._applyMatchResult = (leftWon) => {
		const winner = leftWon ? service.leftCompare : service.rightCompare;
		const loser = leftWon ? service.rightCompare : service.leftCompare;

		// Let the openSkillService calculate the heavy Bayesian math
		const [newWinnerRating, newLoserRating] = openSkillService.calculateMatch(winner.osRating, loser.osRating);

		// Update Winner
		winner.osRating = newWinnerRating;
		winner.mu = newWinnerRating.mu;
		winner.sigma = newWinnerRating.sigma;
		winner.score = openSkillService.getConservativeScore(newWinnerRating);

		// Update Loser
		loser.osRating = newLoserRating;
		loser.mu = newLoserRating.mu;
		loser.sigma = newLoserRating.sigma;
		loser.score = openSkillService.getConservativeScore(newLoserRating);

		if (service.leftCompare && service.rightCompare) {
			service._recordMatchup(service.leftCompare, service.rightCompare);
		}
	};

	service.handlePlacementDecision = (leftWon) => {
		// Record the opponent so we don't fight them again in this calibration block
		placementState.history.add(service.rightCompare.originalName);

		// Calculate and apply the updated OpenSkill ratings
		service._applyMatchResult(leftWon);

		// Tick up the global play counts
		service.leftCompare.totalMatches = (service.leftCompare.totalMatches || 0) + 1;
		service.rightCompare.totalMatches = (service.rightCompare.totalMatches || 0) + 1;

		// Apply sorting matrix & UI sync
		service.sortArrayByScore();
		placementState.target.placementMatchesLeft--;
		$rootScope.$broadcast('charactersUpdated');

		return service.nextPlacementMatch();
	};

	// --- Endless Rank Engine ---
	service.startEndlessRank = () => {
		if (service.mode !== Mode.Edit && service.mode !== Mode.Endless) {
			Utilities.showWarning("A ranking session is active. Please pause/finish it before entering Endless Rank.", true);
			return false;
		}

		const validChars = service.characters.filter(c => !c.skip);
		if (validChars.length < 2) {
			Utilities.showError("Not enough un-skipped characters to run Endless Rank.", true);
			return false;
		}

		service.mode = Mode.Endless;
		service.nextEndlessMatch();
		return true;
	};

	service.nextEndlessMatch = () => {
		const validChars = service.characters.filter(c => !c.skip);
		if (validChars.length < 2) {
			Utilities.showError("Endless Rank session halted: Not enough un-skipped characters remaining.", true);
			service.pauseRankMode();
			return;
		}

		validChars.forEach(c => {
			if (typeof c.endlessMatches === 'undefined') c.endlessMatches = 0;
		});

		validChars.sort((a, b) => a.endlessMatches - b.endlessMatches);

		const poolSizeLeft = Math.max(2, Math.min(15, Math.floor(validChars.length * 0.15)));
		const leftIndex = Math.floor(Math.random() * poolSizeLeft);
		service.leftCompare = validChars[leftIndex];

		// 1. Base candidate list
		const allCandidates = validChars.filter(c => c !== service.leftCompare);

		// 2. Filter out anyone we recently fought
		let candidates = allCandidates.filter(c =>
			!service._recentMatchups.includes(service._getMatchupSignature(service.leftCompare, c))
		);

		// 3. Fallback: If everyone is on cooldown, ignore the cooldown
		if (candidates.length === 0) {
			candidates = allCandidates;
		}

		candidates.sort((a, b) => {
			const qualityA = openSkillService.getMatchQuality(service.leftCompare.osRating, a.osRating);
			const qualityB = openSkillService.getMatchQuality(service.leftCompare.osRating, b.osRating);

			// Match quality penalty combined with endlessMatches weighting
			const weightA = (1.0 - qualityA) + (a.endlessMatches * 2.0);
			const weightB = (1.0 - qualityB) + (b.endlessMatches * 2.0);

			return weightA - weightB;
		});

		const rightPoolSize = Math.min(30, candidates.length);
		const rightIndex = Math.floor(Math.random() * rightPoolSize);
		service.rightCompare = candidates[rightIndex];
		service._markMatchStart();
	};

	service.handleEndlessDecision = (leftWon) => {
		// Calculate and apply the updated OpenSkill ratings
		service._applyMatchResult(leftWon);

		// Tick up endless play counts
		service.leftCompare.endlessMatches = (service.leftCompare.endlessMatches || 0) + 1;
		service.rightCompare.endlessMatches = (service.rightCompare.endlessMatches || 0) + 1;

		$rootScope.$broadcast('charactersUpdated');
		service.nextEndlessMatch();
	};

	// --- Unified Interaction Handlers ---
	service.selectLeft = () => {
		service._saveUndoState();

		if (service.mode === Mode.Placement) return service.handlePlacementDecision(true);
		if (service.mode === Mode.Endless) return service.handleEndlessDecision(true);
		if (service.mode === Mode.RankFinite) return service.handleRankDecision(true);
	};

	service.selectRight = () => {
		service._saveUndoState();

		if (service.mode === Mode.Placement) return service.handlePlacementDecision(false);
		if (service.mode === Mode.Endless) return service.handleEndlessDecision(false);
		if (service.mode === Mode.RankFinite) return service.handleRankDecision(false);
	};

	service.getLowestMu = () => {
		let lowest = 100.0;
		service.characters.forEach(c => {
			if (typeof c.mu === 'number' && c.mu < lowest) lowest = c.mu;
		});
		return lowest === 100.0 ? 10.0 : lowest;
	};

	service.getLowestScore = () => {
		let lowest = 100.0;
		service.characters.forEach(c => {
			if (typeof c.score === 'number' && c.score < lowest) lowest = c.score;
		});
		return lowest === 100.0 ? 0.0 : lowest;
	};

	service.getLowestElo = service.getLowestScore;

	service.executeSkip = (character) => {
		character.skip = true;
		character.mu = service.getLowestMu() - 0.5;
		character.osRating = openSkillService.createCharacter(character);
		character.score = openSkillService.getConservativeScore(character.osRating);
		service.reapplyLinks();
		$rootScope.$broadcast('charactersUpdated');
	};

	service.skipLeft = () => {
		service._saveUndoState();
		if (service.mode === Mode.Placement) {
			service.executeSkip(service.leftCompare);
			service.leftCompare.placementMatchesLeft = 0;
			return service.nextPlacementTarget();
		}
		if (service.mode === Mode.Endless) {
			service.executeSkip(service.leftCompare);
			return service.nextEndlessMatch();
		}

		const skipped = service._rankedCharacters.splice(service._currentLeftIndex, 1).pop();
		skipped.skip = true;
		service._discardedCharacters.push(skipped);
		service.presentCardsForComparison();
	};

	service.skipRight = () => {
		service._saveUndoState();
		if (service.mode === Mode.Placement) {
			service.executeSkip(service.rightCompare);
			return service.nextPlacementMatch();
		}
		if (service.mode === Mode.Endless) {
			service.executeSkip(service.rightCompare);
			return service.nextEndlessMatch();
		}

		const skipped = service._rankedCharacters.splice(service._currentRightIndex, 1).pop();
		skipped.skip = true;
		service._discardedCharacters.push(skipped);
		service.presentCardsForComparison();
	};

	// --- The Undo Engine ---
	service._undoStack = [];

	service._saveUndoState = () => {
		if (service._undoStack.length >= 50) service._undoStack.shift();

		const state = {
			mode: service.mode,
			characters: angular.copy(service.characters),
			leftOriginalName: service.leftCompare ? service.leftCompare.originalName : null,
			rightOriginalName: service.rightCompare ? service.rightCompare.originalName : null
		};

		if (service.mode === Mode.RankFinite) {
			state.rankedCharacters = angular.copy(service._rankedCharacters);
			state.discardedCharacters = angular.copy(service._discardedCharacters);
		} else if (service.mode === Mode.Placement) {
			state.placementState = {
				active: placementState.active,
				minIdx: placementState.minIdx,
				maxIdx: placementState.maxIdx,
				phase: placementState.phase,
				history: Array.from(placementState.history),
				queue: angular.copy(placementState.queue),
				target: angular.copy(placementState.target)
			};
		}

		service._undoStack.push(state);
	};

	service.undoRank = () => {
		if (service._undoStack.length === 0) return false;
		const prevState = service._undoStack.pop();

		service.characters.length = 0;
		const restoredChars = prevState.characters.map(c => service._hydrateCharacter(c));
		service.characters.push(...restoredChars);
		service.mode = prevState.mode;

		if (prevState.leftOriginalName) {
			service.leftCompare = service.characters.find(c => c.originalName === prevState.leftOriginalName);
		}
		if (prevState.rightOriginalName) {
			service.rightCompare = service.characters.find(c => c.originalName === prevState.rightOriginalName);
		}

		if (service.mode === Mode.RankFinite) {
			service._rankedCharacters = prevState.rankedCharacters.map(c => service.characters.find(g => g.originalName === c.originalName));
			service._discardedCharacters = prevState.discardedCharacters.map(c => service.characters.find(g => g.originalName === c.originalName));
			service.presentCardsForComparison();
		} else if (service.mode === Mode.Placement) {
			placementState.active = prevState.placementState.active;
			placementState.minIdx = prevState.placementState.minIdx;
			placementState.maxIdx = prevState.placementState.maxIdx;
			placementState.phase = prevState.placementState.phase;
			placementState.history = new Set(prevState.placementState.history);

			placementState.queue = prevState.placementState.queue.map(c =>
				service.characters.find(g => g.originalName === c.originalName)
			);

			if (prevState.placementState.target) {
				placementState.target = service.characters.find(g => g.originalName === prevState.placementState.target.originalName);
				if (placementState.target) {
					placementState.target.placementMatchesLeft = prevState.placementState.target.placementMatchesLeft;
				}
			}
		}

		$rootScope.$broadcast('charactersUpdated');
		service._markMatchStart();
		return true;
	};

	// --- General UI, Parser, & Lifecycles ---
	service.startRankMode = (intensity = 'balanced') => {
		const validChars = service.characters.filter(c => !c.skip);
		if (validChars.length < 2) {
			Utilities.showWarning("Not enough characters to run a ranking bracket.", true);
			return false;
		}

		service.minimizeActiveCard(true);
		service.mode = Mode.RankFinite;
		service.lastRankMode = null;

		validChars.forEach(c => c.swissMatches = 0);

		// Calculate rounds based on selected intensity
		const baseRounds = Math.ceil(Math.log2(validChars.length));

		const intensityMap = {
			quick: Math.max(2, baseRounds),
			balanced: Math.max(3, baseRounds + 1),
			thorough: Math.max(4, baseRounds + 3)
		};

		service._maxSwissRounds = intensityMap[intensity] || intensityMap.balanced;
		service._swissHistory = new Set();

		return service.nextRankMatch();
	};

	service.resumeRankMode = () => {
		if (service.mode === Mode.Edit) {
			service.mode = service.lastRankMode || Mode.RankFinite;
		}
		service.lastRankMode = null

		// Both Swiss and Placement natively save their progress to the characters,
		// so resuming is just picking up where the generator left off.
		if (service.mode === Mode.RankFinite) return service.nextRankMatch();
		if (service.mode === Mode.Placement) return service.nextPlacementMatch();
		if (service.mode === Mode.Endless) return service.nextEndlessMatch();
	};

	service.pauseRankMode = () => {
		if (service.mode === Mode.Placement) {
			// Clear placement queue flags
			service.characters.forEach(c => c.flag = false);
		}

		if (service.mode !== Mode.Edit) {
			service.lastRankMode = service.mode;
		}

		service.mode = Mode.Edit;
		service.reapplyLinks();
		service.sortArrayByScore();

		if (service._rankingContainer) service._rankingContainer.style.display = '';
		$rootScope.$broadcast('charactersUpdated');
	};

	service.nextRankMatch = () => {
		const validChars = service.characters.filter(c => !c.skip);

		// Filter out characters that have finished their mandated rounds
		const activePool = validChars.filter(c => (c.swissMatches || 0) < service._maxSwissRounds);

		if (activePool.length < 2) {
			// Tournament is over!
			Utilities.showSuccess(`Rank calibration complete! Simulated ${service._maxSwissRounds} Swiss rounds.`, true);
			service.pauseRankMode();
			return false;
		}

		// Sort by OpenSkill conservative score to enforce Swiss pairing (winners play winners)
		activePool.sort((a, b) => b.score - a.score);

		// Pick the highest-ranking character who still needs a match
		service.leftCompare = activePool[0];

		// Scan down the bracket to find the closest opponent they haven't fought yet
		let opponent = null;
		for (let i = 1; i < activePool.length; i++) {
			const candidate = activePool[i];
			const sig = service._getMatchupSignature(service.leftCompare, candidate);

			if (!service._swissHistory.has(sig)) {
				opponent = candidate;
				break;
			}
		}

		// Fallback: If everyone nearby is a duplicate match, ignore history to prevent soft-locks
		if (!opponent) {
			opponent = activePool[1];
		}

		service.rightCompare = opponent;
		service._markMatchStart();
		return true;
	};

	service.handleRankDecision = (leftWon) => {
		// Record the fight to prevent immediate rematches in the Swiss bracket
		const sig = service._getMatchupSignature(service.leftCompare, service.rightCompare);
		service._swissHistory.add(sig);

		// Apply the unified OpenSkill math
		service._applyMatchResult(leftWon);

		// Tick Swiss rounds
		service.leftCompare.swissMatches = (service.leftCompare.swissMatches || 0) + 1;
		service.rightCompare.swissMatches = (service.rightCompare.swissMatches || 0) + 1;

		// Sync global match counts
		service.leftCompare.totalMatches = (service.leftCompare.totalMatches || 0) + 1;
		service.rightCompare.totalMatches = (service.rightCompare.totalMatches || 0) + 1;

		$rootScope.$broadcast('charactersUpdated');
		return service.nextRankMatch();
	};

	service.updateCharacterImage = (index, source) => {
		service.characters[index].imageUrl = source;
		if (!$rootScope.$$phase) $rootScope.$apply();
	};

	service.exportRoster = () => {
		return service.characters.map(c => {
			return {
				id: c.id,
				name: c.name,
				originalName: c.originalName,
				minimizedName: c.minimizedName,
				series: c.series,
				imageUrl: c.imageUrl,
				note: c.note,
				skip: c.skip,
				linkedTo: c.linkedTo,
				mu: c.mu,
				sigma: c.sigma,
				endlessMatches: c.endlessMatches,
				totalMatches: c.totalMatches
			};
		});
	};

	service.exportJson = () => {
		const exportData = {
			appState: {
				rankingInProgress: service.getRankingInProgress(),
			},
			characters: service.exportRoster()
		};
		Utilities.showSuccess(angular.toJson(exportData), false);
	};

	// --- Bulk Actions & Exports ---
	service.getFlaggedCharacters = () => {
		return service.characters.filter(c => c.flag);
	};

	service.clearAllFlags = () => {
		service.characters.forEach(c => /** @type {Object} */ (c).flag = false);
	};

	service.massDeleteFlagged = () => {
		return new Promise((resolve, reject) => {
			const flaggedCount = service.getFlaggedCharacters().length;
			if (flaggedCount === 0) return reject();

			service.inMessageBox = true;
			Utilities.confirm(`Are you sure you want to permanently delete ${flaggedCount} flagged character(s)?`, 'Confirm Mass Deletion').done(() => {
				for (let i = service.characters.length - 1; i >= 0; i--) {
					if (service.characters[i].flag) {
						service.characters.splice(i, 1);
					}
				}
				service.sortArrayByScore();
				service.inMessageBox = false;
				resolve();
			}).fail(() => {
				service.inMessageBox = false;
				reject();
			});
		});
	};

	service.massEditNotes = (newNote) => {
		const flagged = service.getFlaggedCharacters();
		const targetList = flagged.length > 0 ? flagged : service.characters.filter(c => !c.skip);

		let updatedCount = 0;
		targetList.forEach(c => {
			/** @type {Object} */ (c).note = newNote;
			updatedCount++;
		});
		return updatedCount;
	};

	service.stratifyNotes = (tierConfig) => {
		service.reapplyLinks();

		const targetList = service.characters;
		const total = targetList.length;
		if (total === 0) return 0;

		let currentListIndex = 0;
		let updatedCount = 0;

		for (let i = 0; i < tierConfig.length; i++) {
			const tier = tierConfig[i];
			const chunkSize = (tier.size === -1 || !tier.size) ? (total - currentListIndex) : tier.size;

			for (let j = 0; j < chunkSize; j++) {
				if (currentListIndex >= total) break;

				const char = targetList[currentListIndex];
				/** @type {Object} */ (char).note = tier.label;

				updatedCount++;
				currentListIndex++;
			}
		}

		return updatedCount;
	};

	service.massToggleSkip = (shouldSkip) => {
		const flagged = service.getFlaggedCharacters();
		const targetList = flagged.length > 0 ? flagged : service.characters.filter(c => !c.skip);

		let updatedCount = 0;
		targetList.forEach(c => {
			c.skip = shouldSkip;
			if (!shouldSkip) {
				c.linkedTo = '';
				if (c.sigma <= 0.001) {
					c.sigma = 8.333;
					c.osRating = openSkillService.createCharacter(c);
					c.score = openSkillService.getConservativeScore(c.osRating);
				}
			}
			updatedCount++;
		});
		return updatedCount;
	};

	service.massLinkAfter = (targetCharacterName) => {
		const flagged = service.getFlaggedCharacters();
		const targetList = flagged.length > 0 ? flagged : service.characters.filter(c => !c.skip);

		if (!targetCharacterName || targetCharacterName.trim() === '') return 0;

		const searchLower = targetCharacterName.trim().toLowerCase();
		let finalLinkText = targetCharacterName.trim();

		const leader = service.characters.find(char =>
			(char.originalName && char.originalName.toLowerCase() === searchLower) ||
			(char.minimizedName && char.minimizedName.toLowerCase() === searchLower)
		);

		if (leader) {
			finalLinkText = leader.minimizedName;
		}

		let updatedCount = 0;
		targetList.forEach(c => {
			/** @type {Object} */ (c).skip = true;
			/** @type {Object} */ (c).linkedTo = finalLinkText;
			updatedCount++;
		});

		service.reapplyLinks();
		return updatedCount;
	};

	// --- Smart Note Export ---
	service.exportNoteCommand = () => {
		const flagged = service.getFlaggedCharacters();
		const targetList = flagged.length > 0 ? flagged : [...service.characters];

		if (targetList.length === 0) {
			Utilities.showError('No characters available to export.', true);
			return;
		}

		const noteGroups = {};
		targetList.forEach(c => {
			const note = (c.note || '').trim();
			if (note !== '') {
				if (!noteGroups[note]) noteGroups[note] = [];
				noteGroups[note].push(c.originalName);
			}
		});

		if (Object.keys(noteGroups).length === 0) {
			Utilities.showError('None of the targeted characters have notes saved.', true);
			return;
		}

		let output = '';
		const MAX_DISCORD_LENGTH = 1900;

		for (const [noteText, names] of Object.entries(noteGroups)) {
			let currentNames = [];
			let currentLength = `$note $${noteText}`.length;

			for (let i = 0; i < names.length; i++) {
				const nameLen = names[i].length + (currentNames.length > 0 ? 1 : 0);

				if (currentLength + nameLen > MAX_DISCORD_LENGTH) {
					output += `$note ${currentNames.join('$')}$${noteText}\n`;
					currentNames = [names[i]];
					currentLength = `$note $${noteText}`.length + names[i].length;
				} else {
					currentNames.push(names[i]);
					currentLength += nameLen;
				}
			}
			if (currentNames.length > 0) {
				output += `$note ${currentNames.join('$')}$${noteText}\n`;
			}
		}

		Utilities.showSuccess(output.trim(), false);
	};

	// --- Smart Sort Export ---
	service.exportSort = () => {
		const flagged = service.getFlaggedCharacters();
		const targetList = flagged.length > 0 ? flagged : [...service.characters];
		const total = targetList.length;

		if (total === 0) {
			Utilities.showError('No characters available to export.', true);
			return;
		}
		if (targetList[0].originalName === undefined) {
			Utilities.showError('Looks like your characters don\'t have original names stored.', true);
			return;
		}

		targetList.sort((a, b) => b.score - a.score);

		let output = '';
		if (flagged.length === 0) {
			output += `$fm ${targetList[0].originalName}\n\n`;
		}

		if (total > 1) {
			const MAX_DISCORD_LENGTH = 1900;
			let currentChunk = `$smp ${targetList[0].originalName}`;

			for (let i = 1; i < total; i++) {
				const nextAddition = `$${targetList[i].originalName}`;

				if (currentChunk.length + nextAddition.length > MAX_DISCORD_LENGTH) {
					output += currentChunk + '\n\n';
					currentChunk = `$smp ${targetList[i-1].originalName}${nextAddition}`;
				} else {
					currentChunk += nextAddition;
				}
			}

			if (currentChunk !== `$smp ${targetList[total - 1].originalName}`) {
				output += currentChunk + '\n\n';
			}
		} else if (flagged.length > 0 && total === 1) {
			Utilities.showError('You need at least 2 characters selected to generate a differential sort.', true);
			return;
		}

		Utilities.showSuccess(output.trim(), false);
	};

	/* --- AniList API Handling --- */
	service.anilistApiUrl = 'https://graphql.anilist.co';
	service.anilistConfig = {headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}};
	service.anilistReqInterval = null;

	service.characterQuery = `
		query ($seriesName: String, $pageNumber: Int) {
			Media (search: $seriesName, type: ANIME) {
			characters (page: $pageNumber) {
			  pageInfo { currentPage hasNextPage }
			  edges { node { name { first last alternative } image { large } } }
			}
		  }
		}`;

	service.parseInputField = (inputText) => {
		service.getSortableObject();
		if (!inputText || inputText === '') return;

		const mergeCharacters = service.characters.length > 0;
		const jsonInput = Utilities.tryParseJson(inputText);

		if (jsonInput) {
			try {
				if (mergeCharacters) {
					const charsToMerge = jsonInput.characters ? jsonInput.characters : (Array.isArray(jsonInput) ? jsonInput : []);
					service.mergeAll(charsToMerge);
				} else {
					if (jsonInput.appState) {
						if (jsonInput.appState.rankingInProgress) service.mode = Mode.RankFinite;
					}
					service.updateAll(jsonInput.characters ? jsonInput.characters : jsonInput);
				}
				service.sortArrayByScore();

				if (service.mode === Mode.RankFinite) {
					service.resumeRankMode();
				}

				Utilities.showSuccess('Done processing the input', true);
				$rootScope.$broadcast('charactersUpdated');
			} catch(e) {
				Utilities.showError('Well, you screwed something up: ' + e.message, true);
			}
			return;
		}

		let initialText = inputText.replace(/\n\n+/g,'\n').replace(/\u200b/g,'');
		initialText = initialText.replace(/\[([1-9]|1[12]):([0-5][0-9]) [AP]M] BOTMuda(e|maid)( \d+)?: /gi, '');
		initialText = initialText.replace(/Muda(e|maid \d+)BOTToday at ([1-9]|1[12]):([0-5][0-9]) [AP]M/gi, '');
		initialText = initialText.replace(/<(https?:\/\/[^>]+)>/gi, '$1');

		const hasSeriesHeaders = /(.*) (- | +)\d+\/\d+/.test(initialText);
		if (!hasSeriesHeaders) initialText = "Unknown Series - 1/1\n" + initialText;

		initialText = initialText.replace(/(.*) (- | +)\d+\/\d+/g, '$$$1');
		const initialSeriesArray = initialText.split('$').slice(1);
		const seriesArray = [];
    const shouldSeedRanks = !hasSeriesHeaders && !mergeCharacters;
    const totalCharactersToImport = rawLines.length;
    let globalImportIndex = 0;


		initialSeriesArray.forEach(seriesChunk => {
			const seriesData = seriesChunk.trim().split('\n');
			const seriesName = seriesData.splice(0,1)[0].trim();
			const series = { name: seriesName, characters: [], page: 1 };

			let lookupRequiredForSeries = false;

			seriesData.forEach(characterString => {
				const cString = characterString.trim();
				const imageURLIndex = cString.lastIndexOf(' - https:');

				let characterImage = null;
				let nameAndNotePart = cString;

				if (imageURLIndex > 0) {
				   characterImage = cString.substring(imageURLIndex + 3).trim();
				   nameAndNotePart = cString.substring(0, imageURLIndex).trim();
				}

				let noteText = '';
				const firstPipeIndex = nameAndNotePart.indexOf(' | ');
				if (firstPipeIndex !== -1) {
					noteText = nameAndNotePart.substring(firstPipeIndex + 3).trim();
					nameAndNotePart = nameAndNotePart.substring(0, firstPipeIndex).trim();
				}

				const originalName = nameAndNotePart;
				const characterName = originalName.replace(/(?: \([A-Z]+\))?/gi, '').trim();
        const rankOffset = shouldSeedRanks ? (totalCharactersToImport - globalImportIndex) * 0.05 : 0;
        const startingSigma = shouldSeedRanks ? 7.0 : 8.333;

				let character = {
					className: 'CharacterThumb',
					imageUrl: characterImage,
					minimizedName: Utilities.minimizeName(characterName),
					name: characterName,
					originalName: originalName,
					series: seriesName,
					note: noteText,
					skip: false,
					linkedTo: '',
					flag: false,
					placementMatchesLeft: 0,
          mu: 25.0 + rankOffset,
          sigma: startingSigma,
				};

				character = service._hydrateCharacter(character);

				const needsLookupForThisCharacter = (imageURLIndex === -1);

				if (mergeCharacters) {
					const mergeResults = service.mergeCharacter(character);
					const canonicalChar = mergeResults.match ? mergeResults.match : character;
					const lacksImage = !canonicalChar.imageUrl || canonicalChar.imageUrl.trim() === '';

					if (lacksImage) {
						series.characters.push(canonicalChar);
						lookupRequiredForSeries = true;
					}
				} else {
					service.characters.push(character);
					if (needsLookupForThisCharacter) {
						series.characters.push(character);
						lookupRequiredForSeries = true;
					}
				}
			});

			if (lookupRequiredForSeries) seriesArray.push(series);
		});

		service.characters.forEach(c => service._hydrateCharacter(c));
		service.sortArrayByScore();

		if (seriesArray.length > 0) {
			Utilities.showWarning('Looking up characters from AniList', true);
			service.anilistReqInterval = $interval(service.fetchSeries, 800, 0, true, seriesArray);
			service.anilistReqInterval.then(service.requestIntervalResolve, service.requestIntervalReject);
		} else {
			Utilities.showSuccess('Done processing the input', true);
			$rootScope.$broadcast('charactersUpdated');
		}
	};

	service.requestIntervalResolve = () => console.log('AniList Interval Resolved');
	service.requestIntervalReject = () => {
		Utilities.showSuccess('Done looking up characters from AniList', true);
		$rootScope.$broadcast('charactersUpdated');
	};

	// --- GitHub Sync Methods ---
	service.redirectToGitHub = (clientId) => {
		const redirectUri = window.location.origin + window.location.pathname;
		window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=gist&redirect_uri=${encodeURIComponent(redirectUri)}`;
	};

	service.exchangeAuthCodeForToken = (workerUrl, authCode) => {
		return $http({
			method: 'POST',
			url: workerUrl,
			data: { code: authCode },
			headers: { 'Content-Type': 'application/json' }
		}).then(response => {
			if (response.data && response.data.access_token) {
				return response.data.access_token;
			}
			throw new Error(response.data.error_description || 'Token retrieval failed.');
		});
	};

	service.findOrCreateSyncGist = (token) => {
		const filename = "mudae_ranker_sync.json";
		const headers = {
			'Authorization': `Bearer ${token}`,
			'Accept': 'application/vnd.github+json'
		};

		return $http({
			method: 'GET',
			url: 'https://api.github.com/gists?per_page=100',
			headers: headers
		}).then(response => {
			const gists = response.data || [];
			const existingGist = gists.find(g => g.files && g.files[filename]);

			if (existingGist) {
				return { id: existingGist.id, isNew: false };
			}

			return $http({
				method: 'POST',
				url: 'https://api.github.com/gists',
				headers: headers,
				data: {
					description: "Mudae Ranker Cross-device Sync Data",
					public: false,
					files: {
						[filename]: {
							content: angular.toJson(service.exportRoster())
						}
					}
				}
			}).then(createResponse => {
				return { id: createResponse.data.id, isNew: true };
			});
		});
	};

	service.loadFromGist = (token, gistId) => {
		const cacheBuster = new Date().getTime();

		return $http({
			method: 'GET',
			url: `https://api.github.com/gists/${gistId}?t=${cacheBuster}`,
			headers: {
				'Authorization': `Bearer ${token}`,
			}
		}).then(response => {
			const filename = "mudae_ranker_sync.json";
			if (response.data && response.data.files && response.data.files[filename]) {
				const content = response.data.files[filename].content;
				return JSON.parse(content);
			}
			throw new Error("Sync file missing inside target Gist.");
		});
	};

	service.saveToGist = (token, gistId, characterData) => {
		const payload = Array.isArray(characterData) ? characterData : service.exportRoster();
		return $http({
			method: 'PATCH',
			url: `https://api.github.com/gists/${gistId}`,
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github+json'
			},
			data: {
				files: {
					"mudae_ranker_sync.json": {
						content: angular.toJson(payload)
					}
				}
			}
		});
	};

	service.fetchSeries = (seriesArray) => {
		const series = seriesArray.pop();
		if (!series) return;

		const queryBody = angular.toJson({
			query: service.characterQuery,
			variables: {seriesName: series.name, pageNumber: series.page}
		});

		$http.post(service.anilistApiUrl, queryBody, service.anilistConfig).then(response => {
			const dataPayload = response.data ? response.data.data : null;
			const mediaData = dataPayload ? dataPayload['Media'] : null;

			if (!mediaData || !mediaData['characters'] || !mediaData['characters']['edges']) {
				console.warn(`AniList database yielded zero matching results for series: "${series.name}"`);
				if (seriesArray.length === 0) {
					$interval.cancel(service.anilistReqInterval);
				}
				return;
			}

			const characterList = mediaData['characters']['edges'];
			let localCharactersLength = series.characters.length;

			characterList.forEach(edge => {
				const character = edge.node;
				let characterFirstName = character.name.first ? character.name.first.trim() : '';
				let characterLastName = character.name.last ? character.name.last.trim() : '';

				const hasFirstName = characterFirstName.length > 0;
				const hasLastName = characterLastName.length > 0;

				if (hasFirstName) characterFirstName = Utilities.minimizeName(characterFirstName);
				if (hasLastName) characterLastName = Utilities.minimizeName(characterLastName);

				const characterNameUS = (hasFirstName ? characterFirstName : '') + (hasLastName ? characterLastName : '');
				const characterNameJP = (hasLastName ? characterLastName : '') + (hasFirstName ? characterFirstName : '');

				for (let j = 0; j < localCharactersLength; j++) {
					const localCharacter = series.characters[j];
					const localCharacterName = localCharacter.minimizedName;
					let characterFound = false;

					if (localCharacterName === characterNameUS || localCharacterName === characterNameJP ||
						localCharacterName === characterFirstName || localCharacterName === characterLastName) {
						characterFound = true;
					} else {
						const alternativeNames = character.name['alternative'] || [];
						for (let k = 0; k < alternativeNames.length; k++) {
							if (localCharacterName === Utilities.minimizeName(alternativeNames[k])) {
								characterFound = true;
								break;
							}
						}
					}

					if (characterFound) {
						localCharacter.imageUrl = character.image['large'];
						series.characters.splice(j, 1);
						localCharactersLength--;
						break;
					}
				}
			});

			if (localCharactersLength > 0 && mediaData['characters']['pageInfo']['hasNextPage']) {
				series.page++;
				seriesArray.push(series);
			}

			if (seriesArray.length === 0) {
				$interval.cancel(service.anilistReqInterval);
			}
		}).catch(err => {
			console.error("Hard network failure occurred during AniList fetch operations:", err);
			if (seriesArray.length === 0) {
				$interval.cancel(service.anilistReqInterval);
			}
		});
	};
}]);

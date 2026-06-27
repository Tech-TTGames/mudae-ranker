/* global mudaeRanker */
mudaeRanker.service('Characters', ['$rootScope', '$interval', '$http', 'Utilities', 'EloEngine', 'PreferenceList', function($rootScope, $interval, $http, Utilities, EloEngine, PreferenceList) {
	const service = this;

	service.characters = [];

	// --- Global States ---
	service.leftCompare = null;
	service.rightCompare = null;
	service.activeIndex = -1;
	service.inMessageBox = false;
	service.sortableObject = null;

	// Mode definitions and helper predicates
	const Mode = { Edit: 0, RankFinite: 1, Placement: 2, Endless: 3 };
	service.Modes = Mode; // Expose constants to outer controller scopes
	service.mode = Mode.Edit;

	service.isPlacementMode = () => service.mode === Mode.Placement;
	service.isEndlessMode = () => service.mode === Mode.Endless;
	service.getRankingInProgress = () => service.mode !== Mode.Edit; // Single unified declaration

	Object.defineProperty(service, 'rankingInProgress', {
		get: () => service.getRankingInProgress(),
		configurable: true
	});

	// --- Placement Matches State ---
	const placementState = {
		active: false,
		queue: [],
		target: null,
		minElo: EloEngine.MIN_ELO,
		maxElo: EloEngine.MAX_ELO,
		history: new Set()
	};

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

		const safeElo = (char) => {
			if (!char || typeof char.elo !== 'number' || Number.isNaN(char.elo)) {
				return EloEngine.DEFAULT_ELO;
			}
			return char.elo;
		};

		const prevElo = safeElo(prevChar);
		const nextElo = safeElo(nextChar);

		if (prevChar && nextChar) {
			movedChar.elo = (prevElo + nextElo) / 2;
		} else if (prevChar) {
			movedChar.elo = prevElo - 10; // Dropped at the absolute bottom
		} else if (nextChar) {
			movedChar.elo = nextElo + 10; // Dropped at the absolute top
		}

		$rootScope.$broadcast('charactersUpdated');
	};

	service.handleSkippedCharacter = (index) => {
		const character = service.characters[index];
		if (!character) return;

		if (character.skip) {
			character.elo = service.getLowestElo() - 10;
		} else {
			character.linkedTo = '';
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
		return service.getRankingInProgress() ? 'RankMode' : 'EditMode';
	};

	service.getNextModeName = () => {
		return service.getRankingInProgress() ? 'Start Editing' : 'Start Ranking';
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

	service.clickCard = (element, index) => {
		if (service.mode === Mode.Edit && index !== service.activeIndex) {
			// FIX: Minimize current cards first without systematically re-enabling drag states
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
	service.sortArrayByElo = () => {
		service.characters.sort((a, b) => b.elo - a.elo);
	};

	service.updateAll = (newCharacters) => {
		service.characters.length = 0;
		const total = newCharacters.length;

		const processedCharacters = newCharacters.map((c, index) => {
			if (c.className) {
				c.className = c.className.replace(/ ?CharacterFull( )?/, '');
			}
			if (typeof c.elo === 'undefined') {
				c.elo = EloEngine.seedInitialElo(index, total);
			}
			if (typeof c.placementMatchesLeft === 'undefined') {
				c.placementMatchesLeft = 0;
			}
			return c;
		});

		service.characters.push(...processedCharacters);
		service.sortArrayByElo();

		if (!$rootScope.$$phase) {
			$rootScope.$apply();
		}
		$rootScope.$broadcast('charactersUpdated');
	};

	service.addNewCharacter = (originalName, seriesName, imageUrl, skip) => {
		const characterName = originalName.replace(/(?: \([A-Z]+\))?/gi, '').trim();
		const character = {
			className: 'CharacterThumb',
			imageUrl: imageUrl,
			minimizedName: Utilities.minimizeName(characterName),
			name: characterName,
			originalName: originalName,
			series: seriesName,
			skip: skip,
			linkedTo: '',
			flag: false,
			elo: EloEngine.DEFAULT_ELO,
			placementMatchesLeft: skip ? 0 : 5
		};

		service.characters.push(character);
		if (!skip) {
			service.startPlacementMatches([character]);
		} else {
			service.sortArrayByElo();
			$rootScope.$broadcast('charactersUpdated');
		}
	};

	service.mergeCharacter = (character) => {
		const total = service.characters.length;
		for (let i = 0; i < total; i++) {
			const matchCharacter = service.characters[i];
			if (matchCharacter.minimizedName === character.minimizedName &&
			   (matchCharacter.series === character.series || matchCharacter.series === 'Unknown Series' || character.series === 'Unknown Series')) {

				// 1. Upgrade Series if the new paste provides missing context
				if (matchCharacter.series === 'Unknown Series' && character.series !== 'Unknown Series') {
					matchCharacter.series = character.series;
				}

				// 2. Upgrade Notes
				if (character.note && character.note !== '') {
					matchCharacter.note = character.note;
				}

				// 3. Aggressive Image Override (Drops the useless name sync)
				if (character.imageUrl && character.imageUrl.trim() !== '') {
					matchCharacter.imageUrl = character.imageUrl;
				}

				return { code: matchCharacter.imageUrl ? 'NoAction' : 'Lookup', match: matchCharacter };
			}
		}

		// --- BRAND NEW ARRIVAL ---
		character.elo = EloEngine.DEFAULT_ELO;
		character.placementMatchesLeft = character.skip ? 0 : 5;
		character.flag = !character.skip;

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

		// 1. Steal Elo and Calibration
		survivor.elo = target.elo;
		survivor.placementMatchesLeft = target.placementMatchesLeft;
		survivor.skip = target.skip;

		if (!survivor.linkedTo || survivor.linkedTo.trim() === '') {
			survivor.linkedTo = target.linkedTo;
		}
		if (target.flag) {
			survivor.flag = true;
		}

		// 2. Scavenge missing metadata
		if ((!survivor.series || survivor.series === 'Unknown Series') && target.series && target.series !== 'Unknown Series') {
			survivor.series = target.series;
		}
		if ((!survivor.imageUrl || survivor.imageUrl.trim() === '') && target.imageUrl) {
			survivor.imageUrl = target.imageUrl;
		}
		if ((!survivor.note || survivor.note.trim() === '') && target.note) {
			survivor.note = target.note;
		}

		// 3. Prevent Orphaned Links: Repoint any other characters that were following the target
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

		// 4. Delete target
		service.characters.splice(targetIndex, 1);

		if (direction === -1) {
			service.activeIndex--;
		}

		// 5. Cleanup UI
		service.sortArrayByElo();
		service.minimizeActiveCard(true);

		Utilities.showSuccess(`Merged data! ${survivor.name} absorbed the old entry's stats and missing info.`, true);

		// 6. Force the controller to save the newly merged state to localStorage immediately!
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
		let cascadeOffset = 0.001;

		const insertWithLinks = (char, parentElo = null) => {
			if (processedSet.has(char.originalName)) return;
			processedSet.add(char.originalName);

			if (parentElo !== null) {
				char.elo = parentElo - cascadeOffset;
				cascadeOffset += 0.001;
			} else {
				cascadeOffset = 0.001;
			}

			finalArray.push(char);

			const target1 = char.originalName.toLowerCase();
			const target2 = char.minimizedName.toLowerCase();
			const links = (linkMap[target1] || []).concat(linkMap[target2] || []);

			delete linkMap[target1];
			delete linkMap[target2];

			links.forEach(linkedChar => {
				insertWithLinks(linkedChar, char.elo);
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
		service.sortArrayByElo();
	};

	// --- Advanced Binary-Elo Placement Matches Engine ---
	service.startPlacementMatches = (queueToInsert) => {
		if (!queueToInsert || queueToInsert.length === 0) return false;

		service.minimizeActiveCard(true);
		service.mode = Mode.Placement;
		service._initializeRankMode();

		placementState.queue = queueToInsert;
		placementState.active = true;

		return service.nextPlacementTarget();
	};

	service.nextPlacementTarget = () => {
		if (placementState.queue.length === 0) {
			placementState.active = false;
			service.mode = Mode.Edit;
			service.characters.forEach(c => c.flag = false);

			service.sortArrayByElo();
			if (service._rankingContainer) service._rankingContainer.style.display = '';
			Utilities.showSuccess('Placement matches complete!', true);
			$rootScope.$broadcast('charactersUpdated');
			return false;
		}

		let highestElo = EloEngine.MAX_ELO;
		let lowestElo = EloEngine.MIN_ELO;

		const activeRoster = service.characters.filter(c => !c.skip);
		if (activeRoster.length > 0) {
			highestElo = Math.max(...activeRoster.map(c => c.elo || 1200));
			lowestElo = Math.min(...activeRoster.map(c => c.elo || 1200));
		}

		placementState.target = placementState.queue.shift();
		placementState.target.placementMatchesLeft = 7;

		placementState.minElo = lowestElo;
		placementState.maxElo = highestElo;
		placementState.history.clear();

		return service.nextPlacementMatch();
	};

	service.nextPlacementMatch = () => {
		if (placementState.target.placementMatchesLeft <= 0) {
			return service.nextPlacementTarget();
		}

		const midElo = (placementState.minElo + placementState.maxElo) / 2;

		// FIX: Exclude the rest of the pending queue and any uncalibrated heroes from opponent pools
		const absoluteCandidates = service.characters.filter(c =>
			c !== placementState.target &&
			!c.skip &&
			c.placementMatchesLeft <= 0 &&
			!placementState.queue.includes(c)
		);

		if (absoluteCandidates.length === 0) {
			Utilities.showWarning(`No valid opponents available to rank ${placementState.target.name} against. Placement bypassed.`, true);
			placementState.target.placementMatchesLeft = 0;
			return service.nextPlacementTarget();
		}

		let candidates = absoluteCandidates.filter(c => !placementState.history.has(c.originalName));
		if (candidates.length === 0) {
			placementState.history.clear();
			candidates = absoluteCandidates;
		}

		candidates.sort((a, b) => Math.abs(a.elo - midElo) - Math.abs(b.elo - midElo));

		service.leftCompare = placementState.target;
		service.rightCompare = candidates[0];

		return true;
	};

	service.handlePlacementDecision = (leftWon) => {
		const midElo = (placementState.minElo + placementState.maxElo) / 2;

		if (leftWon) {
			placementState.minElo = midElo;
		} else {
			placementState.maxElo = midElo;
		}

		placementState.history.add(service.rightCompare.originalName);

		const K_PLACEMENT_AGGRESSIVE = 120;
		const matchResult = EloEngine.calculateMatch(
			service.leftCompare.elo,
			service.rightCompare.elo,
			leftWon ? 1 : 0,
			K_PLACEMENT_AGGRESSIVE,
			EloEngine.K_NORMAL
		);

		service.leftCompare.elo = matchResult.newRatingA;
		service.rightCompare.elo = matchResult.newRatingB;

		service.sortArrayByElo();
		placementState.target.placementMatchesLeft--;
		$rootScope.$broadcast('charactersUpdated');
		return service.nextPlacementMatch();
	};

	// --- Endless Rank Engine ---
	service.startEndlessRank = () => {
		if (service.getRankingInProgress() && service.mode !== Mode.Endless) {
			Utilities.showWarning("A calibration session is already active. Please pause or finish it before entering Endless Rank.", true);
			return false;
		}

		const validChars = service.characters.filter(c => !c.skip);
		if (validChars.length < 2) {
			Utilities.showError("Not enough un-skipped characters to run Endless Rank.", true);
			return false;
		}

		service.mode = Mode.Endless;
		service._initializeRankMode();
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

		// 1. Initialize trackers for any new arrivals
		validChars.forEach(c => {
			if (typeof c.endlessMatches === 'undefined') c.endlessMatches = 0;
		});

		// 2. Sort the roster to prioritize characters with the fewest endless matches
		validChars.sort((a, b) => a.endlessMatches - b.endlessMatches);

		// 3. Pick the Left Character from a rotating pool of the bottom 15% least-played characters.
		// This guarantees even distribution while keeping the exact character slightly unpredictable.
		const poolSizeLeft = Math.max(2, Math.min(15, Math.floor(validChars.length * 0.15)));
		const leftIndex = Math.floor(Math.random() * poolSizeLeft);
		service.leftCompare = validChars[leftIndex];

		// 4. Find the Right Character (Opponent)
		const candidates = validChars.filter(c => c !== service.leftCompare);

		candidates.sort((a, b) => {
			// Calculate standard Elo distance
			const eloDiffA = Math.abs(a.elo - service.leftCompare.elo);
			const eloDiffB = Math.abs(b.elo - service.leftCompare.elo);

			// MASSIVE penalty for having played matches.
			// 500 points means a character with 1 match will almost NEVER be picked
			// over a character with 0 matches, regardless of how close their Elos are.
			const weightA = eloDiffA + (a.endlessMatches * 500);
			const weightB = eloDiffB + (b.endlessMatches * 500);

			return weightA - weightB;
		});

		// Widen the pool from 15 to 30!
		// This means it will randomly grab one of the top 30 candidates,
		// introducing much more variety even if they aren't a perfect Elo match.
		const rightPoolSize = Math.min(30, candidates.length);
		const rightIndex = Math.floor(Math.random() * rightPoolSize);
		service.rightCompare = candidates[rightIndex];
	};

	service.handleEndlessDecision = (leftWon) => {
		const matchResult = EloEngine.calculateMatch(
			service.leftCompare.elo,
			service.rightCompare.elo,
			leftWon ? 1 : 0
		);

		service.leftCompare.elo = matchResult.newRatingA;
		service.rightCompare.elo = matchResult.newRatingB;

		// 5. Log the match so these characters are pushed to the back of the queue
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

		PreferenceList.addAnswer(-1);
		service.presentCardsForComparison();
	};

	service.selectRight = () => {
		service._saveUndoState();
		if (service.mode === Mode.Placement) return service.handlePlacementDecision(false);
		if (service.mode === Mode.Endless) return service.handleEndlessDecision(false);

		PreferenceList.addAnswer(1);
		service.presentCardsForComparison();
	};

	service.getLowestElo = () => {
		let lowest = EloEngine.MIN_ELO;
		service.characters.forEach(c => {
			if (c.elo < lowest) lowest = c.elo;
		});
		return lowest;
	};

	service.executeSkip = (character) => {
		character.skip = true;
		character.elo = service.getLowestElo() - 10;
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
		PreferenceList.addAnswer(0);
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
		PreferenceList.addAnswer(0);
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
			state.prefState = angular.copy(PreferenceList.getState());
		}
		// FIX: Convert the Set into a serializable Array and store tracking ranges
		else if (service.mode === Mode.Placement) {
			state.placementState = {
				active: placementState.active,
				minElo: placementState.minElo,
				maxElo: placementState.maxElo,
				history: Array.from(placementState.history), // Safe serialization array conversion
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
		service.characters.push(...prevState.characters);
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
			PreferenceList.setState(prevState.prefState);
			service.presentCardsForComparison();
		}
		// FIX: Fully restore limits and hydrate the ES6 history Set cleanly
		else if (service.mode === Mode.Placement) {
			placementState.active = prevState.placementState.active;
			placementState.minElo = prevState.placementState.minElo;
			placementState.maxElo = prevState.placementState.maxElo;

			// Reconstitute the Set from the flat array snapshot
			placementState.history = new Set(prevState.placementState.history);

			// Re-bind objects back to live grid element references
			placementState.queue = prevState.placementState.queue.map(c => service.characters.find(g => g.originalName === c.originalName));
			if (prevState.placementState.target) {
				placementState.target = service.characters.find(g => g.originalName === prevState.placementState.target.originalName);
			}
		}

		if (service._rankingContainer) service._rankingContainer.style.display = 'block';
		$rootScope.$broadcast('charactersUpdated');
		return true;
	};

	// --- General UI, Parser, & Lifecycles ---
	service._initializeRankMode = () => {
		if (!service._rankingContainer) service._rankingContainer = $('#RankingContainer')[0];
		service._rankingContainer.style.display = 'block';
	};

	service.startRankMode = () => {
		service.mode = Mode.RankFinite;
		service._initializeRankMode();
		service._rankedCharacters = [];
		service._discardedCharacters = [];

		service.characters.forEach(character => {
			if (character.skip) service._discardedCharacters.push(character);
			else service._rankedCharacters.push(character);
		});

		PreferenceList.resetToCount(service._rankedCharacters.length);
		service.presentCardsForComparison();
	};

	service.resumeRankMode = () => {
		service.mode = Mode.RankFinite;
		service._initializeRankMode();
		service._rankedCharacters = [];
		service._discardedCharacters = [];

		service.characters.forEach(character => {
			if (character.skip) service._discardedCharacters.push(character);
			else service._rankedCharacters.push(character);
		});

		PreferenceList.resume(service._rankedCharacters.length);
		service.presentCardsForComparison();
	};

	service.presentCardsForComparison = () => {
		const displayCards = PreferenceList.getQuestion();
		if (displayCards) {
			service._currentLeftIndex = displayCards.leftCompareIndex;
			service._currentRightIndex = displayCards.rightCompareIndex;
			service.leftCompare = service._rankedCharacters[service._currentLeftIndex];
			service.rightCompare = service._rankedCharacters[service._currentRightIndex];

			$rootScope.$broadcast('charactersUpdated');
		} else {
			service.endRankMode();
		}
	};

	service.endRankMode = () => {
		if (service._rankingContainer) service._rankingContainer.style.display = '';
		const sortedIndices = PreferenceList.getOrder();
		const rankedCharacters = sortedIndices.map(idx => service._rankedCharacters[idx]);
		const newCharacters = service.resolveLinks(rankedCharacters, service._discardedCharacters);

		service.mode = Mode.Edit;
		service.updateAll(newCharacters);
	};

	service.pauseRankMode = () => {
		if (service._rankingContainer) service._rankingContainer.style.display = '';

		if (service.mode === Mode.Placement) {
			placementState.active = false;
			service.characters.forEach(c => c.flag = false);
		} else if (service.mode === Mode.RankFinite) {
			PreferenceList.pause();
			const sortedIndices = PreferenceList.getOrder();
			PreferenceList.sortIndices();

			const total = sortedIndices.length;
			const newCharacters = sortedIndices.map(idx => service._rankedCharacters[idx]);

			sortedIndices.sort((a, b) => a - b);
			for (let i = total - 1; i >= 0; i--) {
				service._rankedCharacters.splice(sortedIndices[i], 1);
			}

			newCharacters.push(...service._rankedCharacters, ...service._discardedCharacters);
			service.updateAll(newCharacters);
		}

		service.mode = Mode.Edit;
		service.sortArrayByElo();
		$rootScope.$broadcast('charactersUpdated');
	};

	service.updateCharacterImage = (index, source) => {
		service.characters[index].imageUrl = source;
		if (!$rootScope.$$phase) $rootScope.$apply();
	};

	service.exportJson = () => {
		const exportData = {
			appState: {
				rankingInProgress: service.getRankingInProgress(),
				preferenceState: PreferenceList.getState()
			},
			characters: service.characters
		};
		Utilities.showSuccess(angular.toJson(exportData), false);
	};

	// --- Smart Bulk Actions & Exports ---
	service.getFlaggedCharacters = () => {
		return service.characters.filter(c => c.flag);
	};

	service.clearAllFlags = () => {
		service.characters.forEach(c => /** @type {Object} */ (c).flag = false);
	};

	// Delete MUST always remain strictly bound to flagged items to prevent nuking the database.
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
				service.sortArrayByElo();
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
			// If un-skipping, wipe any dangling links cleanly
			if (!shouldSkip) {
				c.linkedTo = '';
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

		// 1. Scan the database to find the canonical leader card
		const leader = service.characters.find(char =>
			(char.originalName && char.originalName.toLowerCase() === searchLower) ||
			(char.minimizedName && char.minimizedName.toLowerCase() === searchLower)
		);

		if (leader) {
			// 2. If the character exists, ground the foreign key to its true minimized identity
			finalLinkText = leader.minimizedName;
		}

		// 3. Batch apply the sanitized reference to targets
		let updatedCount = 0;
		targetList.forEach(c => {
			/** @type {Object} */ (c).skip = true;
			/** @type {Object} */ (c).linkedTo = finalLinkText;
			updatedCount++;
		});

		// 4. Force compilation and sorting matrix updates
		service.reapplyLinks();

		return updatedCount;
	};

	// --- Smart Note Export: Includes Skipped Characters ---
	service.exportNoteCommand = () => {
		const flagged = service.getFlaggedCharacters();
		const targetList = flagged.length > 0 ? flagged : [...service.characters];

		if (targetList.length === 0) {
			Utilities.showError('No characters available to export.', true);
			return;
		}

		// 1. Group characters by their exact note string
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

		// 2. Dynamically pack chunks up to Discord's limit
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

	// --- Smart Sort Export: Includes Skipped & Linked Chains ---
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

		// Ensure the local clone matches absolute Elo alignment
		targetList.sort((a, b) => b.elo - a.elo);

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
					// FIX: Re-hydrate legacy metadata states and lists during JSON ingest loops
					if (jsonInput.appState) {
						if (jsonInput.appState.rankingInProgress) service.mode = Mode.RankFinite;
						if (jsonInput.appState.preferenceState) PreferenceList.setState(jsonInput.appState.preferenceState);
					}
					service.updateAll(jsonInput.characters ? jsonInput.characters : jsonInput);
				}
				service.sortArrayByElo();
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

		initialSeriesArray.forEach(seriesChunk => {
			const seriesData = seriesChunk.trim().split('\n');
			const seriesName = seriesData.splice(0,1)[0].trim();
			const series = { name: seriesName, characters: [], page: 1 };

			// FIX: Use a discrete state flag to properly evaluate lookups per-series block
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
					placementMatchesLeft: 0
				};

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

		service.characters.forEach((c, index) => {
			if (typeof c.elo === 'undefined') {
				c.elo = EloEngine.seedInitialElo(index, service.characters.length);
			}
		});

		service.sortArrayByElo();

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

	// 1. Kickoff the flow: Kick the user over to GitHub's authorization page
	service.redirectToGitHub = (clientId) => {
		const redirectUri = window.location.origin + window.location.pathname;
		window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=gist&redirect_uri=${encodeURIComponent(redirectUri)}`;
	};

	// 2. Exchange the temporary URL code for a functional bearer token
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

	// Scans for an existing file, or creates a new private backup slot if missing
	service.findOrCreateSyncGist = (token) => {
		const filename = "mudae_ranker_sync.json";
		const headers = {
			'Authorization': `Bearer ${token}`,
			'Accept': 'application/vnd.github+json'
		};

		// Step A: Fetch user's recent gists (up to 100)
		return $http({
			method: 'GET',
			url: 'https://api.github.com/gists?per_page=100',
			headers: headers
		}).then(response => {
			const gists = response.data || [];
			// Look for an existing gist holding our target file
			const existingGist = gists.find(g => g.files && g.files[filename]);

			if (existingGist) {
				return { id: existingGist.id, isNew: false };
			}

			// Step B: If no gist exists, initialize a brand new private one
			return $http({
				method: 'POST',
				url: 'https://api.github.com/gists',
				headers: headers,
				data: {
					description: "Mudae Ranker Cross-device Sync Data",
					public: false, // Keeps it hidden from their public GitHub profile
					files: {
						[filename]: {
							content: angular.toJson(service.characters || [])
						}
					}
				}
			}).then(createResponse => {
				return { id: createResponse.data.id, isNew: true };
			});
		});
	};

	// Explicitly downloads data from a confirmed tracking Gist slot
	service.loadFromGist = (token, gistId) => {
		// Generate a unique timestamp to bypass the cache
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
						content: angular.toJson(characterData || [])
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
			// FIX: Secure deep object extraction path against non-existent Media structures
			const dataPayload = response.data ? response.data.data : null;
			const mediaData = dataPayload ? dataPayload['Media'] : null;

			// Check for missing data structures or zero-match results
			if (!mediaData || !mediaData['characters'] || !mediaData['characters']['edges']) {
				console.warn(`AniList database yielded zero matching results for series: "${series.name}"`);

				// CRITICAL PATH: Allow the sequence to cleanly complete and terminate if this was the last array item
				if (seriesArray.length === 0) {
					$interval.cancel(service.anilistReqInterval);
				}
				return; // Bail out safely without throwing runtime crashes
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

			// If the series still has unresolved entries and pagination is available, cycle back in
			if (localCharactersLength > 0 && mediaData['characters']['pageInfo']['hasNextPage']) {
				series.page++;
				seriesArray.push(series);
			}

			if (seriesArray.length === 0) {
				$interval.cancel(service.anilistReqInterval);
			}
		}).catch(err => {
			console.error("Hard network failure occurred during AniList fetch operations:", err);

			// FAIL-SAFE: Mirror the termination safety path to handle absolute server drop-offs/CORS blocks
			if (seriesArray.length === 0) {
				$interval.cancel(service.anilistReqInterval);
			}
		});
	};
}]);
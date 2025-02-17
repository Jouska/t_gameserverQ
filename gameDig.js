const { GameDig } = require('gamedig');

module.exports = {
	async digServer({ ip, port, game }) {
		let query = {
			type: game,
			host: ip,
			requestRules: true,
			// debug: true,
		};

		if (port) {
			query.port = port;
		}

		try {
			// Query the game server
			const state = await GameDig.query(query);
			const queryResult = {
				game: query.type,
				name: state.name,
				map: state.map,
				maxplayers: state.maxplayers,
				numplayers: state.numplayers,
				ip: query.host,
				status: 'Online',
			};
			console.log(state);

			// Extract mod titles for DayZ
			if (game === 'dayz') {
				const mods = state.raw.dayzMods || [];
				queryResult.mods =
					mods
						.filter((mod) => mod.workshopId)
						.map((mod) => mod.title)
						.join(', ') || 'No mods';
			}

			return queryResult;
		} catch (error) {
			console.log('error: ', error);
			const queryResult = {
				game: query.type,
				ip: query.host,
				error: true,
				errorMessage: `Server is either offline, or if a new query, details may be incorrect. \n
			Try to enter details again after removing this message if you think you got the IP or game wrong.`,
				status: 'Offline',
			};

			return queryResult;
			// throw error; // Re-throw to handle error in calling code
		}
	},
};

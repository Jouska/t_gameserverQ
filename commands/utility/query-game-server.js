const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { digServer } = require('../../gameDig');
const fs = require('node:fs');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('query')
		.setDescription('Query a game server and add to channel.')
		.addStringOption((option) =>
			option
				.setName('ip')
				.setDescription('The IP address of the game server')
				.setRequired(true)
		)
		.addStringOption((option) =>
			option
				.setName('game')
				.setDescription('The name of the game')
				.setRequired(true)
				.addChoices(
					{ name: 'Arma Reforger', value: 'armareforger' },
					{ name: 'DayZ', value: 'dayz' },
					{ name: 'Valheim', value: 'valheim' }
				)
		)
		.addIntegerOption((option) =>
			option
				.setName('port')
				.setDescription('The port of the game server (optional)')
		),

	async execute(interaction, client) {
		// Accept client as a parameter
		const ip = interaction.options.getString('ip');
		const game = interaction.options.getString('game');
		const port = interaction.options.getInteger('port') || ''; // Handle optional port with a default value

		await interaction.deferReply(); // Defer the reply to prevent 'unknown interaction' error if the query takes a while

		const queryResults = await digServer({ ip, port, game });

		console.log('query results: ', queryResults);

		// Create the initial embed
		const embed = createEmbed(queryResults, ip, game, port);

		// Check if there is a stored message ID
		let message;
		if (client.storedMessageId) {
			try {
				message = await interaction.channel.messages.fetch(
					client.storedMessageId
				);
				await message.edit({ embeds: [embed] });
			} catch (error) {
				console.log(
					'Failed to fetch stored message, creating a new one.'
				);
				message = await interaction.editReply({ embeds: [embed] });
			}
		} else {
			message = await interaction.editReply({ embeds: [embed] });
		}

		// Save the message ID to a file
		fs.writeFileSync(
			'storedMessageId.json',
			JSON.stringify({ messageId: message.id })
		);

		// Ensure the interval is cleared if an error occurs on the first query to prevent multiple intervals.
		if (!queryResults.error) {
			const interval = setInterval(async () => {
				console.log('Running another query...');
				const newQueryResults = await digServer({ ip, port, game });
				if (newQueryResults.error) {
					clearInterval(interval);
					console.log('Error occurred, stopping further queries.');
				} else if (
					newQueryResults.name !== queryResults.name ||
					newQueryResults.map !== queryResults.map ||
					newQueryResults.numplayers !== queryResults.numplayers ||
					newQueryResults.maxplayers !== queryResults.maxplayers ||
					newQueryResults.status !== queryResults.status ||
					newQueryResults.mods !== queryResults.mods
				) {
					console.log('Query results changed, updating message...');
					const newEmbed = createEmbed(
						newQueryResults,
						ip,
						game,
						port
					);

					await message.edit({ embeds: [newEmbed] });
				} else {
					console.log(
						'Query results did not change, waiting for next query...'
					);
				}
			}, 60000); // Re-query every 60 seconds
		}
	},
};

// Function to create an embed based on query results
function createEmbed(queryResults, ip, game, port) {
	const embed = new EmbedBuilder()
		.setTitle(
			queryResults.error
				? `${game} Server Query Error`
				: queryResults.name
		)
		.addFields(
			{ name: 'IP Address', value: ip, inline: true },
			{ name: 'Game', value: game, inline: true },
			{ name: 'Port', value: port.toString(), inline: true },
			{
				name: 'Status',
				value: queryResults.status,
				inline: true,
			},
			{
				name: 'Map',
				value: queryResults.error
					? 'Error retrieving map'
					: queryResults.map || 'Unknown',
				inline: true,
			},
			{
				name: 'Players',
				value: queryResults.error
					? 'Error retrieving players'
					: `${queryResults.numplayers || 0}/${
							queryResults.maxplayers || 0
					  }`,
				inline: true,
			}
		)
		.setColor(queryResults.error ? '#FF0000' : '#00FF00');

	// Add error message if there is an error
	if (queryResults.error && queryResults.errorMessage) {
		embed.addFields({
			name: 'Error Message',
			value: queryResults.errorMessage,
			inline: false,
		});
	}

	// Add mod titles for DayZ
	if (!queryResults.error && game === 'dayz') {
		embed.addFields({
			name: 'Mods',
			value: queryResults.mods,
			inline: false,
		});
	}

	return embed;
}

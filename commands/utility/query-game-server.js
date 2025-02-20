const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { digServer } = require('../../gameDig');
const fs = require('node:fs');

function readStoredMessages() {
	try {
		const data = fs.readFileSync('storedMessages.json', 'utf8');
		return JSON.parse(data).messages || [];
	} catch (error) {
		console.log('No stored messages found.');
		return [];
	}
}

function saveStoredMessages(messages) {
	fs.writeFileSync('storedMessages.json', JSON.stringify({ messages }));
}

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
					{ name: 'Valheim', value: 'valheim' },
					{ name: 'Space Engineers', value: 'spaceengineers' },
					{ name: 'Minecraft', value: 'minecraft' },
					{ name: 'Conan Exiles', value: 'conanexiles' },
					{ name: 'Project Zomboid', value: 'projectzomboid' },
					{ name: 'Squad', value: 'squad' }
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

		if (interaction.deferReply) {
			await interaction.deferReply(); // Defer the reply to prevent 'unknown interaction' error if the query takes a while
		}

		const queryResults = await digServer({ ip, port, game });
		let oldQueryResults = queryResults;

		console.log('query results: ', queryResults);

		// Create the initial embed
		const embed = createEmbed(queryResults, ip, game, port);

		// Check if there is a stored message ID
		let message;
		const storedMessages = readStoredMessages();
		const storedMessage = storedMessages.find(
			(m) => m.messageId === interaction.id
		);

		if (storedMessage) {
			try {
				const channel = await client.channels.fetch(
					storedMessage.channelId
				);
				message = await channel.messages.fetch(interaction.id);
				const oldEmbed = message.embeds[0];
				const oldData = extractDataFromEmbed(oldEmbed);
				const newData = { ip, game, port };

				// Check if data has changed
				if (
					oldData.ip !== newData.ip ||
					oldData.game !== newData.game ||
					oldData.port !== newData.port
				) {
					await message.delete();
					message = await interaction.editReply({ embeds: [embed] });
				} else {
					await message.edit({ embeds: [embed] });
				}
			} catch (error) {
				console.log(
					'Failed to fetch stored message, creating a new one.'
				);
				message = await interaction.editReply({ embeds: [embed] });
			}
		} else {
			message = await interaction.editReply({ embeds: [embed] });
			storedMessages.push({
				channelId: interaction.channel.id,
				messageId: message.id,
			});
			saveStoredMessages(storedMessages);
		}

		// Ensure the interval is cleared if an error occurs on the first query to prevent multiple intervals.
		const interval = setInterval(async () => {
			console.log('Running another query...');
			const newQueryResults = await digServer({ ip, port, game });

			console.log('newQueryResults: ', newQueryResults.numplayers);
			console.log('oldQueryResults: ', oldQueryResults.numplayers);
			if (newQueryResults.error) {
				console.log('Error occurred: ', newQueryResults.errorMessage);
				console.log(
					'Query results returned error, updating message...'
				);
				const newEmbed = createEmbed(newQueryResults, ip, game, port);

				oldQueryResults = newQueryResults;

				try {
					await message.edit({ embeds: [newEmbed] });
					console.log('Error message successfully updated.');
				} catch (editError) {
					console.error('Failed to update message:', editError);
				}
			} else if (
				newQueryResults.name !== oldQueryResults.name ||
				newQueryResults.map !== oldQueryResults.map ||
				newQueryResults.numplayers !== oldQueryResults.numplayers ||
				newQueryResults.maxplayers !== oldQueryResults.maxplayers ||
				newQueryResults.status !== oldQueryResults.status ||
				newQueryResults.mods !== oldQueryResults.mods
			) {
				console.log('Query results changed, updating message...');
				const newEmbed = createEmbed(newQueryResults, ip, game, port);

				oldQueryResults = newQueryResults;

				try {
					await message.edit({ embeds: [newEmbed] });
					console.log('Message successfully updated.');
				} catch (editError) {
					console.error('Failed to update message:', editError);
				}
			} else {
				console.log(
					'Query results did not change, waiting for next query...'
				);
			}
		}, 60000); // Re-query every 60 seconds
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

// Function to extract data from embed fields
function extractDataFromEmbed(embed) {
	const fields = embed.fields.reduce((acc, field) => {
		acc[field.name.toLowerCase()] = field.value;
		return acc;
	}, {});
	return {
		ip: fields['ip address'],
		game: fields['game'],
		port: parseInt(fields['port']),
	};
}

const { Events } = require('discord.js');
const fs = require('node:fs');

function readStoredMessageIds() {
	try {
		const data = fs.readFileSync('storedMessageId.json', 'utf8');
		return JSON.parse(data).messageIds || [];
	} catch (error) {
		console.log('No stored message IDs found.');
		return [];
	}
}

function saveStoredMessageIds(messageIds) {
	fs.writeFileSync('storedMessageId.json', JSON.stringify({ messageIds }));
}

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

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		const channelId = '1267907516054896662'; // Replace with your channel ID
		const channel = await client.channels.fetch(channelId);
		const validMessageIds = [];
		const processingMessageIds = new Set();

		client.storedMessageIds = readStoredMessageIds();

		for (const messageId of client.storedMessageIds) {
			if (processingMessageIds.has(messageId)) {
				continue;
			}
			processingMessageIds.add(messageId);

			try {
				const message = await channel.messages.fetch(messageId);
				const embed = message.embeds[0];
				if (!embed) {
					console.log(`No embed found in message ${messageId}`);
					continue;
				}

				const { ip, game, port } = extractDataFromEmbed(embed);
				console.log(
					`Stored message ${messageId} found, starting query command...`
				);
				const command = client.commands.get('query');

				if (command) {
					const interaction = {
						channel: channel,
						options: {
							getString: (name) => {
								if (name === 'ip') return ip;
								if (name === 'game') return game;
								return null;
							},
							getInteger: (name) => {
								if (name === 'port') return port;
								return null;
							},
						},
						editReply: async (content) => {
							return await message.edit(content);
						},
					};
					await command.execute(interaction, client);
					validMessageIds.push(messageId);
				}
			} catch (error) {
				console.log(
					`Stored message ${messageId} not found or failed to fetch.`
				);
				console.log('ERROR: ', error);
			} finally {
				processingMessageIds.delete(messageId);
			}
		}

		// Save only valid message IDs
		saveStoredMessageIds(validMessageIds);
	},
};

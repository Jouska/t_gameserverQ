const { Events } = require('discord.js');
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
		const validMessages = [];
		const processingMessages = new Set();

		client.storedMessages = readStoredMessages();

		for (const { channelId, messageId } of client.storedMessages) {
			if (processingMessages.has(messageId)) {
				continue;
			}
			processingMessages.add(messageId);

			try {
				const channel = await client.channels.fetch(channelId);
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
					validMessages.push({ channelId, messageId });
				}
			} catch (error) {
				console.log(
					`Stored message ${messageId} not found or failed to fetch.`
				);
				console.log('ERROR: ', error);
			} finally {
				processingMessages.delete(messageId);
			}
		}

		// Save only valid messages
		saveStoredMessages(validMessages);
	},
};

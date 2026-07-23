// deploy-commands.js
// Run once (npm run deploy-commands) to register the /panel slash command.
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post the SSU / Ban admin control panel')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Done. /panel is now available in your server.');
  } catch (err) {
    console.error(err);
  }
})();

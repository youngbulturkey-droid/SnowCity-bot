// index.js
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const robloxApi = require('./roblox-api');

const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const BAN_TYPE_LABELS = {
  ban_char_name: 'Character Name',
  ban_char_id: 'Character Id',
  ban_roblox_name: 'Roblox Name',
  ban_roblox_id: 'Roblox Id'
};
const BAN_TYPE_KIND = {
  ban_char_name: 'charname',
  ban_char_id: 'charid',
  ban_roblox_name: 'robloxname',
  ban_roblox_id: 'robloxid'
};

function isAdmin(interaction) {
  if (!ADMIN_ROLE_ID) return true; // no role restriction configured
  return interaction.member.roles.cache.has(ADMIN_ROLE_ID);
}

function buildPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('🛠️ Server Admin Panel')
    .setDescription('Control SSU and manage player bans.\nConfirmations post in the staff Discord log webhook in-game.')
    .setColor(0x2b6cb0);
}

function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ssu_start').setLabel('Start SSU').setStyle(ButtonStyle.Success).setEmoji('🟢'),
    new ButtonBuilder().setCustomId('ssu_stop').setLabel('Stop SSU').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
    new ButtonBuilder().setCustomId('ban_open').setLabel('Ban').setStyle(ButtonStyle.Secondary).setEmoji('🔨'),
    new ButtonBuilder().setCustomId('unban_open').setLabel('Unban').setStyle(ButtonStyle.Secondary).setEmoji('♻️')
  );
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
      await interaction.reply({ embeds: [buildPanelEmbed()], components: [buildPanelRow()] });
      return;
    }

    // ===== SSU start/stop =====
    if (interaction.isButton() && (interaction.customId === 'ssu_start' || interaction.customId === 'ssu_stop')) {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
      }

      if (interaction.customId === 'ssu_stop') {
        await interaction.deferReply({ ephemeral: true });
        await robloxApi.sendSSU('stop');
        await interaction.editReply('🔴 Sent **Stop SSU**. Watch the in-game staff log for confirmation.');
        return;
      }

      // Start SSU: ask for an optional duration first
      const modal = new ModalBuilder().setCustomId('ssu_start_modal').setTitle('Start SSU');
      const durationInput = new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Duration in minutes (blank = indefinite)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('e.g. 180 for 3 hours');
      modal.addComponents(new ActionRowBuilder().addComponents(durationInput));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'ssu_start_modal') {
      await interaction.deferReply({ ephemeral: true });
      const durationRaw = interaction.fields.getTextInputValue('duration').trim();
      const durationSeconds = durationRaw ? parseInt(durationRaw, 10) * 60 : null;
      await robloxApi.sendSSU('start', durationSeconds);
      await interaction.editReply(`🟢 Sent **Start SSU**${durationSeconds ? ` (${durationRaw} minutes)` : ' (indefinite)'}. Watch the in-game staff log for confirmation.`);
      return;
    }

    // ===== Unban =====
    if (interaction.isButton() && interaction.customId === 'unban_open') {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
      }
      const modal = new ModalBuilder().setCustomId('unban_modal').setTitle('Unban Player');
      const valueInput = new TextInputBuilder()
        .setCustomId('value')
        .setLabel('Roblox Name or Roblox Id')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(valueInput));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'unban_modal') {
      await interaction.deferReply({ ephemeral: true });
      const value = interaction.fields.getTextInputValue('value').trim();

      try {
        const { userId } = await robloxApi.sendUnban({ value, moderator: `Discord: ${interaction.user.tag}` });
        await interaction.editReply(`♻️ Unban request sent for **${value}** (UserId ${userId}). Check the in-game staff log to confirm it landed.`);
      } catch (err) {
        await interaction.editReply(`❌ ${err.message}`);
      }
      return;
    }

    // ===== Ban flow =====
    if (interaction.isButton() && interaction.customId === 'ban_open') {
      if (!isAdmin(interaction)) {
        return interaction.reply({ content: "You don't have permission to do that.", ephemeral: true });
      }
      const select = new StringSelectMenuBuilder()
        .setCustomId('ban_select_type')
        .setPlaceholder('Choose how to identify the player')
        .addOptions(
          { label: 'Character Name', value: 'ban_char_name' },
          { label: 'Character Id', value: 'ban_char_id' },
          { label: 'Roblox Name', value: 'ban_roblox_name' },
          { label: 'Roblox Id', value: 'ban_roblox_id' }
        );
      await interaction.reply({
        content: 'Select how you want to identify the player to ban:',
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ban_select_type') {
      const type = interaction.values[0];
      const label = BAN_TYPE_LABELS[type];

      const modal = new ModalBuilder().setCustomId(`ban_modal:${type}`).setTitle(`Ban Player — ${label}`);

      const valueInput = new TextInputBuilder().setCustomId('value').setLabel(label).setStyle(TextInputStyle.Short).setRequired(true);
      const durationInput = new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Duration in minutes (0 or blank = permanent)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('e.g. 1440 for 1 day, 0 for permanent');
      const reasonInput = new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(valueInput),
        new ActionRowBuilder().addComponents(durationInput),
        new ActionRowBuilder().addComponents(reasonInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ban_modal:')) {
      const type = interaction.customId.split(':')[1];
      const kind = BAN_TYPE_KIND[type];
      const label = BAN_TYPE_LABELS[type];

      await interaction.deferReply({ ephemeral: true });

      const value = interaction.fields.getTextInputValue('value').trim();
      const durationRaw = interaction.fields.getTextInputValue('duration').trim();
      const reason = interaction.fields.getTextInputValue('reason').trim();
      const durationMinutes = durationRaw ? parseInt(durationRaw, 10) : 0;

      try {
        const { userId } = await robloxApi.sendBan({
          kind,
          value,
          durationMinutes,
          reason,
          moderator: `Discord: ${interaction.user.tag}`
        });

        const embed = new EmbedBuilder()
          .setTitle('🔨 Ban Request Sent')
          .setColor(0xc53030)
          .addFields(
            { name: 'Identified via', value: `${label}: ${value}${userId ? ` (resolved to UserId ${userId})` : ''}` },
            { name: 'Duration', value: durationMinutes > 0 ? `${durationMinutes} minute(s)` : 'Permanent' },
            { name: 'Reason', value: reason },
            { name: 'Moderator', value: interaction.user.tag }
          )
          .setFooter({ text: kind.startsWith('char') ? 'Character lookups only resolve players currently online — check the in-game staff log to confirm it landed.' : 'Check the in-game staff log to confirm it landed.' });

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply(`❌ ${err.message}`);
      }
      return;
    }
  } catch (err) {
    console.error(err);
    const msg = `⚠️ Something went wrong: ${err.message}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

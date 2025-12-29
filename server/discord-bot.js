const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Data storage file
const DATA_FILE = path.join(__dirname, 'tallies-data.json');
const GIFS_FOLDER = path.join(__dirname, 'gifs');

// Ensure gifs folder exists
if (!fs.existsSync(GIFS_FOLDER)) {
  fs.mkdirSync(GIFS_FOLDER, { recursive: true });
}

/**
 * Load tallies from file
 */
function loadTallies() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading tallies:', error);
  }
  return {};
}

/**
 * Save tallies to file
 */
function saveTallies(tallies) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(tallies, null, 2));
  } catch (error) {
    console.error('Error saving tallies:', error);
  }
}

/**
 * Get a random GIF from the gifs folder
 */
function getRandomGif() {
  try {
    const files = fs.readdirSync(GIFS_FOLDER).filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.gif', '.mp4', '.webm'].includes(ext);
    });

    if (files.length === 0) {
      console.log('No GIFs found in gifs folder');
      return null;
    }

    const randomFile = files[Math.floor(Math.random() * files.length)];
    return path.join(GIFS_FOLDER, randomFile);
  } catch (error) {
    console.error('Error loading GIF:', error);
    return null;
  }
}

let tallies = loadTallies();

/**
 * Find a key in an object case-insensitively
 */
function findKeyIgnoreCase(obj, searchKey) {
  return Object.keys(obj).find(key => key.toLowerCase() === searchKey.toLowerCase());
}

/**
 * Initialize the Discord bot
 */
function initializeBot() {
  client.once('ready', () => {
    console.log(`✓ Bot logged in as ${client.user.tag}`);
    client.user.setActivity('tallies', { type: 'WATCHING' });
  });

  // Handle slash commands
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    try {
      if (commandName === 'tally') {
        await handleTallyCommand(interaction, options);
      }
    } catch (error) {
      console.error('Error handling command:', error);
      await interaction.reply({
        content: '❌ An error occurred while processing your command.',
        ephemeral: true,
      });
    }
  });

  // Register slash commands
  client.on('ready', async () => {
    const commands = [
      new SlashCommandBuilder()
        .setName('tally')
        .setDescription('Manage win/loss tallies')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('create')
            .setDescription('Create a new tally')
            .addStringOption((option) =>
              option
                .setName('name')
                .setDescription('Name of the tally (e.g., "Chess", "Valorant")')
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName('participant1')
                .setDescription('First person/team (comma-separated for teams: Alice,Bob,Charlie)')
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName('participant2')
                .setDescription('Second person/team (can be "Randoms" for team type)')
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('add-win')
            .setDescription('Add a win to a tally')
            .addStringOption((option) =>
              option
                .setName('tally')
                .setDescription('Name and type of the tally (autocomplete available)')
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption((option) =>
              option
                .setName('participant')
                .setDescription('Participant/team that won')
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('add-loss')
            .setDescription('Add a loss to a tally')
            .addStringOption((option) =>
              option
                .setName('tally')
                .setDescription('Name and type of the tally (autocomplete available)')
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addStringOption((option) =>
              option
                .setName('participant')
                .setDescription('Participant/team that lost')
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('record')
            .setDescription('View the record for a tally')
            .addStringOption((option) =>
              option
                .setName('tally')
                .setDescription('Name of the tally')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('list')
            .setDescription('List all tallies')
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('delete')
            .setDescription('Delete a tally')
            .addStringOption((option) =>
              option
                .setName('tally')
                .setDescription('Name of the tally to delete')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('stats')
            .setDescription('View overall stats for a participant across all games')
            .addStringOption((option) =>
              option
                .setName('participant')
                .setDescription('Name of the participant')
                .setRequired(true)
            )
        ),
    ];

    try {
      await client.application.commands.set(commands);
      console.log('✓ Slash commands registered');
    } catch (error) {
      console.error('Error registering commands:', error);
    }
  });

  // Handle autocomplete
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isAutocomplete()) return;

    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'tally') {
      const choices = [];
      
      // Build list of all game/matchup combinations
      for (const [game, matchups] of Object.entries(tallies)) {
        for (const [matchupId, data] of Object.entries(matchups)) {
          if (typeof data !== 'object' || !data.createdAt) continue;
          
          const displayName = `${game} - ${matchupId}`;
          choices.push({ name: displayName, value: `${game}|${matchupId}` });
        }
      }

      const filtered = choices.filter((choice) =>
        choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
      );

      await interaction.respond(filtered.slice(0, 25));
    }
  });

  // Login with bot token
  client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
    console.error('Failed to login Discord bot:', error.message);
  });
}

/**
 * Handle tally command
 */
async function handleTallyCommand(interaction, options) {
  const subcommand = options.getSubcommand();

  if (subcommand === 'create') {
    const game = options.getString('name');
    const participant1 = options.getString('participant1');
    const participant2 = options.getString('participant2');

    // Create matchup identifier
    const matchupId = `${participant1} vs ${participant2}`;
    const reversedMatchupId = `${participant2} vs ${participant1}`;

    // Initialize game if it doesn't exist
    if (!tallies[game]) {
      tallies[game] = {};
    }

    // Check if this specific matchup already exists (including reversed order)
    if (tallies[game][matchupId]) {
      return await interaction.reply({
        content: `❌ This matchup already exists in "${game}"!`,
        ephemeral: true,
      });
    }

    // Check if reversed matchup already exists
    if (tallies[game][reversedMatchupId]) {
      return await interaction.reply({
        content: `❌ This matchup already exists in "${game}" (as "${reversedMatchupId}")!`,
        ephemeral: true,
      });
    }

    tallies[game][matchupId] = {
      [participant1]: { wins: 0, losses: 0 },
      [participant2]: { wins: 0, losses: 0 },
      createdAt: new Date().toISOString(),
    };

    saveTallies(tallies);
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✓ Tally Created')
      .addFields(
        { name: 'Game', value: game, inline: false },
        { name: 'Matchup', value: matchupId, inline: false }
      );

    return await interaction.reply({ embeds: [embed] });
  }

  if (subcommand === 'add-win') {
    const tallyInput = options.getString('tally');
    const participantInput = options.getString('participant');

    // Parse game and matchup from input (format: "game|matchup")
    const [game, matchup] = tallyInput.includes('|') 
      ? tallyInput.split('|') 
      : [tallyInput, null];

    if (!tallies[game]) {
      return await interaction.reply({
        content: `❌ Game "${game}" not found!`,
        ephemeral: true,
      });
    }

    // Find matchup case-insensitively - for delete subcommand, matchup is derived from tallyInput
    const actualMatchup = Object.keys(tallies[game]).find(key => 
      key.toLowerCase() === (tallyInput.split('|')[1] || '').toLowerCase()
    );

    if (!actualMatchup) {
      return await interaction.reply({
        content: `❌ Matchup not found in "${game}"!`,
        ephemeral: true,
      });
    }

    const tally = tallies[game][actualMatchup];

    // Find participant case-insensitively
    const actualParticipant = findKeyIgnoreCase(tally, participantInput);

    if (!actualParticipant) {
      return await interaction.reply({
        content: `❌ Participant "${participantInput}" not found in this matchup!`,
        ephemeral: true,
      });
    }

    // Add win to winner
    tally[actualParticipant].wins++;
    
    // Add loss to all other participants in this matchup
    for (const [participant, stats] of Object.entries(tally)) {
      if (participant !== 'createdAt' && participant !== actualParticipant) {
        stats.losses++;
      }
    }
    
    saveTallies(tallies);

    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✓ Win Added')
      .addFields(
        { name: 'Game', value: game, inline: false },
        { name: 'Matchup', value: actualMatchup, inline: false },
        { name: 'Winner', value: actualParticipant, inline: false },
        {
          name: `${actualParticipant}'s Record`,
          value: `W: ${tally[actualParticipant].wins} | L: ${tally[actualParticipant].losses}`,
          inline: false,
        }
      );

    await interaction.reply({ embeds: [embed] });

    const gifPath = getRandomGif();
    console.log('GIF Path (add-win):', gifPath);
    if (gifPath) {
      try {
        const attachment = new AttachmentBuilder(gifPath);
        await interaction.followUp({ files: [attachment] });
      } catch (error) {
        console.error('Error sending GIF:', error);
      }
    }
  }

  if (subcommand === 'add-loss') {
    const tallyInput = options.getString('tally');
    const participantInput = options.getString('participant');

    // Parse game and matchup from input (format: "game|matchup")
    const [game, matchup] = tallyInput.includes('|') 
      ? tallyInput.split('|') 
      : [tallyInput, null];

    if (!tallies[game]) {
      return await interaction.reply({
        content: `❌ Game "${game}" not found!`,
        ephemeral: true,
      });
    }

    // Find matchup case-insensitively
    const actualMatchup = findKeyIgnoreCase(tallies[game], matchup);

    if (!actualMatchup) {
      return await interaction.reply({
        content: `❌ Matchup "${matchup}" not found in "${game}"!`,
        ephemeral: true,
      });
    }

    const tally = tallies[game][actualMatchup];

    // Find participant case-insensitively
    const actualParticipant = findKeyIgnoreCase(tally, participantInput);

    if (!actualParticipant) {
      return await interaction.reply({
        content: `❌ Participant "${participantInput}" not found in this matchup!`,
        ephemeral: true,
      });
    }

    // Add loss to loser
    tally[actualParticipant].losses++;
    
    // Add win to all other participants in this matchup
    for (const [participant, stats] of Object.entries(tally)) {
      if (participant !== 'createdAt' && participant !== actualParticipant) {
        stats.wins++;
      }
    }
    
    saveTallies(tallies);

    const embed = new EmbedBuilder()
      .setColor('#FF6600')
      .setTitle('✓ Loss Added')
      .addFields(
        { name: 'Game', value: game, inline: false },
        { name: 'Matchup', value: actualMatchup, inline: false },
        { name: 'Loser', value: actualParticipant, inline: false },
        {
          name: `${actualParticipant}'s Record`,
          value: `W: ${tally[actualParticipant].wins} | L: ${tally[actualParticipant].losses}`,
          inline: false,
        }
      );

    await interaction.reply({ embeds: [embed] });

    const gifPath = getRandomGif();
    if (gifPath) {
      try {
        const attachment = new AttachmentBuilder(gifPath);
        await interaction.followUp({ files: [attachment] });
      } catch (error) {
        console.error('Error sending GIF:', error);
      }
    }
  }

  if (subcommand === 'record') {
    const tallyInput = options.getString('tally');

    // Parse game and matchup from input (format: "game|matchup")
    const [game, matchup] = tallyInput.includes('|') 
      ? tallyInput.split('|') 
      : [tallyInput, null];

    if (!tallies[game]) {
      return await interaction.reply({
        content: `❌ Game "${game}" not found!`,
        ephemeral: true,
      });
    }

    // Find matchup case-insensitively
    const actualMatchup = findKeyIgnoreCase(tallies[game], matchup);

    if (!actualMatchup) {
      return await interaction.reply({
        content: `❌ Matchup "${matchup}" not found in "${game}"!`,
        ephemeral: true,
      });
    }

    const tally = tallies[game][actualMatchup];

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`📊 ${game} - ${actualMatchup}`)
      .setTimestamp();

    for (const [participant, stats] of Object.entries(tally)) {
      if (participant !== 'createdAt') {
        const total = stats.wins + stats.losses;
        const winRate = total > 0 ? ((stats.wins / total) * 100).toFixed(1) : '0.0';
        embed.addFields({
          name: participant,
          value: `W: **${stats.wins}** | L: **${stats.losses}** | Win Rate: **${winRate}%**`,
          inline: false,
        });
      }
    }

    await interaction.reply({ embeds: [embed] });

    const gifPath = getRandomGif();
    if (gifPath) {
      const attachment = new AttachmentBuilder(gifPath);
      await interaction.followUp({ files: [attachment] });
    }
  }

  if (subcommand === 'list') {
    if (Object.keys(tallies).length === 0) {
      return await interaction.reply({
        content: '📊 No tallies created yet! Use `/tally create` to get started.',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#9900FF')
      .setTitle('📊 All Tallies by Game')
      .setTimestamp();

    for (const [game, matchups] of Object.entries(tallies)) {
      for (const [matchupId, tally] of Object.entries(matchups)) {
        if (typeof tally !== 'object' || !tally.createdAt) continue;

        const participants = Object.keys(tally).filter((k) => k !== 'createdAt');
        
        if (participants.length === 0) continue;

        // Build record string for all participants
        const recordParts = participants.map((p) => {
          const stats = tally[p];
          return `${p} (${stats.wins}-${stats.losses})`;
        });

        embed.addFields({
          name: `${game} - ${matchupId}`,
          value: recordParts.join(' vs '),
          inline: false,
        });
      }
    }

    // Calculate top 3 leaderboard across all tallies
    const allStats = {};
    for (const [game, matchups] of Object.entries(tallies)) {
      for (const [matchupId, tally] of Object.entries(matchups)) {
        if (typeof tally !== 'object' || !tally.createdAt) continue;
        
        for (const [participant, record] of Object.entries(tally)) {
          if (participant === 'createdAt') continue;
          
          const name = participant.toLowerCase();
          if (!allStats[name]) {
            allStats[name] = { wins: 0, losses: 0, displayName: participant };
          }
          allStats[name].wins += record.wins;
          allStats[name].losses += record.losses;
        }
      }
    }
    
    // Get top 3
    const rankings = Object.values(allStats)
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 3);

    // Add leaderboard section
    if (rankings.length > 0) {
      embed.addFields({
        name: '🏆 Top 3 Overall',
        value: rankings
          .map((p, idx) => {
            const total = p.wins + p.losses;
            const wr = total > 0 ? ((p.wins / total) * 100).toFixed(1) : '0.0';
            return `${idx + 1}. ${p.displayName} - ${p.wins}W ${p.losses}L (${wr}%)`;
          })
          .join('\n'),
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed] });

    const gifPath = getRandomGif();
    if (gifPath) {
      try {
        const attachment = new AttachmentBuilder(gifPath);
        await interaction.followUp({ files: [attachment] });
      } catch (error) {
        console.error('Error sending GIF:', error);
      }
    }
  }

  if (subcommand === 'delete') {
    const tallyInput = options.getString('tally');

    // Parse game and matchup from input (format: "game|matchup")
    const [game, matchup] = tallyInput.includes('|') 
      ? tallyInput.split('|') 
      : [tallyInput, null];

    if (!tallies[game]) {
      return await interaction.reply({
        content: `❌ Game "${game}" not found!`,
        ephemeral: true,
      });
    }

    // Find matchup case-insensitively
    const actualMatchup = findKeyIgnoreCase(tallies[game], matchup);

    if (!actualMatchup) {
      return await interaction.reply({
        content: `❌ Matchup "${matchup}" not found in "${game}"!`,
        ephemeral: true,
      });
    }

    delete tallies[game][actualMatchup];
    
    // Delete game if no matchups left
    if (Object.keys(tallies[game]).length === 0) {
      delete tallies[game];
    }

    saveTallies(tallies);

    return await interaction.reply({
      content: `✓ Matchup "${actualMatchup}" in "${game}" has been deleted.`,
      ephemeral: true,
    });
  }

  if (subcommand === 'stats') {
    const participantInput = options.getString('participant');
    
    // Search for participant across all games
    const stats = {};
    const gameBreakdown = {};
    
    for (const [game, matchups] of Object.entries(tallies)) {
      for (const [matchupId, tally] of Object.entries(matchups)) {
        if (typeof tally !== 'object' || !tally.createdAt) continue;
        
        for (const [participant, record] of Object.entries(tally)) {
          if (participant === 'createdAt') continue;
          
          // Case-insensitive match
          if (participant.toLowerCase() === participantInput.toLowerCase()) {
            stats.wins = (stats.wins || 0) + record.wins;
            stats.losses = (stats.losses || 0) + record.losses;
            
            if (!gameBreakdown[game]) {
              gameBreakdown[game] = [];
            }
            gameBreakdown[game].push({
              matchup: matchupId,
              wins: record.wins,
              losses: record.losses,
            });
          }
        }
      }
    }
    
    if (!stats.wins && !stats.losses) {
      return await interaction.reply({
        content: `❌ No stats found for "${participantInput}".`,
        ephemeral: true,
      });
    }
    
    // Find all participants for ranking
    const allStats = {};
    for (const [game, matchups] of Object.entries(tallies)) {
      for (const [matchupId, tally] of Object.entries(matchups)) {
        if (typeof tally !== 'object' || !tally.createdAt) continue;
        
        for (const [participant, record] of Object.entries(tally)) {
          if (participant === 'createdAt') continue;
          
          const name = participant.toLowerCase();
          if (!allStats[name]) {
            allStats[name] = { wins: 0, losses: 0, displayName: participant };
          }
          allStats[name].wins += record.wins;
          allStats[name].losses += record.losses;
        }
      }
    }
    
    // Get ranking
    const rankings = Object.values(allStats)
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 3);
    
    const totalGames = stats.wins + stats.losses;
    const winRate = totalGames > 0 ? ((stats.wins / totalGames) * 100).toFixed(1) : '0.0';
    
    const embed = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle(`📈 ${participantInput}'s Overall Stats`)
      .addFields(
        {
          name: 'Overall Record',
          value: `W: **${stats.wins}** | L: **${stats.losses}** | Win Rate: **${winRate}%**`,
          inline: false,
        }
      );
    
    // Add game breakdown
    if (Object.keys(gameBreakdown).length > 0) {
      for (const [game, records] of Object.entries(gameBreakdown)) {
        const gameWins = records.reduce((sum, r) => sum + r.wins, 0);
        const gameLosses = records.reduce((sum, r) => sum + r.losses, 0);
        const gameTotal = gameWins + gameLosses;
        const gameWinRate = gameTotal > 0 ? ((gameWins / gameTotal) * 100).toFixed(1) : '0.0';
        
        embed.addFields({
          name: game,
          value: `W: ${gameWins} | L: ${gameLosses} | Win Rate: ${gameWinRate}%`,
          inline: false,
        });
      }
    }
    
    // Add top 3 ranking
    embed.addFields({
      name: '🏆 Top 3 Overall',
      value: rankings
        .map((p, idx) => {
          const total = p.wins + p.losses;
          const wr = total > 0 ? ((p.wins / total) * 100).toFixed(1) : '0.0';
          return `${idx + 1}. ${p.displayName} - ${p.wins}W ${p.losses}L (${wr}%)`;
        })
        .join('\n') || 'No data',
      inline: false,
    });
    
    await interaction.reply({ embeds: [embed] });

    const gifPath = getRandomGif();
    if (gifPath) {
      const attachment = new AttachmentBuilder(gifPath);
      await interaction.followUp({ files: [attachment] });
    }
  }
}

/**
 * Fetch and update guild data (channels, members, etc)
 */
async function updateGuildData() {
  try {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);

    if (!guild) {
      console.error('Guild not found. Check your DISCORD_GUILD_ID.');
      return;
    }

    guildData.name = guild.name;
    guildData.icon = guild.iconURL({ size: 512 });

    // Fetch all voice channels
    const channels = await guild.channels.fetch();
    const voiceChannels = channels.filter((ch) => ch.isVoiceBased());

    guildData.voiceChannels = [];

    for (const [, channel] of voiceChannels) {
      const members = channel.members;

      const membersData = members
        .map((member) => ({
          id: member.id,
          username: member.user.username,
          displayName: member.displayName,
          avatar: member.user.displayAvatarURL({ size: 256 }),
          status: member.user.presence?.status || 'offline',
          game: member.user.presence?.activities[0]?.name || null,
        }))
        .filter((m) => !m.id.includes('bot')); // Optional: filter out bots

      guildData.voiceChannels.push({
        id: channel.id,
        name: channel.name,
        userLimit: channel.userLimit,
        memberCount: members.size,
        members: membersData,
      });
    }

    // Emit update to connected clients via Socket.io
  } catch (error) {
    console.error('Error updating guild data:', error);
  }
}

module.exports = {
  initializeBot,
  getTallies: () => tallies,
};

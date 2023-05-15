// Author: Lyraedan
// https://github.com/Lyraedan

const http = require('http');
const axios = require('axios');

// DISCORD
const { Client, GatewayIntentBits, AttachmentBuilder, ActivityType } = require('discord.js');
const client = new Client({
  intents: [
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent
    ]});

var beautify = require("json-beautify");

const cleverbot = require("cleverbot-free");


var DISCORD_LIMIT = 2000;
var EMBED_MAX = 990;
const DISCORD_MESSAGE_TYPE_DEFAULT = 0;
const DISCORD_MESSAGE_TYPE_THREAD = 11;

// Persistence
var writeJson = require('write-json');

const config = require("./config.json");
const openaiApiKey = config.openaiApiKey;
const BOT_ID = config.botID;

const filePath = './channels.json'
var whitelist = require("./channels.json");

setInterval(() => {
  //http.get(`<your glitch url>`);
}, 280000); //280000

client.once('ready', () => {
    const mode = "Mode: " + getMode();
    updatePresence(mode);
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (msg) => {
  await handleIncomingDiscordMessage(msg);
});

client.on('threadCreate', async (thread) => {
  const guildId = thread.guildId;
  const channelId = thread.id;
  const ownerId = thread.ownerId;
  if(ownerId == BOT_ID) {
    var payload = {
      guild: guildId,
      channelId: channelId
    }
    whitelist.push(payload);
    
    writeJson(filePath, whitelist, function(err) {
        console.error(err);
    });
  }
});

client.on('threadDelete', async (thread) => {
  const guildId = thread.guildId;
  const channelId = thread.id;
  const ownerId = thread.ownerId;
  if(ownerId == BOT_ID) {
    if(wasValidChannel(guildId, channelId)) {
      const index = whitelist.indexOf(getValidChannel(guildId, channelId));
      whitelist.splice(index, 1);

      writeJson(filePath, whitelist, function(err) {
        console.error(err);
      });
    }
  }
});

client.login(config.discordToken);

function switchMode(channel, split) {
  if(split.length < 3) {
    sendMessage(channel, "Not enough arguments.").catch(console.err);
    return;
  } else {
    var parsed = parseInt(split[2]);
    if(parsed != NaN) {
      if(parsed >= 0 && parsed < 2) {
        if(parsed == config.mode) {
          sendMessage(channel, "I am already in mode __**" + getMode() + "**__").catch(console.err);
          return;
        }
        config.mode = parsed;
        sendMessage(channel, "Switched to mode __**" + getMode() + "**__").catch(console.err);
        
        writeJson("./config.json", config, function(err) {
          console.error(err);
        });
        
        updatePresence("Mode: " + getMode());
      } else {
        sendMessage(channel, "I don't know that mode. Mine are: ```0 - Cleverbot, 1 - ChatGpt```").catch(console.err);
      }
    }
  }
}

async function sendViaCleverbot(channel, history, textMessage) {
    var cleverbotHistory = [];
    history.forEach(message => {
      cleverbotHistory.push(message.content);
    });
    cleverbotHistory.reverse();
    setTimeout(() => {
      cleverbot(textMessage, cleverbotHistory).then(response => {
        var split = splitter(response, DISCORD_LIMIT);
        for(var i = 0; i < split.length; i++) {
          sendMessage(channel, split[i]);
        }
      }).catch(err => {
          console.error(err)
          sendMessage(channel, "Error: " + err.message);
        });
            //channel.stopTyping();
        }, Math.random() * (1 - 3) + 1 * 1000);
}

async function sendViaChatGpt(channel, history, textMessage) {
    var chatGPTHistory = [];
    history.forEach(message => {
      var parsed = JSON.parse(JSON.stringify(message));
      const authorId = parsed.authorId;
      var role = authorId == BOT_ID ? "assistant" : "user";
      const historicalMessage = {
        "role": role,
        "content": message.content
      }
      chatGPTHistory.push(historicalMessage);
    });
    chatGPTHistory.reverse();
    
    const tokenLimit = 1024; // 1024
    const nextMessage = {
      "role": "user",
      "content": textMessage
    }
    // chatGPTHistory.push(nextMessage);
    const requestData = {
      "model": "gpt-3.5-turbo",
      "messages": chatGPTHistory,
      "max_tokens": tokenLimit // 2048 is the max, 100 tokens = 75 words
    };
  
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    };
  
  axios.post("https://api.openai.com/v1/chat/completions", requestData, { headers })
  .then(res => {
    const response = res.data.choices[0];
    const responseMessage = {
      "role": response.message.role,
      "content": response.message.content
    }
    var split = splitter(responseMessage.content, DISCORD_LIMIT);
    for(var i = 0; i < split.length; i++) {
      sendMessage(channel, split[i]);
    }
  })
  .catch(error => {
        console.error(error);
        sendMessage(channel, "An error occured: " + error);
  });  
}

async function generateImage(msg, channel, prompt) {
  if(prompt.length == 0 || prompt == ' ') {
    sendMessage(channel, "There is no prompt.");
    return;
  }
  if(prompt.split(' ').length > 75) {
    sendMessage(channel, "Prompt using too many words. Please send a shorter one.");
    return;
  }
  // channel.startTyping();
  sendMessage(channel, "Generating image: " + prompt + ". Please wait a moment...");
  
  await msg.channel.sendTyping();
  axios.post("https://api.openai.com/v1/images/generations", {
    "model": "image-alpha-001",
    "prompt": prompt,
    "num_images": 1,
    "size": "256x256",
    "response_format": "url"
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    }
  })
  .then(response => {
    const imageUrl = response.data.data[0].url;
    if(imageUrl != '') {
      sendMessage(channel, imageUrl);
    } else {
      sendMessage(channel, "Failed to generate image: " + prompt);
    }
  })
  .catch(error => {
    sendMessage(channel, "Failed to generate image: " + prompt + "\n" + error);
  });
}

// Discord functions
async function handleIncomingDiscordMessage(msg) {
  if(msg.author.bot)
    return;
  
  const channelType = msg.channel.type;
  var input = msg.content;
  
  var guildId = msg.guild.id;
  var channelId = msg.channel.id;
  
  if(wasValidChannel(guildId, channelId)) {
    switch(channelType) {
      case DISCORD_MESSAGE_TYPE_DEFAULT:
        var name = input;
        if(input.length > 24) {
          name = input.substring(0, 21);
          name += "...";
        }
        await createThread(msg, name, 'A chat with GPT',  async (threadId) => {
          var channel = await getChannel(threadId);
          // Reply to the thread
          sendMessage(channel, "You asked:\n" + input);
          await msg.channel.sendTyping();
          processInput(msg, channel, input);
        });
        break;
      case DISCORD_MESSAGE_TYPE_THREAD:
        await msg.channel.sendTyping();
        processInput(msg, msg.channel, input);
        break;
    }
  }
}

async function processInput(msg, channel, input) {
  var content = input.toLowerCase(); // used for phrase checks
  if(content.startsWith("switch mode")) {
    switchMode(channel, content.split(" "));
  } else if(content.startsWith("generate image")) {
    const imagePrompt = input.slice('generate image'.length).trim();
    generateImage(msg, channel, imagePrompt);
  } else {
    const history = await getMessageHistory(channel, config.historyLimit);
    switch(config.mode) {
      case 0:
        await sendViaCleverbot(channel, history, input.trim());
        break;
      case 1:
        await sendViaChatGpt(channel, history, input.trim());
        break;
    }
  }
}

async function createThread(msg, name, reason, callback) {
  const thread = await msg.channel.threads.create({
    name: name,
    autoArchiveDuration: 60,
    reason: reason,
  });
  callback(thread.id);
}

async function sendMessage(channel, content) {
  channel.send({
    content: content
  })
}

function updatePresence(presence) {
  /*
  v13 	          v14 	                v14 value
  "COMPETING" 	ActivityType.Competing 	  5
  "CUSTOM" 	    ActivityType.Custom 	    4
  "LISTENING"   ActivityType.Listening 	  2
  "PLAYING" 	  ActivityType.Playing 	    0
  "STREAMING" 	ActivityType.Streaming 	  1
  "WATCHING" 	  ActivityType.Watching 	  3
  
  */
  client.user.setPresence({
    activities: [{ name: presence, type: ActivityType.Watching }],
    status: 'online' // dnd
  });
}

function getValidChannel(guildId, channelId) {
  var result = undefined;
  whitelist.forEach(element => {
    if(element.guild == guildId && element.channelId == channelId) {
      result = element;
      return true;
    }
  });
  return result;
}

function wasValidChannel(guildId, channelId) {
  return getValidChannel(guildId, channelId) != undefined;
}

async function getChannel(channelId) {
  var result = undefined;
  await client.channels.fetch(channelId).then(channel => {
    result = channel;
  });
  return result;
}

async function getMessageHistory(channel, limit) {
  var result = undefined;
  await channel.messages.fetch({ limit: limit }).then(messages => {
    result = messages;
  });
  return result;
}

// Misc functions
function getMode() {
  switch(config.mode) {
    case 0:
      return "Cleverbot";
    case 1:
      return "ChatGpt";
    default:
      return "Unknown";
  }
}

function splitter(str, l){
    var strs = [];
    while(str.length > l){
        var pos = str.substring(0, l).lastIndexOf(' ');
        pos = pos <= 0 ? l : pos;
        strs.push(str.substring(0, pos));
        var i = str.indexOf(' ', pos)+1;
        if(i < pos || i > pos+l)
            i = pos;
        str = str.substring(i);
    }
    strs.push(str);
    return strs;
}

////////////// DEFAULT AUTO GENERATED GLITCH JUNK
/**
* This is the main Node.js server script for your project
* Check out the two endpoints this back-end API provides in fastify.get and fastify.post below
*/

const path = require("path");

// Require the fastify framework and instantiate it
const fastify = require("fastify")({
  // Set this to true for detailed logging:
  logger: false
});

// ADD FAVORITES ARRAY VARIABLE FROM TODO HERE

// Setup our static files
fastify.register(require("fastify-static"), {
  root: path.join(__dirname, "public"),
  prefix: "/" // optional: default '/'
});

// fastify-formbody lets us parse incoming forms
fastify.register(require("fastify-formbody"));

// point-of-view is a templating manager for fastify
fastify.register(require("point-of-view"), {
  engine: {
    handlebars: require("handlebars")
  }
});

// Load and parse SEO data
const seo = require("./src/seo.json");
if (seo.url === "glitch-default") {
  seo.url = `https://${process.env.PROJECT_DOMAIN}.glitch.me`;
}

/**
* Our home page route
*
* Returns src/pages/index.hbs with data built into it
*/
fastify.get("/", function(request, reply) {
  console.log("Kept alive!");
});

/**
* Our POST route to handle and react to form submissions 
*
* Accepts body data indicating the user choice
*/
fastify.post("/", function(request, reply) {
  
  // Build the params object to pass to the template
  let params = { seo: seo };
  
  // If the user submitted a color through the form it'll be passed here in the request body
  let color = request.body.color;
  
  // If it's not empty, let's try to find the color
  if (color) {
    // ADD CODE FROM TODO HERE TO SAVE SUBMITTED FAVORITES
    
    // Load our color data file
    const colors = require("./src/colors.json");
    
    // Take our form submission, remove whitespace, and convert to lowercase
    color = color.toLowerCase().replace(/\s/g, "");
    
    // Now we see if that color is a key in our colors object
    if (colors[color]) {
      
      // Found one!
      params = {
        color: colors[color],
        colorError: null,
        seo: seo
      };
    } else {
      
      // No luck! Return the user value as the error property
      params = {
        colorError: request.body.color,
        seo: seo
      };
    }
  }
  
  // The Handlebars template will use the parameter values to update the page with the chosen color
  reply.view("/src/pages/index.hbs", params);
});

// Run the server and report out to the logs
fastify.listen(process.env.PORT, function(err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Your app is listening on ${address}`);
  fastify.log.info(`server listening on ${address}`);
});

const express = require("express");
const bodyParser = require("body-parser");
const TelegramApi = require("node-telegram-bot-api");
const words = require("./words.js");
const token = "8107670110:AAGnwpvqQiN9py9mab1aRvj8TFhBB8OHGpk";
const bot = new TelegramApi(token, {polling: true});
const app = express();

let currentWord = "";
let currentPlayerId = null;
let currentPlayerName = "";
let gameActive = false;
let isCanceled = false;
let gameTimeout = null;

// const url = "https://your-server.com/webhook";
// bot.setWebHook(url);

app.use(bodyParser.json());

app.post("/webhook", (req, res) => {
  const update = req.body;
  bot.processUpdate(update);
  res.sendStatus(200);
});

const checkAdminRights = async (chatId) => {
  try {
    const admins = await bot.getChatAdministrators(chatId);
    return admins.some((admin) => admin.user.username === "AeroGuessBot");
  } catch (err) {
    console.log(err);
    return false;
  }
};

const checkGroup = async (chatId) => {
  try {
    if (chatId < 0) {
      const isAdmin = await checkAdminRights(chatId);
      if (!isAdmin) {
        return {
          message: bot.sendMessage(
            chatId,
            "⚠️ Для начала игры боту нужно быть администратором группы."
          ),
          status: false,
        };
      }
      return { status: true };
    } else if (chatId > 0) {
      return {
        message: bot.sendMessage(
          chatId,
          "⚠️ Команда доступна только в группах."
        ),
        status: false,
      };
    }
  } catch (err) {
    console.log(err);
    return { status: false };
  }
};

bot.onText(/\/startgame/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = msg.from.first_name;
  isCanceled = false;

  const checkGroupAndRole = await checkGroup(chatId);
  if (checkGroupAndRole.status === false) {
    return checkGroupAndRole.message;
  }

  if (gameActive) {
    return bot.sendMessage(chatId, "🟡 Игра уже идёт!");
  }

  
  if (gameTimeout) {
    clearTimeout(gameTimeout);
  }

  currentPlayerId = userId;
  currentPlayerName = userName;
  currentWord = words[Math.floor(Math.random() * words.length)];
  gameActive = true;

  bot.sendMessage(
    chatId,
    `🎲 *Игра началась!*\n👤 *Объясняет:* ${currentPlayerName}`,
    {
      parse_mode: "Markdown",
    }
  );

  bot.sendMessage(chatId, "🔒 Нажми, чтобы увидеть слово!", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👀 Показать слово", callback_data: "show_word" }],
      ],
    },
  });
});

bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (userId !== currentPlayerId) {
    return bot.answerCallbackQuery(query.id, {
      text: "❌ Только ведущий может видеть слово!",
      show_alert: true,
    });
  }

  bot.answerCallbackQuery(query.id, {
    text: `🤫 Твоё слово: ${currentWord}\nОбъясни его, но не называй напрямую!`,
    show_alert: true,
  });
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.toLowerCase();
  const userId = msg.from.id;
  const userName = msg.from.first_name;

  if (!gameActive || !currentWord || userId === currentPlayerId) return;

  if (text === currentWord.toLowerCase()) {
    bot.sendMessage(
      chatId,
      `🎉 *${userName} угадал слово!* Это было: *${currentWord}*`,
      {
        parse_mode: "Markdown",
      }
    );
    currentPlayerId = userId;
    currentPlayerName = userName;
    currentWord = words[Math.floor(Math.random() * words.length)];

    bot.sendMessage(chatId, `🔄 Новый ведущий: *${currentPlayerName}*`, {
      parse_mode: "Markdown",
    });

    bot.sendMessage(chatId, "🔒 Нажми, чтобы увидеть слово!", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "👀 Показать слово", callback_data: "show_word" }],
        ],
      },
    });
  }
});

bot.onText("/cancelgame", async (msg) => {
  const chatId = msg.chat.id;

  const checkGroupAndRole = await checkGroup(chatId);
  if (checkGroupAndRole?.status === false) {
    return checkGroupAndRole.message;
  }

  currentWord = false;
  currentPlayerId = null;
  currentPlayerName = "";
  gameActive = false;
  isCanceled = true;
  return bot.sendMessage(chatId, "🔴 Игра завершена!");
});

bot.setMyCommands([
  { command: "/startgame", description: "Начать игру" },
  { command: "/cancelgame", description: "Завершить игру" },
]);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

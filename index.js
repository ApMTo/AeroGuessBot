const express = require("express");
require("dotenv").config();
const bodyParser = require("body-parser");
const TelegramApi = require("node-telegram-bot-api");
const words = require("./words.js");
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramApi(token, { polling: false });
const app = express();

let currentWord = "";
let currentPlayerId = null;
let currentPlayerName = "";
let gameActive = false;
let isCanceled = false;
let gameTimeout = null;
let timer = null;

app.use(bodyParser.json());

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

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (msg.text === "/start" && !gameActive) {
    return bot.sendMessage(
      chatId,
      `Привет! 👋 Добро пожаловать в игру AeroGuess! 🎲 Готов к весёлым приключениям? Начни игру с командой /startgame. Удачи! 🍀\n\n` +
        `### Инструкция по игре:\n` +
        `1. Добавь бота в свой Telegram-групповой чат.\n` +
        `2. Начни игру командой /startgame.\n` +
        `3. Один игрок получает секретное слово и должен объяснить его, не называя напрямую.\n` +
        `4. Остальные игроки должны угадать слово в чате.\n` +
        `5. Первый, кто угадает правильно, становится новым объясняющим.\n` +
        `6. Игра заканчивается, когда ты используешь команду /cancelgame.\n\n` +
        `Разработчик: @ApM_To 💻\n` +
        `Если возникнут вопросы, обращайтесь ко мне в Telegram!`
    );
  }
});

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

  timer = setTimeout(() => {
    bot.sendMessage(chatId, "⏰ Время вышло! Игра обнуляется.");
    resetGame(chatId);
  }, 300 * 1000);

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
        [{ text: "🔄 Сменить слово", callback_data: "change_word" }],
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

  if (query.data === "show_word") {
    bot.answerCallbackQuery(query.id, {
      text: `🤫 Твоё слово: ${currentWord}\nОбъясни его, но не называй напрямую!`,
      show_alert: true,
    });
  } else if (query.data === "change_word") {
    currentWord = words[Math.floor(Math.random() * words.length)];
    bot.answerCallbackQuery(query.id, {
      text: "✅ Слово изменено! Твоё новое слово: " + currentWord,
      show_alert: true,
    });
  }
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.toLowerCase();
  const userId = msg.from.id;
  const userName = msg.from.first_name;

  const replyText = msg.reply_to_message?.text?.toLowerCase();

  if (!gameActive || !currentWord) return;

  if (
    (text === currentWord.toLowerCase() ||
      replyText === currentWord.toLowerCase()) &&
    userId === currentPlayerId
  ) {
    resetGame(chatId);
    return bot.sendMessage(
      chatId,
      "🔴 В связи с тем, что ведущий озвучил загаданное слово, игра завершается!"
    );
  }

  if (
    text === currentWord.toLowerCase() ||
    replyText === currentWord.toLowerCase()
  ) {
    bot.sendMessage(
      chatId,
      `🎉 *${userName} угадал(а) слово!* Это было: *${currentWord}*`,
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
          [{ text: "🔄 Сменить слово", callback_data: "change_word" }],
        ],
      },
    });

    clearTimeout(timer);
    timer = setTimeout(() => {
      bot.sendMessage(chatId, "⏰ Время вышло! Игра обнуляется.");
      resetGame(chatId);
    }, 300 * 1000);
  }
});

bot.onText("/cancelgame", async (msg) => {
  const chatId = msg.chat.id;

  const checkGroupAndRole = await checkGroup(chatId);
  if (checkGroupAndRole?.status === false) {
    return checkGroupAndRole.message;
  }
  if (!gameActive || isCanceled) {
    return bot.sendMessage(chatId, "🔴 Игра не начата!");
  }

  resetGame(chatId);
  return bot.sendMessage(chatId, "🔴 Игра завершена!");
});

const resetGame = () => {
  currentWord = "";
  currentPlayerId = null;
  currentPlayerName = "";
  gameActive = false;
  isCanceled = true;
  clearTimeout(timer);
};

bot.setMyCommands([
  { command: "/startgame", description: "Начать игру" },
  { command: "/cancelgame", description: "Завершить игру" },
  { command: "/start", description: "Приветствие" },
]);

bot.setWebHook(`${process.env.SERVER_LINK}/webhook`);

app.post("/webhook", (req, res) => {
  const update = req.body;
  bot.processUpdate(update);
  res.sendStatus(200);
});
 
app.get("/ping", (req, res) => {
  res.send("Server is alive");
});

setInterval(() => {
  fetch(`${process.env.SERVER_LINK}/ping`)
    .then((res) => res.text())
    .then((data) => console.log(`Keep-alive: ${data}`))
    .catch((err) => console.error(`Keep-alive error: ${err}`));
}, 9 * 60 * 1000);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

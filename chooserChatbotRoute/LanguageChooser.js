class LanguageChooser {
    getBotIdByLang(API_URL, projectId, token, lang_iso, callback) {
        const tdclient = new TiledeskClient({ projectId: projectId, token: token, APIURL: API_URL, APIKEY: "___", log: true });
        tdclient.getAllBots((err, bots) => {
            console.log("bots:", bots);
            if (err) {
                callback(err, null);
                return;
            }
            let selected_bot = null;
            let pivot_bot = null;
            let first_bot = null;
            for (i = 0; i < bots.length; i++) {
                const bot = bots[i];
                if (bot.language && bot.name != "_tdLanguageChooser" && bot.description.indexOf("#langbot-ignore") < 0) {
                    console.log("bot.language:", bot.language);
                    console.log("bot.name:", bot.name);
                    console.log("lang_iso:", lang_iso);
                    if (bot.language === lang_iso) {
                        console.log("Bot found:", bot.name, bot._id);
                        selected_bot = bot;
                        break;
                    }
                    if (bot.description && bot.description.indexOf("#langbot-pivot") >= 0) {
                        console.log("bot pivot found:", bot);
                        pivot_bot = bot;
                    }
                    if (first_bot === null) {
                        first_bot = bot;
                    }
                }
                else {
                    console.log("Skipping:", bot.name);
                }
            }
            if (selected_bot) {
                console.log("Using language match bot, found:", selected_bot);
                callback(null, selected_bot);
            }
            else if (pivot_bot) {
                console.log("Using pivot language bot, found:", pivot_bot);
                callback(null, pivot_bot);
            }
            else {
                console.log("No match found, using first bot:", first_bot);
                callback(null, first_bot);
            }
            
        });
    }
}

module.exports = { LanguageChooser };
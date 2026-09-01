const { Filler } = require('../variables/Filler');
const winston = require('./winston');

/**
 * Rendering of dynamic JSON rich content (json_buttons / json_gallery) into
 * the concrete buttons / gallery structures sent to the channels.
 * Extracted from TiledeskChatbotUtil (Phase 6a). Behaviour unchanged.
 */

class ChatbotJSONContentUtil {


    static replaceJSONButtons(message, flow_attributes) {
        let all_buttons = [];
        if (message.attributes && message.attributes.commands) {
            let commands = message.attributes.commands;
            if (commands.length > 0) {
                for (let i = 0; i < commands.length; i++) {
                    let command = commands[i];
                    if (command.type === 'message' && command.message) {
                        if (command.message.attributes && command.message.attributes.attachment && command.message.attributes.attachment.json_buttons){
                            let json_buttons_string = command.message.attributes.attachment.json_buttons;
                            let final_buttons = this.renderJSONButtons(json_buttons_string, flow_attributes);
                            // let final_buttons = [];
                            // try {
                            //     // fill buttons
                            //     const filler = new Filler();
                            //     json_buttons_string = filler.fill(json_buttons_string, flow_attributes);
                            //     let json_buttons = JSON.parse(json_buttons_string);
                            //     if (Array.isArray(json_buttons)) {
                            //         json_buttons.forEach(button => {
                            //             if (button.value && button.type === "action" && button.action) {
                            //                 button.show_echo = true;
                            //                 final_buttons.push(button);
                            //             }
                            //             else if (button.value && button.type === "text") {
                            //                 button.show_echo = true;
                            //                 final_buttons.push(button);
                            //             }
                            //             else if (button.value && button.type === "url" && button.link) {
                            //                 button.show_echo = true;
                            //                 final_buttons.push(button);
                            //             }
                            //             else {
                            //                 winston.verbose("Invalid button. Skipping:", button);
                            //             }
                            //         });
                            //     }

                            //     // "buttons": [
                            //     //                 {
                            //     //                     "type": "action",
                            //     //                     "value": "Button1", // obbligatorio sempre
                            //     //                     "action": "#bb347206-d639-4926-94c9-e94930623dce", // mandatory
                            //     //                     "show_echo": true, // lo inserisco sempre
                            //     //                     "alias": "button1 alias"
                            //     //                 },
                            //     //                 {
                            //     //                     "type": "text",
                            //     //                     "value": "Button2 text", // obbligatorio sempre
                            //     //                     "show_echo": true // lo inserisco sempre
                            //     //                 },
                            //     //                 {
                            //     //                     "type": "url",
                            //     //                     "value": "Button3 link", // obbligatorio sempre
                            //     //                     "link": "http://", // obbligatorio
                            //     //                     "show_echo": true // lo inserisco sempre
                            //     //                 }
                            //     //             ]
                            // }
                            // catch(error) {
                            //     winston.warn("Invalid json_buttons:", error)
                            // }
                            if (final_buttons && final_buttons.length > 0) {
                                command.message.attributes.attachment.buttons = final_buttons;
                                delete command.message.attributes.attachment.json_buttons;
                            }
                            else {
                                winston.verbose("Invalid json_buttons. Skipping...")
                            }
                        }
                    }
                }
            }
        }
        return all_buttons;
    }


    static renderJSONButtons(json_buttons_string, flow_attributes) {
        let final_buttons = [];
        try {
            // fill buttons
            const filler = new Filler();
            json_buttons_string = filler.fill(json_buttons_string, flow_attributes);
            let json_buttons = JSON.parse(json_buttons_string);
            if (Array.isArray(json_buttons)) {
                json_buttons.forEach(button => {
                    if (button.value && button.type === "action" && button.action) {
                        button.show_echo = true;
                        final_buttons.push(button);
                    }
                    else if (button.value && button.type === "text") {
                        button.show_echo = true;
                        final_buttons.push(button);
                    }
                    else if (button.value && button.type === "url" && button.link) {
                        button.show_echo = true;
                        final_buttons.push(button);
                    }
                    else {
                        winston.verbose("Invalid button. Skipping:", button);
                    }
                });
            }

            // "buttons": [
            //                 {
            //                     "type": "action",
            //                     "value": "Button1", // obbligatorio sempre
            //                     "action": "#bb347206-d639-4926-94c9-e94930623dce", // mandatory
            //                     "show_echo": true, // lo inserisco sempre
            //                     "alias": "button1 alias"
            //                 },
            //                 {
            //                     "type": "text",
            //                     "value": "Button2 text", // obbligatorio sempre
            //                     "show_echo": true // lo inserisco sempre
            //                 },
            //                 {
            //                     "type": "url",
            //                     "value": "Button3 link", // obbligatorio sempre
            //                     "link": "http://", // obbligatorio
            //                     "show_echo": true // lo inserisco sempre
            //                 }
            //             ]
        }
        catch(error) {
            winston.warn("Invalid json_buttons:", error)
            return null;
        }
        return final_buttons;
    }


    static replaceJSONGalleries(message, flow_attributes) {
        if (message.attributes && message.attributes.commands) {
            let commands = message.attributes.commands;
            if (commands.length > 0) {
                for (let i = 0; i < commands.length; i++) {
                    let command = commands[i];
                    if (command.type === 'message' && command.message) {
                        if (command.message.attributes && command.message.attributes.attachment && command.message.attributes.attachment.json_gallery){
                            let final_gallery = [];
                            try {
                                // fill previews
                                const filler = new Filler();
                                let json_gallery_string = command.message.attributes.attachment.json_gallery;
                                json_gallery_string = filler.fill(json_gallery_string, flow_attributes);
                                let json_gallery = JSON.parse(json_gallery_string);
                                if (Array.isArray(json_gallery)) {
                                    json_gallery.forEach(el => {
                                        if (el.buttons) {
                                            el.buttons = ChatbotJSONContentUtil.renderJSONButtons(JSON.stringify(el.buttons));
                                        }
                                        final_gallery.push(el);
                                    });
                                }
                                else {
                                    winston.verbose("Invalid json_gallery.");
                                }
                                //  "gallery": [
                                //     {
                                //         "preview": {
                                //             "src": "https://eu.rtmv3.tiledesk.com/api/images?path=uploads%2Fusers%2F63a05d755f117f0013541383%2Fimages%2F8913ff2c-d788-45e1-ac71-ee5bae8479e2%2Fhybrid-settings.png",
                                //              "uid": "mcamfa6s"
                                //         },
                                //         "title": "Title 1",
                                //         "description": "Description 1",
                                //         "buttons": [
                                //             {
                                //                 "uid": "0a956f4637584ee4862360c19a161f8f",
                                //                 "type": "url",
                                //                 "value": "Prod1",
                                //                 "link": "https://URL1",
                                //                 "target": "blank",
                                //                 "action": "",
                                //                 "attributes": "",
                                //                 "show_echo": true
                                //             },
                                //             {
                                //                 "uid": "4a87abe3d03a4b6fbdbc3fc33c4a8430",
                                //                 "type": "action",
                                //                 "value": "Prod1.1 (connector)",
                                //                 "link": "",
                                //                 "target": "blank",
                                //                 "action": "#0f7aaefd-3147-466b-82a4-06756f36eea5",
                                //                 "attributes": "",
                                //                 "show_echo": true
                                //             },
                                //             {
                                //                 "uid": "31fac2c82ce24da0a2e9850a32165fe8",
                                //                 "type": "text",
                                //                 "value": "Prod1.2 (text)",
                                //                 "link": "https://url2",
                                //                 "target": "blank",
                                //                 "action": "",
                                //                 "attributes": "",
                                //                 "show_echo": true
                                //             }
                                //         ]
                                //     },

                                // "buttons": [
                                //                 {
                                //                     "type": "action",
                                //                     "value": "Button1", // obbligatorio sempre
                                //                     "action": "#bb347206-d639-4926-94c9-e94930623dce", // mandatory
                                //                     "show_echo": true, // lo inserisco sempre
                                //                     "alias": "button1 alias"
                                //                 },
                                //                 {
                                //                     "type": "text",
                                //                     "value": "Button2 text", // obbligatorio sempre
                                //                     "show_echo": true // lo inserisco sempre
                                //                 },
                                //                 {
                                //                     "type": "url",
                                //                     "value": "Button3 link", // obbligatorio sempre
                                //                     "link": "http://", // obbligatorio
                                //                     "show_echo": true // lo inserisco sempre
                                //                 }
                                //             ]
                            }
                            catch(error) {
                                winston.warn("Error on JSON gallery parsing:", error);
                            }
                            if (final_gallery && final_gallery.length > 0) {
                                command.message.attributes.attachment.gallery = final_gallery;
                                delete command.message.attributes.attachment.json_gallery;
                            }
                            else {
                                winston.verbose("Invalid JSON Gallery.")
                            }
                        }
                    }
                }
            }
        }
        return message;
    }

}

module.exports = { ChatbotJSONContentUtil };
